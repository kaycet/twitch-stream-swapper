# Live Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec `2026-08-18-live-awareness-design.md` — un-gated per-channel notifications, live-count badge, rich queue rows, quiet hours — as v1.3.0.

**Architecture:** Two new pure util modules (TDD), surgical edits to background.js gate/badge, popup.js row render + bell toggle, options page quiet-hours UI. No new permissions.

**Tech Stack:** Vanilla JS MV3, vitest, eslint.

## Global Constraints

- Gates at every commit: `npm run lint && npx vitest run && npm run audit:dom`.
- Element IDs preserved; new options inputs get ids `quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd`.
- Branch `feat/live-awareness`, conventional commits.

---

### Task 1: `utils/quiet-hours.js` (TDD)

- [ ] Write `tests/quiet-hours.test.js`: disabled config false; null/malformed false; same-day window (09:00–17:00: 12:00 true, 08:59 false, 09:00 true, 17:00 false); overnight (22:00–08:00: 23:00 true, 03:00 true, 12:00 false); start===end always false.
- [ ] Run — fails (module missing).
- [ ] Implement `isQuietHours(config, date = new Date())` comparing minutes-since-midnight.
- [ ] Tests green. Commit `feat: add quiet-hours utility`.

### Task 2: `utils/format.js` (TDD)

- [ ] Write `tests/format.test.js`: formatViewers 0→"0", 999→"999", 1000→"1k", 1234→"1.2k", 1000000→"1m", 2500000→"2.5m", null→""; formatUptime: 47m ago→"47m", 3h12m→"3h 12m", invalid/future→"", 26h→"26h 5m".
- [ ] Fails, implement, green. Commit `feat: add viewer/uptime formatters`.

### Task 3: Background — gate, quiet hours, richer body, badge count

- [ ] storage.js defaults: add `quietHours: { enabled: false, start: "22:00", end: "08:00" }`.
- [ ] background.js: import isQuietHours; notification condition per spec A; compute `liveCount` in poll loop; `updateBadge({ enabled, liveCount, target })` reworked per spec B; update all call sites.
- [ ] notifications.js: `notifyStreamLive` gains `viewerCount` param; set `contextMessage` per spec A.
- [ ] Gates green. Commit `feat: un-gate notifications, quiet hours, live-count badge`.

### Task 4: Popup — bell toggle + rich rows

- [ ] popup.js `createStreamItem`: bell button (`.notify-btn`, aria-pressed, slashed-bell SVG when muted) before remove; click toggles `stream.notify`, persists, re-renders. Live rows: title line + `.stream-meta` line per spec C using formatters.
- [ ] popup.css: `.notify-btn` states, `.stream-title`, `.stream-meta` styles (tokens only).
- [ ] Gates green. Commit `feat: per-channel notification bell and rich queue rows`.

### Task 5: Options — toggle relocation + quiet hours UI

- [ ] options.html: move `notificationsEnabled` setting-item from supporter block to Basic settings (id/classes intact minus `premium-feature`); add quiet-hours rows (toggle + 2 time inputs) below it.
- [ ] options.js: wire autosave for the three new inputs following existing checkbox/input patterns; remove premium gating of the notifications toggle.
- [ ] options.css: time-input styling if needed (tokens only).
- [ ] Gates green. Commit `feat: quiet hours settings, notifications for everyone`.

### Task 6: Verify + ship

- [ ] Full gates; reviewer-agent pass on diff; fix findings; push; PR.
