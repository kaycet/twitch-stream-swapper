/**
 * Per-channel Auto-Swap toggle (pure, unit-tested).
 *
 * A channel switched off in the popup stays in the list and keeps its live
 * status and notification bell, but Auto-Swap never picks it as a target.
 * `enabled` is missing on channels saved before the toggle existed, so only
 * an explicit `false` turns a channel off (same convention as `notify`).
 */

/**
 * @param {{enabled?: boolean}|null|undefined} stream
 * @returns {boolean}
 */
export function isSwapEnabled(stream) {
  return !!stream && stream.enabled !== false;
}

/**
 * Highest-priority channel that is live and switched on.
 *
 * @param {Array<{priority?: number, isLive?: boolean, enabled?: boolean}>} streams
 * @returns {Object|null}
 */
export function pickSwitchTarget(streams) {
  if (!Array.isArray(streams)) return null;
  const sorted = [...streams].sort((a, b) => (a?.priority ?? Infinity) - (b?.priority ?? Infinity));
  return sorted.find((s) => s?.isLive && isSwapEnabled(s)) || null;
}
