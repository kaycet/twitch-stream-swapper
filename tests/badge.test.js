import { describe, it, expect } from 'vitest';
import { badgeState } from '../utils/badge.js';

describe('badgeState', () => {
  it('shows the live count when streams are live, empty text otherwise', () => {
    expect(badgeState({ enabled: true, liveCount: 3 }).text).toBe('3');
    expect(badgeState({ enabled: true, liveCount: 0 }).text).toBe('');
    expect(badgeState({ enabled: false, liveCount: 2 }).text).toBe('2');
  });

  it('uses purple when Auto-Swap is on and gray when off', () => {
    expect(badgeState({ enabled: true }).color).toBe('#9146ff');
    expect(badgeState({ enabled: false }).color).toBe('#5c5c66');
  });

  it('describes the current target in the title', () => {
    expect(badgeState({ enabled: true, liveCount: 2, target: 'somestreamer' }).title)
      .toBe('2 live — watching somestreamer');
    expect(badgeState({ enabled: true, liveCount: 0 }).title).toBe('Auto-Swap ON — no one live');
    expect(badgeState({ enabled: false, liveCount: 2 }).title).toBe('Auto-Swap off — 2 live');
    expect(badgeState({ enabled: false }).title).toBe('Auto-Swap off');
  });

  it('tolerates missing/invalid input', () => {
    expect(badgeState()).toEqual({ text: '', color: '#5c5c66', title: 'Auto-Swap off' });
    expect(badgeState({ enabled: true, liveCount: NaN }).text).toBe('');
  });
});
