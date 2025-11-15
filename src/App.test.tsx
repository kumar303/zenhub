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

describe("<App>", () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    mockLocalStorage.data = {};

    // Clear all caches
    stateCache.clear();
    teamCache.clear();
    teamsCache.clear();

    // Set up a logged-in state
    mockLocalStorage.data["github_token"] = "test-token-123";
    mockLocalStorage.data["github_user"] = JSON.stringify(mockUser);

    // Mock hooks and utilities
    vi.mocked(useClickedNotifications).mockReturnValue({
      markAsClicked: vi.fn(),
      isClicked: vi.fn(() => false),
    });

    vi.mocked(getSubjectUrl).mockImplementation((subject) => {
      return subject.url.replace("api.github.com/repos", "github.com");
    });

    // Mock fetch globally
    global.fetch = vi.fn();
  });

  it(
    "should render notifications with a direct author review request as Review Requests",
    { timeout: 15000 },
    async () => {
      // Reset mocks for this test
      vi.clearAllMocks();

      // Set up fetch mocks for API calls
      const mockFetch = vi.mocked(global.fetch);

      // Create raw GitHub notification data
      const mockNotifications: GitHubNotification[] = [
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
      ];

      // Set up the sequence of API calls
      mockFetch.mockImplementation((url) => {
        if (
          url.toString().includes("/user") &&
          !url.toString().includes("/teams")
        ) {
          return Promise.resolve(createMockResponse(mockUser));
        }

        if (url.toString().includes("/user/teams")) {
          return Promise.resolve(createMockResponse(mockUserTeams));
        }

        if (url.toString().includes("/notifications")) {
          return Promise.resolve(createMockResponse(mockNotifications));
        }

        // For PR details (checking if team review request)
        if (url.toString().includes("/pulls/100")) {
          return Promise.resolve(
            createMockResponse({
              state: "open",
              draft: false,
              requested_reviewers: [mockUser], // Direct user review for PR 100
              requested_teams: [],
            })
          );
        }

        if (url.toString().includes("/pulls/101")) {
          return Promise.resolve(
            createMockResponse({
              state: "open",
              draft: false,
              requested_reviewers: [mockUser], // Direct user review for PR 101
              requested_teams: [],
            })
          );
        }

        if (url.toString().includes("/pulls/102")) {
          return Promise.resolve(
            createMockResponse({
              state: "open",
              draft: false,
              requested_reviewers: [],
              requested_teams: [],
            })
          );
        }

        // Default response
        return Promise.resolve(createMockResponse({}));
      });

      render(<App />);

      // Wait for the notifications to load and render
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

      // Click on the Review Requests section to expand it
      const user = userEvent.setup();
      const reviewRequestsHeader = await screen.findByRole("button", {
        name: "Expand section",
      });
      await user.click(reviewRequestsHeader);

      // Now the content should be visible
      await waitFor(() => {
        expect(screen.getByText("Fix payment processing bug")).toBeDefined();
      });

      expect(screen.getByText("Add new feature flag system")).toBeDefined();
    }
  );

  it(
    "should render notifications without a direct request but with a team request as Team Review Requests",
    { timeout: 15000 },
    async () => {
      // Reset mocks for this test
      vi.clearAllMocks();

      // Set up fetch mocks for API calls
      const mockFetch = vi.mocked(global.fetch);

      // Create raw GitHub notification data
      const mockNotifications: GitHubNotification[] = [
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
      ];

      // Set up the sequence of API calls
      mockFetch.mockImplementation((url) => {
        if (url.toString().includes("/user/teams")) {
          return Promise.resolve(createMockResponse(mockUserTeams));
        }

        if (
          url.toString().includes("/user") &&
          !url.toString().includes("/teams")
        ) {
          return Promise.resolve(createMockResponse(mockUser));
        }

        if (url.toString().includes("/notifications")) {
          return Promise.resolve(createMockResponse(mockNotifications));
        }

        // For PR details - differentiate between team and direct review
        if (url.toString().includes("/pulls/200")) {
          // Team review request
          return Promise.resolve(
            createMockResponse({
              state: "open",
              draft: false,
              requested_reviewers: [],
              requested_teams: [
                { slug: "crafters", name: "Crafters", id: 233 },
              ],
            })
          );
        }

        if (url.toString().includes("/pulls/201")) {
          // Direct review request
          return Promise.resolve(
            createMockResponse({
              state: "open",
              draft: false,
              requested_reviewers: [mockUser],
              requested_teams: [],
            })
          );
        }

        if (url.toString().includes("/pulls/202")) {
          // Author's own PR
          return Promise.resolve(
            createMockResponse({
              state: "open",
              draft: false,
              requested_reviewers: [],
              requested_teams: [],
            })
          );
        }

        // Default response
        return Promise.resolve(createMockResponse({}));
      });

      render(<App />);

      // Wait for the notifications to load and render
      await waitFor(
        () => {
          // Check for the Team Review Requests section
          const teamRequestsSection = screen.getByText(/Team Review Requests/);
          expect(teamRequestsSection).toBeDefined();
          expect(teamRequestsSection.textContent).toContain("(1)");
        },
        { timeout: 10000 }
      );

      // Click on the Team Review Requests section to expand it
      const user = userEvent.setup();
      const teamRequestsElement = await screen.findByText(
        /Team Review Requests/
      );
      await user.click(teamRequestsElement);

      // Now the content should be visible
      await waitFor(() => {
        expect(screen.getByText("Update team documentation")).toBeDefined();
      });
    }
  );
});
