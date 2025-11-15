import { useState, useEffect, useRef } from "preact/hooks";
import type { NotificationGroup, GitHubTeam } from "../types";
import { CACHE_KEYS } from "../config/cacheKeys";
import { clearAllTeamCache } from "../utils/clearCache";

interface DebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationGroup[];
  userTeams: GitHubTeam[];
  user: { login: string } | null;
}

export function DebugModal({
  isOpen,
  onClose,
  notifications,
  userTeams,
  user,
}: DebugModalProps) {
  const [debugData, setDebugData] = useState("");
  const [capturedLogs, setCapturedLogs] = useState<string[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle click outside for menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  // Reset menu when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowMenu(false);
    }
  }, [isOpen]);

  // Capture console logs when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const logs: string[] = [];
    const originalLog = console.log;

    // Override console.log temporarily
    console.log = (...args) => {
      const logMessage = args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
        )
        .join(" ");

      // Only capture team review related logs
      if (
        logMessage.includes("team review") ||
        logMessage.includes("Checking PR") ||
        logMessage.includes("orphaned") ||
        logMessage.includes("Cache check")
      ) {
        logs.push(logMessage);
        setCapturedLogs((prev) => [...prev, logMessage]);
      }

      // Still call the original console.log
      originalLog.apply(console, args);
    };

    // Restore original console.log when modal closes
    return () => {
      console.log = originalLog;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Collect comprehensive debug information
    const data = {
      timestamp: new Date().toISOString(),
      user: user?.login || "Not logged in",
      userTeams: userTeams.map((team) => ({
        slug: team.slug,
        name: team.name,
        id: team.id,
      })),
      notificationsCount: notifications.length,
      problemNotifications: (() => {
        // Find notifications that might have team review issues
        const problems = [];

        // Check for notifications that might have team review issues
        const suspiciousReviews = notifications.filter(
          (g) =>
            (g.hasReviewRequest &&
              !g.isTeamReviewRequest &&
              g.notifications[0].reason === "review_requested") ||
            // Also include team reviews with generic fallback
            (g.isTeamReviewRequest && g.teamSlug === "_team_review_requests")
        );

        for (const group of suspiciousReviews) {
          const notifId = group.notifications[0].id;
          const cacheData = localStorage.getItem(CACHE_KEYS.TEAM_CACHE);
          let cacheInfo = null;

          if (cacheData) {
            try {
              const cache = JSON.parse(cacheData);
              if (cache.data && cache.data[notifId]) {
                cacheInfo = cache.data[notifId];
              }
            } catch (e) {}
          }

          problems.push({
            title: group.subject.title,
            url: group.subject.url,
            notificationId: notifId,
            reason: group.notifications[0].reason,
            hasReviewRequest: group.hasReviewRequest,
            isTeamReviewRequest: group.isTeamReviewRequest,
            teamSlug: group.teamSlug,
            teamName: group.teamName,
            cacheData: cacheInfo,
            clearCacheScript: `
// Clear cache for: ${group.subject.title}
const notifId = "${notifId}";
const cacheKey = "${CACHE_KEYS.TEAM_CACHE}";
const cache = JSON.parse(localStorage.getItem(cacheKey) || '{"data":{}}');
if (cache.data && cache.data[notifId]) {
  delete cache.data[notifId];
  localStorage.setItem(cacheKey, JSON.stringify(cache));
  console.log("Cleared cache for notification:", notifId);
} else {
  console.log("No cache found for notification:", notifId);
}
location.reload();
            `.trim(),
          });
        }

        return problems;
      })(),
      notifications: notifications.map((group) => ({
        id: group.id,
        subject: {
          title: group.subject.title,
          type: group.subject.type,
          url: group.subject.url,
        },
        repository: group.repository.full_name,
        reason: group.notifications[0].reason,
        hasReviewRequest: group.hasReviewRequest,
        isTeamReviewRequest: group.isTeamReviewRequest,
        teamSlug: group.teamSlug,
        teamName: group.teamName,
        isDraftPR: group.isDraftPR,
        hasMention: group.hasMention,
        hasTeamMention: group.hasTeamMention,
        isOwnContent: group.isOwnContent,
        isProminentForMe: group.isProminentForMe,
        notificationIds: group.notifications.map((n) => n.id),
        updatedAt: group.notifications[0].updated_at,
        // Additional debug info for orphaned reviews
        cacheStatus: (() => {
          const cacheData = localStorage.getItem(CACHE_KEYS.TEAM_CACHE);
          if (!cacheData) return "no cache";
          try {
            const cache = JSON.parse(cacheData);
            const notifId = group.notifications[0].id;
            if (cache.data && cache.data[notifId]) {
              return `cached: ${JSON.stringify(cache.data[notifId])}`;
            }
            return "not in cache";
          } catch (e) {
            return "cache error";
          }
        })(),
      })),
      localStorage: {
        teamCacheKey: localStorage.getItem(CACHE_KEYS.TEAM_CACHE)
          ? "exists"
          : "empty",
        teamsCacheKey: localStorage.getItem(CACHE_KEYS.USER_TEAMS)
          ? "exists"
          : "empty",
        stateCacheKey: localStorage.getItem("github_state_cache")
          ? "exists"
          : "empty",
        dismissedNotifications: (() => {
          const dismissed = localStorage.getItem("dismissed_notifications");
          if (!dismissed) return "none";
          try {
            const parsed = JSON.parse(dismissed);
            return {
              count: parsed.length,
              sample: parsed.slice(0, 5),
              hasNumericIds: parsed.some((id: any) => /^\d+$/.test(id)),
            };
          } catch (e) {
            return "invalid";
          }
        })(),
      },
      stateCache: (() => {
        const stateCache = localStorage.getItem("github_state_cache");
        if (!stateCache) return "empty";
        try {
          const parsed = JSON.parse(stateCache);
          const entries = Object.entries(parsed).map(([url, data]: [string, any]) => ({
            url,
            state: data.state,
            age: Math.round((Date.now() - data.timestamp) / 1000 / 60) + " minutes",
          }));
          return {
            count: entries.length,
            entries: entries.slice(0, 10), // Show first 10 entries
          };
        } catch (e) {
          return "invalid";
        }
      })(),
      debugInstructions: {
        forProblemNotifications: [
          "1. Copy the clearCacheScript from the problemNotifications section",
          "2. Open browser console (F12)",
          "3. Paste and run the script",
          "4. Page will reload automatically",
          "5. Check console for 'Checking team review for PR:' logs",
          "6. Run Debug again and share the new output",
        ],
        consoleCommands: {
          clearAllTeamCache: `localStorage.removeItem("${CACHE_KEYS.TEAM_CACHE}"); localStorage.removeItem("${CACHE_KEYS.TEAM_CACHE_V4}"); localStorage.removeItem("${CACHE_KEYS.TEAM_CACHE_V3}"); localStorage.removeItem("${CACHE_KEYS.TEAM_CACHE_V2}"); localStorage.removeItem("${CACHE_KEYS.TEAM_CACHE_V1}"); location.reload();`,
          showCurrentCache: `console.log(JSON.parse(localStorage.getItem("${CACHE_KEYS.TEAM_CACHE}")));`,
          enableVerboseLogging: `localStorage.setItem("debug_team_reviews", "true"); location.reload();`,
          disableVerboseLogging: `localStorage.removeItem("debug_team_reviews"); location.reload();`,
          clearDismissedNotifications: `localStorage.removeItem("dismissed_notifications"); location.reload();`,
          showDismissedNotifications: `console.log(JSON.parse(localStorage.getItem("dismissed_notifications") || "[]"));`,
        },
      },
      capturedConsoleLogs:
        capturedLogs.length > 0
          ? capturedLogs
          : ["No team review logs captured yet. Try enabling verbose logging."],
    };

    setDebugData(JSON.stringify(data, null, 2));
  }, [isOpen, notifications, userTeams, user, capturedLogs]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(debugData);
      alert("Debug data copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleClearProblemCaches = () => {
    try {
      const data = JSON.parse(debugData);
      if (
        !data.problemNotifications ||
        data.problemNotifications.length === 0
      ) {
        alert("No problem notifications found to clear.");
        return;
      }

      const cacheKey = CACHE_KEYS.TEAM_CACHE;
      const cacheData = localStorage.getItem(cacheKey);
      if (!cacheData) {
        alert("No cache found.");
        return;
      }

      const cache = JSON.parse(cacheData);
      let clearedCount = 0;

      for (const problem of data.problemNotifications) {
        if (cache.data && cache.data[problem.notificationId]) {
          delete cache.data[problem.notificationId];
          clearedCount++;
          console.log(
            `Cleared cache for: ${problem.title} (${problem.notificationId})`
          );
        }
      }

      localStorage.setItem(cacheKey, JSON.stringify(cache));

      if (clearedCount > 0) {
        alert(
          `Cleared cache for ${clearedCount} notifications. Page will reload.`
        );
        location.reload();
      } else {
        alert("No cached entries found for problem notifications.");
      }
    } catch (err) {
      console.error("Failed to clear caches:", err);
      alert("Failed to clear caches. Check console for details.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Debug Information</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-gray-50 p-4 rounded-lg">
            {debugData}
          </pre>
        </div>
        <div className="p-4 border-t border-gray-200 flex gap-3 justify-end">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Copy to Clipboard
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2"
              title="Actions menu"
            >
              <span>Actions</span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {debugData &&
                  (() => {
                    try {
                      const data = JSON.parse(debugData);
                      if (
                        data.problemNotifications &&
                        data.problemNotifications.length > 0
                      ) {
                        return (
                          <>
                            <div className="px-4 py-2 text-sm font-semibold text-gray-500 border-b border-gray-200">
                              Clear Problem Caches
                            </div>
                            {data.problemNotifications.map(
                              (problem: any, index: number) => (
                                <button
                                  key={index}
                                  onClick={() => {
                                    const cacheKey = CACHE_KEYS.TEAM_CACHE;
                                    const cache = JSON.parse(
                                      localStorage.getItem(cacheKey) ||
                                        '{"data":{}}'
                                    );
                                    if (
                                      cache.data &&
                                      cache.data[problem.notificationId]
                                    ) {
                                      delete cache.data[problem.notificationId];
                                      localStorage.setItem(
                                        cacheKey,
                                        JSON.stringify(cache)
                                      );
                                      console.log(
                                        `Cleared cache for: ${problem.title}`
                                      );
                                      location.reload();
                                    } else {
                                      alert(
                                        `No cache found for: ${problem.title}`
                                      );
                                    }
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700"
                                >
                                  Clear: {problem.title.substring(0, 40)}...
                                </button>
                              )
                            )}
                            <div className="border-b border-gray-200 my-1"></div>
                          </>
                        );
                      }
                      return null;
                    } catch (e) {
                      return null;
                    }
                  })()}

                <button
                  onClick={handleClearProblemCaches}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700"
                >
                  Clear All Problem Caches
                </button>
                <button
                  onClick={() => {
                    clearAllTeamCache();
                    alert("Team cache cleared. Page will reload.");
                    location.reload();
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700"
                >
                  Clear All Team Cache
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem("dismissed_notifications");
                    alert("Dismissed notifications cleared. Page will reload.");
                    location.reload();
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700"
                >
                  Clear Dismissed Notifications
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem("debug_team_reviews", "true");
                    alert("Verbose logging enabled. Page will reload.");
                    location.reload();
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700"
                >
                  Enable Verbose Logging
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem("debug_team_reviews");
                    alert("Verbose logging disabled. Page will reload.");
                    location.reload();
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700"
                >
                  Disable Verbose Logging
                </button>
                <div className="border-b border-gray-200 my-1"></div>
                <button
                  onClick={() => {
                    // Get the token to preserve it
                    const token = localStorage.getItem("github_token");

                    // Clear all localStorage
                    localStorage.clear();

                    // Restore the token
                    if (token) {
                      localStorage.setItem("github_token", token);
                    }

                    alert(
                      "All caches cleared (token preserved). Page will reload."
                    );
                    location.reload();
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700 text-red-600 font-semibold"
                >
                  Clear All Caches (Keep Login)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
