/**
 * Upload Modal - UI for selecting and uploading notebook images.
 *
 * Following:
 * - Single Responsibility: Only handles upload UI
 * - Dependency Inversion: Depends on ISyncClient interface
 */

import { App, Modal, Notice, Platform, setIcon } from 'obsidian';
import type { ISyncClient, UploadResponse } from '../types';
import { CONSTRAINTS } from '../constants';
import {
  FileTooLargeError,
  UnsupportedFormatError,
  getUserErrorMessage,
} from '../errors';

/**
 * Configuration for the upload modal.
 */
export interface UploadModalConfig {
  syncClient: ISyncClient;
  onUploadComplete?: (response: UploadResponse) => void;
  onSaveLocalCopy?: (file: File) => Promise<string | null>;
  onViewQueue?: () => void;
  keepLocalCopy: boolean;
  attachmentFolder: string;
}

/**
 * Represents a file selected for upload with validation status.
 */
interface SelectedFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  progress: number;
}

/**
 * Modal for uploading notebook scan images.
 */
export class UploadModal extends Modal {
  private config: UploadModalConfig;
  private selectedFiles: SelectedFile[] = [];
  private isUploading = false;

  // UI Elements
  private dropZone!: HTMLElement;
  private fileList!: HTMLElement;
  private uploadButton!: HTMLButtonElement;
  private fileInput!: HTMLInputElement;
  private cameraInput!: HTMLInputElement;

  constructor(app: App, config: UploadModalConfig) {
    super(app);
    this.config = config;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('notebook-scanner-upload-modal');

    this.renderHeader(contentEl);
    this.renderDropZone(contentEl);
    this.renderFileList(contentEl);
    this.renderFooter(contentEl);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.selectedFiles = [];
  }

