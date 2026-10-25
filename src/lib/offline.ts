import { workspaceHeaders, workspaceStorageKey } from './workspace';
/**
 * Offline support for RADAR.
 *
 * Two mechanisms, both deliberately conservative:
 *  - The service worker caches the app shell and static assets (see public/sw.js).
 *  - A user-triggered "data pack" caches read-only API responses so the last known
 *    dashboard, map, alert, evacuation and resource state can be reviewed offline.
 *
 * RADAR never pretends a queued action reached the server. Queued reports stay in
 * the outbox until the server confirms them.
 */

export const DATA_PACK_CACHE = 'radar-data-pack-v1';
export const OUTBOX_KEY = 'radar:outbox';
export const DATA_PACK_META_KEY = 'radar:data-pack-meta';

export const DATA_PACK_ENDPOINTS = [
  { path: '/api/dashboard', label: 'Dashboard' },
  { path: '/api/map', label: 'Campus map' },
  { path: '/api/alerts', label: 'Alerts' },
  { path: '/api/evacuation', label: 'Evacuation' },
  { path: '/api/resources', label: 'Resources' },
  { path: '/api/emergency/pack', label: 'Emergency contacts and authorized floor plans' },
  { path: '/api/auth/me', label: 'Read-only offline session profile' },
] as const;

export interface DataPackMeta {
  savedAt: string;
  parts: Array<{ path: string; label: string; ok: boolean; bytes: number; error?: string }>;
}

export interface OutboxItem {
  savedRecordId?: number;
  attachments?: Array<{ id: string; caption: string; uploadedUrl?: string; linked?: boolean }>;
  id: string;
  kind: string;
  label: string;
  path: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body: unknown;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readOutbox(): OutboxItem[] {
  if (typeof window === 'undefined') return [];
  return safeParse<OutboxItem[]>(window.localStorage.getItem(workspaceStorageKey(OUTBOX_KEY)), []);
}

export function writeOutbox(items: OutboxItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workspaceStorageKey(OUTBOX_KEY), JSON.stringify(items));
}

export function readDataPackMeta(): DataPackMeta | null {
  if (typeof window === 'undefined') return null;
  return safeParse<DataPackMeta | null>(
    window.localStorage.getItem(workspaceStorageKey(DATA_PACK_META_KEY)),
    null,
  );
}

export function writeDataPackMeta(meta: DataPackMeta) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workspaceStorageKey(DATA_PACK_META_KEY), JSON.stringify(meta));
}

/** Read one JSON document out of the data-pack cache. */
export async function readDataPackDocument<T>(path: string): Promise<T | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await window.caches.open(workspaceStorageKey(DATA_PACK_CACHE));
    const response = await cache.match(path);
    if (!response) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch the read-only endpoints and store their JSON in the Cache API.
 * Partial failures are reported per endpoint rather than hidden.
 */
export async function saveDataPack(): Promise<DataPackMeta> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    throw new Error(
      'This browser does not expose the Cache API, so an offline data pack cannot be stored.',
    );
  }
  const cache = await window.caches.open(workspaceStorageKey(DATA_PACK_CACHE));
  const results = await Promise.all(
    DATA_PACK_ENDPOINTS.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint.path, {
          credentials: 'same-origin',
          headers: { ...workspaceHeaders(), Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
        const text = await response.clone().text();
        const cachedAt = new Date().toISOString();
        await cache.put(
          endpoint.path,
          new Response(text, {
            headers: {
              'Content-Type': 'application/json',
              'X-Radar-Cached-At': cachedAt,
            },
          }),
        );
        return {
          path: endpoint.path,
          label: endpoint.label,
          ok: true,
          bytes: new Blob([text]).size,
        };
      } catch (error) {
        return {
          path: endpoint.path,
          label: endpoint.label,
          ok: false,
          bytes: 0,
          error: error instanceof Error ? error.message : 'Request failed',
        };
      }
    }),
  );

  const mediaParts: DataPackMeta['parts'] = [];
  const pack = await readDataPackDocument<{ floors: Array<{ planImage?: string }> }>(
    '/api/emergency/pack',
  );
  let mediaBytes = 0;
  for (const url of new Set(
    (pack?.floors ?? []).map((f) => f.planImage).filter((value): value is string => Boolean(value)),
  )) {
    try {
      if (!url.startsWith('/uploads/') || new URL(url, location.origin).origin !== location.origin)
        throw new Error('Only this school’s uploaded plans can be cached.');
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Plan image returned HTTP ${response.status}`);
      const image = await response.clone().blob();
      mediaBytes += image.size;
      if (mediaBytes > 50 * 1024 * 1024)
        throw new Error('Floor-plan download exceeds the 50 MB pack limit.');
      await cache.put(url, response);
      mediaParts.push({
        path: url,
        label: 'Authorized floor-plan image',
        ok: true,
        bytes: image.size,
      });
    } catch (error) {
      mediaParts.push({
        path: url,
        label: 'Floor-plan image',
        ok: false,
        bytes: 0,
        error: error instanceof Error ? error.message : 'Image download failed',
      });
    }
  }
  const meta: DataPackMeta = {
    savedAt: new Date().toISOString(),
    parts: [...results, ...mediaParts],
  };
  writeDataPackMeta(meta);

  // Remove documents that were not saved this time so stale data is not implied to be current.
  const keep = new Set(meta.parts.filter((part) => part.ok).map((part) => part.path));
  for (const endpoint of DATA_PACK_ENDPOINTS) {
    if (!keep.has(endpoint.path)) {
      await cache.delete(endpoint.path).catch(() => undefined);
    }
  }

  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (!keep.has(path)) await cache.delete(request);
  }
  return meta;
}

export async function readCachedImage(url: string): Promise<string | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  const cache = await caches.open(workspaceStorageKey(DATA_PACK_CACHE));
  const response = await cache.match(url);
  return response ? URL.createObjectURL(await response.blob()) : null;
}
export async function readOfflineSession<T>(): Promise<T | null> {
  try {
    if (sessionStorage.getItem('radar:offline-session-authorized') !== '1') return null;
  } catch {
    return null;
  }
  const meta = readDataPackMeta();
  if (!meta || Date.now() - Date.parse(meta.savedAt) > 86400000) return null;
  return readDataPackDocument<T>('/api/auth/me');
}

export async function clearDataPack() {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  await window.caches.delete(workspaceStorageKey(DATA_PACK_CACHE)).catch(() => undefined);
  window.localStorage.removeItem(workspaceStorageKey(DATA_PACK_META_KEY));
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
