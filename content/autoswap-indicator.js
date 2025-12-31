/**
 * Twitch page indicator for Auto-Swap mode.
 * Runs on twitch.tv pages and shows a small pill when Auto-Swap is enabled.
 */

const INDICATOR_ID = 'tsr-autoswap-indicator';

function ensureStyles() {
  if (document.getElementById('tsr-autoswap-style')) return;
  const style = document.createElement('style');
  style.id = 'tsr-autoswap-style';
  style.textContent = `
    #${INDICATOR_ID} {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      display: none;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 999px;
      background: rgba(15, 15, 20, 0.75);
      border: 1px solid rgba(0, 220, 130, 0.55);
      color: #e7fff4;
      backdrop-filter: blur(10px);
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    }
    #${INDICATOR_ID} .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #00dc82;
      box-shadow: 0 0 0 4px rgba(0, 220, 130, 0.15);
    }
    #${INDICATOR_ID} .title {
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    #${INDICATOR_ID} .target {
      font-size: 12px;
      opacity: 0.9;
      max-width: 240px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;
  document.documentElement.appendChild(style);
}

function ensureIndicator() {
  ensureStyles();
  let el = document.getElementById(INDICATOR_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = INDICATOR_ID;
  el.innerHTML = `
    <span class="dot"></span>
    <span class="title">Auto-Swap ON</span>
    <span class="target" id="tsr-autoswap-target"></span>
  `;
  document.documentElement.appendChild(el);
  return el;
}

function pickTargetStream(streams) {
  if (!Array.isArray(streams) || streams.length === 0) return null;
  const sorted = [...streams].sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));
  const live = sorted.find(s => s?.isLive);
  return live || sorted[0] || null;
}

async function refresh() {
  const el = ensureIndicator();
  const targetEl = document.getElementById('tsr-autoswap-target');

  const { settings, streams } = await chrome.storage.local.get(['settings', 'streams']);
  const enabled = !!settings?.redirectEnabled;
  const managedTabId = settings?.managedTwitchTabId ?? null;

  // Only show on the managed tab (so other Twitch tabs stay "normal")
  let myTabId = null;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'TSR_GET_TAB_ID' });
    myTabId = resp?.tabId ?? null;
  } catch {
    myTabId = null;
  }

  if (!enabled || !managedTabId || !myTabId || managedTabId !== myTabId) {
    el.style.display = 'none';
    return;
  }

  const target = pickTargetStream(streams);
  if (targetEl) {
    if (!target?.username) {
      targetEl.textContent = '';
    } else if (target?.isLive) {
      targetEl.textContent = `Target (LIVE): ${target.username}`;
    } else {
      targetEl.textContent = `Target (waiting): ${target.username}`;
    }
  }
  el.style.display = 'flex';
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings || changes.streams) {
    refresh().catch(() => {});
  }
});

refresh().catch(() => {});


