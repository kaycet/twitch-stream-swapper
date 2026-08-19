/**
 * Quiet hours — suppress notifications inside a user-set local-time window.
 * Pure module so the window math is unit-testable.
 */

function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * @param {{enabled?: boolean, start?: string, end?: string}|null|undefined} config
 * @param {Date} [date]
 * @returns {boolean} true when notifications should be suppressed
 */
export function isQuietHours(config, date = new Date()) {
  if (!config?.enabled) return false;
  const start = toMinutes(config.start);
  const end = toMinutes(config.end);
  if (start === null || end === null || start === end) return false;

  const now = date.getHours() * 60 + date.getMinutes();
  // start < end: same-day window. start > end: spans midnight.
  return start < end
    ? now >= start && now < end
    : now >= start || now < end;
}
