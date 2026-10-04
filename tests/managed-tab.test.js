import { describe, it, expect, vi } from 'vitest';
import { pickManagedTwitchTabId } from '../utils/managed-tab.js';

// Callback-style chrome.tabs mock, like the real API surface the util wraps.
function makeTabsApi({ activeTab = null, twitchTabs = [], createdTab = { id: 99 } } = {}) {
  return {
    query: vi.fn((filter, cb) => {
      if (filter.active) return cb(activeTab ? [activeTab] : []);
      return cb(twitchTabs);
    }),
    create: vi.fn((opts, cb) => cb(createdTab)),
  };
}

describe('pickManagedTwitchTabId', () => {
  it('prefers the active tab when it is a Twitch tab', async () => {
    const tabs = makeTabsApi({
      activeTab: { id: 7, url: 'https://www.twitch.tv/somechannel' },
      twitchTabs: [{ id: 3, url: 'https://www.twitch.tv/other' }],
    });
    expect(await pickManagedTwitchTabId(tabs)).toBe(7);
    expect(tabs.create).not.toHaveBeenCalled();
  });

  it('falls back to the first open Twitch tab when the active tab is not Twitch', async () => {
    // From the options page the active tab is the options page itself, so
    // this is the path "Enable Auto-Switching" in Options takes.
    const tabs = makeTabsApi({
      activeTab: { id: 1, url: 'chrome-extension://abc/options.html' },
      twitchTabs: [{ id: 3, url: 'https://www.twitch.tv/other' }, { id: 4 }],
    });
    expect(await pickManagedTwitchTabId(tabs)).toBe(3);
    expect(tabs.create).not.toHaveBeenCalled();
  });

  it('creates a Twitch tab when none is open', async () => {
    const tabs = makeTabsApi({ twitchTabs: [], createdTab: { id: 42 } });
    expect(await pickManagedTwitchTabId(tabs)).toBe(42);
    expect(tabs.create).toHaveBeenCalledWith(
      { url: 'https://www.twitch.tv/' },
      expect.any(Function)
    );
  });

  it('still creates a tab when querying throws', async () => {
    const tabs = {
      query: vi.fn(() => {
        throw new Error('no tabs permission');
      }),
      create: vi.fn((opts, cb) => cb({ id: 11 })),
    };
    expect(await pickManagedTwitchTabId(tabs)).toBe(11);
  });

  it('returns null when creating the tab fails too', async () => {
    const tabs = {
      query: vi.fn((filter, cb) => cb([])),
      create: vi.fn(() => {
        throw new Error('cannot create');
      }),
    };
    expect(await pickManagedTwitchTabId(tabs)).toBe(null);
  });

  it('returns null when the tabs API is unavailable', async () => {
    expect(await pickManagedTwitchTabId(undefined)).toBe(null);
  });
});
