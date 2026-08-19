# Popup + Options Redesign — Design Spec

Date: 2026-08-18
Status: approved by owner (chat), pending spec review

## Context

The extension's popup (149-line HTML, 709-line CSS) and options page (282/518)
work but read as homemade: emoji icon buttons, hardcoded hex colors partially
duplicated by a bolt-on theme system, inconsistent spacing and states. Base CSS
hardcodes Twitch-ish grays while `themes/dark.css` and `themes/neon.css` define
`--vars` the base only partially consumes.

## Goals

- Twitch-native visual identity with a point of view: violet-cast dark, not a
  flat Twitch clone.
- Token-first architecture: one CSS-variable contract every surface consumes;
  themes and the existing custom-theme picker become pure token overrides.
- Restructured popup with the priority queue as the visual centerpiece.
- Zero behavior change: all JS element IDs and JS-consumed class hooks preserved;
  `popup.js` / `options.js` untouched.

## Non-goals

- No new features, no JS logic changes.
- No extension icon or store-listing asset changes this round.
- No webfont bundling.

## Architecture

| File | Role |
|---|---|
| `themes/tokens.css` (new) | Single token source. `:root` defines the full contract with default (Twitch-native violet-dark) values. Loaded first by both pages. |
| `popup.css` (rewrite) | Consumes tokens only. No raw hex/size literals outside `tokens.css`. |
| `options.css` (rewrite) | Same rule. |
| `themes/dark.css`, `themes/neon.css` (shrink) | Token overrides only — `:root { --token: value; }` blocks. Neon's extra component rules (gradient button, glow dot) are re-expressed as token values or dropped if impossible. |
| Custom themes (options picker) | Writes the same token names. Contract documented in a comment header inside `tokens.css`. |
| Icons | Inline SVG in `popup.html` / `options.html`, `currentColor` fill, 16px grid. Replaces emoji: ☕→heart/coffee, ?→help circle, ⚙️→gear, ↩→return arrow, 🎲→dice, ✓→check, ⭐→star chip. |

## Token contract

Colors:

- `--surface-0: #0C0B10` (page), `--surface-1: #16141C` (card),
  `--surface-2: #201D28` (raised/hover)
- `--border: #2B2734`, `--border-strong: #3A3547`
- `--text: #EFEFF4`, `--text-muted: #A9A5B8`, `--text-dim: #6F6A80`
- `--accent: #9146FF`, `--accent-hover: #A970FF` (hover lifts, never darkens),
  `--on-accent: #FFFFFF`
- `--live: #EB0400` — reserved exclusively for live status (dot, LIVE chip)
- `--success: #00C767`, `--danger: #F23A3A`, `--warning: #FFB31A`

Geometry and type:

- `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px`
- `--space-1..6`: 4 / 8 / 12 / 16 / 20 / 24px
- `--font-ui`: system sans stack (`system-ui, "Segoe UI", Roboto, sans-serif`)
- `--font-data`: `ui-monospace, "Cascadia Mono", Consolas, monospace` — ranks,
  stream count, interval numbers, anything numeric
- Sizes: `--text-xs: 11px`, `--text-sm: 12px`, `--text-md: 13px`, `--text-lg: 15px`
- Wordmark treatment (component-level, not a token): bold, uppercase,
  `letter-spacing: 0.08em`, condensed feel via `font-stretch` where supported

## Popup structure

Order top to bottom (existing IDs in parentheses stay intact):

1. **Header** — wordmark "STREAM SWAPPER"; right: three ghost SVG icon buttons
   (`supportBtn`, `helpBtn`, `settingsBtn`).
2. **Status toast** (`statusMessage`) — semantic-colored card, hidden when empty.
3. **Behavior card** — merges the two old bars. Row 1: "Auto-Swap" +
   subtitle "Watches your highest-priority live channel" + ghost return-arrow
   (`goManagedTabBtn`) + switch (`autoSwapToggle`). Row 2: "Stay on raids" +
   subtitle + switch (`stayOnRaid`). The old ON/OFF text pill
   (`autoSwapStatus`) remains in DOM for JS but is visually hidden; switch
   color carries state.
4. **Queue** — fused input group (`streamInput` + `addStreamBtn`, button
   labeled "Add channel"); list (`streamList`) rows:
   `[mono rank] [drag handle] [name] [status]`. **Signature:** the
   currently-watched row swaps its rank for a pulsing LIVE chip and gets a
   violet left-edge glow, driven by an `is-current` class on the row.
   `popup.js` has no such hook today (verified: rows are uniform
   `stream-item`; current stream renders only into the `currentStream`
   banner), so this is the one JS carve-out — see Constraints.
   `currentStream` banner div stays in DOM for JS writes; CSS hides the
   old banner shell.
5. **Category Fallback card** (`categoryFallbackWidget`) — same structure,
   dice/check/gear SVGs, `fallbackCategoryInput` + datalist untouched.
6. **Footer** — `streamCount` in mono left; `premiumBadge` as accent-outline
   chip "★ Supporter" right.
7. **Help tooltip** (`helpTooltip`) — card restyle, pills become SVG/number
   chips, copy updated (below).

## Options page

Same tokens and card language. Each existing settings section becomes a card
with an eyebrow label (no numbering — settings are not a sequence). Controls
(switches, inputs, selects, buttons) share the popup's component styles.
Structural HTML changes limited to wrappers/classes; all IDs preserved.

## Copy

- Auto-Swap subtitle: "Watches your highest-priority live channel"
- Empty state: "Add a channel to build your queue." / hint: "Drag to set priority."
- Add button: "Add channel"
- Errors state what happened and the fix, no apologies. Sentence case everywhere.

## States and motion

- `:focus-visible`: 2px accent ring, all interactive elements.
- Hover: surface steps up one level (`--surface-2`), accent elements lift to
  `--accent-hover`.
- Disabled: 40% opacity, `pointer-events: none`.
- Motion budget: live-dot/LIVE-chip pulse + switch sweep only. Both wrapped in
  `@media (prefers-reduced-motion: reduce)` kill switch.

## Theme contract

`tokens.css` header comment lists every themable token. `dark.css` (deeper
neutral black set) and `neon.css` (cyan-on-violet set) override tokens only.
Custom theme picker continues writing the same variable names — the picker UI
and storage code are not modified.

## Constraints (JS safety)

- No behavior or logic changes in `popup.js` / `options.js`, with exactly one
  presentational carve-out: where `popup.js` updates the current stream
  (`currentInfo` write site), add a class toggle that sets `is-current` on the
  matching `.stream-item` and removes it from the rest (≤ 5 lines). No other
  JS edits.
- Before commit, diff every `getElementById` / `querySelector` in `popup.js`
  and `options.js` against the new markup; all referenced IDs and class hooks
  must resolve. This is part of the test gate.

## Test gate

1. `npm run lint` and `npm run test` pass (CI gate).
2. Extension loads unpacked; popup and options render under default, dark, and
   neon themes — screenshot check of each.
3. ID/class audit from Constraints passes.
4. Toggles, add/remove/drag, fallback apply, help tooltip, and theme switching
   verified by hand in the loaded extension.
