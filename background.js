/**
 * Background service worker for stream polling and auto-switching
 */

import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';
import notificationManager from './utils/notifications.js';

class BackgroundWorker {
  constructor() {
    this.pollInterval = null;
    this.currentWatchingStream = null;
    this.lastPollTime = 0;
    this.isPolling = false;
    this.idleState = 'active';
    this.settings = null;
    this.pendingSwitch = null; // Store pending switch when prompting
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

    // Listen for notification button clicks (global listener for all notifications)
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      // Check if this is a switch prompt notification
      if (this.pendingSwitch && this.pendingSwitch.notificationId === notificationId) {
        if (buttonIndex === 0) {
          // User clicked "Switch"
          this.confirmSwitch();
        } else if (buttonIndex === 1) {
          // User clicked "Cancel"
          this.cancelSwitch();
        }
      }
    });

    // Listen for notification clicks (global listener for all notifications)
    chrome.notifications.onClicked.addListener((notificationId) => {
      // Check if this is a switch prompt notification
      if (this.pendingSwitch && this.pendingSwitch.notificationId === notificationId) {
        // Default to switching if user clicks notification body
        this.confirmSwitch();
      }
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
      
      // Exponential backoff on errors
      if (error.message.includes('Client ID') || error.message.includes('401')) {
        this.stopPolling();
      } else {
        // Temporary backoff
        this.stopPolling();
        setTimeout(() => {
          if (this.idleState === 'active') {
            this.startPolling();
          }
        }, 60000); // Wait 1 minute before retry
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
      // Check if prompting is enabled
      if (this.settings?.promptBeforeSwitch) {
        await this.promptForSwitch(liveStream);
      } else {
        // Auto-switch (default behavior)
        await this.switchToStream(liveStream);
        this.currentWatchingStream = liveStream.username;
      }
    }
  }

  async promptForSwitch(stream) {
    // Don't prompt if there's already a pending switch for this stream
    if (this.pendingSwitch && this.pendingSwitch.username === stream.username) {
      return;
    }

    // Clear any existing pending switch
    if (this.pendingSwitch) {
      await this.clearPendingSwitch();
    }

    // Store pending switch
    this.pendingSwitch = {
      username: stream.username,
      streamData: stream.streamData,
      notificationId: `switch-prompt-${stream.username}-${Date.now()}`
    };

    try {
      const notificationId = this.pendingSwitch.notificationId;
      const streamTitle = stream.streamData?.title || 'Live';
      const gameName = stream.streamData?.game_name || 'Unknown';

      // Show notification with buttons
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: stream.streamData?.thumbnail_url?.replace('{width}x{height}', '128x128') || 'icons/icon-128.png',
        title: `Switch to ${stream.username}?`,
        message: `${streamTitle} - ${gameName}`,
        buttons: [
          { title: 'Switch' },
          { title: 'Cancel' }
        ],
        requireInteraction: true
      });

      // Auto-cancel after 30 seconds if no response
      setTimeout(() => {
        if (this.pendingSwitch && this.pendingSwitch.notificationId === notificationId) {
          this.cancelSwitch();
        }
      }, 30000);

    } catch (error) {
      console.error('Error showing switch prompt:', error);
      // Fallback to auto-switch on error
      await this.switchToStream(stream);
      this.currentWatchingStream = stream.username;
      this.pendingSwitch = null;
    }
  }

  async confirmSwitch() {
    if (!this.pendingSwitch) {
      return;
    }

    const stream = {
      username: this.pendingSwitch.username,
      streamData: this.pendingSwitch.streamData
    };

    const notificationId = this.pendingSwitch.notificationId;

    // Clear notification
    await chrome.notifications.clear(notificationId);
    await this.clearPendingSwitch();

    // Perform the switch
    await this.switchToStream(stream);
    this.currentWatchingStream = stream.username;
  }

  async cancelSwitch() {
    if (!this.pendingSwitch) {
      return;
    }

    const notificationId = this.pendingSwitch.notificationId;

    // Clear notification
    await chrome.notifications.clear(notificationId);
    await this.clearPendingSwitch();
  }

  async clearPendingSwitch() {
    if (this.pendingSwitch) {
      this.pendingSwitch = null;
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

