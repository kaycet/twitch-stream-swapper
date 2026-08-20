/**
 * Maps a polling error to a retry delay. Every error class retries —
 * a permanent stop turned transient token-broker hiccups into
 * "auto-swap silently dead until extension reload".
 */

/**
 * @param {{code?: string, retryAfter?: number, message?: string}|null|undefined} error
 * @returns {number} milliseconds to wait before re-arming the poll
 */
export function retryDelayMs(error) {
  const code = error?.code || '';
  const message = String(error?.message || '');

  if (code === 'AUTH_ERROR' || message.includes('Client ID') || message.includes('401')) {
    // Auth/broker outages tend to last longer; back off harder but recover.
    return 300000;
  }
  if (code === 'RATE_LIMIT') {
    return error?.retryAfter ? error.retryAfter * 1000 : 120000;
  }
  return 60000;
}
