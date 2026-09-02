import { describe, it, expect } from 'vitest';
import ErrorMessageManager from '../utils/error-messages.js';

const coded = (code, message = 'opaque message') => Object.assign(new Error(message), { code });
const get = (err, ctx) => ErrorMessageManager.getErrorMessage(err, ctx);

describe('getErrorMessage prefers error.code over message sniffing', () => {
  it('routes the real Helix parse failure to the JSON copy, not the outage copy', () => {
    // utils/twitch-api.js throws exactly this message with code PARSE_ERROR;
    // the message also contains "API", which used to win.
    expect(get(coded('PARSE_ERROR', 'Invalid JSON response from Twitch API')).message)
      .toMatch(/received invalid data from twitch/i);
    // Same message as a plain string (no code) must route the same way.
    expect(get('Invalid JSON response from Twitch API').message)
      .toMatch(/received invalid data from twitch/i);
  });

  it('classifies by code even when the message says nothing useful', () => {
    expect(get(coded('AUTH_ERROR')).message).toMatch(/not configured/i);
    expect(get(coded('AUTH_ERROR'), 'checkStatus').message).toMatch(/authorization failed/i);
    expect(get(coded('RATE_LIMIT')).type).toBe('warning');
    expect(get(coded('SERVER_ERROR')).message).toMatch(/temporarily unavailable/i);
    expect(get(coded('TIMEOUT')).message).toMatch(/timed out/i);
    expect(get(coded('NETWORK_ERROR')).message).toMatch(/network connection failed/i);
  });

  it('lets a known code win over misleading words in the message', () => {
    // API_ERROR messages embed the Twitch response body verbatim.
    const err = coded('API_ERROR', 'Twitch API error 400: body={"message":"could not parse json"}');
    expect(get(err).message).toMatch(/temporarily unavailable/i);
  });

  it('falls through to message matching for unknown codes', () => {
    expect(get(coded('FORBIDDEN_ORIGIN', 'Token broker rejected this request')).message)
      .toBe('Token broker rejected this request');
  });
});
