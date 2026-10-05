import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for utils/managed-tab.js — the "which Twitch tab does Auto-Swap
 * manage" decision shared by the popup and the Options page. The Options
 * toggle used to skip this entirely: it saved redirectEnabled=true with no
 * managed tab, and nothing ever switched.
 */

function makeChromeStub({ activeTabs = [], twitchTabs = [], createdTab = { id: 77 } } = {}) {
  return {
    tabs: {
      query: vi.fn((queryInfo, callback) => {
        callback(queryInfo.active ? activeTabs : twitchTabs);
      }),
      create: vi.fn((createProperties, callback) => {
        callback(createdTab);
      }),
    },
  };
}

describe('pickManagedTwitchTabId', () => {
  let pickManagedTwitchTabId;

  beforeEach(async () => {
    vi.resetModules();
    ({ pickManagedTwitchTabId } = await import('../utils/managed-tab.js'));
  });

  it('prefers the active tab when it is a Twitch tab', async () => {
    globalThis.chrome = makeChromeStub({
      activeTabs: [{ id: 5, url: 'https://www.twitch.tv/somestreamer' }],
      twitchTabs: [{ id: 9, url: 'https://www.twitch.tv/other' }],
    });

    await expect(pickManagedTwitchTabId()).resolves.toBe(5);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('falls back to the first open Twitch tab when the active tab is not Twitch', async () => {
    globalThis.chrome = makeChromeStub({
      activeTabs: [{ id: 5, url: 'https://example.com/' }],
      twitchTabs: [{ id: 9, url: 'https://www.twitch.tv/other' }, { id: 10 }],
    });

    await expect(pickManagedTwitchTabId()).resolves.toBe(9);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('creates a Twitch tab when none exists', async () => {
    globalThis.chrome = makeChromeStub({ createdTab: { id: 42 } });

    await expect(pickManagedTwitchTabId()).resolves.toBe(42);
    expect(chrome.tabs.create).toHaveBeenCalledWith(
      { url: 'https://www.twitch.tv/' },
      expect.any(Function)
    );
  });

  it('returns null when tab creation yields nothing', async () => {
    globalThis.chrome = makeChromeStub({ createdTab: null });

    await expect(pickManagedTwitchTabId()).resolves.toBe(null);
  });

  it('still tries to create a tab when querying throws', async () => {
    globalThis.chrome = makeChromeStub({ createdTab: { id: 13 } });
    chrome.tabs.query.mockImplementation(() => {
      throw new Error('query unavailable');
    });

    await expect(pickManagedTwitchTabId()).resolves.toBe(13);
  });
});
