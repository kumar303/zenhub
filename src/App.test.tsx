import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { App } from "./App";
import type {
  GitHubUser,
  GitHubTeam,
  GitHubRepository,
  NotificationGroup,
} from "./types";

// Mock modules
vi.mock("./hooks/useNotifications");
vi.mock("./hooks/useClickedNotifications");
vi.mock("./utils/url");

// Import mocked modules
import { useNotifications } from "./hooks/useNotifications";
import { useClickedNotifications } from "./hooks/useClickedNotifications";

// Mock user data
const mockUser: GitHubUser = {
  login: "kumar303",
  id: 12345,
  avatar_url: "https://avatars.githubusercontent.com/u/12345",
  url: "https://api.github.com/users/kumar303",
  html_url: "https://github.com/kumar303",
};

const mockUserTeams: GitHubTeam[] = [
  {
    id: 233,
    node_id: "node_233",
    slug: "crafters",
    name: "Crafters",
    organization: {
      login: "shopify",
      id: 1,
      avatar_url: "https://avatars.githubusercontent.com/u/1",
    },
  },
];

const mockRepository: GitHubRepository = {
  id: 1,
  name: "test-repo",
  full_name: "test/test-repo",
  owner: mockUser,
  html_url: "https://github.com/test/test-repo",
};

// Helper to create NotificationGroup with sensible defaults
const createNotificationGroup = (
  overrides: Partial<NotificationGroup>
): NotificationGroup => {
  const defaults: NotificationGroup = {
    id: "default-id",
    repository: mockRepository,
    subject: {
      title: "Test notification",
      url: "https://api.github.com/repos/test/test-repo/pulls/1",
      type: "PullRequest",
    },
    notifications: [
      {
        id: "notif-1",
        unread: true,
        reason: "review_requested",
        updated_at: "2025-11-14T10:00:00Z",
        subject: {
          title: "Test notification",
          url: "https://api.github.com/repos/test/test-repo/pulls/1",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/threads/notif-1",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-1/subscription",
      },
    ],
    isOwnContent: false,
    isProminentForMe: false,
    hasReviewRequest: false,
    isTeamReviewRequest: false,
    hasMention: false,
    hasReply: false,
    hasTeamMention: false,
    isDraftPR: false,
  };

  return { ...defaults, ...overrides };
};

describe("<App>", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup localStorage with proper token key and clear caches
    (global.localStorage as any)._setStore({
      github_token: "test-token",
    });

    // Mock useClickedNotifications
    vi.mocked(useClickedNotifications).mockReturnValue({
      markAsClicked: vi.fn(),
      isClicked: vi.fn(() => false),
    });
  });

  it("should render notifications with a direct author review request as Review Requests", () => {
    // Setup: Create notifications with hasReviewRequest=true, isTeamReviewRequest=false
    const directReviewRequest1 = createNotificationGroup({
      id: "repo1#url1",
      subject: {
        title: "Add new API method",
        url: "url1",
        type: "PullRequest",
      },
      hasReviewRequest: true,
      isTeamReviewRequest: false,
    });

    const directReviewRequest2 = createNotificationGroup({
      id: "repo2#url2",
      subject: {
        title: "Fix payment validation",
        url: "url2",
        type: "PullRequest",
      },
      hasReviewRequest: true,
      isTeamReviewRequest: false,
    });

    // Setup: Create a notification that should NOT appear in Review Requests
    const ownContentNotification = createNotificationGroup({
      id: "repo3#url3",
      subject: {
        title: "Your own issue",
        url: "url3",
        type: "Issue",
      },
      hasReviewRequest: false,
      isTeamReviewRequest: false,
      isOwnContent: true,
    });

    vi.mocked(useNotifications).mockReturnValue({
      notifications: [
        directReviewRequest1,
        directReviewRequest2,
        ownContentNotification,
      ],
      user: mockUser,
      userTeams: mockUserTeams,
      loading: false,
      error: null,
      initialLoad: false,
      refreshAllPages: vi.fn(),
      dismissNotification: vi.fn(),
      loadMore: vi.fn(),
      hasMore: false,
      loadingMore: false,
      fetchNotifications: vi.fn(),
    });

    render(<App />);

    const allReviewHeaders = screen.queryAllByText(/Review Requests/);
    const reviewRequestsSection = allReviewHeaders.find(
      (el) =>
        el.textContent?.trim().startsWith("Review Requests") &&
        el.classList.contains("gradient-green-red")
    );
    expect(reviewRequestsSection).toBeDefined();
    expect(reviewRequestsSection).toBeInTheDocument();
    expect(reviewRequestsSection?.textContent).toContain("(2)");
  });

  it("should render notifications without a direct request but with a team request as Team Review Requests", () => {
    // Setup: Create notification with hasReviewRequest=true, isTeamReviewRequest=true, teamSlug set
    const teamReviewRequest = createNotificationGroup({
      id: "repo1#url1",
      subject: {
        title: "Add `children` property to `DropZone`",
        url: "url1",
        type: "PullRequest",
      },
      hasReviewRequest: true,
      isTeamReviewRequest: true,
      teamSlug: "crafters",
      teamName: "Crafters",
    });

    // Setup: Create notifications that should NOT appear in team section
    const directReviewRequest = createNotificationGroup({
      id: "repo2#url2",
      subject: {
        title: "Direct review",
        url: "url2",
        type: "PullRequest",
      },
      hasReviewRequest: true,
      isTeamReviewRequest: false,
    });

    const ownContentNotification = createNotificationGroup({
      id: "repo3#url3",
      subject: {
        title: "Your own PR",
        url: "url3",
        type: "PullRequest",
      },
      hasReviewRequest: false,
      isTeamReviewRequest: false,
      isOwnContent: true,
    });

    vi.mocked(useNotifications).mockReturnValue({
      notifications: [
        teamReviewRequest,
        directReviewRequest,
        ownContentNotification,
      ],
      user: mockUser,
      userTeams: mockUserTeams,
      loading: false,
      error: null,
      initialLoad: false,
      refreshAllPages: vi.fn(),
      dismissNotification: vi.fn(),
      loadMore: vi.fn(),
      hasMore: false,
      loadingMore: false,
      fetchNotifications: vi.fn(),
    });

    render(<App />);

    // Look for any team section (should have team name in it)
    const craftersSection = screen.queryByText(/Crafters/);
    expect(craftersSection).toBeDefined();
    expect(craftersSection).toBeInTheDocument();
    expect(craftersSection?.textContent).toContain("(1)");
  });
});
