import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';

class OptionsManager {
  constructor() {
    this.settings = null;
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.render();
    this.loadAnalytics();
  }

  async loadSettings() {
    this.settings = await storage.getSettings();
  }

  setupEventListeners() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Premium activation
    document.getElementById('activatePremium').addEventListener('click', () => {
      this.activatePremium();
    });

    // Clear analytics
    document.getElementById('clearAnalytics').addEventListener('click', () => {
      this.clearAnalytics();
    });

    // Update donation buttons when links change
    document.getElementById('kofiLink').addEventListener('input', () => {
      this.updateDonationButtons();
    });

    document.getElementById('paypalLink').addEventListener('input', () => {
      this.updateDonationButtons();
    });

    // Premium feature checkboxes
    document.getElementById('notificationsEnabled').addEventListener('change', (e) => {
      if (e.target.checked && !this.settings.premiumStatus) {
        this.showPremiumReminder();
      }
    });

    document.getElementById('theme').addEventListener('change', (e) => {
      if (e.target.value !== 'default' && !this.settings.premiumStatus) {
        this.showPremiumReminder();
      }
    });
  }

  render() {
    // Basic settings
    document.getElementById('clientId').value = this.settings.clientId || '';
    document.getElementById('checkInterval').value = this.settings.checkInterval || 60000;
    document.getElementById('redirectEnabled').checked = this.settings.redirectEnabled !== false;
    document.getElementById('promptBeforeSwitch').checked = this.settings.promptBeforeSwitch || false;
    document.getElementById('fallbackCategory').value = this.settings.fallbackCategory || 'Just Chatting';
    document.getElementById('fallbackEnabled').checked = !!this.settings.fallbackCategory;

    // Premium features
    document.getElementById('premiumStatus').checked = this.settings.premiumStatus || false;
    document.getElementById('notificationsEnabled').checked = this.settings.notificationsEnabled || false;
    document.getElementById('theme').value = this.settings.theme || 'default';

    // Donation links (stored separately or in settings)
    const donationLinks = this.settings.donationLinks || {};
    document.getElementById('kofiLink').value = donationLinks.kofi || '';
    document.getElementById('paypalLink').value = donationLinks.paypal || '';

    this.updateDonationButtons();
    this.updatePremiumFeatures();
    this.applyTheme();
  }

  updateDonationButtons() {
    const kofiLink = document.getElementById('kofiLink').value.trim();
    const paypalLink = document.getElementById('paypalLink').value.trim();
    const buttonsDiv = document.getElementById('donationButtons');
    const kofiBtn = document.getElementById('kofiBtn');
    const paypalBtn = document.getElementById('paypalBtn');

    if (kofiLink || paypalLink) {
      buttonsDiv.style.display = 'flex';
      
      if (kofiLink) {
        kofiBtn.href = kofiLink;
        kofiBtn.style.display = 'inline-block';
      } else {
        kofiBtn.style.display = 'none';
      }

      if (paypalLink) {
        paypalBtn.href = paypalLink;
        paypalBtn.style.display = 'inline-block';
      } else {
        paypalBtn.style.display = 'none';
      }
    } else {
      buttonsDiv.style.display = 'none';
    }
  }

  updatePremiumFeatures() {
    const isPremium = this.settings.premiumStatus || false;
    const analyticsSection = document.getElementById('analyticsSection');
    const premiumReminder = document.getElementById('premiumReminder');

    // Enable/disable premium features
    const premiumFeatures = document.querySelectorAll('.premium-feature');
    premiumFeatures.forEach(feature => {
      if (isPremium) {
        feature.classList.add('enabled');
      } else {
        feature.classList.remove('enabled');
      }
    });

    // Show/hide analytics
    if (isPremium) {
      analyticsSection.style.display = 'block';
      premiumReminder.style.display = 'none';
    } else {
      analyticsSection.style.display = 'none';
    }
  }

  showPremiumReminder() {
    const reminder = document.getElementById('premiumReminder');
    reminder.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
      reminder.style.display = 'none';
    }, 5000);
  }

  async saveSettings() {
    try {
      const newSettings = {
        clientId: document.getElementById('clientId').value.trim(),
        checkInterval: parseInt(document.getElementById('checkInterval').value) || 60000,
        redirectEnabled: document.getElementById('redirectEnabled').checked,
        promptBeforeSwitch: document.getElementById('promptBeforeSwitch').checked,
        fallbackCategory: document.getElementById('fallbackEnabled').checked 
          ? document.getElementById('fallbackCategory').value.trim() 
          : '',
        notificationsEnabled: document.getElementById('notificationsEnabled').checked,
        theme: document.getElementById('theme').value,
        donationLinks: {
          kofi: document.getElementById('kofiLink').value.trim(),
          paypal: document.getElementById('paypalLink').value.trim()
        }
      };

      // Validate client ID if provided
      if (newSettings.clientId) {
        await twitchAPI.initialize(newSettings.clientId);
        // Test the API
        try {
          await twitchAPI.getCategoryId('Just Chatting');
        } catch (error) {
          this.showSaveStatus('Invalid Twitch Client ID. Please check your settings.', 'error');
          return;
        }
      }

      await storage.saveSettings(newSettings);
      this.settings = { ...this.settings, ...newSettings };

      this.showSaveStatus('Settings saved successfully!', 'success');
      this.applyTheme();

      // Reload analytics if premium
      if (this.settings.premiumStatus) {
        this.loadAnalytics();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showSaveStatus('Error saving settings: ' + error.message, 'error');
    }
  }

  async activatePremium() {
    const code = document.getElementById('premiumCode').value.trim();
    
    if (!code) {
      this.showSaveStatus('Please enter an activation code', 'error');
      return;
    }

    // Simple activation (in production, this would verify with a server)
    // For now, accept any non-empty code as activation
    // In real implementation, you'd verify this with your donation platform
    
    // For demo purposes, accept codes like "PREMIUM2024" or similar
    if (code.length > 5) {
      this.settings.premiumStatus = true;
      await storage.saveSettings(this.settings);
      document.getElementById('premiumStatus').checked = true;
      document.getElementById('premiumCode').value = '';
      this.updatePremiumFeatures();
      this.loadAnalytics();
      this.showSaveStatus('Premium activated! Thank you for your support! 🎉', 'success');
    } else {
      this.showSaveStatus('Invalid activation code', 'error');
    }
  }

  async loadAnalytics() {
    if (!this.settings.premiumStatus) {
      return;
    }

    try {
      const analytics = await storage.getAnalytics();
      
      // Update stats
      document.getElementById('totalSwitches').textContent = analytics.switchCount || 0;
      
      if (analytics.lastSwitch) {
        const date = new Date(analytics.lastSwitch.timestamp);
        document.getElementById('lastSwitch').textContent = 
          `${analytics.lastSwitch.username} - ${date.toLocaleString()}`;
      } else {
        document.getElementById('lastSwitch').textContent = 'Never';
      }

      // Update viewing time
      const viewingTimeList = document.getElementById('viewingTimeList');
      viewingTimeList.innerHTML = '';

      const viewingTime = analytics.viewingTime || {};
      const entries = Object.entries(viewingTime)
        .sort((a, b) => b[1] - a[1]) // Sort by time descending
        .slice(0, 10); // Top 10

      if (entries.length === 0) {
        viewingTimeList.innerHTML = '<p style="color: #adadb8; padding: 12px;">No viewing data yet.</p>';
      } else {
        entries.forEach(([username, seconds]) => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const duration = hours > 0 
            ? `${hours}h ${minutes}m`
            : `${minutes}m`;

          const item = document.createElement('div');
          item.className = 'viewing-time-item';
          item.innerHTML = `
            <span class="viewing-time-username">${username}</span>
            <span class="viewing-time-duration">${duration}</span>
          `;
          viewingTimeList.appendChild(item);
        });
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  }

  async clearAnalytics() {
    if (!confirm('Are you sure you want to clear all analytics data?')) {
      return;
    }

    try {
      await storage.saveAnalytics({
        viewingTime: {},
        switchCount: 0,
        lastSwitch: null
      });
      this.loadAnalytics();
      this.showSaveStatus('Analytics cleared', 'success');
    } catch (error) {
      console.error('Error clearing analytics:', error);
      this.showSaveStatus('Error clearing analytics', 'error');
    }
  }

  applyTheme() {
    const theme = this.settings.theme || 'default';
    document.body.className = `theme-${theme}`;
    
    // Load theme CSS if premium
    if (this.settings.premiumStatus && theme !== 'default') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `themes/${theme}.css`;
      document.head.appendChild(link);
    }
  }

  showSaveStatus(message, type) {
    const statusDiv = document.getElementById('saveStatus');
    statusDiv.textContent = message;
    statusDiv.className = `save-status ${type}`;

    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'save-status';
    }, 3000);
  }
}

// Initialize options page
const optionsManager = new OptionsManager();
optionsManager.init();

