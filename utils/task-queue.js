/**
 * Minimal promise FIFO (pure, unit-tested): enqueue(task) runs tasks one at
 * a time, in order. Each caller gets its own task's promise — including its
 * rejection — and a rejected task never blocks or poisons the tasks queued
 * behind it.
 *
 * The background worker runs every poll through one of these. Polls await
 * network calls, so they interleave, and a forced poll (which bypasses the
 * 5s throttle by design) overlapping the alarm poll let both read
 * wasLive=false for a stream that just went live — double "went live"
 * notifications, duplicate switch-prompt cards, and two competing fallback
 * redirects.
 */

/**
 * @returns {<T>(task: () => Promise<T>|T) => Promise<T>}
 */
export function createTaskQueue() {
  let tail = Promise.resolve();
  return function enqueue(task) {
    const result = tail.then(() => task());
    // The next task waits for this one to settle, success or failure.
    tail = result.then(() => {}, () => {});
    return result;
  };
}
