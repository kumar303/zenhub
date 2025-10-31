// Cache for user's GitHub teams to avoid repeated API calls
import type { GitHubTeam } from "../types";
import { Cache } from "./cache";

const TEAMS_CACHE_KEY = "github_user_teams";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

class TeamsCache extends Cache<GitHubTeam[]> {
  constructor() {
    super(TEAMS_CACHE_KEY, CACHE_DURATION);
  }

  // Get just the team slugs for quick lookup
  getTeamSlugs(): string[] {
    const teams = this.get();
    return teams ? teams.map((team) => team.slug) : [];
  }
}

export const teamsCache = new TeamsCache();
