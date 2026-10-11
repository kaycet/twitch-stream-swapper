/**
 * Serialize an async task: concurrent calls wait for the in-flight run to
 * finish and then run themselves, instead of interleaving with it.
 *
 * Used for the background worker's pollStreams(): the popup's forced poll
 * (add/remove/reorder/enable) bypasses the 5s throttle by design, so it
 * could interleave with an alarm poll that was mid-await on the network.
 * Both polls then share the same pre-save wasLive snapshot and both fire
 * "went live" notifications and switch-prompt cards for the same stream.
 *
 * @template {(...args: any[]) => Promise<any>} T
 * @param {T} task
 * @returns {T}
 */
export function serializeAsync(task) {
  let inflight = null;
  return async function (...args) {
    // Loop, not a single check: when several callers are queued on the same
    // in-flight promise, they all resume in one batch, and only the first
    // one to re-check may start (its synchronous re-assignment of `inflight`
    // sends the rest back to waiting).
    while (inflight) {
      await inflight;
    }
    const run = task.apply(this, args);
    // Waiters must never see a rejection from someone else's run.
    inflight = Promise.resolve(run).catch(() => {});
    try {
      return await run;
    } finally {
      inflight = null;
    }
  };
}
