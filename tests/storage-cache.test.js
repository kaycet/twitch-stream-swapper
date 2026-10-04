import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome.storage.local mock
const store = new Map();
const onChangedListeners = [];
globalThis.chrome = {
  storage: {
    onChanged: {
      addListener: vi.fn((fn) => {
        onChangedListeners.push(fn);
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
    onChangedListeners.length = 0;
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

  it('invalidates the cache when another context writes storage', async () => {
    // The popup, options page, and background worker each have their own
    // StorageManager. A write from the popup only reaches the background
    // through chrome.storage.onChanged — without invalidation there, the
    // background keeps polling a stale (e.g. empty) streams list.
    await chrome.storage.local.set({ streams: [] });
    const before = await storage.getStreams();
    expect(before).toHaveLength(0);

    // Simulate another context writing streams: storage changes underneath
    // us and the onChanged event fires in this context.
    await chrome.storage.local.set({ streams: [{ username: 'newbie', priority: 1 }] });
    onChangedListeners.forEach((fn) =>
      fn({ streams: { newValue: [{ username: 'newbie', priority: 1 }] } }, 'local')
    );

    const after = await storage.getStreams();
    expect(after).toHaveLength(1);
    expect(after[0].username).toBe('newbie');
  });

  it('does not let array-key reads poison the cache for string-key reads', async () => {
    // get('x') returns (and caches) the bare value; get(['x']) returns the
    // whole {x: value} result object. They used to share one cache slot, so
    // whichever ran first dictated the shape the other got back.
    await chrome.storage.local.set({ runtime: { fallback: { active: true } } });

    const asObject = await storage.get(['runtime']);
    expect(asObject.runtime.fallback.active).toBe(true);

    const asValue = await storage.get('runtime');
    expect(asValue.fallback.active).toBe(true);
  });

  it('does not let string-key reads poison the cache for array-key reads', async () => {
    await chrome.storage.local.set({ runtime: { fallback: { active: true } } });

    const asValue = await storage.get('runtime');
    expect(asValue.fallback.active).toBe(true);

    const asObject = await storage.get(['runtime']);
    expect(asObject.runtime.fallback.active).toBe(true);
  });

  it('keeps queued writes (and retries them) when the storage write fails', async () => {
    chrome.storage.local.set.mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'));

    // Immediate write surfaces the failure to the caller...
    await expect(storage.set({ analytics: { switchCount: 5 } }, true)).rejects.toThrow();

    // ...but the value must not be silently lost: reads still see it,
    expect(await storage.get('analytics')).toEqual({ switchCount: 5 });

    // and the next flush persists it.
    await storage.set({ streams: [] }, true);
    expect(store.get('analytics')).toEqual({ switchCount: 5 });
    expect(store.get('streams')).toEqual([]);
  });

  it('does not resurrect a failed write over a newer one for the same key', async () => {
    chrome.storage.local.set.mockRejectedValueOnce(new Error('transient failure'));

    await expect(storage.set({ analytics: { switchCount: 1 } }, true)).rejects.toThrow();

    // A newer write for the same key wins over the restored one.
    await storage.set({ analytics: { switchCount: 2 } }, true);
    expect(store.get('analytics')).toEqual({ switchCount: 2 });
    expect(await storage.get('analytics')).toEqual({ switchCount: 2 });
  });

  it('persists settings immediately, without waiting for the debounce flush', async () => {
    // The popup/options page can close (and the MV3 service worker can
    // suspend) within the 300ms debounce window, so saveSettings must hit
    // chrome.storage before it resolves.
    await storage.saveSettings({ theme: 'midnight' });
    expect(store.get('settings')?.theme).toBe('midnight');
  });
});


