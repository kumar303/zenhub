import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { App } from "./App";
import type { NotificationGroup, GitHubUser, GitHubTeam } from "./types";

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

// Helper to create a notification group with common defaults
const createNotificationGroup = (
  overrides: Partial<NotificationGroup>
): NotificationGroup => {
  const defaults: NotificationGroup = {
    id: "default-id",
    repository: {
      id: 1,
      name: "test-repo",
      full_name: "test/test-repo",
      owner: mockUser,
      html_url: "https://github.com/test/test-repo",
    },
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
        repository: {
          id: 1,
          name: "test-repo",
          full_name: "test/test-repo",
          owner: mockUser,
          html_url: "https://github.com/test/test-repo",
        },
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

    // Setup localStorage with proper token key
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
    // Setup: Create notifications with direct review requests
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

    // Setup: Create a notification WITHOUT direct review request (should not appear)
    const ownContentNotification = createNotificationGroup({
      id: "repo3#url3",
      subject: { title: "Your own issue", url: "url3", type: "Issue" },
      hasReviewRequest: false,
      isTeamReviewRequest: false,
      isOwnContent: true,
    });

    const mockNotifications = [
      directReviewRequest1,
      directReviewRequest2,
      ownContentNotification,
    ];

    vi.mocked(useNotifications).mockReturnValue({
      notifications: mockNotifications,
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
    expect(allReviewHeaders.length).toBeGreaterThanOrEqual(1);

    const reviewRequestsSection = allReviewHeaders.find(
      (el) =>
        el.textContent?.trim().startsWith("Review Requests") &&
        el.classList.contains("gradient-green-red")
    );
    expect(reviewRequestsSection).toBeDefined();
    expect(reviewRequestsSection).toBeInTheDocument();
    expect(reviewRequestsSection?.textContent).toContain("(2)");

    // Verify filtering: direct review requests only (not team requests)
    const reviewRequestGroups = mockNotifications.filter(
      (g) => g.hasReviewRequest && !g.isTeamReviewRequest
    );
    expect(reviewRequestGroups).toHaveLength(2);
    expect(reviewRequestGroups[0].subject.title).toBe("Add new API method");
    expect(reviewRequestGroups[1].subject.title).toBe("Fix payment validation");
  });

  it("should render notifications without a direct request but with a team request as Team Review Requests", () => {
    // Setup: Create a notification with a team review request
    const teamReviewRequest = createNotificationGroup({
      id: "repo1#url1",
      subject: {
        title: "Add `children` property to `DropZone`",
        url: "url1",
        type: "PullRequest",
      },
      hasReviewRequest: true,
      isTeamReviewRequest: true,
      teamSlug: "_team_review_requests",
      teamName: "Team Review Requests",
    });

    // Setup: Create notifications WITHOUT team review requests (should not appear in team section)
    const directReviewRequest = createNotificationGroup({
      id: "repo2#url2",
      subject: { title: "Direct review", url: "url2", type: "PullRequest" },
      hasReviewRequest: true,
      isTeamReviewRequest: false,
    });

    const ownContentNotification = createNotificationGroup({
      id: "repo3#url3",
      subject: { title: "Your own PR", url: "url3", type: "PullRequest" },
      hasReviewRequest: false,
      isTeamReviewRequest: false,
      isOwnContent: true,
    });

    const mockNotifications = [
      teamReviewRequest,
      directReviewRequest,
      ownContentNotification,
    ];

    vi.mocked(useNotifications).mockReturnValue({
      notifications: mockNotifications,
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

    const allHeaders = screen.queryAllByText(/Review Requests/);
    const teamSection = allHeaders.find(
      (el) =>
        el.textContent?.includes("Team Review Requests") &&
        el.classList.contains("gradient-green-blue")
    );

    expect(teamSection).toBeDefined();
    expect(teamSection).toBeInTheDocument();
    expect(teamSection?.textContent).toContain("(1)");

    // Verify team review requests are grouped by team
    const teamGroups = mockNotifications.filter(
      (g) => g.teamSlug && (g.isTeamReviewRequest || g.hasTeamMention)
    );
    expect(teamGroups).toHaveLength(1);
    expect(teamGroups[0].subject.title).toBe(
      "Add `children` property to `DropZone`"
    );
    expect(teamGroups[0].isTeamReviewRequest).toBe(true);
    expect(teamGroups[0].teamSlug).toBe("_team_review_requests");
    expect(teamGroups[0].teamName).toBe("Team Review Requests");

    // Verify team requests do NOT appear in direct "Review Requests"
    const directReviewRequests = mockNotifications.filter(
      (g) => g.hasReviewRequest && !g.isTeamReviewRequest
    );
    expect(directReviewRequests).toHaveLength(1);
    expect(directReviewRequests.every((g) => !g.isTeamReviewRequest)).toBe(
      true
    );
  });
});
