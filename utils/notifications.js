/**
 * Notification utilities for desktop notifications
 */

import { formatViewers } from './format.js';

const STREAM_LIVE_PREFIX = 'stream-live-';
const FALLBACK_ICON = 'icons/icon-128.png';

/**
 * Download a stream thumbnail and inline it as a data: URL.
 *
 * chrome.notifications.create() only accepts extension resources, data:
 * URLs, or blob: URLs for iconUrl — handing it the remote Helix thumbnail
 * URL makes create() reject ("Unable to download all specified images").
 * Helix always returns thumbnail_url for live streams, so that rejection
 * silently dropped every "stream is live" notification.
 *
 * Returns null on any failure (offline, CORS, non-image response, timeout)
 * so the caller can fall back to the packaged icon.
 *
 * @param {string} thumbnailUrl - Helix template URL with {width}x{height} placeholders
 * @param {number} [timeoutMs]
 * @returns {Promise<string|null>}
 */
export async function thumbnailToDataUrl(thumbnailUrl, timeoutMs = 4000) {
  if (!thumbnailUrl || typeof globalThis.fetch !== 'function') return null;

  let resolved;
  try {
    resolved = new URL(
      String(thumbnailUrl).replace('{width}', '128').replace('{height}', '72')
    ).toString();
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await globalThis.fetch(resolved, { signal: controller.signal });
    if (!response?.ok) return null;
    const blob = await response.blob();
    if (!blob?.type?.startsWith('image/') || blob.size === 0) return null;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const CHUNK = 0x8000; // String.fromCharCode has an argument-count limit
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${blob.type};base64,${btoa(binary)}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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

      // Inline the thumbnail as a data: URL (remote URLs make create() fail);
      // fall back to the packaged icon when the download doesn't work out.
      const iconUrl = (thumbnailUrl && await thumbnailToDataUrl(thumbnailUrl)) || FALLBACK_ICON;

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
        // A rejected icon must not cost the user the notification itself.
        if (options.iconUrl === FALLBACK_ICON) throw createError;
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

