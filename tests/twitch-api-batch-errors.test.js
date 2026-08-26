import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for checkStreamsStatus() error handling.
 *
 * Previously, when every request failed with a transient error (network down,
 * persistent 5xx after retries), checkStreamsStatus swallowed the error and
 * reported every stream as offline. The background worker then reset each
 * stream's wasLive flag (causing spurious "went live" notifications once the
 * network recovered) and redirected the managed tab to a random
 * category-fallback stream even though the user's streams were still live.
 */

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => body,
  };
}

describe('TwitchAPI checkStreamsStatus error handling', () => {
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

  it('throws instead of reporting all streams offline when the network is down', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = twitchAPI.checkStreamsStatus(['somechannel', 'otherchannel']);
    const assertion = expect(request).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    await vi.runAllTimersAsync();
    await assertion;
  });

  it('resolves live/offline statuses when the request succeeds', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ user_login: 'somechannel', title: 'hi' }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await twitchAPI.checkStreamsStatus(['somechannel', 'otherchannel']);

    expect(results.somechannel).toMatchObject({ user_login: 'somechannel' });
    expect(results.otherchannel).toBeNull();
  });

  it('still throws immediately on auth errors', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => null },
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = twitchAPI.checkStreamsStatus(['somechannel']);
    const assertion = expect(request).rejects.toMatchObject({ code: 'AUTH_ERROR' });

    await vi.runAllTimersAsync();
    await assertion;
  });
});
