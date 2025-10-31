import { GITHUB_CONFIG } from "./config";
import type { GitHubUser, GitHubNotification, SubjectDetails } from "./types";

export class GitHubAPI {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        ...options.headers,
      },
    });

    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  async getUser(): Promise<GitHubUser> {
    return this.request<GitHubUser>(`${GITHUB_CONFIG.API_BASE}/user`);
  }

  async getNotifications(
    page: number = 1,
    perPage: number = 50,
    all: boolean = false
  ): Promise<GitHubNotification[]> {
    // GitHub API supports pagination with per_page and page parameters
    // By default, only fetch unread notifications to reduce load
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: page.toString(),
      participating: "true", // Only show notifications where user is directly participating
    });

    // Only add 'all' parameter if explicitly requested
    if (all) {
      params.append("all", "true");
    }

    return this.request<GitHubNotification[]>(
      `${GITHUB_CONFIG.API_BASE}/notifications?${params}`
    );
  }

  async getSubjectDetails(url: string): Promise<SubjectDetails | null> {
    if (!url) return null;

    try {
      return await this.request<SubjectDetails>(url);
    } catch (error) {
      console.error("Failed to fetch subject details:", error);
      return null;
    }
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.request(
      `${GITHUB_CONFIG.API_BASE}/notifications/threads/${notificationId}`,
      {
        method: "PATCH",
      }
    );
  }

  async getPullRequestDetails(url: string): Promise<any> {
    if (!url) return null;

    try {
      return await this.request<any>(url);
    } catch (error) {
      console.error("Failed to fetch PR details:", error);
      return null;
    }
  }

  async checkTeamReviewRequest(
    prUrl: string,
    username: string
  ): Promise<boolean> {
    try {
      const pr = await this.getPullRequestDetails(prUrl);
      if (!pr || !pr.requested_reviewers) return false;

      // Check if there are team reviewers requested
      const hasTeamReviewers =
        pr.requested_teams && pr.requested_teams.length > 0;

      // Check if the user is personally requested
      const isPersonallyRequested = pr.requested_reviewers.some(
        (reviewer: any) => reviewer.login === username
      );

      // If there are team reviewers but the user isn't personally requested,
      // this is likely a team review request
      return hasTeamReviewers && !isPersonallyRequested;
    } catch (error) {
      console.error("Failed to check team review request:", error);
      return false;
    }
  }
}
