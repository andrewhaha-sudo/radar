import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
export function IntegrationStatus() {
  const { can } = useAuth();
  const [feeds, setFeeds] = useState<
      Array<{ id: string; label: string; agency: string; configured: boolean }>
    >([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    api
      .get<{
        connectors: Array<{ id: string; label: string; agency: string; configured: boolean }>;
      }>('/api/feeds/status')
      .then((d) => setFeeds(d.connectors))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  return (
    <section className="ops-card">
      <h3>Official disaster connectors</h3>
      <p>
        Manual official advisories remain available. An installed adapter or configured key does not
        establish a working live feed. Publication dates, source links, and stale states remain
        visible.
      </p>
      {feeds.map((f) => (
        <p key={f.id}>
          {f.label} · {f.agency} ·{' '}
          {f.configured ? 'Configured, needs successful live check' : 'Not configured'}
        </p>
      ))}
      {can('advisories:write') && (
        <button
          className="command-action blue"
          onClick={async () => {
            setError('');
            try {
              const result = await api.post<{ added: number }>('/api/feeds/earthquakes/sync', {});
              setNotice(
                `USGS synchronization succeeded: ${result.added} records added. No school intensity or predicted impact was invented.`,
              );
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          Fetch official USGS earthquake reports
        </button>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p>
        PAGASA storm tracks, PHIVOLCS fault/volcano datasets, rainfall, and landslide feeds require
        separately verified source adapters. They are not simulated.
      </p>
    </section>
  );
}
