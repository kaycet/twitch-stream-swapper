import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managedTabAction } from '../utils/managed-tab.js';

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

  it('returns null when tab creation reports runtime.lastError', async () => {
    globalThis.chrome = makeChromeStub({ activeTab: null, twitchTabs: [] });
    chrome.runtime = { lastError: { message: 'Tab creation blocked' } };
    await expect(pickManagedTwitchTabId()).resolves.toBe(null);
  });
});

/**
 * managedTabAction — the Options page's bind/unbind decision.
 *
 * The off→on transition is not the only case that needs a binding: a stored
 * redirectEnabled of true with a null managedTwitchTabId is a broken state
 * (pickManagedTwitchTabId() can return null when tab creation is blocked,
 * and upgrades from builds predating the field land there too). The
 * background worker gates its missing-tab check on `managedTwitchTabId !=
 * null`, so nothing repairs it except opening the popup — Auto-Swap reads
 * "ON" and silently does nothing until then.
 */
describe('managedTabAction', () => {
  it('binds on an off -> on transition', () => {
    expect(managedTabAction({ wasEnabled: false, willBeEnabled: true, currentTabId: null }))
      .toBe('bind');
  });

  it('binds when already enabled but nothing is bound', () => {
    expect(managedTabAction({ wasEnabled: true, willBeEnabled: true, currentTabId: null }))
      .toBe('bind');
    expect(managedTabAction({ wasEnabled: true, willBeEnabled: true, currentTabId: undefined }))
      .toBe('bind');
  });

  it('leaves an existing binding alone', () => {
    expect(managedTabAction({ wasEnabled: true, willBeEnabled: true, currentTabId: 42 }))
      .toBe(null);
  });

  it('unbinds on an on -> off transition', () => {
    expect(managedTabAction({ wasEnabled: true, willBeEnabled: false, currentTabId: 42 }))
      .toBe('unbind');
  });

  it('does nothing when Auto-Swap stays off', () => {
    expect(managedTabAction({ wasEnabled: false, willBeEnabled: false, currentTabId: null }))
      .toBe(null);
  });

  it('treats tab id 0 as bound, not as missing', () => {
    expect(managedTabAction({ wasEnabled: true, willBeEnabled: true, currentTabId: 0 }))
      .toBe(null);
  });
});
