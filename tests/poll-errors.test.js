import { describe, it, expect } from 'vitest';
import { retryDelayMs } from '../utils/poll-errors.js';

describe('retryDelayMs', () => {
  it('backs off 5 minutes on auth errors instead of stopping forever', () => {
    expect(retryDelayMs({ code: 'AUTH_ERROR' })).toBe(300000);
    expect(retryDelayMs({ message: 'HTTP 401 from broker' })).toBe(300000);
    expect(retryDelayMs({ message: 'Invalid Client ID' })).toBe(300000);
  });

  it('honors Retry-After for rate limits, default 2 minutes', () => {
    expect(retryDelayMs({ code: 'RATE_LIMIT', retryAfter: 30 })).toBe(30000);
    expect(retryDelayMs({ code: 'RATE_LIMIT' })).toBe(120000);
  });

  it('retries network/timeout and unknown errors after 1 minute', () => {
    expect(retryDelayMs({ code: 'NETWORK_ERROR' })).toBe(60000);
    expect(retryDelayMs({ code: 'TIMEOUT' })).toBe(60000);
    expect(retryDelayMs({ message: 'weird' })).toBe(60000);
    expect(retryDelayMs(null)).toBe(60000);
  });
});
