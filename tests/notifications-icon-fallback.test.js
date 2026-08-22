import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome.notifications mock. create() rejects for remote icon URLs to
// simulate Chrome failing to download the Twitch thumbnail
// ("Unable to download all specified images").
const createMock = vi.fn();
globalThis.chrome = {
  notifications: {
    create: createMock,
    clear: vi.fn(),
    onButtonClicked: { addListener: vi.fn(), removeListener: vi.fn() },
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: { create: vi.fn() },
};

describe('notifyStreamLive icon fallback', () => {
  let notificationManager;

  beforeEach(async () => {
    vi.resetModules();
    createMock.mockReset();
    notificationManager = (await import('../utils/notifications.js')).default;
  });

  it('retries with the bundled icon when the thumbnail icon fails to load', async () => {
    // Capture iconUrl at call time: the retry reuses (and mutates) the same
    // options object, so mock.calls would only show the final value.
    const iconUrls = [];
    const ids = [];
    createMock.mockImplementation(async (id, options) => {
      iconUrls.push(options.iconUrl);
      ids.push(id);
      if (options.iconUrl.startsWith('https://')) {
        throw new Error('Unable to download all specified images.');
      }
      return id;
    });

    await notificationManager.notifyStreamLive(
      'somestreamer',
      'Playing games',
      'Just Chatting',
      'https://static-cdn.jtvnw.net/previews-ttv/live_user_somestreamer-{width}x{height}.jpg',
      1234
    );

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(iconUrls[0]).toContain('https://');
    expect(iconUrls[1]).toBe('icons/icon-128.png');
    // Same notification id on both attempts
    expect(ids[1]).toBe(ids[0]);
  });

  it('creates the notification once when the thumbnail icon loads', async () => {
    createMock.mockResolvedValue('ok');

    await notificationManager.notifyStreamLive(
      'somestreamer',
      'Playing games',
      'Just Chatting',
      'https://static-cdn.jtvnw.net/previews-ttv/live_user_somestreamer-{width}x{height}.jpg',
      1234
    );

    expect(createMock).toHaveBeenCalledTimes(1);
    // The {width}x{height} template placeholders must be substituted.
    expect(createMock.mock.calls[0][1].iconUrl).toBe(
      'https://static-cdn.jtvnw.net/previews-ttv/live_user_somestreamer-128x72.jpg'
    );
  });
});
