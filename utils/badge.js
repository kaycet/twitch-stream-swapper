/**
 * Toolbar badge presentation (pure, unit-tested).
 *
 * Both the background worker and the popup paint the action badge; sharing
 * the mapping here keeps them from fighting over conflicting schemes (the
 * popup used to write a green "ON" that the next poll repainted as a purple
 * live-count).
 */

/**
 * @param {Object} args
 * @param {boolean} args.enabled - Auto-Swap on/off
 * @param {number} [args.liveCount] - How many list streams are live
 * @param {string|null} [args.target] - Username Auto-Swap would watch, if any
 * @returns {{text: string, color: string, title: string}}
 */
/**
 * Derive the badge's live count and target from a stored stream list.
 *
 * Used when the badge is repainted outside a poll (settings changes, worker
 * init): the persisted isLive flags from the last poll are still accurate,
 * while painting a hardcoded 0 blanked the live count until the next poll.
 *
 * @param {Array<{username?: string, priority?: number, isLive?: boolean}>} streams
 * @returns {{liveCount: number, target: string|null}}
 */
export function badgeStateFromStreams(streams) {
  if (!Array.isArray(streams)) return { liveCount: 0, target: null };
  const live = streams
    .filter((s) => s?.isLive && s?.username)
    .sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
  return { liveCount: live.length, target: live[0]?.username || null };
}

export function computeBadge({ enabled, liveCount = 0, target = null } = {}) {
  const on = !!enabled;
  const count = Number(liveCount) || 0;
  const text = count > 0 ? String(count) : '';
  // Purple = Auto-Swap on, gray = off; the count stays glanceable either way.
  const color = on ? '#9146ff' : '#5c5c66';
  const title = on
    ? (target ? `${count} live — watching ${target}` : 'Auto-Swap ON — no one live')
    : (count > 0 ? `Auto-Swap off — ${count} live` : 'Auto-Swap off');
  return { text, color, title };
}
