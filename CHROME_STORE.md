## Chrome Web Store listing setup (manual, but streamlined)

Publishing is done manually in the Chrome Web Store Developer Dashboard. This doc is a checklist + copy you can paste into the listing.

### One-time setup

- **Create a developer account**: you need a Chrome Web Store Developer account (one-time fee).
- **Decide your “production model”**:
  - **Recommended**: use the included **token broker** (`token-broker/`) so the extension never ships with a Twitch Client Secret.
  - Ensure your broker is deployed and `TOKEN_BROKER_URL` (in `utils/config.js`) points at it before publishing.

### Build the upload ZIP

- **Build the store ZIP** (this repo already has a packager):

```bash
npm ci
npm run package
```

- Upload the resulting ZIP from `dist/` to the store listing.

### Listing content (copy/paste)

#### Short description (max ~132 chars)

Auto‑switch Twitch to the highest‑priority live streamer. Includes category fallback when nobody is live.

#### Detailed description

Twitch Stream Swapper helps you keep up with the streamers you care about.

How it works:
- Add streamers and drag to set priority.
- Enable Auto‑Swap (it manages exactly one Twitch tab).
- When a higher‑priority streamer goes live, it switches your managed Twitch tab automatically.
- If nobody is live, optional Category Fallback picks a random live stream from your chosen category.

Supporter features (optional / honor system):
- Desktop notifications
- Custom themes
- Analytics

Privacy:
- Stores your list/settings locally in Chrome storage.
- Does not sell personal data.
- See the included privacy policy in `PRIVACY.md`.

### Assets you’ll need (prepare before uploading)

- **Screenshots**: at least 1 (recommended 3–5). Capture:
  - Popup with prioritized list
  - Options page
  - “Category Fallback” in action
  - The Twitch overlay pill (Auto‑Swap / Category Fallback)
- **Store icons**: you already have icons in `icons/` (including 128 and 512).

### Store “Privacy practices” answers (guidance)

You’ll need to answer these in the dashboard. Typical answers for this extension:

- **Data collected**: none (no personal data sent to your servers).
- **Data used**: local-only settings + stream list.
- **Data shared**: none.

You must ensure these statements match your actual behavior. If you enable a token broker, it should only mint Twitch app tokens and should not log/store user identifiers.

### Review notes (helps approval)

The extension requests:
- `tabs`: required to redirect **the single managed Twitch tab**.
- `storage`: required for saving stream list and settings.
- `idle`: optional optimization to pause polling when Chrome is idle.
- `notifications`: optional supporter feature (only if enabled).

If the reviewer asks “what tab is affected?”, the answer is: **only the explicitly managed Twitch tab** (`managedTwitchTabId`).

### Publishing flow

- Create a new item → upload ZIP
- Fill listing content + upload screenshots
- Complete privacy + permissions disclosures
- Submit for review → publish


