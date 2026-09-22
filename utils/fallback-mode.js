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

/** Fields of the persisted fallback runtime that carry state (updatedAt is bookkeeping). */
const FALLBACK_STATE_FIELDS = ['active', 'category', 'username', 'reason'];

/**
 * Apply a partial fallback-state patch and report whether any state field
 * actually changed. The background worker persists its fallback runtime on
 * every poll "to keep it in sync", but in the steady state (someone from the
 * list is live, or fallback is parked on a channel) the patch is a no-op and
 * only the updatedAt timestamp would move — and that write fires
 * storage.onChanged in every context (cache flushes, a content-script
 * refresh in every Twitch tab) once per poll, forever. `changed` lets the
 * caller skip those writes.
 *
 * Patch semantics match setFallbackRuntime: `active` only applies when it is
 * a boolean; the other fields only when not undefined (null is meaningful).
 *
 * @param {Object|null|undefined} fallback - current fallback runtime state
 * @param {{active?: boolean, category?: string|null, username?: string|null, reason?: string|null}} [patch]
 * @returns {{fallback: Object, changed: boolean}} New state object (without
 *   updatedAt applied) and whether any state field differs.
 */
export function applyFallbackPatch(fallback, { active, category, username, reason } = {}) {
  const current = fallback || {};
  const next = {
    ...current,
    ...(typeof active === 'boolean' ? { active } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(username !== undefined ? { username } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
  const changed = FALLBACK_STATE_FIELDS.some((key) => next[key] !== current[key]);
  return { fallback: next, changed };
}



