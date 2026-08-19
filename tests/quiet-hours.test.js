import { describe, it, expect } from 'vitest';
import { isQuietHours } from '../utils/quiet-hours.js';

const at = (h, m = 0) => new Date(2026, 7, 18, h, m);

describe('isQuietHours', () => {
  it('returns false when disabled or config missing', () => {
    expect(isQuietHours(null, at(23))).toBe(false);
    expect(isQuietHours(undefined, at(23))).toBe(false);
    expect(isQuietHours({ enabled: false, start: '22:00', end: '08:00' }, at(23))).toBe(false);
  });

  it('returns false on malformed times', () => {
    expect(isQuietHours({ enabled: true, start: 'nope', end: '08:00' }, at(23))).toBe(false);
    expect(isQuietHours({ enabled: true, start: '22:00', end: '' }, at(23))).toBe(false);
    expect(isQuietHours({ enabled: true }, at(23))).toBe(false);
  });

  it('handles same-day window (09:00-17:00)', () => {
    const cfg = { enabled: true, start: '09:00', end: '17:00' };
    expect(isQuietHours(cfg, at(12))).toBe(true);
    expect(isQuietHours(cfg, at(8, 59))).toBe(false);
    expect(isQuietHours(cfg, at(9, 0))).toBe(true); // start inclusive
    expect(isQuietHours(cfg, at(17, 0))).toBe(false); // end exclusive
  });

  it('handles overnight window (22:00-08:00)', () => {
    const cfg = { enabled: true, start: '22:00', end: '08:00' };
    expect(isQuietHours(cfg, at(23))).toBe(true);
    expect(isQuietHours(cfg, at(3))).toBe(true);
    expect(isQuietHours(cfg, at(12))).toBe(false);
    expect(isQuietHours(cfg, at(22, 0))).toBe(true);
    expect(isQuietHours(cfg, at(8, 0))).toBe(false);
  });

  it('start equal to end is never quiet', () => {
    expect(isQuietHours({ enabled: true, start: '10:00', end: '10:00' }, at(10))).toBe(false);
  });
});
