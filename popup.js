import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';
import ErrorMessageManager from './utils/error-messages.js';
import { KO_FI_URL } from './utils/config.js';

function isTwitchUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === 'twitch.tv' || host.endsWith('.twitch.tv') || host === 'twitch.com' || host.endsWith('.twitch.com');
  } catch {
    return false;
  }
}

class PopupManager {
  constructor() {
    this.streams = [];
    this.settings = null;
    this.draggedElement = null;
    this.dragOverElement = null;
    this.debounceTimeout = null;
    this.statusCheckInterval = null;
    this.dragGhost = null;
    this.dragOffset = { x: 0, y: 0 };
    this.categorySuggestTimer = null;
    this.categorySuggestCache = new Map(); // query -> { ts, items }
  }

  async forcePollAndSwap() {
    try {
      await chrome.runtime.sendMessage({ type: 'TSR_FORCE_POLL' });
    } catch (err) {
      // Not fatal; the background will still poll on interval.
      console.warn('Failed to trigger force poll:', err);
    }
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.render();
    this.startStatusPolling();
  }

  async loadData() {
    try {
      this.streams = await storage.getStreams();
      this.settings = await storage.getSettings();
      
      // Initialize Twitch API if client ID is set
      if (this.settings.clientId) {
        await twitchAPI.initialize(this.settings.clientId);
      }

      // Sort streams by priority
      this.streams.sort((a, b) => a.priority - b.priority);

      // If Auto-Swap is enabled but no managed tab is set (e.g., after updates/migrations),
      // immediately bind to a single Twitch tab (or create one) so "enable" always opens a tab.
      if (this.settings?.redirectEnabled && !this.settings?.managedTwitchTabId) {
        const managedTwitchTabId = await this.pickManagedTwitchTabId();
        const newSettings = { ...this.settings, managedTwitchTabId };
        await storage.saveSettings(newSettings);
        this.settings = newSettings;
        // Force a poll/swap so user sees it immediately.
        await this.forcePollAndSwap();
      }

      // Apply theme
      this.applyTheme();
      
      // Update category fallback widget
      this.updateCategoryFallbackWidget();

      // Update autoswap UI
      this.updateAutoSwapUI();
    } catch (error) {
      console.error('Error loading data:', error);
      this.showMessage('Error loading data', 'error');
    }
  }

  applyTheme() {
    const theme = this.settings?.theme || 'default';
    // Remove any previously injected theme link(s)
    document.querySelectorAll('link[data-tsr-theme="1"]').forEach((el) => el.remove());

    // Clear any previously-applied custom vars
    this.clearCustomThemeVars();

    // Supporter-only themes
    if (!this.settings?.premiumStatus || theme === 'default') {
      return;
    }

    if (theme === 'custom') {
      const t = this.settings?.customTheme || {};
      this.applyCustomThemeVars(t);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `themes/${theme}.css`;
    link.dataset.tsrTheme = '1';
    document.head.appendChild(link);
  }

  applyCustomThemeVars(themeObj) {
    const root = document.documentElement;
    const t = themeObj || {};
    const set = (name, value) => {
      if (value) root.style.setProperty(name, value);
    };
    set('--purple-accent', t.accent);
    set('--purple-accent-hover', t.accentHover || t.accent);
    set('--bg', t.bg);
    set('--panel', t.panel);
    set('--panel-2', t.panel2 || t.panel);
    set('--border', t.border);
    set('--text', t.text);
    set('--muted', t.muted || '#adadb8');
  }

  clearCustomThemeVars() {
    const root = document.documentElement;
    [
      '--purple-accent',
      '--purple-accent-hover',
      '--bg',
      '--panel',
      '--panel-2',
      '--border',
      '--text',
      '--muted'
    ].forEach((k) => root.style.removeProperty(k));
  }

  setupEventListeners() {
    // Add stream button
    document.getElementById('addStreamBtn').addEventListener('click', () => {
      this.addStream();
    });

    // Enter key in input
    document.getElementById('streamInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addStream();
      }
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Support button (Ko-fi)
    const supportBtn = document.getElementById('supportBtn');
    if (supportBtn) {
      supportBtn.addEventListener('click', async () => {
        try {
          await new Promise((resolve) => chrome.tabs.create({ url: KO_FI_URL }, resolve));
        } catch {
          // Non-fatal
        }
      });
    }

    // Help / quickstart
    const helpBtn = document.getElementById('helpBtn');
    const helpTooltip = document.getElementById('helpTooltip');
    if (helpBtn && helpTooltip) {
      const closeHelp = () => {
        helpTooltip.style.display = 'none';
      };
      const openHelp = () => {
        helpTooltip.style.display = 'flex';
      };
      const isOpen = () => helpTooltip.style.display !== 'none';

      helpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen()) closeHelp();
        else openHelp();
      });

