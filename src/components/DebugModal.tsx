import { useState, useEffect } from "preact/hooks";
import type { NotificationGroup, GitHubTeam } from "../types";

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
          const cacheKey = `github_team_cache_v3`;
          const cacheData = localStorage.getItem(cacheKey);
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
        teamCacheKey: localStorage.getItem("github_team_cache_v3")
          ? "exists"
          : "empty",
        teamsCacheKey: localStorage.getItem("github_user_teams")
          ? "exists"
          : "empty",
      },
    };

    setDebugData(JSON.stringify(data, null, 2));
  }, [isOpen, notifications, userTeams, user]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(debugData);
      alert("Debug data copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy:", err);
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
        </div>
      </div>
    </div>
  );
}
