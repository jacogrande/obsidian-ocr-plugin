/**
 * Sync State Manager - Tracks which jobs have been synced to prevent duplicates.
 *
 * Following:
 * - Single Responsibility: Only handles sync state tracking
 * - Open/Closed: Easy to extend with new state fields
 */

import type { SyncState, SyncedJob } from './types';
import { DEFAULT_SYNC_STATE, CONSTRAINTS } from './constants';

/**
 * Callback for persisting state changes.
 */
export type StatePersister = (state: SyncState) => Promise<void>;

/**
 * Manages the sync state - tracking which jobs have been synced.
 */
export class SyncStateManager {
  private state: SyncState;
  private persister: StatePersister;

  constructor(initialState: Partial<SyncState>, persister: StatePersister) {
    this.state = {
      ...DEFAULT_SYNC_STATE,
      ...initialState,
    };
    this.persister = persister;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Check if a job has already been synced.
   */
  isSynced(jobId: string): boolean {
    return this.state.syncedJobs.some((job) => job.jobId === jobId);
  }

  /**
   * Get all synced job IDs.
   */
  getSyncedJobIds(): string[] {
    return this.state.syncedJobs.map((job) => job.jobId);
  }

  /**
   * Get synced job info by ID.
   */
  getSyncedJob(jobId: string): SyncedJob | undefined {
    return this.state.syncedJobs.find((job) => job.jobId === jobId);
  }

  /**
   * Get the last sync time.
   */
  getLastSyncTime(): Date | null {
    return this.state.lastSyncTime ? new Date(this.state.lastSyncTime) : null;
  }

  /**
   * Get count of synced jobs.
   */
  getSyncedCount(): number {
    return this.state.syncedJobs.length;
  }

  /**
   * Get the current state (for persistence).
   */
  getState(): SyncState {
    return { ...this.state };
  }

  // ============================================================================
  // Mutation Methods
  // ============================================================================

  /**
   * Mark a job as synced.
   */
  async markSynced(jobId: string, notePath: string): Promise<void> {
    // Avoid duplicates
    if (this.isSynced(jobId)) {
      return;
    }

    this.state.syncedJobs.push({
      jobId,
      syncedAt: new Date().toISOString(),
      notePath,
    });
    this.state.lastSyncTime = new Date().toISOString();

    await this.persist();
  }

  /**
   * Mark multiple jobs as synced.
   */
  async markMultipleSynced(jobs: Array<{ jobId: string; notePath: string }>): Promise<void> {
    const now = new Date().toISOString();

    for (const { jobId, notePath } of jobs) {
      if (!this.isSynced(jobId)) {
        this.state.syncedJobs.push({
          jobId,
          syncedAt: now,
          notePath,
        });
      }
    }

    this.state.lastSyncTime = now;
    await this.persist();
  }

  /**
   * Remove a synced job (e.g., if the note was deleted).
   */
  async removeSynced(jobId: string): Promise<void> {
    this.state.syncedJobs = this.state.syncedJobs.filter(
      (job) => job.jobId !== jobId
    );
    await this.persist();
  }

  /**
   * Prune old sync state entries to prevent unbounded growth.
   */
  async prune(olderThanDays: number = CONSTRAINTS.SYNC_STATE_RETENTION_DAYS): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const originalCount = this.state.syncedJobs.length;

    this.state.syncedJobs = this.state.syncedJobs.filter((job) => {
      const syncedAt = new Date(job.syncedAt).getTime();
      return syncedAt > cutoff;
    });

    const prunedCount = originalCount - this.state.syncedJobs.length;

    if (prunedCount > 0) {
      await this.persist();
    }

    return prunedCount;
  }

  /**
   * Clear all sync state.
   */
  async clear(): Promise<void> {
    this.state = { ...DEFAULT_SYNC_STATE };
    await this.persist();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async persist(): Promise<void> {
    await this.persister(this.state);
  }
}
