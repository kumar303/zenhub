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

// Mock notification data based on real debug output
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

// Create mock notifications - based on the debug output
const createMockNotifications = (): NotificationGroup[] => {
  return [
    // Direct review request (not team) - should appear in "Review Requests"
    {
      id: "Shopify/ui-extensions#https://api.github.com/repos/Shopify/ui-extensions/pulls/123",
      repository: {
        id: 1,
        name: "ui-extensions",
        full_name: "Shopify/ui-extensions",
        owner: mockUser,
        html_url: "https://github.com/Shopify/ui-extensions",
      },
      subject: {
        title: "Add new API method",
        url: "https://api.github.com/repos/Shopify/ui-extensions/pulls/123",
        type: "PullRequest",
      },
      notifications: [
        {
          id: "notif-123",
          unread: true,
          reason: "review_requested",
          updated_at: "2025-11-14T10:00:00Z",
          subject: {
            title: "Add new API method",
            url: "https://api.github.com/repos/Shopify/ui-extensions/pulls/123",
            type: "PullRequest",
          },
          repository: {
            id: 1,
            name: "ui-extensions",
            full_name: "Shopify/ui-extensions",
            owner: mockUser,
            html_url: "https://github.com/Shopify/ui-extensions",
          },
          url: "https://api.github.com/notifications/threads/notif-123",
          subscription_url:
            "https://api.github.com/notifications/threads/notif-123/subscription",
        },
      ],
      isOwnContent: false,
      isProminentForMe: false,
      hasReviewRequest: true,
      isTeamReviewRequest: false, // This is the key - direct review request
      hasMention: false,
      hasReply: false,
      hasTeamMention: false,
      isDraftPR: false,
    },
    // Team review request - should NOT appear in "Review Requests"
    {
      id: "Shopify/ui-api-design#https://api.github.com/repos/Shopify/ui-api-design/pulls/1293",
      repository: {
        id: 2,
        name: "ui-api-design",
        full_name: "Shopify/ui-api-design",
        owner: mockUser,
        html_url: "https://github.com/Shopify/ui-api-design",
      },
      subject: {
        title: "Add `children` property to `DropZone`",
        url: "https://api.github.com/repos/Shopify/ui-api-design/pulls/1293",
        type: "PullRequest",
      },
      notifications: [
        {
          id: "19989782206",
          unread: true,
          reason: "review_requested",
          updated_at: "2025-11-02T21:05:55Z",
          subject: {
            title: "Add `children` property to `DropZone`",
            url: "https://api.github.com/repos/Shopify/ui-api-design/pulls/1293",
            type: "PullRequest",
          },
          repository: {
            id: 2,
            name: "ui-api-design",
            full_name: "Shopify/ui-api-design",
            owner: mockUser,
            html_url: "https://github.com/Shopify/ui-api-design",
          },
          url: "https://api.github.com/notifications/threads/19989782206",
          subscription_url:
            "https://api.github.com/notifications/threads/19989782206/subscription",
        },
      ],
      isOwnContent: false,
      isProminentForMe: false,
      hasReviewRequest: true,
      isTeamReviewRequest: true, // Team review request
      teamSlug: "_team_review_requests",
      teamName: "Team Review Requests",
      hasMention: false,
      hasReply: false,
      hasTeamMention: false,
      isDraftPR: false,
    },
    // Another direct review request
    {
      id: "Shopify/checkout#https://api.github.com/repos/Shopify/checkout/pulls/456",
      repository: {
        id: 3,
        name: "checkout",
        full_name: "Shopify/checkout",
        owner: mockUser,
        html_url: "https://github.com/Shopify/checkout",
      },
      subject: {
        title: "Fix payment validation",
        url: "https://api.github.com/repos/Shopify/checkout/pulls/456",
        type: "PullRequest",
      },
      notifications: [
        {
          id: "notif-456",
          unread: true,
          reason: "review_requested",
          updated_at: "2025-11-14T09:00:00Z",
          subject: {
            title: "Fix payment validation",
            url: "https://api.github.com/repos/Shopify/checkout/pulls/456",
            type: "PullRequest",
          },
          repository: {
            id: 3,
            name: "checkout",
            full_name: "Shopify/checkout",
            owner: mockUser,
            html_url: "https://github.com/Shopify/checkout",
          },
          url: "https://api.github.com/notifications/threads/notif-456",
          subscription_url:
            "https://api.github.com/notifications/threads/notif-456/subscription",
        },
      ],
      isOwnContent: false,
      isProminentForMe: false,
      hasReviewRequest: true,
      isTeamReviewRequest: false, // Direct review request
      hasMention: false,
      hasReply: false,
      hasTeamMention: false,
      isDraftPR: false,
    },
    // A notification without review request
    {
      id: "shop/issues-checkout#https://api.github.com/repos/shop/issues-checkout/issues/145",
      repository: {
        id: 4,
        name: "issues-checkout",
        full_name: "shop/issues-checkout",
        owner: mockUser,
        html_url: "https://github.com/shop/issues-checkout",
      },
      subject: {
        title: "Remove documentation about shop user metafields",
        url: "https://api.github.com/repos/shop/issues-checkout/issues/145",
        type: "Issue",
      },
      notifications: [
        {
          id: "15373287481",
          unread: true,
          reason: "author",
          updated_at: "2025-09-10T20:53:33Z",
          subject: {
            title: "Remove documentation about shop user metafields",
            url: "https://api.github.com/repos/shop/issues-checkout/issues/145",
            type: "Issue",
          },
          repository: {
            id: 4,
            name: "issues-checkout",
            full_name: "shop/issues-checkout",
            owner: mockUser,
            html_url: "https://github.com/shop/issues-checkout",
          },
          url: "https://api.github.com/notifications/threads/15373287481",
          subscription_url:
            "https://api.github.com/notifications/threads/15373287481/subscription",
        },
      ],
      isOwnContent: true,
      isProminentForMe: false,
      hasReviewRequest: false,
      isTeamReviewRequest: false,
      hasMention: false,
      hasReply: false,
      hasTeamMention: false,
    },
  ];
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
    const mockNotifications = createMockNotifications();

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
    const mockNotifications = createMockNotifications();

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

    const teamReviewRequest = mockNotifications.find(
      (n) => n.isTeamReviewRequest && n.hasReviewRequest
    );
    expect(teamReviewRequest).toBeDefined();
    expect(teamReviewRequest?.teamSlug).toBe("_team_review_requests");

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
    expect(directReviewRequests).toHaveLength(2);
    expect(directReviewRequests.every((g) => !g.isTeamReviewRequest)).toBe(
      true
    );
  });
});
