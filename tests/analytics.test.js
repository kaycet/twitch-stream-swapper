import { describe, it, expect } from 'vitest';
import { viewingCreditSeconds } from '../utils/analytics.js';

const T0 = 1_700_000_000_000;

describe('viewingCreditSeconds', () => {
  it('credits nothing on the first poll ever (no baseline)', () => {
    expect(viewingCreditSeconds({ nowMs: T0, lastUpdateMs: undefined, checkIntervalMs: 60000 })).toBe(0);
    expect(viewingCreditSeconds({ nowMs: T0, lastUpdateMs: null, checkIntervalMs: 60000 })).toBe(0);
    expect(viewingCreditSeconds({ nowMs: T0, lastUpdateMs: 0, checkIntervalMs: 60000 })).toBe(0);
    expect(viewingCreditSeconds({ nowMs: T0, lastUpdateMs: 'garbage', checkIntervalMs: 60000 })).toBe(0);
  });

  it('credits real elapsed time for an on-schedule poll', () => {
    expect(viewingCreditSeconds({ nowMs: T0 + 60000, lastUpdateMs: T0, checkIntervalMs: 60000 })).toBe(60);
    expect(viewingCreditSeconds({ nowMs: T0 + 300000, lastUpdateMs: T0, checkIntervalMs: 300000 })).toBe(300);
  });

  it('credits only the seconds that actually passed on a forced poll', () => {
    // A popup add/remove/reorder forces a poll ~5s after the last one; the
    // old flat-interval crediting added a whole minute (or 10) per click.
    expect(viewingCreditSeconds({ nowMs: T0 + 5000, lastUpdateMs: T0, checkIntervalMs: 60000 })).toBe(5);
    expect(viewingCreditSeconds({ nowMs: T0 + 7500, lastUpdateMs: T0, checkIntervalMs: 600000 })).toBe(7);
    expect(viewingCreditSeconds({ nowMs: T0 + 900, lastUpdateMs: T0, checkIntervalMs: 60000 })).toBe(0);
  });

  it('caps the credit at one interval after a long gap', () => {
    // Worker suspended / machine asleep for 3 hours: crediting the whole gap
    // would fabricate watch time that never happened.
    const threeHours = 3 * 60 * 60 * 1000;
    expect(viewingCreditSeconds({ nowMs: T0 + threeHours, lastUpdateMs: T0, checkIntervalMs: 60000 })).toBe(60);
    expect(viewingCreditSeconds({ nowMs: T0 + threeHours, lastUpdateMs: T0, checkIntervalMs: 600000 })).toBe(600);
  });

  it('credits nothing when the clock went backwards', () => {
    expect(viewingCreditSeconds({ nowMs: T0 - 1000, lastUpdateMs: T0, checkIntervalMs: 60000 })).toBe(0);
    expect(viewingCreditSeconds({ nowMs: T0, lastUpdateMs: T0, checkIntervalMs: 60000 })).toBe(0);
  });

  it('falls back to a 60s interval when the configured one is invalid', () => {
    expect(viewingCreditSeconds({ nowMs: T0 + 120000, lastUpdateMs: T0, checkIntervalMs: 0 })).toBe(60);
    expect(viewingCreditSeconds({ nowMs: T0 + 120000, lastUpdateMs: T0, checkIntervalMs: undefined })).toBe(60);
    expect(viewingCreditSeconds({ nowMs: T0 + 120000, lastUpdateMs: T0, checkIntervalMs: -5 })).toBe(60);
  });
});
