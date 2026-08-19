# Popup + Options Token-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild popup + options visuals on a single CSS token contract with a Twitch-native violet-dark identity, per `docs/superpowers/specs/2026-08-18-popup-options-redesign-design.md`.

**Architecture:** New `themes/tokens.css` is the only place colors/sizes live; `popup.css` and `options.css` are rewritten to consume tokens; `dark.css`/`neon.css` become token overrides. Markup is restructured (IDs preserved) with inline SVGs replacing emoji. One 5-line JS carve-out adds an `is-current` row class.

**Tech Stack:** Vanilla HTML/CSS, MV3 extension, vitest + eslint (JS only — CSS gates are grep-based).

## Global Constraints

- Every JS-referenced element ID and class hook must survive. Audit script (Task 1) must pass after every markup/CSS task.
- No raw hex colors outside `themes/tokens.css` (gate: grep in Tasks 4, 7, 8).
- Only JS edit allowed: `is-current` row toggle in `popup.js` (Task 5), ≤5 lines.
- `--live` used only for live-status dot/chip. Hover states lighten (`--accent-hover: #A970FF`), never darken.
- All copy sentence case; strings exactly as written in spec Copy section.
- Motion only: live pulse + switch sweep, both inside `@media (prefers-reduced-motion: no-preference)`.
- `npm run lint` and `npm test` green at every commit.
- Commits on branch `design/popup-options-redesign`, conventional format.

---

### Task 1: DOM-hook audit script

**Files:**
- Create: `tools/audit-dom-hooks.mjs`
- Modify: `package.json` (add script)

**Interfaces:**
- Produces: `npm run audit:dom` — exits 0 when every ID from `getElementById('x')` / `querySelector('#x')` in `popup.js` appears in `popup.html` (same for `options.*`); exits 1 listing missing IDs.

- [ ] **Step 1: Write the script**

```js
// tools/audit-dom-hooks.mjs
import { readFileSync } from 'node:fs';

const pairs = [
  ['popup.js', 'popup.html'],
  ['options.js', 'options.html'],
];

let failed = false;
for (const [jsFile, htmlFile] of pairs) {
  const js = readFileSync(jsFile, 'utf8');
  const html = readFileSync(htmlFile, 'utf8');
  const ids = new Set(
    [...js.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)].map(m => m[1])
      .concat([...js.matchAll(/querySelector(?:All)?\(\s*['"]#([A-Za-z0-9_-]+)['"]/g)].map(m => m[1])),
  );
  const missing = [...ids].filter(id => !html.includes(`id="${id}"`));
  if (missing.length > 0) {
    console.error(`${htmlFile} missing IDs used by ${jsFile}:`, missing.join(', '));
    failed = true;
  } else {
    console.log(`${htmlFile}: all ${ids.size} JS-referenced IDs present`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Add npm script**

In `package.json` `"scripts"`, add:

```json
"audit:dom": "node tools/audit-dom-hooks.mjs"
```

- [ ] **Step 3: Run against current (unmodified) files — must pass**

Run: `npm run audit:dom`
Expected: both lines "all N JS-referenced IDs present", exit 0.

- [ ] **Step 4: Prove it fails on breakage**

Temporarily rename `id="streamInput"` to `id="streamInputX"` in `popup.html`, run `npm run audit:dom`, expect exit 1 naming `streamInput`. Revert the rename. Run again, expect pass.

- [ ] **Step 5: Commit**

```bash
git add tools/audit-dom-hooks.mjs package.json
git commit -m "test: add DOM hook audit script for redesign safety"
```

### Task 2: Token contract file

**Files:**
- Create: `themes/tokens.css`
- Modify: `popup.html` (head), `options.html` (head)

**Interfaces:**
- Produces: the CSS custom properties below, loaded before `popup.css`/`options.css` on both pages. Later tasks reference these exact names.

- [ ] **Step 1: Create `themes/tokens.css` with exactly this content**

```css
/*
 * Token contract — the ONLY place raw colors/sizes live.
 * Theme files (dark.css, neon.css) and the custom-theme picker override
 * these same names. Themable tokens: everything in this :root block.
 */
