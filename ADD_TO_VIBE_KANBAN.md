# Quick Guide: Adding Tasks to Vibe Kanban

## Steps:
1. Open Vibe Kanban in your browser
2. Select your `twitch-stream-swapper` project
3. Click the **+ (plus)** button to create a new task
4. Copy the task description below
5. Select "Cursor CLI" as your agent
6. Click "Create and Start" (or "Create" then start manually)

---

## Task 1: Generate Placeholder Icons
**Copy this into Vibe Kanban:**

```
Create placeholder icon files for the Chrome extension. Generate 16x16, 48x48, 128x128, and 512x512 PNG icons with a purple/streaming theme. Use simple geometric shapes or a play/stream icon. Save them in the icons/ directory as icon-16.png, icon-48.png, icon-128.png, and icon-512.png. The icons should be recognizable at small sizes and match the extension's purple (#9147ff) color scheme. Use a solid purple background with white iconography or vice versa.
```

---

## Task 2: Create SVG Icon Source (Vector Graphics)
**Copy this into Vibe Kanban:**

```
Create an SVG icon source file (icons/icon-source.svg) for the extension. Design a clean, scalable icon representing streaming/rotation with purple (#9147ff) and white colors. The design should work well when scaled down to 16px. Include a simple play button, refresh/rotate arrows, or stream waves. The SVG should be optimized and use proper viewBox. Save as icons/icon-source.svg for future editing and as a master file for generating PNGs.
```

---

## Task 3: Add Bulma CSS Framework
**Copy this into Vibe Kanban:**

```
Integrate Bulma CSS framework into the extension for cleaner, more consistent UI. Add Bulma via CDN link in popup.html and options.html (use unpkg.com CDN for Bulma 0.9.4). Update the existing styles to work alongside Bulma while maintaining the dark theme. Keep the current purple accent color (#9147ff) and ensure the extension still looks polished. Don't break existing functionality - this is just adding the framework.
```

---

## Task 4: Improve Popup UI with Bulma Components
**Copy this into Vibe Kanban:**

```
Refactor popup.html and popup.css to use Bulma components. Convert the stream list to use Bulma's card component, improve the add stream section with Bulma form controls (field, control, input classes), and enhance buttons with Bulma button styles. Maintain drag-and-drop functionality and ensure the UI remains responsive and clean. Keep the dark theme by overriding Bulma's default variables or using custom classes. Test that all interactions still work.
```

---

## Task 5: Improve Options Page UI with Bulma
**Copy this into Vibe Kanban:**

```
Refactor options.html and options.css to use Bulma components. Convert settings sections to Bulma panels/cards, improve form inputs with Bulma form controls, and enhance the premium/donation sections with better visual hierarchy using Bulma's notification and box components. Maintain all existing functionality including save buttons, premium reminders, and analytics display. Keep the dark theme consistent.
```

---

## Task 6: Create Testing Checklist and Manual Test Guide
**Copy this into Vibe Kanban:**

```
Create a comprehensive TESTING.md file with step-by-step manual testing instructions. Include test cases for: adding/removing streams, drag-and-drop reordering, auto-switching functionality, category fallback, premium features, settings persistence, and error handling. Format as a checklist that can be followed during QA. Include expected results and how to verify each feature works correctly.
```

---

## Task 7: Add Visual Feedback for Drag-and-Drop
**Copy this into Vibe Kanban:**

```
Enhance the drag-and-drop experience in popup.js with better visual feedback. Add smooth CSS transitions for drag start/end, highlight drop zones with a visual indicator, show a ghost/preview of the dragged item that follows the cursor, and add visual feedback when hovering over valid drop targets. Use CSS transforms and transitions for smooth animations. Ensure the feedback is clear but not distracting.
```

---

## Task 8: Improve Error Messages and User Feedback
**Copy this into Vibe Kanban:**

```
Enhance error handling and user feedback throughout the extension. Add clear, actionable error messages for API failures, invalid usernames, rate limiting, and network issues. Improve success messages and loading states. Use consistent styling with the rest of the UI (consider using Bulma notifications if Task 3-5 are done). Make error messages helpful - tell users what went wrong and what they can do about it.
```

---

## Task 9: Add Keyboard Shortcuts
**Copy this into Vibe Kanban:**

```
Add keyboard shortcuts to the popup for power users. Include shortcuts for: adding streams (Ctrl+Enter or Enter when input focused), removing selected stream (Delete key), opening settings (Ctrl+, or clicking settings icon), and refreshing stream status (F5). Display available shortcuts in a help tooltip (question mark icon) or help menu. Use event listeners in popup.js and prevent default browser behavior where needed.
```

---

## Task 10: Create Icon Generation Script
**Copy this into Vibe Kanban:**

```
Create a Node.js script (scripts/generate-icons.js) that converts the SVG icon source to all required PNG sizes (16, 48, 128, 512). Use a library like sharp or svg2png-wasm. Add it to package.json as a script command (e.g., npm run generate-icons). Include instructions in ICONS.md for installing dependencies and running the script. The script should read icons/icon-source.svg and output all four PNG sizes to the icons/ directory.
```

---

## Recommended Order:
1. **Task 1** (Icons) - Makes extension loadable
2. **Task 2** (SVG Source) - Vector master file  
3. **Task 6** (Testing Guide) - Test as you go
4. **Tasks 3-5** (Bulma UI) - Polish interface
5. **Tasks 7-10** (Enhancements) - Nice-to-haves

## Trunk-Based Development Reminders:
- ✅ One task at a time
- ✅ Small, focused commits
- ✅ Test before moving on
- ✅ Merge to main frequently
- ✅ Atomic commits with clear messages

