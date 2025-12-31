/**
 * Background service worker for stream polling and auto-switching
 */

// MV3 service worker is configured as an ES module in manifest.json (`background.type = "module"`),
// so we can use normal static imports here.
import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';
import notificationManager from './utils/notifications.js';
import { shouldRerollCategoryFallback } from './utils/fallback-mode.js';

function isTwitchUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === 'twitch.tv' || host.endsWith('.twitch.tv') || host === 'twitch.com' || host.endsWith('.twitch.com');
  } catch {
    return false;
  }
}

function getChannelFromTwitchUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!(host === 'twitch.tv' || host.endsWith('.twitch.tv') || host === 'twitch.com' || host.endsWith('.twitch.com'))) {
      return null;
    }
    const path = u.pathname || '/';
    const seg = path.split('/').filter(Boolean)[0];
    if (!seg) return null;

    // Reserved/non-channel routes
    const reserved = new Set([
      'directory', 'downloads', 'p', 'videos', 'clips', 'search',
      'settings', 'subscriptions', 'wallet', 'turbo', 'prime',
      'inventory', 'drops', 'friends', 'messages', 'moderator',
      'safety', 'jobs', 'privacy', 'terms'
    ]);
    if (reserved.has(seg.toLowerCase())) return null;
    return seg.toLowerCase();
  } catch {
    return null;
  }
}

class BackgroundWorker {
  constructor() {
    this.pollInterval = null;
    this.currentWatchingStream = null;
    this.lastPollTime = 0;
    this.isPolling = false;
    this.idleState = 'active';
    this.settings = null;
    this.snoozeUntil = 0;
    this._initPromise = null;
    this.runtime = {
      fallback: {
        active: false,
        category: null,
        username: null,
        updatedAt: 0,
        reason: null,
      },
    };
  }

  async init() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
    // Load settings
    this.settings = await storage.getSettings();

    // Load runtime state (non-critical, used for UX + avoiding constant fallback rerolls)
    const persistedRuntime = await storage.get('runtime');
    if (persistedRuntime && typeof persistedRuntime === 'object') {
      this.runtime = {
        ...this.runtime,
        ...persistedRuntime,
        fallback: {
          ...this.runtime.fallback,
          ...(persistedRuntime.fallback || {}),
        },
      };
    }
    
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

    // Set initial badge state
    this.updateBadge({ enabled: !!this.settings?.redirectEnabled, isLive: false });

