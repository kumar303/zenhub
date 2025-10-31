// Utility to clear specific cache entries for debugging
import { CACHE_KEYS } from "../config/cacheKeys";

export function clearTeamCacheEntry(notificationId: string) {
  const cacheData = localStorage.getItem(CACHE_KEYS.TEAM_CACHE);

  if (!cacheData) return false;

  try {
    const cache = JSON.parse(cacheData);
    if (cache.data && cache.data[notificationId]) {
      delete cache.data[notificationId];
      localStorage.setItem(CACHE_KEYS.TEAM_CACHE, JSON.stringify(cache));
      console.log(
        `Cleared team cache entry for notification: ${notificationId}`
      );
      return true;
    }
  } catch (error) {
    console.error("Error clearing cache entry:", error);
  }

  return false;
}

export function clearAllTeamCache() {
  localStorage.removeItem(CACHE_KEYS.TEAM_CACHE);
  localStorage.removeItem(CACHE_KEYS.TEAM_CACHE_V2);
  localStorage.removeItem(CACHE_KEYS.TEAM_CACHE_V1);
  console.log("Cleared all team cache versions");
}