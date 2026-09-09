/**
 * Managed-tab selection for Auto-Swap (shared by the popup and options pages).
 *
 * Auto-Swap only ever redirects one "managed" Twitch tab, so enabling it must
 * bind that tab right away: prefer the active tab when it is on Twitch, else
 * any open Twitch tab, else create one.
 */

import { isTwitchUrl } from './twitch-url.js';

/**
 * Pick the Twitch tab Auto-Swap should manage, creating one if none exists.
 * @returns {Promise<number|null>} Tab id, or null when picking/creating failed.
 */
export async function pickManagedTwitchTabId() {
  try {
    // Prefer the current active Twitch tab
    const activeTabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    const activeTab = activeTabs?.[0];
    if (activeTab?.id && isTwitchUrl(activeTab.url || '')) {
      return activeTab.id;
    }

    // Otherwise, pick any existing Twitch tab (first match)
    const twitchTabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: ['*://twitch.tv/*', '*://*.twitch.tv/*'] }, resolve);
    });
    if (twitchTabs?.length) {
      return twitchTabs[0].id ?? null;
    }
  } catch (e) {
    console.warn('Failed to pick managed Twitch tab:', e);
  }

  // No Twitch tab found: create one and manage it.
  try {
    const created = await new Promise((resolve) => {
      chrome.tabs.create({ url: 'https://www.twitch.tv/' }, resolve);
    });
    return created?.id ?? null;
  } catch (e) {
    console.warn('Failed to create Twitch tab:', e);
    return null;
  }
}
