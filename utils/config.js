/**
 * Build-time configuration for the extension.
 *
 * Production model (no user setup):
 * - You ship with your own Twitch Client ID.
 * - You run a small "token broker" backend that holds your Client Secret and returns App Access Tokens.
 * - The extension never contains a Client Secret.
 *
 * Before publishing to Chrome Web Store:
 * - Replace the placeholders below.
 * - Update `manifest.json` host_permissions for your token broker domain.
 */

// Twitch app Client ID (safe to ship in the extension)
export const TWITCH_CLIENT_ID = '2aocuq1w2bxwld7c0rbsw3zr1ue63x';

// Token broker base URL (no trailing slash), e.g. 'https://twitch-token-broker.example.com'
export const TOKEN_BROKER_URL = 'https://tsr-token-broker.com';


