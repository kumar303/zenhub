// Central location for all cache keys to ensure consistency
export const CACHE_KEYS = {
  // Team cache for storing team review request information
  TEAM_CACHE: "github_team_cache_v4", // v4 includes improved orphaned team review logic for PRs with other reviewers

  // Previous versions (for cleanup)
  TEAM_CACHE_V3: "github_team_cache_v3",
  TEAM_CACHE_V2: "github_team_cache_v2",
  TEAM_CACHE_V1: "github_team_cache",

  // User teams cache
  USER_TEAMS: "github_user_teams",
} as const;

// Cache durations
export const CACHE_DURATIONS = {
  TEAM_CACHE: 12 * 60 * 60 * 1000, // 12 hours
  USER_TEAMS: 24 * 60 * 60 * 1000, // 24 hours
} as const;
