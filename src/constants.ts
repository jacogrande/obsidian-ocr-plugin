/**
 * Application constants and default values.
 */

import type { PluginSettings, SyncState } from './types';

// ============================================================================
// Default Note Template
// ============================================================================

export const DEFAULT_NOTE_TEMPLATE = `---
title: "{{title}}"
date: {{date}}
tags: [{{tags}}]
category: {{category}}
source_job: {{jobId}}
synced_at: {{syncedAt}}
---

# {{title}}

{{content}}

---

> **Summary**: {{summary}}
`;

// ============================================================================
// Default Settings
// ============================================================================

export const DEFAULT_SETTINGS: PluginSettings = {
  // Service Configuration
  serviceUrl: '',
  apiKey: '',

  // Folder Configuration
  outputFolder: 'Notebook Notes',
  attachmentFolder: 'Attachments/Scans',
  organizationStyle: 'flat',

  // Sync Options
  pollInterval: 30000, // 30 seconds
  autoSync: true,
  keepLocalCopy: true,
  notifyOnSync: true,

  // Note Formatting
  noteTemplate: DEFAULT_NOTE_TEMPLATE,
  includeSourceImage: false,
  frontmatterFormat: 'yaml',
};

// ============================================================================
// Default Sync State
// ============================================================================

export const DEFAULT_SYNC_STATE: SyncState = {
  syncedJobs: [],
  lastSyncTime: null,
};

// ============================================================================
// Constraints
// ============================================================================

export const CONSTRAINTS = {
  /** Minimum poll interval in milliseconds */
  MIN_POLL_INTERVAL: 10000, // 10 seconds

  /** Maximum poll interval in milliseconds */
  MAX_POLL_INTERVAL: 300000, // 5 minutes

  /** Maximum file size for upload in bytes */
  MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB

  /** Maximum images per upload batch */
  MAX_BATCH_SIZE: 50,

  /** Supported image formats */
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],

  /** Days to retain sync state entries */
  SYNC_STATE_RETENTION_DAYS: 30,
} as const;

// ============================================================================
// Template Placeholders
// ============================================================================

export const TEMPLATE_PLACEHOLDERS = [
  { key: '{{title}}', description: 'Generated note title' },
  { key: '{{content}}', description: 'Main note content (markdown)' },
  { key: '{{summary}}', description: '1-2 sentence summary' },
  { key: '{{date}}', description: 'Extracted date or "unknown"' },
  { key: '{{tags}}', description: 'Comma-separated tags' },
  { key: '{{category}}', description: 'Note category' },
  { key: '{{jobId}}', description: 'Backend job ID' },
  { key: '{{syncedAt}}', description: 'Sync timestamp (ISO)' },
  { key: '{{sourceImage}}', description: 'Embed link to source image' },
] as const;
