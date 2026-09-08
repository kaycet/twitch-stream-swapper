import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for rate-limit accounting in utils/twitch-api.js.
 *
 * Previously _request consulted the rate limiter before the response cache,
 * so a cache hit consumed rate budget without sending anything — and once
 * the per-minute budget was spent, even cache-servable requests slept for
 * up to a minute waiting for the window to reset.
 */

function okResponse(payload = { data: [] }) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => payload,
  };
}

describe('TwitchAPI rate-limit accounting', () => {
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

  it('does not count cache hits against the per-minute request budget', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await twitchAPI._request('/streams?user_login=somechannel', {});
    const afterFirst = twitchAPI.requestCount;

    await twitchAPI._request('/streams?user_login=somechannel', {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(twitchAPI.requestCount).toBe(afterFirst);
  });

  it('serves fresh cache entries immediately even when the budget is exhausted', async () => {
    const fetchMock = vi.fn(async () => okResponse({ data: [{ id: '1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await twitchAPI._request('/streams?user_login=somechannel', {});

    // Exhaust the budget: the old ordering would now sleep up to 60s before
    // even looking at the cache.
    twitchAPI.requestCount = twitchAPI.MAX_REQUESTS_PER_MINUTE;
    twitchAPI.requestWindow = Date.now();

    let resolved = false;
    const second = twitchAPI._request('/streams?user_login=somechannel', {})
      .then((data) => { resolved = true; return data; });

    // Flush microtasks only — no timers. A cache hit must not need any.
    await Promise.resolve().then(() => {}).then(() => {}).then(() => {});
    expect(resolved).toBe(true);
    expect(await second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still rate-limits requests that go to the network', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    twitchAPI.requestCount = twitchAPI.MAX_REQUESTS_PER_MINUTE;
    twitchAPI.requestWindow = Date.now();

    let resolved = false;
    const request = twitchAPI._request('/streams?user_login=somechannel', {})
      .then((data) => { resolved = true; return data; });

    await Promise.resolve().then(() => {}).then(() => {}).then(() => {});
    expect(resolved).toBe(false); // waiting out the window

    await vi.runAllTimersAsync();
    await expect(request).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
