import { describe, it, expect } from 'vitest';
import { computeBadge, badgeStateFromStreams } from '../utils/badge.js';

describe('computeBadge', () => {
  it('shows the live count in purple when Auto-Swap is on', () => {
    const badge = computeBadge({ enabled: true, liveCount: 3, target: 'somestreamer' });
    expect(badge).toEqual({
      text: '3',
      color: '#9146ff',
      title: '3 live — watching somestreamer',
    });
  });

  it('shows no text but an ON title when enabled with nobody live', () => {
    const badge = computeBadge({ enabled: true, liveCount: 0 });
    expect(badge.text).toBe('');
    expect(badge.color).toBe('#9146ff');
    expect(badge.title).toBe('Auto-Swap ON — no one live');
  });

  it('uses gray when Auto-Swap is off, keeping the count glanceable', () => {
    const badge = computeBadge({ enabled: false, liveCount: 2 });
    expect(badge).toEqual({
      text: '2',
      color: '#5c5c66',
      title: 'Auto-Swap off — 2 live',
    });
  });

  it('handles off with nobody live', () => {
    const badge = computeBadge({ enabled: false, liveCount: 0 });
    expect(badge.text).toBe('');
    expect(badge.title).toBe('Auto-Swap off');
  });

  it('tolerates missing/invalid counts', () => {
    expect(computeBadge({ enabled: true, liveCount: undefined }).text).toBe('');
    expect(computeBadge({ enabled: false, liveCount: 'x' }).text).toBe('');
    expect(computeBadge().color).toBe('#5c5c66');
  });
});

describe('badgeStateFromStreams', () => {
  it('counts live streams and targets the highest-priority live one', () => {
    const state = badgeStateFromStreams([
      { username: 'third', priority: 3, isLive: true },
      { username: 'first', priority: 1, isLive: false },
      { username: 'second', priority: 2, isLive: true },
    ]);
    expect(state).toEqual({ liveCount: 2, target: 'second' });
  });

  it('returns no target when nobody is live', () => {
    const state = badgeStateFromStreams([
      { username: 'a', priority: 1, isLive: false },
      { username: 'b', priority: 2 },
    ]);
    expect(state).toEqual({ liveCount: 0, target: null });
  });

  it('sorts entries without a priority after prioritized ones', () => {
    const state = badgeStateFromStreams([
      { username: 'unranked', isLive: true },
      { username: 'ranked', priority: 5, isLive: true },
    ]);
    expect(state).toEqual({ liveCount: 2, target: 'ranked' });
  });

  it('ignores malformed entries and non-array input', () => {
    expect(badgeStateFromStreams(null)).toEqual({ liveCount: 0, target: null });
    expect(badgeStateFromStreams(undefined)).toEqual({ liveCount: 0, target: null });
    expect(badgeStateFromStreams([null, { isLive: true }, { username: 'ok', priority: 1, isLive: true }]))
      .toEqual({ liveCount: 1, target: 'ok' });
  });
});
