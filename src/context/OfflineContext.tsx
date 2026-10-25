'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { workspaceHeaders } from '@/lib/workspace';
import { readOutbox, writeOutbox, type OutboxItem } from '@/lib/offline';

interface OfflineContextValue {
  online: boolean;
  pending: OutboxItem[];
  pendingCount: number;
  flushing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  enqueue: (item: Omit<OutboxItem, 'id' | 'createdAt' | 'attempts' | 'lastError'>) => OutboxItem;
  remove: (id: string) => void;
  flush: () => Promise<{ sent: number; failed: number }>;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `outbox-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [pending, setPending] = useState<OutboxItem[]>(() => readOutbox());
  const [flushing, setFlushing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const flushingRef = useRef(false);

  const persist = useCallback((items: OutboxItem[]) => {
    setPending(items);
    writeOutbox(items);
  }, []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const enqueue = useCallback<OfflineContextValue['enqueue']>(
    (item) => {
      const entry: OutboxItem = {
        ...item,
        id: makeId(),
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
      };
      persist([...readOutbox(), entry]);
      return entry;
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist(readOutbox().filter((item) => item.id !== id));
    },
    [persist],
  );

  const flush = useCallback(async () => {
    if (flushingRef.current) return { sent: 0, failed: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLastError('Still offline. Queued items were kept.');
      return { sent: 0, failed: readOutbox().length };
    }
    flushingRef.current = true;
    setFlushing(true);
    setLastError(null);
    let sent = 0;
    let failed = 0;

    let remaining = readOutbox();
    for (const item of remaining) {
      try {
        const response = await fetch(item.path, {
          method: item.method,
          credentials: 'same-origin',
          headers: { ...workspaceHeaders(), ...(item.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: item.body === undefined ? undefined : JSON.stringify(item.body),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            (payload && typeof payload === 'object' && 'error' in payload && String(payload.error)) ||
              `Request failed with status ${response.status}.`,
          );
        }
        sent += 1;
        remaining = remaining.filter((queued) => queued.id !== item.id);
        persist(remaining);
      } catch (error) {
        failed += 1;
        remaining = remaining.map((queued) =>
          queued.id === item.id
            ? {
                ...queued,
                attempts: queued.attempts + 1,
                lastError: error instanceof Error ? error.message : 'Upload failed',
              }
            : queued,
        );
        persist(remaining);
      }
    }

    setFlushing(false);
    flushingRef.current = false;
    if (sent > 0) setLastSyncAt(new Date().toISOString());
    if (failed > 0) setLastError(`${failed} queued item(s) could not be sent. They are still stored on this device.`);
    return { sent, failed };
  }, [persist]);

  // Reconnecting does not silently replay writes; the user confirms a flush so an
  // offline-authored report cannot change server state without their knowledge.
  useEffect(() => {
    if (!online) return;
    const count = readOutbox().length;
    if (count > 0) {
      setLastError(`${count} queued item(s) are waiting. Review them and choose “Send queued”.`);
    }
  }, [online]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      online,
      pending,
      pendingCount: pending.length,
      flushing,
      lastSyncAt,
      lastError,
      enqueue,
      remove,
      flush,
    }),
    [online, pending, flushing, lastSyncAt, lastError, enqueue, remove, flush],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used inside OfflineProvider.');
  return context;
}
