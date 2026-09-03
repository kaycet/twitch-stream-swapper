/**
 * Notification utilities for desktop notifications
 */

import { formatViewers } from './format.js';

const STREAM_LIVE_PREFIX = 'stream-live-';
const FALLBACK_ICON = 'icons/icon-128.png';

/**
 * Parse the channel name out of a "stream goes live" notification id
 * (`stream-live-<username>-<timestamp>`). Returns null for ids created by
 * other features (e.g. the switch prompt) or malformed ids.
 * @param {string} notificationId
 * @returns {string|null}
 */
export function channelFromNotificationId(notificationId) {
  const id = String(notificationId || '');
  if (!id.startsWith(STREAM_LIVE_PREFIX)) return null;
  const rest = id.slice(STREAM_LIVE_PREFIX.length);
  // Usernames are [a-zA-Z0-9_], so the last "-" always separates the timestamp.
  const sep = rest.lastIndexOf('-');
  if (sep <= 0) return null;
  const username = rest.slice(0, sep);
  const timestamp = rest.slice(sep + 1);
  if (!/^\d+$/.test(timestamp)) return null;
  return username;
}

function openChannelFromNotification(notificationId) {
  const username = channelFromNotificationId(notificationId);
  if (!username) return;
  chrome.tabs.create({ url: `https://www.twitch.tv/${username}` });
  chrome.notifications.clear(notificationId);
}

// Click handlers are registered once at module scope, not per notification:
// MV3 suspends the service worker ~30s after the last event, dropping any
// listeners added dynamically inside notifyStreamLive(). A click on a
// notification minutes later re-runs this module (top-level listeners are
// re-registered), so delegation by id prefix is the only variant that still
// works after suspension — per-notification closures were dead by then.
if (globalThis.chrome?.notifications) {
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (buttonIndex === 0) openChannelFromNotification(notificationId);
  });
  chrome.notifications.onClicked.addListener((notificationId) => {
    openChannelFromNotification(notificationId);
  });
}

class NotificationManager {
  /**
   * Request notification permission
   * @returns {Promise<boolean>}
   */
  async requestPermission() {
    if (chrome.notifications) {
      return true; // Already have permission via manifest
    }
    return false;
  }

  /**
   * Show notification when stream goes live
   * @param {string} username - Streamer username
   * @param {string} title - Stream title
   * @param {string} gameName - Game/category name
   * @param {string} thumbnailUrl - Thumbnail URL
   * @param {number} [viewerCount] - Current viewer count
   */
  async notifyStreamLive(username, title, gameName, thumbnailUrl, viewerCount) {
    if (!chrome.notifications) {
      console.warn('Notifications API not available');
      return;
    }

    try {
      const notificationId = `${STREAM_LIVE_PREFIX}${username}-${Date.now()}`;

      // Validate thumbnail URL or use default
      let iconUrl = FALLBACK_ICON;
      if (thumbnailUrl) {
        try {
          // Helix returns a template URL with literal {width}x{height} placeholders;
          // substitute real dimensions or the icon fails to load.
          const resolved = thumbnailUrl
            .replace('{width}', '128')
            .replace('{height}', '72');
          // Validate URL format
          new URL(resolved);
          iconUrl = resolved;
        } catch {
          // Invalid URL, use default
        }
      }

      const message = title && title.length > 0 
        ? (title.length > 100 ? title.substring(0, 97) + '...' : title)
        : `Playing ${gameName || 'Unknown'}`;

      const contextParts = [];
      if (gameName) contextParts.push(gameName);
      const viewers = formatViewers(viewerCount);
      if (viewers) contextParts.push(`${viewers} viewers`);

      const options = {
        type: 'basic',
        iconUrl: iconUrl,
        title: `${username} is now live!`,
        message: message,
        ...(contextParts.length > 0 ? { contextMessage: contextParts.join(' · ') } : {}),
        buttons: [
          { title: 'Watch Now' }
        ],
        requireInteraction: false
      };

      try {
        await chrome.notifications.create(notificationId, options);
      } catch (error) {
        // MV3 only accepts data:, blob:, and extension-local iconUrls; a
        // remote Helix thumbnail makes create() reject ("Unable to download
        // all specified images"), which used to swallow the notification
        // entirely. Retry once with the bundled icon so it still shows.
        if (iconUrl === FALLBACK_ICON) throw error;
        console.warn('Notification icon rejected, retrying with bundled icon:', error);
        await chrome.notifications.create(notificationId, { ...options, iconUrl: FALLBACK_ICON });
      }
      // Clicks are handled by the module-level listeners above; no
      // per-notification listeners means nothing to clean up either.
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  /**
   * Clear all notifications
   */
  async clearAll() {
    try {
      const notifications = await chrome.notifications.getAll();
      Object.keys(notifications).forEach(id => {
        chrome.notifications.clear(id);
      });
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }
}

// Export singleton instance
const notificationManager = new NotificationManager();
export default notificationManager;

