import type {
  ApiErrorBody,
  ConversionJob,
  ConversionSettings,
  ConvertResponse,
  ErrorCode,
  FormatsResponse,
  HistoryResponse,
  JobEvent,
  UploadResponse,
} from '@shared';

/**
 * Empty by default, which means same-origin `/api`. That is how production runs,
 * and the Vite dev server proxies `/api` to the API process so development
 * behaves identically. Set VITE_API_URL only for a split deployment.
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const API = `${BASE}/api`;

/** An error carrying the machine-readable code the UI maps to a friendly string. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(body.error.code, body.error.message, response.status);
  } catch {
    return new ApiError('INTERNAL_ERROR', 'Something went wrong.', response.status);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, init);
  } catch {
    // fetch only rejects on a transport failure, so this really is the network.
    throw new ApiError('INTERNAL_ERROR', 'Network request failed', 0);
  }
  if (!response.ok) throw await toApiError(response);

  // A misrouted request can return the SPA's own HTML with a 200. Parsing that
  // as JSON would throw a bare SyntaxError that no caller expects, so name it.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Expected JSON from ${path} but received "${contentType || 'no content type'}". ` +
        'Is the API server running?',
      response.status,
    );
  }

  return (await response.json()) as T;
}

export const getFormats = () => request<FormatsResponse>('/formats');

export const getHistory = (limit = 50) => request<HistoryResponse>(`/history?limit=${limit}`);

export const getJob = (id: string) => request<ConversionJob>(`/conversion/${id}`);

export const deleteJob = async (id: string): Promise<void> => {
  const response = await fetch(`${API}/conversion/${id}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw await toApiError(response);
};

export const convert = (
  uploadIds: string[],
  to: string,
  settings?: ConversionSettings,
): Promise<ConvertResponse> =>
  request<ConvertResponse>('/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadIds, to, settings }),
  });

/**
 * Upload with real progress. `fetch` cannot report request progress, so this is
 * the one place XMLHttpRequest earns its keep.
 */
export function upload(
  files: File[],
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/upload`);
    xhr.responseType = 'json';

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    });

    xhr.addEventListener('load', () => {
      const body = xhr.response as UploadResponse | ApiErrorBody | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && 'files' in body) {
        onProgress?.(1);
        resolve(body);
        return;
      }
      const error = body && 'error' in body ? body.error : null;
      reject(
        new ApiError(
          error?.code ?? 'INTERNAL_ERROR',
          error?.message ?? 'Upload failed',
          xhr.status,
        ),
      );
    });

    xhr.addEventListener('error', () =>
      reject(new ApiError('INTERNAL_ERROR', 'Network request failed', 0)),
    );
    xhr.addEventListener('abort', () =>
      reject(new ApiError('INTERNAL_ERROR', 'Upload cancelled', 0)),
    );

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

export const downloadUrl = (jobId: string): string => `${API}/download/${jobId}`;

/** Trigger a browser download without navigating away from the app. */
export function triggerDownload(url: string, filename?: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  if (filename) anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/** Batch download: POST the ids, then hand the returned ZIP blob to the browser. */
export async function downloadBatch(jobIds: string[]): Promise<void> {
  const response = await fetch(`${API}/download/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobIds }),
  });
  if (!response.ok) throw await toApiError(response);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  triggerDownload(url, 'fileflow-converted.zip');
  // Revoke on the next tick so the click has definitely been handled.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Subscribe to live job progress. Returns an unsubscribe function; EventSource
 * reconnects on its own, so callers do not need retry logic.
 */
export function subscribeToJobs(onEvent: (event: JobEvent) => void): () => void {
  const source = new EventSource(`${API}/events`);

  const handle = (event: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(event.data) as JobEvent);
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  };

  for (const name of ['job.progress', 'job.completed', 'job.failed']) {
    source.addEventListener(name, handle as EventListener);
  }

  return () => source.close();
}
