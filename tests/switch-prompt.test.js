import { describe, it, expect } from 'vitest';
import {
  AUTOSWAP_PREFIX,
  SNOOZE_MS,
  SWITCH_BUTTON,
  NOT_NOW_BUTTON,
  isAutoswapNotificationId,
  makeAutoswapNotificationId,
  planSwitchPrompt,
  planPromptResponse,
  isPendingNotification,
} from '../utils/switch-prompt.js';

const NOW = 1_724_800_000_000;
const pending = (over = {}) => ({
  notificationId: `${AUTOSWAP_PREFIX}${NOW - 1000}`,
  username: 'alice',
  createdAt: NOW - 1000,
  ...over,
});

describe('autoswap notification ids', () => {
  it('generates ids the guard recognises and other features do not', () => {
    const id = makeAutoswapNotificationId(NOW);
    expect(id).toBe(`${AUTOSWAP_PREFIX}${NOW}`);
    expect(isAutoswapNotificationId(id)).toBe(true);
    expect(isAutoswapNotificationId('stream-live-alice-123')).toBe(false);
    expect(isAutoswapNotificationId(null)).toBe(false);
  });
});

describe('planSwitchPrompt', () => {
  it('does not prompt while snoozed (snooze read from storage, not memory)', () => {
    const plan = planSwitchPrompt({ pendingSwitch: null, snoozeUntil: NOW + 1, username: 'alice', now: NOW });
    expect(plan.prompt).toBe(false);
  });

  it('prompts once the snooze has expired', () => {
    const plan = planSwitchPrompt({ pendingSwitch: null, snoozeUntil: NOW - 1, username: 'alice', now: NOW });
    expect(plan).toEqual({ prompt: true, staleNotificationId: null });
  });

  it('suppresses a re-prompt for the same target inside the window', () => {
    const plan = planSwitchPrompt({ pendingSwitch: pending(), snoozeUntil: 0, username: 'alice', now: NOW });
    expect(plan.prompt).toBe(false);
  });

  it('re-prompts after the window and hands back the old card to clear', () => {
    const old = pending({ createdAt: NOW - SNOOZE_MS - 1 });
    const plan = planSwitchPrompt({ pendingSwitch: old, snoozeUntil: 0, username: 'alice', now: NOW });
    expect(plan).toEqual({ prompt: true, staleNotificationId: old.notificationId });
  });

  it('prompts for a new target and hands back the old card to clear', () => {
    const old = pending();
    const plan = planSwitchPrompt({ pendingSwitch: old, snoozeUntil: 0, username: 'bob', now: NOW });
    expect(plan).toEqual({ prompt: true, staleNotificationId: old.notificationId });
  });
});

describe('planPromptResponse', () => {
  it('treats a click on a card that is no longer pending as stale', () => {
    expect(planPromptResponse({ pendingSwitch: null, notificationId: 'tsr_autoswap_1', buttonIndex: 0, now: NOW }))
      .toEqual({ action: 'stale' });
    expect(planPromptResponse({ pendingSwitch: pending(), notificationId: 'tsr_autoswap_other', buttonIndex: 0, now: NOW }))
      .toEqual({ action: 'stale' });
  });

  it('the Switch button switches to the pending target', () => {
    const p = pending();
    expect(SWITCH_BUTTON).toBe(0); // first button in the card's button list
    expect(planPromptResponse({ pendingSwitch: p, notificationId: p.notificationId, buttonIndex: SWITCH_BUTTON, now: NOW }))
      .toEqual({ action: 'switch', username: 'alice' });
  });

  it('the Not now button snoozes for SNOOZE_MS from now', () => {
    const p = pending();
    expect(NOT_NOW_BUTTON).toBe(1);
    expect(planPromptResponse({ pendingSwitch: p, notificationId: p.notificationId, buttonIndex: NOT_NOW_BUTTON, now: NOW }))
      .toEqual({ action: 'snooze', snoozeUntil: NOW + SNOOZE_MS });
  });
});

describe('isPendingNotification', () => {
  it('matches only the stored pending card', () => {
    const p = pending();
    expect(isPendingNotification(p, p.notificationId)).toBe(true);
    expect(isPendingNotification(p, 'tsr_autoswap_other')).toBe(false);
    expect(isPendingNotification(null, p.notificationId)).toBe(false);
  });
});
