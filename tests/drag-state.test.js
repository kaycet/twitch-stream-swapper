import { describe, it, expect } from 'vitest';
import {
  createDragState,
  startDrag,
  hoverTarget,
  leaveTarget,
  planDrop,
  requestRender,
  endDrag,
} from '../utils/drag-state.js';

describe('drag state', () => {
  it('has nothing to drop when idle', () => {
    const s = createDragState();
    expect(planDrop(s)).toBe(null);
  });

  it('drops onto the last hovered target with the indicated half', () => {
    const s = createDragState();
    startDrag(s, 'a');
    hoverTarget(s, 'b', false);
    expect(planDrop(s)).toEqual({ draggedUsername: 'a', targetUsername: 'b', placeBefore: false });
  });

  it('ignores hovering over the dragged item itself', () => {
    const s = createDragState();
    startDrag(s, 'a');
    hoverTarget(s, 'b', true);
    hoverTarget(s, 'a', false);
    expect(planDrop(s)).toEqual({ draggedUsername: 'a', targetUsername: 'b', placeBefore: true });
  });

  it('forgets the target once the cursor leaves it, so a drop with no indicator does nothing', () => {
    const s = createDragState();
    startDrag(s, 'a');
    hoverTarget(s, 'b', false);
    leaveTarget(s, 'b');
    expect(planDrop(s)).toBe(null);
  });

  it('keeps the target when some other row reports dragleave', () => {
    const s = createDragState();
    startDrag(s, 'a');
    hoverTarget(s, 'b', true);
    leaveTarget(s, 'c');
    expect(planDrop(s)).toEqual({ draggedUsername: 'a', targetUsername: 'b', placeBefore: true });
  });

  it('renders immediately when not dragging', () => {
    const s = createDragState();
    expect(requestRender(s)).toBe(true);
    expect(endDrag(s).renderPending).toBe(false);
  });

  it('defers a render requested mid-drag and replays it on dragend', () => {
    const s = createDragState();
    startDrag(s, 'a');
    expect(requestRender(s)).toBe(false);
    expect(endDrag(s)).toEqual({ renderPending: true });
    // fully reset afterwards
    expect(planDrop(s)).toBe(null);
    expect(requestRender(s)).toBe(true);
  });
});
