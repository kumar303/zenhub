// Generic cache utility for localStorage with expiration
export class Cache<T> {
  private storageKey: string;
  protected cacheDuration: number;

  constructor(storageKey: string, cacheDurationMs: number) {
    this.storageKey = storageKey;
    this.cacheDuration = cacheDurationMs;
  }

  protected loadFromStorage(): { data: T; timestamp: number } | null {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Check if cache is still valid
        if (Date.now() - parsed.timestamp < this.cacheDuration) {
          return parsed;
        } else {
          // Clear expired cache
          localStorage.removeItem(this.storageKey);
        }
      }
    } catch (e) {
      console.error(`Failed to load cache from ${this.storageKey}:`, e);
    }
    return null;
  }

  protected saveToStorage(data: T): void {
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          data,
          timestamp: Date.now(),
        })
      );
    } catch (e) {
      console.error(`Failed to save cache to ${this.storageKey}:`, e);
    }
  }

  get(): T | null {
    const cached = this.loadFromStorage();
    return cached ? cached.data : null;
  }

  set(data: T): void {
    this.saveToStorage(data);
  }

  clear(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.error(`Failed to clear cache ${this.storageKey}:`, e);
    }
  }

  isExpired(): boolean {
    const cached = this.loadFromStorage();
    return !cached || Date.now() - cached.timestamp >= this.cacheDuration;
  }
}

// Specialized cache for items with individual expiration
export class ItemCache<T> extends Cache<
  Record<string, T & { timestamp: number }>
> {
  constructor(storageKey: string, cacheDurationMs: number) {
    super(storageKey, cacheDurationMs);
  }

  getItem(key: string): T | null {
    const allData = this.get() || {};
    const item = allData[key];
    if (item && Date.now() - item.timestamp < this.cacheDuration) {
      return item;
    }
    return null;
  }

  setItem(key: string, value: T): void {
    const allData = this.get() || {};
    allData[key] = {
      ...value,
      timestamp: Date.now(),
    };
    // Clean expired entries while we're at it
    const now = Date.now();
    for (const [id, data] of Object.entries(allData)) {
      if (now - data.timestamp >= this.cacheDuration) {
        delete allData[id];
      }
    }
    this.set(allData);
  }

  removeItem(key: string): void {
    const allData = this.get() || {};
    delete allData[key];
    this.set(allData);
  }
}
