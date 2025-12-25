/**
 * Notebook Scanner - Obsidian Plugin
 *
 * Main entry point for the plugin. Orchestrates all components and
 * manages the plugin lifecycle.
 *
 * Following:
 * - Single Responsibility: Orchestration and lifecycle management
 * - Dependency Inversion: Uses interfaces for all dependencies
 */

import { Plugin, Notice, TFolder, TFile, normalizePath, Platform, Menu } from 'obsidian';
import type { PluginSettings, ISyncClient, SyncState, PluginData, UploadResponse } from './types';
import { DEFAULT_SETTINGS, DEFAULT_SYNC_STATE } from './constants';
import { NotebookScannerSettingTab } from './settings';
import { createSyncClient } from './sync-client';
import { UploadModal } from './ui/upload-modal';
import { QueueModal } from './ui/queue-modal';
import { OnboardingModal, shouldShowOnboarding } from './ui/onboarding-modal';
import { StatusBarWidget } from './ui/status-bar';
import { SyncStateManager } from './sync-state';
import { NoteCreator } from './note-creator';
import { JobPoller, SyncResult } from './job-poller';

export default class NotebookScannerPlugin extends Plugin {
  settings!: PluginSettings;
  syncState!: SyncState;
  syncClient!: ISyncClient;

  // Phase 3 components
  private syncStateManager!: SyncStateManager;
  private noteCreator!: NoteCreator;
  private jobPoller!: JobPoller;

  // Phase 5 components
  private statusBarWidget: StatusBarWidget | null = null;
  private hasShownOnboarding = false;

  // ============================================================================
  // Plugin Lifecycle
  // ============================================================================

  async onload(): Promise<void> {
    console.log('Loading Notebook Scanner plugin');

    // Load saved data
    await this.loadSettings();

    // Initialize sync client
    this.syncClient = createSyncClient(this.settings);

    // Initialize Phase 3 components
    this.initializeComponents();

    // Initialize status bar widget
    this.initializeStatusBar();

    // Register settings tab
    this.addSettingTab(new NotebookScannerSettingTab(this.app, this));

    // Register commands
    this.registerCommands();

    // Add ribbon icon - opens menu on mobile, upload on desktop
    this.addRibbonIcon('notebook', 'Notebook Scanner', (evt) => {
      // On mobile, show a menu with options
      if (Platform.isMobile) {
        this.showMobileMenu(evt);
      } else {
        // On desktop, default to upload (queue accessible via status bar)
        this.openUploadModal();
      }
    });

    // Start background polling if configured
    if (this.isConfigured() && this.settings.autoSync) {
      this.jobPoller.start();
    }

    // Show onboarding for first-time users (with slight delay for better UX)
    if (shouldShowOnboarding(this.settings) && !this.hasShownOnboarding) {
      setTimeout(() => {
        this.showOnboarding();
      }, 500);
    } else if (this.isConfigured()) {
      console.log('Notebook Scanner ready');
    }
  }

  /**
   * Initialize the status bar widget.
   */
  private initializeStatusBar(): void {
    // Add status bar item
    const statusBarEl = this.addStatusBarItem();

    this.statusBarWidget = new StatusBarWidget(statusBarEl, {
      onClick: () => {
        // Resume poller if stopped due to errors
        if (this.jobPoller.isStoppedDueToErrors()) {
          this.jobPoller.resumeAfterError();
          new Notice('Sync resumed');
          this.updateStatusBar();
        }
        this.openQueueModal();
      },
    });

    // Initial status update
    this.updateStatusBar();
  }

  /**
   * Update status bar with current job status.
   */
  private async updateStatusBar(): Promise<void> {
    if (!this.statusBarWidget || !this.isConfigured()) {
      return;
    }

    // Check if poller is stopped due to errors
    if (this.jobPoller.isStoppedDueToErrors()) {
      this.statusBarWidget.setPaused(true);
      return;
    }

    try {
      const jobs = await this.syncClient.getJobs();
      this.statusBarWidget.updateFromJobs(jobs);
    } catch (error) {
      console.warn('Failed to update status bar:', error);
      this.statusBarWidget.setError(true);
    }
  }

