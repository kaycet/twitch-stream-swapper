import { describe, it, expect, vi } from 'vitest';
import { memoizeAsync } from '../utils/memoize-async.js';

describe('memoizeAsync', () => {
  it('runs the task once and shares the result across calls', async () => {
    const task = vi.fn(async () => 'ready');
    const init = memoizeAsync(task);
    await expect(Promise.all([init(), init()])).resolves.toEqual(['ready', 'ready']);
    await expect(init()).resolves.toBe('ready');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('retries on the next call after a rejection instead of caching the failure', async () => {
    let attempt = 0;
    const task = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('storage unavailable');
      return 'ready';
    });
    const init = memoizeAsync(task);
    await expect(init()).rejects.toThrow('storage unavailable');
    await expect(init()).resolves.toBe('ready');
    expect(task).toHaveBeenCalledTimes(2);
  });
});
