/**
 * IMPORTANT: Follow all guidelines in AGENTS.md before making changes.
 * Run tests, typecheck, and deploy after every change.
 */

import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock localStorage with a proper storage implementation
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => {
      return store[key] || null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
};

const localStorageMock = createLocalStorageMock();
global.localStorage = localStorageMock as any;

