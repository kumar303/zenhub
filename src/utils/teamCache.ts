// Cache for team review requests and mentions to avoid repeated API calls
import { ItemCache } from "./cache";

const TEAM_CACHE_KEY = "github_team_cache_v3"; // v3 includes orphaned team review logic
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

  // Clear a specific notification from cache
  clearNotification(notificationId: string) {
    const cacheData = localStorage.getItem(TEAM_CACHE_KEY);
    if (!cacheData) return;

    try {
      const cache = JSON.parse(cacheData);
      if (cache.data && cache.data[notificationId]) {
        delete cache.data[notificationId];
        localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(cache));
        console.log(`Cleared cache for notification: ${notificationId}`);
      }
    } catch (error) {
      console.error("Error clearing cache entry:", error);
    }
  }
}

export const teamCache = new TeamCache();
