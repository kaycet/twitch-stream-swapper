import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for utils/managed-tab.js — the shared "which Twitch tab should
 * Auto-Swap manage" picker. Enabling Auto-Swap from the Options page used to
 * skip this binding entirely (only the popup ran it), leaving redirectEnabled
 * on with no managed tab, so nothing ever switched.
 */

function installChrome({ activeTab = null, twitchTabs = [], createdTab = { id: 77 } } = {}) {
  const create = vi.fn((opts, cb) => cb(createdTab ?? undefined));
  globalThis.chrome = {
    tabs: {
      query: vi.fn((q, cb) => {
        if (q.active) return cb(activeTab ? [activeTab] : []);
        return cb(twitchTabs);
      }),
      create,
    },
  };
  return { create };
}

describe('pickManagedTwitchTabId', () => {
  let pickManagedTwitchTabId;

  beforeEach(async () => {
    vi.resetModules();
    ({ pickManagedTwitchTabId } = await import('../utils/managed-tab.js'));
  });

  it('prefers the active tab when it is a Twitch tab', async () => {
    const { create } = installChrome({
      activeTab: { id: 5, url: 'https://www.twitch.tv/somechannel' },
      twitchTabs: [{ id: 9, url: 'https://www.twitch.tv/other' }],
    });
    expect(await pickManagedTwitchTabId()).toBe(5);
    expect(create).not.toHaveBeenCalled();
  });

  it('falls back to the first open Twitch tab when the active tab is not Twitch', async () => {
    const { create } = installChrome({
      activeTab: { id: 5, url: 'https://example.com/' },
      twitchTabs: [{ id: 9, url: 'https://www.twitch.tv/other' }, { id: 10 }],
    });
    expect(await pickManagedTwitchTabId()).toBe(9);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a new Twitch tab when none exists', async () => {
    const { create } = installChrome({ activeTab: null, twitchTabs: [] });
    expect(await pickManagedTwitchTabId()).toBe(77);
    expect(create).toHaveBeenCalledWith({ url: 'https://www.twitch.tv/' }, expect.any(Function));
  });

  it('returns null when tab creation yields nothing', async () => {
    installChrome({ activeTab: null, twitchTabs: [], createdTab: null });
    expect(await pickManagedTwitchTabId()).toBe(null);
  });

  it('still tries to create a tab when tabs.query throws', async () => {
    const create = vi.fn((opts, cb) => cb({ id: 42 }));
    globalThis.chrome = {
      tabs: {
        query: vi.fn(() => {
          throw new Error('boom');
        }),
        create,
      },
    };
    expect(await pickManagedTwitchTabId()).toBe(42);
  });
});
