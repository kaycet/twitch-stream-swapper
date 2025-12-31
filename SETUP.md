# Setup Guide

## Quick Start

1. **Get Twitch Client ID**
   - Visit https://dev.twitch.tv/console/apps
   - Click "Register Your Application"
   - Fill in:
     - Name: "Twitch Stream Rotator" (or any name)
     - OAuth Redirect URLs: Leave empty
     - Category: "Desktop Application"
   - Click "Create"
   - Copy the "Client ID"

2. **Load Extension**
   - Open Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `twitch-stream-rotator` folder

3. **Configure Extension**
   - Click the extension icon
   - Click the ⚙️ settings button
   - Paste your Twitch Client ID
   - Click "Save Settings"

4. **Add Streams**
   - In the popup, enter streamer usernames
   - Drag to reorder by priority
   - Enable auto-switching in settings

## Creating Icons

Before publishing to Chrome Web Store, you need icon files:

1. Create 512x512 icon design
2. Resize to: 16x16, 48x48, 128x128, 512x512
3. Save as PNG files in `icons/` folder:
   - `icon-16.png`
   - `icon-48.png`
   - `icon-128.png`
   - `icon-512.png`

See `ICONS.md` for detailed instructions.

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Can add/remove streams
- [ ] Drag-and-drop reordering works
- [ ] Stream status updates (live/offline)
- [ ] Auto-switching works (when on Twitch)
- [ ] Category fallback works
- [ ] Settings save correctly
- [ ] Premium features work (when enabled)
- [ ] Notifications work (premium)
- [ ] Themes apply correctly (premium)
- [ ] Analytics display (premium)

## Publishing to Chrome Web Store

1. **Prepare Assets**
   - Icons (16, 48, 128, 512px)
   - Screenshots (1280x800 or 640x400)
   - Store description
   - Privacy policy URL (host PRIVACY.md)

2. **Create ZIP**
   - Zip the entire `twitch-stream-rotator` folder
   - Exclude: `.git`, `node_modules`, `*.md` (except README)

3. **Submit**
   - Go to Chrome Web Store Developer Dashboard
   - Create new item
   - Upload ZIP
   - Fill in store listing
   - Submit for review

## Troubleshooting

### "Invalid Twitch Client ID" Error
- Verify Client ID is correct
- Check for extra spaces
- Ensure Client ID is from Twitch Developer Console

### Auto-switching Not Working
- Check that "Auto-Switching" is enabled in settings
- Verify you're on a Twitch page (extension only switches from Twitch tabs)
- Check that streams are actually live
- Verify check interval is reasonable (not too long)

### Streams Not Showing as Live
- Verify Twitch Client ID is set
- Check browser console for API errors
- Ensure streamer username is correct (case-insensitive)
- Check Twitch API status

### Extension Not Loading
- Check manifest.json for syntax errors
- Verify all files are present
- Check browser console for errors
- Ensure Chrome version supports Manifest V3

## Support

For issues or questions:
- Check README.md
- Review code comments
- Open GitHub issue
- Contact developer (if donation links configured)

