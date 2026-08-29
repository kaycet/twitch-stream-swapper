import { describe, expect, it } from 'vitest';
import {
  buildStreamLiveNotificationId,
  parseStreamLiveNotificationId,
} from '../utils/notifications.js';

describe('stream-live notification ids', () => {
  it('round-trips the username through the id', () => {
    const id = buildStreamLiveNotificationId('Some_Streamer42');
    expect(parseStreamLiveNotificationId(id)).toBe('Some_Streamer42');
  });

  it('parses ids regardless of when they were created', () => {
    expect(parseStreamLiveNotificationId('stream-live-cooluser-1700000000000')).toBe('cooluser');
  });

  it('returns null for other notification ids', () => {
    expect(parseStreamLiveNotificationId('tsr_autoswap_1700000000000')).toBeNull();
    expect(parseStreamLiveNotificationId('stream-live-')).toBeNull();
    expect(parseStreamLiveNotificationId('')).toBeNull();
    expect(parseStreamLiveNotificationId(null)).toBeNull();
  });
});
