import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for notification click handling in utils/notifications.js.
 *
 * Previously, notifyStreamLive() added a fresh onClicked/onButtonClicked
 * listener per notification. MV3 suspends the service worker ~30s after the
 * last event, so those dynamically-added closures were gone by the time the
 * user clicked the notification — "Watch Now" silently did nothing. The fix
 * registers the listeners once at module scope and delegates by id prefix.
 */

function makeChromeStub() {
  const buttonListeners = [];
  const clickListeners = [];
  return {
    runtime: { id: 'test-extension-id' },
    tabs: { create: vi.fn() },
    notifications: {
      create: vi.fn(async () => {}),
      clear: vi.fn(),
      onButtonClicked: { addListener: (fn) => buttonListeners.push(fn) },
      onClicked: { addListener: (fn) => clickListeners.push(fn) },
    },
    _fireButtonClick: (id, idx) => buttonListeners.forEach((fn) => fn(id, idx)),
    _fireClick: (id) => clickListeners.forEach((fn) => fn(id)),
    _buttonListeners: buttonListeners,
    _clickListeners: clickListeners,
  };
}

describe('channelFromNotificationId', () => {
  let channelFromNotificationId;

  beforeEach(async () => {
    vi.resetModules();
    ({ channelFromNotificationId } = await import('../utils/notifications.js'));
  });

  it('extracts the channel from stream-live ids, including underscored names', () => {
    expect(channelFromNotificationId('stream-live-somestreamer-1724800000000')).toBe('somestreamer');
    expect(channelFromNotificationId('stream-live-some_streamer_99-1724800000000')).toBe('some_streamer_99');
  });

  it('ignores ids from other features and malformed ids', () => {
    expect(channelFromNotificationId('tsr_autoswap_1724800000000')).toBe(null);
    expect(channelFromNotificationId('stream-live-')).toBe(null);
    expect(channelFromNotificationId('stream-live-nodigits-abc')).toBe(null);
    expect(channelFromNotificationId(null)).toBe(null);
    expect(channelFromNotificationId(undefined)).toBe(null);
  });
});

describe('module-level click delegation', () => {
  let chromeStub;

  beforeEach(async () => {
    vi.resetModules();
    chromeStub = makeChromeStub();
    vi.stubGlobal('chrome', chromeStub);
    await import('../utils/notifications.js');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers exactly one listener pair at import time', () => {
    expect(chromeStub._buttonListeners).toHaveLength(1);
    expect(chromeStub._clickListeners).toHaveLength(1);
  });

  it('opens the channel when a stream-live notification is clicked', () => {
    chromeStub._fireClick('stream-live-somestreamer-1724800000000');
    expect(chromeStub.tabs.create).toHaveBeenCalledWith({ url: 'https://www.twitch.tv/somestreamer' });
    expect(chromeStub.notifications.clear).toHaveBeenCalledWith('stream-live-somestreamer-1724800000000');
  });

  it('opens the channel for the "Watch Now" button but not other buttons', () => {
    chromeStub._fireButtonClick('stream-live-somestreamer-1724800000000', 1);
    expect(chromeStub.tabs.create).not.toHaveBeenCalled();

    chromeStub._fireButtonClick('stream-live-somestreamer-1724800000000', 0);
    expect(chromeStub.tabs.create).toHaveBeenCalledWith({ url: 'https://www.twitch.tv/somestreamer' });
  });

  it('does not react to switch-prompt notifications (owned by background.js)', () => {
    chromeStub._fireClick('tsr_autoswap_1724800000000');
    chromeStub._fireButtonClick('tsr_autoswap_1724800000000', 0);
    expect(chromeStub.tabs.create).not.toHaveBeenCalled();
    expect(chromeStub.notifications.clear).not.toHaveBeenCalled();
  });
});
