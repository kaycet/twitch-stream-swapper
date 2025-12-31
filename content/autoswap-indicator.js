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
    #${INDICATOR_ID}[data-mode="fallback"] {
      border-color: rgba(145, 71, 255, 0.6);
      color: #f3ecff;
    }
    #${INDICATOR_ID}[data-mode="fallback"] .dot {
      background: #9147ff;
      box-shadow: 0 0 0 4px rgba(145, 71, 255, 0.18);
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
    #${INDICATOR_ID} .btn {
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08);
      color: inherit;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 999px;
      cursor: pointer;
      line-height: 1;
    }
    #${INDICATOR_ID}[data-mode="fallback"] .btn {
      border-color: rgba(145, 71, 255, 0.6);
      background: rgba(145, 71, 255, 0.18);
    }
    #${INDICATOR_ID} .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
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
    <button class="btn" id="tsr-fallback-reroll" style="display:none;" title="Pick a new random stream from the fallback category">New random</button>
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
  const titleEl = el.querySelector('.title');
  const rerollBtn = document.getElementById('tsr-fallback-reroll');

  const { settings, streams, runtime } = await chrome.storage.local.get(['settings', 'streams', 'runtime']);
  const enabled = !!settings?.redirectEnabled;
  const managedTabId = settings?.managedTwitchTabId ?? null;
  const fallbackActive = !!runtime?.fallback?.active;
  const fallbackCategory = runtime?.fallback?.category || settings?.fallbackCategory || '';

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

  // Mode styling + fallback reroll button
  if (fallbackActive) {
    el.dataset.mode = 'fallback';
    if (titleEl) titleEl.textContent = 'Category Fallback';
    if (rerollBtn) rerollBtn.style.display = 'inline-flex';
  } else {
    el.dataset.mode = 'normal';
    if (titleEl) titleEl.textContent = 'Auto-Swap ON';
    if (rerollBtn) rerollBtn.style.display = 'none';
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

  if (fallbackActive && targetEl && fallbackCategory) {
    // Append a short hint without getting too verbose.
    targetEl.textContent = `${targetEl.textContent} — 🎲 ${fallbackCategory}`;
  }

  if (rerollBtn && !rerollBtn.dataset.bound) {
    rerollBtn.dataset.bound = '1';
    rerollBtn.addEventListener('click', async () => {
      rerollBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ type: 'TSR_FALLBACK_REROLL' });
      } catch {
        // Non-fatal; user can click again.
      } finally {
        setTimeout(() => {
          rerollBtn.disabled = false;
        }, 1200);
      }
    });
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


