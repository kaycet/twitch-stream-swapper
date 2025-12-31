/**
 * Twitch API wrapper with batch requests, caching, and rate limit handling
 */

class TwitchAPI {
  constructor() {
    this.baseURL = 'https://api.twitch.tv/helix';
    this.clientId = null;
    this.cache = new Map();
    this.cacheTTL = 30000; // 30 seconds
    this.rateLimitQueue = [];
    this.rateLimitDelay = 0;
    this.requestCount = 0;
    this.requestWindow = Date.now();
    this.MAX_REQUESTS_PER_MINUTE = 800;
  }

  /**
   * Initialize with client ID
   * @param {string} clientId - Twitch Client ID
   */
  async initialize(clientId) {
    this.clientId = clientId;
  }

  /**
   * Get headers for API requests
   * @returns {Object}
   */
  _getHeaders() {
    if (!this.clientId) {
      throw new Error('Twitch Client ID not set. Please configure in options.');
    }

    return {
      'Client-ID': this.clientId,
      'Accept': 'application/vnd.twitchtv.v5+json'
    };
  }

  /**
   * Check rate limits and queue requests if needed
   * @private
   */
  async _checkRateLimit() {
    const now = Date.now();
    
    // Reset counter if window passed
    if (now - this.requestWindow > 60000) {
      this.requestCount = 0;
      this.requestWindow = now;
    }

    // If approaching limit, wait
    if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - (now - this.requestWindow);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.requestWindow = Date.now();
      }
    }

    this.requestCount++;
  }

  /**
   * Make API request with error handling and retry logic
   * @param {string} endpoint - API endpoint (may include query string)
   * @param {Object} params - Query parameters (optional, if endpoint already has query string)
   * @param {number} retries - Number of retries
   * @returns {Promise<any>}
   */
  async _request(endpoint, params = {}, retries = 3) {
    await this._checkRateLimit();

    // If endpoint already has query params, don't add more
    let url;
    if (endpoint.includes('?')) {
      url = `${this.baseURL}${endpoint}`;
    } else {
      const queryString = new URLSearchParams(params).toString();
      url = `${this.baseURL}${endpoint}${queryString ? '?' + queryString : ''}`;
    }
    const cacheKey = url;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    try {
      const response = await fetch(url, {
        headers: this._getHeaders()
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - wait and retry
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          if (retries > 0) {
            return this._request(endpoint, params, retries - 1);
          }
        }

        if (response.status === 401) {
          throw new Error('Invalid Twitch Client ID. Please check your settings.');
        }

        throw new Error(`Twitch API error: ${response.status} ${response.statusText}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error('Invalid JSON response from Twitch API');
      }

      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      if (retries > 0 && !error.message.includes('Client ID')) {
        // Exponential backoff
        const delay = Math.pow(2, 3 - retries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._request(endpoint, params, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Check if multiple streams are live (batch request)
   * @param {string[]} usernames - Array of usernames (up to 100)
   * @returns {Promise<Object>} - Map of username -> stream data or null
   */
  async checkStreamsStatus(usernames) {
    if (!usernames || usernames.length === 0) {
      return {};
    }

    // Batch requests (Twitch allows up to 100 user_logins per request)
    const batches = [];
    for (let i = 0; i < usernames.length; i += 100) {
      batches.push(usernames.slice(i, i + 100));
    }

    const results = {};

    for (const batch of batches) {
      // Twitch Helix API accepts multiple user_login params by repeating them
      // Build query string with repeated user_login parameters
      const loginParams = batch.map(u => `user_login=${encodeURIComponent(u.toLowerCase())}`).join('&');
      
      try {
        // Use the query string directly in the endpoint
        const data = await this._request(`/streams?${loginParams}`, {});
        
        // Create map of live streams
        const liveStreams = {};
        if (data.data) {
          data.data.forEach(stream => {
            liveStreams[stream.user_login.toLowerCase()] = stream;
          });
        }

        // Map results
        batch.forEach(username => {
          results[username] = liveStreams[username.toLowerCase()] || null;
        });
      } catch (error) {
        console.error('Error checking stream status:', error);
        // Mark all as null on error
        batch.forEach(username => {
          results[username] = null;
        });
      }
    }

    return results;
  }

  /**
   * Check if a single stream is live
   * @param {string} username - Username to check
   * @returns {Promise<Object|null>} - Stream data or null if offline
   */
  async checkStreamStatus(username) {
    const results = await this.checkStreamsStatus([username]);
    return results[username] || null;
  }

  /**
   * Get category/game ID by name
   * @param {string} categoryName - Category name
   * @returns {Promise<string|null>} - Game ID or null
   */
  async getCategoryId(categoryName) {
    try {
      const data = await this._request('/games', { name: categoryName });
      if (data.data && data.data.length > 0) {
        return data.data[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error getting category ID:', error);
      return null;
    }
  }

  /**
   * Get random live stream from a category
   * @param {string} categoryName - Category name
   * @returns {Promise<Object|null>} - Random stream data or null
   */
  async getRandomStreamFromCategory(categoryName) {
    try {
      const gameId = await this.getCategoryId(categoryName);
      if (!gameId) {
        return null;
      }

      const data = await this._request('/streams', { 
        game_id: gameId,
        first: 100 
      });

      if (data.data && data.data.length > 0) {
        // Pick random stream from results
        const randomIndex = Math.floor(Math.random() * data.data.length);
        return data.data[randomIndex];
      }

      return null;
    } catch (error) {
      console.error('Error getting random stream:', error);
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache stats (for debugging)
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      requestsThisMinute: this.requestCount
    };
  }
}

// Export singleton instance
const twitchAPI = new TwitchAPI();
export default twitchAPI;

