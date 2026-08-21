/**
 * Notification utilities for desktop notifications
 */

import { formatViewers } from './format.js';

class NotificationManager {
  constructor() {
    // notificationId -> channel username. The delegated listeners below
    // consult this map instead of registering a fresh listener pair per
    // notification, which leaked listeners for every notification that was
    // dismissed or ignored (they were only removed on click).
    this._liveNotificationTargets = new Map();
    this._registerListeners();
  }

  _registerListeners() {
    const notifications = globalThis.chrome?.notifications;
    if (!notifications?.onClicked?.addListener) return;

    const openTarget = (id) => {
      const username = this._liveNotificationTargets.get(id);
      if (!username) return;
      chrome.tabs.create({ url: `https://www.twitch.tv/${username}` });
      chrome.notifications.clear(id);
      this._liveNotificationTargets.delete(id);
    };

    notifications.onClicked.addListener(openTarget);
    notifications.onButtonClicked.addListener((id, buttonIndex) => {
      if (buttonIndex === 0) openTarget(id);
    });
    // Dismissed/expired notifications can never be clicked again; drop them.
    notifications.onClosed.addListener((id) => {
      this._liveNotificationTargets.delete(id);
    });
  }

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

      // Register the target before create() so a click can never race the map update.
      this._liveNotificationTargets.set(notificationId, username);

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

