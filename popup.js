import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';

class PopupManager {
  constructor() {
    this.streams = [];
    this.settings = null;
    this.draggedElement = null;
    this.dragOverElement = null;
    this.debounceTimeout = null;
    this.statusCheckInterval = null;
    this.selectedStreamUsername = null;
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

      // Apply theme
      this.applyTheme();
    } catch (error) {
      console.error('Error loading data:', error);
      this.showMessage('Error loading data', 'error');
    }
  }

  applyTheme() {
    const theme = this.settings?.theme || 'default';
    if (this.settings?.premiumStatus && theme !== 'default') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `themes/${theme}.css`;
      document.head.appendChild(link);
    }
  }

  setupEventListeners() {
    // Add stream button
    document.getElementById('addStreamBtn').addEventListener('click', () => {
      this.addStream();
    });

    const streamInput = document.getElementById('streamInput');
    
    // Enter key in input (only when input is focused)
    streamInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.addStream();
      }
    });

    // Ctrl+Enter or Cmd+Enter for adding stream (works globally)
    document.addEventListener('keydown', (e) => {
      // Ctrl+Enter or Cmd+Enter - Add stream
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        // Focus input if not already focused
        if (document.activeElement !== streamInput) {
          streamInput.focus();
        }
        this.addStream();
        return;
      }

      // Ctrl+, or Cmd+, - Open settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
        return;
      }

      // F5 - Refresh stream status
      if (e.key === 'F5') {
        e.preventDefault();
        this.checkStreamStatuses();
        this.showMessage('Refreshing stream status...', 'info');
        return;
      }

      // Delete key - Remove selected stream
      if (e.key === 'Delete' && this.selectedStreamUsername) {
        e.preventDefault();
        // Only delete if input is not focused (to avoid accidental deletions while typing)
        if (document.activeElement !== streamInput && !streamInput.matches(':focus')) {
          this.removeStream(this.selectedStreamUsername);
          this.selectedStreamUsername = null;
          this.updateSelection();
        }
        return;
      }

      // Arrow keys for navigation (optional enhancement)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Only handle if input is not focused
        if (document.activeElement !== streamInput && !streamInput.matches(':focus')) {
          e.preventDefault();
          this.navigateStreams(e.key === 'ArrowDown' ? 1 : -1);
        }
      }
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Help button
    document.getElementById('helpBtn').addEventListener('click', () => {
      this.toggleHelpTooltip();
    });

    // Close help tooltip when clicking outside
    document.getElementById('helpTooltip').addEventListener('click', (e) => {
      if (e.target.id === 'helpTooltip') {
        this.toggleHelpTooltip();
      }
    });

    // Close help tooltip on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const helpTooltip = document.getElementById('helpTooltip');
        if (helpTooltip.style.display !== 'none') {
          this.toggleHelpTooltip();
        }
      }
    });

    // Debounced input validation
    let debounceTimeout;
    streamInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        this.validateUsername(e.target.value);
      }, 300);
    });

    // Clear selection when clicking on input
    streamInput.addEventListener('focus', () => {
      this.selectedStreamUsername = null;
      this.updateSelection();
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
      this.showMessage('Free tier limited to 10 streams. Upgrade for unlimited!', 'info');
      // Still allow adding but show reminder
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
    
    input.value = '';
    this.render();
    this.showMessage(`Added ${username}`, 'success');
    
    // Check status immediately
    this.checkStreamStatuses();
  }

  async removeStream(username) {
    this.streams = this.streams.filter(s => s.username !== username);
    
    // Clear selection if removed stream was selected
    if (this.selectedStreamUsername === username) {
      this.selectedStreamUsername = null;
    }
    
    // Reorder priorities
    this.streams.forEach((stream, index) => {
      stream.priority = index + 1;
    });

    await storage.saveStreams(this.streams);
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

    // Clear list
    listContainer.innerHTML = '';

    if (this.streams.length === 0) {
      emptyState.style.display = 'block';
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
    
    // Update selection display
    this.updateSelection();
  }

  createStreamItem(stream, index) {
    const item = document.createElement('div');
    item.className = 'stream-item';
    item.draggable = true;
    item.dataset.username = stream.username;
    item.dataset.priority = stream.priority;

    // Add selected class if this is the selected stream
    if (this.selectedStreamUsername === stream.username) {
      item.classList.add('selected');
    }

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

    // Click to select
    item.addEventListener('click', (e) => {
      // Don't select if clicking on remove button
      if (e.target.closest('[data-action="remove"]')) {
        return;
      }
      this.selectedStreamUsername = stream.username;
      this.updateSelection();
    });

    // Remove button
    item.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeStream(stream.username);
    });

    return item;
  }

  updateSelection() {
    const items = document.querySelectorAll('.stream-item');
    items.forEach(item => {
      if (item.dataset.username === this.selectedStreamUsername) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  navigateStreams(direction) {
    if (this.streams.length === 0) return;

    let currentIndex = -1;
    if (this.selectedStreamUsername) {
      currentIndex = this.streams.findIndex(s => s.username === this.selectedStreamUsername);
    }

    let newIndex;
    if (currentIndex === -1) {
      // No selection, start at first or last
      newIndex = direction > 0 ? 0 : this.streams.length - 1;
    } else {
      newIndex = currentIndex + direction;
      if (newIndex < 0) newIndex = this.streams.length - 1;
      if (newIndex >= this.streams.length) newIndex = 0;
    }

    this.selectedStreamUsername = this.streams[newIndex].username;
    this.updateSelection();

    // Scroll into view
    const selectedItem = document.querySelector(`[data-username="${this.selectedStreamUsername}"]`);
    if (selectedItem) {
      selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  toggleHelpTooltip() {
    const helpTooltip = document.getElementById('helpTooltip');
    const isVisible = helpTooltip.style.display === 'flex';
    helpTooltip.style.display = isVisible ? 'none' : 'flex';
  }

  setupDragAndDrop() {
    const items = document.querySelectorAll('.stream-item');

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        this.draggedElement = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', item.innerHTML);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.querySelectorAll('.stream-item').forEach(i => {
          i.classList.remove('drag-over');
        });
        this.draggedElement = null;
        this.dragOverElement = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (this.draggedElement && item !== this.draggedElement) {
          item.classList.add('drag-over');
          this.dragOverElement = item;
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        
        if (this.draggedElement && this.dragOverElement) {
          await this.reorderStreams(
            this.draggedElement.dataset.username,
            this.dragOverElement.dataset.username
          );
        }

        item.classList.remove('drag-over');
      });
    });
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

    // Debounced save
    clearTimeout(this.debounceTimeout);
    this.debounceTimeout = setTimeout(async () => {
      await storage.saveStreams(this.streams);
      this.render();
    }, 300);
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
    } catch (error) {
      console.error('Error checking stream statuses:', error);
      if (error.message.includes('Client ID')) {
        this.showMessage('Please configure Twitch Client ID in settings', 'error');
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

