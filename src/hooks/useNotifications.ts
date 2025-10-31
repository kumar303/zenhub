import { useState, useEffect, useCallback } from "preact/hooks";
import { GitHubAPI } from "../api";
import { STORAGE_KEYS } from "../config";
import { stateCache } from "../utils/stateCache";
import { teamCache } from "../utils/teamCache";
import { teamsCache } from "../utils/teamsCache";
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
    return saved ? JSON.parse(saved) : [];
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const api = token ? new GitHubAPI(token) : null;

  const fetchUser = useCallback(async () => {
    if (!api) return;

    try {
      const userData = await api.getUser();
      setUser(userData);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
    } catch (err: any) {
      console.error("Failed to fetch user:", err);
      // If user fetch fails due to auth, don't crash the app
      if (err.message === "UNAUTHORIZED") {
        setError("Authentication expired. Please login again.");
        // Don't reload immediately, let user see the error
        setTimeout(() => {
          localStorage.removeItem(STORAGE_KEYS.TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
          window.location.reload();
        }, 2000);
      }
    }
  }, [api]);

  const fetchUserTeams = useCallback(async () => {
    if (!api) return;

    // Check cache first
    const cachedTeams = teamsCache.get();
    if (cachedTeams) {
      setUserTeams(cachedTeams);
      return;
    }

    try {
      const teams = await api.getUserTeams();
      setUserTeams(teams);
      teamsCache.set(teams);
    } catch (err: any) {
      console.error("Failed to fetch user teams:", err);
      // Don't crash if teams can't be fetched, just continue without team info
    }
  }, [api]);

  const processNotifications = useCallback(
    async (rawNotifications: GitHubNotification[]) => {
      if (!api || !user) return [];

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

      // Batch fetch states for URLs not in cache (limit to 20 at a time to avoid rate limits)
      const urlArray = Array.from(urlsToCheck);
      const fetchPromises: Promise<void>[] = [];

      // Process in parallel but limit concurrency
      for (let i = 0; i < urlArray.length && i < 20; i++) {
        const url = urlArray[i];
        const fetchPromise = api
          .getSubjectDetails(url)
          .then((details) => {
            if (details && details.state) {
              stateCache.set(url, details.state);
            }
          })
          .catch(() => {
            console.error("Failed to fetch state for:", url);
            // Cache as "unknown" to avoid repeated failed fetches
            stateCache.set(url, "unknown");
          });
        fetchPromises.push(fetchPromise);
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

      // Second pass: process notifications, filtering out closed/merged
      for (const notification of rawNotifications) {
        const key = `${notification.repository.full_name}#${notification.subject.url}`;

        // Check if closed/merged (from cache or fresh fetch)
        if (
          notification.subject.type === "Issue" ||
          notification.subject.type === "PullRequest"
        ) {
          if (stateCache.isClosedOrMerged(notification.subject.url)) {
            continue; // Skip closed/merged items
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
            // Don't mark as prominent if it's just because we authored it
            // This helps filter out our own activity
          }
        }
      }

      // Third pass: Check for team review requests and identify which team
      // Collect notifications that need team review checks
      const reviewRequestsToCheck: Array<{
        group: NotificationGroup;
        notification: GitHubNotification;
      }> = [];

      const userTeamSlugs = userTeams.map((team) => team.slug);

      for (const group of Object.values(groups)) {
        if (group.hasReviewRequest && group.subject.type === "PullRequest") {
          // Check cache first
          const cached = teamCache.get(group.notifications[0].id);
          if (cached) {
            group.isTeamReviewRequest = cached.isTeamReviewRequest;
            if (cached.isTeamReviewRequest) {
              // It's a team review, not prominent for the individual
              group.isProminentForMe = false;
              // Check if we have team info in cache
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
            // Need to check via API
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
          .checkTeamReviewRequest(notification.subject.url, user.login)
          .then(async (isTeam) => {
            group.isTeamReviewRequest = isTeam;

            if (isTeam && userTeamSlugs.length > 0) {
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
                  teamInfo.name
                );
              } else {
                // Couldn't determine specific team, use generic team section
                group.teamSlug = "_team_review_requests";
                group.teamName = "Team Review Requests";
                teamCache.set(
                  notification.id,
                  true,
                  "_team_review_requests",
                  "Team Review Requests"
                );
              }
              // It's a team review, not prominent for the individual
              group.isProminentForMe = false;
            } else {
              teamCache.set(notification.id, false);
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

      // Convert to array and sort
      const groupedArray = Object.values(groups);

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

      return groupedArray;
    },
    [api, user]
  );

  const fetchNotifications = useCallback(
    async (page: number = 1, append: boolean = false) => {
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
        // Fetch notifications for the specified page
        const pageNotifications = await api.getNotifications(page, 50);

        // Check if there are more pages
        setHasMore(pageNotifications.length === 50);

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
        ]);

        // Filter notifications: only allowed reasons and not dismissed
        // We're already using participating=true at API level to reduce initial results
        const filtered = allNotifications.filter(
          (n) =>
            !dismissed.includes(n.id) &&
            (allowedReasons.has(n.reason) || n.subject.type === "CheckSuite") && // Include CheckSuite notifications
            // Exclude comment notifications on threads you authored (likely your own comments)
            !(
              n.reason === "comment" &&
              allNotifications.some(
                (other) =>
                  other.subject.url === n.subject.url &&
                  other.reason === "author"
              )
            )
        );

        // Process and group notifications
        const processed = await processNotifications(filtered);

        if (append && page > 1) {
          // Merge with existing notifications, avoiding duplicates
          const existingIds = new Set(notifications.map((g) => g.id));
          const newGroups = processed.filter((g) => !existingIds.has(g.id));
          setNotifications([...notifications, ...newGroups]);
        } else {
          setNotifications(processed);
        }

        // Check for new prominent notifications
        // Skip web notifications on initial page load to prevent notification spam
        checkForNewProminentNotifications(processed, isFirstSessionLoad);

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
    [api, dismissed, processNotifications, initialLoad, error, notifications]
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

      const prominentGroups = groups.filter((g) => g.isProminentForMe);

      for (const group of prominentGroups) {
        // Check if ANY notification in the group is new
        let hasNewNotification = false;
        if (newNotificationIds) {
          for (const notification of group.notifications) {
            if (newNotificationIds.has(notification.id)) {
              hasNewNotification = true;
              break;
            }
          }
        } else {
          // If no newNotificationIds provided (initial load), always true
          hasNewNotification = true;
        }

        // Use the group ID for tracking, not individual notification
        const key = `notified_${group.id}`;

        if (!sessionStorage.getItem(key) && hasNewNotification) {
          sessionStorage.setItem(key, "true");

          let title = `${group.subject.title}`;
          let body = `${group.repository.full_name}`;

          if (group.isOwnContent) {
            title = `[Your ${group.subject.type}] ${title}`;
          } else if (group.hasReviewRequest) {
            title = `[Review Request] ${title}`;
          } else if (group.hasMention) {
            title = `[Mention] ${title}`;
          }

          new Notification(title, {
            body: body,
            icon: "https://github.githubassets.com/favicons/favicon.png",
            tag: group.id,
            requireInteraction: true,
          });
        }
      }
    },
    []
  );

  const dismissNotification = useCallback(
    (groupId: string) => {
      const group = notifications.find((g) => g.id === groupId);
      if (group) {
        const notificationIds = group.notifications.map((n) => n.id);
        const newDismissed = [...dismissed, ...notificationIds];
        setDismissed(newDismissed);
        localStorage.setItem(
          STORAGE_KEYS.DISMISSED,
          JSON.stringify(newDismissed)
        );

        // Remove from current notifications
        setNotifications(notifications.filter((g) => g.id !== groupId));
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
      if (!mounted) return;

      // Fetch user if not already loaded
      if (!user) {
        await fetchUser();
      }

      // Fetch user teams
      await fetchUserTeams();

      // Fetch notifications
      if (mounted) {
        await fetchNotifications();
      }
    };

    initializeData();

    // Set up polling for new notifications
    let refreshInterval: NodeJS.Timeout;

    // Delay setting up the interval to avoid circular dependency
    setTimeout(() => {
      refreshInterval = setInterval(() => {
        if (mounted && currentPage > 0) {
          refreshAllPages();
        }
      }, 60000); // Every minute
    }, 0);

    return () => {
      mounted = false;
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Only depend on token changes

  // Request notification permissions
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!loadingMore && hasMore && currentPage < 10) {
      // Limit to 10 pages max (500 notifications)
      await fetchNotifications(currentPage + 1, true);
    }
  }, [currentPage, hasMore, loadingMore, fetchNotifications]);

  // Refresh all currently loaded pages
  const refreshAllPages = useCallback(async () => {
    if (!api || currentPage === 0) return;

    // Don't show loading spinner for refresh
    setError(null);

    // Store current notification IDs to identify new ones
    const existingNotificationIds = new Set(
      notifications.flatMap((group) => group.notifications.map((n) => n.id))
    );

    try {
      // Fetch all pages up to current page
      const allPromises: Promise<GitHubNotification[]>[] = [];
      for (let p = 1; p <= currentPage; p++) {
        allPromises.push(api.getNotifications(p, 50));
      }

      const allResults = await Promise.all(allPromises);
      const allNotifications = allResults.flat();

      // Check if there are more pages based on the last page
      setHasMore(allResults[allResults.length - 1].length === 50);

      // Process all notifications at once
      const processed = await processNotifications(allNotifications);
      setNotifications(processed);

      // Identify which notifications are truly new (not present before refresh)
      const newNotificationIds = new Set<string>();
      for (const group of processed) {
        for (const notification of group.notifications) {
          if (!existingNotificationIds.has(notification.id)) {
            newNotificationIds.add(notification.id);
          }
        }
      }

      // Check for new prominent notifications, passing the set of new IDs
      checkForNewProminentNotifications(processed, false, newNotificationIds);
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") {
        setError("Authentication expired. Please login again.");
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
    notifications,
  ]);

  return {
    notifications,
    user,
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
