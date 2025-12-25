/**
 * Core type definitions for the Notebook Scanner plugin.
 * Following Interface Segregation Principle - small, focused interfaces.
 */

// ============================================================================
// Job Types
// ============================================================================

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  hasResult: boolean;
  filename?: string;
  error?: string;
  attempts?: number;
}

// ============================================================================
// Result Types
// ============================================================================

export type NoteCategory =
  | 'meeting'
  | 'lecture'
  | 'brainstorm'
  | 'todo'
  | 'journal'
  | 'sketch'
  | 'other';

export interface ProcessedNote {
  jobId: string;
  title: string;
  content: string;
  tags: string[];
  date: string | null;
  category: NoteCategory;
  summary: string;
  processedAt: string;
}

// ============================================================================
// Settings Types
// ============================================================================

export type OrganizationStyle = 'flat' | 'date' | 'category';
export type FrontmatterFormat = 'yaml' | 'none';

export interface PluginSettings {
  // Service Configuration
  serviceUrl: string;
  apiKey: string;

  // Folder Configuration
  outputFolder: string;
  attachmentFolder: string;
  organizationStyle: OrganizationStyle;

  // Sync Options
  pollInterval: number;
  autoSync: boolean;
  keepLocalCopy: boolean;
  notifyOnSync: boolean;

  // Note Formatting
  noteTemplate: string;
  includeSourceImage: boolean;
  frontmatterFormat: FrontmatterFormat;
}

export interface BackendSettings {
  imageRetentionHours: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface UploadResponse {
  jobIds: string[];
  message: string;
  failed?: Array<{ filename: string; reason: string }>;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobResponse {
  job: Job;
}

export interface ResultResponse {
  result: ProcessedNote;
}

export interface SettingsResponse {
  settings: BackendSettings;
}

export interface ValidationResponse {
  valid: boolean;
  error?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
}

// ============================================================================
// Error Types
// ============================================================================

export type ErrorCode =
  | 'INVALID_API_KEY'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'JOB_NOT_FAILED'
  | 'IMAGE_EXPIRED'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Sync State Types
// ============================================================================

export interface SyncedJob {
  jobId: string;
  syncedAt: string;
  notePath: string;
}

export interface SyncState {
  syncedJobs: SyncedJob[];
  lastSyncTime: string | null;
}

// ============================================================================
// Plugin Data Types
// ============================================================================

export interface PluginData {
  settings: PluginSettings;
  syncState: SyncState;
}

// ============================================================================
// Sync Client Interface (Dependency Inversion Principle)
// ============================================================================

export interface ISyncClient {
  /** Upload images to the backend service */
  uploadImages(files: File[]): Promise<UploadResponse>;

  /** Get all jobs, optionally filtered by status */
  getJobs(status?: JobStatus): Promise<Job[]>;

  /** Get a single job by ID */
  getJob(jobId: string): Promise<Job>;

  /** Get the processed result for a completed job */
  getResult(jobId: string): Promise<ProcessedNote>;

  /** Delete a job */
  deleteJob(jobId: string): Promise<void>;

  /** Retry a failed job */
  retryJob(jobId: string): Promise<void>;

  /** Get backend settings */
  getSettings(): Promise<BackendSettings>;

  /** Update backend settings */
  updateSettings(settings: Partial<BackendSettings>): Promise<BackendSettings>;

  /** Check service health */
  checkHealth(): Promise<HealthResponse>;
}
