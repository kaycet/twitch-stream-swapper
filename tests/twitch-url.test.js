import { describe, expect, test } from 'vitest';
import { isRaidReferrerUrl, isTwitchUrl, getChannelFromTwitchUrl } from '../utils/twitch-url.js';

describe('twitch-url', () => {
  test('isTwitchUrl detects twitch hosts', () => {
    expect(isTwitchUrl('https://www.twitch.tv/someone')).toBe(true);
    expect(isTwitchUrl('https://twitch.tv/someone')).toBe(true);
    expect(isTwitchUrl('https://m.twitch.tv/someone')).toBe(true);
    expect(isTwitchUrl('https://example.com')).toBe(false);
  });

  test('getChannelFromTwitchUrl returns channel for /<name>', () => {
    expect(getChannelFromTwitchUrl('https://www.twitch.tv/Northernlion')).toBe('northernlion');
    expect(getChannelFromTwitchUrl('https://www.twitch.tv/directory')).toBe(null);
  });

  test('getChannelFromTwitchUrl ignores feature routes whose first segment is not a channel', () => {
    expect(getChannelFromTwitchUrl('https://www.twitch.tv/popout/somechannel/chat')).toBe(null);
    expect(getChannelFromTwitchUrl('https://www.twitch.tv/embed/somechannel/chat')).toBe(null);
    expect(getChannelFromTwitchUrl('https://www.twitch.tv/team/someteam')).toBe(null);
    expect(getChannelFromTwitchUrl('https://www.twitch.tv/collections/abc123')).toBe(null);
    expect(getChannelFromTwitchUrl('https://www.twitch.tv/following')).toBe(null);
  });

  test('isRaidReferrerUrl detects ?referrer=raid', () => {
    expect(isRaidReferrerUrl('https://www.twitch.tv/somechannel?referrer=raid')).toBe(true);
    expect(isRaidReferrerUrl('https://www.twitch.tv/somechannel?referrer=raid&foo=bar')).toBe(true);
    expect(isRaidReferrerUrl('https://www.twitch.tv/somechannel?referrer=RAID')).toBe(true);
    expect(isRaidReferrerUrl('https://www.twitch.tv/somechannel')).toBe(false);
    expect(isRaidReferrerUrl('https://example.com/?referrer=raid')).toBe(false);
  });
});


