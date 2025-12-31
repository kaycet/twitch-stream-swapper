<div align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="Twitch Stream Swapper icon" />

  <h1>Twitch Stream Swapper</h1>

  <p>
    Auto‑switch Twitch to your highest‑priority live streamer.<br/>
    Optional category fallback when nobody is live.
  </p>

  <p>
    <a href="https://github.com/kaycet/twitch-stream-swapper/actions/workflows/ci.yml">
      <img alt="CI" src="https://github.com/kaycet/twitch-stream-swapper/actions/workflows/ci.yml/badge.svg" />
    </a>
    <a href="https://github.com/kaycet/twitch-stream-swapper/actions/workflows/release.yml">
      <img alt="Release" src="https://github.com/kaycet/twitch-stream-swapper/actions/workflows/release.yml/badge.svg" />
    </a>
    <a href="LICENSE">
      <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
    </a>
  </p>
</div>

## What it does

- **Priority list**: add streamers and drag to set priority.
- **Auto‑Swap (optional)**: manages **one** Twitch tab and redirects it to the top live streamer.
- **Category fallback (optional)**: if nobody is live, it can pick a random stream from a category.
- **On‑page status pill**: shows when Auto‑Swap is active; indicates fallback mode and lets you pick a new random.

## Install

- **Chrome Web Store**: coming soon. Publishing checklist: `docs/CHROME_STORE.md`.
- **From source (developer mode)**:

```bash
npm ci
```

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this repo folder

## Quick start

1. Open the extension popup → add streamers → drag to reorder
2. Toggle **Auto‑Swap** ON (it binds to a single managed Twitch tab)
3. (Optional) Enable **Category Fallback** in Options and pick a category

## Privacy

- Stores your stream list and settings locally in Chrome storage
- Does not sell personal data
- See `docs/PRIVACY.md`

## For maintainers

- **Package ZIP**: `npm run package` (outputs to `dist/`)
- **Releases**: tag `vX.Y.Z` → GitHub Actions builds and uploads the ZIP to a GitHub Release
- **Token broker (recommended for production)**: `token-broker/`
  - Deployment/security notes: `docs/token-broker/SECURITY.md`
 - **Manual QA checklist**: `docs/TESTING.md`

## Contributing

PRs welcome. Please run:

```bash
npm run lint
npm test
```

## License

MIT — see `LICENSE`.

