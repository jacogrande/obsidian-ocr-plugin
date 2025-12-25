/**
 * Sync Client - Handles all communication with the backend service.
 *
 * This module defines the ISyncClient interface and provides both a real
 * implementation using Obsidian's requestUrl API and a mock for development.
 *
 * Following:
 * - Interface Segregation Principle: ISyncClient is focused on sync operations
 * - Dependency Inversion Principle: Depend on ISyncClient abstraction
 * - Single Responsibility Principle: Only handles backend communication
 */

import { requestUrl, RequestUrlResponse } from 'obsidian';
import type {
  ISyncClient,
  Job,
  JobStatus,
  ProcessedNote,
  UploadResponse,
  BackendSettings,
  HealthResponse,
  PluginSettings,
  ApiError,
} from './types';

// ============================================================================
// Real Implementation
// ============================================================================

/**
 * Response from the signed URL endpoint.
 */
interface SignedUrlResponse {
  signedUrl: string;
  path: string;
}

/**
 * Upload metadata for finalization.
 */
interface UploadMetadata {
  path: string;
  filename: string;
  contentType: string;
  size: number;
}

/**
 * Response from the finalize endpoint.
 */
interface FinalizeResponse {
  jobIds: string[];
  message: string;
}

/**
 * Real implementation of ISyncClient using the backend API.
 *
 * Upload flow:
 * 1. Get signed URL for each file
 * 2. Upload file directly to signed URL
 * 3. Finalize all uploads to create jobs
 */
export class SyncClient implements ISyncClient {
  private settings: PluginSettings;

  constructor(settings: PluginSettings) {
    this.settings = settings;
  }

  /**
   * Update local settings reference (called when plugin settings change).
   */
  setPluginSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  // ============================================================================
  // Upload Methods
  // ============================================================================

  async uploadImages(files: File[]): Promise<UploadResponse> {
    const uploadedMetadata: UploadMetadata[] = [];
    const failed: Array<{ filename: string; reason: string }> = [];

    // Step 1 & 2: Get signed URL and upload each file
    for (const file of files) {
      try {
        // Step 1: Get signed upload URL
        const signedUrlResponse = await this.getSignedUrl(file.name, file.type);

        // Step 2: Upload to signed URL
        await this.uploadToSignedUrl(signedUrlResponse.signedUrl, file);

        // Track successful upload for finalization
        uploadedMetadata.push({
          path: signedUrlResponse.path,
          filename: file.name,
          contentType: file.type || 'image/jpeg',
          size: file.size,
        });
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        failed.push({
          filename: file.name,
          reason: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }

    // If no files uploaded successfully, return early
    if (uploadedMetadata.length === 0) {
      return {
        jobIds: [],
        message: 'No files uploaded successfully',
        failed: failed.length > 0 ? failed : undefined,
      };
    }

    // Step 3: Finalize uploads to create jobs
    try {
      const finalizeResponse = await this.finalizeUploads(uploadedMetadata);
      return {
        jobIds: finalizeResponse.jobIds,
        message: finalizeResponse.message,
        failed: failed.length > 0 ? failed : undefined,
      };
    } catch (error) {
      console.error('Failed to finalize uploads:', error);
      // All uploads failed at finalization
      return {
        jobIds: [],
        message: 'Failed to finalize uploads',
        failed: [
          ...failed,
          ...uploadedMetadata.map((m) => ({
            filename: m.filename,
            reason: 'Finalization failed',
          })),
        ],
      };
    }
  }

  /**
   * Step 1: Get a signed URL for uploading a file.
   */
  private async getSignedUrl(filename: string, contentType: string): Promise<SignedUrlResponse> {
    const response = await this.request<SignedUrlResponse>('POST', '/api/upload/signed-url', {
      filename,
      contentType: contentType || 'image/jpeg',
    });
    return response;
  }

  /**
   * Step 2: Upload file directly to the signed URL.
   */
  private async uploadToSignedUrl(signedUrl: string, file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();

    // Use fetch for signed URL upload (external URL, not our API)
    const response = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'image/jpeg',
      },
      body: arrayBuffer,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Step 3: Finalize uploads to create processing jobs.
   */
  private async finalizeUploads(uploads: UploadMetadata[]): Promise<FinalizeResponse> {
    const response = await this.request<FinalizeResponse>('POST', '/api/upload/finalize', {
      uploads,
    });
    return response;
  }

  // ============================================================================
  // Job Methods
  // ============================================================================

  async getJobs(status?: JobStatus): Promise<Job[]> {
    const endpoint = status ? `/api/jobs?status=${status}` : '/api/jobs';
    const response = await this.request<{ jobs: Job[] }>('GET', endpoint);
    return response.jobs;
  }

  async getJob(jobId: string): Promise<Job> {
    const response = await this.request<{ job: Job }>('GET', `/api/jobs/${jobId}`);
    return response.job;
  }

  async getResult(jobId: string): Promise<ProcessedNote> {
    const response = await this.request<{ result: ProcessedNote }>('GET', `/api/results/${jobId}`);
    return response.result;
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/jobs/${jobId}`);
  }

  async retryJob(jobId: string): Promise<void> {
    await this.request<void>('POST', `/api/jobs/${jobId}/retry`);
  }

  // ============================================================================
  // Settings Methods
  // ============================================================================

  async getSettings(): Promise<BackendSettings> {
    const response = await this.request<{ settings: BackendSettings }>('GET', '/api/settings');
    return response.settings;
  }

  async updateSettings(settings: Partial<BackendSettings>): Promise<BackendSettings> {
    const response = await this.request<{ settings: BackendSettings }>(
      'PATCH',
      '/api/settings',
      settings
    );
    return response.settings;
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async checkHealth(): Promise<HealthResponse> {
    const response = await this.request<HealthResponse>('GET', '/api/health');
    return response;
  }

  // ============================================================================
  // HTTP Helper
  // ============================================================================

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.settings.serviceUrl.replace(/\/$/, '')}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.settings.apiKey}`,
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    let response: RequestUrlResponse;
    try {
      response = await requestUrl({
        url,
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        throw: false,
      });
    } catch (error) {
      throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Handle error responses
    if (response.status >= 400) {
      const errorBody = response.json as ApiError | undefined;
      const message = errorBody?.message || `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    // Return empty object for 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json as T;
  }
}

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
 * Returns real client when configured, mock client for development.
 */
export function createSyncClient(settings: PluginSettings): ISyncClient {
  // Use real client when service URL is configured
  if (settings.serviceUrl && settings.apiKey) {
    return new SyncClient(settings);
  }

  // Fall back to mock client for development/testing
  return new MockSyncClient(settings);
}
