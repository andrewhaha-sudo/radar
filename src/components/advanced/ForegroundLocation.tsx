import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, ApiError } from '@/lib/api';
import type { Row } from './tools';
export function ForegroundLocation({ incidents }: { incidents: Row[] }) {
  const [incident, setIncident] = useState(''),
    [minutes, setMinutes] = useState(15),
    [ends, setEnds] = useState(''),
    [error, setError] = useState(''),
    [last, setLast] = useState('');
  const watch = useRef<number | null>(null),
    deadline = useRef(0),
    lastSent = useRef(0),
    sending = useRef(false);
  function clear() {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    deadline.current = 0;
  }
  async function stop() {
    clear();
    setEnds('');
    try {
      await api.del('/api/advanced/location');
    } catch (err) {
      setError(
        'Tracking stopped on this device. The server sample will expire automatically if deletion could not reach the server. ' +
          errorMessage(err),
      );
    }
  }
  useEffect(() => {
    const visibility = () => {
      if (document.hidden && watch.current != null) void stop();
    };
    document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(() => {
      if (deadline.current && Date.now() >= deadline.current) void stop();
    }, 1000);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      if (watch.current != null) {
        clear();
        void api.del('/api/advanced/location').catch(() => {});
      }
    };
  }, []);
  async function start() {
    if (!navigator.geolocation) {
      setError('Geolocation is unavailable.');
      return;
    }
    if (
      !confirm(
        'Share your current position with authorized school responders while this page stays visible, for the selected period? Only the latest sample is retained.',
      )
    )
      return;
    setError('');
    try {
      const session = await api.post<{ endsAt: string }>('/api/advanced/location/start', {
        consent: true,
        incidentId: incident,
        minutes,
      });
      deadline.current = Date.parse(session.endsAt);
      setEnds(session.endsAt);
      watch.current = navigator.geolocation.watchPosition(
        async (p) => {
          if (Date.now() >= deadline.current) {
            void stop();
            return;
          }
          if (sending.current || Date.now() - lastSent.current < 15000) return;
          sending.current = true;
          try {
            await api.post('/api/advanced/location/sample', {
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              accuracy: p.coords.accuracy,
            });
            lastSent.current = Date.now();
            setLast(
              `Latest sample ${new Date().toLocaleTimeString()} · reported accuracy ${Math.round(p.coords.accuracy)} m`,
            );
          } catch (err) {
            if (err instanceof ApiError && [403, 404, 410].includes(err.status)) void stop();
            setError(errorMessage(err));
          } finally {
            sending.current = false;
          }
        },
        () => {
          setError('GPS permission was denied or a position could not be obtained.');
          void stop();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <section className="ops-card">
      <h2>Temporary foreground location updates</h2>
      <p>
        Explicit consent, an active incident and device permission are required. Sharing stops when
        this page is hidden, closed or the timer ends. Only the latest approximate sample is
        retained; no location trail is stored.
      </p>
      <div className="ops-form-grid">
        <label>
          Active incident
          <select value={incident} onChange={(e) => setIncident(e.target.value)} disabled={!!ends}>
            <option value="">Choose incident…</option>
            {incidents
              .filter((row) => !['cancelled', 'resolved'].includes(row.state))
              .map((row) => (
                <option key={row.incidentId} value={row.incidentId}>
                  {row.ref} · {row.kind}
                </option>
              ))}
          </select>
        </label>
        <label>
          Consent duration (5–60 minutes)
          <input
            type="number"
            min={5}
            max={60}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            disabled={!!ends}
          />
        </label>
        {!ends ? (
          <button className="command-action blue" onClick={() => void start()} disabled={!incident}>
            Allow bounded foreground sharing
          </button>
        ) : (
          <button className="command-action blue" onClick={() => void stop()}>
            Stop sharing and delete latest sample
          </button>
        )}
      </div>
      {ends && (
        <p role="status">
          Session ends {ends}. {last || 'Waiting for a GPS sample…'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
