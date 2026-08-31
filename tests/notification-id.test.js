import { describe, it, expect } from 'vitest';
import { parseStreamLiveNotificationId } from '../utils/notifications.js';

describe('parseStreamLiveNotificationId', () => {
  it('recovers the username from a stream-live notification id', () => {
    expect(parseStreamLiveNotificationId('stream-live-some_user1-1725000000000'))
      .toEqual({ username: 'some_user1' });
  });

  it('returns null for prompt-before-switch ids', () => {
    expect(parseStreamLiveNotificationId('tsr_autoswap_1725000000000')).toBeNull();
  });

  it('returns null for malformed or empty ids', () => {
    expect(parseStreamLiveNotificationId('')).toBeNull();
    expect(parseStreamLiveNotificationId(null)).toBeNull();
    expect(parseStreamLiveNotificationId('stream-live--123')).toBeNull();
    expect(parseStreamLiveNotificationId('stream-live-user')).toBeNull();
  });
});
