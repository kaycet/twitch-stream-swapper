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
import { shouldRerollCategoryFallback, applyFallbackPatch } from './utils/fallback-mode.js';
import { isTwitchUrl, getChannelFromTwitchUrl, isRaidReferrerUrl } from './utils/twitch-url.js';
import { computeBadge, badgeStateFromStreams } from './utils/badge.js';
import { viewingCreditSeconds } from './utils/analytics.js';
import { mergeStatusUpdates } from './utils/stream-sync.js';
import { memoizeAsync } from './utils/memoize-async.js';
import {
  NOT_NOW_BUTTON,
  isAutoswapNotificationId,
  isPendingNotification,
  makeAutoswapNotificationId,
  planSwitchPrompt,
  planPromptResponse,
} from './utils/switch-prompt.js';

class BackgroundWorker {
  constructor() {
    this.currentWatchingStream = null;
    this.lastPollTime = 0;
    this.idleState = 'active';
    this.settings = null;
    // Shared by every top-level listener. Memoized so init runs once per
    // worker lifetime, but a rejected init is forgotten so the next event
    // retries instead of inheriting a permanently failed promise.
    this.init = memoizeAsync(() => this._init());
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

  async _init() {
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

    // Seed idle state: it defaults to 'active' on every service-worker
    // start, so without this a worker woken by an alarm while the machine
    // sits idle would happily poll. The onStateChanged listener lives at
    // top level with the other waking-event listeners.
    if (chrome.idle?.queryState) {
      this.idleState = await new Promise((resolve) => {
        chrome.idle.queryState(60, (state) => resolve(state || 'active'));
      });
    }

    // Start polling
    this.startPolling();

    // Set initial badge state
    await this.refreshBadge();
  }

  async forcePollNow() {
    // Ensure the poller is running and settings are loaded
    await this.init();
    // Bypass 5s throttle
    this.lastPollTime = 0;
    await this.pollStreams();
  }

  async handleSettingsChange(newSettings) {
    this.settings = newSettings;

    // If Auto-Swap was turned off, clear fallback runtime (prevents stale "fallback mode" state).
    if (!this.settings?.redirectEnabled) {
      await this.setFallbackRuntime({ active: false });
      // A "Switch to X?" card (or a "Not now" snooze) from before the toggle
      // must not suppress the next prompt after re-enabling, nor linger with
      // buttons that no-op.
      await this.clearPendingSwitch();
      await chrome.storage.local.remove(['switchSnoozeUntil']);
    } else if (!this.settings?.promptBeforeSwitch) {
      // Prompting turned off: an outstanding card would answer to nothing.
      await this.clearPendingSwitch();
    }
    
    // Reinitialize API if client ID changed
    if (newSettings.clientId) {
      await twitchAPI.initialize(newSettings.clientId);
    }

    // Restart polling with new interval
    this.stopPolling();
    this.startPolling();

    // Update badge immediately when user toggles Auto-Swap in the popup/options.
    // Recompute the live count from storage instead of painting 0: any
    // settings change (theme, raid toggle, …) used to blank the count until
    // the next poll, up to a full check interval later.
    await this.refreshBadge();
  }

  /** Repaint the badge from the persisted stream statuses of the last poll. */
  async refreshBadge() {
    let state = { liveCount: 0, target: null };
    try {
      state = badgeStateFromStreams(await storage.getStreams());
    } catch {
      // Storage read failed; still paint the enabled state.
    }
    this.updateBadge({ enabled: !!this.settings?.redirectEnabled, ...state });
  }

  updateBadge({ enabled, liveCount = 0, target } = {}) {
    try {
      if (!chrome?.action) return;

      const { text, color, title } = computeBadge({ enabled, liveCount, target });

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
          await this.refreshBadge();
          return;
        }
      }

      const streams = await storage.getStreams();
      if (streams.length === 0) {
        this.updateBadge({ enabled: !!this.settings?.redirectEnabled, liveCount: 0 });
        // An empty list still counts as "no streams live": category fallback
        // must run here too, or enabling Auto-Swap + a fallback category with
        // no streams configured silently does nothing.
        if (this.settings?.redirectEnabled && this.settings?.fallbackCategory) {
          await this.handleCategoryFallback({ force: false, reason: 'auto' });
        }
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
      // Skip the save when nothing changed (e.g. everyone offline before and
      // after): each write fires storage.onChanged in every context — cache
      // flushes plus a content-script refresh in every open Twitch tab —
      // once per poll, forever.
      const latestStreams = await storage.getStreams();
      if (mergeStatusUpdates(latestStreams, statusUpdatesByUsername)) {
        await storage.saveStreams(latestStreams);
      }

      // Handle auto-switching
      if (this.settings?.redirectEnabled) {
        await this.handleAutoSwitch(highestPriorityLive);
      }

      // Handle category fallback if no streams are live. Fallback is part of
      // Auto-Swap: without this gate, turning Auto-Swap off in Options (which
      // keeps managedTwitchTabId set) left the extension redirecting the
      // managed tab to random category streams while the UI said "OFF".
      if (!highestPriorityLive && this.settings?.redirectEnabled && this.settings?.fallbackCategory) {
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
    // Everything this decision needs lives in storage (not on `this`) so it
    // survives MV3 service-worker suspension between polls and clicks.
    const { pendingSwitch, switchSnoozeUntil } = await chrome.storage.local.get([
      'pendingSwitch',
      'switchSnoozeUntil',
    ]);
    const plan = planSwitchPrompt({
      pendingSwitch,
      snoozeUntil: switchSnoozeUntil,
      username: stream.username,
    });
    if (!plan.prompt) return;

    // Replacing the outstanding card: clear the old one so it cannot linger
    // in the OS notification center with buttons that no longer match.
    if (plan.staleNotificationId) {
      chrome.notifications.clear(plan.staleNotificationId);
    }

    const notificationId = makeAutoswapNotificationId();
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
    const plan = planPromptResponse({ pendingSwitch, notificationId, buttonIndex });

    if (plan.action === 'switch') {
      await this.switchToStream({ username: plan.username });
      this.currentWatchingStream = plan.username;
      await chrome.storage.local.remove(['pendingSwitch']);
    } else if (plan.action === 'snooze') {
      // Persisted: an in-memory snooze died with the next worker suspension.
      await chrome.storage.local.set({ switchSnoozeUntil: plan.snoozeUntil });
      await chrome.storage.local.remove(['pendingSwitch']);
    }
    // 'stale' (a card whose pendingSwitch was replaced or cleared) falls
    // through: still dismiss it so it does not sit there doing nothing.
    chrome.notifications.clear(notificationId);
  }

  /**
   * User dismissed the card with X. Treated exactly like "Not now": snooze
   * for SNOOZE_MS. Simply forgetting the card would re-prompt on the very
   * next poll (~1/min) — the spam the dedup exists to stop.
   */
  async handleSwitchPromptClosed(notificationId) {
    const { pendingSwitch } = await chrome.storage.local.get(['pendingSwitch']);
    if (!isPendingNotification(pendingSwitch, notificationId)) return;
    await this.handleSwitchPromptResponse(notificationId, NOT_NOW_BUTTON);
  }

  async clearPendingSwitch() {
    const { pendingSwitch } = await chrome.storage.local.get(['pendingSwitch']);
    if (!pendingSwitch) return;
    await chrome.storage.local.remove(['pendingSwitch']);
    if (pendingSwitch.notificationId) {
      chrome.notifications.clear(pendingSwitch.notificationId);
    }
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
          // Tab may have closed between get() and update(); reading
          // lastError also keeps Chrome from logging "Unchecked
          // runtime.lastError". A failed update is not a switch, so don't
          // record one.
          if (chrome.runtime.lastError) {
            resolve(false);
            return;
          }
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

      const updated = await new Promise((resolve) => {
        chrome.tabs.update(managedTabId, { url: streamUrl }, () => {
          // Read lastError (tab closed mid-flight) so the failure doesn't
          // count as a switch and Chrome doesn't log it as unchecked.
          resolve(!chrome.runtime.lastError);
        });
      });
      if (!updated) return false;

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
    const { fallback, changed } = applyFallbackPatch(this.runtime.fallback, {
      active,
      category,
      username,
      reason,
    });
    // No state change means nothing to persist: in the steady state (a list
    // stream is live, or fallback is parked on a channel) this runs every
    // poll, and writing just a fresh updatedAt fired storage.onChanged in
    // every context — cache flushes plus a content-script refresh in every
    // open Twitch tab — once per poll, forever. (updatedAt is never read.)
    if (!changed) return;

    const next = {
      ...this.runtime,
      fallback: { ...fallback, updatedAt: Date.now() },
    };
    this.runtime = next;
    await storage.set({ runtime: next }, true);
  }

  async updateAnalytics(liveStream) {
    if (!liveStream) return;

    const analytics = await storage.getAnalytics();
    const now = Date.now();

    // Credit real elapsed time since the previous credit, capped at one
    // poll interval — not a flat interval per poll. Forced polls (every
    // popup add/remove/reorder triggers one) used to add a full interval
    // each, inflating "viewing time" by minutes per click.
    const credit = viewingCreditSeconds({
      nowMs: now,
      lastUpdateMs: analytics.lastViewingUpdate,
      checkIntervalMs: this.settings?.checkInterval || 60000,
    });
    analytics.lastViewingUpdate = now;

    if (credit > 0) {
      const username = liveStream.username;
      analytics.viewingTime = analytics.viewingTime || {};
      analytics.viewingTime[username] = (analytics.viewingTime[username] || 0) + credit;
    }

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

// Prompt-before-switch buttons (optional setting). Registered at top level:
// clicking the notification after the service worker was suspended re-wakes
// it, and only synchronously-registered listeners receive that waking event —
// a listener added inside async init() misses it. "Stream live" notification
// clicks are handled the same way in utils/notifications.js.
//
// Both prompt events run through one queue: some platforms fire
// onButtonClicked and then onClosed(byUser=true) for the same card, and the
// button handler has to await init() first. Without the queue the close
// handler would win the race, snooze, and the click would arrive "stale".
let promptEvents = Promise.resolve();
function queuePromptEvent(label, task) {
  promptEvents = promptEvents
    .then(task)
    .catch((e) => console.warn(label, e));
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (!isAutoswapNotificationId(notificationId)) return;
  queuePromptEvent('Failed to handle switch prompt response:', () =>
    worker.init().then(() => worker.handleSwitchPromptResponse(notificationId, buttonIndex)));
});

// Dismissed with X (byUser). Programmatic clears and OS auto-hides are not
// user decisions: the card is still actionable from the notification center,
// so pendingSwitch keeps suppressing duplicate prompts for it.
chrome.notifications.onClosed.addListener((notificationId, byUser) => {
  if (!byUser || !isAutoswapNotificationId(notificationId)) return;
  queuePromptEvent('Failed to handle dismissed switch prompt:', () =>
    worker.handleSwitchPromptClosed(notificationId));
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
      await worker.refreshBadge();
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

// Idle transitions — registered at top level like every other waking event:
// a listener added inside async init() dies with the suspended worker, so
// the worker never heard "user went idle/active" transitions that happened
// while it slept, and polling never actually paused. Top-level registration
// makes the transition itself re-wake the worker.
if (globalThis.chrome?.idle?.onStateChanged) {
  chrome.idle.onStateChanged.addListener((state) => {
    worker.idleState = state;
    worker.init()
      .then(() => worker.handleIdleStateChange())
      .catch((e) => console.warn('Failed to handle idle state change:', e));
  });
}

// Browser restart: re-establish polling.
chrome.runtime.onStartup.addListener(() => {
  worker.init().catch((e) => console.error('Startup initialization failed:', e));
});

// Initialize on service worker startup
worker.init().catch(error => {
  console.error('Service worker initialization failed:', error);
});

// Also initialize on install/update. (init() used to register a second
// onInstalled listener for a handleInstall() that only re-read settings —
// init() already does that, so both are gone.)
chrome.runtime.onInstalled.addListener(() => {
  worker.init().catch(error => {
    console.error('Service worker initialization failed on install:', error);
  });
});

