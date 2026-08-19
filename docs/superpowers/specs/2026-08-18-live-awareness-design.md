# Live Awareness — Design Spec

Date: 2026-08-18. Status: approved by owner in chat ("build it").

## Context

Live notifications already exist (`utils/notifications.js`, fired from
`background.js` poll loop) but are double-gated behind `premiumStatus` +
`notificationsEnabled`. The toolbar badge shows ON/LIVE state text. Queue rows
show only "Live"/"Offline" despite full helix stream data being stored on every
poll. Ships as v1.3.0.

## A. Notifications: un-gate, per-channel, richer body

- Gate becomes: `settings.notificationsEnabled && stream.notify !== false &&
  !isQuietHours(settings.quietHours, new Date())`. `premiumStatus` removed
  from the notification condition only.
- Options: the Desktop Notifications toggle moves from the supporter block to
  Basic settings (same id `notificationsEnabled`, default stays `false`).
- Per-channel: new stream field `notify` (undefined/true = notify, false =
  muted). Popup rows get a ghost bell button (`.notify-btn`, aria-pressed)
  before the remove button; click toggles + persists via existing stream save
  path. Muted state: slashed-bell icon, `--text-dim` color.
- Notification body: `message` = stream title (existing logic), plus
  `contextMessage` = `"{game_name} · {formatViewers(viewer_count)} viewers"`
  when data available (omit segment when missing).

## B. Toolbar live badge

`updateBadge` reworked: input `{ enabled, liveCount, target }`.
- Text: `liveCount > 0 ? String(liveCount) : ''`.
- Background: `#9146ff` when Auto-Swap enabled, `#5c5c66` when not.
- Title: enabled → `"{n} live — watching {target}"` (or `"Auto-Swap ON — no
  one live"`); disabled → `"Auto-Swap off — {n} live"` / `"Auto-Swap off"`.
- Call sites updated to pass the live count from the poll loop; startup/reset
  calls pass `liveCount: 0`.

## C. Rich queue rows

In `createStreamItem` (popup.js), for live rows with `streamData`:
- Line 2: stream title, single line, ellipsized (`title` attribute holds full).
- Line 3 (`.stream-meta`, `--font-data`, `--text-dim`):
  `{game_name} · {formatViewers(viewer_count)} · {formatUptime(started_at)}`,
  omitting missing segments and their separators.
- Offline rows unchanged (dot + "Offline").
- New `utils/format.js`: `formatViewers(n)` → `"999"`, `"1.2k"`, `"1.2m"`
  (one decimal, trailing `.0` stripped); `formatUptime(startedAtIso, now)` →
  `"47m"`, `"3h 12m"`, `"26h 5m"` (invalid/future → `""`).

## D. Quiet hours

- `settings.quietHours = { enabled: false, start: "22:00", end: "08:00" }`
  added to storage defaults.
- New `utils/quiet-hours.js`: `isQuietHours(config, date)` pure. Disabled or
  malformed config → false. `start < end` = same-day window; `start > end` =
  overnight span; `start === end` = never quiet. Boundary: start inclusive,
  end exclusive. Uses local time.
- Options UI: under the Desktop Notifications row — quiet-hours toggle
  (`quietHoursEnabled`) + two `<input type="time">` (`quietHoursStart`,
  `quietHoursEnd`), autosaved like other settings.
- Suppresses notifications only; auto-swap behavior untouched.

## Non-goals

Follow-list import (user OAuth), notification sounds, multi-account, any
change to auto-swap logic.

## Constraints

- Existing element IDs preserved; `npm run audit:dom` green.
- No raw hex outside tokens.css in page CSS (badge colors live in JS, exempt).
- All copy sentence case, user-side language.

## Test gate

- New vitest suites: `tests/quiet-hours.test.js` (disabled, same-day, overnight,
  boundaries, malformed), `tests/format.test.js` (viewers + uptime edges).
- Existing suites, lint, audit:dom green. Manual: load unpacked — notification
  fires on live transition, bell mutes, badge counts, rows show meta, quiet
  hours suppress.
