import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
type Result = {
  id: number;
  kind: string;
  name: string;
  buildingId?: number;
  roomId?: number;
  lat?: number;
  lng?: number;
  detail?: string;
};
export function CampusSearch({ onSelect }: { onSelect: (result: Result) => void }) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<Result[]>([]),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get<{ results: Result[] }>(
          `/api/map/search?q=${encodeURIComponent(query)}`,
          controller.signal,
        )
        .then((d) => setResults(d.results))
        .catch(() => setResults([]));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return (
    <div className="campus-unified-search">
      <input
        aria-label="Search buildings, rooms, equipment and assembly points"
        placeholder="Buildings, room numbers, resources, assembly points…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && query.length >= 2 && (
        <div className="campus-search-results">
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => {
                onSelect(r);
                setOpen(false);
              }}
            >
              <strong>{r.name}</strong>
              <small>
                {r.kind} · {r.detail}
              </small>
            </button>
          ))}
          {!results.length && <p>No matching registered locations.</p>}
        </div>
      )}
    </div>
  );
}
