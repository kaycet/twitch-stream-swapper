/**
 * Keeps the popup's in-memory stream list in sync with status fields the
 * background worker writes to storage (pure, unit-tested).
 *
 * Ownership is split per field: the popup owns list membership, order,
 * priority and the notify bell; the background worker owns the live-status
 * fields (isLive, wasLive, streamData) it refreshes on every poll. The popup
 * saves its whole in-memory copy on any list edit, so if that copy is stale
 * a bell toggle or reorder silently clobbers the worker's wasLive tracking —
 * and the next poll re-fires a "went live" notification for a stream that
 * has been live all along.
 */

/** Fields the background worker owns; overlaid onto the popup's copy. */
export const STATUS_FIELDS = ['isLive', 'wasLive', 'streamData'];

/** streamData fields the popup renders; changes here need a re-paint. */
const DISPLAY_FIELDS = ['title', 'game_name', 'viewer_count', 'started_at'];

/**
 * Overlay background-written status fields onto the popup's local list.
 *
 * @param {Array<Object>} localStreams - the popup's in-memory list (wins on
 *   membership, order, and every non-status field)
 * @param {Array<Object>} storageStreams - the list just written to storage
 * @returns {{streams: Array<Object>, changed: boolean}} New array with
 *   statuses merged in; `changed` is true only when something the popup
 *   displays differs (wasLive-only updates don't need a re-render).
 */
export function overlayStreamStatuses(localStreams, storageStreams) {
  if (!Array.isArray(localStreams) || !Array.isArray(storageStreams)) {
    return { streams: localStreams, changed: false };
  }

  const byUsername = new Map();
  for (const s of storageStreams) {
    if (s?.username) byUsername.set(s.username, s);
  }

  let changed = false;
  const streams = localStreams.map((stream) => {
    const incoming = byUsername.get(stream?.username);
    if (!incoming) return stream;

    const next = { ...stream };
    for (const field of STATUS_FIELDS) {
      if (field in incoming) next[field] = incoming[field];
    }

    if ((stream.isLive || false) !== (next.isLive || false)) {
      changed = true;
    } else if (next.isLive
        && DISPLAY_FIELDS.some((k) => stream.streamData?.[k] !== next.streamData?.[k])) {
      changed = true;
    }
    return next;
  });

  return { streams, changed };
}

function sameStatusValue(a, b) {
  if (Object.is(a, b)) return true;
  // streamData is a fresh object every poll; compare by content. Helix
  // serializes fields in a stable order, and a spurious mismatch only costs
  // one redundant write.
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Merge the background worker's per-poll status updates into the freshly
 * re-read streams list (mutating it, mirroring the poll loop) and report
 * whether anything actually changed.
 *
 * The worker used to save the list unconditionally after every poll, even
 * when every stream was offline before and after — and every such write
 * fires storage.onChanged in all contexts: each StorageManager drops its
 * cache and the content script re-renders (with a service-worker message
 * round-trip) in every open Twitch tab. With the default 1-minute interval
 * that churn ran forever; `changed` false means the save can be skipped.
 *
 * `priorByUsername` exists because the worker's two reads can be the same
 * object. StorageManager.get() caches and hands back the very array it
 * cached, and the poll loop writes this poll's statuses straight onto those
 * stream objects — so the post-poll re-read often aliases them, every field
 * compares equal to itself, and a stream that just went live reports
 * "nothing changed". A snapshot taken before the loop is immune to that.
 * The stored values are still compared as well, so a list genuinely re-read
 * from storage (the popup edited it mid-poll) is not missed either.
 *
 * @param {Array<Object>} streams - list just re-read from storage (mutated)
 * @param {Map<string, Object>} updatesByUsername - username -> status fields
 * @param {Map<string, Object>} [priorByUsername] - statusSnapshot() taken
 *   before the poll loop mutated anything
 * @returns {boolean} true when any status field on any stream changed
 */
export function mergeStatusUpdates(streams, updatesByUsername, priorByUsername = null) {
  if (!Array.isArray(streams) || !(updatesByUsername instanceof Map)) return false;

  let changed = false;
  for (const stream of streams) {
    const update = stream?.username != null ? updatesByUsername.get(stream.username) : undefined;
    if (!update) continue;
    const prior = priorByUsername instanceof Map ? priorByUsername.get(stream.username) : undefined;
    for (const field of STATUS_FIELDS) {
      if (!(field in update)) continue;
      if (!sameStatusValue(stream[field], update[field])) changed = true;
      if (prior && !sameStatusValue(prior[field], update[field])) changed = true;
      stream[field] = update[field];
    }
  }
  return changed;
}

/**
 * Snapshot a stream list's status fields, by value, before anything mutates
 * them. Feeds mergeStatusUpdates()'s `priorByUsername`.
 *
 * @param {Array<Object>} streams
 * @returns {Map<string, Object>} username -> {isLive, wasLive, streamData}
 */
export function statusSnapshot(streams) {
  const snapshot = new Map();
  if (!Array.isArray(streams)) return snapshot;
  for (const stream of streams) {
    if (stream?.username == null) continue;
    const entry = {};
    for (const field of STATUS_FIELDS) {
      entry[field] = stream[field];
    }
    snapshot.set(stream.username, entry);
  }
  return snapshot;
}
