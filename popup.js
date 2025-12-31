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
    this.dragGhost = null;
    this.dragOffset = { x: 0, y: 0 };
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

      item.addEventListener('dragenter', (e) => {
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

