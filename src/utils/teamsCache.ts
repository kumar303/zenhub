// Cache for user's GitHub teams to avoid repeated API calls
import type { GitHubTeam } from "../types";
import { Cache } from "./cache";
import { CACHE_KEYS, CACHE_DURATIONS } from "../config/cacheKeys";

class TeamsCache extends Cache<GitHubTeam[]> {
  constructor() {
    super(CACHE_KEYS.USER_TEAMS, CACHE_DURATIONS.USER_TEAMS);
  }

  // Get just the team slugs for quick lookup
  getTeamSlugs(): string[] {
    const teams = this.get();
    return teams ? teams.map((team) => team.slug) : [];
  }
}

export const teamsCache = new TeamsCache();
