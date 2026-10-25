/**
 * Thin typed client for the RADAR API.
 * Every request carries the session cookie; errors are surfaced as ApiError.
 */

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && String(payload.error)) ||
      `Request failed with status ${res.status}.`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ?? {} }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Upload a binary image. Returns the stored URL. */
  async upload(file: File, signal?: AbortSignal): Promise<{ url: string; mime: string; bytes: number }> {
    const res = await fetch('/api/uploads', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
      signal,
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        (payload && typeof payload === 'object' && 'error' in payload && String(payload.error)) ||
        'Upload failed.';
      throw new ApiError(res.status, message, payload);
    }
    return payload as { url: string; mime: string; bytes: number };
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
