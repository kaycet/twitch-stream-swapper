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
 * What a settings save should do to the managed-tab binding (pure).
 *
 * 'bind' covers two cases, not just the off→on toggle: a stored
 * redirectEnabled of true with no managed tab is a broken state that
 * nothing else repairs. The background worker's missing-tab check is gated
 * on `managedTwitchTabId != null`, so it never notices, and only the popup
 * fixes it on open — Auto-Swap reads "ON" and does nothing until then.
 * pickManagedTwitchTabId() returning null (tab creation blocked, or an
 * upgrade from a build that predates the field) is how you land there.
 *
 * @param {Object} args
 * @param {boolean} args.wasEnabled - stored redirectEnabled before this save
 * @param {boolean} args.willBeEnabled - redirectEnabled being saved
 * @param {number|null|undefined} args.currentTabId - stored managedTwitchTabId
 * @returns {'bind'|'unbind'|null} null means leave the binding alone
 */
export function managedTabAction({ wasEnabled, willBeEnabled, currentTabId } = {}) {
  if (willBeEnabled) {
    return (!wasEnabled || currentTabId == null) ? 'bind' : null;
  }
  return wasEnabled ? 'unbind' : null;
}

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
      chrome.tabs.create({ url: 'https://www.twitch.tv/' }, (tab) => {
        // Read lastError so a failed create resolves null instead of
        // logging "Unchecked runtime.lastError".
        if (chrome.runtime?.lastError) return resolve(null);
        resolve(tab);
      });
    });
    return created?.id ?? null;
  } catch (e) {
    console.warn('Failed to create Twitch tab:', e);
    return null;
  }
}
