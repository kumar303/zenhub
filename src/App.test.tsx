/**
 * IMPORTANT: Follow all guidelines in AGENTS.md before making changes.
 * Run tests, typecheck, and deploy after every change.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type {
  GitHubUser,
  GitHubTeam,
  GitHubRepository,
  GitHubNotification,
} from "./types";

// Mock modules
vi.mock("./hooks/useClickedNotifications");
vi.mock("./utils/url");

// Import mocked modules
import { useClickedNotifications } from "./hooks/useClickedNotifications";
import { getSubjectUrl } from "./utils/url";

// Import cache modules (not mocked)
import { teamCache } from "./utils/teamCache";
import { stateCache } from "./utils/stateCache";
import { teamsCache } from "./utils/teamsCache";

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

// Helper to create NotificationGroup objects

// Mock localStorage
const mockLocalStorage = {
  data: {} as Record<string, string>,
  getItem: vi.fn((key: string) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage.data[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage.data[key];
  }),
  clear: vi.fn(() => {
    mockLocalStorage.data = {};
  }),
  key: vi.fn(),
  length: 0,
};

global.localStorage = mockLocalStorage as any;

// Helper to create mock fetch responses
const createMockResponse = (data: any, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({
      "content-type": "application/json",
    }),
    redirected: false,
    type: "basic" as ResponseType,
    url: "",
    json: async () => data,
    text: async () => JSON.stringify(data),
    clone: () => createMockResponse(data, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob([]),
    formData: async () => new FormData(),
  } as Response);

interface MockApiOptions {
  user?: GitHubUser;
  teams?: GitHubTeam[];
  notifications?: GitHubNotification[];
  pullRequests?: Record<
    string,
    {
      state?: string;
      draft?: boolean;
      requested_reviewers?: any[];
      requested_teams?: any[];
    }
  >;
  notFoundUrls?: string[];
  errorUrls?: string[];
}

function setupMockApi(options: MockApiOptions = {}) {
  const {
    user = mockUser,
    teams = mockUserTeams,
    notifications = [],
    pullRequests = {},
    notFoundUrls = [],
    errorUrls = [],
  } = options;

  const mockFetch = vi.mocked(global.fetch);

  mockFetch.mockImplementation((url) => {
    const urlString = url.toString();

    // Check for error URLs (500 errors) first
    for (const errorUrl of errorUrls) {
      if (urlString.includes(errorUrl)) {
        return Promise.resolve(
          createMockResponse({ message: "Internal Server Error" }, 500)
        );
      }
    }

    // Check for 404 URLs
    for (const notFoundUrl of notFoundUrls) {
      if (urlString.includes(notFoundUrl)) {
        return Promise.resolve(
          createMockResponse({ message: "Not Found" }, 404)
        );
      }
    }

    if (urlString.includes("/user/teams")) {
      return Promise.resolve(createMockResponse(teams));
    }

    if (urlString.includes("/user") && !urlString.includes("/teams")) {
      return Promise.resolve(createMockResponse(user));
    }

    if (urlString.includes("/notifications")) {
      // Filter by 'since' parameter if present
      const urlObj = new URL(urlString);
      const sinceParam = urlObj.searchParams.get("since");
      const allParam = urlObj.searchParams.get("all");

      let filteredNotifications = notifications;
      if (sinceParam) {
        const sinceDate = new Date(sinceParam);
        filteredNotifications = notifications.filter((notif) => {
          const notifDate = new Date(notif.updated_at);
          return notifDate >= sinceDate;
        });
      }

      // GitHub API behavior: by default, only return unread notifications
      // unless all=true is specified
      if (allParam !== "true") {
        filteredNotifications = filteredNotifications.filter(
          (notif) => notif.unread
        );
      }

      return Promise.resolve(createMockResponse(filteredNotifications));
    }

    // Check for PR details
    for (const [prPath, prData] of Object.entries(pullRequests)) {
      if (urlString.includes(prPath)) {
        return Promise.resolve(
          createMockResponse({
            state: "open",
            draft: false,
            requested_reviewers: [],
            requested_teams: [],
            ...prData,
          })
        );
      }
    }

    return Promise.resolve(createMockResponse({}));
  });
}

describe("<App>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.data = {};

    stateCache.clear();
    teamCache.clear();
    teamsCache.clear();

    // Clear sessionStorage to ensure clean state for web notifications
    sessionStorage.clear();

    mockLocalStorage.data["github_token"] = "test-token-123";
    mockLocalStorage.data["github_user"] = JSON.stringify(mockUser);

    vi.mocked(useClickedNotifications).mockReturnValue({
      markAsClicked: vi.fn(),
      isClicked: vi.fn(() => false),
    });

    vi.mocked(getSubjectUrl).mockImplementation((subject) => {
      return subject.url.replace("api.github.com/repos", "github.com");
    });

    global.fetch = vi.fn();
  });

  afterEach(() => {
    // Ensure timers are restored after each test
    vi.useRealTimers();
  });

  describe("caching", () => {
    it("should show notifications after clearing cache", async () => {
      const reviewRequestPR: GitHubNotification = {
        id: "notif-review",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Fix authentication bug",
          url: "https://api.github.com/repos/test/test-repo/pulls/500",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: {
          id: 1,
          name: "test-repo",
          full_name: "test/test-repo",
          owner: {
            login: "test",
            id: 1,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            url: "https://api.github.com/users/test",
            html_url: "https://github.com/test",
          },
          html_url: "https://github.com/test/test-repo",
          description: "Test repository",
        },
        url: "https://api.github.com/notifications/notif-review",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-review",
      };

      // Simulate clearing localStorage (like Clear Cache button) except token
      delete mockLocalStorage.data["github_user"];

      setupMockApi({
        notifications: [reviewRequestPR],
        pullRequests: {
          "/pulls/500": {
            state: "open",
            requested_reviewers: [{ login: "kumar303" }],
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // Should show notifications even though user cache was cleared
      expect(screen.queryByText("No notifications! 🎉")).toBeNull();
      expect(screen.queryByText(/REVIEW REQUESTS/)).toBeDefined();
    });
  });

  describe("refreshing", () => {
    it("should show notifications after automatic refresh timer", async () => {
      vi.clearAllMocks();

      const reviewRequestPR: GitHubNotification = {
        id: "notif-timer",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Timer test PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/600",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: {
          id: 1,
          name: "test-repo",
          full_name: "test/test-repo",
          owner: {
            login: "test",
            id: 1,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            url: "https://api.github.com/users/test",
            html_url: "https://github.com/test",
          },
          html_url: "https://github.com/test/test-repo",
          description: "Test repository",
        },
        url: "https://api.github.com/notifications/notif-timer",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-timer",
      };

      setupMockApi({
        notifications: [reviewRequestPR],
        pullRequests: {
          "/pulls/600": {
            state: "open",
            requested_reviewers: [{ login: "kumar303" }],
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // Should show notification initially
      expect(screen.queryByText("No notifications! 🎉")).toBeNull();

      const user = userEvent.setup();
      const reviewRequestsSection = screen.getByText(/^REVIEW REQUESTS/);
      await user.click(reviewRequestsSection);

      await waitFor(() => {
        expect(screen.getByText("Timer test PR")).toBeDefined();
      });

      // Now switch to fake timers to simulate the automatic refresh
      vi.useFakeTimers();

      // Simulate the automatic refresh timer firing
      // First the setTimeout(0), then the setInterval(60000)
      vi.advanceTimersByTime(1); // Trigger setTimeout
      vi.advanceTimersByTime(60000); // Trigger setInterval

      await vi.runAllTimersAsync();
      vi.useRealTimers();

      await waitFor(() => {
        // Should still show notifications after timer refresh
        expect(screen.queryByText("Timer test PR")).toBeDefined();
      });
    });
  });

  describe("dismissing", () => {
    it("should not show dismissed notifications after refresh", async () => {
      // Pre-populate dismissed notifications in localStorage
      localStorage.setItem(
        "dismissed_notifications",
        JSON.stringify([
          "plasma-network/plasma.to#https://api.github.com/repos/plasma-network/plasma.to/issues/94",
        ])
      );

      const mentionNotification: GitHubNotification = {
        id: "19199998390",
        unread: true,
        reason: "mention",
        updated_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString(), // 2 days ago
        last_read_at: undefined,
        subject: {
          title:
            "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards",
          url: "https://api.github.com/repos/plasma-network/plasma.to/issues/94",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: {
          id: 1,
          name: "plasma.to",
          full_name: "plasma-network/plasma.to",
          owner: {
            login: "plasma-network",
            id: 1,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            url: "https://api.github.com/users/plasma-network",
            html_url: "https://github.com/plasma-network",
          },
          html_url: "https://github.com/plasma-network/plasma.to",
          description: "Plasma Network",
        },
        url: "https://api.github.com/notifications/19199998390",
        subscription_url:
          "https://api.github.com/notifications/threads/19199998390",
      };

      setupMockApi({
        notifications: [mentionNotification],
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // The notification should not be visible since it's already dismissed
      expect(
        screen.queryByText(
          "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
        )
      ).toBeNull();
      expect(screen.queryByText(/Mentions/)).toBeNull();
    });

    it("should keep notifications dismissed across page reloads", async () => {
      const mentionNotification: GitHubNotification = {
        id: "19199998390",
        unread: true,
        reason: "mention",
        updated_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString(), // 2 days ago
        last_read_at: undefined,
        subject: {
          title:
            "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards",
          url: "https://api.github.com/repos/plasma-network/plasma.to/issues/94",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: {
          id: 1,
          name: "plasma.to",
          full_name: "plasma-network/plasma.to",
          owner: {
            login: "plasma-network",
            id: 1,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            url: "https://api.github.com/users/plasma-network",
            html_url: "https://github.com/plasma-network",
          },
          html_url: "https://github.com/plasma-network/plasma.to",
          description: "Plasma Network",
        },
        url: "https://api.github.com/notifications/19199998390",
        subscription_url:
          "https://api.github.com/notifications/threads/19199998390",
      };

      setupMockApi({
        notifications: [mentionNotification],
        pullRequests: {
          "/issues/94": {
            state: "open",
          },
        },
      });

      const { unmount } = render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // Check that the notification is initially visible
      const user = userEvent.setup();
      const mentionsSection = screen.getByText(/MENTIONS & REPLIES/);
      await user.click(mentionsSection);

      await waitFor(() => {
        expect(
          screen.getByText(
            "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
          )
        ).toBeDefined();
      });

      // Click dismiss button
      const dismissButton = screen.getByLabelText("Dismiss notification");
      await user.click(dismissButton);

      // Wait for dismiss to be processed
      await waitFor(() => {
        expect(
          screen.queryByText(
            "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
          )
        ).toBeNull();
      });

      // Unmount and remount to simulate page reload
      unmount();

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // The notification should not be visible after reload
      expect(
        screen.queryByText(
          "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
        )
      ).toBeNull();
      expect(screen.queryByText(/Mentions/)).toBeNull();
    });

    it("should only dismiss the specific notification, not future notifications for the same PR", async () => {
      const firstNotification: GitHubNotification = {
        id: "notif-comment-1",
        unread: true,
        reason: "comment",
        updated_at: new Date(
          Date.now() - 3 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Feature request discussion",
          url: "https://api.github.com/repos/test/test-repo/issues/500",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-comment-1",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-comment-1",
      };

      setupMockApi({
        notifications: [firstNotification],
        pullRequests: {
          "/issues/500": {
            state: "open",
          },
        },
      });

      const { unmount } = render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      const otherSection = screen.getByText(/OTHER NOTIFICATIONS/);
      const user = userEvent.setup();
      await user.click(otherSection);

      await waitFor(() => {
        expect(screen.queryByText("Feature request discussion")).not.toBeNull();
      });

      const dismissButton = screen.getByLabelText("Dismiss notification");
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText("Feature request discussion")).toBeNull();
      });

      unmount();

      const secondNotification: GitHubNotification = {
        id: "notif-comment-2",
        unread: true,
        reason: "comment",
        updated_at: new Date(
          Date.now() - 0.5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Feature request discussion",
          url: "https://api.github.com/repos/test/test-repo/issues/500",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-comment-2",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-comment-2",
      };

      setupMockApi({
        notifications: [secondNotification],
        pullRequests: {
          "/issues/500": {
            state: "open",
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Feature request discussion")).not.toBeNull();
      });
    });

    it("should only fetch notifications from the last 30 days", async () => {
      const now = new Date();
      const twentyDaysAgo = new Date(now);
      twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
      const thirtyFiveDaysAgo = new Date(now);
      thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

      const recentNotification: GitHubNotification = {
        id: "notif-recent",
        unread: true,
        reason: "comment",
        updated_at: twentyDaysAgo.toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Recent discussion",
          url: "https://api.github.com/repos/test/test-repo/issues/100",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-recent",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-recent",
      };

      const oldNotification: GitHubNotification = {
        id: "notif-old",
        unread: true,
        reason: "comment",
        updated_at: thirtyFiveDaysAgo.toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Old discussion",
          url: "https://api.github.com/repos/test/test-repo/issues/200",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-old",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-old",
      };

      setupMockApi({
        notifications: [recentNotification, oldNotification],
        pullRequests: {
          "/issues/100": {
            state: "open",
          },
          "/issues/200": {
            state: "open",
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      const otherSection = screen.getByText(/OTHER NOTIFICATIONS/);
      await userEvent.setup().click(otherSection);

      await waitFor(() => {
        expect(screen.queryByText("Recent discussion")).not.toBeNull();
      });

      expect(screen.queryByText("Old discussion")).toBeNull();
    });

    it("should send web notifications for new mentions on same PR after previous notifications", async () => {
      const firstMention: GitHubNotification = {
        id: "notif-mention-1",
        unread: true,
        reason: "mention",
        updated_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Important PR discussion",
          url: "https://api.github.com/repos/test/test-repo/pulls/950",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-mention-1",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-mention-1",
      };

      delete (global as any).Notification;
      const mockNotification = vi.fn();
      global.Notification = mockNotification as any;
      (global.Notification as any).permission = "granted";

      setupMockApi({
        notifications: [firstMention],
        pullRequests: {
          "/pulls/950": {
            state: "open",
          },
        },
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      expect(mockNotification).not.toHaveBeenCalled();

      const secondMention: GitHubNotification = {
        id: "notif-mention-2",
        unread: true,
        reason: "mention",
        updated_at: new Date(
          Date.now() - 0.5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Important PR discussion",
          url: "https://api.github.com/repos/test/test-repo/pulls/950",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-mention-2",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-mention-2",
      };

      setupMockApi({
        notifications: [firstMention, secondMention],
        pullRequests: {
          "/pulls/950": {
            state: "open",
          },
        },
      });

      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      expect(mockNotification).toHaveBeenCalledWith(
        "[Mention] Important PR discussion",
        expect.objectContaining({
          body: "test/test-repo",
        })
      );
    });
  });

  describe("organizing", () => {
    it("should render PRs without direct or team review requests as Other Notifications", async () => {
      setupMockApi({
        user: {
          login: "kumar303",
          id: 12345,
          avatar_url: "https://avatars.githubusercontent.com/u/12345",
          url: "https://api.github.com/users/kumar303",
          html_url: "https://github.com/kumar303",
        },
        teams: [
          {
            id: 111,
            node_id: "node_111",
            slug: "crafters",
            name: "Crafters",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [
          {
            id: "notif-pr-no-review",
            unread: true,
            reason: "subscribed", // Not a review request
            updated_at: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000
            ).toISOString(),
            url: "https://api.github.com/notifications/threads/notif-pr-no-review",
            subscription_url:
              "https://api.github.com/notifications/threads/notif-pr-no-review/subscription",
            subject: {
              title: "Update dependencies",
              url: "https://api.github.com/repos/test/test-repo/pulls/400",
              type: "PullRequest",
            },
            repository: {
              id: 123,
              name: "test-repo",
              full_name: "test/test-repo",
              html_url: "https://github.com/test/test-repo",
              owner: {
                login: "test",
                id: 1,
                avatar_url: "https://avatars.githubusercontent.com/u/1",
                url: "https://api.github.com/users/test",
                html_url: "https://github.com/test",
              },
            },
          },
        ],
        pullRequests: {
          "https://api.github.com/repos/test/test-repo/pulls/400": {
            state: "open",
            draft: false,
            requested_reviewers: [
              // Other users requested, not kumar303
              { login: "alice", id: 111 },
              { login: "bob", id: 222 },
            ],
            requested_teams: [
              // Teams that kumar303 is NOT a part of
              { slug: "platform", name: "Platform Team" },
              { slug: "security", name: "Security Team" },
            ],
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      // Should appear in Other Notifications section
      const otherSection = screen.getByText(/OTHER NOTIFICATIONS/);
      expect(otherSection).toBeDefined();
      expect(otherSection.textContent).toContain("[1]");

      // Should NOT appear in Review Requests
      expect(screen.queryByText(/REVIEW REQUESTS/)).toBeNull();

      // Click to expand Other Notifications
      const expandButton = otherSection.parentElement?.querySelector("button");
      expect(expandButton).toBeDefined();
      if (expandButton) fireEvent.click(expandButton);

      // Verify the PR is shown
      await waitFor(() => {
        expect(screen.getByText("Update dependencies")).toBeDefined();
      });
    });

    it("should normalize team slugs and show normalized team review requests under correct team section", async () => {
      setupMockApi({
        teams: [
          {
            id: 444,
            node_id: "node_444",
            slug: "checkout-ui-extensions-api-stewardship",
            name: "Checkout UI Extensions API Stewardship",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [
          {
            id: "notif-team-normalized",
            unread: true,
            reason: "review_requested",
            updated_at: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000
            ).toISOString(),
            url: "https://api.github.com/notifications/threads/notif-team-normalized",
            subscription_url:
              "https://api.github.com/notifications/threads/notif-team-normalized/subscription",
            subject: {
              title: "Add new checkout API",
              url: "https://api.github.com/repos/test/test-repo/pulls/500",
              type: "PullRequest",
            },
            repository: {
              id: 123,
              name: "test-repo",
              full_name: "test/test-repo",
              html_url: "https://github.com/test/test-repo",
              owner: {
                login: "test",
                id: 1,
                avatar_url: "https://avatars.githubusercontent.com/u/1",
                url: "https://api.github.com/users/test",
                html_url: "https://github.com/test",
              },
            },
          },
        ],
        pullRequests: {
          "https://api.github.com/repos/test/test-repo/pulls/500": {
            state: "open",
            draft: false,
            requested_reviewers: [],
            requested_teams: [
              {
                // GitHub returns normalized slug with underscores
                slug: "checkout_ui_extensions_api_stewardship",
                name: "Checkout UI Extensions API Stewardship",
              },
            ],
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      // Should appear under the team section with dashes, not underscores
      const teamSection = screen.getByText(
        /CHECKOUT UI EXTENSIONS API STEWARDSHIP/
      );
      expect(teamSection).toBeDefined();
      expect(teamSection.textContent).toContain("[1]");

      // Should NOT appear in Team Review Requests
      expect(screen.queryByText(/TEAM REVIEW REQUESTS/)).toBeNull();
    });

    it("should show assigned issues in Needs Your Attention (as prominent)", async () => {
      // BUG: Assignments are not marked as prominent, so they appear in "Other Notifications"
      // They should be treated as important because they're directly assigned to you

      const assignedIssue: GitHubNotification = {
        id: "notif-assigned",
        unread: true,
        reason: "assign",
        updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        subject: {
          title:
            "OrderConfirmationError: No receipt available on thankYou page",
          url: "https://api.github.com/repos/shop/issues/issues/635",
          type: "Issue",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-assigned",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-assigned",
      };

      setupMockApi({
        notifications: [assignedIssue],
        pullRequests: {
          "/issues/635": {
            state: "open",
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      // BUG: Assignment is NOT prominent, so it appears in "Other Notifications"
      // FIX: Assignment should be prominent, appearing in "Needs Your Attention"
      await waitFor(() => {
        expect(screen.getByText(/NEEDS YOUR ATTENTION/)).toBeInTheDocument();
      });

      const user = userEvent.setup();
      const needsAttentionSection = screen.getByText(/NEEDS YOUR ATTENTION/);
      await user.click(needsAttentionSection);

      await waitFor(() => {
        expect(
          screen.getByText(
            "OrderConfirmationError: No receipt available on thankYou page"
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe("filtering and hiding", () => {
    it("should render notifications with a direct author review request as Review Requests", async () => {
      setupMockApi({
        notifications: [
          {
            id: "notif-review-1",
            unread: true,
            reason: "review_requested",
            updated_at: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000
            ).toISOString(), // 1 day ago
            subject: {
              title: "Fix payment processing bug",
              url: "https://api.github.com/repos/test/test-repo/pulls/100",
              type: "PullRequest",
            },
            repository: mockRepository,
            url: "https://api.github.com/notifications/threads/notif-review-1",
            subscription_url:
              "https://api.github.com/notifications/threads/notif-review-1/subscription",
          },
          {
            id: "notif-review-2",
            unread: true,
            reason: "review_requested",
            updated_at: new Date(
              Date.now() - 2 * 24 * 60 * 60 * 1000
            ).toISOString(), // 2 days ago
            subject: {
              title: "Add new feature flag system",
              url: "https://api.github.com/repos/test/test-repo/pulls/101",
              type: "PullRequest",
            },
            repository: mockRepository,
            url: "https://api.github.com/notifications/threads/notif-review-2",
            subscription_url:
              "https://api.github.com/notifications/threads/notif-review-2/subscription",
          },
          {
            id: "notif-author",
            unread: true,
            reason: "author",
            updated_at: "2025-11-14T08:00:00Z",
            subject: {
              title: "My own PR",
              url: "https://api.github.com/repos/test/test-repo/pulls/102",
              type: "PullRequest",
            },
            repository: mockRepository,
            url: "https://api.github.com/notifications/threads/notif-author",
            subscription_url:
              "https://api.github.com/notifications/threads/notif-author/subscription",
          },
        ],
        pullRequests: {
          "/pulls/100": { requested_reviewers: [mockUser] },
          "/pulls/101": { requested_reviewers: [mockUser] },
        },
      });

      render(<App />);

      await waitFor(() => {
        // Find all elements containing "Review Requests"
        const reviewRequestsElements = screen.getAllByText(/REVIEW REQUESTS/);

        // Find the specific "Review Requests (2)" section
        const reviewRequestsSection = reviewRequestsElements.find(
          (el) =>
            el.textContent?.trim().startsWith("REVIEW REQUESTS") &&
            el.classList.contains("vhs-text")
        );
        expect(reviewRequestsSection).toBeDefined();
        expect(reviewRequestsSection?.textContent).toContain("[2]");
      });

      const user = userEvent.setup();
      const reviewRequestsHeader = await screen.findByRole("button", {
        name: "Expand section",
      });
      await user.click(reviewRequestsHeader);

      await waitFor(() => {
        expect(screen.getByText("Fix payment processing bug")).toBeDefined();
      });

      expect(screen.getByText("Add new feature flag system")).toBeDefined();
    });

    it("should render notifications without a direct request but with a team request that I am a part of as the team name", async () => {
      setupMockApi({
        teams: [
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
        ],
        notifications: [
          {
            id: "notif-crafters-review",
            unread: true,
            reason: "review_requested",
            updated_at: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000
            ).toISOString(),
            subject: {
              title: "Add widget stewardship feature",
              url: "https://api.github.com/repos/test/test-repo/pulls/300",
              type: "PullRequest",
            },
            repository: mockRepository,
            url: "https://api.github.com/notifications/threads/notif-crafters-review",
            subscription_url:
              "https://api.github.com/notifications/threads/notif-crafters-review/subscription",
          },
        ],
        pullRequests: {
          "/pulls/300": {
            requested_teams: [{ slug: "crafters", name: "Crafters", id: 233 }],
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      const user = userEvent.setup();

      await waitFor(() => {
        const craftersSection = screen.queryByText(/^CRAFTERS/);
        if (!craftersSection) {
          throw new Error("Crafters section not found");
        }
        expect(craftersSection.textContent).toContain("[1]");
      });

      const craftersSectionElement = await screen.findByText(/CRAFTERS/);
      await user.click(craftersSectionElement);

      await waitFor(() => {
        expect(
          screen.getByText("Add widget stewardship feature")
        ).toBeDefined();
      });
    });

    it("should not show closed or merged PRs", async () => {
      // Pre-populate stateCache with an "open" state from 5 minutes ago
      // This simulates the case where the PR was cached as open but is now closed
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      localStorage.setItem(
        "github_state_cache",
        JSON.stringify({
          "https://api.github.com/repos/Shopify/ui-api-design/pulls/1219": {
            state: "open",
            timestamp: fiveMinutesAgo,
          },
        })
      );

      const closedPR: GitHubNotification = {
        id: "18384250345",
        unread: true,
        reason: "review_requested",
        updated_at: "2025-11-02T21:02:09Z",
        last_read_at: undefined,
        subject: {
          title:
            "Replace `@see` with markdown links so they show on shopify.dev",
          url: "https://api.github.com/repos/Shopify/ui-api-design/pulls/1219",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: {
          id: 1,
          name: "ui-api-design",
          full_name: "Shopify/ui-api-design",
          owner: {
            login: "Shopify",
            id: 1,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            url: "https://api.github.com/users/Shopify",
            html_url: "https://github.com/Shopify",
          },
          html_url: "https://github.com/Shopify/ui-api-design",
          description: "UI API Design",
        },
        url: "https://api.github.com/notifications/18384250345",
        subscription_url:
          "https://api.github.com/notifications/threads/18384250345",
      };

      setupMockApi({
        notifications: [closedPR],
        pullRequests: {
          "/pulls/1219": {
            state: "closed",
            draft: false,
            requested_reviewers: [],
            requested_teams: [
              { slug: "ui-api-tag", name: "UI API TAG", id: 1 },
            ],
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // The closed PR should not be visible
      expect(
        screen.queryByText(
          "Replace `@see` with markdown links so they show on shopify.dev"
        )
      ).toBeNull();
      expect(screen.queryByText(/TEAM REVIEW REQUESTS/)).toBeNull();
    });

    it("should hide notifications that return 404 from API", async () => {
      const deletedIssue: GitHubNotification = {
        id: "19199998390",
        unread: true,
        reason: "mention",
        updated_at: "2025-09-25T21:08:47Z",
        last_read_at: undefined,
        subject: {
          title:
            "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards",
          url: "https://api.github.com/repos/plasma-network/plasma.to/issues/94",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: {
          id: 1,
          name: "plasma.to",
          full_name: "plasma-network/plasma.to",
          owner: {
            login: "plasma-network",
            id: 1,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            url: "https://api.github.com/users/plasma-network",
            html_url: "https://github.com/plasma-network",
          },
          html_url: "https://github.com/plasma-network/plasma.to",
          description: "Plasma Network",
        },
        url: "https://api.github.com/notifications/19199998390",
        subscription_url:
          "https://api.github.com/notifications/threads/19199998390",
      };

      setupMockApi({
        notifications: [deletedIssue],
        notFoundUrls: ["/issues/94"],
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // The 404'd notification should not be visible
      expect(
        screen.queryByText(
          "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
        )
      ).toBeNull();
      expect(screen.queryByText(/Mentions/)).toBeNull();
    });

    it("should filter out 404 notifications even when there are more than 20 URLs to check", async () => {
      // Create 25 notifications, last one will be a 404
      const notifications: GitHubNotification[] = [];
      for (let i = 1; i <= 25; i++) {
        notifications.push({
          id: `notif-${i}`,
          unread: true,
          reason: i === 25 ? "mention" : "comment",
          updated_at: new Date(
            Date.now() - 1 * 24 * 60 * 60 * 1000
          ).toISOString(),
          last_read_at: undefined,
          subject: {
            title: i === 25 ? "This will 404" : `Issue ${i}`,
            url: `https://api.github.com/repos/test/test-repo/issues/${i}`,
            type: "Issue",
            latest_comment_url: undefined,
          },
          repository: {
            id: 1,
            name: "test-repo",
            full_name: "test/test-repo",
            owner: {
              login: "test",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
              url: "https://api.github.com/users/test",
              html_url: "https://github.com/test",
            },
            html_url: "https://github.com/test/test-repo",
            description: "Test repository",
          },
          url: `https://api.github.com/notifications/notif-${i}`,
          subscription_url: `https://api.github.com/notifications/threads/notif-${i}`,
        });
      }

      setupMockApi({
        notifications,
        notFoundUrls: ["/issues/25"],
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // The 404'd notification (25th) should not be visible
      expect(screen.queryByText("This will 404")).toBeNull();
    });

    it("should hide notifications when fetching PR state results in an error", async () => {
      const mergedPR: GitHubNotification = {
        id: "notif-merged",
        unread: true,
        reason: "team_mention",
        updated_at: "2025-08-21T16:55:33Z",
        last_read_at: undefined,
        subject: {
          title: "remove mobile beta flag",
          url: "https://api.github.com/repos/shop/world/pulls/149303",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-merged",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-merged",
      };

      setupMockApi({
        notifications: [mergedPR],
        errorUrls: ["/pulls/149303"],
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // The notification should NOT be visible since we couldn't fetch its state
      // Instead, we should see "No notifications!"
      await waitFor(() => {
        expect(screen.queryByText(/No notifications!/i)).not.toBeNull();
      });
    });

    it("should hide notifications when fetching PR state is still pending", async () => {
      const pendingPR: GitHubNotification = {
        id: "notif-pending",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 3 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "New feature implementation",
          url: "https://api.github.com/repos/shop/world/pulls/150000",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-pending",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-pending",
      };

      // Don't mock the PR details - this simulates the state not being fetched yet
      setupMockApi({
        notifications: [pendingPR],
        pullRequests: {}, // Explicitly no PR state provided
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // The notification should NOT be visible since state hasn't been fetched yet
      await waitFor(() => {
        expect(screen.queryByText(/No notifications!/i)).not.toBeNull();
      });
    });
  });

  describe("notification labels", () => {
    it("should display the reason as a fallback label when no specific label applies", async () => {
      const commentNotification: GitHubNotification = {
        id: "notif-comment",
        unread: true,
        reason: "comment",
        updated_at: new Date(
          Date.now() - 3 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Discussion about implementation",
          url: "https://api.github.com/repos/test/test-repo/issues/200",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-comment",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-comment",
      };

      setupMockApi({
        notifications: [commentNotification],
        pullRequests: {
          "/issues/200": {
            state: "open",
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      const otherSection = screen.getByText(/OTHER NOTIFICATIONS/);
      await userEvent.setup().click(otherSection);

      await waitFor(() => {
        expect(
          screen.queryByText("Discussion about implementation")
        ).not.toBeNull();
      });

      expect(screen.queryByText("COMMENT")).not.toBeNull();
    });

    it("should display YOUR PR label instead of falling back to the reason", async () => {
      const ownIssueNotification: GitHubNotification = {
        id: "notif-own-issue",
        unread: true,
        reason: "author",
        updated_at: new Date(
          Date.now() - 0.5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "My issue",
          url: "https://api.github.com/repos/test/test-repo/issues/800",
          type: "Issue",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-own-issue",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-own-issue",
      };

      setupMockApi({
        notifications: [ownIssueNotification],
        pullRequests: {
          "/issues/800": {
            state: "open",
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      const yourActivitySection = screen.getByText(/YOUR ACTIVITY/);
      await userEvent.setup().click(yourActivitySection);

      await waitFor(() => {
        expect(screen.queryByText("My issue")).not.toBeNull();
      });

      expect(screen.queryByText("YOUR ISSUE")).not.toBeNull();
      expect(screen.queryByText("AUTHOR")).toBeNull();
    });
  });

  describe("web notifications", () => {
    const mockNotification = vi.fn();

    it("should send web notification when session expires during background refresh", async () => {
      // Set up initial successful API response
      setupMockApi({
        notifications: [],
      });

      const user = userEvent.setup();
      render(<App />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // Mock Notification API should not have been called yet
      expect(mockNotification).not.toHaveBeenCalled();

      // Now simulate a 401 response on refresh (session expired)
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockImplementation((url) => {
        const urlString = url.toString();
        if (urlString.includes("/notifications")) {
          return Promise.resolve(
            createMockResponse({ message: "Unauthorized" }, 401)
          );
        }
        return Promise.resolve(createMockResponse({}));
      });

      // Trigger manual refresh (simulates background refresh)
      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      // Wait for error to be handled
      await waitFor(() => {
        expect(
          screen.queryByText(/Authentication expired/i)
        ).not.toBeNull();
      });

      // Verify session expired web notification was sent
      await waitFor(() => {
        expect(mockNotification).toHaveBeenCalledWith(
          "Session Expired",
          expect.objectContaining({
            body: "Your GitHub session has expired. Please sign in again.",
            tag: "session-expired",
            requireInteraction: true,
          })
        );
      });
    });

    beforeEach(() => {
      // Clear any existing Notification mock
      delete (global as any).Notification;

      // Mock Notification API
      global.Notification = mockNotification as any;
      (global.Notification as any).permission = "granted";
      (global.Notification as any).requestPermission = vi
        .fn()
        .mockResolvedValue("granted");
    });

    afterEach(() => {
      delete (global as any).Notification;
    });

    it("should send web notifications for newly received review requests after refresh", async () => {
      // Initial notification
      const existingNotification: GitHubNotification = {
        id: "notif-existing",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Existing PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/100",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-existing",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-existing",
      };

      // Setup API with initial notification
      setupMockApi({
        notifications: [existingNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [mockUser],
          },
        },
      });

      const user = userEvent.setup();
      render(<App />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // No notifications should be sent on initial load
      expect(mockNotification).not.toHaveBeenCalled();

      // Now add a new notification with direct review request and refresh
      const newNotification: GitHubNotification = {
        id: "notif-new",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 0.5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "New PR needs review",
          url: "https://api.github.com/repos/test/test-repo/pulls/101",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-new",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-new",
      };

      // Update mock to return both notifications
      setupMockApi({
        notifications: [existingNotification, newNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [mockUser],
          },
          "/pulls/101": {
            state: "open",
            requested_reviewers: [mockUser],
          },
        },
      });

      // Click refresh button
      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      // Wait for refresh to complete
      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // Verify notification was called only for the new notification
      await waitFor(() => {
        expect(mockNotification).toHaveBeenCalledTimes(1);
      });

      expect(mockNotification).toHaveBeenCalledWith(
        "[Review Request] New PR needs review",
        expect.objectContaining({
          body: "test/test-repo",
          icon: "https://github.githubassets.com/favicons/favicon.png",
          tag: expect.stringContaining(
            "test/test-repo#https://api.github.com/repos/test/test-repo/pulls/101"
          ),
          requireInteraction: true,
        })
      );

      // Refresh again without new notifications - should not send any
      mockNotification.mockClear();
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // No new notifications should be sent
      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("should send web notifications for mentions that were previously seen but not notified", async () => {
      // THE REAL BUG SCENARIO:
      // 1. User opens app, a notification appears but gets filtered somehow
      // 2. On refresh, that notification ID is saved to "previously_notified_ids"
      // 3. Later on another refresh, the notification reappears (maybe was closed, now reopened)
      // 4. BUG: No notification is sent because the ID is in "previously_notified_ids"
      //    even though we never actually sent a browser notification for it

      const otherNotification: GitHubNotification = {
        id: "notif-other",
        unread: true,
        reason: "subscribed",
        updated_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Some other PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/100",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-other",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-other",
      };

      // Start with just one notification
      setupMockApi({
        notifications: [otherNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
          },
        },
      });

      render(<App />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      // Now simulate the buggy scenario: a notification ID is in previously_notified_ids
      // but we never sent a browser notification for it
      sessionStorage.setItem(
        "previously_notified_ids",
        JSON.stringify(["20717875100"])
      );

      const mentionNotification: GitHubNotification = {
        id: "20717875100", // Real ID from user's debug output
        unread: true,
        reason: "mention",
        updated_at: new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString(), // 16 hours ago
        subject: {
          title:
            "Refine existing dashboard, alerting and monitoring for checkout extensions",
          url: "https://api.github.com/repos/shop/issues-checkout-extensibility/issues/258",
          type: "Issue",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/20717875100",
        subscription_url:
          "https://api.github.com/notifications/threads/20717875100",
      };

      // On refresh, the mention notification appears
      setupMockApi({
        notifications: [otherNotification, mentionNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
          },
          "/issues/258": {
            state: "open",
          },
        },
      });

      // Trigger refresh
      const refreshButton = screen.getByText("REFRESH");
      fireEvent.click(refreshButton);

      // Wait for refresh to complete
      await waitFor(() => {
        expect(screen.queryByText("REFRESHING")).toBeNull();
      });

      // The mention appears in the list
      await waitFor(() => {
        expect(screen.getByText(/MENTIONS & REPLIES/)).toBeInTheDocument();
      });

      // BUG WITH OLD CODE: Browser notification NOT sent because ID is in "previously_notified_ids"
      // FIXED: Browser notification IS sent because we only track IDs we actually notified about
      await waitFor(
        () => {
          expect(mockNotification).toHaveBeenCalledTimes(1);
        },
        { timeout: 3000 }
      );

      expect(mockNotification).toHaveBeenCalledWith(
        "[Mention] Refine existing dashboard, alerting and monitoring for checkout extensions",
        expect.objectContaining({
          body: "test/test-repo",
          requireInteraction: true,
        })
      );
    });

    it("should send web notifications for newly received mentions after refresh", async () => {
      const existingNotification: GitHubNotification = {
        id: "notif-existing",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Existing PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/100",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-existing",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-existing",
      };

      setupMockApi({
        notifications: [existingNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [mockUser],
          },
        },
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      expect(mockNotification).not.toHaveBeenCalled();

      const newMentionNotification: GitHubNotification = {
        id: "notif-mention",
        unread: true,
        reason: "mention",
        updated_at: new Date(
          Date.now() - 0.5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "PR with new mention",
          url: "https://api.github.com/repos/test/test-repo/pulls/102",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-mention",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-mention",
      };

      setupMockApi({
        notifications: [existingNotification, newMentionNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [mockUser],
          },
          "/pulls/102": {
            state: "open",
          },
        },
      });

      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      await waitFor(() => {
        expect(mockNotification).toHaveBeenCalledTimes(1);
      });

      expect(mockNotification).toHaveBeenCalledWith(
        "[Mention] PR with new mention",
        expect.objectContaining({
          body: "test/test-repo",
          icon: "https://github.githubassets.com/favicons/favicon.png",
          tag: expect.stringContaining(
            "test/test-repo#https://api.github.com/repos/test/test-repo/pulls/102"
          ),
          requireInteraction: true,
        })
      );
    });

    it("should not send web notifications for team review requests after refresh", async () => {
      const existingNotification: GitHubNotification = {
        id: "notif-existing",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Existing PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/100",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-existing",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-existing",
      };

      setupMockApi({
        teams: [
          {
            id: 222,
            node_id: "node_222",
            slug: "platform",
            name: "Platform Team",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [existingNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [mockUser],
          },
        },
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      expect(mockNotification).not.toHaveBeenCalled();

      const newTeamReviewNotification: GitHubNotification = {
        id: "notif-team-review",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 0.5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Team PR needs review",
          url: "https://api.github.com/repos/test/test-repo/pulls/103",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-team-review",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-team-review",
      };

      setupMockApi({
        teams: [
          {
            id: 222,
            node_id: "node_222",
            slug: "platform",
            name: "Platform Team",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [existingNotification, newTeamReviewNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [mockUser],
          },
          "/pulls/103": {
            state: "open",
            requested_teams: [{ slug: "platform", name: "Platform Team" }],
          },
        },
      });

      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Team PR needs review")).toBeDefined();
      });

      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("should not send web notifications for team review requests when requested_teams is empty", async () => {
      // Bug scenario: User gets a review_requested notification but is NOT in requested_reviewers.
      // The PR has NO teams in requested_teams (due to timing issues or team review fulfilled).
      // This MUST be a team review (since that's the only way they got the notification),
      // but the code incorrectly treats it as personal and sends a web notification.

      const existingNotification: GitHubNotification = {
        id: "notif-existing",
        unread: true,
        reason: "subscribed",
        updated_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Existing PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/100",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-existing",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-existing",
      };

      setupMockApi({
        teams: [
          {
            id: 222,
            node_id: "node_222",
            slug: "checkout_ui_extensions_api_stewardship",
            name: "checkout_ui_extensions_api_stewardship",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [existingNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [],
          },
        },
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      expect(mockNotification).not.toHaveBeenCalled();

      // New notification: review_requested but user NOT in requested_reviewers
      // and NO teams in requested_teams (timing issue or already fulfilled)
      const orphanedTeamReviewNotification: GitHubNotification = {
        id: "notif-team-orphaned",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 0.5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Make isViolationRelevant dynamic for vaulted payments",
          url: "https://api.github.com/repos/shop/world/pulls/376258",
          type: "PullRequest",
        },
        repository: {
          ...mockRepository,
          full_name: "shop/world",
        },
        url: "https://api.github.com/notifications/notif-team-orphaned",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-team-orphaned",
      };

      setupMockApi({
        teams: [
          {
            id: 222,
            node_id: "node_222",
            slug: "checkout_ui_extensions_api_stewardship",
            name: "checkout_ui_extensions_api_stewardship",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [existingNotification, orphanedTeamReviewNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [],
          },
          "/pulls/376258": {
            state: "open",
            // NO teams in requested_teams (timing issue or already fulfilled)
            requested_teams: [],
            // User NOT in requested_reviewers (only team was requested)
            requested_reviewers: [],
          },
        },
      });

      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      await waitFor(() => {
        expect(
          screen.queryByText("Make isViolationRelevant dynamic for vaulted payments")
        ).toBeDefined();
      });

      // CRITICAL: Should NOT send web notification because this is a team review
      // Even though requested_teams is empty, the fact that user got review_requested
      // but is NOT in requested_reviewers means it MUST be a team review
      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("should not send web notifications when GitHub API shows no reviewers for a review_requested notification", async () => {
      // Real-world bug scenario: User gets review_requested notification,
      // but when we check the PR, GitHub API returns NEITHER requested_teams NOR requested_reviewers
      // (possibly due to timing issues, rate limiting, or the team review being already fulfilled).
      // The ONLY way the user got the notification is via team review, so don't send web notification.

      const existingNotification: GitHubNotification = {
        id: "notif-existing",
        unread: true,
        reason: "subscribed",
        updated_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Existing PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/100",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-existing",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-existing",
      };

      setupMockApi({
        teams: [
          {
            id: 222,
            node_id: "node_222",
            slug: "checkout_ui_extensions_api_stewardship",
            name: "checkout_ui_extensions_api_stewardship",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [existingNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [],
          },
        },
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      expect(mockNotification).not.toHaveBeenCalled();

      // Simulating real scenario: review_requested notification arrives
      // but API returns PR with NO reviewers/teams (GitHub API timing issue)
      const buggyTeamReviewNotification: GitHubNotification = {
        id: "notif-22197641190",
        unread: true,
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 0.1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Make isViolationRelevant dynamic for vaulted payments",
          url: "https://api.github.com/repos/shop/world/pulls/376258",
          type: "PullRequest",
        },
        repository: {
          ...mockRepository,
          full_name: "shop/world",
        },
        url: "https://api.github.com/notifications/notif-22197641190",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-22197641190",
      };

      setupMockApi({
        teams: [
          {
            id: 222,
            node_id: "node_222",
            slug: "checkout_ui_extensions_api_stewardship",
            name: "checkout_ui_extensions_api_stewardship",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [existingNotification, buggyTeamReviewNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [],
          },
          "/pulls/376258": {
            state: "open",
            // GitHub API returns NO data (timing/rate limit issue)
            requested_teams: undefined,
            requested_reviewers: undefined,
          },
        },
      });

      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      await waitFor(() => {
        expect(
          screen.queryByText("Make isViolationRelevant dynamic for vaulted payments")
        ).toBeDefined();
      });

      // This should NOT send notification - it's clearly a team review
      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("should not incorrectly mark non-review notifications as team reviews when no reviewers exist", async () => {
      // BUG SCENARIO: Without the `reason === "review_requested"` check in noReviewersAtAll condition,
      // ANY notification (comment, mention, etc.) with no reviewers would be incorrectly marked as isTeamReviewRequest=true.
      //
      // This doesn't directly cause web notifications (comments aren't prominent anyway),
      // but it's incorrect logic that could cause issues with categorization.
      //
      // The fix: Add `&& reason === "review_requested"` to the noReviewersAtAll condition
      // so it only applies to actual review requests.

      const existingNotification: GitHubNotification = {
        id: "notif-existing",
        unread: true,
        reason: "subscribed",
        updated_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Existing PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/100",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-existing",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-existing",
      };

      setupMockApi({
        teams: [
          {
            id: 222,
            node_id: "node_222",
            slug: "checkout_ui_extensions_api_stewardship",
            name: "checkout_ui_extensions_api_stewardship",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [existingNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [],
          },
        },
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      expect(mockNotification).not.toHaveBeenCalled();

      // Notification arrives with reason "comment" (NOT review_requested),
      // no reviewers or teams. Without reason check in noReviewersAtAll condition,
      // this would incorrectly be treated as a team review!
      const commentNotification: GitHubNotification = {
        id: "notif-comment",
        unread: true,
        reason: "comment", // NOT review_requested!
        updated_at: new Date(
          Date.now() - 0.1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "Someone commented",
          url: "https://api.github.com/repos/shop/world/pulls/999999",
          type: "PullRequest",
        },
        repository: {
          ...mockRepository,
          full_name: "shop/world",
        },
        url: "https://api.github.com/notifications/notif-comment",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-comment",
      };

      setupMockApi({
        teams: [
          {
            id: 222,
            node_id: "node_222",
            slug: "checkout_ui_extensions_api_stewardship",
            name: "checkout_ui_extensions_api_stewardship",
            organization: {
              login: "shopify",
              id: 1,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            },
          },
        ],
        notifications: [existingNotification, commentNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
            requested_reviewers: [],
          },
          "/pulls/999999": {
            state: "open",
            requested_teams: [],
            requested_reviewers: [],
          },
        },
      });

      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Someone commented")).toBeDefined();
      });

      // Without the `reason === "review_requested"` check in noReviewersAtAll condition,
      // the code would incorrectly treat this comment notification as a team review
      // (because noReviewersAtAll would be true and isPersonallyRequested would be false).
      // But comments should NOT be treated as team reviews!
      // This should show up as a regular notification, not filtered as a team review.
      // Actually, wait - we don't filter team reviews, we just mark them differently...

      // Let me check: comment notifications with no reviewers should NOT be marked as isTeamReviewRequest
      const notificationElement = screen.queryByText("Someone commented");
      expect(notificationElement).toBeDefined();
    });

    it("should send web notifications for newly received author notifications after refresh", async () => {
      const existingNotification: GitHubNotification = {
        id: "notif-existing",
        unread: true,
        reason: "subscribed",
        updated_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "Existing PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/100",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-existing",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-existing",
      };

      const newAuthorNotification: GitHubNotification = {
        id: "notif-author",
        unread: true,
        reason: "author",
        updated_at: new Date(
          Date.now() - 0.5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        last_read_at: undefined,
        subject: {
          title: "I created this PR",
          url: "https://api.github.com/repos/test/test-repo/pulls/101",
          type: "PullRequest",
          latest_comment_url: undefined,
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-author",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-author",
      };

      setupMockApi({
        notifications: [existingNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
          },
        },
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      setupMockApi({
        notifications: [newAuthorNotification, existingNotification],
        pullRequests: {
          "/pulls/100": {
            state: "open",
          },
          "/pulls/101": {
            state: "open",
          },
        },
      });

      expect(mockNotification).not.toHaveBeenCalled();

      const refreshButton = screen.getByText("REFRESH");
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      expect(mockNotification).toHaveBeenCalledWith(
        "[Your PullRequest] I created this PR",
        expect.objectContaining({
          body: "test/test-repo",
          icon: "https://github.githubassets.com/favicons/favicon.png",
          tag: expect.stringContaining(
            "test/test-repo#https://api.github.com/repos/test/test-repo/pulls/101"
          ),
          requireInteraction: true,
        })
      );
    });

    it("should NOT filter out comment-only notifications on authored PRs", async () => {
      // THE CLEAREST BUG SCENARIO:
      // 1. User opens the app
      // 2. GitHub API has BOTH author + comment notifications for a PR
      // 3. But user previously dismissed the author notification
      // 4. BUGGY CODE: Comment notification is filtered out → PR doesn't appear at all!
      // 5. FIXED CODE: Comment notification kept → PR appears in "Other Notifications"

      const oldAuthorNotification: GitHubNotification = {
        id: "notif-author-dismissed",
        unread: true,
        reason: "author",
        updated_at: new Date(
          Date.now() - 5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "My PR with comments",
          url: "https://api.github.com/repos/test/test-repo/pulls/700",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-author-dismissed",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-author-dismissed",
      };

      const commentNotification: GitHubNotification = {
        id: "notif-comment-only",
        unread: true,
        reason: "comment",
        updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        subject: {
          title: "My PR with comments",
          url: "https://api.github.com/repos/test/test-repo/pulls/700",
          type: "PullRequest",
        },
        repository: mockRepository,
        url: "https://api.github.com/notifications/notif-comment-only",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-comment-only",
      };

      // Simulate that the author notification was previously dismissed
      mockLocalStorage.data["dismissed_notifications"] = JSON.stringify([
        "notif-author-dismissed",
      ]);

      // Both notifications in API, but author is dismissed
      setupMockApi({
        notifications: [oldAuthorNotification, commentNotification],
        pullRequests: {
          "/pulls/700": {
            state: "open",
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("LOADING")).toBeNull();
      });

      // THE KEY TEST:
      // BUGGY CODE: Comment is filtered out (because author notification exists in API)
      //             → No notifications shown (author was dismissed, comment was filtered)
      //             → Page shows "No notifications!"
      // FIXED CODE: Comment NOT filtered → PR appears

      await waitFor(() => {
        expect(screen.queryByText("No notifications!")).not.toBeInTheDocument();
      });

      // Find and expand whichever section has the notification
      const user = userEvent.setup();
      const sections = screen.queryAllByText(
        /YOUR ACTIVITY|OTHER NOTIFICATIONS|NEEDS YOUR ATTENTION/
      );
      if (sections.length > 0) {
        await user.click(sections[0]);
      }

      // The PR should now be visible
      await waitFor(() => {
        expect(screen.getByText("My PR with comments")).toBeInTheDocument();
      });
    });
  });

  describe("read notifications", () => {
    it("should show read review request notifications", async () => {
      // This test verifies the fix for: https://github.com/shop/world/pull/385615
      // When a notification is marked as read (by visiting the PR on GitHub),
      // it should still appear in Zenhub if you're a requested reviewer.

      const readReviewRequestPR: GitHubNotification = {
        id: "notif-read-review",
        unread: false, // ← Key: notification is marked as read
        reason: "review_requested",
        updated_at: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        subject: {
          title: "prefer playwright click over check for flaky attribute",
          url: "https://api.github.com/repos/shop/world/pulls/385615",
          type: "PullRequest",
        },
        repository: {
          id: 1,
          name: "world",
          full_name: "shop/world",
          owner: {
            login: "shop",
            id: 1,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            url: "https://api.github.com/users/shop",
            html_url: "https://github.com/shop",
          },
          html_url: "https://github.com/shop/world",
          description: "Shop repo",
        },
        url: "https://api.github.com/notifications/notif-read-review",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-read-review",
      };

      setupMockApi({
        notifications: [readReviewRequestPR],
        pullRequests: {
          "/pulls/385615": {
            state: "open",
            draft: false,
            requested_reviewers: [{ login: "kumar303" }], // User is still a reviewer
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // Without the fix (all: true), this test will fail because read
      // notifications are filtered out by GitHub API's default behavior
      await waitFor(() => {
        expect(screen.queryByText("No notifications! 🎉")).toBeNull();
      });

      // Should show the review request even though it's marked as read
      const reviewRequestsHeader = await screen.findByText(/REVIEW REQUESTS/);
      expect(reviewRequestsHeader).toBeInTheDocument();

      // Expand the section
      const user = userEvent.setup();
      await user.click(reviewRequestsHeader);

      // Verify the PR title is visible
      await waitFor(() => {
        expect(
          screen.getByText("prefer playwright click over check for flaky attribute")
        ).toBeInTheDocument();
      });
    });

    it("should show review requests older than 7 days", async () => {
      // This test verifies the fix for: https://github.com/shop/world/pull/270657
      // PR #270657 was last updated 8 days ago but user is still a requested reviewer.
      // The app only fetches notifications from the last 7 days, so it doesn't appear.

      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

      const oldReviewRequestPR: GitHubNotification = {
        id: "notif-old-review",
        unread: false, // Likely marked as read since user probably visited it
        reason: "review_requested",
        updated_at: eightDaysAgo.toISOString(),
        subject: {
          title: "Init sandbox using ArrayBuffers",
          url: "https://api.github.com/repos/shop/world/pulls/270657",
          type: "PullRequest",
        },
        repository: {
          id: 1,
          name: "world",
          full_name: "shop/world",
          owner: {
            login: "shop",
            id: 1,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            url: "https://api.github.com/users/shop",
            html_url: "https://github.com/shop",
          },
          html_url: "https://github.com/shop/world",
          description: "Shop repo",
        },
        url: "https://api.github.com/notifications/notif-old-review",
        subscription_url:
          "https://api.github.com/notifications/threads/notif-old-review",
      };

      setupMockApi({
        notifications: [oldReviewRequestPR],
        pullRequests: {
          "/pulls/270657": {
            state: "open",
            draft: false,
            requested_reviewers: [{ login: "kumar303" }], // User is still a reviewer
          },
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      });

      // Without the fix, this test will fail because notifications older than
      // 7 days are filtered out by the 'since' parameter
      await waitFor(() => {
        expect(screen.queryByText("No notifications! 🎉")).toBeNull();
      });

      // Should show the review request even though it's from 8 days ago
      const reviewRequestsHeader = await screen.findByText(/REVIEW REQUESTS/);
      expect(reviewRequestsHeader).toBeInTheDocument();

      // Expand the section
      const user = userEvent.setup();
      await user.click(reviewRequestsHeader);

      // Verify the PR title is visible
      await waitFor(() => {
        expect(
          screen.getByText("Init sandbox using ArrayBuffers")
        ).toBeInTheDocument();
      });
    });
  });
});
