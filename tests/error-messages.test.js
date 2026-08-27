import { describe, it, expect } from 'vitest';
import ErrorMessageManager from '../utils/error-messages.js';

/**
 * Regression tests for error classification.
 *
 * The auth branch used to match any message containing 'invalid', which
 * swallowed unrelated errors ("Invalid username format", "Invalid color ...")
 * and showed users a bogus "Twitch API authorization failed" message.
 */
describe('ErrorMessageManager.getErrorMessage', () => {
  it('classifies invalid usernames as username errors, not auth errors', () => {
    const info = ErrorMessageManager.getErrorMessage(new Error('Invalid username format'), 'addStream');
    expect(info.message).toMatch(/username/i);
    expect(info.message).not.toMatch(/authorization|not configured/i);
  });

  it('does not route invalid color messages to the auth branch', () => {
    const info = ErrorMessageManager.getErrorMessage('Invalid color for accent (use #RRGGBB)', 'saveSettings');
    expect(info.message).toBe('Invalid color for accent (use #RRGGBB)');
  });

  it('returns the client-id-specific message for saveSettings context', () => {
    const info = ErrorMessageManager.getErrorMessage('Client ID appears to be invalid', 'saveSettings');
    expect(info.message).toBe('Invalid Twitch Client ID (advanced setting).');
  });

  it('still classifies real auth failures as auth errors', () => {
    const unauthorized = ErrorMessageManager.getErrorMessage(
      new Error('Unauthorized by Twitch API (missing/invalid access token or Client ID).'),
      'checkStatus'
    );
    expect(unauthorized.message).toMatch(/authorization failed/i);

    const status401 = ErrorMessageManager.getErrorMessage(new Error('HTTP 401 from broker'), 'general');
    expect(status401.message).toMatch(/not configured|authorization/i);
  });

  it('still classifies rate limits and network errors first', () => {
    expect(ErrorMessageManager.getErrorMessage(new Error('Rate limit exceeded'), 'checkStatus').type).toBe('warning');
    expect(
      ErrorMessageManager.getErrorMessage(new Error('Network connection failed. Please check your internet connection.'), 'checkStatus').message
    ).toMatch(/network/i);
  });
});