  // ============================================================================
  // Render Methods
  // ============================================================================

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'upload-modal-header' });
    header.createEl('h2', { text: 'Upload Notebook Scans' });
  }

  private renderDropZone(container: HTMLElement): void {
    this.dropZone = container.createDiv({ cls: 'upload-drop-zone' });

    const icon = this.dropZone.createDiv({ cls: 'upload-drop-zone-icon' });
    setIcon(icon, 'image');

    const text = this.dropZone.createDiv({ cls: 'upload-drop-zone-text' });
    text.createEl('p', { text: 'Drag & drop images here' });
    text.createEl('p', { text: 'or click to select files', cls: 'upload-drop-zone-subtext' });

    const hint = this.dropZone.createDiv({ cls: 'upload-drop-zone-hint' });
    hint.setText(`Supported: JPEG, PNG, WebP, HEIC • Max ${CONSTRAINTS.MAX_FILE_SIZE / 1024 / 1024}MB per file`);

    // Create hidden file input
    this.fileInput = container.createEl('input', {
      type: 'file',
      cls: 'upload-file-input',
    });
    this.fileInput.accept = CONSTRAINTS.SUPPORTED_FORMATS.join(',');
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';

    // Create hidden camera input (for mobile direct camera capture)
    this.cameraInput = container.createEl('input', {
      type: 'file',
      cls: 'upload-camera-input',
    });
    this.cameraInput.accept = 'image/*';
    this.cameraInput.setAttribute('capture', 'environment'); // Prefer rear camera
    this.cameraInput.style.display = 'none';

    // Camera capture button (mobile only)
    if (Platform.isMobile) {
      this.renderCameraButton(container);
    }

    // Event listeners
    this.setupDropZoneEvents();
    this.setupFileInputEvents();
    this.setupCameraInputEvents();
  }

  private renderCameraButton(container: HTMLElement): void {
    const cameraButton = container.createDiv({ cls: 'upload-camera-button' });

    const cameraIcon = cameraButton.createDiv({ cls: 'upload-camera-button-icon' });
    setIcon(cameraIcon, 'camera');

    cameraButton.createSpan({ text: 'Take Photo' });

    cameraButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.isUploading) {
        this.cameraInput.click();
      }
    });
  }

  private renderFileList(container: HTMLElement): void {
    this.fileList = container.createDiv({ cls: 'upload-file-list' });
    this.updateFileList();
  }

  private renderFooter(container: HTMLElement): void {
    const footer = container.createDiv({ cls: 'upload-modal-footer' });

    const cancelButton = footer.createEl('button', {
      text: 'Cancel',
      cls: 'upload-cancel-button',
    });
    cancelButton.addEventListener('click', () => this.close());

    this.uploadButton = footer.createEl('button', {
      text: 'Upload',
      cls: 'upload-submit-button mod-cta',
    });
    this.uploadButton.disabled = true;
    this.uploadButton.addEventListener('click', () => this.handleUpload());
  }

  // ============================================================================
  // Event Setup
  // ============================================================================

  private setupDropZoneEvents(): void {
    // Click to open file picker
    this.dropZone.addEventListener('click', () => {
      if (!this.isUploading) {
        this.fileInput.click();
      }
    });

    // Drag and drop
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.addClass('drag-over');
    });

    this.dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.removeClass('drag-over');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.removeClass('drag-over');

      if (this.isUploading) return;

      const files = e.dataTransfer?.files;
      if (files) {
        this.addFiles(Array.from(files));
      }
    });
  }

  private setupFileInputEvents(): void {
    this.fileInput.addEventListener('change', () => {
      const files = this.fileInput.files;
      if (files) {
        this.addFiles(Array.from(files));
      }
      // Reset input so same file can be selected again
      this.fileInput.value = '';
    });
  }

  private setupCameraInputEvents(): void {
    this.cameraInput.addEventListener('change', () => {
      const files = this.cameraInput.files;
      if (files) {
        this.addFiles(Array.from(files));
      }
      // Reset input so same photo can be taken again
      this.cameraInput.value = '';
    });
  }

  // ============================================================================
  // File Management
  // ============================================================================

  private addFiles(files: File[]): void {
    for (const file of files) {
      // Check for duplicates
      if (this.selectedFiles.some((f) => f.file.name === file.name && f.file.size === file.size)) {
        continue;
      }

      // Validate file
      const validation = this.validateFile(file);

      this.selectedFiles.push({
        file,
        id: this.generateId(),
        status: validation.valid ? 'pending' : 'error',
        error: validation.error,
        progress: 0,
      });
    }

    // Enforce batch size limit
    if (this.selectedFiles.length > CONSTRAINTS.MAX_BATCH_SIZE) {
      this.selectedFiles = this.selectedFiles.slice(0, CONSTRAINTS.MAX_BATCH_SIZE);
      new Notice(`Maximum ${CONSTRAINTS.MAX_BATCH_SIZE} images per upload.`);
    }

    this.updateFileList();
    this.updateUploadButton();
  }

  private removeFile(id: string): void {
    this.selectedFiles = this.selectedFiles.filter((f) => f.id !== id);
    this.updateFileList();
    this.updateUploadButton();
  }

  private validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > CONSTRAINTS.MAX_FILE_SIZE) {
      const error = new FileTooLargeError(
        file.name,
        file.size,
        CONSTRAINTS.MAX_FILE_SIZE
      );
      return { valid: false, error: error.toUserMessage() };
    }

    // Check file type
    const isSupported = CONSTRAINTS.SUPPORTED_FORMATS.some((format) => {
      // Handle MIME type matching
      if (file.type === format) return true;
      // Handle extension-based matching for HEIC (often has empty type)
      if (format === 'image/heic' && file.name.toLowerCase().endsWith('.heic')) return true;
      return false;
    });

    if (!isSupported) {
      const error = new UnsupportedFormatError(file.name, file.type || 'unknown');
      return { valid: false, error: error.toUserMessage() };
    }

    return { valid: true };
  }

  // ============================================================================
  // UI Updates
  // ============================================================================

  private updateFileList(): void {
    this.fileList.empty();

    if (this.selectedFiles.length === 0) {
      this.fileList.createDiv({
        cls: 'upload-file-list-empty',
        text: 'No files selected',
      });
      return;
    }

    const header = this.fileList.createDiv({ cls: 'upload-file-list-header' });
    header.setText(`Selected: ${this.selectedFiles.length} image${this.selectedFiles.length !== 1 ? 's' : ''}`);

    for (const selectedFile of this.selectedFiles) {
      this.renderFileItem(selectedFile);
    }
  }

  private renderFileItem(selectedFile: SelectedFile): void {
    const item = this.fileList.createDiv({ cls: 'upload-file-item' });
    item.addClass(`status-${selectedFile.status}`);

    // Status icon
    const iconEl = item.createDiv({ cls: 'upload-file-item-icon' });
    const icon = this.getStatusIcon(selectedFile.status);
    setIcon(iconEl, icon);

    // File info
    const info = item.createDiv({ cls: 'upload-file-item-info' });
    info.createDiv({ cls: 'upload-file-item-name', text: selectedFile.file.name });

    const meta = info.createDiv({ cls: 'upload-file-item-meta' });
    meta.setText(this.formatFileSize(selectedFile.file.size));

    if (selectedFile.error) {
      const errorEl = info.createDiv({ cls: 'upload-file-item-error' });
      errorEl.setText(selectedFile.error);
    }

    // Progress bar (when uploading)
    if (selectedFile.status === 'uploading') {
      const progressContainer = item.createDiv({ cls: 'upload-file-item-progress' });
      const progressBar = progressContainer.createDiv({ cls: 'upload-file-item-progress-bar' });
      progressBar.style.width = `${selectedFile.progress}%`;
    }

    // Remove button (only when not uploading)
    if (!this.isUploading && selectedFile.status !== 'success') {
      const removeBtn = item.createDiv({ cls: 'upload-file-item-remove' });
      setIcon(removeBtn, 'x');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFile(selectedFile.id);
      });
    }
  }

  private updateUploadButton(): void {
    const validFiles = this.selectedFiles.filter(
      (f) => f.status === 'pending'
    );
    this.uploadButton.disabled = validFiles.length === 0 || this.isUploading;
    this.uploadButton.setText(
      this.isUploading ? 'Uploading...' : `Upload (${validFiles.length})`
    );
  }

  private getStatusIcon(status: SelectedFile['status']): string {
    switch (status) {
      case 'pending':
        return 'image';
      case 'uploading':
        return 'loader';
      case 'success':
        return 'check';
      case 'error':
        return 'alert-circle';
    }
  }

  // ============================================================================
  // Upload Logic
  // ============================================================================

  private async handleUpload(): Promise<void> {
    const filesToUpload = this.selectedFiles.filter((f) => f.status === 'pending');

    if (filesToUpload.length === 0) {
      return;
    }

    this.isUploading = true;
    this.updateUploadButton();
    this.dropZone.addClass('disabled');

    // Mark files as uploading
    for (const file of filesToUpload) {
      file.status = 'uploading';
      file.progress = 0;
    }
    this.updateFileList();

    try {
      // Save local copies if enabled
      if (this.config.keepLocalCopy && this.config.onSaveLocalCopy) {
        for (const file of filesToUpload) {
          try {
            await this.config.onSaveLocalCopy(file.file);
          } catch (error) {
            console.warn(`Failed to save local copy of ${file.file.name}:`, error);
          }
        }
      }

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        for (const file of filesToUpload) {
          if (file.status === 'uploading' && file.progress < 90) {
            file.progress += Math.random() * 15;
            if (file.progress > 90) file.progress = 90;
          }
        }
        this.updateFileList();
      }, 200);

      // Perform upload
      const files = filesToUpload.map((f) => f.file);
      const response = await this.config.syncClient.uploadImages(files);

      clearInterval(progressInterval);

      // Update file statuses based on response
      for (const file of filesToUpload) {
        file.progress = 100;
        file.status = 'success';
      }

      // Handle any failures reported by the server
      if (response.failed && response.failed.length > 0) {
        for (const failure of response.failed) {
          const file = filesToUpload.find((f) => f.file.name === failure.filename);
          if (file) {
            file.status = 'error';
            file.error = failure.reason;
          }
        }
      }

      this.updateFileList();

      // Count results
      const successCount = filesToUpload.filter((f) => f.status === 'success').length;
      const failedCount = filesToUpload.filter((f) => f.status === 'error').length;

      // Show appropriate notice
      if (failedCount > 0 && successCount > 0) {
        new Notice(`Uploaded ${successCount} image${successCount !== 1 ? 's' : ''}, ${failedCount} failed.`);
      } else if (successCount > 0) {
        new Notice(`Uploaded ${successCount} image${successCount !== 1 ? 's' : ''} for processing.`);
      }

      // Callback
      if (this.config.onUploadComplete) {
        this.config.onUploadComplete(response);
      }

      // Show completion state with action buttons
      this.showCompletionState(successCount, failedCount);

    } catch (error) {
      console.error('Upload failed:', error);

      // Mark all as error
      for (const file of filesToUpload) {
        file.status = 'error';
        file.error = getUserErrorMessage(error);
      }
      this.updateFileList();

      new Notice(`Upload failed: ${getUserErrorMessage(error)}`);
    } finally {
      this.isUploading = false;
      this.updateUploadButton();
      this.dropZone.removeClass('disabled');
    }
  }

  // ============================================================================
  // Completion State
  // ============================================================================

  private showCompletionState(successCount: number, failedCount: number): void {
    // Update footer with completion actions
    const footer = this.contentEl.querySelector('.upload-modal-footer');
    if (!footer) return;

    footer.empty();

    // Show summary
    const summary = footer.createDiv({ cls: 'upload-completion-summary' });
    if (failedCount > 0) {
      summary.addClass('has-errors');
      summary.setText(`${successCount} uploaded, ${failedCount} failed`);
    } else {
      summary.addClass('all-success');
      summary.setText(`${successCount} image${successCount !== 1 ? 's' : ''} queued for processing`);
    }

    // Action buttons
    const actions = footer.createDiv({ cls: 'upload-completion-actions' });

    if (this.config.onViewQueue) {
      const viewQueueBtn = actions.createEl('button', {
        text: 'View Queue',
        cls: 'upload-view-queue-button',
      });
      viewQueueBtn.addEventListener('click', () => {
        this.close();
        this.config.onViewQueue?.();
      });
    }

    const doneBtn = actions.createEl('button', {
      text: 'Done',
      cls: 'upload-done-button mod-cta',
    });
    doneBtn.addEventListener('click', () => this.close());
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private generateId(): string {
    return `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
