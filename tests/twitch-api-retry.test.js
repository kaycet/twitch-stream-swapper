import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for the retry logic in utils/twitch-api.js.
 *
 * Previously, `retries > 0 && !error.code || (error.code && [...retryable].includes(error.code))`
 * ignored the retries counter for retryable error codes (operator precedence), so a persistent
 * 5xx from the API/token broker retried forever with unbounded exponential delays.
 */

function make500Response() {
  return {
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    headers: { get: () => null },
    text: async () => '',
  };
}

describe('TwitchAPI request retries', () => {
  let twitchAPI;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    twitchAPI = (await import('../utils/twitch-api.js')).default;
    await twitchAPI.initialize('testclientid123');
    twitchAPI.clearCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stops retrying server errors once retries are exhausted', async () => {
    const fetchMock = vi.fn(async () => make500Response());
    vi.stubGlobal('fetch', fetchMock);

    const request = twitchAPI._request('/streams?user_login=somechannel', {}, 2);
    const assertion = expect(request).rejects.toMatchObject({ code: 'SERVER_ERROR' });

    // Flush the backoff timers; with the old buggy condition this would never settle.
    await vi.runAllTimersAsync();
    await assertion;

    // Initial attempt + 2 retries, then give up.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries network failures and succeeds once the network recovers', async () => {
    const okResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      json: async () => ({ data: [] }),
    };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okResponse);
    vi.stubGlobal('fetch', fetchMock);

    const request = twitchAPI._request('/streams?user_login=somechannel', {}, 3);
    await vi.runAllTimersAsync();

    await expect(request).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries timeouts (AbortError) and reports TIMEOUT when they persist', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn(async () => { throw abortError; });
    vi.stubGlobal('fetch', fetchMock);

    const request = twitchAPI._request('/streams?user_login=somechannel', {}, 2);
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });

    await vi.runAllTimersAsync();
    await assertion;

    // Initial attempt + 2 retries, then give up with a coded error.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors (401)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => null },
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = twitchAPI._request('/streams?user_login=somechannel', {}, 3);
    const assertion = expect(request).rejects.toMatchObject({ code: 'AUTH_ERROR' });

    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
