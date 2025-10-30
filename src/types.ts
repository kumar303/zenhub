export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  url: string;
  html_url: string;
  name?: string;
  email?: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  html_url: string;
  description?: string;
}

export interface GitHubSubject {
  title: string;
  url: string;
  latest_comment_url?: string;
  type:
    | "Issue"
    | "PullRequest"
    | "Release"
    | "Discussion"
    | "Commit"
    | "CheckSuite";
}

export interface GitHubNotification {
  id: string;
  unread: boolean;
  reason:
    | "assign"
    | "author"
    | "comment"
    | "invitation"
    | "manual"
    | "mention"
    | "review_requested"
    | "security_alert"
    | "state_change"
    | "subscribed"
    | "team_mention";
  updated_at: string;
  last_read_at?: string;
  subject: GitHubSubject;
  repository: GitHubRepository;
  url: string;
  subscription_url: string;
}

export interface NotificationGroup {
  id: string;
  repository: GitHubRepository;
  subject: GitHubSubject;
  notifications: GitHubNotification[];
  isOwnContent: boolean;
  isProminentForMe: boolean;
  hasReviewRequest: boolean;
  hasMention: boolean;
  hasReply: boolean;
  hasTeamMention: boolean;
}

export interface SubjectDetails {
  id: number;
  html_url: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  state?: string;
  title?: string;
  body?: string;
}
