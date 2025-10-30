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

  async getNotifications(): Promise<GitHubNotification[]> {
    return this.request<GitHubNotification[]>(
      `${GITHUB_CONFIG.API_BASE}/notifications`
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
