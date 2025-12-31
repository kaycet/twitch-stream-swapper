# Testing Guide - Twitch Stream Rotator

This document provides comprehensive manual testing instructions for the Twitch Stream Rotator Chrome extension. Use this checklist during QA to verify all features work correctly.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup Testing](#initial-setup-testing)
3. [Stream Management Testing](#stream-management-testing)
4. [Drag-and-Drop Reordering Testing](#drag-and-drop-reordering-testing)
5. [Auto-Switching Functionality Testing](#auto-switching-functionality-testing)
6. [Category Fallback Testing](#category-fallback-testing)
7. [Premium Features Testing](#premium-features-testing)
8. [Settings Persistence Testing](#settings-persistence-testing)
9. [Error Handling Testing](#error-handling-testing)
10. [Edge Cases and Boundary Testing](#edge-cases-and-boundary-testing)

---

## Prerequisites

Before starting testing, ensure you have:

- [ ] Chrome browser installed (latest version recommended)
- [ ] Extension loaded in developer mode
- [ ] Valid Twitch Client ID from [Twitch Developer Console](https://dev.twitch.tv/console/apps)
- [ ] Access to at least 2-3 Twitch streamer accounts (some live, some offline)
- [ ] Browser console open (F12) to monitor errors
- [ ] Extension popup and options page accessible

---

## Initial Setup Testing

### Test Case 1.1: First-Time Installation

**Steps:**
1. Load the extension in Chrome (Developer mode → Load unpacked)
2. Click the extension icon to open popup
3. Click the settings (⚙️) button

**Expected Results:**
- [ ] Extension popup opens without errors
- [ ] Options page opens when settings button is clicked
- [ ] Empty stream list is displayed with "No streams added yet" message
- [ ] Stream count shows "0 streams"
- [ ] No console errors in browser DevTools

**Verification:**
- Check browser console for any JavaScript errors
- Verify popup UI renders correctly
- Confirm empty state message is visible

---

### Test Case 1.2: Twitch Client ID Configuration

**Steps:**
1. Open extension options page
2. Enter a valid Twitch Client ID in the "Twitch Client ID" field
3. Click "Save Settings"
4. Wait for save confirmation

**Expected Results:**
- [ ] Client ID field accepts text input
- [ ] "Settings saved successfully!" message appears (green)
- [ ] No error messages displayed
- [ ] Settings persist after page reload

**Verification:**
- Reload options page and verify Client ID is still present
- Check browser console for API initialization messages

**Negative Test:**
- [ ] Enter an invalid Client ID (e.g., "test123")
- [ ] Click "Save Settings"
- [ ] Verify error message: "Invalid Twitch Client ID. Please check your settings."
- [ ] Verify settings are NOT saved

---

## Stream Management Testing

### Test Case 2.1: Adding a Stream (Valid Username)

**Steps:**
1. Open extension popup
2. Enter a valid Twitch username (4-25 characters, alphanumeric/underscores/hyphens)
3. Click "Add" button or press Enter
4. Observe the stream list

**Expected Results:**
- [ ] Stream appears in the list immediately
- [ ] Success message: "Added [username]" appears
- [ ] Stream count updates (e.g., "1 stream")
- [ ] Stream shows "Offline" status (or "Live" if currently live)
- [ ] Input field is cleared after adding
- [ ] Empty state message disappears

**Verification:**
- Check that stream username is displayed correctly
- Verify status indicator (green dot if live, gray if offline)
- Confirm stream has a priority number (1 for first stream)

---

### Test Case 2.2: Adding a Stream (Invalid Username Format)

**Steps:**
1. Open extension popup
2. Enter an invalid username (e.g., "ab", "user@name", "user name", "user.name")
3. Click "Add" button

**Expected Results:**
- [ ] Error message: "Invalid username format"
- [ ] Stream is NOT added to the list
- [ ] Input field border turns red (if validation is visual)
- [ ] Stream count remains unchanged

**Verification:**
- Try multiple invalid formats:
  - [ ] Too short (< 4 characters)
  - [ ] Too long (> 25 characters)
  - [ ] Contains special characters (@, #, $, etc.)
  - [ ] Contains spaces
  - [ ] Empty string

---

### Test Case 2.3: Adding Duplicate Stream

**Steps:**
1. Add a stream (e.g., "testuser")
2. Try to add the same stream again (case-insensitive: "TestUser", "TESTUSER", "testuser")

**Expected Results:**
- [ ] Error message: "Stream already in list"
- [ ] Stream is NOT added again
- [ ] Input field is cleared
- [ ] Stream count remains the same

**Verification:**
- Test with different case variations of the same username
- Verify only one instance exists in the list

---

### Test Case 2.4: Adding Stream (Free Tier Limit - 10 Streams)

**Steps:**
1. Add 10 streams (without premium)
2. Try to add an 11th stream

**Expected Results:**
- [ ] Info message: "Free tier limited to 10 streams. Upgrade for unlimited!"
- [ ] Stream is NOT added
- [ ] Options page opens automatically after 2 seconds
- [ ] Stream count shows "10 streams"

**Verification:**
- Count streams in the list
- Verify premium badge is NOT visible
- Confirm options page opens automatically

---

### Test Case 2.5: Removing a Stream

**Steps:**
1. Add at least 2 streams
2. Click the "×" button on any stream item
3. Observe the stream list

**Expected Results:**
- [ ] Stream is removed immediately
- [ ] Success message: "Stream removed"
- [ ] Stream count decreases
- [ ] Remaining streams maintain correct priority order
- [ ] If removed stream was the only one, empty state appears

**Verification:**
- Check that priorities are renumbered (1, 2, 3...)
- Verify no duplicate priorities exist
- Confirm empty state appears when last stream is removed

---

### Test Case 2.6: Stream Status Updates

**Steps:**
1. Add a stream that is currently offline
2. Wait 30-60 seconds (polling interval)
3. Observe status indicator

**Expected Results:**
- [ ] Status updates automatically (Offline → Live or vice versa)
- [ ] Status indicator changes color (gray → green for live)
- [ ] "Live" or "Offline" text updates
- [ ] No console errors during status check

**Verification:**
- Monitor browser console for API calls
- Verify status updates without manual refresh
- Test with multiple streams (some live, some offline)

---

## Drag-and-Drop Reordering Testing

### Test Case 3.1: Basic Drag-and-Drop

**Steps:**
1. Add at least 3 streams (e.g., "stream1", "stream2", "stream3")
2. Drag the first stream (priority 1) to the bottom
3. Drop it on the last stream

**Expected Results:**
- [ ] Stream moves to new position visually during drag
- [ ] "drag-over" visual feedback appears on drop target
- [ ] Stream list reorders after drop
- [ ] Priorities update automatically (1, 2, 3 → 2, 3, 1)
- [ ] Changes save automatically (debounced, ~300ms delay)

**Verification:**
- Check priority numbers update correctly
- Reload popup and verify order persists
- Verify no duplicate priorities

---

### Test Case 3.2: Drag-and-Drop Multiple Reorders

**Steps:**
1. Add 5 streams
2. Perform multiple drag-and-drop operations:
   - Move stream 3 to position 1
   - Move stream 5 to position 2
   - Move stream 1 to position 4
3. Reload popup

**Expected Results:**
- [ ] All reorders execute correctly
- [ ] Priorities update after each drop
- [ ] Final order persists after popup reload
- [ ] No streams are lost or duplicated

**Verification:**
- Verify final priority sequence: 1, 2, 3, 4, 5 (no gaps)
- Check that usernames match priorities correctly

---

### Test Case 3.3: Drag-and-Drop Visual Feedback

**Steps:**
1. Add 3 streams
2. Start dragging a stream item
3. Hover over different drop targets
4. Cancel drag (drag outside or press Escape if supported)

**Expected Results:**
- [ ] Dragged item shows "dragging" class/style (e.g., opacity change)
- [ ] Drop targets show "drag-over" highlight when hovered
- [ ] Visual feedback is clear and responsive
- [ ] If cancelled, item returns to original position

**Verification:**
- Check CSS classes in DevTools during drag
- Verify smooth visual transitions

---

### Test Case 3.4: Drag Handle Functionality

**Steps:**
1. Add streams
2. Try dragging from different parts of the stream item:
   - Drag handle (☰ icon)
   - Username area
   - Status area
   - Remove button (should NOT trigger drag)

**Expected Results:**
- [ ] Dragging works from handle and main content area
- [ ] Clicking remove button (×) does NOT trigger drag
- [ ] Remove button remains functional during drag attempts

**Verification:**
- Test dragging from each area
- Verify remove button still works when clicked

---

## Auto-Switching Functionality Testing

### Test Case 4.1: Enable Auto-Switching

**Steps:**
1. Open options page
2. Ensure "Enable Auto-Switching" checkbox is checked
3. Add at least 2 streams with different priorities
4. Save settings
5. Open a Twitch tab (any stream or homepage)
6. Wait for polling interval (default 60 seconds)

**Expected Results:**
- [ ] Auto-switching toggle is checked and saved
- [ ] Settings save successfully
- [ ] Background worker starts polling
- [ ] No immediate redirect (only when higher priority goes live)

**Verification:**
- Check browser console for polling messages
- Verify settings persist after reload

---

### Test Case 4.2: Auto-Switch to Higher Priority Stream

**Prerequisites:**
- Stream 1 (priority 1) is offline
- Stream 2 (priority 2) is live
- User is watching Stream 2 or another Twitch page

**Steps:**
1. Configure streams as above
2. Enable auto-switching
3. Open a Twitch tab
4. Wait for Stream 1 to go live (or manually test by changing priorities)
5. Wait for polling interval

**Expected Results:**
- [ ] Tab automatically redirects to Stream 1 (higher priority)
- [ ] Redirect happens within polling interval (default 60s)
- [ ] Analytics record the switch (if premium)
- [ ] No console errors

**Verification:**
- Monitor tab URL changes
- Check analytics (if premium enabled)
- Verify redirect only happens when on Twitch page

---

### Test Case 4.3: Auto-Switch Respects Priority Order

**Prerequisites:**
- Multiple streams in list with different priorities
- Multiple streams go live simultaneously

**Steps:**
1. Add 3 streams: A (priority 1), B (priority 2), C (priority 3)
2. Ensure all are live
3. Enable auto-switching
4. Open Twitch tab
5. Wait for polling

**Expected Results:**
- [ ] Extension switches to Stream A (highest priority)
- [ ] Does NOT switch to B or C (lower priority)
- [ ] If A goes offline, switches to B (next highest)

**Verification:**
- Test with different priority configurations
- Verify priority order is respected

---

### Test Case 4.4: Auto-Switch Only on Twitch Pages

**Steps:**
1. Enable auto-switching
2. Add a high-priority live stream
3. Open a non-Twitch tab (e.g., google.com)
4. Wait for polling interval

**Expected Results:**
- [ ] Tab does NOT redirect (user is not on Twitch)
- [ ] Auto-switching only works when active tab is a Twitch page
- [ ] No errors in console

**Verification:**
- Test with various non-Twitch URLs
- Verify Twitch detection works correctly

---

### Test Case 4.5: Disable Auto-Switching

**Steps:**
1. Enable auto-switching
2. Add live streams
3. Uncheck "Enable Auto-Switching"
4. Save settings
5. Wait for polling interval

**Expected Results:**
- [ ] Auto-switching stops immediately
- [ ] No redirects occur after disabling
- [ ] Background polling may continue, but no switches happen

**Verification:**
- Confirm settings save
- Monitor for any redirects after disabling

---

## Category Fallback Testing

### Test Case 5.1: Enable Category Fallback

**Steps:**
1. Open options page
2. Enter a category name (e.g., "Just Chatting")
3. Check "Enable Category Fallback"
4. Save settings

**Expected Results:**
- [ ] Category name is saved
- [ ] Fallback toggle is saved
- [ ] Settings persist after reload

**Verification:**
- Reload options page and verify settings

---

### Test Case 5.2: Category Fallback Triggers

**Prerequisites:**
- All streams in list are offline
- Category fallback enabled with valid category

**Steps:**
1. Configure as above
2. Open a Twitch tab
3. Wait for polling interval
4. Observe tab behavior

**Expected Results:**
- [ ] Tab redirects to a random stream from the specified category
- [ ] Stream is from the correct category
- [ ] Fallback only triggers when NO streams in list are live

**Verification:**
- Check redirected stream's category matches
- Verify fallback doesn't trigger when list streams are live

---

### Test Case 5.3: Category Fallback with Invalid Category

**Steps:**
1. Enter an invalid/non-existent category name (e.g., "InvalidCategory12345")
2. Enable category fallback
3. Save settings
4. Ensure all list streams are offline
5. Open Twitch tab and wait for polling

**Expected Results:**
- [ ] Settings save successfully
- [ ] No redirect occurs (category not found)
- [ ] No errors crash the extension
- [ ] Console may show error message (acceptable)

**Verification:**
- Check console for graceful error handling
- Verify extension continues working normally

---

### Test Case 5.4: Category Fallback Disabled

**Steps:**
1. Enable category fallback with valid category
2. Uncheck "Enable Category Fallback"
3. Save settings
4. Ensure all streams are offline
5. Open Twitch tab and wait

**Expected Results:**
- [ ] Fallback does NOT trigger
- [ ] Tab remains on current page
- [ ] No redirect occurs

**Verification:**
- Confirm fallback is truly disabled

---

## Premium Features Testing

### Test Case 6.1: Premium Activation

**Steps:**
1. Open options page
2. Scroll to "Support the Developer" section
3. Enter an activation code (any code > 5 characters, e.g., "PREMIUM2024")
4. Click "Activate" button

**Expected Results:**
- [ ] Success message: "Premium activated! Thank you for your support! 🎉"
- [ ] "Premium Status" checkbox becomes checked
- [ ] Premium badge appears in popup
- [ ] Premium features become enabled

**Verification:**
- Check popup for premium badge (⭐ Premium)
- Verify premium features are accessible

**Negative Test:**
- [ ] Enter short code (< 5 characters)
- [ ] Verify error: "Invalid activation code"
- [ ] Premium status remains unchecked

---

### Test Case 6.2: Desktop Notifications (Premium)

**Prerequisites:**
- Premium status activated
- Notifications enabled in settings

**Steps:**
1. Enable "Desktop Notifications" in options
2. Save settings
3. Add a stream that is currently offline
4. Wait for that stream to go live (or test with a stream that will go live)

**Expected Results:**
- [ ] Desktop notification appears when stream goes live
- [ ] Notification shows: "[username] is now live!"
- [ ] Notification includes stream title or game name
- [ ] Notification has thumbnail (if available)
- [ ] "Watch Now" button appears in notification

**Verification:**
- Click notification → opens stream in new tab
- Click "Watch Now" button → opens stream
- Verify notification only appears for newly live streams (not already live)

---

### Test Case 6.3: Custom Themes (Premium)

**Steps:**
1. Activate premium
2. Open options page
3. Select a theme (e.g., "Dark" or "Neon")
4. Save settings
5. Open popup and options page

**Expected Results:**
- [ ] Theme applies to popup
- [ ] Theme applies to options page
- [ ] Visual changes are visible (colors, styles)
- [ ] Theme persists after reload

**Verification:**
- Test all available themes:
  - [ ] Default
  - [ ] Dark
  - [ ] Neon
- Verify theme CSS loads correctly

**Negative Test (Free User):**
- [ ] Without premium, try to select non-default theme
- [ ] Verify premium reminder appears
- [ ] Theme reverts to default

---

### Test Case 6.4: Analytics Dashboard (Premium)

**Steps:**
1. Activate premium
2. Enable auto-switching
3. Let extension run for a while (multiple switches)
4. Open options page
5. Scroll to Analytics section

**Expected Results:**
- [ ] Analytics section is visible (not hidden)
- [ ] "Total Switches" counter displays correct number
- [ ] "Last Switch" shows username and timestamp
- [ ] "Viewing Time by Stream" list shows data
- [ ] Viewing time is sorted by duration (highest first)
- [ ] Top 10 streams are displayed

**Verification:**
- Perform several switches and verify counts update
- Check viewing time calculations are reasonable
- Verify data persists after reload

---

### Test Case 6.5: Clear Analytics

**Steps:**
1. With premium activated and analytics data present
2. Click "Clear Analytics" button
3. Confirm the action

**Expected Results:**
- [ ] Confirmation dialog appears
- [ ] After confirmation, analytics reset:
  - [ ] Total Switches = 0
  - [ ] Last Switch = "Never"
  - [ ] Viewing Time list is empty
- [ ] Success message: "Analytics cleared"

**Verification:**
- Verify all analytics data is cleared
- Check that new data can still be recorded

---

### Test Case 6.6: Unlimited Streams (Premium)

**Steps:**
1. Activate premium
2. Add more than 10 streams (e.g., 15 streams)

**Expected Results:**
- [ ] All streams are added successfully
- [ ] No limit message appears
- [ ] Stream count shows correct number (e.g., "15 streams")
- [ ] All streams function normally

**Verification:**
- Add 20+ streams and verify all work
- Check drag-and-drop still works with many streams

---

### Test Case 6.7: Premium Features Disabled for Free Users

**Steps:**
1. Without premium activation
2. Try to enable notifications
3. Try to select non-default theme
4. Check analytics section

**Expected Results:**
- [ ] Premium reminder appears when trying to use premium features
- [ ] Analytics section is hidden
- [ ] Premium badge is NOT visible in popup
- [ ] Free tier limit (10 streams) is enforced

**Verification:**
- Test each premium feature access attempt
- Verify reminders are shown appropriately

---

## Settings Persistence Testing

### Test Case 7.1: Settings Save and Reload

**Steps:**
1. Open options page
2. Change multiple settings:
   - Client ID
   - Check interval
   - Auto-switching toggle
   - Category fallback
   - Theme
3. Save settings
4. Close and reopen options page

**Expected Results:**
- [ ] All settings persist after reload
- [ ] Values match what was entered
- [ ] Toggles maintain their state
- [ ] No data loss

**Verification:**
- Test each setting individually
- Test combinations of settings
- Verify after browser restart

---

### Test Case 7.2: Stream List Persistence

**Steps:**
1. Add multiple streams
2. Reorder them via drag-and-drop
3. Close popup
4. Reopen popup

**Expected Results:**
- [ ] All streams are present
- [ ] Order is maintained
- [ ] Priorities are correct
- [ ] Status indicators are preserved (may update on next poll)

**Verification:**
- Test with various numbers of streams
- Verify after browser restart
- Check priorities are sequential

---

### Test Case 7.3: Settings Sync Across Popup and Options

**Steps:**
1. Change settings in options page
2. Save
3. Open popup
4. Verify settings are reflected

**Expected Results:**
- [ ] Popup reflects current settings
- [ ] Theme applies if changed
- [ ] Premium badge appears if activated
- [ ] Stream count is accurate

**Verification:**
- Test bidirectional: change in popup, verify in options (if applicable)
- Check real-time updates (if storage listeners work)

---

### Test Case 7.4: Default Settings on Fresh Install

**Steps:**
1. Uninstall extension
2. Clear browser storage (if possible)
3. Reinstall extension
4. Check default settings

**Expected Results:**
- [ ] Default settings are:
  - [ ] Check interval: 60000ms
  - [ ] Auto-switching: enabled
  - [ ] Category fallback: "Just Chatting" (if enabled)
  - [ ] Notifications: disabled
  - [ ] Theme: default
  - [ ] Premium: false
- [ ] No errors on first load

**Verification:**
- Check each default value
- Verify extension works with defaults

---

## Error Handling Testing

### Test Case 8.1: Invalid Twitch Client ID

**Steps:**
1. Enter an invalid Client ID (e.g., "invalid123")
2. Save settings
3. Try to add a stream or check status

**Expected Results:**
- [ ] Error message: "Invalid Twitch Client ID. Please check your settings."
- [ ] Settings are NOT saved with invalid ID
- [ ] Stream status checks fail gracefully
- [ ] Extension does not crash

**Verification:**
- Check console for API errors (401 Unauthorized)
- Verify user-friendly error messages

---

### Test Case 8.2: Network Errors

**Steps:**
1. Configure valid Client ID
2. Disconnect internet (or use network throttling)
3. Try to add stream or check status
4. Reconnect internet

**Expected Results:**
- [ ] Extension handles network errors gracefully
- [ ] No crashes or infinite loops
- [ ] Error messages are user-friendly (if shown)
- [ ] Extension resumes when network returns

**Verification:**
- Test with various network conditions:
  - [ ] No internet
  - [ ] Slow connection
  - [ ] Intermittent connection

---

### Test Case 8.3: API Rate Limiting

**Steps:**
1. Configure valid Client ID
2. Add many streams (50+)
3. Monitor API calls
4. Observe rate limit handling

**Expected Results:**
- [ ] Extension respects rate limits (800 req/min)
- [ ] Requests are queued if needed
- [ ] No 429 errors crash the extension
- [ ] Retry logic works correctly

**Verification:**
- Check console for rate limit handling
- Verify exponential backoff on errors

---

### Test Case 8.4: Missing Client ID

**Steps:**
1. Remove or clear Client ID
2. Try to add a stream
3. Try to check stream status

**Expected Results:**
- [ ] Error message: "Please configure Twitch Client ID in settings"
- [ ] Streams can still be added (but status won't update)
- [ ] No crashes
- [ ] User is directed to settings

**Verification:**
- Test all features that require API access
- Verify graceful degradation

---

### Test Case 8.5: Invalid Stream Username (API Returns 404)

**Steps:**
1. Add a stream with username that doesn't exist on Twitch
2. Wait for status check

**Expected Results:**
- [ ] Stream is added to list
- [ ] Status shows "Offline" (correct behavior)
- [ ] No errors crash extension
- [ ] Extension continues working normally

**Verification:**
- Test with various non-existent usernames
- Verify API handles 404s gracefully

---

### Test Case 8.6: Storage Errors

**Steps:**
1. Use browser DevTools to simulate storage quota exceeded
2. Try to save settings or add streams

**Expected Results:**
- [ ] Error is caught and logged
- [ ] User-friendly error message (if possible)
- [ ] Extension doesn't crash
- [ ] Previous data is preserved

**Verification:**
- Test with storage disabled (if possible)
- Verify error handling in storage.js

---

### Test Case 8.7: Concurrent Operations

**Steps:**
1. Rapidly add multiple streams
2. Rapidly reorder streams via drag-and-drop
3. Change settings while operations are in progress

**Expected Results:**
- [ ] No race conditions
- [ ] All operations complete successfully
- [ ] Data integrity maintained
- [ ] No duplicate streams or corrupted priorities

**Verification:**
- Test rapid clicking/typing
- Verify debouncing works correctly

---

## Edge Cases and Boundary Testing

### Test Case 9.1: Empty Stream List

**Steps:**
1. Start with empty list
2. Try various operations:
   - Check status (should do nothing)
   - Drag-and-drop (not applicable)
   - Remove stream (not applicable)

**Expected Results:**
- [ ] Empty state message is displayed
- [ ] No errors occur
- [ ] Extension remains functional

**Verification:**
- Test all features with empty list
- Verify UI handles empty state correctly

---

### Test Case 9.2: Maximum Streams (Premium)

**Steps:**
1. Activate premium
2. Add 100+ streams
3. Test functionality:
   - Drag-and-drop
   - Status updates
   - Auto-switching

**Expected Results:**
- [ ] All streams are manageable
- [ ] Performance remains acceptable
- [ ] UI doesn't break with many items
- [ ] API batching works (100 streams per batch)

**Verification:**
- Check API calls are batched correctly
- Verify scroll performance in popup

---

### Test Case 9.3: Very Long Usernames

**Steps:**
1. Add a stream with maximum length username (25 characters)
2. Verify display and functionality

**Expected Results:**
- [ ] Username displays correctly (may truncate with ellipsis)
- [ ] All functionality works
- [ ] No UI overflow issues

**Verification:**
- Test with 4, 10, 20, 25 character usernames
- Check CSS handles long text

---

### Test Case 9.4: Special Characters in Category Name

**Steps:**
1. Enter category names with special characters
2. Test category fallback

**Expected Results:**
- [ ] Category names are handled correctly
- [ ] API calls are properly encoded
- [ ] Fallback works if category exists

**Verification:**
- Test with various category name formats
- Check URL encoding in API calls

---

### Test Case 9.5: Browser Idle State

**Steps:**
1. Enable auto-switching
2. Let browser go idle (or simulate idle state)
3. Have a stream go live
4. Return browser to active state

**Expected Results:**
- [ ] Polling pauses when idle
- [ ] Polling resumes when active
- [ ] No unnecessary API calls while idle
- [ ] Switches occur after returning to active

**Verification:**
- Monitor API calls during idle
- Verify idle detection works

---

### Test Case 9.6: Multiple Tabs

**Steps:**
1. Open multiple Twitch tabs
2. Enable auto-switching
3. Have a higher priority stream go live

**Expected Results:**
- [ ] Only the active tab switches
- [ ] Other tabs are not affected
- [ ] No conflicts between tabs

**Verification:**
- Test with 2-5 Twitch tabs open
- Verify correct tab is switched

---

### Test Case 9.7: Extension Reload/Update

**Steps:**
1. Configure extension with streams and settings
2. Reload extension (chrome://extensions → Reload)
3. Verify data persistence

**Expected Results:**
- [ ] All data persists after reload
- [ ] Settings are maintained
- [ ] Stream list is preserved
- [ ] Extension continues working normally

**Verification:**
- Test after extension update simulation
- Verify background worker restarts correctly

---

## Testing Checklist Summary

Use this summary checklist for quick verification:

### Core Functionality
- [ ] Stream addition (valid/invalid/duplicate)
- [ ] Stream removal
- [ ] Drag-and-drop reordering
- [ ] Status updates (live/offline)
- [ ] Auto-switching (enable/disable/priority)
- [ ] Category fallback (enable/disable/trigger)

### Premium Features
- [ ] Premium activation
- [ ] Desktop notifications
- [ ] Custom themes
- [ ] Analytics dashboard
- [ ] Unlimited streams
- [ ] Premium restrictions for free users

### Settings & Persistence
- [ ] Settings save and reload
- [ ] Stream list persistence
- [ ] Settings sync across pages
- [ ] Default values

### Error Handling
- [ ] Invalid Client ID
- [ ] Network errors
- [ ] API rate limiting
- [ ] Missing Client ID
- [ ] Invalid usernames
- [ ] Storage errors
- [ ] Concurrent operations

### Edge Cases
- [ ] Empty list
- [ ] Maximum streams
- [ ] Long usernames
- [ ] Special characters
- [ ] Browser idle
- [ ] Multiple tabs
- [ ] Extension reload

---

## Notes for QA

1. **Testing Environment**: Test in a clean Chrome profile to avoid conflicts
2. **API Limits**: Be mindful of Twitch API rate limits during testing
3. **Timing**: Some tests require waiting for polling intervals (default 60s)
4. **Console Monitoring**: Always check browser console for errors
5. **Data Cleanup**: Clear extension data between major test scenarios if needed
6. **Real Streams**: Use real Twitch usernames for accurate status testing
7. **Documentation**: Document any bugs found with steps to reproduce

---

## Bug Report Template

When reporting bugs, include:

```
**Bug Title**: [Brief description]

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Result**: 

**Actual Result**: 

**Environment**:
- Chrome Version: 
- Extension Version: 
- OS: 

**Console Errors**: [Paste any console errors]

**Screenshots**: [If applicable]
```

---

## Sign-Off

After completing all test cases:

- [ ] All critical test cases passed
- [ ] All major features verified
- [ ] Error handling confirmed
- [ ] Edge cases tested
- [ ] Documentation updated with any issues found
- [ ] Ready for release / needs fixes (circle one)

**Tester Name**: _________________  
**Date**: _________________  
**Version Tested**: _________________
