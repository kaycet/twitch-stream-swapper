/**
 * Picking the single Twitch tab Auto-Swap manages.
 *
 * Shared by the popup and the Options page: enabling Auto-Swap must always
 * bind it to exactly one Twitch tab (creating one if none exists), or the
 * toggle reads "ON" while the background worker has no tab to switch — the
 * Options page used to save redirectEnabled without a managed tab, leaving
 * Auto-Swap silently inert until the popup was next opened.
 */

import { isTwitchUrl } from './twitch-url.js';

/**
 * Pick the Twitch tab Auto-Swap should manage: the active tab if it is a
 * Twitch tab, else any existing Twitch tab, else a newly created one.
 * @returns {Promise<number|null>} Tab id, or null if none could be found or created.
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
