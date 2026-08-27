import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome.storage.local mock
const store = new Map();
globalThis.chrome = {
  storage: {
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

  it('reads see pending debounced writes (read-your-writes)', async () => {
    vi.useFakeTimers();
    try {
      await chrome.storage.local.set({ analytics: { viewingTime: { streamer: 60 }, switchCount: 0, lastSwitch: null } });

      // Two read-modify-write cycles inside the debounce window, as the
      // background worker does on every auto-switch (updateAnalytics then
      // recordSwitch). The second read must see the first queued write, or
      // the viewing-time increment is silently lost.
      const a1 = await storage.getAnalytics();
      await storage.saveAnalytics({ ...a1, viewingTime: { streamer: a1.viewingTime.streamer + 60 } });

      const a2 = await storage.getAnalytics();
      expect(a2.viewingTime.streamer).toBe(120);
      await storage.saveAnalytics({ ...a2, switchCount: a2.switchCount + 1 });

      // Flush the debounce and confirm both updates reached chrome.storage.
      await vi.advanceTimersByTimeAsync(400);
      expect(store.get('analytics')?.viewingTime?.streamer).toBe(120);
      expect(store.get('analytics')?.switchCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists settings immediately, without waiting for the debounce flush', async () => {
    // The popup/options page can close (and the MV3 service worker can
    // suspend) within the 300ms debounce window, so saveSettings must hit
    // chrome.storage before it resolves.
    await storage.saveSettings({ theme: 'midnight' });
    expect(store.get('settings')?.theme).toBe('midnight');
  });
});


