/**
 * IMPORTANT: Follow all guidelines in AGENTS.md before making changes.
 * Run tests, typecheck, and deploy after every change.
 */

// Cache for issue/PR states to avoid repeated API calls
const STATE_CACHE_KEY = "github_state_cache";
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes for fresh state

interface CachedState {
  state: string;
  timestamp: number;
}

interface StateCacheData {
  [url: string]: CachedState;
}

export class StateCache {
  private cache: StateCacheData;

  constructor() {
    this.cache = this.loadCache();
  }

  private loadCache(): StateCacheData {
    try {
      const saved = localStorage.getItem(STATE_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Clean expired entries
        const now = Date.now();
        const cleaned: StateCacheData = {};
        for (const [url, data] of Object.entries(parsed)) {
          if (now - (data as CachedState).timestamp < CACHE_DURATION) {
            cleaned[url] = data as CachedState;
          }
        }
        return cleaned;
      }
    } catch (e) {
      console.error("Failed to load state cache:", e);
    }
    return {};
  }

  private saveCache() {
    try {
      localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(this.cache));
    } catch (e) {
      console.error("Failed to save state cache:", e);
    }
  }

  get(url: string): string | null {
    const cached = this.cache[url];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.state;
    }
    return null;
  }

  set(url: string, state: string) {
    this.cache[url] = {
      state,
      timestamp: Date.now(),
    };
    this.saveCache();
  }

  isClosedOrMerged(url: string): boolean {
    const state = this.get(url);
    // Hide notifications until state is known to prevent showing closed/merged PRs
    if (state === "unknown" || state === null) return true;
    return state === "closed" || state === "merged" || state === "deleted";
  }

  clear() {
    this.cache = {};
    try {
      localStorage.removeItem(STATE_CACHE_KEY);
    } catch (e) {
      console.error("Failed to clear state cache:", e);
    }
  }
}

export const stateCache = new StateCache();