    // Prompt-before-switch handlers (optional setting)
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      this.handleSwitchPromptResponse(notificationId, buttonIndex);
    });

    // Listen for install/update
    chrome.runtime.onInstalled.addListener(() => {
      this.handleInstall();
    });
    })();

    return this._initPromise;
  }

  async forcePollNow() {
    // Ensure the poller is running and settings are loaded
    await this.init();
    // Bypass 5s throttle
    this.lastPollTime = 0;
    await this.pollStreams();
  }

  async handleInstall() {
    // Extension works out of the box with hardcoded Client ID
    // No need to open options page - it just works!
    await storage.getSettings();
    // Client ID is automatically set from defaults, so we're good
  }

  async handleSettingsChange(newSettings) {
    this.settings = newSettings;

    // If Auto-Swap was turned off, clear fallback runtime (prevents stale "fallback mode" state).
    if (!this.settings?.redirectEnabled) {
      await this.setFallbackRuntime({ active: false });
    }
    
    // Reinitialize API if client ID changed
    if (newSettings.clientId) {
      await twitchAPI.initialize(newSettings.clientId);
    }

    // Restart polling with new interval
    this.stopPolling();
    this.startPolling();

    // Update badge immediately when user toggles Auto-Swap in the popup/options.
    this.updateBadge({ enabled: !!this.settings?.redirectEnabled, isLive: false });
  }

  updateBadge({ enabled, isLive, target } = {}) {
    try {
      if (!chrome?.action) return;

      const on = !!enabled;
      const live = !!isLive;
      const text = on ? (live ? 'LIVE' : 'ON') : '';
      // Use high-contrast colors so the user can tell it's enabled at a glance.
      const color = on ? '#00dc82' : '#5c5c66';
      const title = on
        ? `Auto-Swap ON${target ? ` — Target: ${target}` : ''}`
        : 'Auto-Swap OFF';

      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color });
      chrome.action.setTitle({ title });
    } catch (e) {
      // Non-fatal; badge is just a UX indicator.
      console.warn('Failed to update badge:', e);
    }
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
    // Ensure modules are loaded
    if (!storage || !twitchAPI) {
      console.warn('Modules not loaded yet, skipping poll');
      return;
    }

    // Prevent concurrent polls
    const now = Date.now();
    if (now - this.lastPollTime < 5000) {
      return; // Minimum 5 seconds between polls
    }
    this.lastPollTime = now;

    try {
      // If Auto-Swap is enabled but the managed tab is missing, disable Auto-Swap.
      if (this.settings?.redirectEnabled && this.settings?.managedTwitchTabId != null) {
        const exists = await new Promise((resolve) => {
          chrome.tabs.get(this.settings.managedTwitchTabId, (tab) => {
            if (chrome.runtime.lastError || !tab) return resolve(false);
            return resolve(true);
          });
        });
        if (!exists) {
          const newSettings = { ...this.settings, redirectEnabled: false, managedTwitchTabId: null };
          await storage.saveSettings(newSettings);
          this.settings = newSettings;
          this.updateBadge({ enabled: false, isLive: false });
          return;
        }
      }

      const streams = await storage.getStreams();
      if (streams.length === 0) {
        this.updateBadge({ enabled: !!this.settings?.redirectEnabled, isLive: false });
        return;
      }

      // Sort by priority
      const prioritized = [...streams].sort((a, b) => a.priority - b.priority);

      // Check stream statuses (batch request)
      const usernames = prioritized.map(s => s.username);
      const statuses = await twitchAPI.checkStreamsStatus(usernames);

      // Find highest priority live stream
      let highestPriorityLive = null;
      // Track status updates we want to persist back to storage without clobbering list edits
      const statusUpdatesByUsername = new Map();

      for (const stream of prioritized) {
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

        statusUpdatesByUsername.set(stream.username, {
          isLive: stream.isLive,
          streamData: stream.streamData,
          wasLive: stream.wasLive
        });
      }

      // If any list stream is live, we are not in category fallback mode anymore.
      if (highestPriorityLive) {
        await this.setFallbackRuntime({ active: false });
      }

      // Badge: indicate enabled + whether the current highest priority is live
      this.updateBadge({
        enabled: !!this.settings?.redirectEnabled,
        isLive: !!highestPriorityLive,
        target: highestPriorityLive?.username || prioritized?.[0]?.username || null
      });

      // Save updated stream statuses WITHOUT overwriting list edits that might have happened mid-poll
      // (e.g., user adds/reorders streams while we're awaiting the network call).
      const latestStreams = await storage.getStreams();
      for (const s of latestStreams) {
        const update = statusUpdatesByUsername.get(s.username);
        if (update) {
          s.isLive = update.isLive;
          s.streamData = update.streamData;
          s.wasLive = update.wasLive;
        }
      }
      await storage.saveStreams(latestStreams);

      // Handle auto-switching
      if (this.settings?.redirectEnabled) {
        await this.handleAutoSwitch(highestPriorityLive, prioritized);
      }

      // Handle category fallback if no streams are live
      if (!highestPriorityLive && this.settings?.fallbackCategory) {
        await this.handleCategoryFallback({ force: false, reason: 'auto' });
      }

      // Update analytics (premium feature)
      if (this.settings?.premiumStatus) {
        await this.updateAnalytics(highestPriorityLive);
      }

    } catch (error) {
      console.error('Error polling streams:', error);
      
      // Handle different error types
      if (error.code === 'AUTH_ERROR' || error.message.includes('Client ID') || error.message.includes('401')) {
        // Stop polling for auth errors (usually token broker/CORS/backend issues in production)
        this.stopPolling();
        console.error('Authentication error - polling stopped. Verify token broker is online and CORS allows the extension origin.');
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

  async handleAutoSwitch(liveStream) {
    if (!liveStream) {
      return;
    }

    // Check if we should switch
    const shouldSwitch = await this.shouldSwitchToStream(liveStream);

    if (shouldSwitch) {
      if (this.settings?.promptBeforeSwitch) {
        await this.promptBeforeSwitch(liveStream);
      } else {
        await this.switchToStream(liveStream);
        this.currentWatchingStream = liveStream.username;
      }
    }
  }

  async promptBeforeSwitch(stream) {
    if (Date.now() < this.snoozeUntil) return;

    const notificationId = `tsr_autoswap_${Date.now()}`;
    await chrome.storage.local.set({
      pendingSwitch: {
        notificationId,
        username: stream.username,
        createdAt: Date.now()
      }
    });

    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Auto-Swap ready',
      message: `Switch to ${stream.username}?`,
      buttons: [
        { title: 'Switch' },
        { title: 'Not now' }
      ],
      priority: 2
    });
  }

  async handleSwitchPromptResponse(notificationId, buttonIndex) {
    const { pendingSwitch } = await chrome.storage.local.get(['pendingSwitch']);
    if (!pendingSwitch || pendingSwitch.notificationId !== notificationId) return;

    if (buttonIndex === 0) {
      // Switch
      await this.switchToStream({ username: pendingSwitch.username });
      this.currentWatchingStream = pendingSwitch.username;
    } else {
      // Snooze prompts for 5 minutes
      this.snoozeUntil = Date.now() + 5 * 60 * 1000;
    }

    await chrome.storage.local.remove(['pendingSwitch']);
    chrome.notifications.clear(notificationId);
  }

  async shouldSwitchToStream(stream) {
    // Only manage exactly one Twitch tab (if set)
    const managedTabId = this.settings?.managedTwitchTabId;
    if (!managedTabId) return false;

    // Get that specific tab (not the active tab)
    return new Promise((resolve) => {
      chrome.tabs.get(managedTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          resolve(false);
          return;
        }

        // Don't switch if tab is not fully loaded
        if (tab.status !== 'complete') {
          resolve(false);
          return;
        }

        const currentUrl = tab.url || '';
        // Only switch if the managed tab is a Twitch tab (stream page, directory, home, etc.)
        if (!isTwitchUrl(currentUrl)) {
          resolve(false);
          return;
        }

        const currentlyWatching = getChannelFromTwitchUrl(currentUrl);
        this.currentWatchingStream = currentlyWatching;

        // Don't switch if we're already on the target channel page
        if (currentlyWatching && currentlyWatching === stream.username) {
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  async switchToStream(stream) {
    return new Promise((resolve) => {
      const managedTabId = this.settings?.managedTwitchTabId;
      if (!managedTabId) {
        resolve(false);
        return;
      }

      chrome.tabs.get(managedTabId, async (tab) => {
        if (chrome.runtime.lastError || !tab) {
          resolve(false);
          return;
        }

        const streamUrl = `https://www.twitch.tv/${stream.username}`;

        // Update the tab
        chrome.tabs.update(managedTabId, { url: streamUrl }, () => {
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

  async handleCategoryFallback({ force = false, reason = 'auto' } = {}) {
    return this._handleCategoryFallbackInternal({ force, reason });
  }

  async _handleCategoryFallbackInternal({ force, reason }) {
    if (!this.settings?.fallbackCategory) return false;

    const managedTabId = this.settings?.managedTwitchTabId;
    if (!managedTabId) return false;

    const tab = await new Promise((resolve) => {
      chrome.tabs.get(managedTabId, (t) => {
        if (chrome.runtime.lastError || !t) return resolve(null);
        return resolve(t);
      });
    });

    if (!tab) return false;
    if (!isTwitchUrl(tab.url || '')) return false; // Only use fallback if the managed tab is a Twitch tab

    const currentChannel = getChannelFromTwitchUrl(tab.url || '');
    const isFallbackActive = !!this.runtime?.fallback?.active;

    const shouldReroll = shouldRerollCategoryFallback({
      force,
      isFallbackActive,
      currentChannel,
      runtimeCategory: this.runtime?.fallback?.category ?? null,
      settingsCategory: this.settings?.fallbackCategory ?? null,
    });

    if (!shouldReroll) {
      // Keep runtime state in sync (in case we restarted and lost in-memory values).
      await this.setFallbackRuntime({
        active: true,
        category: this.settings.fallbackCategory,
        username: currentChannel || (this.runtime?.fallback?.username ?? null),
        reason: this.runtime?.fallback?.reason ?? 'auto',
      });
      return false;
    }

    try {
      const randomStream = await twitchAPI.getRandomStreamFromCategory(this.settings.fallbackCategory);
      if (!randomStream?.user_login) return false;

      const username = String(randomStream.user_login).toLowerCase();
      const streamUrl = `https://www.twitch.tv/${username}`;

      await this.setFallbackRuntime({
        active: true,
        category: this.settings.fallbackCategory,
        username,
        reason,
      });

      await new Promise((resolve) => {
        chrome.tabs.update(managedTabId, { url: streamUrl }, () => resolve(true));
      });

      return true;
    } catch (error) {
      console.error('Error getting fallback stream:', error);
      return false;
    }
  }

  async setFallbackRuntime({ active, category, username, reason } = {}) {
    const next = {
      ...this.runtime,
      fallback: {
        ...this.runtime.fallback,
        ...(typeof active === 'boolean' ? { active } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(username !== undefined ? { username } : {}),
        ...(reason !== undefined ? { reason } : {}),
        updatedAt: Date.now(),
      },
    };
    this.runtime = next;
    await storage.set({ runtime: next }, true);
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

// IMPORTANT: Register message listeners at top-level so MV3 can deliver messages immediately
// even when the service worker is waking up (before async init completes).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'TSR_GET_TAB_ID') {
    sendResponse({ tabId: sender?.tab?.id ?? null });
    return true;
  }
  if (message?.type === 'TSR_FORCE_POLL') {
    worker.forcePollNow()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (message?.type === 'TSR_FALLBACK_REROLL') {
    worker.init()
      .then(() => worker.handleCategoryFallback({ force: true, reason: 'manual' }))
      .then((didRedirect) => sendResponse({ ok: true, didRedirect: !!didRedirect }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  return false;
});

// Also listen for settings changes at top-level, so badge/polling updates are not delayed
// by async init ordering.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes.settings?.newValue) return;
  worker.init()
    .then(() => worker.handleSettingsChange(changes.settings.newValue))
    .catch((e) => console.warn('Failed to apply settings change:', e));
});

// If the managed tab is closed, disable Auto-Swap automatically.
chrome.tabs.onRemoved.addListener((tabId) => {
  worker.init()
    .then(async () => {
      const managed = worker.settings?.managedTwitchTabId ?? null;
      if (managed == null) return;
      if (tabId !== managed) return;

      const newSettings = { ...worker.settings, redirectEnabled: false, managedTwitchTabId: null };
      await storage.saveSettings(newSettings);
      worker.settings = newSettings;
      worker.updateBadge({ enabled: false, isLive: false });
    })
    .catch((e) => console.warn('Failed to disable Auto-Swap on tab close:', e));
});

// Initialize on service worker startup
worker.init().catch(error => {
  console.error('Service worker initialization failed:', error);
});

// Also initialize on install/update
chrome.runtime.onInstalled.addListener(() => {
  worker.init().catch(error => {
    console.error('Service worker initialization failed on install:', error);
  });
});

