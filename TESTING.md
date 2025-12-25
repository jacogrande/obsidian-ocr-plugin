# Manual Testing Guide - Notebook Scanner

This guide covers manual testing procedures for the Notebook Scanner Obsidian plugin.

---

## Prerequisites

### Build and Deploy

```bash
cd /Users/jackson/Code/projects/notebook-scanner
npm install
npm run build
./deploy.sh  # Or manually copy to your vault
```

### Restart Obsidian

After deploying, either:
- Restart Obsidian completely, OR
- Settings > Community plugins > Toggle Notebook Scanner off/on

### Test Devices

- **iOS**: iPhone or iPad with Obsidian app + Obsidian Sync
- **Android**: Android device with Obsidian app
- **Desktop**: macOS, Windows, or Linux with Obsidian desktop app

---

## 1. First-Time Setup / Onboarding

### TC1.1: Onboarding appears on first launch

**Steps:**
1. Install plugin for the first time (no prior settings)
2. Enable the plugin

**Expected:**
- Onboarding modal appears after ~500ms delay
- Shows welcome message and setup steps

### TC1.2: Setup wizard configuration

**Steps:**
1. In onboarding modal, enter:
   - Service URL: `https://obsidian-ocr-server.vercel.app`
   - API Key: your key
2. Click "Test Connection"

**Expected:**
- Button shows "Testing..." while checking
- Success: Green checkmark, "Connection successful!"
- Auto-advances after 1.5 seconds
- "Get Started" button appears

### TC1.3: Skip onboarding

**Steps:**
1. On onboarding modal, click "Skip for Now"

**Expected:**
- Modal closes
- Notice: "You can configure Notebook Scanner anytime in settings"

### TC1.4: Re-access setup wizard after skip

**Steps:**
1. Skip onboarding (TC1.3)
2. Command palette > "Notebook Scanner: Setup Wizard"

**Expected:**
- Onboarding modal opens again
- Can complete setup

### TC1.5: Click ribbon icon before configured

**Steps:**
1. Skip onboarding without configuring
2. Click the notebook icon in ribbon

**Expected:**
- Notice: "Please configure Notebook Scanner in settings first"
- Settings tab opens to plugin settings

---

## 2. Upload Modal

### TC2.1: Open upload modal

**Steps:**
1. Configure plugin (complete onboarding)
2. Click notebook icon in ribbon OR Command palette > "Upload Images"

**Expected:**
- Upload modal opens
- Drop zone visible with icon and text
- "Take Photo" button visible (mobile only)

### TC2.2: Add files via file picker

**Steps:**
1. Open upload modal
2. Click/tap the drop zone
3. Select one or more images

**Expected:**
- File picker opens
- Selected files appear in list below drop zone
- Each file shows: icon, name, size
- "Upload (N)" button shows count

### TC2.3: Add files via drag and drop (Desktop)

**Steps:**
1. Open upload modal on desktop
2. Drag image files onto drop zone

**Expected:**
- Drop zone highlights on drag over
- Files added to list on drop

### TC2.4: Camera capture (Mobile)

**Steps:**
1. Open upload modal on iOS/Android
2. Tap "Take Photo" button
3. Take a photo and confirm

**Expected:**
- Native camera opens
- Photo added to file list after capture
- Can take multiple photos

### TC2.5: Remove file from list

**Steps:**
1. Add files to upload list
2. Click/tap the X button on a file

**Expected:**
- File removed from list
- Upload count updates

### TC2.6: Upload files

**Steps:**
1. Add one or more images
2. Click "Upload (N)" button

**Expected:**
- Button changes to "Uploading..."
- Progress shown per file
- Files show spinner while uploading
- Files show checkmark on success

### TC2.7: Upload completion state

**Steps:**
1. Complete an upload (TC2.6)

**Expected:**
- Modal does NOT auto-close
- Shows completion summary: "X uploaded successfully" (green) or "X uploaded, Y failed" (orange)
- Two buttons appear: "View Queue" and "Done"

### TC2.8: View Queue from completion

**Steps:**
1. Complete upload
2. Click "View Queue" button

**Expected:**
- Upload modal closes
- Queue modal opens
- Newly uploaded jobs visible

