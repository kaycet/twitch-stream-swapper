# Final Vibe Kanban Configuration

## Use These Commands:

### Setup Script:
```
echo Setup complete - Chrome extension requires no build step
```

### Dev Server Script:
```
(leave EMPTY/BLANK for now)
```

**Why?** Chrome extensions don't need a dev server - you load them directly in Chrome. The dev server was causing issues with termination. You can test the extension by loading it in Chrome's developer mode.

### Cleanup Script:
```
(leave empty/blank)
```

---

## How to Test Your Extension:

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the worktree directory (or your main project folder)
6. Test the extension!

---

## Alternative: If You Really Need a Dev Server

Use Python (simpler, easier to stop):

**Dev Server Script:**
```
python -m http.server 8080
```

Then press Ctrl+C in Vibe Kanban to stop it when done.

