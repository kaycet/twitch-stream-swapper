/**
 * Toolbar badge state (pure function).
 *
 * Single source of truth for the badge text/color/title so the popup and the
 * background worker cannot disagree about what the badge shows.
 */

/**
 * @param {Object} args
 * @param {boolean} args.enabled - Auto-Swap on/off
 * @param {number} [args.liveCount] - Number of live streams in the list
 * @param {string|null} [args.target] - Username of the current highest-priority live stream
 * @returns {{text: string, color: string, title: string}}
 */
export function badgeState({ enabled, liveCount = 0, target = null } = {}) {
  const on = !!enabled;
  const count = Number(liveCount) || 0;
  // Purple = Auto-Swap on, gray = off; the count stays glanceable either way.
  return {
    text: count > 0 ? String(count) : '',
    color: on ? '#9146ff' : '#5c5c66',
    title: on
      ? (target ? `${count} live — watching ${target}` : 'Auto-Swap ON — no one live')
      : (count > 0 ? `Auto-Swap off — ${count} live` : 'Auto-Swap off'),
  };
}
