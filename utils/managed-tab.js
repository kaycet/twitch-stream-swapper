/**
 * Picks the one Twitch tab Auto-Swap should manage.
 *
 * Shared by the popup and the options page so "Enable Auto-Switching" binds
 * a managed tab the same way everywhere. Without a managed tab id the
 * background worker refuses to switch or run category fallback, so saving
 * redirectEnabled without calling this leaves Auto-Swap enabled but inert.
 *
 * Preference order: the caller's active Twitch tab, then any open Twitch
 * tab, else a newly created twitch.tv tab. Returns null only when even
 * creating a tab fails.
 *
 * @param {Object} [tabsApi] - chrome.tabs (injectable for tests)
 * @returns {Promise<number|null>}
 */

import { isTwitchUrl } from './twitch-url.js';

export async function pickManagedTwitchTabId(tabsApi = globalThis.chrome?.tabs) {
  if (!tabsApi) return null;

  try {
    // Prefer the current active Twitch tab
    const activeTabs = await new Promise((resolve) => {
      tabsApi.query({ active: true, currentWindow: true }, resolve);
    });
    const activeTab = activeTabs?.[0];
    if (activeTab?.id && isTwitchUrl(activeTab.url || '')) {
      return activeTab.id;
    }

    // Otherwise, pick any existing Twitch tab (first match)
    const twitchTabs = await new Promise((resolve) => {
      tabsApi.query({ url: ['*://twitch.tv/*', '*://*.twitch.tv/*'] }, resolve);
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
      tabsApi.create({ url: 'https://www.twitch.tv/' }, resolve);
    });
    return created?.id ?? null;
  } catch (e) {
    console.warn('Failed to create Twitch tab:', e);
    return null;
  }
}
