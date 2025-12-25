# Notebook Scanner Plugin - Technical Plan

## Overview

An Obsidian plugin that allows users to capture/upload photos of handwritten notebooks, send them to a backend service for LLM-powered OCR processing, and automatically sync the generated notes back into their vault.

**Key Feature**: Background processing - users can upload photos, close the app, and return later to find their notes ready.

---

## Architecture

The plugin is a thin client that communicates with an external backend service (see `backend-spec.md` for API details).

```
┌─────────────────────────────────────────────────────────────────┐
│                        OBSIDIAN PLUGIN                          │
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │  Upload   │  │   Sync    │  │  Status   │  │    Note     │  │
│  │    UI     │─▶│  Client   │─▶│  Poller   │─▶│  Creator    │  │
│  └───────────┘  └───────────┘  └───────────┘  └─────────────┘  │
│        │                                             │          │
│        ▼                                             ▼          │
│  ┌───────────┐                                ┌─────────────┐  │
│  │  Settings │                                │    Vault    │  │
│  │    Tab    │                                │     API     │  │
│  └───────────┘                                └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (requestUrl)
                              ▼
                    ┌───────────────────┐
                    │  Backend Service  │
                    │  (see backend-    │
                    │   spec.md)        │
                    └───────────────────┘
```

### Plugin Responsibilities

1. **Upload images** to backend service
2. **Poll for job status** at configurable intervals
3. **Fetch completed results** from backend
4. **Create markdown notes** in vault with proper formatting
5. **Track sync state** to avoid duplicate note creation
6. **Manage settings** (service URL, API key, folder paths)

---

## Platform Compatibility

**Target**: iOS, Android, macOS, Windows, Linux

### iOS Constraints

These limitations apply to all plugin code:

| Constraint | Implication |
|------------|-------------|
| No Node.js APIs | Cannot use `fs`, `path`, `crypto`, `buffer` |
| No Electron APIs | Cannot use `require('electron')` |
| No regex lookbehind | Use capture groups instead |
| HTTPS only | HTTP requests fail on iOS 17+ |
| App suspension | Processing stops when backgrounded (hence external service) |

### Implementation

```typescript
import { Platform, requestUrl } from "obsidian";

// Use Obsidian's requestUrl for all HTTP (bypasses CORS)
const response = await requestUrl({
  url: `${serviceUrl}/api/jobs`,
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

// Platform detection when needed
if (Platform.isMobile) {
  // Mobile-specific UI adjustments
}
```

---

## Core Components

### 1. Sync Client

Handles all communication with the backend API.

```typescript
class SyncClient {
  constructor(private settings: PluginSettings) {}

  // Upload images to backend
  async uploadImages(files: File[]): Promise<{ jobIds: string[] }>;

  // Get all jobs, optionally filtered by status
  async getJobs(status?: JobStatus): Promise<Job[]>;

  // Get single job status
  async getJob(jobId: string): Promise<Job>;

  // Get processed result for completed job
  async getResult(jobId: string): Promise<ProcessedNote>;

  // Delete a job
  async deleteJob(jobId: string): Promise<void>;

  // Retry a failed job
  async retryJob(jobId: string): Promise<void>;

  // Get/update user settings on backend
  async getSettings(): Promise<BackendSettings>;
  async updateSettings(settings: Partial<BackendSettings>): Promise<void>;

  // Validate LLM API key
  async validateLLMKey(provider: string, apiKey: string): Promise<{ valid: boolean }>;
}
```

### 2. Job Poller

Background process that checks for completed jobs and triggers sync.

```typescript
class JobPoller {
  private intervalId: number | null = null;

  // Start polling at configured interval
  start(): void;

  // Stop polling (called on plugin unload)
  stop(): void;

  // Manual trigger (for "Sync Now" command)
  async pollNow(): Promise<SyncResult>;

  // Check for completed jobs and sync them
  private async syncCompletedJobs(): Promise<SyncResult>;
}
```

**Polling Behavior**:
- Default interval: 30 seconds
- Only polls when Obsidian is in foreground
- Backs off on repeated errors (exponential backoff)
- Notifies user when new notes are synced

### 3. Note Creator

Creates markdown files in vault from processed results.

```typescript
class NoteCreator {
  // Create a note from a processed result
  async createNote(result: ProcessedNote): Promise<TFile>;

  // Generate filename based on settings
  private generateFilename(result: ProcessedNote): string;

  // Format note content using template
  private formatContent(result: ProcessedNote): string;

  // Determine folder path based on organization style
  private getTargetFolder(result: ProcessedNote): string;
}
```

### 4. Sync State Manager

Tracks which jobs have been synced to prevent duplicates.

```typescript
class SyncStateManager {
  // Check if a job has already been synced
  isSynced(jobId: string): boolean;

  // Mark a job as synced
  markSynced(jobId: string): void;

  // Get all synced job IDs
  getSyncedIds(): string[];

  // Clear old entries (cleanup)
  prune(olderThan: Date): void;
}
```

