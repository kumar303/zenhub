// Cache for team review requests and mentions to avoid repeated API calls
import { ItemCache } from "./cache";

const TEAM_CACHE_KEY = "github_team_cache_v2"; // v2 includes draft status
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

interface TeamInfo {
  isTeamReviewRequest: boolean;
  isDraft?: boolean;
  teamSlug?: string;
  teamName?: string;
}

class TeamCache {
  private cache: ItemCache<TeamInfo>;

  constructor() {
    this.cache = new ItemCache(TEAM_CACHE_KEY, CACHE_DURATION);
  }

  get(notificationId: string): TeamInfo | null {
    return this.cache.getItem(notificationId);
  }

  set(
    notificationId: string,
    isTeamReviewRequest: boolean,
    teamSlug?: string,
    teamName?: string,
    isDraft?: boolean
  ) {
    this.cache.setItem(notificationId, {
      isTeamReviewRequest,
      teamSlug,
      teamName,
      isDraft,
    });
  }

  isTeamReview(notificationId: string): boolean | null {
    const info = this.get(notificationId);
    return info ? info.isTeamReviewRequest : null;
  }

  clear() {
    this.cache.clear();
  }
}

export const teamCache = new TeamCache();
