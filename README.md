# Twitch Stream Rotator

A Chrome extension that automatically rotates between Twitch streams based on priority. Auto-switches when higher priority streams go live, with category fallback and premium features.

## Features

### Core Features
- **Priority-based Stream Rotation**: Drag-and-drop interface to prioritize your favorite streamers
- **Auto-Switching**: Automatically redirects to the highest priority live stream
- **Category Fallback**: When no streams in your list are live, shows a random stream from a selected category
- **Real-time Status**: Live/offline indicators for all streams in your list
- **Smart Polling**: Efficient API usage with batching, caching, and rate limit handling

### Premium Features (Soft Paywall)
- **Desktop Notifications**: Get notified when streams go live
- **Custom Themes**: Multiple UI themes (Dark, Neon)
- **Analytics**: Track viewing time per stream and switch frequency
- **Unlimited Streams**: Free tier limited to 10 streams, premium unlimited

## Installation

### From Source

1. Clone this repository:
```bash
git clone <repository-url>
cd twitch-stream-rotator
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select the `twitch-stream-rotator` directory

5. Get a Twitch Client ID:
   - Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
   - Create a new application
   - Copy the Client ID
   - Open the extension options and paste the Client ID

6. Add your favorite streamers and start using!

### Chrome Web Store

Coming soon! (Once published)

## Usage

### Adding Streams

1. Click the extension icon to open the popup
2. Enter a streamer username in the input field
3. Click "Add" or press Enter
4. Drag and drop streams to reorder by priority

### Setting Up Auto-Switching

1. Open extension options (click ⚙️ in popup or right-click extension → Options)
2. Enter your Twitch Client ID (required)
3. Configure check interval (default: 60 seconds)
4. Enable "Auto-Switching" toggle
5. The extension will automatically redirect to the highest priority live stream

### Category Fallback

1. In options, enter a Twitch category name (e.g., "Just Chatting", "League of Legends")
2. Enable "Category Fallback"
3. When no streams in your list are live, a random stream from that category will be shown

### Premium Features

Support the developer to unlock premium features:

1. In options, scroll to "Support the Developer" section
2. Configure your donation links (Ko-fi, PayPal)
3. After donation, enter the activation code provided
4. Premium features will be unlocked:
   - Desktop notifications
   - Custom themes
   - Analytics dashboard
   - Unlimited stream slots

## Development

### Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server (for Vibe Kanban Web Companion):
```bash
npm run dev
```

The development server will start and you can access the Vibe Kanban Web Companion at `http://localhost:5173/dev.html` (or the port shown in the terminal).

3. Build for production:
```bash
npm run build
```

### Project Structure

```
twitch-stream-rotator/
├── manifest.json          # Extension manifest
├── popup.html/js/css      # Main popup UI
├── options.html/js/css    # Settings page
├── background.js          # Service worker (polling logic)
├── dev.html               # Development page with Vibe Kanban Web Companion
├── src/
│   └── main.jsx           # React entry point for dev page
├── utils/
│   ├── twitch-api.js      # Twitch API wrapper
│   ├── storage.js         # Storage utilities
│   └── notifications.js   # Notification manager
├── themes/                # Premium themes
└── icons/                 # Extension icons
```

### Vibe Kanban Web Companion

The project includes [Vibe Kanban Web Companion](https://github.com/BloopAI/vibe-kanban-web-companion) for enhanced development experience. The companion component is integrated in the development page (`dev.html`) and only renders in development mode.

To use it:
1. Run `npm run dev`
2. Open `http://localhost:5173/dev.html` in your browser
3. The Vibe Kanban Web Companion will be available for point-and-click editing when used with Vibe Kanban

### Building Icons

Icons are required for Chrome Web Store submission. See `ICONS.md` for generation instructions.

### Using Vibe Kanban

This project is set up to work with [Vibe Kanban](https://www.vibekanban.com/) for AI-assisted development:

```bash
# Start Vibe Kanban (auto-detects this project)
npx vibe-kanban
```

Vibe Kanban allows you to:
- Run multiple coding agents in parallel
- Review code changes through built-in diffs
- Manage development tasks with a kanban board
- Work with various AI coding agents (Claude Code, Cursor CLI, etc.)

The project is automatically detected and configured when you run Vibe Kanban.

### Testing

1. Load the extension in developer mode
2. Test with a few streamers
3. Verify auto-switching works
4. Test category fallback
5. Test premium features (manually enable premium status for testing)

## Configuration

### Required Settings

- **Twitch Client ID**: Required for API access. Get one at [Twitch Developer Console](https://dev.twitch.tv/console/apps)

### Optional Settings

- **Check Interval**: How often to poll for stream status (default: 60000ms = 1 minute)
- **Auto-Switching**: Enable/disable automatic tab redirection
- **Category Fallback**: Category name for fallback streams
- **Donation Links**: Ko-fi and PayPal links for premium activation

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
- For premium activation, contact the developer
- Check the options page for donation links

## Changelog

### v1.0.0
- Initial release
- Priority-based stream rotation
- Auto-switching
- Category fallback
- Premium features (notifications, themes, analytics)