      // Click outside the card closes it
      helpTooltip.addEventListener('click', (e) => {
        if (e.target === helpTooltip) closeHelp();
      });

      // Esc closes
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) closeHelp();
      });
    }

    // Category fallback settings button
    const fallbackSettingsBtn = document.getElementById('fallbackSettingsBtn');
    if (fallbackSettingsBtn) {
      fallbackSettingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }

    // Category fallback editor in popup
    const fallbackToggle = document.getElementById('fallbackEnabledToggle');
    const fallbackInput = document.getElementById('fallbackCategoryInput');
    const fallbackApplyBtn = document.getElementById('fallbackApplyBtn');

    if (fallbackToggle) {
      fallbackToggle.addEventListener('change', async (e) => {
        const enabled = !!e.target.checked;
        if (!enabled) {
          await this.saveFallbackCategory('');
          this.showMessage('Category fallback disabled', 'success');
          return;
        }
        // enabling: if empty, keep focus on input
        const current = (fallbackInput?.value || '').trim();
        if (!current) {
          this.showMessage('Type a category name', 'info');
          fallbackInput?.focus();
        } else {
          await this.saveFallbackCategory(current);
          this.showMessage('Category fallback enabled', 'success');
        }
      });
    }

    if (fallbackInput) {
      fallbackInput.addEventListener('input', () => {
        // Debounced suggestions only; we don't autosave on every keystroke
        this.scheduleCategorySuggestions(fallbackInput.value);
      });
      fallbackInput.addEventListener('change', async () => {
        // When the user picks a datalist option or blurs after typing, apply it.
        const value = fallbackInput.value.trim();
        if (!value) return;
        await this.saveFallbackCategory(value);
        this.showMessage('Category fallback updated', 'success');
      });
      fallbackInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = fallbackInput.value.trim();
          if (!value) return;
          await this.saveFallbackCategory(value);
          this.showMessage('Category fallback updated', 'success');
        }
      });
    }

    if (fallbackApplyBtn) {
      fallbackApplyBtn.addEventListener('click', async () => {
        const value = (fallbackInput?.value || '').trim();
        if (!value) {
          this.showMessage('Type a category name', 'error');
          fallbackInput?.focus();
          return;
        }
        await this.saveFallbackCategory(value);
        this.showMessage('Category fallback updated', 'success');
      });
    }

    // Auto-swap toggle
    const autoSwapToggle = document.getElementById('autoSwapToggle');
    if (autoSwapToggle) {
      autoSwapToggle.addEventListener('change', async (e) => {
        const checked = !!e.target.checked;

        if (checked) {
          const ok = confirm(
            'Enable Auto-Swap?\n\nWhen you are on Twitch, the extension will redirect your active Twitch tab to the highest-priority live streamer.'
          );
          if (!ok) {
            e.target.checked = false;
            this.updateAutoSwapUI();
            return;
          }
        }

        // If enabling, bind auto-swap to exactly one Twitch tab (so other Twitch tabs won't be touched)
        let managedTwitchTabId = this.settings?.managedTwitchTabId ?? null;
        if (checked) {
          managedTwitchTabId = await this.pickManagedTwitchTabId();
        } else {
          managedTwitchTabId = null;
        }

        // Persist setting
        const newSettings = { ...this.settings, redirectEnabled: checked, managedTwitchTabId };
        await storage.saveSettings(newSettings);
        this.settings = newSettings;
        this.updateAutoSwapUI();

        // Force a poll/swap immediately when enabling
        if (checked) {
          try {
            await chrome.runtime.sendMessage({ type: 'TSR_FORCE_POLL' });
          } catch (err) {
            console.warn('Failed to trigger force poll:', err);
          }
        }

        this.showMessage(`Auto-Swap ${checked ? 'enabled' : 'disabled'}`, 'success');
      });
    }

    // Jump to managed tab
    const goManagedTabBtn = document.getElementById('goManagedTabBtn');
    if (goManagedTabBtn) {
      goManagedTabBtn.addEventListener('click', async () => {
        await this.goToManagedTab();
      });
    }

    // Keep popup UI in sync if settings change elsewhere
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.settings?.newValue) {
        this.settings = { ...this.settings, ...changes.settings.newValue };
        this.updateAutoSwapUI();
        this.updateCategoryFallbackWidget();
        this.applyTheme();
      }
    });

    // Debounced input validation
    let debounceTimeout;
    document.getElementById('streamInput').addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        this.validateUsername(e.target.value);
      }, 300);
    });
  }

  async validateUsername(username) {
    if (!username || username.trim().length === 0) return;
    
    // Basic validation - alphanumeric, underscores, hyphens
    const valid = /^[a-zA-Z0-9_]{4,25}$/.test(username.trim());
    const input = document.getElementById('streamInput');
    
    if (!valid && username.trim().length > 0) {
      input.style.borderColor = '#e91916';
    } else {
      input.style.borderColor = '#3d3d47';
    }
  }

  async addStream() {
    const input = document.getElementById('streamInput');
    const username = input.value.trim().toLowerCase();

    if (!username) {
      this.showMessage('Please enter a username', 'error');
      return;
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_]{4,25}$/.test(username)) {
      this.showMessage('Invalid username format', 'error');
      return;
    }

    // Check if already exists
    if (this.streams.some(s => s.username.toLowerCase() === username)) {
      this.showMessage('Stream already in list', 'error');
      input.value = '';
      return;
    }

    // Check free tier limit
    const isPremium = this.settings?.premiumStatus || false;
    if (!isPremium && this.streams.length >= 10) {
      this.showMessage('Free tier limited to 10 streams. Enable Supporter Features for unlimited (honor system).', 'info');
      // Nudge the user to Options
      setTimeout(() => {
        chrome.runtime.openOptionsPage();
      }, 2000);
      return;
    }

    // Add stream
    const newStream = {
      username: username,
      priority: this.streams.length + 1,
      addedAt: Date.now()
    };

    this.streams.push(newStream);
    await storage.saveStreams(this.streams);
    await this.forcePollAndSwap();
    
    input.value = '';
    this.render();
    this.showMessage(`Added ${username}`, 'success');
    
    // Check status immediately
    this.checkStreamStatuses();
  }

  async removeStream(username) {
    this.streams = this.streams.filter(s => s.username !== username);
    
    // Reorder priorities
    this.streams.forEach((stream, index) => {
      stream.priority = index + 1;
    });

    await storage.saveStreams(this.streams);
    await this.forcePollAndSwap();
    this.render();
    this.showMessage('Stream removed', 'success');
  }

  render() {
    const listContainer = document.getElementById('streamList');
    const emptyState = document.getElementById('emptyState');
    const streamCount = document.getElementById('streamCount');
    const premiumBadge = document.getElementById('premiumBadge');

    // Update count
    streamCount.textContent = `${this.streams.length} stream${this.streams.length !== 1 ? 's' : ''}`;
    
    // Show premium badge
    if (this.settings?.premiumStatus) {
      premiumBadge.style.display = 'block';
    } else {
      premiumBadge.style.display = 'none';
    }

    // Remove all stream items but preserve empty state
    const itemsToRemove = listContainer.querySelectorAll('.stream-item');
    itemsToRemove.forEach(item => item.remove());

    if (this.streams.length === 0) {
      emptyState.style.display = 'block';
      // Remove drag and drop listeners if any
      return;
    }

    emptyState.style.display = 'none';

    // Render stream items
    this.streams.forEach((stream, index) => {
      const item = this.createStreamItem(stream, index);
      listContainer.appendChild(item);
    });

    // Setup drag and drop
    this.setupDragAndDrop();
    
    // Update category fallback widget
    this.updateCategoryFallbackWidget();

    // Update auto-swap UI
    this.updateAutoSwapUI();
  }

  updateAutoSwapUI() {
    const toggle = document.getElementById('autoSwapToggle');
    const status = document.getElementById('autoSwapStatus');
    const goBtn = document.getElementById('goManagedTabBtn');
    if (!toggle || !status) return;

    const enabled = !!this.settings?.redirectEnabled;
    toggle.checked = enabled;
    status.textContent = enabled ? 'ON' : 'OFF';
    status.classList.toggle('on', enabled);
    status.classList.toggle('off', !enabled);

    // Update badge immediately from the popup (so the user sees it even if SW is waking up)
    this.updateActionBadge(enabled);

    if (goBtn) {
      const hasManaged = !!this.settings?.managedTwitchTabId;
      goBtn.style.display = enabled ? 'inline-flex' : 'none';
      goBtn.disabled = !enabled;
      goBtn.title = hasManaged ? 'Jump to the managed Twitch tab' : 'Pick/jump to a Twitch tab to manage';
    }
  }

  updateActionBadge(enabled) {
    try {
      if (!chrome?.action) return;
      const on = !!enabled;
      chrome.action.setBadgeText({ text: on ? 'ON' : '' });
      chrome.action.setBadgeBackgroundColor({ color: on ? '#00dc82' : '#5c5c66' });
      chrome.action.setTitle({ title: on ? 'Auto-Swap ON' : 'Auto-Swap OFF' });
    } catch {
      // Non-fatal
    }
  }

  async goToManagedTab() {
    try {
      let tabId = this.settings?.managedTwitchTabId ?? null;

      // If the current managed tab is missing/closed, pick a new one.
      if (tabId != null) {
        try {
          await new Promise((resolve, reject) => {
            chrome.tabs.get(tabId, (tab) => {
              if (chrome.runtime.lastError || !tab) return reject(new Error('Managed tab not found'));
              return resolve(tab);
            });
          });
        } catch {
          tabId = null;
        }
      }

      if (tabId == null) {
        tabId = await this.pickManagedTwitchTabId();
        const newSettings = { ...this.settings, managedTwitchTabId: tabId };
        await storage.saveSettings(newSettings);
        this.settings = newSettings;
        this.updateAutoSwapUI();
      }

      if (tabId == null) {
        this.showMessage('No Twitch tab found', 'error');
        return;
      }

      // Focus the tab + its window.
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (t) => {
          if (chrome.runtime.lastError || !t) return reject(new Error('Tab not found'));
          resolve(t);
        });
      });

      if (tab?.windowId != null) {
        await new Promise((resolve) => chrome.windows.update(tab.windowId, { focused: true }, resolve));
      }
      await new Promise((resolve) => chrome.tabs.update(tabId, { active: true }, resolve));

      this.showMessage('Jumped to managed tab', 'success');
    } catch (e) {
      console.warn('Failed to jump to managed tab:', e);
      this.showMessage('Failed to jump to managed tab', 'error');
    }
  }

  async pickManagedTwitchTabId() {
    try {
      // Prefer the current active Twitch tab
      const activeTabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
      const activeTab = activeTabs?.[0];
      if (activeTab?.id && isTwitchUrl(activeTab.url || '')) {
        return activeTab.id;
      }

      // Otherwise, pick any existing Twitch tab (first match)
      const twitchTabs = await new Promise((resolve) => {
        chrome.tabs.query({ url: ['*://twitch.tv/*', '*://*.twitch.tv/*'] }, resolve);
      });
      if (twitchTabs?.length) {
        return twitchTabs[0].id ?? null;
      }
    } catch (e) {
      console.warn('Failed to pick managed Twitch tab:', e);
    }

    // No Twitch tab found: create one and manage it.
    try {
      const created = await new Promise((resolve) => {
        chrome.tabs.create({ url: 'https://www.twitch.tv/' }, resolve);
      });
      return created?.id ?? null;
    } catch (e) {
      console.warn('Failed to create Twitch tab:', e);
      return null;
    }
  }

  createStreamItem(stream) {
    const item = document.createElement('div');
    item.className = 'stream-item';
    item.draggable = true;
    item.dataset.username = stream.username;
    item.dataset.priority = stream.priority;

    const isLive = stream.isLive || false;

    item.innerHTML = `
      <div class="stream-handle">☰</div>
      <div class="stream-info">
        <div class="stream-username">${stream.username}</div>
        <div class="stream-status">
          <span class="status-indicator ${isLive ? 'live' : ''}"></span>
          <span>${isLive ? 'Live' : 'Offline'}</span>
        </div>
      </div>
      <div class="stream-actions">
        <button class="action-btn" data-action="remove" title="Remove">×</button>
      </div>
    `;

    // Remove button
    item.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeStream(stream.username);
    });

    return item;
  }

  setupDragAndDrop() {
    const items = document.querySelectorAll('.stream-item');
    const listContainer = document.querySelector('.stream-list');

    // Track mouse position during drag for ghost positioning
    const handleDocumentDragOver = (e) => {
      if (this.dragGhost && e.clientX !== 0 && e.clientY !== 0) {
        this.updateDragGhostPosition(e.clientX, e.clientY);
      }
    };

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        this.draggedElement = item;
        item.classList.add('dragging');
        listContainer.classList.add('dragging-active');
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', item.innerHTML);
        
        // Create custom drag ghost
        this.createDragGhost(item, e);
        
        // Calculate offset for ghost positioning
        const rect = item.getBoundingClientRect();
        this.dragOffset = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        
        // Add document-level dragover listener for ghost tracking
        document.addEventListener('dragover', handleDocumentDragOver);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        listContainer.classList.remove('dragging-active');
        
        // Remove drag ghost
        this.removeDragGhost();
        
        // Remove document-level listener
        document.removeEventListener('dragover', handleDocumentDragOver);
        
        // Clean up all drag states
        document.querySelectorAll('.stream-item').forEach(i => {
          i.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom', 'drag-target');
        });
        
        this.draggedElement = null;
        this.dragOverElement = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (this.draggedElement && item !== this.draggedElement) {
          // Determine drop position (top or bottom half)
          const rect = item.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          const isAbove = e.clientY < midpoint;
          
          // Remove all drag-over classes first
          item.classList.remove('drag-over-top', 'drag-over-bottom');
          
          // Add appropriate class based on position
          if (isAbove) {
            item.classList.add('drag-over', 'drag-over-top');
          } else {
            item.classList.add('drag-over', 'drag-over-bottom');
          }
          
          this.dragOverElement = item;
        }
      });

      item.addEventListener('dragenter', () => {
        if (this.draggedElement && item !== this.draggedElement) {
          item.classList.add('drag-target');
        }
      });

      item.addEventListener('dragleave', (e) => {
        // Only remove if we're actually leaving the element
        if (!item.contains(e.relatedTarget)) {
          item.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom', 'drag-target');
        }
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.draggedElement && this.dragOverElement) {
          await this.reorderStreams(
            this.draggedElement.dataset.username,
            this.dragOverElement.dataset.username
          );
        }

        item.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom', 'drag-target');
      });
    });
  }

  createDragGhost(sourceElement, dragEvent) {
    // Clone the element for the ghost
    const ghost = sourceElement.cloneNode(true);
    ghost.classList.add('drag-ghost');
    
    // Get computed styles to match appearance
    const computedStyle = window.getComputedStyle(sourceElement);
    ghost.style.width = `${sourceElement.offsetWidth}px`;
    ghost.style.height = `${sourceElement.offsetHeight}px`;
    ghost.style.background = computedStyle.background;
    ghost.style.border = computedStyle.border;
    ghost.style.borderRadius = computedStyle.borderRadius;
    ghost.style.padding = computedStyle.padding;
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.gap = computedStyle.gap;
    
    // Remove action buttons from ghost
    const actionBtns = ghost.querySelectorAll('.stream-actions');
    actionBtns.forEach(btn => btn.remove());
    
    // Position absolutely
    ghost.style.position = 'fixed';
    ghost.style.margin = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '10000';
    
    document.body.appendChild(ghost);
    this.dragGhost = ghost;
    
    // Set initial position
    this.updateDragGhostPosition(dragEvent.clientX, dragEvent.clientY);
    
    // Hide default drag image
    const dragImage = document.createElement('div');
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-9999px';
    dragImage.style.width = '1px';
    dragImage.style.height = '1px';
    document.body.appendChild(dragImage);
    dragEvent.dataTransfer.setDragImage(dragImage, 0, 0);
    
    // Clean up drag image after a short delay
    setTimeout(() => {
      if (dragImage.parentNode) {
        dragImage.parentNode.removeChild(dragImage);
      }
    }, 0);
  }

  updateDragGhostPosition(x, y) {
    if (this.dragGhost) {
      this.dragGhost.style.left = `${x - this.dragOffset.x}px`;
      this.dragGhost.style.top = `${y - this.dragOffset.y}px`;
    }
  }

  removeDragGhost() {
    if (this.dragGhost) {
      this.dragGhost.remove();
      this.dragGhost = null;
    }
  }

  async reorderStreams(draggedUsername, targetUsername) {
    const draggedIndex = this.streams.findIndex(s => s.username === draggedUsername);
    const targetIndex = this.streams.findIndex(s => s.username === targetUsername);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove dragged item
    const [dragged] = this.streams.splice(draggedIndex, 1);
    
    // Insert at target position
    this.streams.splice(targetIndex, 0, dragged);

    // Update priorities
    this.streams.forEach((stream, index) => {
      stream.priority = index + 1;
    });

    // Save immediately (no debounce for reordering)
    await storage.saveStreams(this.streams);
    await this.forcePollAndSwap();
    
    // Re-render to update UI
    this.render();
  }

  async checkStreamStatuses() {
    if (!this.settings?.clientId || this.streams.length === 0) {
      return;
    }

    // Validate client ID is initialized
    if (!twitchAPI.clientId) {
      try {
        await twitchAPI.initialize(this.settings.clientId);
      } catch (error) {
        console.error('Failed to initialize Twitch API:', error);
        return;
      }
    }

    try {
      const usernames = this.streams.map(s => s.username).filter(u => u); // Filter out empty usernames
      if (usernames.length === 0) {
        return;
      }

      const statuses = await twitchAPI.checkStreamsStatus(usernames);

      // Update stream statuses
      let hasChanges = false;
      this.streams.forEach(stream => {
        const wasLive = stream.isLive || false;
        const isLive = statuses[stream.username] !== null;
        
        if (wasLive !== isLive) {
          stream.isLive = isLive;
          stream.streamData = statuses[stream.username];
          hasChanges = true;
        }
      });

      if (hasChanges) {
        this.render();
      }

      // Update current stream display
      this.updateCurrentStream();
      
      // Update category fallback widget
      this.updateCategoryFallbackWidget();
    } catch (error) {
      console.error('Error checking stream statuses:', error);
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'checkStatus');
      // In production, we use a token broker; avoid telling end users to configure a Client ID.
      // If auth fails, it’s usually broker/CORS or backend token issues.
      if (error.code === 'AUTH_ERROR' || String(error?.message || '').toLowerCase().includes('unauthorized')) {
        this.showMessage('Twitch API auth failed. If you are the developer, verify the token broker is online and allowed by CORS.', 'error');
      } else {
        this.showMessage(errorInfo.message || 'Error checking stream statuses', errorInfo.type || 'error');
      }
    }
  }

  updateCurrentStream() {
    const currentStreamDiv = document.getElementById('currentStream');
    const currentInfo = document.getElementById('currentInfo');

    // Find highest priority live stream
    const liveStream = this.streams.find(s => s.isLive);

    if (liveStream) {
      currentStreamDiv.style.display = 'block';
      const title = liveStream.streamData?.title || 'Live';
      currentInfo.textContent = `${liveStream.username} - ${title}`;
    } else {
      currentStreamDiv.style.display = 'none';
    }
  }

  updateCategoryFallbackWidget() {
    const widget = document.getElementById('categoryFallbackWidget');
    if (!widget) return;

    const categoryName = this.settings?.fallbackCategory || '';
    const isEnabled = !!categoryName;
    const toggle = document.getElementById('fallbackEnabledToggle');
    const input = document.getElementById('fallbackCategoryInput');
    if (toggle) toggle.checked = isEnabled;
    if (input && input !== document.activeElement) {
      input.value = categoryName;
    }
  }

  async saveFallbackCategory(categoryName) {
    const value = String(categoryName || '').trim();
    const newSettings = {
      ...this.settings,
      fallbackCategory: value
    };
    await storage.saveSettings(newSettings);
    this.settings = newSettings;
    this.updateCategoryFallbackWidget();

    // If fallback is enabled, ensure we force a background poll so the user sees it work quickly.
    await this.forcePollAndSwap();
  }

  scheduleCategorySuggestions(query) {
    const q = String(query || '').trim();
    if (this.categorySuggestTimer) clearTimeout(this.categorySuggestTimer);

    // Only query after a couple chars to reduce load
    if (q.length < 3) {
      this.populateCategorySuggestions([]);
      return;
    }

    this.categorySuggestTimer = setTimeout(() => {
      this.fetchCategorySuggestions(q);
    }, 350);
  }

  async fetchCategorySuggestions(query) {
    try {
      // Ensure API initialized
      if (this.settings?.clientId && !twitchAPI.clientId) {
        await twitchAPI.initialize(this.settings.clientId);
      }

      const q = String(query || '').trim().toLowerCase();
      const cached = this.categorySuggestCache.get(q);
      if (cached && (Date.now() - cached.ts) < 5 * 60 * 1000) {
        this.populateCategorySuggestions(cached.items);
        return;
      }

      const results = await twitchAPI.searchCategories(query, 10);
      const items = (results || []).map(r => r.name).filter(Boolean);
      this.categorySuggestCache.set(q, { ts: Date.now(), items });
      this.populateCategorySuggestions(items);
    } catch (e) {
      console.warn('Category suggestions failed:', e);
      this.populateCategorySuggestions([]);
    }
  }

  populateCategorySuggestions(names) {
    const dl = document.getElementById('fallbackCategorySuggestions');
    if (!dl) return;
    dl.innerHTML = '';
    (names || []).slice(0, 10).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });
  }

  startStatusPolling() {
    // Check immediately
    this.checkStreamStatuses();

    // Then poll every 30 seconds (more frequent than background worker for UI updates)
    this.statusCheckInterval = setInterval(() => {
      this.checkStreamStatuses();
    }, 30000);
  }

  showMessage(text, type = 'info') {
    const messageDiv = document.getElementById('statusMessage');
    messageDiv.textContent = text;
    messageDiv.className = `status-message show ${type}`;

    setTimeout(() => {
      messageDiv.classList.remove('show');
    }, 3000);
  }

  cleanup() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
  }
}

// Initialize when popup opens
const popupManager = new PopupManager();
popupManager.init();

// Cleanup on close
window.addEventListener('beforeunload', () => {
  popupManager.cleanup();
});

