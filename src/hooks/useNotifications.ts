/**
 * IMPORTANT: Follow all guidelines in AGENTS.md before making changes.
 * Run tests, typecheck, and deploy after every change.
 */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "preact/hooks";
import { GitHubAPI, DEFAULT_NOTIFICATIONS_PER_PAGE } from "../api";
import { STORAGE_KEYS } from "../config";
import { stateCache } from "../utils/stateCache";
import { teamCache } from "../utils/teamCache";
import { teamsCache } from "../utils/teamsCache";
import { getSubjectUrl } from "../utils/url";
import type {
  GitHubUser,
  GitHubNotification,
  NotificationGroup,
  GitHubTeam,
} from "../types";

export function useNotifications(token: string | null) {
  const [notifications, setNotifications] = useState<NotificationGroup[]>([]);
  const [user, setUser] = useState<GitHubUser | null>(() => {
    // Try to load user from localStorage first
    const saved = localStorage.getItem(STORAGE_KEYS.USER);
    return saved ? JSON.parse(saved) : null;
  });
  const [userTeams, setUserTeams] = useState<GitHubTeam[]>([]);
  const [loading, setLoading] = useState(true); // Start with loading true
  const [initialLoad, setInitialLoad] = useState(true);
  const [isFirstSessionLoad, setIsFirstSessionLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DISMISSED);
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved);

      // Migration: Check if we have old numeric notification IDs
      // New group IDs contain '#' (e.g., "repo/name#https://api.github.com/...")
      const hasOldIds = parsed.some(
        (id: any) => typeof id === "string" && /^\d+$/.test(id)
      );

      if (hasOldIds) {
        // Clear old dismissed IDs since we can't reliably convert them to group IDs
        // The user will need to dismiss notifications again, but they'll stay dismissed properly
        console.log("Migrating dismissed notifications to new format");
        localStorage.removeItem(STORAGE_KEYS.DISMISSED);
        return [];
      }

      // Remove any duplicates and return as array
      const uniqueDismissed = Array.from(new Set<string>(parsed));

      // If we had duplicates, update localStorage
      if (uniqueDismissed.length < parsed.length) {
        console.log(
          `Removed ${
            parsed.length - uniqueDismissed.length
          } duplicate dismissed notifications`
        );
        localStorage.setItem(
          STORAGE_KEYS.DISMISSED,
          JSON.stringify(uniqueDismissed)
        );
      }

      console.log(
        `[Init] Loaded ${uniqueDismissed.length} dismissed notifications from localStorage:`,
        uniqueDismissed
      );

      return uniqueDismissed;
    } catch (e) {
      console.error("Failed to parse dismissed notifications:", e);
      return [];
    }
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const api = useMemo(() => (token ? new GitHubAPI(token) : null), [token]);

  const processNotifications = useCallback(
    async (
      rawNotifications: GitHubNotification[],
      teams: GitHubTeam[] | undefined,
      userData: GitHubUser | undefined
    ) => {
      // Use passed user or fall back to state
      const effectiveUser = userData ?? user;

      if (!api || !effectiveUser) return [];

      // Use passed teams or fall back to state
      const effectiveTeams = teams ?? userTeams;

      // Group notifications by repository and subject
      const groups: Record<string, NotificationGroup> = {};

      // Collect URLs that need state checking
      const urlsToCheck: Set<string> = new Set();

      // First pass: identify which URLs need checking
      for (const notification of rawNotifications) {
        if (
          notification.subject.type === "Issue" ||
          notification.subject.type === "PullRequest"
        ) {
          const cached = stateCache.get(notification.subject.url);
          if (!cached) {
            urlsToCheck.add(notification.subject.url);
          }
        }
      }

      // Batch fetch states for URLs not in cache
      const urlArray = Array.from(urlsToCheck);
      const fetchPromises: Promise<void>[] = [];

      // Fetch all URLs in parallel
      for (let i = 0; i < urlArray.length; i++) {
        const url = urlArray[i];
        const fetchPromise = api
          .getSubjectDetails(url)
          .then((details) => {
            if (details && details.state) {
              stateCache.set(url, details.state);
            } else if (details) {
              // API returned data but without a state field — assume open
              stateCache.set(url, "open");
            }
          })
          .catch((err) => {
            console.error("Failed to fetch state for:", url, err);
            // If it's a 404, the issue/PR was deleted - cache as "deleted" to hide it
            if (
              err.message &&
              (err.message.includes("404") || err.message.includes("Not Found"))
            ) {
              stateCache.set(url, "deleted");
            } else {
              // Cache as "unknown" to avoid repeated failed fetches
              stateCache.set(url, "unknown");
            }
          });
        fetchPromises.push(fetchPromise);
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

      // Second pass: process notifications, filtering out closed/merged
      for (const notification of rawNotifications) {
        const key = `${notification.repository.full_name}#${notification.subject.url}`;

        // Check if closed/merged/deleted (from cache or fresh fetch)
        if (
          notification.subject.type === "Issue" ||
          notification.subject.type === "PullRequest"
        ) {
          if (stateCache.isClosedOrMerged(notification.subject.url)) {
            continue; // Skip closed/merged/deleted items
          }
        }

        if (!groups[key]) {
          groups[key] = {
            id: key,
            repository: notification.repository,
            subject: notification.subject,
            notifications: [],
            isOwnContent: false,
            isProminentForMe: false,
            hasReviewRequest: false,
            hasMention: false,
            hasReply: false,
            hasTeamMention: false,
            isTeamReviewRequest: false,
          };
        }

        groups[key].notifications.push(notification);

        // Check if this is user's own content
        if (
          notification.subject.type === "PullRequest" ||
          notification.subject.type === "Issue"
        ) {
          // Use notification reason to determine prominence first
          // This avoids unnecessary API calls

          // Check for review requests
          // Note: GitHub API doesn't distinguish between personal and team review requests
          // For now, we'll treat all review requests as prominent
          // You can manually move team review requests to "Other" by dismissing and re-subscribing
          if (notification.reason === "review_requested") {
            groups[key].hasReviewRequest = true;
            groups[key].isProminentForMe = true;
          }

          // Check for mentions
          // Note: GitHub sends "mention" even if you were mentioned in an old comment
          // and someone else comments. Without fetching comment details, we can't
          // distinguish real new mentions from old mention notifications.
          if (notification.reason === "mention") {
            groups[key].hasMention = true;
            // For now, treat as prominent but with lower confidence
            groups[key].isProminentForMe = true;
          }

          // Comments might be replies to you, but often aren't
          // Only mark as prominent if we have other signals
          if (notification.reason === "comment") {
            // Don't automatically assume comments are mentions/replies
            // This reduces false positives
          }

          // Team mentions are lower priority
          if (notification.reason === "team_mention") {
            groups[key].hasTeamMention = true;
            // Don't mark as prominent - let it go to "Other Notifications"
          }

          // Check if user is the author
          if (notification.reason === "author") {
            groups[key].isOwnContent = true;
            groups[key].isProminentForMe = true;
          }

          // Check for assignments - issues/PRs assigned to you are important
          if (notification.reason === "assign") {
            groups[key].isProminentForMe = true;
          }
        }
      }

      // Third pass: Check for team review requests and identify which team
      // Collect notifications that need review checks (team or draft status)
      const reviewRequestsToCheck: Array<{
        group: NotificationGroup;
        notification: GitHubNotification;
      }> = [];

      const userTeamSlugs = effectiveTeams.map((team) => team.slug);

      for (const group of Object.values(groups)) {
        if (group.hasReviewRequest && group.subject.type === "PullRequest") {
          // Check cache first
          const cached = teamCache.get(group.notifications[0].id);
          const debugMode =
            localStorage.getItem("debug_team_reviews") === "true";
          if (debugMode) {
            console.log(
              `Cache check for ${group.subject.title}: ${
                cached ? "found" : "not found"
              }`
            );
          }
          if (cached && cached.isDraft !== undefined) {
            if (debugMode) {
              console.log(`  Using cached data:`, cached);
            }
            group.isTeamReviewRequest = cached.isTeamReviewRequest;
            group.isDraftPR = cached.isDraft;
            if (cached.isTeamReviewRequest) {
              // It's a team review, not prominent for the individual
              group.isProminentForMe = false;
              // Check if we have team info in cache
              // Always set team info for team review requests
              if (cached.teamSlug) {
                group.teamSlug = cached.teamSlug;
                group.teamName = cached.teamName;
              } else {
                // Use generic team section if no specific team is cached
                group.teamSlug = "_team_review_requests";
                group.teamName = "Team Review Requests";
              }
            }
          } else {
            // Need to check via API for team status AND draft status
            if (debugMode) {
              console.log(`  Will check via API: ${group.subject.title}`);
            }
            reviewRequestsToCheck.push({
              group,
              notification: group.notifications[0],
            });
          }
        }

        // Also process team mentions - for now just mark them with a generic team section
        if (group.hasTeamMention) {
          // Team mentions don't tell us which team, so use a generic section
          group.teamSlug = "_team_mentions";
          group.teamName = "Team Mentions";
          group.isProminentForMe = false;
        }
      }

      // Batch check team reviews (limit to 10 to avoid too many API calls)
      const teamCheckPromises: Promise<void>[] = [];
      for (let i = 0; i < reviewRequestsToCheck.length && i < 10; i++) {
        const { group, notification } = reviewRequestsToCheck[i];
        const checkPromise = api
          .checkTeamReviewRequest(
            notification.subject.url,
            effectiveUser.login,
            notification.reason
          )
          .then(async (result) => {
            group.isTeamReviewRequest = result.isTeamRequest;
            group.isDraftPR = result.isDraft;

            if (result.isTeamRequest) {
              group.isTeamReviewRequest = true;
              // It's a team review, not prominent for the individual
              group.isProminentForMe = false;

              if (userTeamSlugs.length > 0) {
                // Check which team was requested
                const teamInfo = await api.getRequestedTeamForPR(
                  notification.subject.url,
                  userTeamSlugs
                );
                if (teamInfo) {
                  group.teamSlug = teamInfo.slug;
                  group.teamName = teamInfo.name;
                  teamCache.set(
                    notification.id,
                    true,
                    teamInfo.slug,
                    teamInfo.name,
                    result.isDraft
                  );
                } else {
                  // Couldn't determine specific team, use generic team section
                  console.log(
                    `Could not find team for PR: ${
                      notification.subject.url
                    }, user teams (${
                      userTeamSlugs.length
                    }): ${userTeamSlugs.join(", ")}`
                  );
                  group.teamSlug = "_team_review_requests";
                  group.teamName = "Team Review Requests";
                  teamCache.set(
                    notification.id,
                    true,
                    "_team_review_requests",
                    "Team Review Requests",
                    result.isDraft
                  );
                }
              } else {
                // No teams loaded, use generic section
                console.log(
                  `No user teams loaded yet for PR: ${notification.subject.url}`
                );
                group.teamSlug = "_team_review_requests";
                group.teamName = "Team Review Requests";
                teamCache.set(
                  notification.id,
                  true,
                  "_team_review_requests",
                  "Team Review Requests",
                  result.isDraft
                );
              }
            } else {
              teamCache.set(
                notification.id,
                false,
                undefined,
                undefined,
                result.isDraft
              );
            }
          })
          .catch(() => {
            console.error(
              "Failed to check team review for:",
              notification.subject.url
            );
            // Assume it's personal on error to avoid hiding important notifications
            group.isTeamReviewRequest = false;
          });
        teamCheckPromises.push(checkPromise);
      }

      await Promise.all(teamCheckPromises);

      // Convert to array and filter out draft PRs
      const groupedArray = Object.values(groups).filter(
        (group) => !group.isDraftPR
      );

      // Sort: own content first, then prominent, then others
      groupedArray.sort((a, b) => {
        if (a.isOwnContent && !b.isOwnContent) return -1;
        if (!a.isOwnContent && b.isOwnContent) return 1;
        if (a.isProminentForMe && !b.isProminentForMe) return -1;
        if (!a.isProminentForMe && b.isProminentForMe) return 1;
        // Sort by most recent notification
        const aTime = new Date(a.notifications[0].updated_at).getTime();
        const bTime = new Date(b.notifications[0].updated_at).getTime();
        return bTime - aTime;
      });

      // Log group IDs for debugging
      if (groupedArray.length > 0) {
        const debugGroupInfo = groupedArray.slice(0, 5).map((g) => ({
          id: g.id,
          title: g.subject.title,
          repo: g.repository.full_name,
        }));
        console.log(
          `[ProcessNotifications] Generated ${groupedArray.length} groups (showing first 5):`,
          debugGroupInfo
        );
      }

      return groupedArray;
    },
    [api, user]
  );

  const showSessionExpiredNotification = useCallback(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const notification = new Notification("Session Expired", {
      body: "Your GitHub session has expired. Please sign in again.",
      icon: "https://github.githubassets.com/favicons/favicon.png",
      tag: "session-expired",
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, []);

  const fetchNotifications = useCallback(
    async (options: {
      page: number;
      append: boolean;
      isManualLoad: boolean;
      teams: GitHubTeam[] | undefined;
      userData: GitHubUser | undefined;
    }) => {
      const { page, append, isManualLoad, teams, userData } = options;
      if (!api) return;

      // Don't show loading spinner on subsequent fetches unless it's the initial load
      if (initialLoad && page === 1) {
        setLoading(true);
      } else if (append) {
        setLoadingMore(true);
      }

      // Clear error on retry
      if (error) {
        setError(null);
      }

      try {
        // Fetch notifications for the specified page from the last week
        // Include both read and unread so PRs where you're a reviewer stay visible
        const pageNotifications = await api.getNotifications({ page, all: true });

        // Check if there are more pages
        setHasMore(pageNotifications.length === DEFAULT_NOTIFICATIONS_PER_PAGE);

        // Update current page
        setCurrentPage(page);

        const allNotifications =
          append && page > 1
            ? [
                ...notifications.flatMap((g) => g.notifications),
                ...pageNotifications,
              ]
            : pageNotifications;

        // Define allowed notification reasons
        // NOTE: GitHub API doesn't support filtering by reason at the API level,
        // so we must filter client-side. The API only supports:
        // - all (true/false) - include read notifications
        // - participating (true/false) - only direct participation
        // - since (timestamp) - notifications since date
        // - before (timestamp) - notifications before date
        const allowedReasons: Set<string> = new Set([
          "comment", // New comments (may or may not be replies to you)
          "mention", // Mentions (may be from old mentions in the thread)
          "review_requested", // Review requests
          "ci_activity", // CI activity
          "subscribed", // Subscribed
          "assign", // Assignments
          "team_mention", // Team mentions
          "author", // Your own content
        ]);

        // Filter notifications: only allowed reasons
        // We're already using participating=true at API level to reduce initial results
        const filtered = allNotifications.filter((n) =>
          allowedReasons.has(n.reason)
        );

        // NOTE: We don't filter out comment notifications on authored PRs because:
        // 1. GitHub API doesn't tell us WHO made the comment
        // 2. Fetching each comment to check authorship would require many additional API calls
        // 3. Better to show all comments (including potentially our own) than miss others' comments
        // 4. Users can dismiss their own comment notifications manually if needed

        // Process and group notifications
        const processed = await processNotifications(filtered, teams, userData);

        console.log(
          `[FetchNotifications] Processed ${processed.length} groups, dismissed list has ${dismissed.length} items`
        );

        // Filter out groups where ALL notifications are dismissed
        // Groups with at least one non-dismissed notification will still appear
        const nonDismissedGroups = processed.filter((group) => {
          const allDismissed = group.notifications.every((notif) =>
            dismissed.includes(notif.id)
          );
          if (allDismissed) {
            console.log(
              `Filtering out dismissed notification: ${group.subject.title} (${group.id})`
            );
          }
          return !allDismissed;
        });

        console.log(
          `[FetchNotifications] After filtering dismissed: ${nonDismissedGroups.length} groups remain`
        );

        if (append && page > 1) {
          // Merge with existing notifications, avoiding duplicates
          const existingIds = new Set(notifications.map((g) => g.id));
          const newGroups = nonDismissedGroups.filter(
            (g) => !existingIds.has(g.id)
          );
          setNotifications([...notifications, ...newGroups]);
        } else {
          setNotifications(nonDismissedGroups);
        }

        // Check for new prominent notifications
        // Skip web notifications on initial page load and manual loads (Load More)
        const skipNotifications = isFirstSessionLoad || isManualLoad;
        checkForNewProminentNotifications(
          nonDismissedGroups,
          skipNotifications
        );

        // Mark initial load as complete
        if (initialLoad) {
          setInitialLoad(false);
        }

        // Mark first session load as complete after first fetch
        if (isFirstSessionLoad) {
          setIsFirstSessionLoad(false);
          // Mark all current notifications as "seen" in sessionStorage
          // so they won't trigger web notifications on the first auto-refresh
          for (const group of processed) {
            if (group.isProminentForMe) {
              const key = `notified_${group.id}`;
              sessionStorage.setItem(key, "true");
            }
          }
        }
      } catch (err: any) {
        if (err.message === "UNAUTHORIZED") {
          setError("Authentication expired. Please login again.");
          showSessionExpiredNotification();
          // Don't reload immediately, let user see the error
          setTimeout(() => {
            localStorage.removeItem(STORAGE_KEYS.TOKEN);
            localStorage.removeItem(STORAGE_KEYS.USER);
            window.location.reload();
          }, 2000);
        } else {
          setError(err.message || "Failed to fetch notifications");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      api,
      dismissed,
      processNotifications,
      initialLoad,
      error,
      notifications,
      isFirstSessionLoad,
      showSessionExpiredNotification,
    ]
  );

  const checkForNewProminentNotifications = useCallback(
    (
      groups: NotificationGroup[],
      skipNotifications: boolean = false,
      newNotificationIds?: Set<string>
    ) => {
      if (
        !("Notification" in window) ||
        Notification.permission !== "granted" ||
        skipNotifications
      ) {
        return;
      }

      // Only send web notifications for mentions and direct review requests
      // Team reviews are filtered out because they have isProminentForMe = false
      const prominentGroups = groups.filter((g) => g.isProminentForMe);

      for (const group of prominentGroups) {
        // Check if ANY notification in the group is new
        let hasNewNotification = false;
        const newNotifsInGroup: string[] = [];

        if (newNotificationIds) {
          for (const notification of group.notifications) {
            if (newNotificationIds.has(notification.id)) {
              hasNewNotification = true;
              // Check if we haven't notified about this specific notification ID yet
              const notifKey = `notified_${notification.id}`;
              if (!sessionStorage.getItem(notifKey)) {
                newNotifsInGroup.push(notification.id);
              }
            }
          }
        } else {
          // If no newNotificationIds provided (initial load), always true
          hasNewNotification = true;
        }

        // Only send notification if there are actually new notifications we haven't alerted about
        if (
          newNotifsInGroup.length > 0 ||
          (!newNotificationIds && hasNewNotification)
        ) {
          // Mark these specific notification IDs as notified
          newNotifsInGroup.forEach((notifId) => {
            sessionStorage.setItem(`notified_${notifId}`, "true");
          });

          console.log(
            `[WebNotification] Triggering notification for: ${group.subject.title} (${group.id})`
          );
          console.log(
            `  Type: ${group.subject.type}, Prominent: ${group.isProminentForMe}`
          );
          console.log(
            `  New notification IDs in group:`,
            group.notifications
              .filter((n) => newNotificationIds?.has(n.id))
              .map((n) => n.id)
          );

          let title = `${group.subject.title}`;
          let body = `${group.repository.full_name}`;

          if (group.isOwnContent) {
            title = `[Your ${group.subject.type}] ${title}`;
          } else if (group.hasReviewRequest) {
            title = `[Review Request] ${title}`;
          } else if (group.hasMention) {
            title = `[Mention] ${title}`;
          }

          const notification = new Notification(title, {
            body: body,
            icon: "https://github.githubassets.com/favicons/favicon.png",
            tag: group.id,
            requireInteraction: true,
          });

          // Add click handler to open the GitHub URL
          notification.onclick = () => {
            const url = getSubjectUrl(group.subject);
            if (url && url !== "#") {
              window.open(url, "_blank");
            }
            notification.close();
          };
        }
      }
    },
    []
  );

  const dismissNotification = useCallback(
    (groupId: string) => {
      const group = notifications.find((g) => g.id === groupId);
      if (group) {
        console.log(
          `[Dismiss] Starting dismiss for: ${group.subject.title} (${groupId})`
        );
        console.log(
          `[Dismiss] Current dismissed list has ${dismissed.length} items`
        );

        // Store individual notification IDs, not the group ID
        // This allows future notifications for the same PR/issue to still appear
        const dismissedSet = new Set(dismissed);
        group.notifications.forEach((notif) => {
          dismissedSet.add(notif.id);
        });
        const newDismissed = Array.from(dismissedSet);

        console.log(
          `[Dismiss] New dismissed list will have ${newDismissed.length} items`
        );

        setDismissed(newDismissed);
        localStorage.setItem(
          STORAGE_KEYS.DISMISSED,
          JSON.stringify(newDismissed)
        );

        // Verify localStorage was updated
        const savedValue = localStorage.getItem(STORAGE_KEYS.DISMISSED);
        console.log(`[Dismiss] Verified localStorage save:`, savedValue);

        // Remove from current notifications
        setNotifications(notifications.filter((g) => g.id !== groupId));

        console.log(
          `Dismissed notification: ${group.subject.title} (${groupId})`
        );
        console.log(`Updated dismissed list:`, newDismissed);
        console.log(
          `Dismissed list saved to localStorage with ${newDismissed.length} items`
        );
      } else {
        console.error(
          `[Dismiss] Could not find notification to dismiss: ${groupId}`
        );
      }
    },
    [notifications, dismissed]
  );

  // Initial setup - only run when token changes
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const initializeData = async () => {
      if (!mounted || !api) return;

      try {
        // Fetch user if not already loaded
        let loadedUser = user;
        if (!user) {
          const userData = await api.getUser();
          loadedUser = userData;
          if (mounted) {
            setUser(userData);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
          }
        }

        // Fetch user teams
        let loadedTeams: GitHubTeam[] | undefined;
        const cachedTeams = teamsCache.get();
        if (cachedTeams) {
          loadedTeams = cachedTeams;
          if (mounted) {
            setUserTeams(cachedTeams);
          }
        } else {
          try {
            const teams = await api.getUserTeams();
            loadedTeams = teams;
            if (mounted) {
              setUserTeams(teams);
              teamsCache.set(teams);
            }
          } catch (err) {
            console.error("Failed to fetch user teams:", err);
          }
        }

        // Now fetch notifications with teams and user
        if (mounted && loadedUser) {
          await fetchNotifications({
            page: 1,
            append: false,
            isManualLoad: false,
            teams: loadedTeams,
            userData: loadedUser,
          });
        }
      } catch (err: any) {
        console.error("Initialization error:", err);
        if (mounted) {
          setError(err.message || "Failed to initialize");
          setLoading(false);
        }
      }
    };

    initializeData();

    // Set up polling for new notifications
    let refreshInterval: NodeJS.Timeout;

    // Delay setting up the interval to avoid circular dependency
    setTimeout(() => {
      refreshInterval = setInterval(() => {
        if (mounted && currentPage > 0 && refreshAllPagesRef.current) {
          refreshAllPagesRef.current();
        }
      }, 60000); // Every minute
    }, 0);

    return () => {
      mounted = false;
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [token, api]); // Depend on token and api

  // Request notification permissions
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!loadingMore && hasMore && currentPage < 10) {
      // Limit to 10 pages max (500 notifications)
      // Pass isManualLoad = true to prevent web notifications
      await fetchNotifications({
        page: currentPage + 1,
        append: true,
        isManualLoad: true,
        teams: userTeams,
        userData: user ?? undefined,
      });
    }
  }, [currentPage, hasMore, loadingMore, fetchNotifications]);

  // Use a ref to ensure the interval always calls the latest refreshAllPages
  const refreshAllPagesRef = useRef<() => Promise<void>>();

  // Refresh all currently loaded pages
  const refreshAllPages = useCallback(async () => {
    if (!api || currentPage === 0) return;

    // Don't show loading spinner for refresh
    setError(null);

    // Store current notification IDs to identify new ones
    const existingNotificationIds = new Set(
      notifications.flatMap((group) => group.notifications.map((n) => n.id))
    );

    // Load previously notified IDs, but ONLY add them to existingNotificationIds
    // if we have proof we actually sent a browser notification (the notified_${id} marker)
    // This prevents false positives where an ID was "seen" but never notified
    const previouslyNotifiedKey = "previously_notified_ids";
    const previouslyNotified = JSON.parse(
      sessionStorage.getItem(previouslyNotifiedKey) || "[]"
    );
    // Only exclude IDs we've actually notified about
    previouslyNotified.forEach((id: string) => {
      if (sessionStorage.getItem(`notified_${id}`)) {
        existingNotificationIds.add(id);
      }
    });

    try {
      // Fetch all pages up to current page from the last week
      // Include both read and unread so PRs where you're a reviewer stay visible
      const allPromises: Promise<GitHubNotification[]>[] = [];
      for (let p = 1; p <= currentPage; p++) {
        allPromises.push(api.getNotifications({ page: p, all: true }));
      }

      const allResults = await Promise.all(allPromises);
      const allNotifications = allResults.flat();

      // Check if there are more pages based on the last page
      setHasMore(allResults[allResults.length - 1].length === 50);

      // Process all notifications at once
      const processed = await processNotifications(
        allNotifications,
        userTeams,
        user ?? undefined
      );

      // Filter out groups where ALL notifications are dismissed
      const nonDismissedGroups = processed.filter((group) => {
        const allDismissed = group.notifications.every((notif) =>
          dismissed.includes(notif.id)
        );
        if (allDismissed) {
          console.log(
            `[Refresh] Filtering out dismissed notification: ${group.subject.title} (${group.id})`
          );
        }
        return !allDismissed;
      });

      setNotifications(nonDismissedGroups);

      // Identify which notifications are truly new (not present before refresh)
      const newNotificationIds = new Set<string>();
      for (const group of nonDismissedGroups) {
        for (const notification of group.notifications) {
          if (!existingNotificationIds.has(notification.id)) {
            newNotificationIds.add(notification.id);
          }
        }
      }

      // Log if we find any closed/merged items that would have triggered notifications
      const allProcessedGroups = await processNotifications(
        allNotifications,
        userTeams,
        user ?? undefined
      );
      for (const group of allProcessedGroups) {
        if (group.isProminentForMe) {
          // Check if this was filtered out for being closed/merged
          const isInDisplayed = nonDismissedGroups.some(
            (g) => g.id === group.id
          );
          if (!isInDisplayed) {
            console.log(
              `[Refresh] Filtered prominent notification (likely closed/merged): ${group.subject.title}`
            );
          }
        }
      }

      // Check for new prominent notifications, passing the set of new IDs
      checkForNewProminentNotifications(
        nonDismissedGroups,
        false,
        newNotificationIds
      );

      // Save notification IDs we've ACTUALLY NOTIFIED about to prevent re-notifying
      // IMPORTANT: Only save IDs for notifications we sent browser notifications for
      // NOT all notification IDs we've seen (which could include filtered-out notifications)
      const notifiedIds: string[] = [];
      for (const notification of allNotifications) {
        // Check if we have the "notified_${id}" marker in sessionStorage
        if (sessionStorage.getItem(`notified_${notification.id}`)) {
          notifiedIds.push(notification.id);
        }
      }
      // Combine with existing previously notified IDs
      const allNotifiedIds = Array.from(
        new Set([...previouslyNotified, ...notifiedIds])
      );
      // Keep only the last 1000 IDs to prevent unbounded growth
      const recentIds = allNotifiedIds.slice(-1000);
      sessionStorage.setItem(previouslyNotifiedKey, JSON.stringify(recentIds));
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") {
        setError("Authentication expired. Please login again.");
        showSessionExpiredNotification();
        setTimeout(() => {
          localStorage.removeItem(STORAGE_KEYS.TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
          window.location.reload();
        }, 2000);
      } else {
        console.error("Failed to refresh notifications:", err);
      }
    }
  }, [
    api,
    currentPage,
    processNotifications,
    checkForNewProminentNotifications,
    dismissed,
    notifications,
    user,
    userTeams,
    showSessionExpiredNotification,
  ]);

  // Update the ref whenever refreshAllPages changes
  useEffect(() => {
    refreshAllPagesRef.current = refreshAllPages;
  }, [refreshAllPages]);

  return {
    notifications,
    user,
    userTeams,
    loading,
    error,
    initialLoad,
    fetchNotifications,
    refreshAllPages,
    dismissNotification,
    loadMore,
    hasMore,
    loadingMore,
  };
}
