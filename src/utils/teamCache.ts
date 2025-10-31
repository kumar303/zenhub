// Cache for team review requests and mentions to avoid repeated API calls
const TEAM_CACHE_KEY = "github_team_cache";
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

interface TeamInfo {
  isTeamReviewRequest: boolean;
  timestamp: number;
  teamSlug?: string;
  teamName?: string;
}

interface TeamCacheData {
  [notificationId: string]: TeamInfo;
}

export class TeamCache {
  private cache: TeamCacheData;

  constructor() {
    this.cache = this.loadCache();
  }

  private loadCache(): TeamCacheData {
    try {
      const saved = localStorage.getItem(TEAM_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Clean expired entries
        const now = Date.now();
        const cleaned: TeamCacheData = {};
        for (const [id, data] of Object.entries(parsed)) {
          if (now - (data as TeamInfo).timestamp < CACHE_DURATION) {
            cleaned[id] = data as TeamInfo;
          }
        }
        return cleaned;
      }
    } catch (e) {
      console.error("Failed to load team cache:", e);
    }
    return {};
  }

  private saveCache() {
    try {
      localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(this.cache));
    } catch (e) {
      console.error("Failed to save team cache:", e);
    }
  }

  get(notificationId: string): TeamInfo | null {
    const cached = this.cache[notificationId];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached;
    }
    return null;
  }

  set(
    notificationId: string,
    isTeamReviewRequest: boolean,
    teamSlug?: string,
    teamName?: string
  ) {
    this.cache[notificationId] = {
      isTeamReviewRequest,
      timestamp: Date.now(),
      teamSlug,
      teamName,
    };
    this.saveCache();
  }

  isTeamReview(notificationId: string): boolean | null {
    const info = this.get(notificationId);
    return info ? info.isTeamReviewRequest : null;
  }

  clear() {
    this.cache = {};
    try {
      localStorage.removeItem(TEAM_CACHE_KEY);
    } catch (e) {
      console.error("Failed to clear team cache:", e);
    }
  }
}

export const teamCache = new TeamCache();
