import { useState, useCallback } from "preact/hooks";

const CLICKED_KEY = "clicked_notifications";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

interface ClickedNotification {
  id: string;
  timestamp: number;
}

export function useClickedNotifications() {
  const [clickedNotifications, setClickedNotifications] = useState<Set<string>>(
    () => {
      try {
        const saved = localStorage.getItem(CLICKED_KEY);
        if (saved) {
          const parsed: ClickedNotification[] = JSON.parse(saved);
          // Filter out entries older than MAX_AGE
          const now = Date.now();
          const valid = parsed.filter((item) => now - item.timestamp < MAX_AGE);

          // Save cleaned list back
          if (valid.length !== parsed.length) {
            localStorage.setItem(CLICKED_KEY, JSON.stringify(valid));
          }

          return new Set(valid.map((item) => item.id));
        }
      } catch (e) {
        console.error("Failed to load clicked notifications:", e);
      }
      return new Set();
    }
  );

  const markAsClicked = useCallback((groupId: string) => {
    setClickedNotifications((prev) => {
      const newSet = new Set(prev);
      newSet.add(groupId);

      // Save to localStorage with timestamp
      try {
        const saved = localStorage.getItem(CLICKED_KEY);
        const existing: ClickedNotification[] = saved ? JSON.parse(saved) : [];

        // Add new entry if not already present
        if (!existing.some((item) => item.id === groupId)) {
          existing.push({ id: groupId, timestamp: Date.now() });
        }

        // Clean old entries while we're at it
        const now = Date.now();
        const valid = existing.filter((item) => now - item.timestamp < MAX_AGE);

        localStorage.setItem(CLICKED_KEY, JSON.stringify(valid));
      } catch (e) {
        console.error("Failed to save clicked notification:", e);
      }

      return newSet;
    });
  }, []);

  const isClicked = useCallback(
    (groupId: string) => {
      return clickedNotifications.has(groupId);
    },
    [clickedNotifications]
  );

  return { markAsClicked, isClicked };
}
