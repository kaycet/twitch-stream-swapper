/**
 * Notification utilities for desktop notifications
 */

import { formatViewers } from './format.js';

// "Stream went live" notifications encode the streamer in the notification id
// so click handling can be done by top-level listeners in the service worker.
// Usernames are validated as [A-Za-z0-9_] before they get here, so the id is
// unambiguous even though usernames sit between dashes.
const STREAM_LIVE_ID_RE = /^stream-live-([A-Za-z0-9_]+)-\d+$/;

/**
 * Parse a "stream went live" notification id back into its username.
 * @param {string} id - Notification id
 * @returns {{username: string}|null}
 */
export function parseStreamLiveNotificationId(id) {
  const match = STREAM_LIVE_ID_RE.exec(String(id || ''));
  return match ? { username: match[1] } : null;
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
      const notificationId = `stream-live-${username}-${Date.now()}`;
      
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

      // Clicks are handled by top-level listeners in background.js, which
      // recover the username from the notification id. Per-notification
      // listeners registered here would be gone once MV3 suspends the
      // service worker, leaving the notification dead on click.
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

