# Privacy Policy

**Last Updated:** January 2026

## Overview

Twitch Stream Swapper ("the Extension") is committed to protecting your privacy. This privacy policy explains how the Extension handles data.

## Data Collection

### Local Storage

The Extension stores the following data locally on your device using Chrome's storage API:

- **Stream List**: Usernames and priority order of streamers you follow
- **Settings**: Configuration preferences (check interval, category fallback, etc.)
- **Analytics** (Premium): Viewing time and switch statistics (stored locally only)

**This data is never transmitted to any external server.**

### API Requests

The Extension makes API requests to Twitch's public API (api.twitch.tv) to:

- Check if streams are live
- Get stream information (title, game, thumbnail)
- Get category information for fallback streams

By default, these requests use a built-in Twitch Client ID and are subject to Twitch's privacy policy and terms of service. Advanced users can optionally override the Client ID in settings.

To avoid shipping any Twitch Client Secret inside the extension, the Extension can use a Cloudflare Worker token broker (`tsr-token-broker.com`) that proxies Twitch Helix requests and keeps the secret server-side.

### No Data Transmission

The Extension does NOT:
- Collect personal information
- Transmit your local settings/stream list to third-party servers
- Track browsing behavior
- Use analytics services
- Store data in the cloud
- Share data with advertisers

## Permissions

### Storage Permission
- **Purpose**: Store your stream list and settings locally
- **Data**: Stream usernames, priority order, configuration preferences
- **Location**: Chrome's local storage (on your device only)

### Tabs Permission
- **Purpose**: Redirect browser tabs to live streams
- **Usage**: Only redirects when auto-switching is enabled and streams go live
- **Scope**: Only affects tabs you have open

### Idle Permission
- **Purpose**: Detect when browser is idle to pause polling
- **Usage**: Reduces API calls when you're not actively using the browser
- **Data**: No data collected, only detects idle state

### Notifications Permission
- **Purpose**: Show desktop notifications when streams go live (premium feature)
- **Usage**: Only when notifications are enabled in settings
- **Data**: No data collected, only displays notifications

### Host Permissions (Twitch API)
- **Purpose**: Access Twitch and related endpoints needed for core functionality
- **Usage**:
  - `https://api.twitch.tv/*`: Twitch Helix API requests
  - `https://tsr-token-broker.com/*`: token broker proxy (keeps secrets off the extension)
  - `https://twitch.tv/*` and `https://*.twitch.tv/*`: manage the single Twitch tab the user enables Auto‑Swap for
- **Data**: Only requests stream/category information needed to determine live status and show UI

## Third-Party Services

### Twitch API
- The Extension uses Twitch's public API
- API requests are subject to [Twitch's Privacy Policy](https://www.twitch.tv/p/legal/privacy-policy/)
- A Twitch Client ID is required (the extension includes a default; advanced users can override)
- No authentication tokens or user credentials are stored

### Donation Links (Optional)
- If you use the Ko-fi support link, it opens an external Ko-fi page
- Clicking donation buttons takes you to external sites
- The Extension does not track donations or payment information

## Premium Features

Premium features (notifications, themes, analytics) work entirely locally:

- **Notifications**: Uses Chrome's notification API, no data transmitted
- **Themes**: CSS files loaded locally, no external requests
- **Analytics**: Data stored locally only, never transmitted

## Data Security

- All data is stored locally in Chrome's secure storage
- No data is transmitted over the network (except Twitch API requests)
- No encryption keys or sensitive credentials are stored
- Your Twitch Client ID is stored locally (you can remove it anytime)

## Your Rights

You have full control over your data:

- **View Data**: All data is accessible through Chrome's storage API
- **Delete Data**: Uninstall the extension to remove all stored data
- **Export Data**: Use Chrome's storage API to export your data
- **Modify Data**: Change settings or stream list anytime through the UI

## Children's Privacy

The Extension does not knowingly collect data from children. If you believe a child has provided data, please contact us to have it removed.

## Changes to Privacy Policy

We may update this privacy policy. Changes will be reflected in the "Last Updated" date at the top of this document.

## Contact

For privacy concerns or questions:
- Open an issue on GitHub
- Contact through donation links (if configured)

## Compliance

This Extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

---

**Note**: This Extension is not affiliated with Twitch Interactive, Inc. Twitch is a trademark of Twitch Interactive, Inc.

