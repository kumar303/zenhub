/**
 * IMPORTANT: Follow all guidelines in AGENTS.md before making changes.
 * Run tests, typecheck, and deploy after every change.
 */

// Cache for team review requests and mentions to avoid repeated API calls
import { ItemCache } from "./cache";
import { CACHE_KEYS, CACHE_DURATIONS } from "../config/cacheKeys";

interface TeamInfo {
  isTeamReviewRequest: boolean;
  isDraft?: boolean;
  teamSlug?: string;
  teamName?: string;
}

class TeamCache {
  private cache: ItemCache<TeamInfo>;

  constructor() {
    this.cache = new ItemCache(
      CACHE_KEYS.TEAM_CACHE,
      CACHE_DURATIONS.TEAM_CACHE
    );
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
    const cacheData = localStorage.getItem(CACHE_KEYS.TEAM_CACHE);
    if (!cacheData) return;

    try {
      const cache = JSON.parse(cacheData);
      if (cache.data && cache.data[notificationId]) {
        delete cache.data[notificationId];
        localStorage.setItem(CACHE_KEYS.TEAM_CACHE, JSON.stringify(cache));
        console.log(`Cleared cache for notification: ${notificationId}`);
      }
    } catch (error) {
      console.error("Error clearing cache entry:", error);
    }
  }
}

export const teamCache = new TeamCache();
