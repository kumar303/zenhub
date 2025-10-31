// Cache for user's GitHub teams to avoid repeated API calls
import type { GitHubTeam } from "../types";

const TEAMS_CACHE_KEY = "github_user_teams";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface TeamsCacheData {
  teams: GitHubTeam[];
  timestamp: number;
}

export class TeamsCache {
  private cache: TeamsCacheData | null = null;

  constructor() {
    this.loadCache();
  }

  private loadCache(): void {
    try {
      const saved = localStorage.getItem(TEAMS_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as TeamsCacheData;
        // Check if cache is still valid
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
          this.cache = parsed;
        } else {
          // Clear expired cache
          localStorage.removeItem(TEAMS_CACHE_KEY);
        }
      }
    } catch (e) {
      console.error("Failed to load teams cache:", e);
    }
  }

  private saveCache(): void {
    try {
      if (this.cache) {
        localStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify(this.cache));
      }
    } catch (e) {
      console.error("Failed to save teams cache:", e);
    }
  }

  get(): GitHubTeam[] | null {
    if (this.cache && Date.now() - this.cache.timestamp < CACHE_DURATION) {
      return this.cache.teams;
    }
    return null;
  }

  set(teams: GitHubTeam[]): void {
    this.cache = {
      teams,
      timestamp: Date.now(),
    };
    this.saveCache();
  }

  clear(): void {
    this.cache = null;
    try {
      localStorage.removeItem(TEAMS_CACHE_KEY);
    } catch (e) {
      console.error("Failed to clear teams cache:", e);
    }
  }

  // Get just the team slugs for quick lookup
  getTeamSlugs(): string[] {
    const teams = this.get();
    return teams ? teams.map((team) => team.slug) : [];
  }
}

export const teamsCache = new TeamsCache();