:root {
  /* Surfaces (violet-cast ink) */
  --surface-0: #0c0b10;
  --surface-1: #16141c;
  --surface-2: #201d28;
  --border: #2b2734;
  --border-strong: #3a3547;

  /* Text */
  --text: #efeff4;
  --text-muted: #a9a5b8;
  --text-dim: #6f6a80;

  /* Accent */
  --accent: #9146ff;
  --accent-hover: #a970ff;
  --on-accent: #ffffff;

  /* Semantic */
  --live: #eb0400;
  --success: #00c767;
  --danger: #f23a3a;
  --warning: #ffb31a;

  /* Geometry */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;

  /* Type */
  --font-ui: system-ui, "Segoe UI", Roboto, sans-serif;
  --font-data: ui-monospace, "Cascadia Mono", Consolas, monospace;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-md: 13px;
  --text-lg: 15px;
}
```

- [ ] **Step 2: Wire into both pages**

In `popup.html` and `options.html` `<head>`, immediately BEFORE the existing stylesheet link, add:

```html
<link rel="stylesheet" href="themes/tokens.css">
```

(Existing theme `<link>` injection by JS stays untouched — themes load after and override.)

- [ ] **Step 3: Verify gates**

Run: `npm run audit:dom && npm run lint && npm test`
Expected: all pass (markup IDs unchanged).

- [ ] **Step 4: Commit**

```bash
git add themes/tokens.css popup.html options.html
git commit -m "feat: add token contract stylesheet"
```

### Task 3: Popup markup restructure + SVG icons

**Files:**
- Modify: `popup.html`

**Interfaces:**
- Consumes: token link from Task 2.
- Produces: class names `.app`, `.app-header`, `.wordmark`, `.icon-btn`, `.behavior-card`, `.behavior-row`, `.row-text`, `.row-title`, `.row-sub`, `.queue`, `.queue-add`, `.stream-item` (existing, kept), `.rank`, `.fallback-card`, `.app-footer`, `.chip` — Task 4's CSS targets exactly these.

- [ ] **Step 1: Restructure `popup.html` body**

Rules (all existing `id="..."` attributes preserved verbatim, including
`autoSwapStatus`, `currentStream`, `currentInfo`, `emptyState`, `helpTooltip`):

Header becomes:

```html
<header class="app-header">
  <h1 class="wordmark">Stream Swapper</h1>
  <div class="header-actions">
    <button id="supportBtn" class="icon-btn" title="Support on Ko-fi" aria-label="Support on Ko-fi">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 13.5C5 11 2 8.8 2 6a3 3 0 0 1 6-.5A3 3 0 0 1 14 6c0 2.8-3 5-6 7.5Z"/></svg>
    </button>
    <button id="helpBtn" class="icon-btn" title="How to use" aria-label="How to use">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M6.2 6.2a1.8 1.8 0 1 1 2.6 1.7c-.5.3-.8.6-.8 1.2"/><circle cx="8" cy="11.2" r=".4" fill="currentColor"/></svg>
    </button>
    <button id="settingsBtn" class="icon-btn" title="Settings" aria-label="Settings">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2"/></svg>
    </button>
  </div>
</header>
```

The two toggle bars (`autoswap-bar`, `autoswap-extra`) merge into:

```html
<section class="behavior-card">
  <div class="behavior-row">
    <div class="row-text">
      <div class="row-title">Auto-Swap</div>
      <div class="row-sub">Watches your highest-priority live channel</div>
    </div>
    <button id="goManagedTabBtn" class="icon-btn" title="Jump to the managed Twitch tab" aria-label="Jump to the managed Twitch tab" style="display:none;">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M13 4v3a3 3 0 0 1-3 3H3.5M6 7l-3 3 3 3"/></svg>
    </button>
    <label class="switch" title="Toggle Auto-Swap">
      <input type="checkbox" id="autoSwapToggle">
      <span class="slider"></span>
    </label>
    <span id="autoSwapStatus" class="autoswap-status off visually-hidden">OFF</span>
  </div>
  <div class="behavior-row">
    <div class="row-text">
      <div class="row-title">Stay on raids</div>
      <div class="row-sub">Keeps watching a raid instead of switching away</div>
    </div>
    <label class="switch" title="Stay on raids">
      <input type="checkbox" id="stayOnRaid">
      <span class="slider"></span>
    </label>
  </div>