  /**
   * Initialize Phase 3 components with proper dependency injection.
   */
  private initializeComponents(): void {
    // SyncStateManager - tracks which jobs have been synced
    this.syncStateManager = new SyncStateManager(
      this.syncState,
      async (state: SyncState) => {
        this.syncState = state;
        await this.saveSyncState();
      }
    );

    // NoteCreator - creates markdown notes from processed results
    this.noteCreator = new NoteCreator(this.app, this.settings);

    // JobPoller - background polling for completed jobs
    this.jobPoller = new JobPoller({
      getSyncClient: () => this.syncClient,
      syncStateManager: this.syncStateManager,
      noteCreator: this.noteCreator,
      getSettings: () => this.settings,
      onSyncComplete: (result: SyncResult) => {
        this.handleSyncComplete(result);
      },
      onPollerStopped: () => {
        this.updateStatusBar();
      },
      onSyncProgress: (current: number, total: number) => {
        if (this.statusBarWidget) {
          this.statusBarWidget.setSyncProgress(current, total);
        }
      },
      onStatusChanged: (jobs) => {
        if (this.statusBarWidget) {
          this.statusBarWidget.updateFromJobs(jobs);
        }
      },
    });
  }

  /**
   * Handle sync completion - show notifications and update status.
   */
  private handleSyncComplete(result: SyncResult): void {
    console.log('Sync complete:', result);

    // Clear sync progress
    if (this.statusBarWidget) {
      this.statusBarWidget.clearSyncProgress();
    }

    // Update status bar
    this.updateStatusBar();

    // Periodically prune old sync state entries
    if (Math.random() < 0.1) {
      this.syncStateManager.prune().catch((err) => {
        console.warn('Failed to prune sync state:', err);
      });
    }
  }

  /**
   * Show the onboarding modal for first-time users.
   */
  private showOnboarding(): void {
    if (this.hasShownOnboarding) {
      return;
    }

    this.showOnboardingForced();
  }

  /**
   * Show the onboarding modal (forced, ignores hasShownOnboarding flag).
   */
  private showOnboardingForced(): void {
    this.hasShownOnboarding = true;

    const modal = new OnboardingModal(this.app, {
      syncClient: this.syncClient,
      settings: this.settings,
      onComplete: async (newSettings) => {
        // Save the new settings
        Object.assign(this.settings, newSettings);
        await this.saveSettings();

        // Start polling now that we're configured
        if (this.settings.autoSync) {
          this.jobPoller.start();
        }

        // Update status bar
        this.updateStatusBar();

        new Notice('Notebook Scanner configured successfully!');
      },
      onSkip: () => {
        new Notice('You can configure Notebook Scanner anytime in settings.');
      },
    });

    modal.open();
  }

  async onunload(): Promise<void> {
    console.log('Unloading Notebook Scanner plugin');

    // Stop background polling
    if (this.jobPoller) {
      this.jobPoller.stop();
    }

    // Clean up status bar widget
    if (this.statusBarWidget) {
      this.statusBarWidget.destroy();
      this.statusBarWidget = null;
    }
  }

  // ============================================================================
  // Data Persistence
  // ============================================================================

  async loadSettings(): Promise<void> {
    const data: Partial<PluginData> = await this.loadData() || {};

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data.settings,
    };

