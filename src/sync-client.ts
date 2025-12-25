/**
 * Sync Client - Handles all communication with the backend service.
 *
 * This module defines the ISyncClient interface and provides a mock
 * implementation for development. The real implementation will use
 * Obsidian's requestUrl API.
 *
 * Following:
 * - Interface Segregation Principle: ISyncClient is focused on sync operations
 * - Dependency Inversion Principle: Depend on ISyncClient abstraction
 * - Single Responsibility Principle: Only handles backend communication
 */

import type {
  ISyncClient,
  Job,
  JobStatus,
  ProcessedNote,
  UploadResponse,
  BackendSettings,
  HealthResponse,
  PluginSettings,
} from './types';

// ============================================================================
// Mock Implementation for Development
// ============================================================================

/**
 * Mock implementation of ISyncClient for development and testing.
 * Returns simulated data without making real API calls.
 */
export class MockSyncClient implements ISyncClient {
  private settings: PluginSettings;
  private mockJobs: Map<string, Job> = new Map();
  private mockResults: Map<string, ProcessedNote> = new Map();
  private jobCounter = 0;

  constructor(settings: PluginSettings) {
    this.settings = settings;
  }

  /**
   * Update local settings reference (called when plugin settings change).
   */
  setPluginSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  async uploadImages(files: File[]): Promise<UploadResponse> {
    await this.simulateLatency();

    const jobIds: string[] = [];
    const failed: Array<{ filename: string; reason: string }> = [];

    for (const file of files) {
      // Simulate some validation failures
      if (file.size > 20 * 1024 * 1024) {
        failed.push({ filename: file.name, reason: 'File too large' });
        continue;
      }

      const jobId = this.createMockJob(file.name);
      jobIds.push(jobId);

      // Simulate async processing
      this.simulateProcessing(jobId, file.name);
    }

    return {
      jobIds,
      message: `${jobIds.length} images queued for processing`,
      failed: failed.length > 0 ? failed : undefined,
    };
  }

  async getJobs(status?: JobStatus): Promise<Job[]> {
    await this.simulateLatency();

    const jobs = Array.from(this.mockJobs.values());

    if (status) {
      return jobs.filter((job) => job.status === status);
    }

    return jobs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getJob(jobId: string): Promise<Job> {
    await this.simulateLatency();

    const job = this.mockJobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return job;
  }

  async getResult(jobId: string): Promise<ProcessedNote> {
    await this.simulateLatency();

    const result = this.mockResults.get(jobId);
    if (!result) {
      throw new Error(`Result for job ${jobId} not found`);
    }

    return result;
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.simulateLatency();

    if (!this.mockJobs.has(jobId)) {
      throw new Error(`Job ${jobId} not found`);
    }

    this.mockJobs.delete(jobId);
    this.mockResults.delete(jobId);
  }

  async retryJob(jobId: string): Promise<void> {
    await this.simulateLatency();

    const job = this.mockJobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== 'failed') {
      throw new Error(`Cannot retry job with status ${job.status}`);
    }

    // Reset job to pending
    job.status = 'pending';
    job.error = undefined;
    job.attempts = 0;

    // Simulate processing again
    this.simulateProcessing(jobId, 'retry.jpg');
  }

  async getSettings(): Promise<BackendSettings> {
    await this.simulateLatency();

    return {
      imageRetentionHours: 24,
    };
  }

  async updateSettings(settings: Partial<BackendSettings>): Promise<BackendSettings> {
    await this.simulateLatency();

    // In mock, just return the merged settings
    return {
      imageRetentionHours: settings.imageRetentionHours || 24,
    };
  }

  async checkHealth(): Promise<HealthResponse> {
    await this.simulateLatency();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private createMockJob(filename: string): string {
    const jobId = `mock-job-${++this.jobCounter}-${Date.now()}`;
    const now = new Date().toISOString();

    this.mockJobs.set(jobId, {
      id: jobId,
      status: 'pending',
      createdAt: now,
      startedAt: null,
      completedAt: null,
      hasResult: false,
      filename,
      attempts: 0,
    });

    return jobId;
  }

  private simulateProcessing(jobId: string, filename: string): void {
    // Move to processing after 1 second
    setTimeout(() => {
      const job = this.mockJobs.get(jobId);
      if (job && job.status === 'pending') {
        job.status = 'processing';
        job.startedAt = new Date().toISOString();
        job.attempts = 1;
      }
    }, 1000);

    // Complete after 3-5 seconds
    const processingTime = 3000 + Math.random() * 2000;
    setTimeout(() => {
      const job = this.mockJobs.get(jobId);
      if (job && job.status === 'processing') {
        // 90% success rate in mock
        if (Math.random() > 0.1) {
          job.status = 'completed';
          job.completedAt = new Date().toISOString();
          job.hasResult = true;

          // Create mock result
          this.mockResults.set(jobId, this.createMockResult(jobId, filename));
        } else {
          job.status = 'failed';
          job.completedAt = new Date().toISOString();
          job.error = 'Simulated processing failure';
        }
      }
    }, processingTime);
  }

  private createMockResult(jobId: string, filename: string): ProcessedNote {
    const categories = ['meeting', 'lecture', 'brainstorm', 'todo', 'journal'] as const;
    const category = categories[Math.floor(Math.random() * categories.length)];

    return {
      jobId,
      title: `Notes from ${filename.replace(/\.[^/.]+$/, '')}`,
      content: `# Meeting Notes\n\n## Attendees\n- Alice\n- Bob\n- Charlie\n\n## Discussion Points\n\n1. Project timeline review\n2. Budget allocation\n3. Next steps\n\n## Action Items\n\n- [ ] Alice: Prepare presentation\n- [ ] Bob: Review documentation\n- [ ] Charlie: Schedule follow-up`,
      tags: ['mock', 'example', category],
      date: new Date().toISOString().split('T')[0],
      category,
      summary: 'This is a mock processed note for development and testing purposes.',
      processedAt: new Date().toISOString(),
    };
  }

  private async simulateLatency(): Promise<void> {
    const latency = 100 + Math.random() * 200;
    await new Promise((resolve) => setTimeout(resolve, latency));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a sync client instance.
 * Currently returns a mock client; will return real client when implemented.
 */
export function createSyncClient(settings: PluginSettings): ISyncClient {
  // TODO: Return real SyncClient when backend is available
  // if (settings.serviceUrl) {
  //   return new SyncClient(settings);
  // }

  return new MockSyncClient(settings);
}
