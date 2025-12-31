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
});


