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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, {
        headers: this._getHeaders(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - wait and retry
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
          const error = new Error('Rate limit exceeded');
          error.code = 'RATE_LIMIT';
          error.retryAfter = retryAfter;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return this._request(endpoint, params, retries - 1);
          }
          throw error;
        }

        if (response.status === 401) {
          const error = new Error('Invalid Twitch Client ID. Please check your settings.');
          error.code = 'AUTH_ERROR';
          throw error;
        }

        if (response.status >= 500) {
          const error = new Error(`Twitch API server error: ${response.status} ${response.statusText}`);
          error.code = 'SERVER_ERROR';
          throw error;
        }

        if (response.status === 404) {
          const error = new Error('Resource not found');
          error.code = 'NOT_FOUND';
          throw error;
        }

        const error = new Error(`Twitch API error: ${response.status} ${response.statusText}`);
        error.code = 'API_ERROR';
        throw error;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        const error = new Error('Invalid JSON response from Twitch API');
        error.code = 'PARSE_ERROR';
        throw error;
      }

      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      // Handle network errors
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        const timeoutError = new Error('Request timed out. Please check your internet connection.');
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }

      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        const networkError = new Error('Network connection failed. Please check your internet connection.');
        networkError.code = 'NETWORK_ERROR';
        throw networkError;
      }

      // Retry logic for retryable errors
      if (retries > 0 && !error.code || 
          (error.code && ['SERVER_ERROR', 'TIMEOUT', 'NETWORK_ERROR'].includes(error.code))) {
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
   * @throws {Error} - If there's a critical error that should be handled by caller
   */
  async checkStreamsStatus(usernames) {
    if (!usernames || usernames.length === 0) {
      return {};
    }

    // Validate usernames
    const validUsernames = usernames.filter(u => u && /^[a-zA-Z0-9_]{4,25}$/.test(u));
    if (validUsernames.length === 0) {
      throw new Error('Invalid username format');
    }

    // Batch requests (Twitch allows up to 100 user_logins per request)
    const batches = [];
    for (let i = 0; i < validUsernames.length; i += 100) {
      batches.push(validUsernames.slice(i, i + 100));
    }

    const results = {};
    let hasError = false;
    let lastError = null;

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
        hasError = true;
        lastError = error;
        
        // Mark all in batch as null on error
        batch.forEach(username => {
          results[username] = null;
        });
      }
    }

    // If we had errors and it's a critical error (not just network issues), throw
    if (hasError && lastError && 
        (lastError.code === 'AUTH_ERROR' || lastError.code === 'RATE_LIMIT')) {
      throw lastError;
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

