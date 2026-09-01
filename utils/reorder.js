/**
 * Drag & drop reorder helper (pure, unit-tested).
 *
 * Kept independent from the DOM so the insertion math can be tested: the
 * popup shows an "insert above / insert below" indicator while dragging, and
 * the resulting order must match what that indicator promised.
 */

/**
 * Move `draggedUsername` so it lands directly above (placeBefore=true) or
 * below (placeBefore=false) `targetUsername`, then renumber priorities 1..n.
 *
 * @param {Array<{username: string, priority?: number}>} streams
 * @param {string} draggedUsername
 * @param {string} targetUsername
 * @param {boolean} placeBefore
 * @returns {Array|null} New array in the new order, or null when there is
 *   nothing to move (unknown usernames, dragging onto itself).
 */
export function moveStream(streams, draggedUsername, targetUsername, placeBefore) {
  if (!Array.isArray(streams)) return null;
  if (draggedUsername === targetUsername) return null;

  const list = [...streams];
  const from = list.findIndex((s) => s?.username === draggedUsername);
  if (from === -1) return null;
  if (!list.some((s) => s?.username === targetUsername)) return null;

  const [dragged] = list.splice(from, 1);
  const targetIndex = list.findIndex((s) => s?.username === targetUsername);
  list.splice(placeBefore ? targetIndex : targetIndex + 1, 0, dragged);

  list.forEach((stream, index) => {
    stream.priority = index + 1;
  });

  return list;
}