    this.syncState = {
      ...DEFAULT_SYNC_STATE,
      ...data.syncState,
    };
  }

  async saveSettings(): Promise<void> {
    const data: PluginData = {
      settings: this.settings,
      syncState: this.syncState,
    };

    await this.saveData(data);

    // Recreate sync client to pick up new settings
    // This ensures we switch from MockSyncClient to real SyncClient after onboarding
    this.syncClient = createSyncClient(this.settings);

    // Update NoteCreator settings
    if (this.noteCreator) {
      this.noteCreator.updateSettings(this.settings);
    }

    // Restart poller if auto-sync settings changed
    if (this.jobPoller) {
      if (this.isConfigured() && this.settings.autoSync) {
        this.jobPoller.restart();
      } else {
        this.jobPoller.stop();
      }
    }
  }

  async saveSyncState(): Promise<void> {
    await this.saveSettings(); // Saves both settings and sync state
  }

  // ============================================================================
  // Commands
  // ============================================================================

  private registerCommands(): void {
    // Upload Images command
    this.addCommand({
      id: 'upload-images',
      name: 'Upload Images',
      callback: () => {
        this.openUploadModal();
      },
    });

    // Sync Now command
    this.addCommand({
      id: 'sync-now',
      name: 'Sync Now',
      callback: () => {
        this.syncNow();
      },
    });

    // View Queue command
    this.addCommand({
      id: 'view-queue',
      name: 'View Queue',
      callback: () => {
        this.openQueueModal();
      },
    });

    // Open Settings command
    this.addCommand({
      id: 'open-settings',
      name: 'Open Settings',
      callback: () => {
        this.openSettings();
      },
    });

    // Setup Wizard command (always shows onboarding)
    this.addCommand({
      id: 'setup-wizard',
      name: 'Setup Wizard',
      callback: () => {
        this.showOnboardingForced();
      },
    });
  }

  // ============================================================================
  // Command Implementations (Stubs for Phase 1)
  // ============================================================================

  /**
   * Show mobile-friendly menu with main actions.
   */
  private showMobileMenu(evt: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('Upload Images')
        .setIcon('camera')
        .onClick(() => {
          this.openUploadModal();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('View Queue')
        .setIcon('list-todo')
        .onClick(() => {
          this.openQueueModal();
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle('Sync Now')
        .setIcon('refresh-cw')
        .onClick(() => {
          this.syncNow();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('Settings')
        .setIcon('settings')
        .onClick(() => {
          this.openSettings();
        });
    });

    menu.showAtMouseEvent(evt);
  }

  /**
   * Open the upload modal for selecting images.
   */
  private openUploadModal(): void {
    if (!this.isConfigured()) {
      // Show onboarding for first-time users, or settings if they skipped
      if (shouldShowOnboarding(this.settings) && !this.hasShownOnboarding) {
        this.showOnboarding();
      } else {
        new Notice('Please configure Notebook Scanner in settings first.');
        this.openSettings();
      }
      return;
    }

    const modal = new UploadModal(this.app, {
      syncClient: this.syncClient,
      keepLocalCopy: this.settings.keepLocalCopy,
      attachmentFolder: this.settings.attachmentFolder,
      onUploadComplete: (response: UploadResponse) => {
        this.handleUploadComplete(response);
      },
      onSaveLocalCopy: (file: File) => this.saveImageToVault(file),
      onViewQueue: () => this.openQueueModal(),
    });

    modal.open();
  }

  /**
   * Handle successful upload completion.
   */
  private handleUploadComplete(response: UploadResponse): void {
    console.log('Upload complete:', response);

    // Update status bar to show pending jobs
    this.updateStatusBar();

    if (response.jobIds.length > 0) {
      console.log(`${response.jobIds.length} jobs queued for processing`);
    }
  }

  /**
   * Manually trigger a sync of completed jobs.
   */
  private async syncNow(): Promise<void> {
    if (!this.isConfigured()) {
      new Notice('Please configure Notebook Scanner in settings first.');
      return;
    }

    // Show syncing status
    if (this.statusBarWidget) {
      this.statusBarWidget.setSyncing(true);
    }

    new Notice('Checking for completed jobs...');

    try {
      const result = await this.jobPoller.syncNow();

      if (result.syncedCount === 0 && result.failedCount === 0) {
        new Notice('No new notes to sync.');
      } else {
        if (result.syncedCount > 0) {
          if (result.syncedCount === 1 && result.results[0]?.notePath) {
            // Single note: show the specific file path
            new Notice(`Created: ${result.results[0].notePath}`);
          } else {
            // Multiple notes: show count and folder
            new Notice(
              `Synced ${result.syncedCount} new note${result.syncedCount !== 1 ? 's' : ''} to ${this.settings.outputFolder}/`
            );
          }
        }

        if (result.failedCount > 0) {
          new Notice(`${result.failedCount} note${result.failedCount !== 1 ? 's' : ''} failed to sync.`);
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
      new Notice('Sync failed. Please check your connection.');
      if (this.statusBarWidget) {
        this.statusBarWidget.setError(true);
      }
    } finally {
      // Update status bar
      if (this.statusBarWidget) {
        this.statusBarWidget.setSyncing(false);
      }
      this.updateStatusBar();
    }
  }

  /**
   * Open the queue modal showing all jobs.
   */
  private openQueueModal(): void {
    if (!this.isConfigured()) {
      new Notice('Please configure Notebook Scanner in settings first.');
      this.openSettings();
      return;
    }

    const modal = new QueueModal(this.app, {
      syncClient: this.syncClient,
      onSyncNow: async () => {
        await this.syncNow();
      },
      onOpenNote: (notePath: string) => {
        this.openNote(notePath);
      },
      getSyncedNotePath: (jobId: string) => {
        return this.syncStateManager.getSyncedJob(jobId)?.notePath;
      },
      onDeleteNote: async (notePath: string) => {
        return this.deleteNoteFile(notePath);
      },
      onRemoveSyncedJob: async (jobId: string) => {
        await this.syncStateManager.removeSynced(jobId);
      },
      onJobsChanged: () => {
        this.updateStatusBar();
      },
    });

    modal.open();
  }

  /**
   * Delete a note file from the vault.
   * Returns true if the file was deleted, false if not found.
   */
  private async deleteNoteFile(notePath: string): Promise<boolean> {
    try {
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (file instanceof TFile) {
        await this.app.vault.delete(file);
        console.log(`Deleted note: ${notePath}`);
        return true;
      }
      console.log(`Note not found: ${notePath}`);
      return false;
    } catch (error) {
      console.error(`Failed to delete note ${notePath}:`, error);
      return false;
    }
  }

  /**
   * Open a note by its path.
   */
  private openNote(notePath: string): void {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (file instanceof TFile) {
      this.app.workspace.getLeaf().openFile(file);
    } else {
      new Notice('Note not found. It may have been moved or deleted.');
    }
  }

  /**
   * Open the settings tab.
   */
  private openSettings(): void {
    // Navigate to settings tab
    const setting = (this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Save an image file to the vault's attachment folder.
   */
  async saveImageToVault(file: File): Promise<string | null> {
    if (!this.settings.keepLocalCopy) {
      return null;
    }

    try {
      // Ensure attachment folder exists
      await this.ensureFolderExists(this.settings.attachmentFolder);

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${timestamp}-${sanitizedName}`;
      const filePath = normalizePath(`${this.settings.attachmentFolder}/${filename}`);

      // Read file as ArrayBuffer and save
      const arrayBuffer = await file.arrayBuffer();
      await this.app.vault.createBinary(filePath, arrayBuffer);

      console.log(`Saved image to vault: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to save image to vault:', error);
      return null;
    }
  }

  /**
   * Ensure a folder exists in the vault, creating it if necessary.
   */
  async ensureFolderExists(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (!folder) {
      await this.app.vault.createFolder(normalizedPath);
    } else if (!(folder instanceof TFolder)) {
      throw new Error(`Path exists but is not a folder: ${normalizedPath}`);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Check if the plugin is properly configured.
   */
  isConfigured(): boolean {
    return Boolean(this.settings.serviceUrl && this.settings.apiKey);
  }
}
