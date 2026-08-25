import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome.storage.local mock with onChanged support (fires for every
// write, in every context, like the real API).
const store = new Map();
const changeListeners = [];

function emitChange(changes) {
  changeListeners.forEach((fn) => fn(changes, 'local'));
}

globalThis.chrome = {
  storage: {
    onChanged: {
      addListener: vi.fn((fn) => {
        changeListeners.push(fn);
      }),
    },
    local: {
      get: vi.fn(async (keys) => {
        const out = {};
        for (const k of keys) out[k] = store.get(k);
        return out;
      }),
      set: vi.fn(async (items) => {
        const changes = {};
        Object.entries(items).forEach(([k, v]) => {
          changes[k] = { oldValue: store.get(k), newValue: v };
          store.set(k, v);
        });
        emitChange(changes);
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
    changeListeners.length = 0;
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

  it('persists settings immediately, without waiting for the debounce flush', async () => {
    // The popup/options page can close (and the MV3 service worker can
    // suspend) within the 300ms debounce window, so saveSettings must hit
    // chrome.storage before it resolves.
    await storage.saveSettings({ theme: 'midnight' });
    expect(store.get('settings')?.theme).toBe('midnight');
  });

  it('invalidates the cache when another context writes to storage', async () => {
    // The background worker caches the stream list...
    await chrome.storage.local.set({ streams: [{ username: 'a', priority: 1 }] });
    const before = await storage.getStreams();
    expect(before[0].username).toBe('a');

    // ...then the popup (a separate context with its own StorageManager)
    // edits the list. Only the onChanged event reaches this context.
    store.set('streams', [{ username: 'b', priority: 1 }]);
    emitChange({ streams: { newValue: store.get('streams') } });

    // A stale cache here would make the background write back the old list,
    // clobbering the popup's edit.
    const after = await storage.getStreams();
    expect(after[0].username).toBe('b');
  });

  it('get() sees queued debounced writes before they are flushed', async () => {
    vi.useFakeTimers();
    try {
      await chrome.storage.local.set({ analytics: { switchCount: 1 } });

      // Debounced write: queued, not yet flushed to chrome.storage.
      const setPromise = storage.set({ analytics: { switchCount: 2 } });

      // A read inside the debounce window must see the pending value, or the
      // caller merges on top of stale data and the queued update is lost.
      const read = await storage.get('analytics');
      expect(read.switchCount).toBe(2);
      expect(store.get('analytics')?.switchCount).toBe(1); // not flushed yet

      await vi.runAllTimersAsync();
      await setPromise;
      expect(store.get('analytics')?.switchCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
