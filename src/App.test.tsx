import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
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
}

function setupMockApi(options: MockApiOptions = {}) {
  const {
    user = mockUser,
    teams = mockUserTeams,
    notifications = [],
    pullRequests = {},
    notFoundUrls = [],
  } = options;

  const mockFetch = vi.mocked(global.fetch);

  mockFetch.mockImplementation((url) => {
    const urlString = url.toString();

    // Check for 404 URLs first
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
      return Promise.resolve(createMockResponse(notifications));
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

  it("should render notifications with a direct author review request as Review Requests", async () => {
    setupMockApi({
      notifications: [
        {
          id: "notif-review-1",
          unread: true,
          reason: "review_requested",
          updated_at: "2025-11-14T10:00:00Z",
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
          updated_at: "2025-11-14T09:00:00Z",
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
      const reviewRequestsElements = screen.getAllByText(/Review Requests/);

      // Find the specific "Review Requests (2)" section
      const reviewRequestsSection = reviewRequestsElements.find(
        (el) =>
          el.textContent?.trim().startsWith("Review Requests") &&
          el.classList.contains("gradient-green-red")
      );
      expect(reviewRequestsSection).toBeDefined();
      expect(reviewRequestsSection?.textContent).toContain("(2)");
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

  it("should render notifications without a direct request but with an unknown team request as Team Review Requests", async () => {
    setupMockApi({
      notifications: [
        {
          id: "notif-team-review",
          unread: true,
          reason: "review_requested",
          updated_at: "2025-11-14T10:00:00Z",
          subject: {
            title: "Update team documentation",
            url: "https://api.github.com/repos/test/test-repo/pulls/200",
            type: "PullRequest",
          },
          repository: mockRepository,
          url: "https://api.github.com/notifications/threads/notif-team-review",
          subscription_url:
            "https://api.github.com/notifications/threads/notif-team-review/subscription",
        },
        {
          id: "notif-direct-review",
          unread: true,
          reason: "review_requested",
          updated_at: "2025-11-14T09:00:00Z",
          subject: {
            title: "Fix bug in checkout",
            url: "https://api.github.com/repos/test/test-repo/pulls/201",
            type: "PullRequest",
          },
          repository: mockRepository,
          url: "https://api.github.com/notifications/threads/notif-direct-review",
          subscription_url:
            "https://api.github.com/notifications/threads/notif-direct-review/subscription",
        },
        {
          id: "notif-author",
          unread: true,
          reason: "author",
          updated_at: "2025-11-14T08:00:00Z",
          subject: {
            title: "My own PR",
            url: "https://api.github.com/repos/test/test-repo/pulls/202",
            type: "PullRequest",
          },
          repository: mockRepository,
          url: "https://api.github.com/notifications/threads/notif-author",
          subscription_url:
            "https://api.github.com/notifications/threads/notif-author/subscription",
        },
      ],
      pullRequests: {
        "/pulls/200": {
          requested_teams: [
            { slug: "unknown-team", name: "Unknown Team", id: 999 },
          ],
        },
        "/pulls/201": { requested_reviewers: [mockUser] },
      },
    });

    render(<App />);

    await waitFor(() => {
      const teamRequestsSection = screen.getByText(/Team Review Requests/);
      expect(teamRequestsSection).toBeDefined();
      expect(teamRequestsSection.textContent).toContain("(1)");
    });

    const user = userEvent.setup();
    const teamRequestsElement = await screen.findByText(/Team Review Requests/);
    await user.click(teamRequestsElement);

    await waitFor(() => {
      expect(screen.getByText("Update team documentation")).toBeDefined();
    });
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
          updated_at: "2025-11-14T10:00:00Z",
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
      const craftersSection = screen.queryByText(/^Crafters/);
      if (!craftersSection) {
        throw new Error("Crafters section not found");
      }
      expect(craftersSection.textContent).toContain("(1)");
    });

    const craftersSectionElement = await screen.findByText(/Crafters/);
    await user.click(craftersSectionElement);

    await waitFor(() => {
      expect(screen.getByText("Add widget stewardship feature")).toBeDefined();
    });
  });

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
      notifications: [mentionNotification],
    });

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(screen.queryByText("Refreshing...")).toBeNull();
    });

    // Check that the notification is initially visible
    const user = userEvent.setup();
    const mentionsSection = screen.getByText(/Mentions/);
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

  it("should keep notifications dismissed even when notification ID changes", async () => {
    // Pre-populate dismissed notifications in localStorage
    localStorage.setItem(
      "dismissed_notifications",
      JSON.stringify([
        "plasma-network/plasma.to#https://api.github.com/repos/plasma-network/plasma.to/issues/94",
      ])
    );

    // First notification with one ID
    const mentionNotification1: GitHubNotification = {
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
      notifications: [mentionNotification1],
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

    // Now simulate a refresh where the notification comes back with a different ID
    const mentionNotification2: GitHubNotification = {
      ...mentionNotification1,
      id: "19200000000", // Different notification ID
      url: "https://api.github.com/notifications/19200000000",
      subscription_url:
        "https://api.github.com/notifications/threads/19200000000",
    };

    setupMockApi({
      notifications: [mentionNotification2],
    });

    const user = userEvent.setup();
    const refreshButton = screen.getByText("Refresh");
    await user.click(refreshButton);

    await waitFor(() => {
      expect(screen.queryByText("Refreshing...")).toBeNull();
    });

    // The notification should still not be visible because we group by repo#issue URL
    expect(
      screen.queryByText(
        "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
      )
    ).toBeNull();
    expect(screen.queryByText(/Mentions/)).toBeNull();
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
        title: "Replace `@see` with markdown links so they show on shopify.dev",
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
          requested_teams: [{ slug: "ui-api-tag", name: "UI API TAG", id: 1 }],
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
    expect(screen.queryByText(/Team Review Requests/)).toBeNull();
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

  it("should show notifications after clearing cache", async () => {
    const reviewRequestPR: GitHubNotification = {
      id: "notif-review",
      unread: true,
      reason: "review_requested",
      updated_at: "2025-11-14T10:00:00Z",
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
    expect(screen.queryByText(/Review Requests/)).toBeDefined();
  });

  it("should filter out 404 notifications even when there are more than 20 URLs to check", async () => {
    // Create 25 notifications, last one will be a 404
    const notifications: GitHubNotification[] = [];
    for (let i = 1; i <= 25; i++) {
      notifications.push({
        id: `notif-${i}`,
        unread: true,
        reason: i === 25 ? "mention" : "comment",
        updated_at: "2025-11-14T10:00:00Z",
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

  it("should show notifications after automatic refresh timer", async () => {
    vi.clearAllMocks();

    const reviewRequestPR: GitHubNotification = {
      id: "notif-timer",
      unread: true,
      reason: "review_requested",
      updated_at: "2025-11-14T10:00:00Z",
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
      expect(screen.queryByText("Refreshing...")).toBeNull();
    });

    // Should show notification initially
    expect(screen.queryByText("No notifications! 🎉")).toBeNull();

    const user = userEvent.setup();
    const reviewRequestsSection = screen.getByText(/Review Requests/);
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

  it("should send web notifications only for newly received notifications after refresh", async () => {
    vi.clearAllMocks();

    // Clear any existing Notification mock
    delete (global as any).Notification;

    // Mock Notification API
    const mockNotification = vi.fn();
    global.Notification = mockNotification as any;
    (global.Notification as any).permission = "granted";
    (global.Notification as any).requestPermission = vi
      .fn()
      .mockResolvedValue("granted");

    // Initial notification
    const existingNotification: GitHubNotification = {
      id: "notif-existing",
      unread: true,
      reason: "review_requested",
      updated_at: "2025-11-14T10:00:00Z",
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
      expect(screen.queryByText("Refreshing...")).toBeNull();
    });

    // No notifications should be sent on initial load
    expect(mockNotification).not.toHaveBeenCalled();

    // Now add a new notification and refresh
    const newNotification: GitHubNotification = {
      id: "notif-new",
      unread: true,
      reason: "mention",
      updated_at: "2025-11-14T11:00:00Z",
      subject: {
        title: "New PR with mention",
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
        },
      },
    });

    // Click refresh button
    const menuButton = screen.getByRole("button", { name: /More options/i });
    await user.click(menuButton);

    const refreshButton = screen.getByText("Refresh");
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
      "[Mention] New PR with mention",
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
    await user.click(menuButton);
    await user.click(refreshButton);

    await waitFor(() => {
      expect(screen.queryByText("Refreshing...")).toBeNull();
    });

    // No new notifications should be sent
    expect(mockNotification).not.toHaveBeenCalled();
  });
});
