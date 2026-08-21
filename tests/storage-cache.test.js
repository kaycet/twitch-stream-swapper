import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome.storage.local mock
const store = new Map();
const storageChangedListeners = [];
globalThis.chrome = {
  storage: {
    onChanged: {
      addListener: (fn) => storageChangedListeners.push(fn),
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
    storageChangedListeners.length = 0;
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

  it('drops cached reads when another context writes to chrome.storage', async () => {
    // Writes from other extension contexts (popup/options/background) go
    // straight to chrome.storage.local and only surface here via onChanged.
    // Before the onChanged invalidation, the background could re-read a stale
    // cached streams list mid-poll and save it back, deleting a stream the
    // user had just added in the popup.
    await chrome.storage.local.set({ streams: [{ username: 'alpha', priority: 1 }] });
    expect(await storage.getStreams()).toHaveLength(1);

    await chrome.storage.local.set({
      streams: [
        { username: 'alpha', priority: 1 },
        { username: 'newcomer', priority: 2 },
      ],
    });
    storageChangedListeners.forEach((fn) => fn({ streams: {} }, 'local'));

    const after = await storage.getStreams();
    expect(after.map((s) => s.username)).toEqual(['alpha', 'newcomer']);
  });

  it('persists settings immediately, without waiting for the debounce flush', async () => {
    // The popup/options page can close (and the MV3 service worker can
    // suspend) within the 300ms debounce window, so saveSettings must hit
    // chrome.storage before it resolves.
    await storage.saveSettings({ theme: 'midnight' });
    expect(store.get('settings')?.theme).toBe('midnight');
  });
});


