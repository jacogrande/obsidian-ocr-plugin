/**
 * Note Creator - Creates markdown notes from processed results.
 *
 * Following:
 * - Single Responsibility: Only handles note creation
 * - Open/Closed: Template system allows customization without code changes
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { ProcessedNote, PluginSettings, OrganizationStyle } from './types';
import { DEFAULT_NOTE_TEMPLATE } from './constants';

/**
 * Result of creating a note.
 */
export interface CreateNoteResult {
  success: boolean;
  filePath?: string;
  file?: TFile;
  error?: string;
}

/**
 * Creates markdown notes in the vault from processed results.
 */
export class NoteCreator {
  private app: App;
  private settings: PluginSettings;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Update settings reference.
   */
  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  /**
   * Create a note from a processed result.
   */
  async createNote(result: ProcessedNote, localImagePath?: string): Promise<CreateNoteResult> {
    try {
      // Generate the file path
      const folderPath = this.getTargetFolder(result);
      const filename = this.generateFilename(result);
      const filePath = normalizePath(`${folderPath}/${filename}`);

      // Ensure the folder exists
      await this.ensureFolderExists(folderPath);

      // Format the note content
      const content = this.formatContent(result, localImagePath);

      // Handle filename conflicts
      const uniquePath = await this.getUniquePath(filePath);

      // Create the file
      const file = await this.app.vault.create(uniquePath, content);

      return {
        success: true,
        filePath: uniquePath,
        file,
      };
    } catch (error) {
      console.error('Failed to create note:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create multiple notes from processed results.
   */
  async createNotes(
    results: Array<{ result: ProcessedNote; localImagePath?: string }>
  ): Promise<CreateNoteResult[]> {
    const outcomes: CreateNoteResult[] = [];

    for (const { result, localImagePath } of results) {
      const outcome = await this.createNote(result, localImagePath);
      outcomes.push(outcome);
    }

    return outcomes;
  }

  // ============================================================================
  // Path Generation
  // ============================================================================

  /**
   * Get the target folder based on organization style.
   */
  private getTargetFolder(result: ProcessedNote): string {
    const baseFolder = this.settings.outputFolder;

    switch (this.settings.organizationStyle) {
      case 'date':
        return this.getDateBasedPath(baseFolder, result);
      case 'category':
        return this.getCategoryBasedPath(baseFolder, result);
      case 'flat':
      default:
        return baseFolder;
    }
  }

  /**
   * Get date-based folder path (YYYY/MM/).
   */
  private getDateBasedPath(baseFolder: string, result: ProcessedNote): string {
    const date = result.date ? new Date(result.date) : new Date();
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${baseFolder}/${year}/${month}`;
  }

  /**
   * Get category-based folder path.
   */
  private getCategoryBasedPath(baseFolder: string, result: ProcessedNote): string {
    const category = this.sanitizeForPath(result.category);
    return `${baseFolder}/${category}`;
  }

  /**
   * Generate a filename from the result.
   */
  private generateFilename(result: ProcessedNote): string {
    // Sanitize the title for use as a filename
    let filename = this.sanitizeForPath(result.title);

    // Truncate if too long (keep room for extension and conflict suffix)
    if (filename.length > 100) {
      filename = filename.substring(0, 100);
    }

    // Ensure it's not empty
    if (!filename) {
      filename = `note-${result.jobId.substring(0, 8)}`;
    }

    return `${filename}.md`;
  }

  /**
   * Get a unique file path, handling conflicts.
   */
  private async getUniquePath(basePath: string): Promise<string> {
    // Check if file exists
    if (!this.app.vault.getAbstractFileByPath(basePath)) {
      return basePath;
    }

    // Add incrementing suffix
    const ext = '.md';
    const pathWithoutExt = basePath.slice(0, -ext.length);

    let counter = 1;
    let newPath = `${pathWithoutExt} ${counter}${ext}`;

    while (this.app.vault.getAbstractFileByPath(newPath)) {
      counter++;
      newPath = `${pathWithoutExt} ${counter}${ext}`;

      // Safety limit
      if (counter > 100) {
        throw new Error('Too many files with the same name');
      }
    }

    return newPath;
  }

  /**
   * Sanitize a string for use in a file path.
   */
  private sanitizeForPath(str: string): string {
    return str
      .replace(/[\\/:*?"<>|]/g, '-') // Replace illegal characters
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .replace(/^\.+/, '')           // Remove leading dots
      .replace(/\.+$/, '')           // Remove trailing dots
      .trim();
  }

  // ============================================================================
  // Content Formatting
  // ============================================================================

  /**
   * Format the note content using the template.
   */
  private formatContent(result: ProcessedNote, localImagePath?: string): string {
    const template = this.settings.noteTemplate || DEFAULT_NOTE_TEMPLATE;
    const syncedAt = new Date().toISOString();

    let content = template;

    // Replace simple placeholders
    content = content.replace(/\{\{title\}\}/g, this.escapeYaml(result.title));
    content = content.replace(/\{\{content\}\}/g, result.content);
    content = content.replace(/\{\{summary\}\}/g, result.summary);
    content = content.replace(/\{\{date\}\}/g, result.date || 'unknown');
    content = content.replace(/\{\{category\}\}/g, result.category);
    content = content.replace(/\{\{jobId\}\}/g, result.jobId);
    content = content.replace(/\{\{syncedAt\}\}/g, syncedAt);

    // Handle tags - support both array format and comma-separated
    const tagsFormatted = result.tags.join(', ');
    content = content.replace(/\{\{tags\}\}/g, tagsFormatted);

    // Handle tags in YAML array format
    const tagsYaml = result.tags.map(tag => `  - ${tag}`).join('\n');
    content = content.replace(/\{\{#tags\}\}[\s\S]*?\{\{\/tags\}\}/g, tagsYaml);

    // Handle source image
    if (localImagePath && this.settings.includeSourceImage) {
      const imageEmbed = `![[${localImagePath}]]`;
      content = content.replace(/\{\{sourceImage\}\}/g, imageEmbed);
    } else {
      content = content.replace(/\{\{sourceImage\}\}/g, '');
    }

    // Remove frontmatter if disabled
    if (this.settings.frontmatterFormat === 'none') {
      content = this.removeFrontmatter(content);
    }

    return content;
  }

  /**
   * Escape a string for use in YAML.
   */
  private escapeYaml(str: string): string {
    // If string contains special characters, wrap in quotes
    if (/[:\{\}\[\],&*#?|\-<>=!%@\\]/.test(str) || str.includes('\n')) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  }

  /**
   * Remove YAML frontmatter from content.
   */
  private removeFrontmatter(content: string): string {
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n*/;
    return content.replace(frontmatterRegex, '');
  }

  // ============================================================================
  // Folder Operations
  // ============================================================================

  /**
   * Ensure a folder exists, creating it and parent folders if necessary.
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);

    // Check if already exists
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing) {
      if (existing instanceof TFolder) {
        return;
      }
      throw new Error(`Path exists but is not a folder: ${normalizedPath}`);
    }

    // Create folder (Obsidian will create parent folders automatically)
    await this.app.vault.createFolder(normalizedPath);
  }
}
