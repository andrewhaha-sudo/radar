'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  DoorOpen,
  Loader2,
  MapPinned,
  RadioTower,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SeverityBadge } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type { SearchResult } from '@/lib/types';

interface SearchResponse {
  query: string;
  results: SearchResult[];
}

const KIND_META = {
  hazard: { label: 'Hazard', icon: ShieldAlert, className: 'bg-danger/10 text-danger' },
  incident: { label: 'Incident', icon: AlertTriangle, className: 'bg-warning/10 text-warning' },
  alert: { label: 'Alert', icon: BellRing, className: 'bg-danger/10 text-danger' },
  advisory: { label: 'Advisory', icon: RadioTower, className: 'bg-info/10 text-info' },
  room: { label: 'Room', icon: DoorOpen, className: 'bg-info/10 text-info' },
  building: { label: 'Building', icon: Building2, className: 'bg-primary/10 text-primary' },
} as const;

const KIND_ORDER: Array<SearchResult['kind']> = [
  'alert',
  'advisory',
  'hazard',
  'incident',
  'room',
  'building',
];

export function SearchPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get('q') ?? '';

  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounce the input into the URL so the search is shareable.
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed === query) return;
    const timer = window.setTimeout(() => {
      setQuery(trimmed);
      const next = new URLSearchParams(params);
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      setParams(next, { replace: true });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [input, query, params, setParams]);

  useEffect(() => {
    if (query.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      setError(null);
      setSearched(query.length > 0);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    api
      .get<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`, controller.signal)
      .then((payload) => {
        setResults(payload.results ?? []);
        setSearched(true);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<SearchResult['kind'], SearchResult[]>();
    for (const result of results) {
      const list = map.get(result.kind) ?? [];
      list.push(result);
      map.set(result.kind, list);
    }
    return KIND_ORDER.filter((kind) => (map.get(kind)?.length ?? 0) > 0).map((kind) => ({
      kind,
      items: map.get(kind) ?? [],
    }));
  }, [results]);

  const openResult = useCallback(
    (result: SearchResult) => {
      switch (result.kind) {
        case 'hazard':
          if (can('hazards:read')) navigate(`/hazards?open=${result.id}`);
          else navigate('/search');
          break;
        case 'incident':
          navigate(`/incidents?open=${result.id}`);
          break;
        case 'room':
          if (can('scan:write')) navigate(`/scan?roomId=${result.id}`);
          else if (can('buildings:read'))
            navigate(`/buildings?q=${encodeURIComponent(result.ref ?? result.title)}`);
          else navigate('/map');
          break;
        case 'building':
          if (can('buildings:read')) navigate(`/buildings?q=${encodeURIComponent(result.title)}`);
          else navigate('/map');
          break;
        case 'alert':
          if (can('alerts:read')) navigate('/alerts');
          break;
        case 'advisory':
          if (can('advisories:read')) navigate('/disaster');
          break;
        default:
          break;
      }
    },
    [can, navigate],
  );

  const clear = () => {
    setInput('');
    setQuery('');
    setResults([]);
    setSearched(false);
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
  };

  return (
    <div className="stack-page space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Search className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Search the campus database for hazards, incidents, rooms and buildings. Results respect
          your role&apos;s permissions.
        </p>
      </div>

      <div className="relative rounded-xl border border-border bg-card p-3">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search room number, hazard reference, incident or building…"
          aria-label="Search the campus"
          autoFocus
          className="h-11 pl-9 pr-9 text-base"
        />
        {input && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-6 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground">
          <span>Minimum two characters.</span>
          <span aria-hidden="true">·</span>
          <span>Try a reference like HZ-0001, a room code, or a building name.</span>
          {loading && (
            <span className="inline-flex items-center gap-1 text-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
            </span>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-danger" />
          <p className="text-sm font-medium text-danger">Search failed</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              const next = query;
              setQuery('');
              window.setTimeout(() => setQuery(next), 0);
            }}
          >
            Try again
          </Button>
        </div>
      ) : loading && results.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !searched && query.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Start typing to search</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Everything you can access is indexed: hazards, incidents, rooms and buildings.
          </p>
        </div>
      ) : query.length > 0 && query.length < 2 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-medium">Keep typing</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter at least two characters to search.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No results for “{query}”</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check the spelling, try a shorter term, or search by reference code.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={clear}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            {results.length} result{results.length === 1 ? '' : 's'} for “{query}”
          </p>
          {grouped.map((group) => {
            const meta = KIND_META[group.kind];
            const Icon = meta.icon;
            return (
              <section key={group.kind} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
                  <span className={cn('grid h-6 w-6 place-items-center rounded-md', meta.className)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {meta.label}s
                  </h2>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {group.items.length}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {group.items.map((result) => (
                    <li key={`${result.kind}-${result.id}`}>
                      <button
                        type="button"
                        onClick={() => openResult(result)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{result.title}</span>
                            {result.severity && <SeverityBadge severity={result.severity} />}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                            {result.ref && <span className="font-mono">{result.ref}</span>}
                            {result.kind === 'room' && result.buildingName && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{result.buildingName}</span>
                                {typeof result.floorLevel === 'number' && (
                                  <span>· L{result.floorLevel}</span>
                                )}
                              </>
                            )}
                            {result.kind === 'building' && result.code && (
                              <span className="font-mono">Code {result.code}</span>
                            )}
                            {result.kind === 'hazard' && result.status && (
                              <span className="capitalize">· {result.status.replace(/_/g, ' ')}</span>
                            )}
                            {result.kind === 'incident' && result.status && (
                              <span className="capitalize">· {result.status}</span>
                            )}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate('/map')}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <MapPinned className="h-3.5 w-3.5" /> Campus map
        </button>
        <span aria-hidden="true">·</span>
        {can('buildings:read') && (
          <>
            <button
              type="button"
              onClick={() => navigate('/buildings')}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Building2 className="h-3.5 w-3.5" /> Building directory
            </button>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>
          Results are read from the SQLite campus database, filtered by your permissions.
        </span>
      </div>
    </div>
  );
}
