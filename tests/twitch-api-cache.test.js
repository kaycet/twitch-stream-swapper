import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for response-cache pruning in utils/twitch-api.js.
 *
 * Previously an expired entry was only deleted when its exact URL was
 * requested again, so one-off URLs (category typeahead queries, changing
 * user_login batches) accumulated for the life of the context.
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

describe('TwitchAPI response cache pruning', () => {
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

  it('drops expired entries when any request completes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

    await twitchAPI._request('/streams?user_login=channel_one', {});
    expect(twitchAPI.cache.size).toBe(1);

    // Let the first entry expire, then make an unrelated request.
    vi.advanceTimersByTime(twitchAPI.cacheTTL + 1);
    await twitchAPI._request('/streams?user_login=channel_two', {});

    expect(twitchAPI.cache.size).toBe(1);
    expect([...twitchAPI.cache.keys()][0]).toContain('channel_two');
  });

  it('caps the cache at MAX_CACHE_ENTRIES, evicting oldest first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

    const max = twitchAPI.MAX_CACHE_ENTRIES;
    for (let i = 0; i < max + 5; i++) {
      await twitchAPI._request(`/streams?user_login=channel_${i}`, {});
    }

    expect(twitchAPI.cache.size).toBe(max);
    const keys = [...twitchAPI.cache.keys()];
    // The 5 oldest entries were evicted; the newest survives.
    expect(keys.some((k) => k.includes('channel_0'))).toBe(false);
    expect(keys.some((k) => k.includes(`channel_${max + 4}`))).toBe(true);
  });

  it('still serves fresh entries from the cache', async () => {
    const fetchMock = vi.fn(async () => okResponse({ data: [{ id: '1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await twitchAPI._request('/streams?user_login=somechannel', {});
    const second = await twitchAPI._request('/streams?user_login=somechannel', {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});
