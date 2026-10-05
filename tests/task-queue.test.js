import { describe, it, expect, vi } from 'vitest';
import { createTaskQueue } from '../utils/task-queue.js';

/**
 * Tests for utils/task-queue.js — the FIFO the background worker runs every
 * poll through. Polls await network calls, so without the queue a forced
 * poll (which bypasses the 5s throttle) interleaved with the alarm poll and
 * both saw wasLive=false for a stream that just went live: duplicate
 * "went live" notifications and switch-prompt cards.
 */

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createTaskQueue', () => {
  it('runs tasks strictly one at a time, in order', async () => {
    const enqueue = createTaskQueue();
    const events = [];
    const gate = deferred();

    const first = enqueue(async () => {
      events.push('first:start');
      await gate.promise;
      events.push('first:end');
    });
    const second = enqueue(async () => {
      events.push('second:start');
    });

    // Give the second task every chance to start early (the old overlap bug).
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('returns each task its own result', async () => {
    const enqueue = createTaskQueue();
    await expect(enqueue(() => 'a')).resolves.toBe('a');
    await expect(enqueue(async () => 'b')).resolves.toBe('b');
  });

  it('delivers a rejection to its caller without blocking later tasks', async () => {
    const enqueue = createTaskQueue();
    const boom = new Error('boom');

    const failing = enqueue(() => Promise.reject(boom));
    const after = enqueue(() => 'survived');

    await expect(failing).rejects.toBe(boom);
    await expect(after).resolves.toBe('survived');
  });

  it('treats a synchronous throw like a rejection', async () => {
    const enqueue = createTaskQueue();
    const task = vi.fn(() => {
      throw new Error('sync boom');
    });

    await expect(enqueue(task)).rejects.toThrow('sync boom');
    await expect(enqueue(() => 'next')).resolves.toBe('next');
    expect(task).toHaveBeenCalledTimes(1);
  });
});
