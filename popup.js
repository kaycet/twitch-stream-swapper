import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';
import ErrorMessageManager from './utils/error-messages.js';

class PopupManager {
  constructor() {
    this.streams = [];
    this.settings = null;
    this.draggedElement = null;
    this.dragOverElement = null;
    this.debounceTimeout = null;
    this.statusCheckInterval = null;
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.render();
    this.startStatusPolling();
  }

  async loadData() {
    try {
      this.showLoading('loadData');
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
      this.hideLoading();
    } catch (error) {
      console.error('Error loading data:', error);
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'loadData');
      this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
      this.hideLoading();
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
    if (!username || username.trim().length === 0) {
      const input = document.getElementById('streamInput');
      input.style.borderColor = '#3d3d47';
      return;
    }
    
    // Basic validation - alphanumeric, underscores
    const trimmed = username.trim();
    const valid = /^[a-zA-Z0-9_]{4,25}$/.test(trimmed);
    const input = document.getElementById('streamInput');
    
    if (!valid) {
      input.style.borderColor = '#e91916';
      // Show helpful validation message using ErrorMessageManager
      let errorMessage = 'Invalid username format';
      if (trimmed.length < 4) {
        errorMessage = 'Username must be at least 4 characters';
      } else if (trimmed.length > 25) {
        errorMessage = 'Username must be 25 characters or less';
      } else if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        errorMessage = 'Username can only contain letters, numbers, and underscores';
      }
      const errorInfo = ErrorMessageManager.getErrorMessage(errorMessage, 'addStream');
      this.showMessage(errorInfo.message, errorInfo.type);
    } else {
      input.style.borderColor = '#3d3d47';
    }
  }

  async addStream() {
    const input = document.getElementById('streamInput');
    const username = input.value.trim().toLowerCase();
    const addBtn = document.getElementById('addStreamBtn');

    if (!username) {
      const errorInfo = ErrorMessageManager.getErrorMessage('Please enter a username', 'addStream');
      this.showMessage(errorInfo.message, errorInfo.type);
      return;
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_]{4,25}$/.test(username)) {
      const errorInfo = ErrorMessageManager.getErrorMessage('Invalid username format', 'addStream');
      this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
      input.style.borderColor = '#e91916';
      return;
    }

    // Check if already exists
    if (this.streams.some(s => s.username.toLowerCase() === username)) {
      const errorInfo = ErrorMessageManager.getErrorMessage('Stream already in list', 'addStream');
      this.showMessage(errorInfo.message, errorInfo.type);
      input.value = '';
      input.style.borderColor = '#3d3d47';
      return;
    }

    // Check free tier limit
    const isPremium = this.settings?.premiumStatus || false;
    if (!isPremium && this.streams.length >= 10) {
      const errorInfo = ErrorMessageManager.getErrorMessage('Free tier limit reached', 'addStream');
      this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
      setTimeout(() => {
        chrome.runtime.openOptionsPage();
      }, 2000);
      return;
    }

    try {
      // Show loading state
      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';
      this.showLoading('addStream');

      // Add stream
      const newStream = {
        username: username,
        priority: this.streams.length + 1,
        addedAt: Date.now()
      };

      this.streams.push(newStream);
      await storage.saveStreams(this.streams);
      
      input.value = '';
      input.style.borderColor = '#3d3d47';
      this.render();
      
      const successInfo = ErrorMessageManager.getSuccessMessage('addStream', { username });
      this.showMessage(successInfo.message, successInfo.type);
      
      // Check status immediately
      this.checkStreamStatuses();
    } catch (error) {
      console.error('Error adding stream:', error);
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'addStream');
      this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = 'Add';
      this.hideLoading();
    }
  }

  async removeStream(username) {
    try {
      this.streams = this.streams.filter(s => s.username !== username);
      
      // Reorder priorities
      this.streams.forEach((stream, index) => {
        stream.priority = index + 1;
      });

      await storage.saveStreams(this.streams);
      this.render();
      const successInfo = ErrorMessageManager.getSuccessMessage('removeStream');
      this.showMessage(successInfo.message, successInfo.type);
    } catch (error) {
      console.error('Error removing stream:', error);
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'removeStream');
      this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
    }
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
  }

  createStreamItem(stream, index) {
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

    try {
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
        try {
          await storage.saveStreams(this.streams);
          this.render();
          // Don't show success message for reordering - it's too frequent
        } catch (error) {
          console.error('Error saving reordered streams:', error);
          const errorInfo = ErrorMessageManager.getErrorMessage(error, 'reorderStreams');
          this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
        }
      }, 300);
    } catch (error) {
      console.error('Error reordering streams:', error);
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'reorderStreams');
      this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
    }
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
        const errorInfo = ErrorMessageManager.getErrorMessage(error, 'checkStatus');
        this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
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
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'checkStatus');
      this.showMessage(ErrorMessageManager.formatMessage(errorInfo), errorInfo.type);
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

    // Show longer for error messages with actions
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
      messageDiv.classList.remove('show');
    }, duration);
  }

  showLoading(context) {
    const messageDiv = document.getElementById('statusMessage');
    const loadingText = ErrorMessageManager.getLoadingMessage(context);
    messageDiv.textContent = loadingText;
    messageDiv.className = 'status-message show loading';
  }

  hideLoading() {
    const messageDiv = document.getElementById('statusMessage');
    if (messageDiv.classList.contains('loading')) {
      messageDiv.classList.remove('show', 'loading');
    }
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

