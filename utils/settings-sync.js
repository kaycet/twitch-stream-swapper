/**
 * Which settings fields changed in an external write (pure, unit-tested).
 *
 * The Options page renders its form once at load and general autosave writes
 * every general field back from the DOM. If settings change elsewhere while
 * the page is open — the popup enables Auto-Swap, the background worker
 * disables it when the managed tab closes — the form goes stale, and the
 * next autosave for an unrelated control silently reverts those changes.
 * The Options page uses this diff to re-sync only the controls whose stored
 * value actually changed, so in-progress edits to other controls survive.
 */

/**
 * Settings fields the Options page mirrors in form controls and re-syncs
 * when they change externally. Deliberately excludes:
 * - clientId: the Advanced section has its own dirty/Apply flow;
 * - managedTwitchTabId: not rendered anywhere on the Options page.
 */
export const OPTIONS_FORM_KEYS = [
  'checkInterval',
  'redirectEnabled',
  'promptBeforeSwitch',
  'fallbackCategory',
  'notificationsEnabled',
  'quietHours',
  'theme',
  'customTheme',
  'premiumStatus',
];

function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  // Plain-object fields (quietHours, customTheme) are rebuilt on every save,
  // so compare by content. Key order is stable: both sides are constructed
  // by the same code paths.
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * @param {Object|null|undefined} prev - settings the page currently mirrors
 * @param {Object|null|undefined} next - settings just written to storage
 * @param {string[]} [keys] - fields to compare
 * @returns {string[]} keys from `keys` whose value differs between the two
 */
export function changedSettingKeys(prev, next, keys = OPTIONS_FORM_KEYS) {
  const before = prev || {};
  const after = next || {};
  return keys.filter((key) => key in after && !sameValue(before[key], after[key]));
}
