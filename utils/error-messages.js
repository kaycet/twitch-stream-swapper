/**
 * Centralized error message utility
 * Provides user-friendly, actionable error messages
 */

class ErrorMessageManager {
  /**
   * Get user-friendly error message based on error type
   * @param {Error|string} error - Error object or error message
   * @param {string} context - Context where error occurred (e.g., 'addStream', 'saveSettings')
   * @returns {Object} - { message: string, type: 'error'|'warning'|'info', action?: string }
   */
  static getErrorMessage(error, context = 'general') {
    const errorMessage = error?.message || error || 'An unknown error occurred';
    const errorString = errorMessage.toLowerCase();

    // Network errors
    if (errorString.includes('network') || errorString.includes('fetch') || 
        errorString.includes('failed to fetch') || errorString.includes('networkerror')) {
      return {
        message: 'Network connection failed. Please check your internet connection and try again.',
        type: 'error',
        action: 'Check your internet connection and ensure Twitch is accessible.'
      };
    }

    // Rate limiting
    if (errorString.includes('429') || errorString.includes('rate limit') || 
        errorString.includes('too many requests')) {
      return {
        message: 'Rate limit exceeded. The extension is making too many requests to Twitch.',
        type: 'warning',
        action: 'Please wait a few minutes before trying again. The extension will automatically retry.'
      };
    }

    // Authentication errors (production uses token broker + app access token)
    if (errorString.includes('client id') || errorString.includes('401') || 
        errorString.includes('unauthorized') || errorString.includes('invalid')) {
      if (context === 'saveSettings' || context === 'checkStatus') {
        return {
          message: 'Twitch API authorization failed.',
          type: 'error',
          action: 'If you are the developer: verify the broker is deployed and proxies Helix (GET https://<your-broker>/helix/streams?...).'
        };
      }
      return {
        message: 'Twitch API is not configured.',
        type: 'error',
        action: 'If you are the developer: configure TWITCH_CLIENT_ID and TOKEN_BROKER_URL.'
      };
    }

    // Invalid username errors
    if (errorString.includes('invalid username') || errorString.includes('username') && 
        (errorString.includes('format') || errorString.includes('not found') || 
         errorString.includes('does not exist'))) {
      return {
        message: 'Invalid username. Twitch usernames must be 4-25 characters (letters, numbers, underscores).',
        type: 'error',
        action: 'Check the username spelling and ensure it follows Twitch username rules.'
      };
    }

    // API errors
    if (errorString.includes('api') || errorString.includes('500') || 
        errorString.includes('503') || errorString.includes('502')) {
      return {
        message: 'Twitch API is temporarily unavailable. Please try again in a few moments.',
        type: 'error',
        action: 'This is usually temporary. Wait a moment and try again.'
      };
    }

    // JSON parsing errors
    if (errorString.includes('json') || errorString.includes('parse')) {
      return {
        message: 'Received invalid data from Twitch. Please try again.',
        type: 'error',
        action: 'This may be a temporary issue. Try again in a moment.'
      };
    }

    // Timeout errors
    if (errorString.includes('timeout') || errorString.includes('timed out')) {
      return {
        message: 'Request timed out. The connection to Twitch took too long.',
        type: 'error',
        action: 'Check your internet connection and try again.'
      };
    }

    // Context-specific errors
    if (context === 'addStream') {
      if (errorString.includes('already') || errorString.includes('duplicate')) {
        return {
          message: 'This stream is already in your list.',
          type: 'info',
          action: null
        };
      }
      if (errorString.includes('limit') || errorString.includes('maximum')) {
        return {
          message: 'Free tier limited to 10 streams. Enable Supporter Features (honor system) for unlimited streams.',
          type: 'info',
          action: 'Go to Settings → Supporter Features.'
        };
      }
    }

    if (context === 'saveSettings') {
      if (errorString.includes('client id')) {
        return {
          message: 'Invalid Twitch Client ID (advanced setting).',
          type: 'error',
          action: 'If you changed the Client ID manually, verify it matches your Twitch app. Otherwise, clear the field and Save to use the built-in config.'
        };
      }
    }

    if (context === 'activatePremium') {
      return {
        message: 'Failed to enable supporter features. Please try again.',
        type: 'error',
        action: 'If the issue persists, try reloading the options page.'
      };
    }

    // Generic error fallback
    return {
      message: errorMessage || 'An unexpected error occurred. Please try again.',
      type: 'error',
      action: 'If this problem persists, try refreshing the extension or check your settings.'
    };
  }

  /**
   * Get success message for context
   * @param {string} context - Context where success occurred
   * @param {Object} data - Optional data for message customization
   * @returns {Object} - { message: string, type: 'success' }
   */
  static getSuccessMessage(context, data = {}) {
    const messages = {
      addStream: `Successfully added ${data.username || 'stream'} to your list!`,
      removeStream: 'Stream removed from your list.',
      saveSettings: 'Settings saved successfully!',
      activatePremium: 'Supporter features enabled. Thank you for your support!',
      clearAnalytics: 'Analytics data cleared successfully.',
      reorderStreams: 'Stream order updated.',
      checkStatus: 'Stream status updated.'
    };

    return {
      message: messages[context] || 'Operation completed successfully!',
      type: 'success'
    };
  }

  /**
   * Get loading message for context
   * @param {string} context - Context where loading is happening
   * @returns {string}
   */
  static getLoadingMessage(context) {
    const messages = {
      addStream: 'Adding stream...',
      checkStatus: 'Checking stream status...',
      saveSettings: 'Saving settings...',
      loadData: 'Loading...',
      activatePremium: 'Enabling supporter features...',
      clearAnalytics: 'Clearing analytics...'
    };

    return messages[context] || 'Loading...';
  }

  /**
   * Format error message with action
   * @param {Object} errorInfo - Error info from getErrorMessage
   * @returns {string}
   */
  static formatMessage(errorInfo) {
    if (errorInfo.action) {
      return `${errorInfo.message} ${errorInfo.action}`;
    }
    return errorInfo.message;
  }
}

export default ErrorMessageManager;
