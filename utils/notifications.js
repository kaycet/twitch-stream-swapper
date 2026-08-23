/**
 * Notification utilities for desktop notifications
 */

import { formatViewers } from './format.js';

const LIVE_NOTIFICATION_PREFIX = 'stream-live-';

/**
 * Extract the streamer username from a live-notification id
 * (`stream-live-<username>-<timestamp>`). Returns null for other ids.
 * @param {string} notificationId
 * @returns {string|null}
 */
export function usernameFromNotificationId(notificationId) {
  if (typeof notificationId !== 'string') return null;
  const match = /^stream-live-([A-Za-z0-9_]+)-\d+$/.exec(notificationId);
  return match ? match[1] : null;
}

function openStreamFromNotification(notificationId) {
  const username = usernameFromNotificationId(notificationId);
  if (!username) return;
  chrome.tabs.create({ url: `https://www.twitch.tv/${username}` });
  chrome.notifications.clear(notificationId);
}

// Click handlers MUST be registered at module top level: MV3 suspends the
// service worker ~30s after the last event, dropping any listeners that were
// added dynamically inside notifyStreamLive(). A click then re-wakes the
// worker and re-runs this module, so top-level listeners are always present.
// (The old per-notification listeners also leaked — they were only removed
// when their own notification was clicked, never when it was dismissed.)
if (globalThis.chrome?.notifications) {
  chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
    if (buttonIndex === 0) openStreamFromNotification(id);
  });
  chrome.notifications.onClicked.addListener((id) => {
    openStreamFromNotification(id);
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
      const notificationId = `${LIVE_NOTIFICATION_PREFIX}${username}-${Date.now()}`;
      
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
      // Clicks are handled by the module-level listeners above, which resolve
      // the username from the notification id — no per-notification listeners.
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

