import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
type Resource = {
  id: number;
  label: string;
  type: string;
  quantity: number;
  status: string;
  buildingName: string;
  distanceMeters: number;
};
export function NearestResources() {
  const [rows, setRows] = useState<Resource[] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  function locate() {
    if (!navigator.geolocation) {
      setError('This device does not support location.');
      return;
    }
    setBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await api.get<{ resources: Resource[] }>(
            `/api/resources/nearest?lat=${position.coords.latitude}&lng=${position.coords.longitude}`,
          );
          setRows(result.resources);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      },
      () => {
        setError('Location was denied or unavailable. Use the registered building and room list.');
        setBusy(false);
      },
      { timeout: 15000 },
    );
  }
  return (
    <section className="ops-card">
      <h3>Nearest registered emergency resources</h3>
      <p>
        Use your current position once to estimate distance to registered building locations. It is
        not stored as location-sharing history. Availability and safe access must be confirmed on
        site.
      </p>
      <button className="command-action blue" onClick={locate} disabled={busy}>
        {busy ? 'Finding position…' : 'Use my position once'}
      </button>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {rows?.map((row) => (
        <div className="ops-row" key={row.id}>
          <strong>
            {row.label} · {row.type}
          </strong>
          <p>
            {row.buildingName} · approximately {row.distanceMeters} m · {row.quantity} registered
            units · {row.status}
          </p>
        </div>
      ))}
      {rows?.length === 0 && <p>No resources have a registered building position.</p>}
    </section>
  );
}
