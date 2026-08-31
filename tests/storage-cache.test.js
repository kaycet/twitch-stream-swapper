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

  it('reads queued (debounced, not yet flushed) writes instead of stale storage', async () => {
    await chrome.storage.local.set({ analytics: { switchCount: 1 } });

    // Debounced write sits in the queue for up to 300ms.
    await storage.set({ analytics: { switchCount: 2 } });

    // A read inside the debounce window must see the queued value, otherwise
    // read-modify-write callers (e.g. analytics) silently lose the update.
    const analytics = await storage.get('analytics');
    expect(analytics.switchCount).toBe(2);
  });

  it('does not share cache entries between get(key) and get([key])', async () => {
    await chrome.storage.local.set({ streams: [{ username: 'a', priority: 1 }] });

    // get([key]) resolves to a {key: value} object and get(key) to the bare
    // value; a shared cache entry would hand one caller the other's shape.
    const asObject = await storage.get(['streams']);
    expect(asObject.streams).toHaveLength(1);

    const asValue = await storage.get('streams');
    expect(Array.isArray(asValue)).toBe(true);
    expect(asValue).toHaveLength(1);
  });

  it('keeps failed writes queued so a later flush retries them', async () => {
    chrome.storage.local.set.mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'));

    await expect(storage.set({ analytics: { switchCount: 5 } }, true)).rejects.toThrow();
    expect(store.get('analytics')).toBeUndefined();

    // The failed value must survive in the queue: reads still see it, and the
    // next flush persists it.
    expect(await storage.get('analytics')).toEqual({ switchCount: 5 });
    await storage.set({ settings: { theme: 'default' } }, true);
    expect(store.get('analytics')).toEqual({ switchCount: 5 });
  });

  it('lets a newer queued value win over a re-queued failed write', async () => {
    chrome.storage.local.set.mockRejectedValueOnce(new Error('transient'));
    await expect(storage.set({ analytics: { switchCount: 1 } }, true)).rejects.toThrow();

    // Queue a newer value for the same key, then flush.
    await storage.set({ analytics: { switchCount: 2 } }, true);
    expect(store.get('analytics')).toEqual({ switchCount: 2 });
  });

  it('persists settings immediately, without waiting for the debounce flush', async () => {
    // The popup/options page can close (and the MV3 service worker can
    // suspend) within the 300ms debounce window, so saveSettings must hit
    // chrome.storage before it resolves.
    await storage.saveSettings({ theme: 'midnight' });
    expect(store.get('settings')?.theme).toBe('midnight');
  });
});