**Storage**: Uses `this.plugin.saveData()` to persist sync state across sessions.

---

## Settings

### Plugin Settings Interface

```typescript
interface PluginSettings {
  // Service Configuration
  serviceUrl: string;           // Backend API URL
  apiKey: string;               // User's API key for the service

  // Folder Configuration
  outputFolder: string;         // Where to create notes (default: "Notebook Notes")
  attachmentFolder: string;     // Where to save images locally (default: "Attachments/Scans")
  organizationStyle: 'flat' | 'date' | 'category';

  // Sync Options
  pollInterval: number;         // Milliseconds between polls (default: 30000)
  autoSync: boolean;            // Poll automatically (default: true)
  keepLocalCopy: boolean;       // Save uploaded images to vault (default: true)
  notifyOnSync: boolean;        // Show notice when notes synced (default: true)

  // Note Formatting
  noteTemplate: string;         // Custom template with {{placeholders}}
  includeSourceImage: boolean;  // Embed image in note (default: false)
  frontmatterFormat: 'yaml' | 'none';
}

const DEFAULT_SETTINGS: PluginSettings = {
  serviceUrl: '',
  apiKey: '',
  outputFolder: 'Notebook Notes',
  attachmentFolder: 'Attachments/Scans',
  organizationStyle: 'flat',
  pollInterval: 30000,
  autoSync: true,
  keepLocalCopy: true,
  notifyOnSync: true,
  noteTemplate: DEFAULT_TEMPLATE,
  includeSourceImage: false,
  frontmatterFormat: 'yaml'
};
```

### Settings Tab

The settings tab should include:

1. **Connection Settings**
   - Service URL input
   - API key input (password field)
   - "Test Connection" button
   - Connection status indicator

2. **LLM Configuration** (synced with backend)
   - Provider dropdown (Gemini, OpenAI, Anthropic)
   - Model selection
   - LLM API key input
   - "Validate Key" button
   - Custom prompt textarea

3. **Folder Settings**
   - Output folder picker
   - Attachment folder picker
   - Organization style dropdown

4. **Sync Settings**
   - Auto-sync toggle
   - Poll interval slider (10s - 5min)
   - Notification toggle

5. **Note Formatting**
   - Template editor with placeholder reference
   - Frontmatter toggle
   - Include source image toggle

---

## User Interface

### Commands

Register these commands in the command palette:

| Command | Description |
|---------|-------------|
| `Upload Images` | Opens file picker to select and upload images |
| `Sync Now` | Manually trigger sync of completed jobs |
| `View Queue` | Open modal showing all jobs and their status |
| `Open Settings` | Jump to plugin settings tab |

### Ribbon Icon

Add a camera/notebook icon to the left ribbon that opens the upload modal.

### Upload Modal

```
┌─────────────────────────────────────────┐
│  Upload Notebook Scans                  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │     Drag & drop images here     │    │
│  │           or click to           │    │
│  │         select files            │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Selected: 3 images                     │
│  • IMG_001.jpg (2.4 MB)                 │
│  • IMG_002.jpg (1.8 MB)                 │
│  • IMG_003.jpg (2.1 MB)                 │
│                                         │
│  [Cancel]              [Upload]         │
└─────────────────────────────────────────┘
```

**Mobile Considerations**:
- Large touch targets (minimum 44x44px)
- File picker triggers system photo picker with camera option
- Show upload progress with percentage

### Queue Modal

```
┌─────────────────────────────────────────┐
│  Processing Queue                [Sync] │
├─────────────────────────────────────────┤
│  Filter: [All ▼]                        │
├─────────────────────────────────────────┤
│  ✓ Meeting notes - Jan 15     completed │
│    Synced to vault                      │
├─────────────────────────────────────────┤
│  ◐ IMG_002.jpg              processing  │
│    Started 30 seconds ago               │
├─────────────────────────────────────────┤
│  ○ IMG_003.jpg                 pending  │
│    Queued                               │
├─────────────────────────────────────────┤
│  ✗ IMG_004.jpg                  failed  │
│    Rate limit exceeded    [Retry]       │
└─────────────────────────────────────────┘
```

**Interactions**:
- Tap completed job → open created note
- Tap failed job → show error, offer retry
- Swipe to delete (mobile)
- Pull to refresh (mobile)

### Status Bar (Optional)

Show current sync status in Obsidian's status bar:

```
📓 2 processing · 1 ready
```

Click to open queue modal.

---

## Note Template

### Default Template

