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

export function getChannelFromTwitchUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!(host === 'twitch.tv' || host.endsWith('.twitch.tv') || host === 'twitch.com' || host.endsWith('.twitch.com'))) {
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
      'safety', 'jobs', 'privacy', 'terms'
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


