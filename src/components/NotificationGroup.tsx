import { useState } from "preact/hooks";
import type { NotificationGroup as NotificationGroupType } from "../types";
import { formatDateTime } from "../utils/date";

interface NotificationGroupProps {
  group: NotificationGroupType;
  onDismiss: () => void;
  getSubjectUrl: (subject: NotificationGroupType["subject"]) => string;
  onLinkClick: () => void;
  isClicked: boolean;
}

function formatReason(reason: string): string {
  const reasonMap: Record<string, string> = {
    assign: "Assigned to you",
    author: "You created this",
    comment: "New comment",
    invitation: "Invitation",
    manual: "Subscribed",
    mention: "You were mentioned",
    review_requested: "Review requested",
    security_alert: "Security alert",
    state_change: "State changed",
    subscribed: "Subscribed",
    team_mention: "Team mentioned",
    ci_activity: "CI activity",
  };
  return reasonMap[reason] || reason.replace(/_/g, " ");
}

export function NotificationGroup({
  group,
  onDismiss,
  getSubjectUrl,
  onLinkClick,
  isClicked,
}: NotificationGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const getBorderGradient = () => {
    if (group.isOwnContent) return "gradient-purple-blue";
    if (group.hasReviewRequest) return "gradient-green-red";
    if (group.hasMention) return "gradient-blue-yellow";
    return "";
  };

  const borderClass = getBorderGradient();

  return (
    <div
      className={`${
        isClicked ? "opacity-60" : ""
      } bg-white rounded-2xl shadow-lg overflow-hidden ${
        borderClass ? "p-1" : ""
      } transition-opacity duration-200`}
    >
      <div
        className={`${borderClass ? "bg-white rounded-xl" : ""} p-6 ${
          isClicked ? "bg-gray-50" : ""
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-600">
                {group.repository.full_name}
              </span>
              {group.isOwnContent && (
                <span className="px-2 py-1 text-xs font-bold rounded-lg gradient-purple-blue text-white">
                  YOUR{" "}
                  {group.subject.type === "PullRequest"
                    ? "PR"
                    : group.subject.type.toUpperCase()}
                </span>
              )}
              {group.hasReviewRequest && (
                <span className="px-2 py-1 text-xs font-bold rounded-lg gradient-green-red text-white">
                  REVIEW REQUEST
                </span>
              )}
              {group.hasMention && !group.hasTeamMention && (
                <span className="px-2 py-1 text-xs font-bold rounded-lg gradient-blue-yellow text-white">
                  MENTION
                </span>
              )}
              {group.hasTeamMention && (
                <span className="px-2 py-1 text-xs font-medium rounded-lg bg-gray-300 text-gray-700">
                  TEAM MENTION
                </span>
              )}
              {isClicked && (
                <span className="px-2 py-1 text-xs font-medium rounded-lg bg-gray-200 text-gray-600">
                  VISITED
                </span>
              )}
            </div>

            <h3 className="text-lg font-semibold mb-2">
              <a
                href={getSubjectUrl(group.subject)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onLinkClick}
                className={`${
                  isClicked ? "text-olympic-purple" : "text-olympic-blue"
                } hover:text-olympic-purple transition-colors duration-200`}
              >
                {group.subject.title}
              </a>
            </h3>

            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>
                {group.subject.type === "PullRequest"
                  ? "PR"
                  : group.subject.type}
              </span>
              <span>
                {group.notifications.length === 1 ? (
                  <span className="font-medium">
                    {formatReason(group.notifications[0].reason)}
                  </span>
                ) : (
                  <span>{group.notifications.length} notifications</span>
                )}
              </span>
              <span>
                Updated {formatDateTime(group.notifications[0].updated_at)}
              </span>
            </div>

            {expanded && (
              <div className="mt-4 space-y-2">
                {group.notifications.map((n) => (
                  <div
                    key={n.id}
                    className="text-sm text-gray-600 pl-4 border-l-2 border-gray-200"
                  >
                    <span className="font-medium">
                      {formatReason(n.reason)}
                    </span>{" "}
                    - {formatDateTime(n.updated_at)}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-4">
            {group.notifications.length > 1 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? "▼" : "▶"}
              </button>
            )}
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-red-500 transition-colors duration-200"
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <svg
                className="w-5 h-5"
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
        </div>
      </div>
    </div>
  );
}
