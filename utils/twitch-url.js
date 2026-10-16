/**
 * Twitch URL helpers (pure functions).
 *
 * Keep these independent from Chrome APIs so they’re easy to test.
 */

export function isTwitchUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === 'twitch.tv' || host.endsWith('.twitch.tv') || host === 'twitch.com' || host.endsWith('.twitch.com');
  } catch {
    return false;
  }
}

// Hosts whose first path segment is a channel name. Other subdomains carry
// something else there (clips.twitch.tv/<ClipSlug>, dashboard.twitch.tv/u/…,
// player.twitch.tv?channel=…), and treating that segment as a channel made
// e.g. category fallback park forever on a clip page it mistook for a
// channel it was "already watching".
const CHANNEL_HOSTS = new Set([
  'twitch.tv', 'www.twitch.tv', 'm.twitch.tv',
  'twitch.com', 'www.twitch.com', 'm.twitch.com',
]);

export function getChannelFromTwitchUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!CHANNEL_HOSTS.has(host)) {
      return null;
    }
    const p = u.pathname || '/';
    const seg = p.split('/').filter(Boolean)[0];
    if (!seg) return null;

    // Reserved/non-channel routes
    const reserved = new Set([
      'directory', 'downloads', 'p', 'videos', 'clips', 'search',
      'settings', 'subscriptions', 'wallet', 'turbo', 'prime',
      'inventory', 'drops', 'friends', 'messages', 'moderator',
      'safety', 'jobs', 'privacy', 'terms',
      // First path segment is a feature, not a channel: /popout/<channel>/chat,
      // /embed/<channel>/chat, /team/<name>, /collections/<id>, /following
      'popout', 'embed', 'team', 'collections', 'following'
    ]);
    if (reserved.has(seg.toLowerCase())) return null;
    return seg.toLowerCase();
  } catch {
    return null;
  }
}

export function isRaidReferrerUrl(url) {
  try {
    const u = new URL(url);
    if (!isTwitchUrl(url)) return false;
    const ref = (u.searchParams.get('referrer') || '').toLowerCase();
    return ref === 'raid';
  } catch {
    return false;
  }
}