```typescript
const DEFAULT_TEMPLATE = `---
title: "{{title}}"
date: {{date}}
tags:
{{#tags}}
  - {{.}}
{{/tags}}
category: {{category}}
source_job: {{jobId}}
synced_at: {{syncedAt}}
---

# {{title}}

{{content}}

---

> **Summary**: {{summary}}
`;
```

### Available Placeholders

| Placeholder | Description |
|-------------|-------------|
| `{{title}}` | Generated title |
| `{{content}}` | Main note content (markdown) |
| `{{summary}}` | 1-2 sentence summary |
| `{{date}}` | Extracted date or "unknown" |
| `{{tags}}` | Array of tags |
| `{{category}}` | Category (meeting, lecture, etc.) |
| `{{jobId}}` | Backend job ID |
| `{{syncedAt}}` | ISO timestamp when synced |
| `{{sourceImage}}` | Embed link to local image (if kept) |

### Filename Generation

Based on `organizationStyle` setting:

- **flat**: `{title}.md` in output folder
- **date**: `{YYYY}/{MM}/{title}.md`
- **category**: `{category}/{title}.md`

Handle filename conflicts by appending numbers: `title.md`, `title 1.md`, `title 2.md`

---

## Data Persistence

### Plugin Data Structure

```typescript
interface PluginData {
  settings: PluginSettings;
  syncState: {
    syncedJobIds: string[];
    lastSyncTime: string | null;
  };
}
```

Saved via `this.saveData()` / `this.loadData()`.

### Sync State Cleanup

Periodically remove job IDs older than 30 days to prevent unbounded growth:

```typescript
async cleanupSyncState() {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  // Remove entries older than 30 days
  // (Would need to store timestamps with job IDs)
}
```

---

## Error Handling

### Network Errors

- Show notice: "Failed to connect to Notebook Scanner service"
- Retry with exponential backoff
- Don't spam notifications (debounce repeated errors)

### Authentication Errors

- 401 response → Show notice: "Invalid API key. Check settings."
- Disable auto-sync until settings updated

### Upload Errors

- File too large → Show in upload modal, don't upload
- Partial failure → Show which succeeded/failed
- Network failure → Allow retry

### Sync Errors

- Job failed on backend → Show in queue modal with error message
- Result fetch failed → Retry on next poll

---

## Implementation Phases

### Phase 1: Foundation ✅
- [x] Project setup from obsidian-sample-plugin
- [x] Settings interface and tab
- [x] SyncClient with all API methods
- [x] Basic error handling

### Phase 2: Core Upload Flow ✅
- [x] Upload modal UI
- [x] File picker integration
- [x] Image upload to backend
- [x] Local image saving (optional)
- [x] Upload progress indication

### Phase 3: Sync & Note Creation ✅
- [x] JobPoller implementation
- [x] SyncStateManager
- [x] NoteCreator with template system
- [x] Folder organization logic
- [x] Sync notifications

### Phase 4: Queue Management ✅
- [x] Queue modal UI
- [x] Job status display
- [x] Retry failed jobs
- [x] Delete jobs
- [x] Manual sync trigger

### Phase 5: Polish ✅
- [x] Mobile UI optimization (mobile-first CSS with 44px touch targets, safe areas)
- [x] Status bar widget (shows pending/processing/failed counts)
- [x] Ribbon icon (notebook icon)
- [x] Onboarding flow (first-time setup with connection test)
- [x] Error handling improvements (status bar integration, better UX)

### Phase 6: Advanced Features
- [ ] Custom note templates
- [ ] Direct camera capture
- [ ] Batch upload optimizations
- [ ] Daily note integration

---

## Project Structure

```
notebook-scanner-plugin/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Settings tab
│   ├── sync-client.ts       # Backend API client
│   ├── job-poller.ts        # Background polling
│   ├── note-creator.ts      # Note file creation
│   ├── sync-state.ts        # Sync state management
│   ├── ui/
│   │   ├── upload-modal.ts  # Upload interface
│   │   ├── queue-modal.ts   # Queue management
│   │   └── components.ts    # Shared UI components
│   └── types.ts             # TypeScript interfaces
├── styles.css               # Plugin styles
├── manifest.json            # Plugin manifest
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── README.md
```

---

## Testing Strategy

### Desktop Testing
1. Enable mobile emulation: `this.app.emulateMobile(true)`
2. Test all UI flows
3. Test with various image sizes
4. Test error scenarios (network off, invalid API key)

### Mobile Testing
1. Build plugin: `npm run build`
2. Copy to vault: `.obsidian/plugins/notebook-scanner/`
3. Sync vault to device (iCloud, Obsidian Sync)
4. Test upload via file picker
5. Test sync notifications
6. Test queue modal interactions

### Edge Cases
- Upload 50 images at once
- Poor network conditions
- App backgrounded during upload
- Duplicate job sync prevention
- Filename conflicts
- Very long note content

---

## Dependencies

**Required** (bundled by esbuild):
- `obsidian` - Obsidian API types

**No external runtime dependencies** - all functionality uses:
- Obsidian's `requestUrl()` for HTTP
- Obsidian's Vault API for file operations
- Native browser APIs for UI

---

## References

- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian API Types](https://github.com/obsidianmd/obsidian-api)
- [Mobile Development Guide](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development)
- [Plugin Developer Docs](https://marcusolsson.github.io/obsidian-plugin-docs/)
- Backend API specification: `backend-spec.md`
