/**
 * Toolbar badge state (pure, unit-tested).
 *
 * Single source of truth for the action badge so the popup and the background
 * worker render the same thing. They used to disagree (popup: "ON"/green,
 * background: live-count/purple), so opening the popup stomped the live count
 * until the next poll.
 */

/**
 * @param {Object} args
 * @param {boolean} args.enabled - Whether Auto-Swap is on
 * @param {number} [args.liveCount] - How many listed streams are live
 * @param {string|null} [args.target] - Username being watched, if any
 * @returns {{text: string, color: string, title: string}}
 */
export function badgeState({ enabled, liveCount = 0, target = null } = {}) {
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
