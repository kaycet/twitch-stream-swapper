import { describe, expect, it } from 'vitest';
import { overlayStreamStatuses, mergeStatusUpdates, statusSnapshot } from '../utils/stream-sync.js';

/**
 * Regression tests for the popup ↔ background stream-state split.
 *
 * The popup saves its whole in-memory list on any edit. Without overlaying
 * the background's status writes first, a bell toggle saved a stale
 * wasLive=false for a stream that had been live for hours — and the next
 * background poll saw "went live" again and re-fired its notification.
 */

const local = (over = {}) => ({
  username: 'somestreamer',
  priority: 1,
  notify: false,
  isLive: false,
  wasLive: false,
  streamData: null,
  ...over,
});

describe('overlayStreamStatuses', () => {
  it('takes status fields from storage but keeps local list fields', () => {
    const data = { title: 'hi', game_name: 'g', viewer_count: 5, started_at: 't' };
    const { streams, changed } = overlayStreamStatuses(
      [local()],
      [{ username: 'somestreamer', priority: 3, notify: true, isLive: true, wasLive: true, streamData: data }]
    );

    expect(streams[0].isLive).toBe(true);
    expect(streams[0].wasLive).toBe(true);
    expect(streams[0].streamData).toEqual(data);
    // Local edits win for everything the popup owns.
    expect(streams[0].priority).toBe(1);
    expect(streams[0].notify).toBe(false);
    expect(changed).toBe(true);
  });

  it('keeps local membership and order (a stream removed locally stays removed)', () => {
    const { streams } = overlayStreamStatuses(
      [local({ username: 'b', priority: 1 }), local({ username: 'a', priority: 2 })],
      [
        { username: 'a', isLive: true, wasLive: true, streamData: {} },
        { username: 'removed', isLive: true, wasLive: true, streamData: {} },
      ]
    );

    expect(streams.map((s) => s.username)).toEqual(['b', 'a']);
    expect(streams[1].isLive).toBe(true);
  });

  it('reports changed=false for a wasLive-only update (no re-render needed)', () => {
    const { streams, changed } = overlayStreamStatuses(
      [local()],
      [{ username: 'somestreamer', isLive: false, wasLive: true, streamData: null }]
    );

    expect(streams[0].wasLive).toBe(true);
    expect(changed).toBe(false);
  });

  it('reports changed=true when a displayed streamData field moved', () => {
    const before = { title: 'hi', game_name: 'g', viewer_count: 5, started_at: 't' };
    const { changed } = overlayStreamStatuses(
      [local({ isLive: true, wasLive: true, streamData: before })],
      [{ username: 'somestreamer', isLive: true, wasLive: true, streamData: { ...before, viewer_count: 6 } }]
    );

    expect(changed).toBe(true);
  });

  it('reports changed=false when statuses are identical (own writes are a no-op)', () => {
    const data = { title: 'hi', game_name: 'g', viewer_count: 5, started_at: 't' };
    const mine = local({ isLive: true, wasLive: true, streamData: data });
    const { streams, changed } = overlayStreamStatuses([mine], [{ ...mine }]);

    expect(changed).toBe(false);
    expect(streams[0].isLive).toBe(true);
  });

  it('does not mutate its inputs', () => {
    const mine = local();
    overlayStreamStatuses([mine], [{ username: 'somestreamer', isLive: true, wasLive: true, streamData: {} }]);
    expect(mine.isLive).toBe(false);
    expect(mine.wasLive).toBe(false);
  });

  it('tolerates malformed input', () => {
    expect(overlayStreamStatuses(null, []).changed).toBe(false);
    expect(overlayStreamStatuses([local()], null).changed).toBe(false);
    const { streams } = overlayStreamStatuses([local()], [null, {}, { username: 'other' }]);
    expect(streams[0].isLive).toBe(false);
  });
});

/**
 * mergeStatusUpdates backs the background poll loop's "skip the save when
 * nothing changed" check. The worker used to write the streams list back
 * after every poll unconditionally — with everyone offline that was a
 * no-op write per poll, each one firing storage.onChanged in every context.
 */
