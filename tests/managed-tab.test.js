import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for utils/managed-tab.js — the managed-tab selection shared by the
 * popup and the Options page. Enabling Auto-Swap must always end with a
 * bound tab: prefer the active Twitch tab, else any open Twitch tab, else
 * open one.
 */

function makeChromeStub({ activeTabs = [], twitchTabs = [], created = { id: 99 } } = {}) {
  return {
    tabs: {
      query: vi.fn((queryInfo, callback) => {
        if (queryInfo.active) return callback(activeTabs);
        return callback(twitchTabs);
      }),
      create: vi.fn((createProps, callback) => callback(created)),
    },
  };
}

describe('pickManagedTwitchTabId', () => {
  let pickManagedTwitchTabId;

  beforeEach(async () => {
    vi.resetModules();
    ({ pickManagedTwitchTabId } = await import('../utils/managed-tab.js'));
  });

  afterEach(() => {
    delete globalThis.chrome;
    vi.restoreAllMocks();
  });

  it('prefers the active tab when it is a Twitch tab', async () => {
    globalThis.chrome = makeChromeStub({
      activeTabs: [{ id: 7, url: 'https://www.twitch.tv/somestreamer' }],
      twitchTabs: [{ id: 3, url: 'https://www.twitch.tv/other' }],
    });

    await expect(pickManagedTwitchTabId()).resolves.toBe(7);
    expect(globalThis.chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('falls back to the first open Twitch tab when the active tab is not Twitch', async () => {
    globalThis.chrome = makeChromeStub({
      activeTabs: [{ id: 7, url: 'https://example.com/' }],
      twitchTabs: [
        { id: 3, url: 'https://www.twitch.tv/other' },
        { id: 4, url: 'https://www.twitch.tv/another' },
      ],
    });

    await expect(pickManagedTwitchTabId()).resolves.toBe(3);
    expect(globalThis.chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('creates a Twitch tab when none exist', async () => {
    globalThis.chrome = makeChromeStub({ created: { id: 42 } });

    await expect(pickManagedTwitchTabId()).resolves.toBe(42);
    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith(
      { url: 'https://www.twitch.tv/' },
      expect.any(Function)
    );
  });

  it('creates a tab even when the queries throw', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.chrome = makeChromeStub({ created: { id: 42 } });
    globalThis.chrome.tabs.query = vi.fn(() => {
      throw new Error('tabs API unavailable');
    });

    await expect(pickManagedTwitchTabId()).resolves.toBe(42);
  });

  it('returns null when no tab can be created', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.chrome = makeChromeStub();
    globalThis.chrome.tabs.create = vi.fn(() => {
      throw new Error('cannot create tab');
    });

    await expect(pickManagedTwitchTabId()).resolves.toBe(null);
  });
});
