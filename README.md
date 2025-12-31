# Twitch Stream Swapper

A Chrome extension that automatically swaps between Twitch streams based on priority. Auto-switches when higher priority streams go live, with category fallback and supporter features.

## Features

### Core Features
- **Priority-based Stream Swapping**: Drag-and-drop interface to prioritize your favorite streamers with smooth visual feedback
- **Enhanced Drag-and-Drop**: Visual ghost preview, drop zone highlighting, and smooth animations for intuitive reordering
- **Auto-Switching**: Automatically redirects to the highest priority live stream
- **Category Fallback**: When no streams in your list are live, shows a random stream from a selected category
- **Real-time Status**: Live/offline indicators for all streams in your list
- **Smart Polling**: Efficient API usage with batching, caching, and rate limit handling

### Supporter Features (Honor system)
- **Desktop Notifications**: Get notified when streams go live
- **Custom Themes**: Multiple UI themes (Dark, Neon)
- **Analytics**: Track viewing time per stream and switch frequency
- **Unlimited Streams**: Free tier limited to 10 streams; enabling supporter features unlocks unlimited

## Installation

### From Source

1. Clone this repository:
```bash
git clone <repository-url>
cd twitch-stream-swapper
```

2. Install dependencies:

```bash
npm ci
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select the project directory

5. Add your favorite streamers and start using!

**Note:** For production (Chrome Web Store), ship the extension with built-in Twitch API access (no user setup). See the token broker notes in `token-broker/` and ensure `utils/config.js` and `manifest.json` are configured for your broker.

### Chrome Web Store

Coming soon! (Once published)

If you’re getting ready to publish, see `CHROME_STORE.md` for a step-by-step checklist and listing copy.

## Usage

### Adding Streams

1. Click the extension icon to open the popup
2. Enter a streamer username in the input field
3. Click "Add" or press Enter
4. Drag and drop streams to reorder by priority
   - Visual feedback shows drop zones and a ghost preview while dragging
   - Smooth animations make reordering intuitive and clear

### Setting Up Auto-Switching

1. Open extension options (click ⚙️ in popup or right-click extension → Options)
2. Configure check interval (default: 60 seconds)
3. Enable "Auto-Switching" toggle
4. The extension will automatically redirect to the highest priority live stream

### Category Fallback

1. In options, enter a Twitch category name (e.g., "Just Chatting", "League of Legends")
2. Enable "Category Fallback"
3. When no streams in your list are live, a random stream from that category will be shown

### Supporter Features (Honor system)

If you’d like to support development, you can enable “Supporter Features” in Options. There are **no activation codes** (honor system).

Supporter features include:
- Desktop notifications
- Custom themes
- Analytics dashboard
- Unlimited stream slots

## GitHub Actions + Releases (Chrome Web Store friendly)

This repo includes GitHub Actions workflows that run:
- **Lint** (`npm run lint`)
- **Tests** (`npm run test`)
- **Package** (`npm run package`) → produces a Web Store–ready ZIP and attaches it to a GitHub Release on tags

### Release process (recommended)

1. Update `manifest.json` `"version"` (e.g. `1.0.1`)
2. Commit the change
3. Tag the commit:

```bash
git tag v1.0.1
git push origin v1.0.1
```

4. GitHub Actions will:
   - run lint + tests
   - build `dist/twitch-stream-swapper-<version>.zip`
   - create a **GitHub Release** and upload the ZIP as a release asset

5. Upload that ZIP to the Chrome Web Store.

## Development

### Project Structure

```
twitch-stream-swapper/
├── manifest.json          # Extension manifest
├── popup.html/js/css      # Main popup UI
├── options.html/js/css    # Settings page
├── background.js          # Service worker (polling logic)
├── utils/
│   ├── twitch-api.js      # Twitch API wrapper
│   ├── storage.js         # Storage utilities
│   └── notifications.js   # Notification manager
├── themes/                # Premium themes
└── icons/                 # Extension icons
```

### Local dev commands

```bash
npm run lint
npm run test
npm run package
```

### Building Icons

Icons are required for Chrome Web Store submission. See `ICONS.md` for generation instructions.

### Built with AI assistance

This project was built with help from AI coding assistants (including Cursor) to accelerate iteration and debugging. All code changes are reviewed and maintained by the project owner.

### Testing

1. Load the extension in developer mode
2. Test with a few streamers
3. Verify auto-switching works
4. Test category fallback
5. (Optional) Enable “Supporter Features” in Options to test supporter-only UX

## Configuration

### Required Settings

- None for end users (production model). The extension should include built-in API access.

### Optional Settings

- **Twitch Client ID (Advanced)**: Override the built-in Client ID (useful for developers/testing)
- **Check Interval**: How often to poll for stream status (default: 60000ms = 1 minute)
- **Auto-Switching**: Enable/disable automatic tab redirection
- **Category Fallback**: Category name for fallback streams
- **Donation Links**: Ko-fi and PayPal links (optional)

## Performance

The extension is optimized for performance:

- **Batch API Requests**: Checks up to 100 streams in a single API call
- **Smart Caching**: 30-second cache TTL to reduce redundant requests
- **Idle Detection**: Pauses polling when browser is idle
- **Debounced Saves**: Batches storage writes to reduce I/O
- **Rate Limit Handling**: Respects Twitch's 800 requests/minute limit

## Privacy

This extension:
- Stores data locally in Chrome storage (stream list, settings)
- Makes API requests to Twitch API (requires Client ID)
- Does not collect or transmit personal data
- Does not track user behavior
- See `PRIVACY.md` for full privacy policy

## Token broker (Cloudflare Worker)

This repo includes an optional Cloudflare Worker in `token-broker/` to keep your **Twitch Client Secret** off the extension.

- **Never commit secrets**: store `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` as Cloudflare Worker secrets.
- **Lock down origins**: set `ALLOWED_ORIGINS` to your `chrome-extension://<extension-id>` origin(s).
- **Local development**: put local vars in `token-broker/.dev.vars` (ignored by git).

## Permissions

- **storage**: Store stream list and settings locally
- **tabs**: Redirect tabs to live streams
- **idle**: Detect when browser is idle to pause polling
- **notifications**: Show desktop notifications (premium feature)
- **host_permissions**: Access Twitch API and website

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see `LICENSE` file for details

## Support

- Report issues on GitHub
- Check the Options page if you’d like to support development (optional, honor system)

## Changelog

### v1.0.0
- Initial release
- Priority-based stream rotation
- Auto-switching
- Category fallback
- Premium features (notifications, themes, analytics)

