import { describe, it, expect } from 'vitest';
import { formatViewers, formatUptime } from '../utils/format.js';

describe('formatViewers', () => {
  it('passes small numbers through', () => {
    expect(formatViewers(0)).toBe('0');
    expect(formatViewers(999)).toBe('999');
  });

  it('abbreviates thousands with one decimal, no trailing .0', () => {
    expect(formatViewers(1000)).toBe('1k');
    expect(formatViewers(1234)).toBe('1.2k');
    expect(formatViewers(12400)).toBe('12.4k');
    expect(formatViewers(999949)).toBe('999.9k');
  });

  it('abbreviates millions', () => {
    expect(formatViewers(1000000)).toBe('1m');
    expect(formatViewers(2500000)).toBe('2.5m');
  });

  it('returns empty string for missing/invalid input', () => {
    expect(formatViewers(null)).toBe('');
    expect(formatViewers(undefined)).toBe('');
    expect(formatViewers('lots')).toBe('');
  });
});

describe('formatUptime', () => {
  const now = new Date('2026-08-18T12:00:00Z');

  it('formats minutes under an hour', () => {
    expect(formatUptime('2026-08-18T11:13:00Z', now)).toBe('47m');
  });

  it('formats hours and minutes', () => {
    expect(formatUptime('2026-08-18T08:48:00Z', now)).toBe('3h 12m');
  });

  it('keeps counting past 24h', () => {
    expect(formatUptime('2026-08-17T09:55:00Z', now)).toBe('26h 5m');
  });

  it('returns empty string for invalid or future timestamps', () => {
    expect(formatUptime('garbage', now)).toBe('');
    expect(formatUptime(null, now)).toBe('');
    expect(formatUptime('2026-08-18T13:00:00Z', now)).toBe('');
  });
});
