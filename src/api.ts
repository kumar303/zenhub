/**
 * IMPORTANT: Follow all guidelines in AGENTS.md before making changes.
 * Run tests, typecheck, and deploy after every change.
 */

import { GITHUB_CONFIG } from "./config";
import type {
  GitHubUser,
  GitHubNotification,
  SubjectDetails,
  GitHubTeam,
} from "./types";

export const DEFAULT_NOTIFICATIONS_PER_PAGE = 200;

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

  async getNotifications(options: {
    page: number;
    perPage?: number;
    all?: boolean;
    since?: string;
  }): Promise<GitHubNotification[]> {
    const {
      page,
      perPage = DEFAULT_NOTIFICATIONS_PER_PAGE,
      all = false,
      since,
    } = options;

    // Default to fetching notifications from the last 30 days
    // This ensures review requests don't disappear just because they're a bit older
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const defaultSince = thirtyDaysAgo.toISOString();

    // GitHub API supports pagination with per_page and page parameters
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: page.toString(),
      participating: "true", // Only show notifications where user is directly participating
    });

    // Only add 'all' parameter if explicitly requested
    if (all) {
      params.append("all", "true");
    }

    // Add since parameter to filter by date (ISO 8601 timestamp)
    // Defaults to 30 days ago if not specified
    params.append("since", since ?? defaultSince);

    return this.request<GitHubNotification[]>(
      `${GITHUB_CONFIG.API_BASE}/notifications?${params}`
    );
  }

  async getSubjectDetails(url: string): Promise<SubjectDetails | null> {
    if (!url) return null;

    try {
      return await this.request<SubjectDetails>(url);
    } catch (error: any) {
      console.error("Failed to fetch subject details:", error);
      // Re-throw the error so caller can handle 404s specially
      throw error;
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
    username: string,
    reason?: string
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

      // If there are NO reviewers at all (neither team nor personal),
      // but we have a review_requested notification, it's likely an orphaned
      // team review request (where another team member already reviewed)
      const noReviewersAtAll =
        (!pr.requested_teams || pr.requested_teams.length === 0) &&
        (!pr.requested_reviewers || pr.requested_reviewers.length === 0);

      // Check if this might be an orphaned team review
      // If we have a review_requested notification but the user is NOT personally requested,
      // and there's no team currently requested, this is likely a team review where
      // another team member already reviewed
      const hasOtherReviewersButNotUser =
        !isPersonallyRequested &&
        !hasTeamReviewers &&
        pr.requested_reviewers &&
        pr.requested_reviewers.length > 0 &&
        reason === "review_requested";

      // KEY FIX: Determine if this is a team review request
      // If the notification reason is "review_requested" but the user is NOT in requested_reviewers,
      // it MUST be a team review (that's the only way they'd get the notification).
      // This handles cases where GitHub's API might have timing issues and not yet show
      // the team in requested_teams, or where the team review was already fulfilled.
      // FIX: Determine if this is a team review request
      const isTeamRequest =
        (hasTeamReviewers && !isPersonallyRequested) ||
        // FIX 1: Only treat "no reviewers" as team review for actual review_requested notifications
        (noReviewersAtAll && !isPersonallyRequested && reason === "review_requested") ||
        hasOtherReviewersButNotUser ||
        // FIX 2: Catch-all safety net - if you got review_requested but aren't personally requested, it's a team review
        (reason === "review_requested" && !isPersonallyRequested);

      // Enhanced debug logging for team review detection
      const debugMode =
        typeof window !== "undefined" &&
        localStorage.getItem("debug_team_reviews") === "true";
      if (debugMode || noReviewersAtAll || hasOtherReviewersButNotUser) {
        console.log(`Checking team review for PR: ${prUrl}`);
        console.log(`  PR title: "${pr.title}"`);
        console.log(`  reason: ${reason}`);
        console.log(`  hasTeamReviewers: ${hasTeamReviewers}`);
        console.log(
          `  requested_teams: ${pr.requested_teams?.length || 0}`,
          pr.requested_teams?.map((t: any) => t.slug) || []
        );
        console.log(
          `  requested_reviewers: ${pr.requested_reviewers?.length || 0}`,
          pr.requested_reviewers?.map((r: any) => r.login) || []
        );
        console.log(
          `  isPersonallyRequested: ${isPersonallyRequested} (username: ${username})`
        );
        console.log(`  noReviewersAtAll: ${noReviewersAtAll}`);
        console.log(
          `  hasOtherReviewersButNotUser: ${hasOtherReviewersButNotUser}`
        );
        console.log(`  => isTeamRequest: ${isTeamRequest}`);

        if (
          noReviewersAtAll &&
          !isPersonallyRequested &&
          reason === "review_requested"
        ) {
          console.log(
            `  ** This appears to be an orphaned team review (no reviewers) **`
          );
        }
        if (hasOtherReviewersButNotUser) {
          console.log(
            `  ** This appears to be an orphaned team review (has other reviewers) **`
          );
        }
      }

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

      console.log(`\n=== getRequestedTeamForPR Debug ===`);
      console.log(`PR URL: ${prUrl}`);
      console.log(`PR Title: ${pr?.title}`);
      console.log(`PR has requested_teams: ${!!pr?.requested_teams}`);
      console.log(`Requested teams count: ${pr?.requested_teams?.length || 0}`);

      if (!pr || !pr.requested_teams || pr.requested_teams.length === 0) {
        console.log(`Early return: No PR or no requested teams`);
        return null;
      }

      // Find which of the user's teams was requested for review
      console.log(
        `Requested teams:`,
        pr.requested_teams.map((t: any) => ({ slug: t.slug, name: t.name }))
      );
      console.log(`User teams (${userTeamSlugs.length}):`, userTeamSlugs);

      // Try exact match first
      for (const team of pr.requested_teams) {
        console.log(`  Checking exact match: "${team.slug}" in user teams`);
        if (userTeamSlugs.includes(team.slug)) {
          console.log(`  ✓ Matched team: ${team.slug} - ${team.name}`);
          console.log(`=== End getRequestedTeamForPR Debug ===\n`);
          return { slug: team.slug, name: team.name };
        }
      }

      // Try normalized match (convert hyphens to underscores and vice versa)
      for (const team of pr.requested_teams) {
        const normalizedSlug = team.slug.replace(/-/g, "_");
        const normalizedSlug2 = team.slug.replace(/_/g, "-");

        console.log(
          `  Checking normalized: "${team.slug}" -> "${normalizedSlug}" or "${normalizedSlug2}"`
        );

        if (userTeamSlugs.includes(normalizedSlug)) {
          console.log(
            `  ✓ Matched team (normalized): ${team.slug} -> ${normalizedSlug} - ${team.name}`
          );
          console.log(`=== End getRequestedTeamForPR Debug ===\n`);
          return { slug: normalizedSlug, name: team.name };
        }

        if (userTeamSlugs.includes(normalizedSlug2)) {
          console.log(
            `  ✓ Matched team (normalized): ${team.slug} -> ${normalizedSlug2} - ${team.name}`
          );
          console.log(`=== End getRequestedTeamForPR Debug ===\n`);
          return { slug: normalizedSlug2, name: team.name };
        }
      }

      console.log(`No team match found for PR ${prUrl}`);
      console.log(`=== End getRequestedTeamForPR Debug ===\n`);
      return null;
    } catch (error) {
      console.error("Failed to get requested team for PR:", error);
      console.log(`=== End getRequestedTeamForPR Debug (with error) ===\n`);
      return null;
    }
  }
}
