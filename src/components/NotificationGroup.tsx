import { useState } from "preact/hooks";
import type { NotificationGroup as NotificationGroupType } from "../types";
import { formatDateTime } from "../utils/date";
import { getSubjectUrl } from "../utils/url";

interface NotificationGroupProps {
  group: NotificationGroupType;
  onDismiss: () => void;
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
    mention: "Mentioned in thread",
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
  onLinkClick,
  isClicked,
}: NotificationGroupProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`notification-item vhs-transition p-4 mb-2 ${
        isClicked ? "opacity-60" : ""
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
              <span
                className="px-2 py-1 text-xs font-bold rounded-lg gradient-blue-yellow text-white"
                title="You were mentioned in this thread (may not be the latest comment)"
              >
                MENTIONED
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
              className="hover:text-magenta-500 transition-colors duration-200"
            >
              {group.subject.title}
            </a>
          </h3>

          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>
              {group.subject.type === "PullRequest" ? "PR" : group.subject.type}
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
                  <span className="font-medium">{formatReason(n.reason)}</span>{" "}
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
            className="vhs-button px-2 py-1 text-sm"
            title="Dismiss"
            aria-label="Dismiss notification"
          >
            [X]
          </button>
        </div>
      </div>
    </div>
  );
}
