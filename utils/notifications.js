/**
 * Notification utilities for desktop notifications
 */

import { formatViewers } from './format.js';

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
      } catch (createError) {
        // Chrome can't always download remote thumbnail images for
        // notifications ("Unable to download all specified images"), which
        // rejects create() and silently drops the notification. Fall back to
        // the bundled icon so the alert still shows.
        if (options.iconUrl !== 'icons/icon-128.png') {
          options.iconUrl = 'icons/icon-128.png';
          await chrome.notifications.create(notificationId, options);
        } else {
          throw createError;
        }
      }

      // Setup one-time listeners for this notification. Whichever way the
      // notification is used (body click or button), remove both listeners so
      // they don't accumulate across notifications.
      const removeHandlers = () => {
        chrome.notifications.onButtonClicked.removeListener(buttonHandler);
        chrome.notifications.onClicked.removeListener(clickHandler);
      };

      const buttonHandler = (id, buttonIndex) => {
        if (id === notificationId && buttonIndex === 0) {
          chrome.tabs.create({ url: `https://www.twitch.tv/${username}` });
          chrome.notifications.clear(id);
          removeHandlers();
        }
      };

      const clickHandler = (id) => {
        if (id === notificationId) {
          chrome.tabs.create({ url: `https://www.twitch.tv/${username}` });
          chrome.notifications.clear(id);
          removeHandlers();
        }
      };

      chrome.notifications.onButtonClicked.addListener(buttonHandler);
      chrome.notifications.onClicked.addListener(clickHandler);
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

