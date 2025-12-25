# Notebook Scanner Backend - Product Requirements Document

## Overview

The backend service receives images of handwritten notebook pages from the Obsidian plugin, processes them through LLM vision APIs to extract and structure the content, and returns the results for the plugin to create notes.

**Core Value Proposition**: Users can upload images and close the app. Processing continues server-side, and results are available when they return.

---

## Functional Requirements

### Authentication

- Users authenticate via API key (Bearer token in Authorization header)
- Each user has a unique API key
- API keys can be revoked and regenerated
- Rate limiting per API key to prevent abuse

---

## API Endpoints

### 1. Upload Images

**Purpose**: Accept one or more images for processing.

```
POST /api/upload
```

**Request**:
- Content-Type: `multipart/form-data`
- Body: One or more image files (field name: `images`)
- Supported formats: JPEG, PNG, WebP, HEIC
- Maximum file size: 20MB per image
- Maximum batch size: 50 images per request

**Response** (Success - 201):
```json
{
  "jobIds": ["uuid-1", "uuid-2", "uuid-3"],
  "message": "3 images queued for processing"
}
```

**Response** (Partial Success - 207):
```json
{
  "jobIds": ["uuid-1", "uuid-2"],
  "failed": [
    { "filename": "image3.jpg", "reason": "File too large" }
  ],
  "message": "2 images queued, 1 failed"
}
```

**Errors**:
- `400` - No images provided or invalid format
- `401` - Invalid or missing API key
- `413` - File(s) exceed size limit
- `429` - Rate limit exceeded

**Behavior**:
- Each uploaded image creates a processing job
- Images are stored temporarily until processing completes
- Jobs are queued for asynchronous processing
- Returns immediately after queuing (does not wait for processing)

---

### 2. List Jobs

**Purpose**: Retrieve all jobs for the authenticated user.

```
GET /api/jobs
```

**Query Parameters**:
- `status` (optional): Filter by status (`pending`, `processing`, `completed`, `failed`)
- `limit` (optional): Number of results (default: 50, max: 200)
- `offset` (optional): Pagination offset (default: 0)
- `since` (optional): ISO timestamp - only return jobs created after this time

**Response** (Success - 200):
```json
{
  "jobs": [
    {
      "id": "uuid-1",
      "status": "completed",
      "createdAt": "2025-01-15T10:30:00Z",
      "startedAt": "2025-01-15T10:30:05Z",
      "completedAt": "2025-01-15T10:30:12Z",
      "hasResult": true
    },
    {
      "id": "uuid-2",
      "status": "processing",
      "createdAt": "2025-01-15T10:30:00Z",
      "startedAt": "2025-01-15T10:30:15Z",
      "completedAt": null,
      "hasResult": false
    },
    {
      "id": "uuid-3",
      "status": "failed",
      "createdAt": "2025-01-15T10:30:00Z",
      "startedAt": "2025-01-15T10:30:20Z",
      "completedAt": "2025-01-15T10:30:22Z",
      "error": "LLM API rate limit exceeded",
      "hasResult": false
    }
  ],
  "total": 3,
  "limit": 50,
  "offset": 0
}
```

**Errors**:
- `401` - Invalid or missing API key

---

### 3. Get Job Status

**Purpose**: Get detailed status of a single job.

```
GET /api/jobs/:jobId
```

**Response** (Success - 200):
```json
{
  "job": {
    "id": "uuid-1",
    "status": "completed",
    "attempts": 1,
    "createdAt": "2025-01-15T10:30:00Z",
    "startedAt": "2025-01-15T10:30:05Z",
    "completedAt": "2025-01-15T10:30:12Z",
    "hasResult": true
  }
}
```

**Response** (Failed Job - 200):
```json
{
  "job": {
    "id": "uuid-3",
    "status": "failed",
    "attempts": 3,
    "createdAt": "2025-01-15T10:30:00Z",
    "startedAt": "2025-01-15T10:30:20Z",
    "completedAt": "2025-01-15T10:30:22Z",
    "error": "LLM API returned invalid response after 3 attempts",
    "hasResult": false
  }
}
```

