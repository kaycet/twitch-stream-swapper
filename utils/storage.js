/**
 * Storage utilities for managing extension data
 * Handles Chrome storage API with caching for performance
 */

class StorageManager {
  constructor() {
    this.cache = new Map();
    this.saveQueue = new Map();
    this.saveTimeout = null;
    this.DEBOUNCE_DELAY = 300; // ms
  }

  /**
   * Get data from storage with caching
   * @param {string|string[]} keys - Key(s) to retrieve
   * @returns {Promise<any>}
   */
  async get(keys) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const cacheKey = JSON.stringify(keyArray);
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const result = await chrome.storage.local.get(keyArray);
      const value = Array.isArray(keys) ? result : result[keys];
      
      // Cache the result
      this.cache.set(cacheKey, value);
      
      return value;
    } catch (error) {
      console.error('Storage get error:', error);
      throw error;
    }
  }

  /**
   * Set data in storage with debouncing
   * @param {Object} items - Key-value pairs to store
   * @param {boolean} immediate - Skip debouncing if true
   */
  async set(items, immediate = false) {
    // Merge with queue
    Object.entries(items).forEach(([key, value]) => {
      this.saveQueue.set(key, value);
      // Invalidate cache
      this.cache.delete(key);
    });

    if (immediate) {
      return this._flush();
    }

    // Debounce saves
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this._flush();
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Flush queued saves to storage
   * @private
   */
  async _flush() {
    if (this.saveQueue.size === 0) return;

    const items = Object.fromEntries(this.saveQueue);
    this.saveQueue.clear();

    try {
      await chrome.storage.local.set(items);
    } catch (error) {
      console.error('Storage set error:', error);
      throw error;
    }
  }

  /**
   * Remove keys from storage
   * @param {string|string[]} keys - Key(s) to remove
   */
  async remove(keys) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    
    // Remove from cache
    keyArray.forEach(key => {
      this.cache.delete(key);
      this.saveQueue.delete(key);
    });

    try {
      await chrome.storage.local.remove(keyArray);
    } catch (error) {
      console.error('Storage remove error:', error);
      throw error;
    }
  }

  /**
   * Clear all storage
   */
  async clear() {
    this.cache.clear();
    this.saveQueue.clear();
    
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('Storage clear error:', error);
      throw error;
    }
  }

  /**
   * Get streams list
   * @returns {Promise<Array>}
   */
  async getStreams() {
    const data = await this.get('streams');
    return data || [];
  }

  /**
   * Save streams list
   * @param {Array} streams - Array of stream objects
   */
  async saveStreams(streams) {
    await this.set({ streams }, true); // Immediate save for streams
  }

  /**
   * Get settings
   * @returns {Promise<Object>}
   */
  async getSettings() {
    const defaultSettings = {
      checkInterval: 60000, // 1 minute
      fallbackCategory: "Just Chatting",
      redirectEnabled: true,
      promptBeforeSwitch: false, // Default to auto-swap (off)
      notificationsEnabled: false,
      theme: "default",
      premiumStatus: false,
      clientId: ""
    };

    const settings = await this.get('settings');
    return { ...defaultSettings, ...settings };
  }

  /**
   * Save settings
   * @param {Object} settings - Settings object
   */
  async saveSettings(settings) {
    const current = await this.getSettings();
    await this.set({ settings: { ...current, ...settings } });
  }

  /**
   * Get analytics data
   * @returns {Promise<Object>}
   */
  async getAnalytics() {
    const data = await this.get('analytics');
    return data || {
      viewingTime: {},
      switchCount: 0,
      lastSwitch: null
    };
  }

  /**
   * Save analytics data
   * @param {Object} analytics - Analytics object
   */
  async saveAnalytics(analytics) {
    const current = await this.getAnalytics();
    await this.set({ analytics: { ...current, ...analytics } });
  }

  /**
   * Clear cache (useful for testing or memory management)
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton instance
const storage = new StorageManager();
export default storage;

