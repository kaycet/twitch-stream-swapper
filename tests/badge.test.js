import { describe, it, expect } from 'vitest';
import { badgeState } from '../utils/badge.js';

describe('badgeState', () => {
  it('shows the live count and purple when Auto-Swap is on and watching', () => {
    expect(badgeState({ enabled: true, liveCount: 2, target: 'streamer_a' })).toEqual({
      text: '2',
      color: '#9146ff',
      title: '2 live — watching streamer_a',
    });
  });

  it('shows no count when nobody is live', () => {
    expect(badgeState({ enabled: true, liveCount: 0 })).toEqual({
      text: '',
      color: '#9146ff',
      title: 'Auto-Swap ON — no one live',
    });
  });

  it('stays gray when Auto-Swap is off but still shows the live count', () => {
    expect(badgeState({ enabled: false, liveCount: 3 })).toEqual({
      text: '3',
      color: '#5c5c66',
      title: 'Auto-Swap off — 3 live',
    });
    expect(badgeState({ enabled: false, liveCount: 0 })).toEqual({
      text: '',
      color: '#5c5c66',
      title: 'Auto-Swap off',
    });
  });

  it('tolerates missing or invalid inputs', () => {
    expect(badgeState()).toEqual({ text: '', color: '#5c5c66', title: 'Auto-Swap off' });
    expect(badgeState({ enabled: true, liveCount: NaN }).text).toBe('');
  });
});