**Errors**:
- `401` - Invalid or missing API key
- `404` - Job not found or does not belong to user

---

### 4. Get Result

**Purpose**: Retrieve the processed note content for a completed job.

```
GET /api/results/:jobId
```

**Response** (Success - 200):
```json
{
  "result": {
    "jobId": "uuid-1",
    "title": "Meeting Notes - Product Roadmap Discussion",
    "content": "## Attendees\n- Sarah (PM)\n- John (Eng)\n- Lisa (Design)\n\n## Key Points\n\n### Q1 Priorities\n- Launch mobile app\n- Improve onboarding flow\n\n### Action Items\n- [ ] John: API documentation by Friday\n- [ ] Lisa: Wireframes for new dashboard",
    "tags": ["meeting", "product", "roadmap"],
    "date": "2025-01-15",
    "category": "meeting",
    "summary": "Product roadmap meeting covering Q1 priorities including mobile app launch and onboarding improvements. Action items assigned to John and Lisa.",
    "processedAt": "2025-01-15T10:30:12Z"
  }
}
```

**Errors**:
- `401` - Invalid or missing API key
- `404` - Job not found, does not belong to user, or not yet completed
- `410` - Result expired and was deleted (if retention policy applied)

---

### 5. Delete Job

**Purpose**: Cancel a pending job or delete a completed job and its result.

```
DELETE /api/jobs/:jobId
```

**Response** (Success - 200):
```json
{
  "success": true,
  "message": "Job deleted"
}
```

**Behavior**:
- If job is `pending`: removes from queue, deletes stored image
- If job is `processing`: marks for cancellation (best effort), processing may still complete
- If job is `completed` or `failed`: deletes job record, result, and stored image (if still exists)

**Errors**:
- `401` - Invalid or missing API key
- `404` - Job not found or does not belong to user

---

### 6. Retry Failed Job

**Purpose**: Re-queue a failed job for another processing attempt.

```
POST /api/jobs/:jobId/retry
```

**Response** (Success - 200):
```json
{
  "success": true,
  "message": "Job re-queued for processing"
}
```

**Behavior**:
- Only works for jobs with status `failed`
- Resets attempt counter
- Re-queues for processing
- Original image must still be available

**Errors**:
- `401` - Invalid or missing API key
- `404` - Job not found or does not belong to user
- `409` - Job is not in `failed` status
- `410` - Original image no longer available

---

### 7. Get User Settings

**Purpose**: Retrieve current user settings.

```
GET /api/settings
```

