/**
 * Notification utilities for desktop notifications
 */

import { formatViewers } from './format.js';

const STREAM_LIVE_PREFIX = 'stream-live-';

/**
 * Build the notification id for a "stream went live" notification.
 * The username is embedded so a top-level listener can act on the click
 * even after the MV3 service worker was suspended and restarted.
 * @param {string} username
 * @returns {string}
 */
export function buildStreamLiveNotificationId(username) {
  return `${STREAM_LIVE_PREFIX}${username}-${Date.now()}`;
}

/**
 * Extract the username from a "stream went live" notification id.
 * Twitch usernames are [A-Za-z0-9_], so the trailing `-<timestamp>` is
 * unambiguous.
 * @param {string} notificationId
 * @returns {string|null} username, or null if this is not a stream-live id
 */
export function parseStreamLiveNotificationId(notificationId) {
  const match = /^stream-live-([A-Za-z0-9_]+)-\d+$/.exec(String(notificationId || ''));
  return match ? match[1] : null;
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
      const notificationId = buildStreamLiveNotificationId(username);

      // Validate thumbnail URL or use default
      let iconUrl = 'icons/icon-128.png';
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

      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: iconUrl,
        title: `${username} is now live!`,
        message: message,
        ...(contextParts.length > 0 ? { contextMessage: contextParts.join(' · ') } : {}),
        buttons: [
          { title: 'Watch Now' }
        ],
        requireInteraction: false
      });

      // Clicks are handled by top-level listeners in background.js (which
      // parse the username out of the notification id). Per-notification
      // listeners registered here would be lost when the MV3 service worker
      // suspends, leaving stale notifications unclickable — and they leaked
      // when a notification was dismissed without being clicked.
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

