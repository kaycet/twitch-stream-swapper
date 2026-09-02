/**
 * Run an async task once and share its promise with every caller — but if
 * it rejects, forget it so the next caller retries instead of inheriting a
 * permanently failed promise. Used for the background worker's init(): a
 * transient storage error on wake must not kill every listener until the
 * service worker restarts.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @returns {() => Promise<T>}
 */
export function memoizeAsync(task) {
  let inflight = null;
  return () => {
    if (!inflight) {
      inflight = Promise.resolve().then(task).catch((err) => {
        inflight = null;
        throw err;
      });
    }
    return inflight;
  };
}
