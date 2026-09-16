/**
 * Viewing-time crediting for the analytics feature (pure, unit-tested).
 *
 * The background worker used to add a full checkInterval of "viewing time"
 * on every poll, no matter how long ago the previous poll actually ran.
 * Forced polls made that visibly wrong: every popup interaction (adding,
 * removing, or reordering a stream) triggers one, and each credited a whole
 * interval — 10 minutes per click at the 10-minute setting. Crediting real
 * elapsed time, capped at one interval, keeps the stat honest in both
 * directions: rapid polls credit seconds, and a worker that slept through
 * several intervals cannot fabricate hours of watching.
 */

/**
 * Seconds of viewing time to credit for this poll.
 *
 * @param {Object} args
 * @param {number} args.nowMs - Current epoch ms
 * @param {number|undefined} args.lastUpdateMs - Epoch ms of the previous
 *   credit; missing on the first poll ever, which only sets the baseline
 * @param {number} args.checkIntervalMs - Configured poll interval
 * @returns {number} Whole seconds, 0..checkIntervalMs/1000
 */
export function viewingCreditSeconds({ nowMs, lastUpdateMs, checkIntervalMs } = {}) {
  const interval = Number(checkIntervalMs) > 0 ? Number(checkIntervalMs) : 60000;
  const last = Number(lastUpdateMs);
  // No baseline yet (first poll ever, or a corrupt value): start one, credit
  // nothing — there is no elapsed span to measure.
  if (!Number.isFinite(last) || last <= 0) return 0;
  const elapsedMs = Number(nowMs) - last;
  // Clock went backwards (NTP correction, manual change): credit nothing.
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(Math.floor(elapsedMs / 1000), Math.floor(interval / 1000));
}
