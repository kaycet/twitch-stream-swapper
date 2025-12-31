/**
 * Notification utilities for desktop notifications
 */

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
   */
  async notifyStreamLive(username, title, gameName, thumbnailUrl) {
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
          // Validate URL format
          new URL(thumbnailUrl);
          iconUrl = thumbnailUrl;
        } catch (e) {
          // Invalid URL, use default
        }
      }

      const message = title && title.length > 0 
        ? (title.length > 100 ? title.substring(0, 97) + '...' : title)
        : `Playing ${gameName || 'Unknown'}`;

      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: iconUrl,
        title: `${username} is now live!`,
        message: message,
        buttons: [
          { title: 'Watch Now' }
        ],
        requireInteraction: false
      });

      // Setup one-time listeners for this notification
      const buttonHandler = (id, buttonIndex) => {
        if (id === notificationId && buttonIndex === 0) {
          chrome.tabs.create({ url: `https://www.twitch.tv/${username}` });
          chrome.notifications.clear(id);
          chrome.notifications.onButtonClicked.removeListener(buttonHandler);
        }
      };

      const clickHandler = (id) => {
        if (id === notificationId) {
          chrome.tabs.create({ url: `https://www.twitch.tv/${username}` });
          chrome.notifications.clear(id);
          chrome.notifications.onClicked.removeListener(clickHandler);
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