</section>
```

Queue area: keep `add-stream-section` ids, relabel button, wrap in `.queue`;
button text becomes `Add channel`. Empty-state copy becomes:

```html
<div class="empty-state" id="emptyState">
  <p>Add a channel to build your queue.</p>
  <p class="hint">Drag to set priority.</p>
</div>
```

`currentStream` block keeps its ids, gains class `visually-hidden-shell`
(Task 4 hides it). Category fallback: replace 🎲 span with the dice SVG,
✓ button content with check SVG, ⚙️ with the gear SVG (same as header gear):

```html
<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5"/><circle cx="5.5" cy="5.5" r=".9" fill="currentColor"/><circle cx="10.5" cy="10.5" r=".9" fill="currentColor"/><circle cx="10.5" cy="5.5" r=".9" fill="currentColor"/><circle cx="5.5" cy="10.5" r=".9" fill="currentColor"/></svg>
```

```html
<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>
```

Footer: `premiumBadge` becomes `<div class="chip" id="premiumBadge" style="display:none;">★ Supporter</div>`; `streamCount` unchanged id.
Help tooltip: keep ids/structure; replace emoji pills with the matching SVGs
or plain numbers; update step copy to say "Add channel" instead of "Add".

- [ ] **Step 2: Gates**

Run: `npm run audit:dom && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "feat: restructure popup markup with inline SVG icons"
```

### Task 4: Popup stylesheet rewrite

**Files:**
- Rewrite: `popup.css`

**Interfaces:**
- Consumes: tokens (Task 2), class names (Task 3), plus JS-driven classes that MUST keep working: `.stream-item`, `.dragging`, `.dragging-active`, `.drag-over`, `.drag-over-top`, `.drag-over-bottom`, `.drag-target`, `.drag-ghost`, `.status-message.show.{success|error|info}`, `.empty-state`, `.is-current` (styled here, toggled in Task 5).
- Produces: `.visually-hidden`, `.visually-hidden-shell` utilities.

- [ ] **Step 1: Rewrite `popup.css` from scratch on tokens**

Full replacement. Structure of the new file (write real CSS for each block,
no hex anywhere — `var(--...)` only):

1. Base: `body { width: 360px; font: var(--text-md)/1.45 var(--font-ui); background: var(--surface-0); color: var(--text); }`
2. `.visually-hidden` (clip pattern) and `.visually-hidden-shell { display: none !important; }`
3. Header: wordmark `text-transform: uppercase; letter-spacing: .08em; font-weight: 700; font-size: var(--text-lg);` icon buttons: 28px square, ghost — transparent bg, `color: var(--text-muted)`, hover `background: var(--surface-2); color: var(--text)`, `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }`
4. Cards (`.behavior-card`, `.fallback-card`, `.help-content`): `background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius-lg);` rows divided by `border-top: 1px solid var(--border)`.
5. Switch: track 34×18, `border-radius: 999px`, off `background: var(--border-strong)`, checked `background: var(--accent)`, knob 14px `--on-accent`, transition `transform .18s ease` (wrapped in reduced-motion guard).
6. Queue: fused input group — input flex-1 `background: var(--surface-1); border: 1px solid var(--border); border-right: 0; border-radius: var(--radius-md) 0 0 var(--radius-md);` button `.btn-primary` `background: var(--accent); color: var(--on-accent); border-radius: 0 var(--radius-md) var(--radius-md) 0;` hover `background: var(--accent-hover)`.
7. Rows `.stream-item`: grid `auto auto 1fr auto`, `.rank { font: var(--text-xs) var(--font-data); color: var(--text-dim); min-width: 2ch; }`, live dot `background: var(--live)`.
8. Signature `.stream-item.is-current`: `border-left: 2px solid var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%);` rank element swaps to LIVE chip styling `color: var(--live); font-weight: 700;` pulse animation on the dot only.
9. Drag states: `.dragging { opacity: .5 }`, `.drag-over-top { box-shadow: inset 0 2px 0 var(--accent) }`, `.drag-over-bottom { box-shadow: inset 0 -2px 0 var(--accent) }`, `.drag-target { background: var(--surface-2) }`, `.drag-ghost` matches old positioning behavior (copy positioning rules from the old file, tokenize colors).
10. Status message: `.status-message.show` visible card; `.success { border-color: var(--success) }` etc. for `error`→`--danger`, `info`→`--accent`.
11. Footer: `#streamCount { font-family: var(--font-data); color: var(--text-dim); }` `.chip { border: 1px solid var(--accent); color: var(--accent); border-radius: 999px; padding: 2px var(--space-2); font-size: var(--text-xs); }`
12. Motion block:

```css
@media (prefers-reduced-motion: no-preference) {
  .stream-item.is-current .status-indicator { animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .45; } }
}
```

Before writing, read the OLD `popup.css` once and port every selector the JS
relies on (list above) plus help-tooltip positioning; drop everything purely
decorative.

- [ ] **Step 2: Gates**

Run: `npm run audit:dom && npm run lint && npm test`
Then: `grep -E '#[0-9a-fA-F]{3,8}\b' popup.css` — Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add popup.css
git commit -m "feat: rewrite popup styles on token contract"
```

### Task 5: `is-current` JS carve-out

**Files:**
- Modify: `popup.js` (the site that writes `currentInfo`)

**Interfaces:**
- Consumes: `.is-current` styling (Task 4).
- Produces: `is-current` class on the `.stream-item` whose channel matches the currently watched stream; removed from all others.

- [ ] **Step 1: Locate the update site**

Run: `grep -n "currentInfo" popup.js` — find where current stream text is set
(and where it's cleared/hidden).

- [ ] **Step 2: Add the toggle (≤5 lines)**

At that site, with `name` = current channel login used in the row dataset/text:

```js
document.querySelectorAll('.stream-item').forEach((el) => {
  el.classList.toggle('is-current',
    el.dataset.username === name || el.textContent.includes(name));
});
```

Prefer `el.dataset.username` if rows carry it (check `item.className = 'stream-item'` construction site around popup.js:604 and use whatever per-row identifier exists there); fall back to text match only if no dataset exists. Clear path: when current stream is cleared, run the same loop with `false`.

- [ ] **Step 3: Gates**

Run: `npm run lint && npm test && npm run audit:dom`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: mark currently watched row with is-current class"
```

### Task 6: Options markup restructure

**Files:**
- Modify: `options.html`

**Interfaces:**
- Consumes: tokens link (Task 2).
- Produces: `.settings-card`, `.eyebrow` classes; existing `.settings-section`, `.setting-item`, `.premium-feature` class names KEPT on the same elements (options.js and options.css hooks), cards added as wrappers/renames per step.

- [ ] **Step 1: Restructure**

