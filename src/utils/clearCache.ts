// Utility to clear specific cache entries for debugging

export function clearTeamCacheEntry(notificationId: string) {
  const TEAM_CACHE_KEY = "github_team_cache_v3";
  const cacheData = localStorage.getItem(TEAM_CACHE_KEY);

  if (!cacheData) return false;

  try {
    const cache = JSON.parse(cacheData);
    if (cache.data && cache.data[notificationId]) {
      delete cache.data[notificationId];
      localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(cache));
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
  localStorage.removeItem("github_team_cache_v3");
  localStorage.removeItem("github_team_cache_v2");
  localStorage.removeItem("github_team_cache");
  console.log("Cleared all team cache versions");
}
