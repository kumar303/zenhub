import { describe, it, expect, vi, beforeEach } from "vitest";
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
}

function setupMockApi(options: MockApiOptions = {}) {
  const {
    user = mockUser,
    teams = mockUserTeams,
    notifications = [],
    pullRequests = {},
  } = options;

  const mockFetch = vi.mocked(global.fetch);

  mockFetch.mockImplementation((url) => {
    if (url.toString().includes("/user/teams")) {
      return Promise.resolve(createMockResponse(teams));
    }

    if (
      url.toString().includes("/user") &&
      !url.toString().includes("/teams")
    ) {
      return Promise.resolve(createMockResponse(user));
    }

    if (url.toString().includes("/notifications")) {
      return Promise.resolve(createMockResponse(notifications));
    }

    // Check for PR details
    for (const [prPath, prData] of Object.entries(pullRequests)) {
      if (url.toString().includes(prPath)) {
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

  it(
    "should render notifications with a direct author review request as Review Requests",
    { timeout: 15000 },
    async () => {
      vi.clearAllMocks();

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

      await waitFor(
        () => {
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
        },
        { timeout: 10000 } // Give more time for async processing
      );

      const user = userEvent.setup();
      const reviewRequestsHeader = await screen.findByRole("button", {
        name: "Expand section",
      });
      await user.click(reviewRequestsHeader);

      await waitFor(() => {
        expect(screen.getByText("Fix payment processing bug")).toBeDefined();
      });

      expect(screen.getByText("Add new feature flag system")).toBeDefined();
    }
  );

  it(
    "should render notifications without a direct request but with an unknown team request as Team Review Requests",
    { timeout: 15000 },
    async () => {
      vi.clearAllMocks();

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

      await waitFor(
        () => {
          const teamRequestsSection = screen.getByText(/Team Review Requests/);
          expect(teamRequestsSection).toBeDefined();
          expect(teamRequestsSection.textContent).toContain("(1)");
        },
        { timeout: 10000 }
      );

      const user = userEvent.setup();
      const teamRequestsElement = await screen.findByText(
        /Team Review Requests/
      );
      await user.click(teamRequestsElement);

      await waitFor(() => {
        expect(screen.getByText("Update team documentation")).toBeDefined();
      });
    }
  );

  it(
    "should render notifications without a direct request but with a team request that I am a part of as the team name",
    { timeout: 15000 },
    async () => {
      vi.clearAllMocks();

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

      await waitFor(
        () => {
          expect(screen.queryByText("Refreshing...")).toBeNull();
        },
        { timeout: 5000 }
      );

      const user = userEvent.setup();

      await waitFor(
        () => {
          const craftersSection = screen.queryByText(/^Crafters/);
          if (!craftersSection) {
            throw new Error("Crafters section not found");
          }
          expect(craftersSection.textContent).toContain("(1)");
        },
        { timeout: 10000 }
      );

      const craftersSectionElement = await screen.findByText(/Crafters/);
      await user.click(craftersSectionElement);

      await waitFor(() => {
        expect(
          screen.getByText("Add widget stewardship feature")
        ).toBeDefined();
      });
    }
  );

  it("should not show dismissed notifications after refresh", async () => {
    vi.clearAllMocks();

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

    await waitFor(
      () => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      },
      { timeout: 5000 }
    );

    // The notification should not be visible since it's already dismissed
    expect(
      screen.queryByText(
        "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
      )
    ).toBeNull();
    expect(screen.queryByText(/Mentions/)).toBeNull();
  });

  it("should keep notifications dismissed across page reloads", async () => {
    vi.clearAllMocks();

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

    await waitFor(
      () => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      },
      { timeout: 5000 }
    );

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

    await waitFor(
      () => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      },
      { timeout: 5000 }
    );

    // The notification should not be visible after reload
    expect(
      screen.queryByText(
        "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
      )
    ).toBeNull();
    expect(screen.queryByText(/Mentions/)).toBeNull();
  });

  it("should keep notifications dismissed even when notification ID changes", async () => {
    vi.clearAllMocks();

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

    await waitFor(
      () => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      },
      { timeout: 5000 }
    );

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

    await waitFor(
      () => {
        expect(screen.queryByText("Refreshing...")).toBeNull();
      },
      { timeout: 5000 }
    );

    // The notification should still not be visible because we group by repo#issue URL
    expect(
      screen.queryByText(
        "Plasma Foundation | Over USD 2.4B TVL & 54.02% APY, XPL and Staking Rewards"
      )
    ).toBeNull();
    expect(screen.queryByText(/Mentions/)).toBeNull();
  });
});
