/**
 * Drag & drop bookkeeping for the popup's stream list (pure, unit-tested).
 *
 * The DOM handlers only report events; this state decides what a drop means
 * and whether a re-render requested mid-drag has to wait for dragend.
 */

export function createDragState() {
  return { draggedUsername: null, targetUsername: null, placeBefore: true, renderPending: false };
}

export function startDrag(state, username) {
  state.draggedUsername = username;
  state.targetUsername = null;
  state.placeBefore = true;
}

/** Called from dragover with the half the indicator is showing. */
export function hoverTarget(state, username, placeBefore) {
  if (!state.draggedUsername || username === state.draggedUsername) return;
  state.targetUsername = username;
  state.placeBefore = !!placeBefore;
}

/** Called from dragleave; forgets the target only if it is the one being left. */
export function leaveTarget(state, username) {
  if (state.targetUsername === username) state.targetUsername = null;
}

/** @returns {{draggedUsername: string, targetUsername: string, placeBefore: boolean}|null} */
export function planDrop(state) {
  if (!state.draggedUsername || !state.targetUsername) return null;
  return {
    draggedUsername: state.draggedUsername,
    targetUsername: state.targetUsername,
    placeBefore: state.placeBefore,
  };
}

/**
 * @returns {boolean} true = render now; false = mid-drag, render deferred to
 *   endDrag() so the DOM rebuild cannot break the drag.
 */
export function requestRender(state) {
  if (!state.draggedUsername) return true;
  state.renderPending = true;
  return false;
}

/** Resets the state; tells the caller whether a deferred render must run. */
export function endDrag(state) {
  const renderPending = state.renderPending;
  Object.assign(state, createDragState());
  return { renderPending };
}
