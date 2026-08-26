/**
 * Background service worker for stream polling and auto-switching
 */

// MV3 service worker is configured as an ES module in manifest.json (`background.type = "module"`),
// so we can use normal static imports here.
import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';
import notificationManager from './utils/notifications.js';
import { isQuietHours } from './utils/quiet-hours.js';
import { retryDelayMs } from './utils/poll-errors.js';
import { shouldRerollCategoryFallback } from './utils/fallback-mode.js';
import { isTwitchUrl, getChannelFromTwitchUrl, isRaidReferrerUrl } from './utils/twitch-url.js';

class BackgroundWorker {
  constructor() {
    this.currentWatchingStream = null;
    this.lastPollTime = 0;
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
    this.updateBadge({ enabled: !!this.settings?.redirectEnabled, liveCount: 0 });

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
    this.updateBadge({ enabled: !!this.settings?.redirectEnabled, liveCount: 0 });
  }

  updateBadge({ enabled, liveCount = 0, target } = {}) {
    try {
      if (!chrome?.action) return;

      const on = !!enabled;
      const count = Number(liveCount) || 0;
      const text = count > 0 ? String(count) : '';
      // Purple = Auto-Swap on, gray = off; the count stays glanceable either way.
      const color = on ? '#9146ff' : '#5c5c66';
      const title = on
        ? (target ? `${count} live — watching ${target}` : 'Auto-Swap ON — no one live')
        : (count > 0 ? `Auto-Swap off — ${count} live` : 'Auto-Swap off');

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
    // Don't schedule while idle/locked; resumes via handleIdleStateChange.
    if (this.idleState === 'idle' || this.idleState === 'locked') {
      return;
    }

    // Don't poll if no client ID
    if (!this.settings?.clientId) {
      return;
    }

    // Poll immediately
    this.pollStreams();

    // chrome.alarms (not setInterval): MV3 kills idle service workers ~30s
    // after the last event, taking timers with them. Alarms persist and
    // re-wake the worker on schedule. Minimum period is 1 minute, which
    // matches the smallest configurable check interval.
    const interval = this.settings?.checkInterval || 60000;
    chrome.alarms.create('tsr-poll', { periodInMinutes: Math.max(1, interval / 60000) });
  }

  stopPolling() {
    chrome.alarms.clear('tsr-poll');
    chrome.alarms.clear('tsr-poll-retry');
  }

  scheduleRetry(delayMs) {
    // One-shot alarm, not setTimeout: MV3 suspends the service worker and
    // takes timers with it, which would leave polling stopped forever after
    // a transient error. Alarms have a 1-minute floor, which matches the
    // shortest retry delay we use anyway.
    chrome.alarms.create('tsr-poll-retry', { delayInMinutes: Math.max(1, delayMs / 60000) });
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
          this.updateBadge({ enabled: false, liveCount: 0 });
          return;
        }
      }

      const streams = await storage.getStreams();
      if (streams.length === 0) {
        this.updateBadge({ enabled: !!this.settings?.redirectEnabled, liveCount: 0 });
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
        // Missing entries (e.g. usernames the API layer filtered out as invalid)
        // must count as offline, so check for both null and undefined.
        const isLive = statuses[stream.username] != null;
        
        // Update stream status
        stream.isLive = isLive;
        stream.streamData = statuses[stream.username] || null;

        if (isLive && !highestPriorityLive) {
          highestPriorityLive = stream;
        }

        // Send notifications for newly live streams (respects per-channel bell + quiet hours)
        if (isLive) {
          const wasLive = stream.wasLive || false;
          const wantsNotify = this.settings?.notificationsEnabled
            && stream.notify !== false
            && !isQuietHours(this.settings?.quietHours);
          if (!wasLive && stream.streamData && wantsNotify) {
            notificationManager.notifyStreamLive(
              stream.username,
              stream.streamData.title,
              stream.streamData.game_name,
              stream.streamData.thumbnail_url,
              stream.streamData.viewer_count
            );
          }
          stream.wasLive = true;
        } else {
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

      // Badge: live-count at a glance; color signals whether Auto-Swap is on
      this.updateBadge({
        enabled: !!this.settings?.redirectEnabled,
        liveCount: prioritized.filter((s) => s.isLive).length,
        target: highestPriorityLive?.username || null
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
        await this.handleAutoSwitch(highestPriorityLive);
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

      // Every error class retries. The old code stopped polling permanently
      // on AUTH_ERROR, so one transient token-broker hiccup killed auto-swap
      // until the extension was reloaded.
      this.stopPolling();
      const retryDelay = retryDelayMs(error);
      this.scheduleRetry(retryDelay);
      console.warn(`Poll failed (${error?.code || 'UNKNOWN'}) - retrying in ${Math.round(retryDelay / 60000)} minute(s)`);
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

    // If the current Twitch page is a raid redirect (?referrer=raid) and user wants to stay on raids,
    // do not override it with category fallback redirects.
    if (this.settings?.stayOnRaid && isRaidReferrerUrl(tab.url || '')) {
      return false;
    }

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

      // Count fallback redirects as switches for analytics (supporter feature).
      if (this.settings?.premiumStatus) {
        await this.recordSwitch(username, { source: 'fallback' });
      }

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

  async recordSwitch(username, meta = {}) {
    const analytics = await storage.getAnalytics();
    analytics.switchCount = (analytics.switchCount || 0) + 1;
    analytics.lastSwitch = {
      username,
      timestamp: Date.now(),
      ...meta
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
      worker.updateBadge({ enabled: false, liveCount: 0 });
    })
    .catch((e) => console.warn('Failed to disable Auto-Swap on tab close:', e));
});

// Poll alarm — fires even after the service worker was suspended, and firing
// re-wakes the worker (the whole point of using alarms over setInterval).
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'tsr-poll' && alarm.name !== 'tsr-poll-retry') return;
  worker.init()
    .then(() => {
      if (worker.idleState === 'idle' || worker.idleState === 'locked') return;
      if (alarm.name === 'tsr-poll-retry') {
        // Error-recovery alarm: re-establish the periodic poll (which also
        // polls immediately).
        worker.startPolling();
        return;
      }
      return worker.pollStreams();
    })
    .catch((e) => console.warn('Alarm poll failed:', e));
});

// Browser restart: re-establish polling.
chrome.runtime.onStartup.addListener(() => {
  worker.init().catch((e) => console.error('Startup initialization failed:', e));
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

