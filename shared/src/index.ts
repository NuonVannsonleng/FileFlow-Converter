/**
 * Contract shared by the REST API and the web client.
 * The server is the single source of truth for what can actually be converted;
 * the client never hardcodes a conversion matrix of its own.
 */

export type Category = 'document' | 'image' | 'audio' | 'video' | 'archive';

export const CATEGORIES: Category[] = ['document', 'image', 'audio', 'video', 'archive'];

/** Engine that performs the work. Availability is probed at server startup. */
export type Engine = 'sharp' | 'ffmpeg' | 'native' | 'libreoffice' | 'archive';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'expired';

export type ErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_FILES'
  | 'CONVERSION_FAILED'
  | 'CORRUPTED_FILE'
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

/** A file format the app knows how to describe. */
export interface FormatInfo {
  /** Lowercase canonical extension, e.g. `jpg`. */
  id: string;
  label: string;
  description: string;
  category: Category;
  mimeType: string;
  /** Extra extensions that map onto this format, e.g. `jpeg` -> `jpg`. */
  aliases?: string[];
}

/** One supported source -> target pair, as reported by `GET /api/formats`. */
export interface ConversionOption {
  from: string;
  to: string;
  category: Category;
  engine: Engine;
  /** False when the engine is not installed; the UI shows these as "Coming soon". */
  available: boolean;
  /** Human readable caveat, e.g. "Text and layout only". */
  note?: string;
}

export interface CapabilityReport {
  engines: Record<Engine, { available: boolean; version?: string; detail?: string }>;
  maxFileSizeBytes: number;
  maxFilesPerBatch: number;
  fileTtlMinutes: number;
}

export interface FormatsResponse {
  formats: FormatInfo[];
  conversions: ConversionOption[];
  capabilities: CapabilityReport;
}

/** Per-conversion tuning. All fields optional; unknown fields are rejected. */
export interface ConversionSettings {
  // Image
  quality?: number; // 1-100
  width?: number;
  height?: number;
  maintainAspectRatio?: boolean;
  compressionLevel?: number; // 0-9, PNG
  backgroundColor?: string; // #rrggbb, flattening transparency
  // Audio
  audioBitrate?: number; // kbps
  sampleRate?: number; // Hz
  channels?: number; // 1 | 2
  // Video
  resolution?: string; // e.g. "1280x720" | "original"
  fps?: number;
  videoBitrate?: number; // kbps
  videoCodec?: string;
  audioCodec?: string;
  extractAudioOnly?: boolean;
}

export interface UploadedFileInfo {
  id: string;
  originalName: string;
  /** Canonical source format id, e.g. `docx`. */
  format: string;
  category: Category;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  expiresAt: string;
  /** Targets this specific upload can be converted into. */
  targets: string[];
}

export interface UploadResponse {
  files: UploadedFileInfo[];
}

export interface ConversionJob {
  id: string;
  uploadId: string;
  originalName: string;
  from: string;
  to: string;
  category: Category;
  status: JobStatus;
  /** 0-100. Best-effort; some engines only report start/end. */
  progress: number;
  stage: 'preparing' | 'converting' | 'finalizing' | 'done' | 'error';
  inputSizeBytes: number;
  outputSizeBytes?: number;
  outputName?: string;
  durationMs?: number;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
  error?: { code: ErrorCode; message: string };
  settings?: ConversionSettings;
}

export interface ConvertRequest {
  uploadIds: string[];
  to: string;
  settings?: ConversionSettings;
}

export interface ConvertResponse {
  jobs: ConversionJob[];
}

export interface HistoryResponse {
  jobs: ConversionJob[];
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/** Payload pushed over SSE (`GET /api/events`). */
export type JobEvent =
  | { type: 'job.progress'; job: ConversionJob }
  | { type: 'job.completed'; job: ConversionJob }
  | { type: 'job.failed'; job: ConversionJob }
  | { type: 'ping' };

export const isTerminal = (status: JobStatus): boolean =>
  status === 'completed' || status === 'failed' || status === 'expired';
