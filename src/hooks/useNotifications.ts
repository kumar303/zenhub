import { useState, useEffect, useCallback } from "preact/hooks";
import { GitHubAPI } from "../api";
import { STORAGE_KEYS } from "../config";
import { stateCache } from "../utils/stateCache";
import type {
  GitHubUser,
  GitHubNotification,
  NotificationGroup,
} from "../types";

export function useNotifications(token: string | null) {
  const [notifications, setNotifications] = useState<NotificationGroup[]>([]);
  const [user, setUser] = useState<GitHubUser | null>(() => {
    // Try to load user from localStorage first
    const saved = localStorage.getItem(STORAGE_KEYS.USER);
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true); // Start with loading true
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DISMISSED);
    return saved ? JSON.parse(saved) : [];
  });

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

  const fetchNotifications = useCallback(async () => {
    if (!api) return;

    // Don't show loading spinner on subsequent fetches unless it's the initial load
    if (initialLoad) {
      setLoading(true);
    }

    // Clear error on retry
    if (error) {
      setError(null);
    }

    try {
      // Fetch up to 50 notifications (1 page)
      const allNotifications = await api.getNotifications(1, 50);

      // Already limited to 50 by the API
      const limitedNotifications = allNotifications;

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
      const filtered = limitedNotifications.filter(
        (n) =>
          !dismissed.includes(n.id) &&
          (allowedReasons.has(n.reason) || n.subject.type === "CheckSuite") && // Include CheckSuite notifications
          // Exclude comment notifications on threads you authored (likely your own comments)
          !(
            n.reason === "comment" &&
            limitedNotifications.some(
              (other) =>
                other.subject.url === n.subject.url && other.reason === "author"
            )
          )
      );

      // Process and group notifications
      const processed = await processNotifications(filtered);
      setNotifications(processed);

      // Check for new prominent notifications
      checkForNewProminentNotifications(processed);

      // Mark initial load as complete
      if (initialLoad) {
        setInitialLoad(false);
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
    }
  }, [api, dismissed, processNotifications, initialLoad, error]);

  const checkForNewProminentNotifications = useCallback(
    (groups: NotificationGroup[]) => {
      if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {
        return;
      }

      const prominentGroups = groups.filter((g) => g.isProminentForMe);

      for (const group of prominentGroups) {
        const latestNotification = group.notifications[0];
        const key = `notified_${latestNotification.id}`;

        if (!sessionStorage.getItem(key)) {
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

      // Fetch notifications
      if (mounted) {
        await fetchNotifications();
      }
    };

    initializeData();

    // Set up polling for new notifications
    const interval = setInterval(() => {
      if (mounted) {
        fetchNotifications();
      }
    }, 60000); // Every minute

    return () => {
      mounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Only depend on token changes

  // Request notification permissions
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return {
    notifications,
    user,
    loading,
    error,
    fetchNotifications,
    dismissNotification,
  };
}
