import storage from './utils/storage.js';
import twitchAPI from './utils/twitch-api.js';
import ErrorMessageManager from './utils/error-messages.js';
import { KO_FI_URL, TWITCH_CLIENT_ID } from './utils/config.js';

class OptionsManager {
  constructor() {
    this.settings = null;
    this.autoSaveTimer = null;
    this.AUTO_SAVE_DELAY_MS = 600;
    this.advancedDirty = false;
    this.customThemeDirty = false;
    this._analyticsRefreshTimer = null;
    this._saveStatusTimer = null;
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.render();
    this.loadAnalytics();
    this.setupStorageListeners();
    this.setAdvancedDirty(false);
    this.setCustomThemeDirty(false);
  }

  async loadSettings() {
    this.settings = await storage.getSettings();
  }


  setupEventListeners() {
    // Honor system supporter toggle (no verification)
    document.getElementById('premiumStatus').addEventListener('change', (e) => {
      const checked = !!e.target.checked;
      if (checked) {
        const ok = confirm('Enable Supporter Features?\n\nThis is an honor system toggle. If you supported development, thanks ❤️');
        if (!ok) {
          e.target.checked = false;
          return;
        }
      }
      this.settings.premiumStatus = checked;
      storage.saveSettings(this.settings).then(() => {
        this.updatePremiumFeatures();
        if (this.settings.premiumStatus) this.loadAnalytics();
        this.showSaveStatus('Saved', 'success');
        this.setAdvancedDirty(false);
        this.setCustomThemeDirty(false);
      });
    });

    // Clear analytics
    document.getElementById('clearAnalytics').addEventListener('click', () => {
      this.clearAnalytics();
    });

    // Ko-fi support button
    const kofiBtn = document.getElementById('kofiBtn');
    if (kofiBtn) {
      kofiBtn.href = KO_FI_URL;
    }

    // Notifications + quiet hours (available to everyone)
    document.getElementById('notificationsEnabled').addEventListener('change', () => {
      this.scheduleAutoSaveGeneral();
    });
    ['quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        this.scheduleAutoSaveGeneral();
      });
    });

    document.getElementById('theme').addEventListener('change', (e) => {
      if (e.target.value !== 'default' && !this.settings.premiumStatus) {
        this.showPremiumReminder();
      }
      // Show/hide custom theme editor and live-apply. Preview from the form,
      // not this.settings: the saved theme only updates after autosave (or
      // Apply, for custom), so applyTheme() alone previewed nothing.
      this.updateCustomThemeVisibility();
      this.applyTheme(this.readThemePreview());

      // Only autosave theme selection when not custom. Custom requires Apply.
      if (e.target.value === 'custom') {
        this.setCustomThemeDirty(true);
        this.showSaveStatus('Pick your colors, then click “Apply Custom Theme”.', 'warning');
      } else {
        this.setCustomThemeDirty(false);
        this.scheduleAutoSaveGeneral();
      }
    });

    // Advanced: client id override toggle
    const overrideToggle = document.getElementById('overrideClientIdEnabled');
    const clientIdInput = document.getElementById('clientId');
    if (overrideToggle && clientIdInput) {
      overrideToggle.addEventListener('change', () => {
        const enabled = !!overrideToggle.checked;
        clientIdInput.disabled = !enabled;
        if (!enabled) {
          clientIdInput.value = '';
        }
        this.setAdvancedDirty(true);
      });

      // Advanced settings require Apply + confirmation.
      clientIdInput.addEventListener('change', () => {
        this.setAdvancedDirty(true);
      });
    }

    // Advanced apply button
    const advancedApplyBtn = document.getElementById('advancedApplyBtn');
    if (advancedApplyBtn) {
      advancedApplyBtn.addEventListener('click', async () => {
        await this.applyAdvancedSettings();
      });
    }

    // Auto-save: basic + category controls
    const wire = (id, evt = 'change') => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(evt, () => this.scheduleAutoSaveGeneral());
    };

    wire('checkInterval', 'change');
    wire('redirectEnabled', 'change');
    wire('promptBeforeSwitch', 'change');
    wire('fallbackEnabled', 'change');
    // 'change' (commit on blur/Enter), not 'input': saving on every keystroke
    // persisted half-typed category names, and each save restarts background
    // polling — which can redirect the managed tab to a random stream from
    // whatever category the partial text happened to match.
    wire('fallbackCategory', 'change');

    // Custom theme inputs (live preview; requires Apply to persist)
    this.setupCustomThemeListeners();

    const customThemeApplyBtn = document.getElementById('customThemeApplyBtn');
    if (customThemeApplyBtn) {
      customThemeApplyBtn.addEventListener('click', async () => {
        await this.applyCustomThemeSettings();
      });
    }
  }

  setupStorageListeners() {
    // Keep analytics UI live-updated while the Options page is open.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (!this.settings?.premiumStatus) return;
      if (!changes.analytics) return;

      // Debounce to avoid rapid re-renders (e.g., multiple writes in quick succession).
      if (this._analyticsRefreshTimer) clearTimeout(this._analyticsRefreshTimer);
      this._analyticsRefreshTimer = setTimeout(() => {
        this.loadAnalytics();
      }, 200);
    });
  }

  setupCustomThemeListeners() {
    const pairs = [
      { colorId: 'customAccent', hexId: 'customAccentHex' },
      { colorId: 'customBg', hexId: 'customBgHex' },
      { colorId: 'customPanel', hexId: 'customPanelHex' },
      { colorId: 'customText', hexId: 'customTextHex' },
      { colorId: 'customBorder', hexId: 'customBorderHex' },
      { colorId: 'customMuted', hexId: 'customMutedHex' }
    ];

    const normalizeHex = (v) => {
      const s = String(v || '').trim();
      if (!s) return null;
      const withHash = s.startsWith('#') ? s : `#${s}`;
      if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
      return withHash.toUpperCase();
    };

    for (const { colorId, hexId } of pairs) {
      const colorEl = document.getElementById(colorId);
      const hexEl = document.getElementById(hexId);
      if (!colorEl || !hexEl) continue;

      // Color picker drives hex input. Preview from the form (see the theme
      // change listener): applyTheme() with no argument re-applies the saved
      // colors, so the edited ones were never visible before Apply.
      colorEl.addEventListener('input', () => {
        const hex = normalizeHex(colorEl.value);
        if (hex) hexEl.value = hex;
        this.applyTheme(this.readThemePreview());
        this.setCustomThemeDirty(true);
      });

      // Hex input drives color picker (only when valid)
      hexEl.addEventListener('input', () => {
        const hex = normalizeHex(hexEl.value);
        if (hex) {
          colorEl.value = hex;
          hexEl.classList.remove('input-error');
        } else if (hexEl.value.trim().length > 0) {
          hexEl.classList.add('input-error');
        } else {
          hexEl.classList.remove('input-error');
        }
        this.applyTheme(this.readThemePreview());
        this.setCustomThemeDirty(true);
      });
    }
  }

  setAdvancedDirty(isDirty) {
    this.advancedDirty = !!isDirty;
    const btn = document.getElementById('advancedApplyBtn');
    if (btn) btn.disabled = !this.advancedDirty;
  }

  setCustomThemeDirty(isDirty) {
    this.customThemeDirty = !!isDirty;
    const btn = document.getElementById('customThemeApplyBtn');
    if (btn) btn.disabled = !this.customThemeDirty;
  }

  scheduleAutoSaveGeneral() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    // Null the handle once the save has fired so flushPendingAutoSave() can
    // tell "save pending" apart from "already saved".
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.saveGeneralSettings();
    }, this.AUTO_SAVE_DELAY_MS);
  }

  /**
   * Flush a pending debounced autosave immediately. Wired to pagehide: the
   * 600ms timer dies with the document, so toggling a setting and closing
   * the tab within the debounce window silently dropped the change — e.g.
   * Auto-Switch stayed enabled while the user believed they turned it off.
   */
  flushPendingAutoSave() {
    if (!this.autoSaveTimer) return;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = null;
    // storage.saveSettings() writes immediately (no debounce); the write is
    // handed to the extension process, so it survives the page going away.
    this.saveGeneralSettings();
  }

  render() {
    // Basic settings
    // Only show user's custom Client ID if they've set one (not the default)
    // Check if current Client ID is the default placeholder
    const isDefaultClientId = !this.settings.clientId || 
                              this.settings.clientId === TWITCH_CLIENT_ID ||
                              this.settings.clientId === "";
    const userClientId = isDefaultClientId ? '' : this.settings.clientId;
    // Advanced client id override UI
    const overrideToggle = document.getElementById('overrideClientIdEnabled');
    const clientIdInput = document.getElementById('clientId');
    if (overrideToggle && clientIdInput) {
      overrideToggle.checked = !!userClientId;
      clientIdInput.disabled = !overrideToggle.checked;
      clientIdInput.value = userClientId;
    }
    // Check interval dropdown (safe presets)
    const allowedIntervals = new Set([60000, 120000, 300000, 600000]);
    const interval = allowedIntervals.has(this.settings.checkInterval) ? this.settings.checkInterval : 60000;
    document.getElementById('checkInterval').value = String(interval);
    document.getElementById('redirectEnabled').checked = !!this.settings.redirectEnabled;
    document.getElementById('promptBeforeSwitch').checked = this.settings.promptBeforeSwitch || false;
    document.getElementById('fallbackCategory').value = this.settings.fallbackCategory || 'Just Chatting';
    document.getElementById('fallbackEnabled').checked = !!this.settings.fallbackCategory;

    // Premium features
    document.getElementById('premiumStatus').checked = this.settings.premiumStatus || false;
    document.getElementById('notificationsEnabled').checked = this.settings.notificationsEnabled || false;
    document.getElementById('quietHoursEnabled').checked = this.settings.quietHours?.enabled || false;
    document.getElementById('quietHoursStart').value = this.settings.quietHours?.start || '22:00';
    document.getElementById('quietHoursEnd').value = this.settings.quietHours?.end || '08:00';
    document.getElementById('theme').value = this.settings.theme || 'default';

    // Custom theme values
    this.renderCustomTheme();
    this.updateCustomThemeVisibility();

    // Ko-fi support link
    const kofiBtn = document.getElementById('kofiBtn');
    if (kofiBtn) {
      kofiBtn.href = KO_FI_URL;
    }
    this.updatePremiumFeatures();
    this.applyTheme();
  }

  renderCustomTheme() {
    const t = this.settings?.customTheme || {};
    const defaults = {
      accent: '#9147FF',
      bg: '#0E0E10',
      panel: '#18181B',
      text: '#EFEFF1',
      border: '#2D2D35',
      muted: '#ADADB8'
    };

    const set = (colorId, hexId, value) => {
      const colorEl = document.getElementById(colorId);
      const hexEl = document.getElementById(hexId);
      if (!colorEl || !hexEl) return;
      const v = (value || defaults[colorId.replace('custom', '').toLowerCase()] || '#FFFFFF').toUpperCase();
      colorEl.value = v;
      hexEl.value = v;
      hexEl.classList.remove('input-error');
    };

    set('customAccent', 'customAccentHex', t.accent || defaults.accent);
    set('customBg', 'customBgHex', t.bg || defaults.bg);
    set('customPanel', 'customPanelHex', t.panel || defaults.panel);
    set('customText', 'customTextHex', t.text || defaults.text);
    set('customBorder', 'customBorderHex', t.border || defaults.border);
    set('customMuted', 'customMutedHex', t.muted || defaults.muted);
  }

  updateCustomThemeVisibility() {
    const theme = document.getElementById('theme')?.value || 'default';
    const section = document.getElementById('customThemeSection');
    if (!section) return;

    const show = theme === 'custom';
    section.style.display = show ? 'block' : 'none';

    // Disable editors if supporter features aren't enabled
    const enabled = !!this.settings?.premiumStatus;
    const inputs = section.querySelectorAll('input');
    inputs.forEach((el) => {
      el.disabled = !enabled;
    });

    const btn = document.getElementById('customThemeApplyBtn');
    if (btn) btn.disabled = !enabled || !this.customThemeDirty;
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

  async saveGeneralSettings() {
    try {
      this.showSaveStatus('Saving…', 'loading');

      const allowedIntervals = new Set([60000, 120000, 300000, 600000]);
      const checkInterval = parseInt(document.getElementById('checkInterval').value, 10) || 60000;

      const newSettings = {
        checkInterval: allowedIntervals.has(checkInterval) ? checkInterval : 60000,
        redirectEnabled: document.getElementById('redirectEnabled').checked,
        promptBeforeSwitch: document.getElementById('promptBeforeSwitch').checked,
        fallbackCategory: document.getElementById('fallbackEnabled').checked 
          ? document.getElementById('fallbackCategory').value.trim() 
          : '',
        notificationsEnabled: document.getElementById('notificationsEnabled').checked,
        quietHours: {
          enabled: document.getElementById('quietHoursEnabled').checked,
          start: document.getElementById('quietHoursStart').value || '22:00',
          end: document.getElementById('quietHoursEnd').value || '08:00',
        },
        theme: document.getElementById('theme').value,
      };

      // Custom theme colors are validated and persisted separately via
      // applyCustomThemeSettings(); general autosave must not touch them.

      // Sanitize category
      if (newSettings.fallbackCategory) {
        // eslint-disable-next-line no-control-regex
        newSettings.fallbackCategory = newSettings.fallbackCategory.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 50);
      }

      await storage.saveSettings(newSettings);
      this.settings = { ...this.settings, ...newSettings };

      this.showSaveStatus('Saved', 'success');
      this.applyTheme();

      // Reload analytics if premium
      if (this.settings.premiumStatus) {
        this.loadAnalytics();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'saveSettings');
      this.showSaveStatus(ErrorMessageManager.formatMessage(errorInfo), 'error');
    }
  }

  async applyAdvancedSettings() {
    if (!this.advancedDirty) return;
    const overrideEnabled = !!document.getElementById('overrideClientIdEnabled')?.checked;
    const clientIdInputValue = document.getElementById('clientId')?.value?.trim() || '';

    const ok = confirm(
      'Apply Advanced settings?\n\nThese can break API access if misconfigured.'
    );
    if (!ok) return;

    // Client ID override (advanced) — empty means "use built-in"
    let clientIdToSave = '';
    if (overrideEnabled) {
      if (!/^[a-z0-9]{10,64}$/i.test(clientIdInputValue)) {
        const errorInfo = ErrorMessageManager.getErrorMessage('Client ID appears to be invalid', 'saveSettings');
        this.showSaveStatus(ErrorMessageManager.formatMessage(errorInfo), 'error');
        return;
      }
      clientIdToSave = clientIdInputValue;
    }

    try {
      this.showSaveStatus('Applying advanced settings…', 'loading');

      // Sanity check the override (developer-only)
      if (clientIdToSave) {
        await twitchAPI.initialize(clientIdToSave);
        await twitchAPI.getCategoryId('Just Chatting');
      }

      const newSettings = { clientId: clientIdToSave };
      await storage.saveSettings(newSettings);
      this.settings = { ...this.settings, ...newSettings };

      this.setAdvancedDirty(false);
      this.showSaveStatus('Advanced settings applied', 'success');
    } catch (error) {
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'saveSettings');
      this.showSaveStatus(ErrorMessageManager.formatMessage(errorInfo), 'error');
    }
  }

  async applyCustomThemeSettings() {
    if (!this.customThemeDirty) return;
    if (!this.settings?.premiumStatus) {
      this.showPremiumReminder();
      return;
    }

    const ok = confirm('Apply Custom Theme?\n\nThis will save these colors and apply them everywhere.');
    if (!ok) return;

    const newTheme = {
      accent: document.getElementById('customAccentHex')?.value?.trim() || '',
      bg: document.getElementById('customBgHex')?.value?.trim() || '',
      panel: document.getElementById('customPanelHex')?.value?.trim() || '',
      text: document.getElementById('customTextHex')?.value?.trim() || '',
      border: document.getElementById('customBorderHex')?.value?.trim() || '',
      muted: document.getElementById('customMutedHex')?.value?.trim() || ''
    };

    const mustHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim());
    for (const [k, v] of Object.entries(newTheme)) {
      if (!mustHex(v)) {
        const errorInfo = ErrorMessageManager.getErrorMessage(`Invalid color for ${k} (use #RRGGBB)`, 'saveSettings');
        this.showSaveStatus(ErrorMessageManager.formatMessage(errorInfo), 'error');
        return;
      }
      newTheme[k] = String(v).trim().toUpperCase();
    }

    try {
      this.showSaveStatus('Applying custom theme…', 'loading');
      const newSettings = { theme: 'custom', customTheme: newTheme };
      await storage.saveSettings(newSettings);
      this.settings = { ...this.settings, ...newSettings };
      this.applyTheme();
      this.setCustomThemeDirty(false);
      this.showSaveStatus('Custom theme applied', 'success');
    } catch (error) {
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'saveSettings');
      this.showSaveStatus(ErrorMessageManager.formatMessage(errorInfo), 'error');
    }
  }

  // No activation codes in honor-system mode

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
          // textContent, not innerHTML: usernames come from storage and must
          // never be interpreted as markup (popup.js already escapes them).
          const nameEl = document.createElement('span');
          nameEl.className = 'viewing-time-username';
          nameEl.textContent = username;
          const durationEl = document.createElement('span');
          durationEl.className = 'viewing-time-duration';
          durationEl.textContent = duration;
          item.append(nameEl, durationEl);
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

    const clearBtn = document.getElementById('clearAnalytics');
    try {
      clearBtn.disabled = true;
      this.showSaveStatus(ErrorMessageManager.getLoadingMessage('clearAnalytics'), 'loading');

      await storage.saveAnalytics({
        viewingTime: {},
        switchCount: 0,
        lastSwitch: null
      });
      this.loadAnalytics();
      const successInfo = ErrorMessageManager.getSuccessMessage('clearAnalytics');
      this.showSaveStatus(successInfo.message, 'success');
    } catch (error) {
      console.error('Error clearing analytics:', error);
      const errorInfo = ErrorMessageManager.getErrorMessage(error, 'clearAnalytics');
      this.showSaveStatus(ErrorMessageManager.formatMessage(errorInfo), 'error');
    } finally {
      clearBtn.disabled = false;
    }
  }

  /**
   * Read the theme select + custom color inputs as a preview object for
   * applyTheme(). Only well-formed #RRGGBB values are included, so a
   * half-typed hex falls back to the saved color instead of producing an
   * invalid CSS custom property.
   */
  readThemePreview() {
    const saved = this.settings?.customTheme || {};
    const hex = (id, fallback) => {
      const v = String(document.getElementById(id)?.value || '').trim();
      return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
    };
    return {
      theme: document.getElementById('theme')?.value || this.settings?.theme || 'default',
      customTheme: {
        accent: hex('customAccentHex', saved.accent),
        bg: hex('customBgHex', saved.bg),
        panel: hex('customPanelHex', saved.panel),
        text: hex('customTextHex', saved.text),
        border: hex('customBorderHex', saved.border),
        muted: hex('customMutedHex', saved.muted),
      },
    };
  }

  /**
   * @param {{theme?: string, customTheme?: Object}} [preview] - form state to
   *   paint instead of the saved settings (live preview); persisted values
   *   are used when omitted. The supporter gates apply either way.
   */
  applyTheme(preview) {
    const theme = preview?.theme || this.settings.theme || 'default';
    document.body.className = `theme-${theme}`;

    // Remove any previously injected theme link(s)
    document.querySelectorAll('link[data-tsr-theme="1"]').forEach((el) => el.remove());

    // Apply custom theme variables (supporter-only)
    if (theme === 'custom') {
      if (this.settings.premiumStatus) {
        const t = preview?.customTheme || this.settings.customTheme || {};
        this.applyCustomThemeVars(t);
      }
      return;
    }

    // Clear custom vars back to defaults
    this.clearCustomThemeVars();

    // Load theme CSS if supporter features enabled
    if (this.settings.premiumStatus && theme !== 'default') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `themes/${theme}.css`;
      link.dataset.tsrTheme = '1';
      document.head.appendChild(link);
    }
  }

  applyCustomThemeVars(themeObj) {
    const root = document.documentElement;
    const t = themeObj || {};
    const set = (name, value) => {
      if (value) root.style.setProperty(name, value);
    };
    set('--accent', t.accent);
    set('--accent-hover', t.accentHover || t.accent);
    set('--surface-0', t.bg);
    set('--surface-1', t.panel);
    set('--surface-2', t.panel2 || t.panel);
    set('--border', t.border);
    set('--text', t.text);
    set('--text-muted', t.muted || '#adadb8');
  }

  clearCustomThemeVars() {
    const root = document.documentElement;
    [
      '--accent',
      '--accent-hover',
      '--surface-0',
      '--surface-1',
      '--surface-2',
      '--border',
      '--text',
      '--text-muted'
    ].forEach((k) => root.style.removeProperty(k));
  }

  showSaveStatus(message, type) {
    const statusDiv = document.getElementById('saveStatus');
    statusDiv.textContent = message;
    statusDiv.className = `save-status ${type}`;

    // A clear timer from an earlier message must not wipe this one — a
    // "Saved" 3s timer used to blank a "Applying…" status mid-operation.
    if (this._saveStatusTimer) {
      clearTimeout(this._saveStatusTimer);
      this._saveStatusTimer = null;
    }

    // Show longer for error messages with actions
    const duration = type === 'error' ? 5000 : type === 'loading' ? 0 : 3000;
    if (duration > 0) {
      this._saveStatusTimer = setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'save-status';
      }, duration);
    }
  }
}

// Initialize options page
const optionsManager = new OptionsManager();
optionsManager.init();

// Flush a pending debounced autosave before the page goes away (tab close,
// navigation, backgrounding on mobile). pagehide also fires on bfcache
// entry, which is fine — flushing is idempotent.
window.addEventListener('pagehide', () => {
  optionsManager.flushPendingAutoSave();
});

