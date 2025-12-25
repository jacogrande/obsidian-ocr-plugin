/**
 * Queue Modal - UI for viewing and managing processing jobs.
 *
 * Following:
 * - Single Responsibility: Only handles queue display and job actions
 * - Dependency Inversion: Depends on ISyncClient interface
 * - Open/Closed: Easy to add new job actions without modifying core logic
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type { ISyncClient, Job, JobStatus } from '../types';
import { getUserErrorMessage } from '../errors';

/**
 * Configuration for the queue modal.
 */
export interface QueueModalConfig {
  syncClient: ISyncClient;
  onSyncNow: () => Promise<void>;
  onOpenNote?: (notePath: string) => void;
  getSyncedNotePath?: (jobId: string) => string | undefined;
  onDeleteNote?: (notePath: string) => Promise<boolean>;
  onRemoveSyncedJob?: (jobId: string) => Promise<void>;
  onJobsChanged?: () => void;
  hasUnsyncedJob?: (jobId: string) => boolean;
}

/**
 * Filter options for displaying jobs.
 */
type JobFilter = 'all' | JobStatus;

/**
 * Modal for viewing and managing the processing queue.
 */
export class QueueModal extends Modal {
  private config: QueueModalConfig;
  private jobs: Job[] = [];
  private filter: JobFilter = 'all';
  private isLoading = false;
  private isRefreshing = false;

  // UI Elements
  private jobListContainer!: HTMLElement;
  private filterSelect!: HTMLSelectElement;
  private refreshButton!: HTMLButtonElement;
  private syncButton!: HTMLButtonElement;
  private retryAllButton!: HTMLButtonElement;

  // Prevent duplicate auto-syncs
  private isAutoSyncing = false;

  constructor(app: App, config: QueueModalConfig) {
    super(app);
    this.config = config;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('notebook-scanner-queue-modal');

    this.renderHeader(contentEl);
    this.renderToolbar(contentEl);
    this.renderJobList(contentEl);

    // Initial load
    await this.loadJobs();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.jobs = [];
  }

