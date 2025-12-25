# UX Gaps - Notebook Scanner

This document tracks identified UX issues and their resolution status.

---

## Must Fix (Blocking Issues)

### 1. Empty status bar when no jobs
- **File**: `src/ui/status-bar.ts:197`
- **Problem**: Status bar shows nothing when no jobs exist, users lose awareness of plugin
- **Fix**: Always show status text ("Ready" when idle)
- **Status**: [x] Complete

### 2. Upload modal auto-closes too fast
- **File**: `src/ui/upload-modal.ts:461`
- **Problem**: 1-second auto-close doesn't let users see results, especially on failures
- **Fix**: Don't auto-close; show completion state with "View Queue" and "Done" buttons
- **Status**: [x] Complete

### 3. No note location feedback after sync
- **File**: `src/job-poller.ts:169`
- **Problem**: "Synced 3 notes" but users don't know WHERE to find them
- **Fix**: Include folder path in notice: "Synced 3 notes to Notebook Notes/"
- **Status**: [x] Complete

### 4. Delete job without confirmation
- **File**: `src/ui/queue-modal.ts:345`
- **Problem**: Accidental taps on mobile can delete jobs irreversibly
- **Fix**: Two-tap confirmation (first tap shows "Confirm?", second tap deletes)
- **Status**: [x] Complete

### 5. Poller stops permanently after errors
- **File**: `src/job-poller.ts:182`
- **Problem**: After 5 consecutive errors, sync stops forever with no recovery
- **Fix**: Added "paused" state to status bar, tap to resume; added `resumeAfterError()` method
- **Status**: [x] Complete

---

## Should Fix (Significant Friction)

### 6. Onboarding doesn't re-show after skip
- **File**: `src/main.ts:75-81`
- **Problem**: After skipping, users can't easily get back to guided setup
- **Fix**: Added "Setup Wizard" command that always opens onboarding
- **Status**: [x] Complete

### 7. Partial upload failures unclear
- **File**: `src/ui/upload-modal.ts:437`
- **Problem**: If 8/10 succeed, modal closes before user sees which 2 failed
- **Fix**: Addressed in #2 - completion state shows "X uploaded, Y failed" and doesn't auto-close
- **Status**: [x] Complete (via #2)

### 8. No sync progress for large batches
- **File**: `src/job-poller.ts:220`
- **Problem**: Syncing 50 jobs gives no progress feedback
- **Fix**: Added `onSyncProgress` callback, status bar shows "Syncing 3/10..."
- **Status**: [x] Complete

### 9. No bulk actions for failed jobs
- **File**: `src/ui/queue-modal.ts:271`
- **Problem**: Must manually retry each failed job individually
- **Fix**: Added "Retry All Failed (N)" button to queue toolbar
- **Status**: [x] Complete

### 10. Upload success lacks guidance
- **File**: `src/main.ts:341`
- **Problem**: "3 images uploaded" but no indication of what happens next
- **Fix**: Addressed in #2 - completion state has "View Queue" button
- **Status**: [x] Complete (via #2)

---

## Nice to Have (Polish)

### 11. Local copy save failures are silent
- **File**: `src/ui/upload-modal.ts:403`
- **Problem**: If local copy fails to save, user isn't notified
- **Fix**: Show warning notice if local save fails
- **Status**: [ ] Not started

### 12. Connection test auto-proceeds too fast
- **File**: `src/ui/onboarding-modal.ts:259`
- **Problem**: Success screen advances after 1 second, feels rushed
- **Fix**: Increase delay to 1.5 seconds
- **Status**: [ ] Not started

### 13. Note creation conflict resolution is silent
- **File**: `src/note-creator.ts:156`
- **Problem**: Filename conflicts add numeric suffix without user awareness
- **Fix**: Log or notify when conflicts occur
- **Status**: [ ] Not started

### 14. Completed jobs clickability unclear
- **File**: `src/ui/queue-modal.ts:278`
- **Problem**: Users might not realize completed jobs are clickable
- **Fix**: Add explicit "Open Note" button for completed jobs
- **Status**: [ ] Not started

### 15. Test Connection button disabled without explanation
- **File**: `src/ui/onboarding-modal.ts:223`
- **Problem**: Button is disabled but user doesn't know why
- **Fix**: Add helper text: "Enter both fields to test connection"
- **Status**: [ ] Not started

---

## Progress Summary

| Priority | Total | Complete | In Progress | Not Started |
|----------|-------|----------|-------------|-------------|
| Must Fix | 5 | 5 | 0 | 0 |
| Should Fix | 5 | 5 | 0 | 0 |
| Nice to Have | 5 | 0 | 0 | 5 |
| **Total** | **15** | **10** | **0** | **5** |

---

## Progress Log

| Date | Issue # | Status | Notes |
|------|---------|--------|-------|
| 2024-12-25 | 1 | Complete | Status bar now shows "Ready" when idle |
| 2024-12-25 | 2 | Complete | Upload modal shows completion state with View Queue/Done buttons |
| 2024-12-25 | 3 | Complete | Sync notices now include output folder path |
| 2024-12-25 | 4 | Complete | Delete button requires two taps to confirm |
| 2024-12-25 | 5 | Complete | Status bar shows "Paused - tap to resume", clicking resumes poller |
| 2024-12-25 | 6 | Complete | Added "Setup Wizard" command |
| 2024-12-25 | 7 | Complete | Addressed by #2 |
| 2024-12-25 | 8 | Complete | Status bar shows "Syncing 3/10..." for batch progress |
| 2024-12-25 | 9 | Complete | Added "Retry All Failed (N)" button to queue toolbar |
| 2024-12-25 | 10 | Complete | Addressed by #2 |
