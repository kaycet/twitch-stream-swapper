import { describe, it, expect } from 'vitest';
import { serializeAsync } from '../utils/serialize-async.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('serializeAsync', () => {
  it('runs a single call through to the task', async () => {
    const fn = serializeAsync(async (x) => x * 2);
    await expect(fn(21)).resolves.toBe(42);
  });

  it('never overlaps two runs: the second starts after the first finishes', async () => {
    const gate = deferred();
    const events = [];
    const fn = serializeAsync(async (label) => {
      events.push(`start:${label}`);
      if (label === 'a') await gate.promise;
      events.push(`end:${label}`);
    });

    const a = fn('a');
    const b = fn('b'); // must queue, not interleave
    // Give b every chance to (incorrectly) start while a is blocked.
    await new Promise((res) => setTimeout(res, 0));
    expect(events).toEqual(['start:a']);

    gate.resolve();
    await Promise.all([a, b]);
    expect(events).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });

  it('serializes many concurrent callers one at a time, in order', async () => {
    let active = 0;
    let maxActive = 0;
    const order = [];
    const fn = serializeAsync(async (i) => {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push(i);
      await new Promise((res) => setTimeout(res, 1));
      active--;
    });

    await Promise.all([fn(1), fn(2), fn(3), fn(4)]);
    expect(maxActive).toBe(1);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('a rejected run rejects its own caller but does not block the next one', async () => {
    let calls = 0;
    const fn = serializeAsync(async (fail) => {
      calls++;
      if (fail) throw new Error('boom');
      return 'ok';
    });

    const failing = fn(true);
    const following = fn(false);
    await expect(failing).rejects.toThrow('boom');
    await expect(following).resolves.toBe('ok');
    expect(calls).toBe(2);
  });

  it('preserves `this` for method-style use', async () => {
    const obj = {
      value: 7,
      read: serializeAsync(async function () { return this.value; }),
    };
    await expect(obj.read()).resolves.toBe(7);
  });
});
