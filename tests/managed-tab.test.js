import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for utils/managed-tab.js — the shared "which Twitch tab does
 * Auto-Swap manage" picker. Extracted from popup.js so the Options page can
 * bind a managed tab too: enabling Auto-Swap there used to save
 * redirectEnabled without a managed tab, leaving the toggle "ON" while the
 * background worker had no tab to switch.
 */

function makeChromeStub({ activeTab = null, twitchTabs = [], createdTab = { id: 77 } } = {}) {
  return {
    tabs: {
      query: vi.fn((queryInfo, cb) => {
        if (queryInfo.active) return cb(activeTab ? [activeTab] : []);
        return cb(twitchTabs);
      }),
      create: vi.fn((opts, cb) => cb(createdTab)),
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
  });

  it('prefers the active tab when it is a Twitch tab', async () => {
    globalThis.chrome = makeChromeStub({
      activeTab: { id: 5, url: 'https://www.twitch.tv/somechannel' },
      twitchTabs: [{ id: 9, url: 'https://www.twitch.tv/other' }],
    });
    await expect(pickManagedTwitchTabId()).resolves.toBe(5);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('falls back to any existing Twitch tab when the active tab is not Twitch', async () => {
    globalThis.chrome = makeChromeStub({
      activeTab: { id: 5, url: 'https://example.com/' },
      twitchTabs: [{ id: 9, url: 'https://www.twitch.tv/other' }],
    });
    await expect(pickManagedTwitchTabId()).resolves.toBe(9);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('creates a Twitch tab when none exists', async () => {
    globalThis.chrome = makeChromeStub({
      activeTab: { id: 5, url: 'chrome://extensions' },
      twitchTabs: [],
      createdTab: { id: 42 },
    });
    await expect(pickManagedTwitchTabId()).resolves.toBe(42);
    expect(chrome.tabs.create).toHaveBeenCalledWith(
      { url: 'https://www.twitch.tv/' },
      expect.any(Function),
    );
  });

  it('returns null when tab creation fails', async () => {
    globalThis.chrome = makeChromeStub({ activeTab: null, twitchTabs: [] });
    chrome.tabs.create.mockImplementation(() => {
      throw new Error('no browser UI');
    });
    await expect(pickManagedTwitchTabId()).resolves.toBe(null);
  });
});
