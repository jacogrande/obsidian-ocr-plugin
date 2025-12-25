/**
 * Job Poller - Background polling for completed jobs.
 *
 * Following:
 * - Single Responsibility: Only handles polling and triggering sync
 * - Dependency Inversion: Depends on interfaces, not concrete implementations
 */

import { Notice } from 'obsidian';
import type { ISyncClient, Job, ProcessedNote, PluginSettings } from './types';
import type { SyncStateManager } from './sync-state';
import type { NoteCreator, CreateNoteResult } from './note-creator';

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  syncedCount: number;
  failedCount: number;
  results: Array<{
    jobId: string;
    success: boolean;
    notePath?: string;
    error?: string;
  }>;
}

/**
 * Configuration for the job poller.
 */
export interface JobPollerConfig {
  syncClient: ISyncClient;
  syncStateManager: SyncStateManager;
  noteCreator: NoteCreator;
  getSettings: () => PluginSettings;
  onSyncComplete?: (result: SyncResult) => void;
  onPollerStopped?: () => void;
  onSyncProgress?: (current: number, total: number) => void;
}

/**
 * Polls for completed jobs and triggers note creation.
 */
export class JobPoller {
  private config: JobPollerConfig;
  private intervalId: number | null = null;
  private isPolling = false;
  private isPaused = false;
  private isStopped = false;
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 5;
  private readonly BASE_BACKOFF_MS = 5000;

  constructor(config: JobPollerConfig) {
    this.config = config;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the polling loop.
   */
  start(): void {
    if (this.intervalId !== null) {
      console.log('JobPoller already running');
      return;
    }

    const settings = this.config.getSettings();
    if (!settings.autoSync) {
      console.log('Auto-sync disabled, not starting poller');
      return;
    }

    console.log(`Starting JobPoller with ${settings.pollInterval}ms interval`);
    this.scheduleNextPoll();
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    if (this.intervalId !== null) {
      window.clearTimeout(this.intervalId);
      this.intervalId = null;
      console.log('JobPoller stopped');
    }
  }

  /**
   * Pause polling (e.g., when app is backgrounded).
   */
  pause(): void {
    this.isPaused = true;
    console.log('JobPoller paused');
  }

  /**
   * Resume polling.
   */
  resume(): void {
    this.isPaused = false;
    console.log('JobPoller resumed');
  }

  /**
   * Check if the poller is currently running.
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Restart the poller with updated settings.
   */
  restart(): void {
    this.stop();
    this.consecutiveErrors = 0;
    this.isStopped = false;
    this.start();
  }

  /**
   * Check if the poller stopped due to errors.
   */
  isStoppedDueToErrors(): boolean {
    return this.isStopped;
  }

  /**
   * Resume after being stopped due to errors.
   */
  resumeAfterError(): void {
    if (!this.isStopped) {
      return;
    }

    console.log('Resuming JobPoller after error stop');
    this.consecutiveErrors = 0;
    this.isStopped = false;
    this.start();
  }

  // ============================================================================
  // Polling Logic
  // ============================================================================

  /**
   * Schedule the next poll.
   */
  private scheduleNextPoll(): void {
    const settings = this.config.getSettings();
    let delay = settings.pollInterval;

    // Apply exponential backoff on consecutive errors
    if (this.consecutiveErrors > 0) {
      const backoff = Math.min(
        this.BASE_BACKOFF_MS * Math.pow(2, this.consecutiveErrors - 1),
        300000 // Max 5 minutes
      );
      delay = Math.max(delay, backoff);
      console.log(`Backoff applied: ${delay}ms (${this.consecutiveErrors} consecutive errors)`);
    }

    this.intervalId = window.setTimeout(() => {
      this.poll();
    }, delay);
  }

  /**
   * Perform a single poll.
   */
  private async poll(): Promise<void> {
    if (this.isPaused || this.isPolling) {
      this.scheduleNextPoll();
      return;
    }

    const settings = this.config.getSettings();
    if (!settings.autoSync) {
      return; // Don't reschedule if auto-sync is disabled
    }

    try {
      this.isPolling = true;
      const result = await this.syncCompletedJobs();

      // Reset error counter on success
      this.consecutiveErrors = 0;

      // Notify if we synced anything
      if (result.syncedCount > 0 && settings.notifyOnSync) {
        new Notice(
          `Synced ${result.syncedCount} new note${result.syncedCount !== 1 ? 's' : ''} to ${settings.outputFolder}/`
        );
      }

      // Callback
      if (this.config.onSyncComplete) {
        this.config.onSyncComplete(result);
      }
    } catch (error) {
      console.error('Poll failed:', error);
      this.consecutiveErrors++;

      // Stop polling after too many consecutive errors
      if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        console.error('Too many consecutive errors, stopping poller');
        this.isStopped = true;
        new Notice('Notebook Scanner sync paused. Tap status bar to resume.');
        if (this.config.onPollerStopped) {
          this.config.onPollerStopped();
        }
        return;
      }
    } finally {
      this.isPolling = false;
      this.scheduleNextPoll();
    }
  }

  /**
   * Manually trigger a sync (for "Sync Now" command).
   */
  async syncNow(): Promise<SyncResult> {
    if (this.isPolling) {
      return {
        syncedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    try {
      this.isPolling = true;
      return await this.syncCompletedJobs();
    } finally {
      this.isPolling = false;
    }
  }

  // ============================================================================
  // Sync Logic
  // ============================================================================

  /**
   * Sync all completed jobs that haven't been synced yet.
   */
  private async syncCompletedJobs(): Promise<SyncResult> {
    const results: SyncResult['results'] = [];

    // Fetch completed jobs
    const completedJobs = await this.config.syncClient.getJobs('completed');

    // Filter to unsynced jobs
    const unsyncedJobs = completedJobs.filter(
      (job) => !this.config.syncStateManager.isSynced(job.id)
    );

    if (unsyncedJobs.length === 0) {
      return {
        syncedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    console.log(`Found ${unsyncedJobs.length} unsynced completed jobs`);

    // Process each job
    for (let i = 0; i < unsyncedJobs.length; i++) {
      const job = unsyncedJobs[i];

      // Report progress
      if (this.config.onSyncProgress) {
        this.config.onSyncProgress(i + 1, unsyncedJobs.length);
      }

      const result = await this.syncJob(job);
      results.push(result);
    }

    const syncedCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return {
      syncedCount,
      failedCount,
      results,
    };
  }

  /**
   * Sync a single job - fetch result and create note.
   */
  private async syncJob(job: Job): Promise<SyncResult['results'][0]> {
    try {
      // Fetch the result
      const processedNote = await this.config.syncClient.getResult(job.id);

      // Create the note
      const createResult = await this.config.noteCreator.createNote(processedNote);

      if (!createResult.success) {
        throw new Error(createResult.error || 'Failed to create note');
      }

      // Mark as synced
      await this.config.syncStateManager.markSynced(job.id, createResult.filePath!);

      return {
        jobId: job.id,
        success: true,
        notePath: createResult.filePath,
      };
    } catch (error) {
      console.error(`Failed to sync job ${job.id}:`, error);
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
