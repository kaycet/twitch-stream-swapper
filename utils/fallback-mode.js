/**
 * Fallback mode helpers (pure functions).
 *
 * We intentionally keep these helpers independent from Chrome APIs so we can unit test them.
 */

/**
 * Decide whether we should pick a new random stream for category fallback.
 *
 * Expected behavior:
 * - If `force` is true, always reroll.
 * - If we are already in fallback mode and currently watching a channel page,
 *   do NOT reroll on every poll (prevents constant refreshes).
 * - If the configured fallback category changed, reroll.
 *
 * @param {Object} args
 * @param {boolean} args.force
 * @param {boolean} args.isFallbackActive
 * @param {string|null} args.currentChannel - channel name if current page is a channel, else null
 * @param {string|null} args.runtimeCategory - the category that activated fallback (runtime)
 * @param {string|null} args.settingsCategory - the currently configured fallback category (settings)
 * @returns {boolean}
 */
export function shouldRerollCategoryFallback({
  force,
  isFallbackActive,
  currentChannel,
  runtimeCategory,
  settingsCategory,
}) {
  if (force) return true;

  const configured = String(settingsCategory || '').trim();
  const activeCategory = String(runtimeCategory || '').trim();

  // If the user changed the category, reroll to apply it.
  if (configured && activeCategory && configured.toLowerCase() !== activeCategory.toLowerCase()) {
    return true;
  }

  // If we're already in fallback and on a channel page, do NOT reroll each poll.
  if (isFallbackActive && currentChannel) return false;

  // Otherwise (e.g. not in fallback, or we navigated to non-channel Twitch pages), allow reroll.
  return true;
}



