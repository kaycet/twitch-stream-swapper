import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome event mock that lets tests emit events and count listeners.
function makeEvent() {
  const listeners = [];
  return {
    addListener: vi.fn((fn) => listeners.push(fn)),
    removeListener: vi.fn((fn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    }),
    emit: (...args) => listeners.slice().forEach((fn) => fn(...args)),
    count: () => listeners.length,
  };
}

let chromeMock;

async function loadManager() {
  return (await import('../utils/notifications.js')).default;
}

beforeEach(() => {
  chromeMock = {
    notifications: {
      create: vi.fn(async () => {}),
      clear: vi.fn(),
      onClicked: makeEvent(),
      onButtonClicked: makeEvent(),
      onClosed: makeEvent(),
    },
    tabs: {
      create: vi.fn(),
    },
  };
  globalThis.chrome = chromeMock;
  vi.resetModules();
});

describe('NotificationManager', () => {
  it('registers one delegated listener set, not one pair per notification', async () => {
    const manager = await loadManager();
    await manager.notifyStreamLive('streamer_one', 'Title', 'Game', null, 10);
    await manager.notifyStreamLive('streamer_two', 'Title', 'Game', null, 10);
    await manager.notifyStreamLive('streamer_three', 'Title', 'Game', null, 10);

    // The old implementation added onClicked/onButtonClicked listeners per
    // notification and only removed them when that notification was clicked,
    // leaking a pair for every dismissed or ignored notification.
    expect(chromeMock.notifications.onClicked.count()).toBe(1);
    expect(chromeMock.notifications.onButtonClicked.count()).toBe(1);
    expect(chromeMock.notifications.onClosed.count()).toBe(1);
  });

  it('opens the channel for the notification that was clicked', async () => {
    const manager = await loadManager();
    await manager.notifyStreamLive('streamer_one', 'Title', 'Game', null, 10);
    await manager.notifyStreamLive('streamer_two', 'Title', 'Game', null, 10);

    const secondId = chromeMock.notifications.create.mock.calls[1][0];
    chromeMock.notifications.onClicked.emit(secondId);

    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://www.twitch.tv/streamer_two' });
    expect(chromeMock.notifications.clear).toHaveBeenCalledWith(secondId);
  });

  it('opens the channel when the "Watch Now" button is clicked', async () => {
    const manager = await loadManager();
    await manager.notifyStreamLive('streamer_one', 'Title', 'Game', null, 10);

    const id = chromeMock.notifications.create.mock.calls[0][0];
    chromeMock.notifications.onButtonClicked.emit(id, 0);

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://www.twitch.tv/streamer_one' });
  });

  it('forgets closed notifications so stale ids do nothing', async () => {
    const manager = await loadManager();
    await manager.notifyStreamLive('streamer_one', 'Title', 'Game', null, 10);

    const id = chromeMock.notifications.create.mock.calls[0][0];
    chromeMock.notifications.onClosed.emit(id, true);
    chromeMock.notifications.onClicked.emit(id);

    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it('ignores clicks on unrelated notification ids (e.g. switch prompts)', async () => {
    const manager = await loadManager();
    await manager.notifyStreamLive('streamer_one', 'Title', 'Game', null, 10);

    chromeMock.notifications.onClicked.emit('tsr_autoswap_12345');

    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.notifications.clear).not.toHaveBeenCalled();
  });

  it('resolves Helix thumbnail template placeholders in the icon URL', async () => {
    const manager = await loadManager();
    await manager.notifyStreamLive(
      'streamer_one',
      'Title',
      'Game',
      'https://static-cdn.jtvnw.net/previews-ttv/live_user_x-{width}x{height}.jpg',
      10
    );

    const options = chromeMock.notifications.create.mock.calls[0][1];
    expect(options.iconUrl).toBe('https://static-cdn.jtvnw.net/previews-ttv/live_user_x-128x72.jpg');
  });
});