describe('mergeStatusUpdates', () => {
  const updates = (entries) => new Map(Object.entries(entries));

  it('reports false when statuses are identical (everyone still offline)', () => {
    const streams = [local(), local({ username: 'other' })];
    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: false, wasLive: false, streamData: null },
      other: { isLive: false, wasLive: false, streamData: null },
    }));
    expect(changed).toBe(false);
    expect(streams[0].isLive).toBe(false);
  });

  it('reports false when a live stream repeats identical data', () => {
    const data = { title: 'hi', game_name: 'g', viewer_count: 5, started_at: 't' };
    const streams = [local({ isLive: true, wasLive: true, streamData: { ...data } })];
    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: true, wasLive: true, streamData: { ...data } },
    }));
    expect(changed).toBe(false);
  });

  it('applies and reports a stream going live', () => {
    const streams = [local()];
    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: true, wasLive: true, streamData: { title: 'live now' } },
    }));
    expect(changed).toBe(true);
    expect(streams[0].isLive).toBe(true);
    expect(streams[0].streamData).toEqual({ title: 'live now' });
  });

  it('reports a viewer-count-only change in streamData', () => {
    const before = { title: 'hi', viewer_count: 5 };
    const streams = [local({ isLive: true, wasLive: true, streamData: before })];
    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: true, wasLive: true, streamData: { ...before, viewer_count: 6 } },
    }));
    expect(changed).toBe(true);
    expect(streams[0].streamData.viewer_count).toBe(6);
  });

  it('reports true for a freshly added stream with unset status fields', () => {
    // { username, priority, addedAt } fresh from addStream: undefined -> false
    // still counts as a change so the initial statuses get persisted.
    const streams = [{ username: 'somestreamer', priority: 1, addedAt: 1 }];
    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: false, wasLive: false, streamData: null },
    }));
    expect(changed).toBe(true);
    expect(streams[0].isLive).toBe(false);
  });

  it('leaves streams without an update untouched (mid-poll list edits win)', () => {
    const added = { username: 'addedmidpoll', priority: 2, addedAt: 1 };
    const streams = [local(), added];
    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: false, wasLive: false, streamData: null },
    }));
    expect(changed).toBe(false);
    expect(streams[1]).toEqual(added);
  });

  it('keeps list fields intact while updating status fields in place', () => {
    const streams = [local({ notify: false, priority: 7 })];
    mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: true, wasLive: true, streamData: {} },
    }));
    expect(streams[0].priority).toBe(7);
    expect(streams[0].notify).toBe(false);
  });

  it('tolerates malformed input', () => {
    expect(mergeStatusUpdates(null, new Map())).toBe(false);
    expect(mergeStatusUpdates([local()], null)).toBe(false);
    expect(mergeStatusUpdates([null, {}], new Map([['x', { isLive: true }]]))).toBe(false);
  });
});

/**
 * statusSnapshot + mergeStatusUpdates' `priorByUsername`.
 *
 * StorageManager.get() caches and hands back the very array it cached, so
 * the worker's post-poll re-read can be the same objects the poll loop just
 * wrote this poll's statuses onto. Comparing those to the updates compares
 * them to themselves: a stream that went live reported "nothing changed",
 * the save was skipped, and storage kept wasLive false forever — which
 * re-fired the "went live" notification on every service-worker restart.
 */
describe('mergeStatusUpdates with a prior snapshot', () => {
  const updates = (entries) => new Map(Object.entries(entries));

  it('detects a change the aliased list cannot see', () => {
    const streams = [local({ isLive: false, wasLive: false, streamData: null })];
    const prior = statusSnapshot(streams);

    // The poll loop mutates the shared objects, then the "re-read" aliases them.
    streams[0].isLive = true;
    streams[0].wasLive = true;
    streams[0].streamData = { title: 'live now' };

    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: true, wasLive: true, streamData: { title: 'live now' } },
    }), prior);

    expect(changed).toBe(true);
  });

  it('still reports false when the statuses genuinely did not move', () => {
    const streams = [local({ isLive: false, wasLive: false, streamData: null })];
    const prior = statusSnapshot(streams);

    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: false, wasLive: false, streamData: null },
    }), prior);

    expect(changed).toBe(false);
  });

  it('detects a change the snapshot cannot see (list re-read mid-poll)', () => {
    const prior = statusSnapshot([local({ isLive: true, wasLive: true, streamData: null })]);
    // Re-read really did come back from storage, with an older status.
    const streams = [local({ isLive: false, wasLive: false, streamData: null })];

    const changed = mergeStatusUpdates(streams, updates({
      somestreamer: { isLive: true, wasLive: true, streamData: null },
    }), prior);

    expect(changed).toBe(true);
    expect(streams[0].isLive).toBe(true);
  });

  it('snapshots by value and skips entries without a username', () => {
    const stream = local({ isLive: false, streamData: { title: 'a' } });
    const snap = statusSnapshot([stream, {}, null]);

    stream.isLive = true;
    stream.streamData = { title: 'b' };

    expect(snap.size).toBe(1);
    expect(snap.get('somestreamer')).toEqual({ isLive: false, wasLive: false, streamData: { title: 'a' } });
  });

  it('decouples the snapshot from streamData mutated in place', () => {
    // The fix only works if the snapshot holds the PRE-poll streamData. A
    // bare reference copy would be defeated by any code that merged into
    // the stored object instead of replacing it, silently restoring the
    // original bug for every title/viewer-count change.
    const stream = local({ isLive: true, wasLive: true, streamData: { title: 'a', viewer_count: 1 } });
    const snap = statusSnapshot([stream]);

    Object.assign(stream.streamData, { title: 'b', viewer_count: 2 });

    expect(snap.get('somestreamer').streamData).toEqual({ title: 'a', viewer_count: 1 });

    const changed = mergeStatusUpdates([stream], new Map([
      ['somestreamer', { isLive: true, wasLive: true, streamData: stream.streamData }],
    ]), snap);
    expect(changed).toBe(true);
  });

  it('tolerates malformed input', () => {
    expect(statusSnapshot(null).size).toBe(0);
    expect(mergeStatusUpdates([local()], new Map(), 'not a map')).toBe(false);
  });
});
