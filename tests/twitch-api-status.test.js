import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for checkStreamsStatus in utils/twitch-api.js.
 *
 * Previously, a failed /streams request (network down, persistent 5xx, timeout)
 * was reported as "every stream is offline" instead of an error. That reset
 * wasLive (so recovery fired duplicate "now live" notifications) and triggered
 * category-fallback redirects away from streams that were still live.
 */

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => body,
  };
}

describe('TwitchAPI checkStreamsStatus', () => {
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

  it('maps live streams and reports the rest as offline (null)', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      data: [{ user_login: 'livechannel', title: 'hi' }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await twitchAPI.checkStreamsStatus(['livechannel', 'offlinechannel']);

    expect(results.livechannel).toMatchObject({ user_login: 'livechannel' });
    expect(results.offlinechannel).toBeNull();
  });

  it('propagates request failures instead of marking every stream offline', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', fetchMock);

    const request = twitchAPI.checkStreamsStatus(['somechannel']);
    const assertion = expect(request).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    // Flush the internal retry backoff timers.
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('still throws auth errors', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => null },
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(twitchAPI.checkStreamsStatus(['somechannel']))
      .rejects.toMatchObject({ code: 'AUTH_ERROR' });
  });
});
