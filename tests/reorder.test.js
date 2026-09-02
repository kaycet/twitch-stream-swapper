import { describe, it, expect } from 'vitest';
import { moveStream } from '../utils/reorder.js';

const list = () => [
  { username: 'a', priority: 1 },
  { username: 'b', priority: 2 },
  { username: 'c', priority: 3 },
];

const order = (streams) => streams.map((s) => s.username).join('');

describe('moveStream', () => {
  it('drops above the target when placeBefore is true (dragging down)', () => {
    // Dragging "a" down onto the TOP half of "c" must land above "c".
    const result = moveStream(list(), 'a', 'c', true);
    expect(order(result)).toBe('bac');
  });

  it('drops below the target when placeBefore is false (dragging down)', () => {
    const result = moveStream(list(), 'a', 'c', false);
    expect(order(result)).toBe('bca');
  });

  it('drops above the target when placeBefore is true (dragging up)', () => {
    const result = moveStream(list(), 'c', 'a', true);
    expect(order(result)).toBe('cab');
  });

  it('drops below the target when placeBefore is false (dragging up)', () => {
    // Dragging "c" up onto the BOTTOM half of "a" must land below "a".
    const result = moveStream(list(), 'c', 'a', false);
    expect(order(result)).toBe('acb');
  });

  it('renumbers priorities 1..n after the move', () => {
    const result = moveStream(list(), 'a', 'c', false);
    expect(result.map((s) => s.priority)).toEqual([1, 2, 3]);
    expect(result.find((s) => s.username === 'a').priority).toBe(3);
  });

  it('returns null when dragging onto itself', () => {
    expect(moveStream(list(), 'b', 'b', true)).toBeNull();
  });

  it('returns null for unknown usernames', () => {
    expect(moveStream(list(), 'nope', 'a', true)).toBeNull();
    expect(moveStream(list(), 'a', 'nope', true)).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(moveStream(null, 'a', 'b', true)).toBeNull();
  });
});
