import { describe, expect, it } from 'vitest';
import { overlayStreamStatuses } from '../utils/stream-sync.js';

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
