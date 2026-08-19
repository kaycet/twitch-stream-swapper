/**
 * Display formatters for stream metadata. Pure, unit-tested.
 */

function abbreviate(value, divisor, suffix) {
  const scaled = Math.floor((value / divisor) * 10) / 10;
  const text = scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
  return `${text}${suffix}`;
}

/**
 * 999 -> "999", 1234 -> "1.2k", 2500000 -> "2.5m". Invalid -> "".
 * @param {number} count
 * @returns {string}
 */
export function formatViewers(count) {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return '';
  if (count < 1000) return String(count);
  if (count < 1000000) return abbreviate(count, 1000, 'k');
  return abbreviate(count, 1000000, 'm');
}

/**
 * Helix started_at -> "47m" / "3h 12m" / "26h 5m". Invalid or future -> "".
 * @param {string} startedAtIso
 * @param {Date} [now]
 * @returns {string}
 */
export function formatUptime(startedAtIso, now = new Date()) {
  if (!startedAtIso) return '';
  const started = new Date(startedAtIso);
  if (Number.isNaN(started.getTime())) return '';
  const totalMinutes = Math.floor((now - started) / 60000);
  if (totalMinutes < 0) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}