**Response** (Success - 200):
```json
{
  "settings": {
    "llmProvider": "gemini",
    "model": "gemini-2.0-flash",
    "hasApiKey": true,
    "customPrompt": null,
    "imageRetentionHours": 24,
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

**Note**: The actual LLM API key is never returned, only whether one is set.

**Errors**:
- `401` - Invalid or missing API key

---

### 8. Update User Settings

**Purpose**: Update user preferences for processing.

```
PATCH /api/settings
```

**Request**:
```json
{
  "llmProvider": "openai",
  "model": "gpt-4o",
  "llmApiKey": "sk-...",
  "customPrompt": "Focus on extracting action items and deadlines.",
  "imageRetentionHours": 0
}
```

**Fields** (all optional):
- `llmProvider`: One of `gemini`, `openai`, `anthropic`
- `model`: Model identifier (validated against provider's available models)
- `llmApiKey`: User's API key for the LLM provider (stored encrypted)
- `customPrompt`: Additional instructions appended to the base prompt (max 1000 chars)
- `imageRetentionHours`: How long to keep images after processing (0 = delete immediately, max 168 = 7 days)

**Response** (Success - 200):
```json
{
  "success": true,
  "settings": {
    "llmProvider": "openai",
    "model": "gpt-4o",
    "hasApiKey": true,
    "customPrompt": "Focus on extracting action items and deadlines.",
    "imageRetentionHours": 0
  }
}
```

**Errors**:
- `400` - Invalid provider, model, or field values
- `401` - Invalid or missing API key

---

### 9. Validate LLM API Key

**Purpose**: Test that the configured LLM API key is valid.

```
POST /api/settings/validate-llm-key
```

**Request**:
```json
{
  "provider": "openai",
  "apiKey": "sk-..."
}
```

**Response** (Success - 200):
```json
{
  "valid": true,
  "provider": "openai",
  "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
}
```

**Response** (Invalid Key - 200):
```json
{
  "valid": false,
  "error": "Invalid API key"
}
```

**Errors**:
- `400` - Missing provider or apiKey
- `401` - Invalid or missing service API key

---

### 10. Health Check

**Purpose**: Verify service is running (no authentication required).

```
GET /health
```

**Response** (Success - 200):
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## Data Models

### Job

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| userId | UUID | Owner of the job |
| status | Enum | `pending`, `processing`, `completed`, `failed` |
| attempts | Integer | Number of processing attempts |
| error | String | Error message if failed |
| createdAt | Timestamp | When job was created |
| startedAt | Timestamp | When processing began |
| completedAt | Timestamp | When processing finished |

### Result

| Field | Type | Description |
|-------|------|-------------|
| jobId | UUID | Associated job |
| title | String | Generated title (max 100 chars) |
| content | String | Markdown-formatted note content |
| tags | Array[String] | 2-5 generated tags |
| date | Date | Extracted date (if found in image) |
| category | Enum | `meeting`, `lecture`, `brainstorm`, `todo`, `journal`, `sketch`, `other` |
| summary | String | 1-2 sentence summary |
| processedAt | Timestamp | When result was generated |

### User Settings

| Field | Type | Description |
|-------|------|-------------|
| llmProvider | Enum | `gemini`, `openai`, `anthropic` |
| model | String | Model identifier |
| llmApiKey | String | Encrypted API key for LLM provider |
| customPrompt | String | User's additional prompt instructions |
| imageRetentionHours | Integer | Hours to retain images (0-168) |

---

## Processing Requirements

### Job Queue Behavior

1. Jobs are processed in FIFO order per user
2. Failed jobs are retried automatically up to 3 times with exponential backoff
3. Jobs stuck in `processing` for more than 5 minutes are considered failed and retried
4. Maximum queue depth per user: 500 pending jobs

### LLM Processing

1. Images are sent to the configured LLM provider's vision API
2. A structured prompt requests JSON output with title, content, tags, date, category, and summary
3. Response is validated for required fields
4. Invalid LLM responses trigger a retry

### Image Handling

1. Images are stored temporarily upon upload
2. Images are retained according to user's `imageRetentionHours` setting
3. A cleanup process runs periodically to delete expired images
4. If an image is deleted before processing completes, the job fails

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /api/upload | 100 images per hour |
| GET /api/jobs | 60 requests per minute |
| GET /api/results/:id | 60 requests per minute |
| All other endpoints | 30 requests per minute |

Rate limit headers included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid or expired",
    "details": {}
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_API_KEY` | 401 | API key is missing, invalid, or revoked |
| `NOT_FOUND` | 404 | Resource does not exist or user lacks access |
| `VALIDATION_ERROR` | 400 | Request body or parameters are invalid |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `FILE_TOO_LARGE` | 413 | Uploaded file exceeds size limit |
| `UNSUPPORTED_FORMAT` | 400 | File format not supported |
| `JOB_NOT_FAILED` | 409 | Cannot retry a job that hasn't failed |
| `IMAGE_EXPIRED` | 410 | Image was deleted due to retention policy |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Non-Functional Requirements

### Performance
- Upload endpoint responds within 2 seconds (excluding transfer time)
- Job status queries respond within 200ms
- 95th percentile processing time per image: 30 seconds

### Availability
- 99.5% uptime target
- Graceful degradation if LLM provider is unavailable (jobs queue, retry later)

### Security
- All endpoints served over HTTPS only
- API keys stored using one-way hashing
- LLM API keys stored with encryption at rest
- Images stored with encryption at rest
- No PII logged

### Data Retention
- Completed jobs and results retained for 30 days
- Failed jobs retained for 7 days
- Images retained per user setting (default 24 hours, max 7 days)
- Users can delete their data at any time
