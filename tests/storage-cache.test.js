import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome.storage.local mock (with onChanged, like the real API)
const store = new Map();
const changeListeners = new Set();
const fireOnChanged = (changes, area = 'local') => {
  changeListeners.forEach((listener) => listener(changes, area));
};
globalThis.chrome = {
  storage: {
    onChanged: {
      addListener: vi.fn((listener) => {
        changeListeners.add(listener);
      }),
      removeListener: vi.fn((listener) => {
        changeListeners.delete(listener);
      }),
    },
    local: {
      get: vi.fn(async (keys) => {
        const out = {};
        for (const k of keys) out[k] = store.get(k);
        return out;
      }),
      set: vi.fn(async (items) => {
        Object.entries(items).forEach(([k, v]) => store.set(k, v));
      }),
      remove: vi.fn(async (keys) => {
        keys.forEach((k) => store.delete(k));
      }),
      clear: vi.fn(async () => {
        store.clear();
      }),
    },
  },
};

describe('StorageManager cache invalidation', () => {
  let storage;

  beforeEach(async () => {
    store.clear();
    changeListeners.clear();
    vi.resetModules();
    storage = (await import('../utils/storage.js')).default;
    storage.clearCache();
  });

  it('returns updated values after set() (cache cleared)', async () => {
    await chrome.storage.local.set({ streams: [{ username: 'a', priority: 1 }] });
    const a1 = await storage.getStreams();
    expect(a1).toHaveLength(1);

    await storage.saveStreams([{ username: 'b', priority: 1 }]);
    const a2 = await storage.getStreams();
    expect(a2[0].username).toBe('b');
  });

  it('invalidates the cache when another context writes to chrome.storage', async () => {
    // The popup, options page, and background worker each have their own
    // StorageManager instance. A write from the popup only reaches the
    // background's instance via chrome.storage.onChanged — without that
    // invalidation, the background keeps serving (and re-saving) a stale
    // stream list, clobbering edits the user made mid-poll.
    await chrome.storage.local.set({ streams: [{ username: 'a', priority: 1 }] });
    const before = await storage.getStreams();
    expect(before.map((s) => s.username)).toEqual(['a']);

    // Simulate another context writing directly to chrome.storage
    await chrome.storage.local.set({ streams: [{ username: 'a', priority: 1 }, { username: 'b', priority: 2 }] });
    fireOnChanged({ streams: { newValue: store.get('streams') } });

    const after = await storage.getStreams();
    expect(after.map((s) => s.username)).toEqual(['a', 'b']);
  });

  it('persists settings immediately, without waiting for the debounce flush', async () => {
    // The popup/options page can close (and the MV3 service worker can
    // suspend) within the 300ms debounce window, so saveSettings must hit
    // chrome.storage before it resolves.
    await storage.saveSettings({ theme: 'midnight' });
    expect(store.get('settings')?.theme).toBe('midnight');
  });
});


