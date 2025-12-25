/**
 * Settings Tab - Plugin settings UI and management.
 *
 * Following:
 * - Single Responsibility Principle: Only handles settings UI
 * - Open/Closed Principle: Easy to extend with new settings
 */

import {
  App,
  PluginSettingTab,
  Setting,
  Notice,
  TextAreaComponent,
} from 'obsidian';
import type NotebookScannerPlugin from './main';
import type { PluginSettings } from './types';
import { CONSTRAINTS, TEMPLATE_PLACEHOLDERS } from './constants';

export class NotebookScannerSettingTab extends PluginSettingTab {
  plugin: NotebookScannerPlugin;

  constructor(app: App, plugin: NotebookScannerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderConnectionSettings(containerEl);
    this.renderFolderSettings(containerEl);
    this.renderSyncSettings(containerEl);
    this.renderNoteSettings(containerEl);
  }

  // ============================================================================
  // Connection Settings
  // ============================================================================

  private renderConnectionSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Connection' });

    new Setting(containerEl)
      .setName('Service URL')
      .setDesc('The URL of your Notebook Scanner backend service')
      .addText((text) =>
        text
          .setPlaceholder('https://your-service.example.com')
          .setValue(this.plugin.settings.serviceUrl)
          .onChange(async (value) => {
            this.plugin.settings.serviceUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your API key for the backend service')
      .addText((text) => {
        text
          .setPlaceholder('Enter your API key')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify your connection to the backend service')
      .addButton((button) =>
        button.setButtonText('Test').onClick(async () => {
          await this.testConnection();
        })
      );
  }

  // ============================================================================
  // Folder Settings
  // ============================================================================

  private renderFolderSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Folders' });

    new Setting(containerEl)
      .setName('Output Folder')
      .setDesc('Where to save generated notes')
      .addText((text) =>
        text
          .setPlaceholder('Notebook Notes')
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim() || 'Notebook Notes';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Attachment Folder')
      .setDesc('Where to save uploaded images (if keeping local copies)')
      .addText((text) =>
        text
          .setPlaceholder('Attachments/Scans')
          .setValue(this.plugin.settings.attachmentFolder)
          .onChange(async (value) => {
            this.plugin.settings.attachmentFolder =
              value.trim() || 'Attachments/Scans';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Organization Style')
      .setDesc('How to organize generated notes')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('flat', 'Flat (all in one folder)')
          .addOption('date', 'By Date (YYYY/MM/)')
          .addOption('category', 'By Category')
          .setValue(this.plugin.settings.organizationStyle)
          .onChange(async (value) => {
            this.plugin.settings.organizationStyle = value as PluginSettings['organizationStyle'];
            await this.plugin.saveSettings();
          })
      );
  }

  // ============================================================================
  // Sync Settings
  // ============================================================================

  private renderSyncSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Sync' });

    new Setting(containerEl)
      .setName('Auto Sync')
      .setDesc('Automatically check for completed jobs')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSync)
          .onChange(async (value) => {
            this.plugin.settings.autoSync = value;
            await this.plugin.saveSettings();
            // TODO: Start/stop polling based on this setting
          })
      );

    new Setting(containerEl)
      .setName('Poll Interval')
      .setDesc(
        `How often to check for completed jobs (${CONSTRAINTS.MIN_POLL_INTERVAL / 1000}s - ${CONSTRAINTS.MAX_POLL_INTERVAL / 1000}s)`
      )
      .addSlider((slider) =>
        slider
          .setLimits(
            CONSTRAINTS.MIN_POLL_INTERVAL / 1000,
            CONSTRAINTS.MAX_POLL_INTERVAL / 1000,
            5
          )
          .setValue(this.plugin.settings.pollInterval / 1000)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.pollInterval = value * 1000;
            await this.plugin.saveSettings();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon('reset')
          .setTooltip('Reset to default (30s)')
          .onClick(async () => {
            this.plugin.settings.pollInterval = 30000;
            await this.plugin.saveSettings();
            this.display(); // Refresh to show new value
          })
      );

    new Setting(containerEl)
      .setName('Show Notifications')
      .setDesc('Show a notice when new notes are synced')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.notifyOnSync)
          .onChange(async (value) => {
            this.plugin.settings.notifyOnSync = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Keep Local Copies')
      .setDesc('Save uploaded images to your vault')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.keepLocalCopy)
          .onChange(async (value) => {
            this.plugin.settings.keepLocalCopy = value;
            await this.plugin.saveSettings();
          })
      );
  }

  // ============================================================================
  // Note Formatting Settings
  // ============================================================================

  private renderNoteSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Note Formatting' });

    new Setting(containerEl)
      .setName('Frontmatter')
      .setDesc('Include YAML frontmatter in generated notes')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('yaml', 'YAML Frontmatter')
          .addOption('none', 'No Frontmatter')
          .setValue(this.plugin.settings.frontmatterFormat)
          .onChange(async (value) => {
            this.plugin.settings.frontmatterFormat = value as PluginSettings['frontmatterFormat'];
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Include Source Image')
      .setDesc('Embed the source image in the generated note')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeSourceImage)
          .onChange(async (value) => {
            this.plugin.settings.includeSourceImage = value;
            await this.plugin.saveSettings();
          })
      );

    // Note template setting with expandable area
    const templateSetting = new Setting(containerEl)
      .setName('Note Template')
      .setDesc('Customize the format of generated notes');

    let textArea: TextAreaComponent;

    templateSetting.addTextArea((text) => {
      textArea = text;
      text
        .setPlaceholder('Enter your note template...')
        .setValue(this.plugin.settings.noteTemplate)
        .onChange(async (value) => {
          this.plugin.settings.noteTemplate = value;
          await this.plugin.saveSettings();
        });
      text.inputEl.rows = 10;
      text.inputEl.style.width = '100%';
      text.inputEl.style.fontFamily = 'monospace';
      text.inputEl.style.fontSize = '12px';
    });

    // Add placeholder reference
    const placeholderContainer = containerEl.createDiv({
      cls: 'notebook-scanner-placeholder-reference',
    });
    placeholderContainer.style.marginTop = '8px';
    placeholderContainer.style.padding = '12px';
    placeholderContainer.style.backgroundColor = 'var(--background-secondary)';
    placeholderContainer.style.borderRadius = '4px';
    placeholderContainer.style.fontSize = '12px';

    placeholderContainer.createEl('strong', { text: 'Available Placeholders:' });
    const list = placeholderContainer.createEl('ul');
    list.style.margin = '8px 0 0 0';
    list.style.paddingLeft = '20px';

    for (const placeholder of TEMPLATE_PLACEHOLDERS) {
      const item = list.createEl('li');
      item.createEl('code', { text: placeholder.key });
      item.appendText(` - ${placeholder.description}`);
    }

    new Setting(containerEl).addButton((button) =>
      button.setButtonText('Reset to Default Template').onClick(async () => {
        const { DEFAULT_NOTE_TEMPLATE } = await import('./constants');
        this.plugin.settings.noteTemplate = DEFAULT_NOTE_TEMPLATE;
        await this.plugin.saveSettings();
        this.display(); // Refresh to show new value
      })
    );
  }

  // ============================================================================
  // Actions
  // ============================================================================

  private async testConnection(): Promise<void> {
    if (!this.plugin.settings.serviceUrl) {
      new Notice('Please enter a service URL first.');
      return;
    }

    if (!this.plugin.settings.apiKey) {
      new Notice('Please enter an API key first.');
      return;
    }

    new Notice('Testing connection...');

    try {
      const health = await this.plugin.syncClient.checkHealth();
      if (health.status === 'healthy') {
        new Notice('Connection successful! ✓');
      } else {
        new Notice('Service is unhealthy. Please check the server.');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      new Notice('Connection failed. Please check your settings.');
    }
  }
}
