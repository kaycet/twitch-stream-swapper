import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome mock with listener registries so we can dispatch events
// the way the browser would after an MV3 service-worker restart.
function makeChromeMock() {
  const buttonListeners = [];
  const clickListeners = [];
  return {
    notifications: {
      create: vi.fn(async () => {}),
      clear: vi.fn(),
      onButtonClicked: {
        addListener: vi.fn((fn) => buttonListeners.push(fn)),
        removeListener: vi.fn(),
      },
      onClicked: {
        addListener: vi.fn((fn) => clickListeners.push(fn)),
        removeListener: vi.fn(),
      },
      _emitButtonClick: (id, buttonIndex) => buttonListeners.forEach((fn) => fn(id, buttonIndex)),
      _emitClick: (id) => clickListeners.forEach((fn) => fn(id)),
      _listenerCount: () => buttonListeners.length + clickListeners.length,
    },
    tabs: {
      create: vi.fn(),
    },
  };
}

describe('notification click handling', () => {
  let chrome;
  let notificationManager;
  let usernameFromNotificationId;

  beforeEach(async () => {
    chrome = makeChromeMock();
    globalThis.chrome = chrome;
    vi.resetModules();
    const mod = await import('../utils/notifications.js');
    notificationManager = mod.default;
    usernameFromNotificationId = mod.usernameFromNotificationId;
  });

  it('parses the username out of live-notification ids', () => {
    expect(usernameFromNotificationId('stream-live-some_streamer42-1724400000000')).toBe('some_streamer42');
    expect(usernameFromNotificationId('tsr_autoswap_1724400000000')).toBeNull();
    expect(usernameFromNotificationId('stream-live-')).toBeNull();
    expect(usernameFromNotificationId(null)).toBeNull();
  });

  it('registers click listeners once at module load, not per notification', async () => {
    const countAfterLoad = chrome.notifications._listenerCount();
    expect(countAfterLoad).toBe(2); // one onButtonClicked + one onClicked

    await notificationManager.notifyStreamLive('streamer_a', 'Title', 'Game', null, 100);
    await notificationManager.notifyStreamLive('streamer_b', 'Title', 'Game', null, 100);

    // Old implementation leaked two listeners per notification.
    expect(chrome.notifications._listenerCount()).toBe(countAfterLoad);
  });

  it('opens the stream when the notification (or its button) is clicked', async () => {
    await notificationManager.notifyStreamLive('cool_streamer', 'Title', 'Game', null, 100);
    const notificationId = chrome.notifications.create.mock.calls[0][0];

    chrome.notifications._emitButtonClick(notificationId, 0);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.twitch.tv/cool_streamer' });
    expect(chrome.notifications.clear).toHaveBeenCalledWith(notificationId);

    chrome.tabs.create.mockClear();
    chrome.notifications._emitClick(notificationId);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.twitch.tv/cool_streamer' });
  });

  it('ignores clicks on non-live notifications (e.g. switch prompts)', () => {
    chrome.notifications._emitButtonClick('tsr_autoswap_1724400000000', 0);
    chrome.notifications._emitClick('unrelated-id');
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
