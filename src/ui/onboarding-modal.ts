/**
 * Onboarding Modal - First-time setup flow for new users.
 *
 * Following:
 * - Single Responsibility: Only handles onboarding UI
 * - Mobile-first design with large touch targets
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type { ISyncClient, PluginSettings } from '../types';
import { getUserErrorMessage } from '../errors';

/**
 * Configuration for the onboarding modal.
 */
export interface OnboardingConfig {
  syncClient: ISyncClient;
  settings: PluginSettings;
  onComplete: (settings: Partial<PluginSettings>) => Promise<void>;
  onSkip: () => void;
}

/**
 * Onboarding steps.
 */
type OnboardingStep = 'welcome' | 'connection' | 'complete';

/**
 * Modal for first-time user setup.
 */
export class OnboardingModal extends Modal {
  private config: OnboardingConfig;
  private currentStep: OnboardingStep = 'welcome';

  // Form state
  private serviceUrl = '';
  private apiKey = '';
  private connectionStatus: 'idle' | 'testing' | 'success' | 'error' = 'idle';
  private connectionError = '';

  constructor(app: App, config: OnboardingConfig) {
    super(app);
    this.config = config;

    // Pre-fill from existing settings
    this.serviceUrl = config.settings.serviceUrl || '';
    this.apiKey = config.settings.apiKey || '';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('notebook-scanner-onboarding-modal');

    this.renderCurrentStep();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  // ============================================================================
  // Step Rendering
  // ============================================================================

  private renderCurrentStep(): void {
    const { contentEl } = this;
    contentEl.empty();

    switch (this.currentStep) {
      case 'welcome':
        this.renderWelcomeStep(contentEl);
        break;
      case 'connection':
        this.renderConnectionStep(contentEl);
        break;
      case 'complete':
        this.renderCompleteStep(contentEl);
        break;
    }
  }

  // ============================================================================
  // Welcome Step
  // ============================================================================

  private renderWelcomeStep(container: HTMLElement): void {
    // Header
    const header = container.createDiv({ cls: 'onboarding-header' });
    header.createEl('h2', { text: 'Welcome to Notebook Scanner' });

    // Welcome content
    const welcome = container.createDiv({ cls: 'onboarding-welcome' });

    const icon = welcome.createDiv({ cls: 'onboarding-welcome-icon' });
    setIcon(icon, 'notebook');

    welcome.createEl('p', {
      text: 'Transform your handwritten notes into searchable, organized markdown.',
    });

    // Steps overview
    const steps = container.createDiv({ cls: 'onboarding-steps' });

    const stepsData = [
      {
        title: 'Upload your notebook scans',
        description: 'Take photos of your handwritten pages',
      },
      {
        title: 'AI processes your notes',
        description: 'Our service extracts and structures your content',
      },
      {
        title: 'Notes sync to your vault',
        description: 'Searchable markdown files, automatically organized',
      },
    ];

    stepsData.forEach((step, index) => {
      const stepEl = steps.createDiv({ cls: 'onboarding-step' });

      const number = stepEl.createDiv({ cls: 'onboarding-step-number' });
      number.setText(String(index + 1));

      const content = stepEl.createDiv({ cls: 'onboarding-step-content' });
      content.createDiv({ cls: 'onboarding-step-title', text: step.title });
      content.createDiv({ cls: 'onboarding-step-description', text: step.description });
    });

    // Actions
    const actions = container.createDiv({ cls: 'onboarding-actions' });

    const getStartedBtn = actions.createEl('button', {
      text: 'Get Started',
      cls: 'onboarding-button onboarding-button-primary',
    });
    getStartedBtn.addEventListener('click', () => {
      this.currentStep = 'connection';
      this.renderCurrentStep();
    });

    // Skip link
    const skip = container.createDiv({ cls: 'onboarding-skip' });
    const skipLink = skip.createEl('span', {
      text: 'Skip for now',
      cls: 'onboarding-skip-link',
    });
    skipLink.addEventListener('click', () => {
      this.config.onSkip();
      this.close();
    });
  }

  // ============================================================================
  // Connection Step
  // ============================================================================

  private renderConnectionStep(container: HTMLElement): void {
    // Header
    const header = container.createDiv({ cls: 'onboarding-header' });
    header.createEl('h2', { text: 'Connect to Service' });

    // Service URL input
    const urlGroup = container.createDiv({ cls: 'onboarding-input-group' });
    urlGroup.createEl('label', { text: 'Service URL' });

    const urlInput = urlGroup.createEl('input', {
      type: 'url',
      placeholder: 'https://your-service.example.com',
      value: this.serviceUrl,
    });
    urlInput.addEventListener('input', (e) => {
      this.serviceUrl = (e.target as HTMLInputElement).value;
      this.resetConnectionStatus();
    });

    urlGroup.createDiv({
      cls: 'input-hint',
      text: 'The URL of your Notebook Scanner backend service',
    });

    // API Key input
    const keyGroup = container.createDiv({ cls: 'onboarding-input-group' });
    keyGroup.createEl('label', { text: 'API Key' });

    const keyInput = keyGroup.createEl('input', {
      type: 'password',
      placeholder: 'Your API key',
      value: this.apiKey,
    });
    keyInput.addEventListener('input', (e) => {
      this.apiKey = (e.target as HTMLInputElement).value;
      this.resetConnectionStatus();
    });

    keyGroup.createDiv({
      cls: 'input-hint',
      text: 'Your personal API key for authentication',
    });

    // Connection status
    this.renderConnectionStatus(container);

    // Actions
    const actions = container.createDiv({ cls: 'onboarding-actions' });

    const backBtn = actions.createEl('button', {
      text: 'Back',
      cls: 'onboarding-button onboarding-button-secondary',
    });
    backBtn.addEventListener('click', () => {
      this.currentStep = 'welcome';
      this.renderCurrentStep();
    });

    const testBtn = actions.createEl('button', {
      text: 'Test Connection',
      cls: 'onboarding-button onboarding-button-primary',
    });
    testBtn.disabled = !this.canTestConnection();
    testBtn.addEventListener('click', () => this.testConnection());

    // Skip link
    const skip = container.createDiv({ cls: 'onboarding-skip' });
    const skipLink = skip.createEl('span', {
      text: 'Skip for now',
      cls: 'onboarding-skip-link',
    });
    skipLink.addEventListener('click', () => {
      this.config.onSkip();
      this.close();
    });
  }

  private renderConnectionStatus(container: HTMLElement): void {
    if (this.connectionStatus === 'idle') {
      return;
    }

    const statusEl = container.createDiv({ cls: 'onboarding-connection-status' });

    switch (this.connectionStatus) {
      case 'testing':
        statusEl.addClass('is-testing');
        const spinnerEl = statusEl.createDiv();
        setIcon(spinnerEl, 'loader');
        statusEl.createSpan({ text: 'Testing connection...' });
        break;

      case 'success':
        statusEl.addClass('is-success');
        const checkEl = statusEl.createDiv();
        setIcon(checkEl, 'check-circle');
        statusEl.createSpan({ text: 'Connection successful!' });

        // Auto-proceed after short delay
        setTimeout(() => {
          this.currentStep = 'complete';
          this.renderCurrentStep();
        }, 1000);
        break;

      case 'error':
        statusEl.addClass('is-error');
        const errorEl = statusEl.createDiv();
        setIcon(errorEl, 'x-circle');
        statusEl.createSpan({ text: this.connectionError || 'Connection failed' });
        break;
    }
  }

  private canTestConnection(): boolean {
    return this.serviceUrl.trim().length > 0 && this.apiKey.trim().length > 0;
  }

  private resetConnectionStatus(): void {
    if (this.connectionStatus !== 'idle') {
      this.connectionStatus = 'idle';
      this.connectionError = '';
      // Re-render to update status display
      this.renderCurrentStep();
    }
  }

  private async testConnection(): Promise<void> {
    this.connectionStatus = 'testing';
    this.renderCurrentStep();

    try {
      // Test the connection
      const response = await this.config.syncClient.checkHealth();

      if (response.status === 'healthy') {
        this.connectionStatus = 'success';

        // Save settings
        await this.config.onComplete({
          serviceUrl: this.serviceUrl.trim(),
          apiKey: this.apiKey.trim(),
        });
      } else {
        throw new Error('Service is not healthy');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      this.connectionStatus = 'error';
      this.connectionError = getUserErrorMessage(error);
    }

    this.renderCurrentStep();
  }

  // ============================================================================
  // Complete Step
  // ============================================================================

  private renderCompleteStep(container: HTMLElement): void {
    // Header
    const header = container.createDiv({ cls: 'onboarding-header' });
    header.createEl('h2', { text: 'You\'re All Set!' });

    // Success content
    const welcome = container.createDiv({ cls: 'onboarding-welcome' });

    const icon = welcome.createDiv({ cls: 'onboarding-welcome-icon' });
    setIcon(icon, 'check-circle');

    welcome.createEl('p', {
      text: 'Your connection is configured and working.',
    });

    welcome.createEl('p', {
      text: 'You can now start uploading notebook scans. Use the ribbon icon or command palette to get started.',
      cls: 'onboarding-step-description',
    });

    // Quick tips
    const tips = container.createDiv({ cls: 'onboarding-steps' });

    const tipsData = [
      {
        title: 'Upload images',
        description: 'Click the notebook icon in the ribbon or use "Upload Images" command',
      },
      {
        title: 'View queue',
        description: 'Check processing status with "View Queue" command',
      },
      {
        title: 'Customize settings',
        description: 'Adjust folders, templates, and more in plugin settings',
      },
    ];

    tipsData.forEach((tip, index) => {
      const tipEl = tips.createDiv({ cls: 'onboarding-step' });

      const number = tipEl.createDiv({ cls: 'onboarding-step-number' });
      setIcon(number, 'lightbulb');

      const content = tipEl.createDiv({ cls: 'onboarding-step-content' });
      content.createDiv({ cls: 'onboarding-step-title', text: tip.title });
      content.createDiv({ cls: 'onboarding-step-description', text: tip.description });
    });

    // Actions
    const actions = container.createDiv({ cls: 'onboarding-actions' });

    const doneBtn = actions.createEl('button', {
      text: 'Start Using Notebook Scanner',
      cls: 'onboarding-button onboarding-button-primary',
    });
    doneBtn.addEventListener('click', () => {
      this.close();
    });
  }
}

/**
 * Check if onboarding should be shown.
 */
export function shouldShowOnboarding(settings: PluginSettings): boolean {
  return !settings.serviceUrl || !settings.apiKey;
}
