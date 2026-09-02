import { describe, it, expect } from 'vitest';
import ErrorMessageManager from '../utils/error-messages.js';

const get = (err, ctx) => ErrorMessageManager.getErrorMessage(err, ctx);

describe('ErrorMessageManager.getErrorMessage', () => {
  it('classifies network failures', () => {
    expect(get(new Error('Failed to fetch')).message).toMatch(/network connection failed/i);
    expect(get('NetworkError when attempting to fetch').type).toBe('error');
  });

  it('classifies rate limiting', () => {
    const info = get(new Error('Rate limit exceeded (429)'));
    expect(info.type).toBe('warning');
    expect(info.message).toMatch(/rate limit/i);
  });

  it('classifies genuine auth/token errors', () => {
    expect(get(new Error('Twitch Client ID not set.')).message).toMatch(/not configured/i);
    expect(get(new Error('Unauthorized by Twitch API')).message).toMatch(/not configured/i);
    expect(get(new Error('HTTP 401')).message).toMatch(/not configured/i);
    expect(get(new Error('Invalid token')).message).toMatch(/not configured/i);
    // In saveSettings/checkStatus context the auth copy differs.
    expect(get(new Error('Unauthorized'), 'checkStatus').message).toMatch(/authorization failed/i);
  });

  // Regression: a bare includes('invalid') check used to route these three
  // unrelated "invalid ..." errors to the auth branch.
  it('does NOT misreport an invalid theme color as an auth error', () => {
    const info = get('Invalid color for accent (use #RRGGBB)', 'saveSettings');
    expect(info.message).not.toMatch(/authorization failed|not configured/i);
    expect(info.message).toMatch(/invalid color for accent/i);
  });

  it('no longer misreports an "Invalid JSON" API error as an auth error', () => {
    // The regression being guarded is that it must NOT read as "not configured" (auth).
    const info = get(new Error('Invalid JSON response from Twitch API'));
    expect(info.message).not.toMatch(/not configured/i);
  });

  it('classifies invalid username errors correctly', () => {
    const info = get(new Error('Invalid username format'));
    expect(info.message).toMatch(/twitch usernames must be 4-25/i);
    expect(info.message).not.toMatch(/not configured/i);
  });

  it('classifies server (5xx) errors', () => {
    expect(get(new Error('Twitch API server error: 503 Service Unavailable')).message)
      .toMatch(/temporarily unavailable/i);
  });

  it('classifies timeouts', () => {
    expect(get(new Error('Request timed out')).message).toMatch(/timed out/i);
  });

  it('falls back to the raw message for unclassified errors', () => {
    const info = get(new Error('Something odd happened'));
    expect(info.message).toBe('Something odd happened');
    expect(info.type).toBe('error');
  });

  it('handles null/undefined/string inputs without throwing', () => {
    expect(() => get(null)).not.toThrow();
    expect(() => get(undefined)).not.toThrow();
    expect(get('plain string error').type).toBe('error');
  });
});
