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
}
