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

describe('notification icons', () => {
  let chromeStub;
  let notificationManager;
  let thumbnailToDataUrl;

  // 1x1 PNG-ish payload; content doesn't matter, only that it round-trips.
  const IMAGE_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const THUMB_TEMPLATE = 'https://static-cdn.jtvnw.net/previews-ttv/live_user_somestreamer-{width}x{height}.jpg';

  function imageResponse({ ok = true, type = 'image/jpeg' } = {}) {
    return {
      ok,
      blob: async () => new Blob([IMAGE_BYTES], { type }),
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    chromeStub = makeChromeStub();
    vi.stubGlobal('chrome', chromeStub);
    ({ default: notificationManager, thumbnailToDataUrl } = await import('../utils/notifications.js'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('thumbnailToDataUrl inlines the image and substitutes template dimensions', async () => {
    const fetchMock = vi.fn(async () => imageResponse());
    vi.stubGlobal('fetch', fetchMock);

    const dataUrl = await thumbnailToDataUrl(THUMB_TEMPLATE);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://static-cdn.jtvnw.net/previews-ttv/live_user_somestreamer-128x72.jpg'
    );
    expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('thumbnailToDataUrl returns null on fetch failure, non-OK, or non-image responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await thumbnailToDataUrl(THUMB_TEMPLATE)).toBe(null);

    vi.stubGlobal('fetch', vi.fn(async () => imageResponse({ ok: false })));
    expect(await thumbnailToDataUrl(THUMB_TEMPLATE)).toBe(null);

    vi.stubGlobal('fetch', vi.fn(async () => imageResponse({ type: 'text/html' })));
    expect(await thumbnailToDataUrl(THUMB_TEMPLATE)).toBe(null);

    expect(await thumbnailToDataUrl('not a url')).toBe(null);
  });

  it('notifyStreamLive uses the inlined thumbnail, never the remote URL', async () => {
    // chrome.notifications.create rejects remote iconUrl values outright
    // ("Unable to download all specified images"), so passing the CDN URL
    // through silently dropped the notification.
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse()));

    await notificationManager.notifyStreamLive('somestreamer', 'Title', 'Just Chatting', THUMB_TEMPLATE, 123);

    expect(chromeStub.notifications.create).toHaveBeenCalledOnce();
    const [, options] = chromeStub.notifications.create.mock.calls[0];
    expect(options.iconUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('notifyStreamLive falls back to the packaged icon when the thumbnail download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    await notificationManager.notifyStreamLive('somestreamer', 'Title', 'Just Chatting', THUMB_TEMPLATE, 123);

    expect(chromeStub.notifications.create).toHaveBeenCalledOnce();
    const [, options] = chromeStub.notifications.create.mock.calls[0];
    expect(options.iconUrl).toBe('icons/icon-128.png');
  });

  it('notifyStreamLive retries with the packaged icon if create rejects the data URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse()));
    chromeStub.notifications.create
      .mockRejectedValueOnce(new Error('Unable to download all specified images.'))
      .mockResolvedValueOnce(undefined);

    await notificationManager.notifyStreamLive('somestreamer', 'Title', 'Just Chatting', THUMB_TEMPLATE, 123);

    expect(chromeStub.notifications.create).toHaveBeenCalledTimes(2);
    const [, retryOptions] = chromeStub.notifications.create.mock.calls[1];
    expect(retryOptions.iconUrl).toBe('icons/icon-128.png');
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
