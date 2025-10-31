import { GITHUB_CONFIG } from "./config";
import type {
  GitHubUser,
  GitHubNotification,
  SubjectDetails,
  GitHubTeam,
} from "./types";

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
  ): Promise<{ isTeamRequest: boolean; isDraft: boolean }> {
    try {
      const pr = await this.getPullRequestDetails(prUrl);
      if (!pr) return { isTeamRequest: false, isDraft: false };

      // Check if PR is a draft
      const isDraft = pr.draft === true;

      // Check if there are team reviewers requested
      const hasTeamReviewers =
        pr.requested_teams && pr.requested_teams.length > 0;

      // Check if the user is personally requested
      const isPersonallyRequested =
        pr.requested_reviewers &&
        pr.requested_reviewers.some(
          (reviewer: any) => reviewer.login === username
        );

      // If there are team reviewers but the user isn't personally requested,
      // this is likely a team review request
      // ALSO: If there are NO reviewers at all (neither team nor personal),
      // but we have a review_requested notification, it's likely an orphaned
      // team review request (where another team member already reviewed)
      const noReviewersAtAll =
        (!hasTeamReviewers || pr.requested_teams.length === 0) &&
        (!pr.requested_reviewers || pr.requested_reviewers.length === 0);

      const isTeamRequest =
        (hasTeamReviewers && !isPersonallyRequested) ||
        (noReviewersAtAll && !isPersonallyRequested);

      return { isTeamRequest, isDraft };
    } catch (error) {
      console.error("Failed to check team review request:", error);
      return { isTeamRequest: false, isDraft: false };
    }
  }

  async getUserTeams(): Promise<GitHubTeam[]> {
    try {
      const teams = await this.request<GitHubTeam[]>(
        `${GITHUB_CONFIG.API_BASE}/user/teams`
      );
      return teams;
    } catch (error) {
      console.error("Failed to fetch user teams:", error);
      return [];
    }
  }

  async getRequestedTeamForPR(
    prUrl: string,
    userTeamSlugs: string[]
  ): Promise<{ slug: string; name: string } | null> {
    try {
      const pr = await this.getPullRequestDetails(prUrl);
      if (!pr || !pr.requested_teams || pr.requested_teams.length === 0) {
        return null;
      }

      // Find which of the user's teams was requested for review
      for (const team of pr.requested_teams) {
        if (userTeamSlugs.includes(team.slug)) {
          return { slug: team.slug, name: team.name };
        }
      }
      return null;
    } catch (error) {
      console.error("Failed to get requested team for PR:", error);
      return null;
    }
  }
}
