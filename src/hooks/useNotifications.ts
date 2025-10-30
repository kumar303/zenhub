import { useState, useEffect, useCallback } from "preact/hooks";
import { GitHubAPI } from "../api";
import { STORAGE_KEYS } from "../config";
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

      for (const notification of rawNotifications) {
        const key = `${notification.repository.full_name}#${notification.subject.url}`;

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
          if (notification.reason === "review_requested") {
            groups[key].hasReviewRequest = true;
            groups[key].isProminentForMe = true;
          }

          // Check for mentions or replies
          if (
            notification.reason === "mention" ||
            notification.reason === "comment"
          ) {
            groups[key].hasMention = true;
            groups[key].isProminentForMe = true;
          }

          // Check if user is the author (only if not already prominent)
          // This reduces API calls significantly
          if (
            !groups[key].isProminentForMe &&
            notification.reason === "author"
          ) {
            groups[key].isOwnContent = true;
            groups[key].isProminentForMe = true;
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
      // Fetch up to 200 notifications (4 pages of 50 each)
      const allNotifications: GitHubNotification[] = [];
      const maxPages = 4;
      const perPage = 50;

      for (let page = 1; page <= maxPages; page++) {
        const pageData = await api.getNotifications(page, perPage);
        allNotifications.push(...pageData);

        // Stop if we got less than a full page (no more notifications)
        if (pageData.length < perPage) {
          break;
        }

        // Stop if we have enough notifications
        if (allNotifications.length >= 200) {
          break;
        }
      }

      // Limit to 200 most recent notifications
      const limitedNotifications = allNotifications.slice(0, 200);

      // Filter out dismissed notifications
      const filtered = limitedNotifications.filter(
        (n) => !dismissed.includes(n.id)
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

  // Initial setup
  useEffect(() => {
    if (token) {
      // Fetch user and notifications in parallel
      Promise.all([
        user ? Promise.resolve() : fetchUser(),
        fetchNotifications(),
      ]);

      // Set up polling for new notifications
      const interval = setInterval(fetchNotifications, 60000); // Every minute
      return () => clearInterval(interval);
    } else {
      // No token, not loading
      setLoading(false);
    }
  }, [token, fetchUser, fetchNotifications, user]);

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
