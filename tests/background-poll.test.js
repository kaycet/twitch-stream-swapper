import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * End-to-end tests for the background worker's poll loop, driven through
 * the TSR_FORCE_POLL message with a fake chrome.
 *
 * Every other suite here tests utils/ in isolation, which is exactly how
 * the "skip no-op per-poll storage writes" optimisation shipped broken:
 * mergeStatusUpdates was correct on its own, but in background.js both of
 * its inputs were the same cached array — StorageManager.get() hands back
 * the very object it cached, and the poll loop writes this poll's statuses
 * onto those stream objects before the post-poll re-read. Every field then
 * compared equal to itself, the save was skipped, and storage kept
 * wasLive false, re-firing "went live" on every service-worker restart.
 *
 * These tests load background.js for real, so that class of wiring bug
 * cannot hide behind a green pure-function suite again.
 */

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function makeHarness() {
  const store = new Map();
  const storageListeners = [];
  const messageListeners = [];
  const notifications = [];

  const chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      onSuspend: { addListener: () => {} },
      sendMessage: async () => ({}),
    },
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const key of (Array.isArray(keys) ? keys : [keys])) {
            if (store.has(key)) out[key] = clone(store.get(key));
          }
          return out;
        },
        async set(items) {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: clone(store.get(key)), newValue: clone(value) };
            store.set(key, clone(value));
          }
          for (const fn of storageListeners) fn(changes, 'local');
        },
        async remove(keys) {
          for (const key of (Array.isArray(keys) ? keys : [keys])) store.delete(key);
        },
      },
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },
    alarms: { create: () => {}, clear: () => {}, onAlarm: { addListener: () => {} } },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setTitle: () => {} },
    tabs: {
      query: (_query, cb) => cb([]),
      create: (_opts, cb) => cb({ id: 1 }),
      get: (id, cb) => cb({ id, url: 'https://www.twitch.tv/somechannel', windowId: 1, status: 'complete' }),
      update: (id, _props, cb) => cb({ id }),
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
    windows: { update: (_id, _props, cb) => cb() },
    notifications: {
      create: (id) => notifications.push(id),
      clear: () => {},
      onButtonClicked: { addListener: () => {} },
      onClosed: { addListener: () => {} },
      onClicked: { addListener: () => {} },
    },
    idle: { queryState: (_s, cb) => cb('active'), onStateChanged: { addListener: () => {} } },
  };

  return { store, chrome, messageListeners, notifications };
}

describe('background poll loop', () => {
  let harness;
  let api;
  let storage;
  let live;
  let forcePoll;

  beforeEach(async () => {
    vi.resetModules();
    harness = makeHarness();
    globalThis.chrome = harness.chrome;
    live = false;

    harness.store.set('settings', {
      clientId: 'test-client-id',
      redirectEnabled: false,
      notificationsEnabled: true,
      premiumStatus: false,
      checkInterval: 60000,
      managedTwitchTabId: null,
      fallbackCategory: '',
      quietHours: { enabled: false },
    });
    harness.store.set('streams', [
      { username: 'alpha', priority: 1, notify: true, isLive: false, wasLive: false, streamData: null },
    ]);

    api = (await import('../utils/twitch-api.js')).default;
    api.initialize = async () => {};
    api.checkStreamsStatus = async () => (live
      ? { alpha: { title: 'T', game_name: 'G', viewer_count: 5, started_at: 'x', thumbnail_url: 'u' } }
      : {});

    storage = (await import('../utils/storage.js')).default;
    await import('../background.js');

    const handler = harness.messageListeners[0];
    forcePoll = async () => {
      await new Promise((resolve) => handler({ type: 'TSR_FORCE_POLL' }, {}, resolve));
      // Drain microtasks only. Everything asserted here goes through
      // storage.set(..., true), which reaches chrome.storage.local.set
      // before it resolves; `analytics` is the one debounced key and
      // nothing below reads it. A fixed sleep would just be slower, and
      // would leave the previous case's pending flush landing in the next
      // case's store.
      for (let i = 0; i < 50; i += 1) await Promise.resolve();
    };
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  const stored = () => harness.store.get('streams')[0];

  it('persists a stream going live', async () => {
    await forcePoll();
    expect(stored().isLive).toBe(false);

    live = true;
    await forcePoll();

    expect(stored().isLive).toBe(true);
    expect(stored().wasLive).toBe(true);
    expect(stored().streamData).toMatchObject({ title: 'T', viewer_count: 5 });
  });

  it('persists a stream going offline again', async () => {
    live = true;
    await forcePoll();
    expect(stored().isLive).toBe(true);

    live = false;
    await forcePoll();

    expect(stored().isLive).toBe(false);
    expect(stored().wasLive).toBe(false);
    expect(stored().streamData).toBe(null);
  });

  it('persists a title or viewer-count change while a stream stays live', async () => {
    live = true;
    await forcePoll();
    expect(stored().streamData.viewer_count).toBe(5);

    // The commonest poll outcome by far: still live, only streamData moved.
    // This exercises the priorByUsername path end to end. It does NOT cover
    // statusSnapshot's deep copy -- background.js replaces streamData
    // wholesale, so a bare reference snapshot still points at the old
    // object and still reports the change. The deep copy is guarded by
    // "decouples the snapshot from streamData mutated in place" in
    // tests/stream-sync.test.js, which does fail without it.
    api.checkStreamsStatus = async () => ({
      alpha: { title: 'T2', game_name: 'G', viewer_count: 1234, started_at: 'x', thumbnail_url: 'u' },
    });
    await forcePoll();

    expect(stored().streamData.viewer_count).toBe(1234);
    expect(stored().streamData.title).toBe('T2');
  });

  it('does not re-notify after a service-worker restart while still live', async () => {
    live = true;
    await forcePoll();
    expect(harness.notifications).toHaveLength(1);

    await forcePoll();
    expect(harness.notifications).toHaveLength(1);

    // A restarted MV3 worker has an empty cache and must read wasLive back
    // out of storage. If the live transition was never persisted, this
    // fires a duplicate "went live" for a stream that never went offline.
    storage.cache.clear();
    await forcePoll();

    expect(harness.notifications).toHaveLength(1);
  });

  it('skips the streams write when nothing changed', async () => {
    await forcePoll();
    const setSpy = vi.spyOn(harness.chrome.storage.local, 'set');

    await forcePoll();

    const wroteStreams = setSpy.mock.calls.some(([items]) => 'streams' in items);
    expect(wroteStreams).toBe(false);
    setSpy.mockRestore();
  });
});
