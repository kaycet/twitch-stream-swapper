/**
 * Prompt-before-switch bookkeeping (pure, unit-tested).
 *
 * The background worker asks "should I show a Switch-to-X? card right now"
 * and "what does this button click mean" through these helpers. Everything
 * they need (the pending card, the snooze deadline) comes from
 * chrome.storage so the answers survive MV3 service-worker suspension —
 * in-memory state does not.
 */

export const AUTOSWAP_PREFIX = 'tsr_autoswap_';

/** How long "Not now" snoozes prompts, and how long one card stays "outstanding". */
export const SNOOZE_MS = 5 * 60 * 1000;

/** Button indexes on the "Switch to X?" card, in creation order. */
export const SWITCH_BUTTON = 0;
export const NOT_NOW_BUTTON = 1;

export function makeAutoswapNotificationId(now = Date.now()) {
  return `${AUTOSWAP_PREFIX}${now}`;
}

export function isAutoswapNotificationId(notificationId) {
  return typeof notificationId === 'string' && notificationId.startsWith(AUTOSWAP_PREFIX);
}

export function isPendingNotification(pendingSwitch, notificationId) {
  return !!pendingSwitch && pendingSwitch.notificationId === notificationId;
}

/**
 * @param {Object} args
 * @param {{notificationId: string, username: string, createdAt: number}|null} args.pendingSwitch
 * @param {number} [args.snoozeUntil] - epoch ms, persisted
 * @param {string} args.username - target Auto-Swap wants to switch to
 * @param {number} [args.now]
 * @returns {{prompt: false} | {prompt: true, staleNotificationId: string|null}}
 *   When prompting, `staleNotificationId` is the previous card to clear so it
 *   cannot linger in the OS notification center with buttons that no-op.
 */
export function planSwitchPrompt({ pendingSwitch, snoozeUntil = 0, username, now = Date.now() }) {
  if (now < (Number(snoozeUntil) || 0)) return { prompt: false };

  if (pendingSwitch?.username === username
      && now - (pendingSwitch.createdAt || 0) < SNOOZE_MS) {
    return { prompt: false };
  }

  return { prompt: true, staleNotificationId: pendingSwitch?.notificationId || null };
}

/**
 * @returns {{action: 'stale'} | {action: 'switch', username: string} | {action: 'snooze', snoozeUntil: number}}
 */
export function planPromptResponse({ pendingSwitch, notificationId, buttonIndex, now = Date.now() }) {
  if (!isPendingNotification(pendingSwitch, notificationId)) return { action: 'stale' };
  if (buttonIndex === SWITCH_BUTTON) return { action: 'switch', username: pendingSwitch.username };
  return { action: 'snooze', snoozeUntil: now + SNOOZE_MS };
}
