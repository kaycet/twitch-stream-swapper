import { describe, it, expect } from 'vitest';
import { isSwapEnabled, pickSwitchTarget } from '../utils/stream-target.js';
import { badgeStateFromStreams } from '../utils/badge.js';

describe('isSwapEnabled', () => {
  it('treats channels saved before the toggle existed as on', () => {
    expect(isSwapEnabled({ username: 'a' })).toBe(true);
  });

  it('is off only for an explicit false', () => {
    expect(isSwapEnabled({ enabled: true })).toBe(true);
    expect(isSwapEnabled({ enabled: false })).toBe(false);
    expect(isSwapEnabled(null)).toBe(false);
  });
});

describe('pickSwitchTarget', () => {
  const list = [
    { username: 'second', priority: 2, isLive: true },
    { username: 'first', priority: 1, isLive: true, enabled: false },
    { username: 'third', priority: 3, isLive: true },
  ];

  it('skips a switched-off channel even when it has the top priority', () => {
    expect(pickSwitchTarget(list)?.username).toBe('second');
  });

  it('returns null when only switched-off channels are live', () => {
    expect(pickSwitchTarget([
      { username: 'a', priority: 1, isLive: true, enabled: false },
      { username: 'b', priority: 2, isLive: false },
    ])).toBe(null);
  });

  it('handles non-arrays', () => {
    expect(pickSwitchTarget(undefined)).toBe(null);
  });
});

describe('badgeStateFromStreams with switched-off channels', () => {
  it('counts every live channel but targets only one Auto-Swap would pick', () => {
    expect(badgeStateFromStreams([
      { username: 'off', priority: 1, isLive: true, enabled: false },
      { username: 'on', priority: 2, isLive: true },
    ])).toEqual({ liveCount: 2, target: 'on' });
  });
});
