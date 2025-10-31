// GitHub OAuth configuration
// Note: For production, you'd need to register an OAuth app and use a backend server
// For now, we'll use Personal Access Tokens
export const GITHUB_CONFIG = {
  CLIENT_ID: "Ov23liJFM6vNFpNlKKcP", // Placeholder - requires backend for real OAuth
  REDIRECT_URI: window.location.origin + window.location.pathname,
  SCOPE: "notifications repo read:user",
  API_BASE: "https://api.github.com",
};

// Storage keys
export const STORAGE_KEYS = {
  TOKEN: "github_token",
  DISMISSED: "dismissed_notifications",
  USER: "github_user",
  EXPANDED_SECTION: "expanded_section",
};