### TC2.9: Partial upload failure

**Steps:**
1. Add multiple images including one invalid/too large file
2. Upload

**Expected:**
- Successful uploads show checkmark
- Failed uploads show X with error message
- Completion shows "X uploaded, Y failed"
- Modal stays open to show results

---

## 3. Queue Modal

### TC3.1: Open queue modal

**Steps:**
1. Command palette > "View Queue" OR click status bar

**Expected:**
- Queue modal opens
- Shows filter dropdown, refresh button, Sync Now button
- Job list shows all jobs

### TC3.2: Filter jobs

**Steps:**
1. Open queue modal
2. Use filter dropdown to select "Pending", "Completed", "Failed", etc.

**Expected:**
- Job list filters to show only selected status
- Empty state shows if no jobs match filter

### TC3.3: Refresh jobs

**Steps:**
1. Open queue modal
2. Click refresh button (circular arrow)

**Expected:**
- Button spins while loading
- Job list updates with latest data

### TC3.4: Job status icons

| Status | Expected Icon |
|--------|---------------|
| Pending | Clock |
| Processing | Spinning loader |
| Completed | Green checkmark |
| Failed | Red X |

### TC3.5: Open completed note

**Steps:**
1. Have a completed & synced job
2. Click on the job row (or "Click to open" hint)

**Expected:**
- Queue modal closes
- Created note opens in editor

### TC3.6: Retry failed job

**Steps:**
1. Have a failed job in queue
2. Click "Retry" button on the job

**Expected:**
- Button shows loading state
- Job status changes to pending
- Notice: "Job queued for retry"

### TC3.7: Retry All Failed (bulk action)

**Steps:**
1. Have multiple failed jobs
2. Observe "Retry All Failed (N)" button in toolbar
3. Click it

**Expected:**
- Button shows "Retrying N..."
- All failed jobs move to pending
- Notice: "N jobs queued for retry"

### TC3.8: Retry All button visibility

**Steps:**
1. Open queue with no failed jobs

**Expected:**
- "Retry All Failed" button is hidden

**Steps:**
1. Open queue with failed jobs

**Expected:**
- "Retry All Failed (N)" button visible with count

### TC3.9: Delete job - two-tap confirmation

**Steps:**
1. Click delete (trash) button on any job
2. Observe button state
3. Click again within 3 seconds

**Expected:**
- First tap: Button changes to "Confirm?" (red background)
- Second tap: Job deleted, notice shown
- If no second tap within 3s: Button reverts to trash icon

### TC3.10: Sync Now

**Steps:**
1. Have completed jobs that haven't synced
2. Click "Sync Now" button

**Expected:**
- Button shows "Syncing..."
- Completed jobs sync to vault
- Notice shows result

---

## 4. Status Bar

### TC4.1: Ready state (no jobs)

**Steps:**
1. Delete all jobs or start fresh

**Expected:**
- Status bar shows notebook icon + "Ready"

### TC4.2: Pending jobs state

**Steps:**
1. Upload images (creates pending jobs)

**Expected:**
- Status bar shows clock icon + "N pending"
- Text color changes to indicate activity

### TC4.3: Processing jobs state

**Steps:**
1. Have jobs being processed

**Expected:**
- Status bar shows "N processing" or "N processing · M pending"

### TC4.4: Failed jobs state

**Steps:**
1. Have failed jobs in queue

**Expected:**
- Status bar shows alert icon + "N failed" (red)

### TC4.5: Syncing state

**Steps:**
1. Trigger sync (manual or auto)

**Expected:**
- Status bar shows spinning refresh icon + "Syncing..."

### TC4.6: Sync progress for batches

**Steps:**
1. Have many completed jobs to sync (5+)
2. Trigger sync

**Expected:**
- Status bar shows "Syncing 3/10..." with progress count

### TC4.7: Paused state (error recovery)

**Steps:**
1. Simulate network errors (disconnect, invalid API key, etc.)
2. Let poller fail 5 consecutive times

**Expected:**
- Status bar shows pause icon + "Paused - tap to resume" (orange)
- Notice: "Notebook Scanner sync paused. Tap status bar to resume."

### TC4.8: Resume from paused

