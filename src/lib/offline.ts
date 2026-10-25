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
] as const;

export interface DataPackMeta {
  savedAt: string;
  parts: Array<{ path: string; label: string; ok: boolean; bytes: number; error?: string }>;
}

export interface OutboxItem {
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
  return safeParse<OutboxItem[]>(window.localStorage.getItem(OUTBOX_KEY), []);
}

export function writeOutbox(items: OutboxItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export function readDataPackMeta(): DataPackMeta | null {
  if (typeof window === 'undefined') return null;
  return safeParse<DataPackMeta | null>(window.localStorage.getItem(DATA_PACK_META_KEY), null);
}

export function writeDataPackMeta(meta: DataPackMeta) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DATA_PACK_META_KEY, JSON.stringify(meta));
}

/** Read one JSON document out of the data-pack cache. */
export async function readDataPackDocument<T>(path: string): Promise<T | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await window.caches.open(DATA_PACK_CACHE);
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
    throw new Error('This browser does not expose the Cache API, so an offline data pack cannot be stored.');
  }
  const cache = await window.caches.open(DATA_PACK_CACHE);
  const results = await Promise.all(
    DATA_PACK_ENDPOINTS.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint.path, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
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

  const meta: DataPackMeta = { savedAt: new Date().toISOString(), parts: results };
  writeDataPackMeta(meta);

  // Remove documents that were not saved this time so stale data is not implied to be current.
  const keep = new Set(results.filter((part) => part.ok).map((part) => part.path));
  for (const endpoint of DATA_PACK_ENDPOINTS) {
    if (!keep.has(endpoint.path)) {
      await cache.delete(endpoint.path).catch(() => undefined);
    }
  }

  return meta;
}

export async function clearDataPack() {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  await window.caches.delete(DATA_PACK_CACHE).catch(() => undefined);
  window.localStorage.removeItem(DATA_PACK_META_KEY);
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
