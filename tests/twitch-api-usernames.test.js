import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for username validation in checkStreamsStatus.
 *
 * The filter used to require 4+ characters, silently dropping legacy
 * 3-character Twitch logins (which predate the current 4-character minimum
 * for new accounts) — those channels could never show as live.
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

describe('TwitchAPI username validation', () => {
  let twitchAPI;

  beforeEach(async () => {
    vi.resetModules();
    twitchAPI = (await import('../utils/twitch-api.js')).default;
    await twitchAPI.initialize('testclientid123');
    twitchAPI.clearCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts legacy 3-character usernames', async () => {
    const fetchMock = vi.fn(async () =>
      okResponse({ data: [{ user_login: 'day', title: 'legacy login live' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await twitchAPI.checkStreamsStatus(['day', 'somechannel']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('user_login=day');
    expect(url).toContain('user_login=somechannel');
    expect(results.day).toEqual({ user_login: 'day', title: 'legacy login live' });
    expect(results.somechannel).toBe(null);
  });

  it('still filters out malformed usernames', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const results = await twitchAPI.checkStreamsStatus(['ab', 'bad-name', 'goodname']);

    const url = fetchMock.mock.calls[0][0];
    expect(url).not.toContain('user_login=ab');
    expect(url).not.toContain('bad-name');
    expect(results.goodname).toBe(null);
    // Filtered usernames are absent from results; callers treat them as offline.
    expect('ab' in results).toBe(false);
    expect('bad-name' in results).toBe(false);
  });

  it('throws when every username is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    await expect(twitchAPI.checkStreamsStatus(['ab', 'x'])).rejects.toThrow('Invalid username format');
  });
});