- `<h1>⚙️ Settings</h1>` → `<h1 class="wordmark">Settings</h1>` (no emoji).
- Each `section.settings-section` gains class `settings-card`; its `h2` text
  becomes an `.eyebrow` label (strip emoji from headings: "💝 Support the
  Developer" → "Support the developer").
- Replace every emoji glyph in headings/buttons with the matching inline SVGs
  from Task 3 (gear, heart, star, dice, check) — same markup, 16px.
- ALL `id` attributes and existing classes stay (audit enforces ids;
  `premium-feature`, `customThemeSection`, `analyticsSection` etc. untouched).
- Inline `style=` display toggles stay exactly as-is (JS flips them).

- [ ] **Step 2: Gates**

Run: `npm run audit:dom && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add options.html
git commit -m "feat: restructure options markup into cards"
```

### Task 7: Options stylesheet rewrite

**Files:**
- Rewrite: `options.css`

**Interfaces:**
- Consumes: tokens, `.settings-card`/`.eyebrow` (Task 6), existing JS-driven hooks in options.js (read `grep -nE "classList|className" options.js` output first and preserve every class it toggles).

- [ ] **Step 1: Rewrite on tokens**

Same component language as Task 4 (copy the switch, input, button, chip,
focus-visible, card, and `.wordmark` recipes verbatim from the new
`popup.css` — duplication
between the two files is accepted; a shared components file is YAGNI until a
third page exists). Page frame: centered column `max-width: 640px`,
`background: var(--surface-0)`. `.eyebrow { font-size: var(--text-xs);
text-transform: uppercase; letter-spacing: .1em; color: var(--text-dim); }`
Success/error/danger buttons and states map to semantic tokens
(old `#0e7c0e`→`--success`, `#e91916`→`--danger`).

- [ ] **Step 2: Gates**

Run: `npm run audit:dom && npm run lint && npm test`
Then: `grep -E '#[0-9a-fA-F]{3,8}\b' options.css` — Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add options.css
git commit -m "feat: rewrite options styles on token contract"
```

### Task 8: Theme files become token overrides

**Files:**
- Rewrite: `themes/dark.css`, `themes/neon.css`

**Interfaces:**
- Consumes: token names from Task 2 (must override those exact names — the old `--bg/--panel/--purple-accent` names are dead).

- [ ] **Step 1: Rewrite `themes/dark.css`**

```css
/* Dark theme (supporter) — deeper neutral black overrides */
:root {
  --surface-0: #0a0a0a;
  --surface-1: #101012;
  --surface-2: #17171a;
  --border: #232327;
  --border-strong: #33333a;
  --text: #e9e9ee;
  --text-muted: #b4b4c0;
  --text-dim: #77777f;
}
```

- [ ] **Step 2: Rewrite `themes/neon.css`**

```css
/* Neon theme (supporter) — cyan on violet overrides */
:root {
  --surface-0: #0a0520;
  --surface-1: #0f0630;
  --surface-2: #150a3a;
  --border: #9146ff;
  --border-strong: #a970ff;
  --text: #00ffff;
  --text-muted: rgba(0, 255, 255, 0.75);
  --text-dim: rgba(0, 255, 255, 0.5);
  --accent: #00ffff;
  --accent-hover: #62ffff;
  --on-accent: #0a0520;
  --live: #ff2e88;
}
```

(Old neon component rules — gradient button, glow shadows — are dropped:
re-expressed via `--accent`/`--live` overrides per spec.)

- [ ] **Step 3: Check the custom-theme picker writes token names**

Run: `grep -nE '"--[a-z-]+"|--bg|--panel|--purple-accent' options.js popup.js`
If the picker writes OLD names (`--bg`, `--panel`, `--purple-accent`…), map
them in `options.js` ONLY if it's a pure data table (string list) — that is a
data edit, not logic. If the names live in logic, STOP and surface to the
owner before proceeding.

- [ ] **Step 4: Gates**

Run: `npm run audit:dom && npm run lint && npm test`
Then: `grep -E '#[0-9a-fA-F]{3,8}\b' themes/dark.css themes/neon.css` —
Expected: matches ONLY inside `:root` override blocks.

- [ ] **Step 5: Commit**

```bash
git add themes/dark.css themes/neon.css options.js
git commit -m "feat: reduce themes to token overrides"
```

### Task 9: Visual verification + copy audit

**Files:**
- None created (screenshots to scratchpad only).

- [ ] **Step 1: Render both pages**

Open `popup.html` and `options.html` directly in a browser (chrome.* APIs
will error in console — layout still renders). Screenshot each at default
theme; then temporarily append `<link rel="stylesheet" href="themes/dark.css">`
and `themes/neon.css` in turn, screenshot, and REMOVE the temporary links.

- [ ] **Step 2: Check against spec**

- Signature row treatment visible (manually add `is-current` class in
  devtools to a row).
- Focus ring on every interactive element via keyboard Tab.
- No layout breakage at 360px popup width.
- Copy matches spec strings exactly.

- [ ] **Step 3: Fix anything found, re-run all gates, commit fixes**

```bash
git add -A
git commit -m "fix: visual polish from screenshot review"
```

### Task 10: Final review + PR

- [ ] **Step 1: Full gate suite**

Run: `npm run lint && npm test && npm run audit:dom && grep -rE '#[0-9a-fA-F]{3,8}\b' popup.css options.css || echo CLEAN`

- [ ] **Step 2: Push branch + open PR**

```bash
git push -u origin design/popup-options-redesign
gh pr create --title "feat: token-first Twitch-native redesign of popup + options" --body "Implements docs/superpowers/specs/2026-08-18-popup-options-redesign-design.md"
```

Owner merges after eyeballing screenshots.