  // ============================================================================
  // Render Methods
  // ============================================================================

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'queue-modal-header' });
    header.createEl('h2', { text: 'Processing Queue' });
  }

  private renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: 'queue-modal-toolbar' });

    // Filter dropdown
    const filterContainer = toolbar.createDiv({ cls: 'queue-filter-container' });
    filterContainer.createEl('label', { text: 'Filter:', cls: 'queue-filter-label' });

    this.filterSelect = filterContainer.createEl('select', { cls: 'queue-filter-select' });
    this.addFilterOptions();
    this.filterSelect.addEventListener('change', () => {
      this.filter = this.filterSelect.value as JobFilter;
      this.updateJobList();
    });

    // Action buttons
    const actions = toolbar.createDiv({ cls: 'queue-toolbar-actions' });

    this.refreshButton = actions.createEl('button', {
      cls: 'queue-refresh-button',
      attr: { 'aria-label': 'Refresh' },
    });
    setIcon(this.refreshButton, 'refresh-cw');
    this.refreshButton.addEventListener('click', () => this.handleRefresh());

    this.retryAllButton = actions.createEl('button', {
      text: 'Retry All Failed',
      cls: 'queue-retry-all-button',
    });
    this.retryAllButton.addEventListener('click', () => this.handleRetryAllFailed());

    this.syncButton = actions.createEl('button', {
      text: 'Sync Now',
      cls: 'queue-sync-button mod-cta',
    });
    this.syncButton.addEventListener('click', () => this.handleSyncNow());
  }

  private addFilterOptions(): void {
    const options: Array<{ value: JobFilter; label: string }> = [
      { value: 'all', label: 'All Jobs' },
      { value: 'pending', label: 'Pending' },
      { value: 'processing', label: 'Processing' },
      { value: 'completed', label: 'Completed' },
      { value: 'failed', label: 'Failed' },
    ];

    for (const opt of options) {
      const option = this.filterSelect.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === this.filter) {
        option.selected = true;
      }
    }
  }

  private renderJobList(container: HTMLElement): void {
    this.jobListContainer = container.createDiv({ cls: 'queue-job-list' });
  }

  // ============================================================================
  // Job Loading
  // ============================================================================

  private async loadJobs(): Promise<void> {
    this.isLoading = true;
    this.updateLoadingState();

    try {
      this.jobs = await this.config.syncClient.getJobs();
      this.updateJobList();
      // Notify parent to update status bar
      this.config.onJobsChanged?.();

      // Auto-sync if there are completed jobs that haven't been synced yet
      // Only do this once per modal open to avoid loops
      if (!this.isAutoSyncing) {
        const hasUnsyncedCompleted = this.jobs.some(
          (job) => job.status === 'completed' && !this.config.getSyncedNotePath?.(job.id)
        );
        if (hasUnsyncedCompleted) {
          this.isAutoSyncing = true;
          // Trigger sync in background
          this.config.onSyncNow().then(() => {
            // Reload jobs after sync to update the UI
            this.loadJobs();
          }).catch((err) => {
            console.error('Auto-sync failed:', err);
          }).finally(() => {
            this.isAutoSyncing = false;
          });
        }
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
      this.showError('Failed to load jobs. Please try again.');
    } finally {
      this.isLoading = false;
      this.updateLoadingState();
    }
  }

  private async handleRefresh(): Promise<void> {
    if (this.isRefreshing) return;

    this.isRefreshing = true;
    this.refreshButton.addClass('is-spinning');

    try {
      await this.loadJobs();
    } finally {
      this.isRefreshing = false;
      this.refreshButton.removeClass('is-spinning');
    }
  }

  private async handleSyncNow(): Promise<void> {
    this.syncButton.disabled = true;
    this.syncButton.setText('Syncing...');

    try {
      await this.config.onSyncNow();
      await this.loadJobs();
      new Notice('Sync complete');
    } catch (error) {
      console.error('Sync failed:', error);
      new Notice(`Sync failed: ${getUserErrorMessage(error)}`);
    } finally {
      this.syncButton.disabled = false;
      this.syncButton.setText('Sync Now');
    }
  }

  private async handleRetryAllFailed(): Promise<void> {
    const failedJobs = this.jobs.filter((j) => j.status === 'failed');
    if (failedJobs.length === 0) {
      new Notice('No failed jobs to retry');
      return;
    }

    this.retryAllButton.disabled = true;
    this.retryAllButton.setText(`Retrying ${failedJobs.length}...`);

    let successCount = 0;
    let failCount = 0;

    for (const job of failedJobs) {
      try {
        await this.config.syncClient.retryJob(job.id);
        successCount++;
      } catch (error) {
        console.error(`Retry failed for job ${job.id}:`, error);
        failCount++;
      }
    }

    await this.loadJobs();

    if (failCount === 0) {
      new Notice(`${successCount} job${successCount !== 1 ? 's' : ''} queued for retry`);
    } else {
      new Notice(`${successCount} queued, ${failCount} failed to retry`);
    }

    this.retryAllButton.disabled = false;
    this.updateRetryAllButtonText();
  }

  private updateRetryAllButtonText(): void {
    const failedCount = this.jobs.filter((j) => j.status === 'failed').length;
    if (failedCount > 0) {
      this.retryAllButton.setText(`Retry All Failed (${failedCount})`);
    }
  }

  // ============================================================================
  // Job List Rendering
  // ============================================================================

  private updateJobList(): void {
    this.jobListContainer.empty();

    // Show/hide retry all button based on failed jobs
    const failedCount = this.jobs.filter((j) => j.status === 'failed').length;
    if (failedCount > 0) {
      this.retryAllButton.style.display = '';
      this.retryAllButton.setText(`Retry All Failed (${failedCount})`);
    } else {
      this.retryAllButton.style.display = 'none';
    }

    const filteredJobs = this.getFilteredJobs();

    if (filteredJobs.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Sort by creation date (newest first)
    const sortedJobs = [...filteredJobs].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    for (const job of sortedJobs) {
      this.renderJobItem(job);
    }
  }

  private getFilteredJobs(): Job[] {
    if (this.filter === 'all') {
      return this.jobs;
    }
    return this.jobs.filter((job) => job.status === this.filter);
  }

  private renderEmptyState(): void {
    const empty = this.jobListContainer.createDiv({ cls: 'queue-empty-state' });

    const icon = empty.createDiv({ cls: 'queue-empty-icon' });
    setIcon(icon, 'inbox');

    if (this.filter === 'all') {
      empty.createEl('p', { text: 'No jobs in queue' });
      empty.createEl('p', {
        text: 'Upload some notebook scans to get started',
        cls: 'queue-empty-hint'
      });
    } else {
      empty.createEl('p', { text: `No ${this.filter} jobs` });
    }
  }

  private renderJobItem(job: Job): void {
    const item = this.jobListContainer.createDiv({ cls: 'queue-job-item' });
    item.addClass(`status-${job.status}`);

    // Status indicator
    const statusIcon = item.createDiv({ cls: 'queue-job-status-icon' });
    setIcon(statusIcon, this.getStatusIcon(job.status));

    // Job info
    const info = item.createDiv({ cls: 'queue-job-info' });

    // Use filename as title, with better fallback
    const displayName = this.getJobDisplayName(job);
    const title = info.createDiv({ cls: 'queue-job-title' });
    title.setText(displayName);

    const meta = info.createDiv({ cls: 'queue-job-meta' });
    meta.setText(this.formatJobMeta(job));

    // Show note path for synced completed jobs
    if (job.status === 'completed') {
      const notePath = this.config.getSyncedNotePath?.(job.id);
      if (notePath) {
        const notePathEl = info.createDiv({ cls: 'queue-job-note-path' });
        notePathEl.setText(`→ ${notePath}`);
      }
    }

    // Error message for failed jobs
    if (job.status === 'failed' && job.error) {
      const errorEl = info.createDiv({ cls: 'queue-job-error' });
      errorEl.setText(job.error);
    }

    // Actions
    const actions = item.createDiv({ cls: 'queue-job-actions' });
    this.renderJobActions(job, actions);

    // Click handler for completed jobs
    if (job.status === 'completed') {
      const notePath = this.config.getSyncedNotePath?.(job.id);
      if (notePath && this.config.onOpenNote) {
        item.addClass('is-clickable');
        item.addEventListener('click', (e) => {
          // Don't trigger if clicking action buttons
          if ((e.target as HTMLElement).closest('.queue-job-actions')) return;
          this.config.onOpenNote?.(notePath);
          this.close();
        });
      }
    }
  }

  /**
   * Get a user-friendly display name for a job.
   */
  private getJobDisplayName(job: Job): string {
    if (job.filename) {
      // Remove extension for cleaner display
      return job.filename.replace(/\.[^/.]+$/, '');
    }
    // Fallback to truncated ID
    return `Scan ${job.id.substring(0, 8)}`;
  }

  private renderJobActions(job: Job, container: HTMLElement): void {
    switch (job.status) {
      case 'failed':
        this.renderRetryButton(job, container);
        this.renderDeleteButton(job, container);
        break;
      case 'completed':
        // Show "Open Note" hint if synced
        const notePath = this.config.getSyncedNotePath?.(job.id);
        if (notePath) {
          const hint = container.createDiv({ cls: 'queue-job-synced-hint' });
          hint.setText('Click to open');
        }
        this.renderDeleteButton(job, container);
        break;
      case 'pending':
        this.renderDeleteButton(job, container);
        break;
      case 'processing':
        // No actions while processing
        const spinner = container.createDiv({ cls: 'queue-job-spinner' });
        setIcon(spinner, 'loader');
        break;
    }
  }

  private renderRetryButton(job: Job, container: HTMLElement): void {
    const button = container.createEl('button', {
      cls: 'queue-job-action-button queue-retry-button',
      attr: { 'aria-label': 'Retry' },
    });
    setIcon(button, 'refresh-cw');
    button.createSpan({ text: 'Retry' });

    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleRetryJob(job, button);
    });
  }

  private renderDeleteButton(job: Job, container: HTMLElement): void {
    const button = container.createEl('button', {
      cls: 'queue-job-action-button queue-delete-button',
      attr: { 'aria-label': 'Delete' },
    });
    setIcon(button, 'trash-2');

    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleDeleteJob(job, button);
    });
  }

  // ============================================================================
  // Job Actions
  // ============================================================================

  private async handleRetryJob(job: Job, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.addClass('is-loading');

    try {
      await this.config.syncClient.retryJob(job.id);
      new Notice('Job queued for retry');
      await this.loadJobs();
    } catch (error) {
      console.error('Retry failed:', error);
      new Notice(`Retry failed: ${getUserErrorMessage(error)}`);
    } finally {
      button.disabled = false;
      button.removeClass('is-loading');
    }
  }

  private async handleDeleteJob(job: Job, button: HTMLButtonElement): Promise<void> {
    const notePath = this.config.getSyncedNotePath?.(job.id);
    const hasSyncedNote = Boolean(notePath);

    // First tap: show confirmation with context
    if (!button.hasClass('is-confirming')) {
      button.addClass('is-confirming');
      // Show what will be deleted
      if (hasSyncedNote) {
        button.setText('Delete note too?');
      } else {
        button.setText('Confirm?');
      }

      // Reset after 3 seconds if not confirmed
      setTimeout(() => {
        if (button.hasClass('is-confirming')) {
          button.removeClass('is-confirming');
          button.empty();
          setIcon(button, 'trash-2');
        }
      }, 3000);
      return;
    }

    // Second tap: perform delete
    button.disabled = true;
    button.addClass('is-loading');
    button.removeClass('is-confirming');

    try {
      // Delete the job from the backend first
      await this.config.syncClient.deleteJob(job.id);

      // If there's a synced note, delete it from the vault
      let noteDeleted = false;
      if (hasSyncedNote && notePath && this.config.onDeleteNote) {
        noteDeleted = await this.config.onDeleteNote(notePath);
      }

      // Remove from sync state
      if (this.config.onRemoveSyncedJob) {
        await this.config.onRemoveSyncedJob(job.id);
      }

      // Remove from local list
      this.jobs = this.jobs.filter((j) => j.id !== job.id);
      this.updateJobList();

      // Show descriptive notice
      const filename = job.filename || 'Job';
      if (noteDeleted) {
        new Notice(`Deleted "${filename}" and its note`);
      } else if (hasSyncedNote) {
        new Notice(`Deleted "${filename}" (note file not found)`);
      } else {
        new Notice(`Deleted "${filename}"`);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      new Notice(`Delete failed: ${getUserErrorMessage(error)}`);
      button.disabled = false;
      button.removeClass('is-loading');
      button.empty();
      setIcon(button, 'trash-2');
    }
  }

  // ============================================================================
  // UI State Updates
  // ============================================================================

  private updateLoadingState(): void {
    if (this.isLoading) {
      this.jobListContainer.empty();
      const loading = this.jobListContainer.createDiv({ cls: 'queue-loading' });
      const spinner = loading.createDiv({ cls: 'queue-loading-spinner' });
      setIcon(spinner, 'loader');
      loading.createSpan({ text: 'Loading jobs...' });
    }
  }

  private showError(message: string): void {
    this.jobListContainer.empty();
    const error = this.jobListContainer.createDiv({ cls: 'queue-error-state' });

    const icon = error.createDiv({ cls: 'queue-error-icon' });
    setIcon(icon, 'alert-circle');

    error.createEl('p', { text: message });

    const retryButton = error.createEl('button', { text: 'Try Again', cls: 'queue-error-retry' });
    retryButton.addEventListener('click', () => this.loadJobs());
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private getStatusIcon(status: JobStatus): string {
    switch (status) {
      case 'pending':
        return 'clock';
      case 'processing':
        return 'loader';
      case 'completed':
        return 'check-circle';
      case 'failed':
        return 'x-circle';
    }
  }

  private formatJobMeta(job: Job): string {
    const statusLabel = this.getStatusLabel(job.status);
    const timeAgo = this.formatTimeAgo(new Date(job.createdAt));
    return `${statusLabel} • ${timeAgo}`;
  }

  private getStatusLabel(status: JobStatus): string {
    switch (status) {
      case 'pending':
        return 'Queued';
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
    }
  }

  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    }
    if (diffHours > 0) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }
    if (diffMins > 0) {
      return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`;
    }
    return 'Just now';
  }
}
