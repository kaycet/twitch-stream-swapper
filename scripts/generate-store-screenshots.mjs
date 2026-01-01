import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.outDir = argv[++i];
    if (a === '--jpeg') out.jpeg = true;
    if (a === '--headless') out.headless = true;
    if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  return `
Generate clean Chrome Web Store screenshots (1280x800).

Usage:
  npm run screenshots
  npm run screenshots -- --out assets/webstore/screenshots --jpeg

Notes:
  - Extensions generally require headful Chromium (not headless).
  - If Playwright can’t find a browser, run: npx playwright install chromium
`;
}

async function waitForExtensionId(context, timeoutMs = 15_000) {
  const started = Date.now();
  // MV3 background is a service worker; its URL includes chrome-extension://<id>/
  while (Date.now() - started < timeoutMs) {
    const workers = context.serviceWorkers();
    for (const w of workers) {
      const u = w.url();
      const m = u.match(/^chrome-extension:\/\/([a-p]{32})\//i);
      if (m) return m[1];
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Timed out waiting for extension service worker. Is the extension loading?');
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function tryFindExtensionIdOnDisk(profileDir, expectedName) {
  // Chrome profile format: <userDataDir>/Default/Extensions/<id>/<version>/manifest.json
  const extRoot = path.join(profileDir, 'Default', 'Extensions');
  if (!fs.existsSync(extRoot)) return null;

  const ids = fs.readdirSync(extRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-p]{32}$/i.test(d.name))
    .map((d) => d.name);

  for (const id of ids) {
    const idDir = path.join(extRoot, id);
    let versions = [];
    try {
      versions = fs.readdirSync(idDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      // ignore
    }
    for (const v of versions) {
      const manifestPath = path.join(idDir, v, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = readJson(manifestPath);
        if (manifest?.name === expectedName) return id;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function normPath(p) {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function tryFindExtensionIdInPreferences(profileDir, extensionDir, expectedName) {
  // Unpacked extensions may not appear under Default/Extensions, but they *do* show up in Default/Preferences.
  const prefsPath = path.join(profileDir, 'Default', 'Preferences');
  if (!fs.existsSync(prefsPath)) return null;
  let prefs;
  try {
    prefs = readJson(prefsPath);
  } catch {
    return null;
  }
  const settings = prefs?.extensions?.settings;
  if (!settings || typeof settings !== 'object') return null;

  const want = normPath(extensionDir);
  for (const [id, cfg] of Object.entries(settings)) {
    if (!/^[a-p]{32}$/i.test(id)) continue;
    const p = cfg?.path ? normPath(cfg.path) : '';
    const name = cfg?.manifest?.name || cfg?.manifest?.short_name || '';
    if ((p && p === want) || (name && name === expectedName)) {
      return id;
    }
  }
  return null;
}

async function tryFindExtensionIdViaCDP(context) {
  // CDP sees targets even when Playwright hasn’t surfaced a service worker yet.
  try {
    const page = context.pages()[0] || await context.newPage();
    const cdp = await context.newCDPSession(page);
    const res = await cdp.send('Target.getTargets');
    const infos = res?.targetInfos || [];
    for (const t of infos) {
      const u = t?.url || '';
      const m = u.match(/^chrome-extension:\/\/([a-p]{32})\//i);
      if (m) return m[1];
    }
  } catch {
    // ignore
  }
  return null;
}

async function getExtensionId(context, { profileDir, extensionDir, expectedName }, timeoutMs = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // First try service worker (fast path).
    const swId = await (async () => {
      const workers = context.serviceWorkers();
      for (const w of workers) {
        const u = w.url();
        const m = u.match(/^chrome-extension:\/\/([a-p]{32})\//i);
        if (m) return m[1];
      }
      return null;
    })();
    if (swId) return swId;

    // CDP fallback (often the most reliable for MV3).
    const cdpId = await tryFindExtensionIdViaCDP(context);
    if (cdpId) return cdpId;

    // Fallback: unpacked extensions usually appear in Default/Preferences with a "path".
    const prefId = tryFindExtensionIdInPreferences(profileDir, extensionDir, expectedName);
    if (prefId) return prefId;

    // Fallback: find installed extension folder on disk.
    const diskId = tryFindExtensionIdOnDisk(profileDir, expectedName);
    if (diskId) return diskId;

    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Timed out finding extension ID (service worker + Preferences + disk scan). Is the extension loading?');
}

async function seedDemoData(page) {
  const demoStreams = [
    { username: 'northernlion', priority: 1 },
    { username: 'ludwig', priority: 2 },
    { username: 'pokimane', priority: 3 },
    { username: 'shroud', priority: 4 },
    { username: 'eslcs', priority: 5 },
  ];

  const demoSettings = {
    checkInterval: 60000,
    fallbackCategory: 'Just Chatting',
    fallbackEnabled: true,
    redirectEnabled: false,
    promptBeforeSwitch: false,
    notificationsEnabled: true,
    theme: 'dark',
    premiumStatus: true,
    managedTwitchTabId: null,
  };

  await page.evaluate(async ({ streams, settings }) => {
    // Ensure we’re in an extension page context.
    if (!globalThis.chrome?.storage?.local) {
      throw new Error('chrome.storage.local not available (not an extension page?)');
    }
    await chrome.storage.local.set({ streams, settings });
  }, { streams: demoStreams, settings: demoSettings });
}

async function screenshotPage(page, outPath, { jpeg }) {
  ensureDir(path.dirname(outPath));
  await page.waitForLoadState('domcontentloaded');
  // Let UI settle (CSS, async storage loads)
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);

  if (jpeg) {
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 92 });
  } else {
    await page.screenshot({ path: outPath, type: 'png' });
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const outDir = path.resolve(repoRoot, args.outDir || 'assets/webstore/screenshots');
  const jpeg = !!args.jpeg;

  const profileDir = path.resolve(repoRoot, '.tmp-store-screenshots-profile');
  ensureDir(profileDir);

  const extensionDir = repoRoot; // manifest.json lives at repo root
  const expectedName = readJson(path.join(extensionDir, 'manifest.json')).name || 'Twitch Stream Swapper';

  const launchOpts = {
    headless: !!args.headless, // extensions usually require headful; keep false unless you know it works
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--window-size=1280,800',
    ],
  };

  // Prefer Playwright-managed Chromium for reliability.
  // If you *want* to use installed Chrome, set TSR_USE_SYSTEM_CHROME=1.
  let context;
  try {
    if (process.env.TSR_USE_SYSTEM_CHROME === '1') {
      context = await chromium.launchPersistentContext(profileDir, { ...launchOpts, channel: 'chrome' });
    } else {
      throw new Error('skip system chrome');
    }
  } catch {
    context = await chromium.launchPersistentContext(profileDir, launchOpts);
  }

  try {
    const extId = await getExtensionId(context, { profileDir, extensionDir, expectedName });
    const base = `chrome-extension://${extId}`;
    const ext = (p) => `${base}/${p.replace(/^\//, '')}`;

    // Use options page as our seed/driver page.
    const options = await context.newPage();
    await options.goto(ext('options.html'), { waitUntil: 'domcontentloaded' });
    await seedDemoData(options);
    // Refresh so the UI renders seeded state cleanly.
    await options.reload({ waitUntil: 'domcontentloaded' });

    // Screenshot 1: options (top)
    const extType = jpeg ? 'jpg' : 'png';
    await screenshotPage(options, path.join(outDir, `01-options-top-1280x800.${extType}`), { jpeg });

    // Screenshot 2: options scrolled to supporter/theme section
    await options.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.35));
    await options.waitForTimeout(300);
    await screenshotPage(options, path.join(outDir, `02-options-supporter-1280x800.${extType}`), { jpeg });

    // Screenshot 3: popup
    const popup = await context.newPage();
    await popup.goto(ext('popup.html'), { waitUntil: 'domcontentloaded' });
    await popup.waitForTimeout(600);
    // Show help panel for one screenshot (looks good + explains UX)
    await popup.click('#helpBtn').catch(() => {});
    await popup.waitForTimeout(250);
    await screenshotPage(popup, path.join(outDir, `03-popup-help-1280x800.${extType}`), { jpeg });

    // Screenshot 4: popup main (no help overlay)
    await popup.keyboard.press('Escape').catch(() => {});
    await popup.waitForTimeout(250);
    await screenshotPage(popup, path.join(outDir, `04-popup-main-1280x800.${extType}`), { jpeg });

    console.log(`\nSaved screenshots to: ${outDir}\n`);
    console.log(`Extension ID used for capture (unpacked): ${extId}`);
  } finally {
    await context.close();
  }
}

run().catch((err) => {
  console.error(err);
  console.error(usage());
  process.exit(1);
});