**Steps:**
1. Be in paused state (TC4.7)
2. Click/tap the status bar

**Expected:**
- Queue modal opens
- Poller resumes
- Notice: "Sync resumed"
- Status bar returns to normal state

### TC4.9: Click status bar opens queue

**Steps:**
1. Click/tap status bar (any state except paused)

**Expected:**
- Queue modal opens

---

## 5. Sync & Note Creation

### TC5.1: Auto-sync creates notes

**Steps:**
1. Enable auto-sync in settings
2. Upload images
3. Wait for processing to complete

**Expected:**
- Notes automatically created in output folder
- Notice: "Synced N new notes to [folder]/"

### TC5.2: Manual sync

**Steps:**
1. Disable auto-sync
2. Upload and wait for processing
3. Command palette > "Sync Now"

**Expected:**
- Completed jobs sync to notes
- Notice shows count and folder

### TC5.3: Note content

**Steps:**
1. Open a synced note

**Expected:**
- Title matches processed result
- Content includes extracted text
- Tags in frontmatter (if enabled)
- Formatted according to template

### TC5.4: Sync notice includes folder path

**Steps:**
1. Trigger sync with completed jobs

**Expected:**
- Notice: "Synced N new notes to Notebook Notes/" (includes folder name)

---

## 6. Settings

### TC6.1: Change output folder

**Steps:**
1. Settings > Notebook Scanner
2. Change "Output Folder" to new path
3. Sync new notes

**Expected:**
- New notes created in specified folder
- Folder created if doesn't exist

### TC6.2: Toggle auto-sync

**Steps:**
1. Disable auto-sync in settings
2. Complete a job

**Expected:**
- Note NOT automatically created
- Must manually sync

### TC6.3: Change poll interval

**Steps:**
1. Change poll interval to 10 seconds
2. Observe sync behavior

**Expected:**
- Poller checks more frequently

---

## 7. Edge Cases

### TC7.1: Network offline during upload

**Steps:**
1. Start upload
2. Disconnect network mid-upload

**Expected:**
- Upload fails gracefully
- Error message shown per file
- Modal shows failure state

### TC7.2: Large batch upload (10+ images)

**Steps:**
1. Select 10+ images
2. Upload

**Expected:**
- All files shown in list
- Progress visible for each
- Completion state shows total count

### TC7.3: Invalid API key

**Steps:**
1. Enter invalid API key
2. Try to upload

**Expected:**
- Connection test fails in setup
- Uploads fail with auth error

### TC7.4: Rapid button clicks

**Steps:**
1. Quickly double-click Upload/Sync buttons

**Expected:**
- Only one operation triggered
- No duplicate jobs/errors

---

## 8. Mobile-Specific

### TC8.1: Touch targets

**Steps:**
1. Use plugin on mobile
2. Tap all interactive elements

**Expected:**
- All buttons easily tappable (44px minimum)
- No accidental mis-taps

### TC8.2: Camera permission

**Steps:**
1. Revoke camera permission for Obsidian
2. Tap "Take Photo"

**Expected:**
- System prompts for permission OR
- Graceful error message

### TC8.3: Safe area (iOS notch)

**Steps:**
1. Open modals on iPhone with notch

**Expected:**
- Content doesn't overlap notch/home indicator
- Proper padding at bottom

---

## 9. Accessibility

### TC9.1: Screen reader

**Steps:**
1. Enable VoiceOver (iOS) or TalkBack (Android)
2. Navigate through modals

**Expected:**
- All buttons announced
- Status changes announced
- Logical navigation order

### TC9.2: Reduced motion

**Steps:**
1. Enable "Reduce Motion" in OS settings
2. Use plugin

**Expected:**
- No spinning animations
- Instant state changes

### TC9.3: Keyboard navigation (Desktop)

**Steps:**
1. Use Tab to navigate upload modal
2. Use Enter to activate buttons

**Expected:**
- Focus visible on all elements
- All actions keyboard-accessible

---

## Reporting Issues

When reporting issues, include:

- Device model and OS version
- Obsidian version (Settings > About)
- Plugin version
- Steps to reproduce
- Screenshots/screen recordings if possible
- Console logs (if available)
