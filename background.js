/**
 * Background service worker for stream polling and auto-switching
 */

import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';
import notificationManager from './utils/notifications.js';
import ErrorMessageManager from './utils/error-messages.js';

class BackgroundWorker {
  constructor() {
    this.pollInterval = null;
    this.currentWatchingStream = null;
    this.lastPollTime = 0;
    this.isPolling = false;
    this.idleState = 'active';
    this.settings = null;
  }

  async init() {
    // Load settings
    this.settings = await storage.getSettings();
    
    // Initialize Twitch API
    if (this.settings.clientId) {
      await twitchAPI.initialize(this.settings.clientId);
    }

    // Setup idle detection
    if (chrome.idle) {
      chrome.idle.onStateChanged.addListener((state) => {
        this.idleState = state;
        this.handleIdleStateChange();
      });
    }

    // Start polling
    this.startPolling();

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.settings) {
        this.handleSettingsChange(changes.settings.newValue);
      }
    });

    // Listen for install/update
    chrome.runtime.onInstalled.addListener(() => {
      this.handleInstall();
    });
  }

  async handleInstall() {
    // Set default settings if first install
    const settings = await storage.getSettings();
    if (!settings.clientId) {
      // Open options page to configure
      chrome.runtime.openOptionsPage();
    }
  }

  async handleSettingsChange(newSettings) {
    this.settings = newSettings;
    
    // Reinitialize API if client ID changed
    if (newSettings.clientId) {
      await twitchAPI.initialize(newSettings.clientId);
    }

    // Restart polling with new interval
    this.stopPolling();
    this.startPolling();
  }

  handleIdleStateChange() {
    // Pause polling when idle, resume when active
    if (this.idleState === 'idle' || this.idleState === 'locked') {
      this.stopPolling();
    } else {
      this.startPolling();
    }
  }

  startPolling() {
    // Don't poll if already polling or idle
    if (this.isPolling || this.idleState === 'idle' || this.idleState === 'locked') {
      return;
    }

    // Don't poll if no client ID
    if (!this.settings?.clientId) {
      return;
    }

    this.isPolling = true;

    // Poll immediately
    this.pollStreams();

    // Then poll at configured interval
    const interval = this.settings?.checkInterval || 60000;
    this.pollInterval = setInterval(() => {
      this.pollStreams();
    }, interval);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
  }

  async pollStreams() {
    // Prevent concurrent polls
    const now = Date.now();
    if (now - this.lastPollTime < 5000) {
      return; // Minimum 5 seconds between polls
    }
    this.lastPollTime = now;

    try {
      const streams = await storage.getStreams();
      if (streams.length === 0) {
        return;
      }

      // Sort by priority
      streams.sort((a, b) => a.priority - b.priority);

      // Check stream statuses (batch request)
      const usernames = streams.map(s => s.username);
      const statuses = await twitchAPI.checkStreamsStatus(usernames);

      // Find highest priority live stream
      let highestPriorityLive = null;
      for (const stream of streams) {
        const isLive = statuses[stream.username] !== null;
        
        // Update stream status
        stream.isLive = isLive;
        stream.streamData = statuses[stream.username] || null;

        if (isLive && !highestPriorityLive) {
          highestPriorityLive = stream;
        }

        // Send notifications for newly live streams (premium feature)
        if (isLive && this.settings?.notificationsEnabled && this.settings?.premiumStatus) {
          const wasLive = stream.wasLive || false;
          if (!wasLive && stream.streamData) {
            notificationManager.notifyStreamLive(
              stream.username,
              stream.streamData.title,
              stream.streamData.game_name,
              stream.streamData.thumbnail_url
            );
          }
          stream.wasLive = true;
        } else if (!isLive) {
          stream.wasLive = false;
        }
      }

      // Save updated stream statuses
      await storage.saveStreams(streams);

      // Handle auto-switching
      if (this.settings?.redirectEnabled) {
        await this.handleAutoSwitch(highestPriorityLive, streams);
      }

      // Handle category fallback if no streams are live
      if (!highestPriorityLive && this.settings?.fallbackCategory) {
        await this.handleCategoryFallback();
      }

      // Update analytics (premium feature)
      if (this.settings?.premiumStatus) {
        await this.updateAnalytics(highestPriorityLive);
      }

    } catch (error) {
      console.error('Error polling streams:', error);
      
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'checkStatus');
      
      // Handle different error types
      if (error.code === 'AUTH_ERROR' || error.message.includes('Client ID') || error.message.includes('401')) {
        // Stop polling for auth errors - user needs to fix settings
        this.stopPolling();
        console.error('Authentication error - polling stopped. Please check your Twitch Client ID in settings.');
      } else if (error.code === 'RATE_LIMIT') {
        // For rate limits, wait longer before retry
        this.stopPolling();
        const retryDelay = error.retryAfter ? error.retryAfter * 1000 : 120000; // 2 minutes default
        setTimeout(() => {
          if (this.idleState === 'active') {
            this.startPolling();
          }
        }, retryDelay);
        console.warn('Rate limit hit - will retry after delay');
      } else if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
        // Network errors - retry after shorter delay
        this.stopPolling();
        setTimeout(() => {
          if (this.idleState === 'active') {
            this.startPolling();
          }
        }, 60000); // Wait 1 minute before retry
        console.warn('Network error - will retry in 1 minute');
      } else {
        // Other errors - exponential backoff
        this.stopPolling();
        setTimeout(() => {
          if (this.idleState === 'active') {
            this.startPolling();
          }
        }, 60000); // Wait 1 minute before retry
        console.warn('Error occurred - will retry in 1 minute');
      }
    }
  }

  async handleAutoSwitch(liveStream, allStreams) {
    if (!liveStream) {
      return;
    }

    // Check if we should switch
    const shouldSwitch = await this.shouldSwitchToStream(liveStream);

    if (shouldSwitch) {
      await this.switchToStream(liveStream);
      this.currentWatchingStream = liveStream.username;
    }
  }

  async shouldSwitchToStream(stream) {
    // Don't switch if already watching this stream
    if (this.currentWatchingStream === stream.username) {
      return false;
    }

    // Get current active tab
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          resolve(false);
          return;
        }

        const currentTab = tabs[0];
        
        // Don't switch if tab is not fully loaded
        if (currentTab.status !== 'complete') {
          resolve(false);
          return;
        }

        const currentUrl = currentTab.url || '';

        // Only switch if:
        // 1. User is on a Twitch page, OR
        // 2. User explicitly enabled redirect for all tabs (could be a setting)
        const isOnTwitch = currentUrl.includes('twitch.tv');
        
        // For now, only switch if on Twitch (respectful of user's browsing)
        // Could add a setting to allow switching from any tab
        resolve(isOnTwitch);
      });
    });
  }

  async switchToStream(stream) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs.length === 0) {
          resolve(false);
          return;
        }

        const tab = tabs[0];
        const streamUrl = `https://www.twitch.tv/${stream.username}`;

        // Update the tab
        chrome.tabs.update(tab.id, { url: streamUrl }, () => {
          this.currentWatchingStream = stream.username;
          
          // Update analytics
          if (this.settings?.premiumStatus) {
            this.recordSwitch(stream.username);
          }
          
          resolve(true);
        });
      });
    });
  }

  async handleCategoryFallback() {
    // Only use fallback if no streams in list are live
    // and user has configured a fallback category
    
    if (!this.settings?.fallbackCategory) {
      return;
    }

    // Check if we should use fallback (maybe only if user is on Twitch)
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length === 0) return;

      const currentTab = tabs[0];
      if (!currentTab.url?.includes('twitch.tv')) {
        return; // Only use fallback if on Twitch
      }

      try {
        const randomStream = await twitchAPI.getRandomStreamFromCategory(
          this.settings.fallbackCategory
        );

        if (randomStream) {
          const streamUrl = `https://www.twitch.tv/${randomStream.user_login}`;
          chrome.tabs.update(currentTab.id, { url: streamUrl });
        }
      } catch (error) {
        console.error('Error getting fallback stream:', error);
        // Don't show error to user for fallback - it's a background operation
        // Just log it for debugging
      }
    });
  }

  async updateAnalytics(liveStream) {
    if (!liveStream) return;

    const analytics = await storage.getAnalytics();
    
    // Update viewing time
    const username = liveStream.username;
    if (!analytics.viewingTime[username]) {
      analytics.viewingTime[username] = 0;
    }
    
    // Increment viewing time (in seconds, poll interval)
    const pollIntervalSeconds = (this.settings?.checkInterval || 60000) / 1000;
    analytics.viewingTime[username] += pollIntervalSeconds;

    await storage.saveAnalytics(analytics);
  }

  async recordSwitch(username) {
    const analytics = await storage.getAnalytics();
    analytics.switchCount = (analytics.switchCount || 0) + 1;
    analytics.lastSwitch = {
      username,
      timestamp: Date.now()
    };
    await storage.saveAnalytics(analytics);
  }
}

// Initialize worker
const worker = new BackgroundWorker();
worker.init();

