/**
 * Status Bar Widget - Shows sync status in Obsidian's status bar.
 *
 * Following:
 * - Single Responsibility: Only handles status bar display
 * - Observer Pattern: Listens to sync state changes
 */

import { setIcon } from 'obsidian';
import type { Job, JobStatus } from '../types';

/**
 * Sync status for display.
 */
export type SyncStatus = 'idle' | 'syncing' | 'pending' | 'error' | 'paused';

/**
 * Status counts for display.
 */
export interface StatusCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

/**
 * Configuration for the status bar widget.
 */
export interface StatusBarConfig {
  onClick: () => void;
}

/**
 * Status bar widget showing sync status.
 * Click to open the queue modal.
 */
export class StatusBarWidget {
  private containerEl: HTMLElement;
  private iconEl: HTMLElement;
  private textEl: HTMLElement;
  private config: StatusBarConfig;

  private status: SyncStatus = 'idle';
  private counts: StatusCounts = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };
  private syncProgress: { current: number; total: number } | null = null;

  /**
   * Set sync progress for large batches.
   */
  setSyncProgress(current: number, total: number): void {
    this.syncProgress = { current, total };
    this.render();
  }

  /**
   * Clear sync progress.
   */
  clearSyncProgress(): void {
    this.syncProgress = null;
    this.render();
  }

  constructor(statusBarEl: HTMLElement, config: StatusBarConfig) {
    this.config = config;

    // Create container
    this.containerEl = statusBarEl.createEl('div', {
      cls: 'notebook-scanner-status-bar',
      attr: { 'aria-label': 'Notebook Scanner Status' },
    });

    // Create icon
    this.iconEl = this.containerEl.createDiv({ cls: 'notebook-scanner-status-icon' });
    setIcon(this.iconEl, 'notebook');

    // Create text
    this.textEl = this.containerEl.createDiv({ cls: 'notebook-scanner-status-text' });

    // Add click handler
    this.containerEl.addEventListener('click', () => {
      this.config.onClick();
    });

    // Initial render
    this.render();
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Update status from job list.
   */
  updateFromJobs(jobs: Job[]): void {
    this.counts = {
      pending: jobs.filter((j) => j.status === 'pending').length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
    };

    this.updateStatus();
    this.render();
  }

  /**
   * Set syncing state.
   */
  setSyncing(isSyncing: boolean): void {
    if (isSyncing) {
      this.status = 'syncing';
    } else {
      this.updateStatus();
    }
    this.render();
  }

  /**
   * Show error state.
   */
  setError(hasError: boolean): void {
    if (hasError && this.status !== 'syncing') {
      this.status = 'error';
    } else if (!hasError) {
      this.updateStatus();
    }
    this.render();
  }

  /**
   * Show paused state (when poller stopped due to errors).
   */
  setPaused(isPaused: boolean): void {
    if (isPaused) {
      this.status = 'paused';
    } else {
      this.updateStatus();
    }
    this.render();
  }

  /**
   * Clean up the widget.
   */
  destroy(): void {
    this.containerEl.remove();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Calculate status from counts.
   */
  private updateStatus(): void {
    if (this.counts.failed > 0) {
      this.status = 'error';
    } else if (this.counts.processing > 0 || this.counts.pending > 0) {
      this.status = 'pending';
    } else {
      this.status = 'idle';
    }
  }

  /**
   * Render the widget.
   */
  private render(): void {
    // Update CSS classes
    this.containerEl.removeClass('is-syncing', 'has-pending', 'has-error', 'is-paused');

    switch (this.status) {
      case 'syncing':
        this.containerEl.addClass('is-syncing');
        setIcon(this.iconEl, 'refresh-cw');
        break;
      case 'pending':
        this.containerEl.addClass('has-pending');
        setIcon(this.iconEl, 'clock');
        break;
      case 'error':
        this.containerEl.addClass('has-error');
        setIcon(this.iconEl, 'alert-circle');
        break;
      case 'paused':
        this.containerEl.addClass('is-paused');
        setIcon(this.iconEl, 'pause-circle');
        break;
      default:
        setIcon(this.iconEl, 'notebook');
    }

    // Update text
    this.textEl.setText(this.getStatusText());

    // Update aria-label
    this.containerEl.setAttribute('aria-label', this.getAriaLabel());
  }

  /**
   * Get status text for display.
   */
  private getStatusText(): string {
    if (this.status === 'syncing') {
      if (this.syncProgress && this.syncProgress.total > 1) {
        return `Syncing ${this.syncProgress.current}/${this.syncProgress.total}...`;
      }
      return 'Syncing...';
    }

    if (this.status === 'paused') {
      return 'Paused - tap to resume';
    }

    const parts: string[] = [];

    if (this.counts.processing > 0) {
      parts.push(`${this.counts.processing} processing`);
    }

    if (this.counts.pending > 0) {
      parts.push(`${this.counts.pending} pending`);
    }

    if (this.counts.failed > 0) {
      parts.push(`${this.counts.failed} failed`);
    }

    if (parts.length === 0) {
      return 'Ready';
    }

    return parts.join(' · ');
  }

  /**
   * Get aria-label for accessibility.
   */
  private getAriaLabel(): string {
    const statusText = this.getStatusText();
    return `Notebook Scanner: ${statusText}. Click to open queue.`;
  }
}
