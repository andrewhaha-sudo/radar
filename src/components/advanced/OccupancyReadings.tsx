import { Prerequisite } from '@/components/workspace/Prerequisite';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Row } from './tools';
export function OccupancyReadings() {
  const { school } = useAuth();
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setData(await api.get('/api/advanced/occupancy'));
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, []);
  const rows = [
    ...(data?.points ?? []).map((row: Row) => ({ ...row, target: 'assembly' })),
    ...(data?.rooms ?? []).map((row: Row) => ({
      ...row,
      target: 'room at building pin',
    })),
  ];
  if (!data && !error)
    return (
      <p role="status" className="studio-caption">
        Checking recent counts…
      </p>
    );
  if (data && !error && !rows.length)
    return (
      <Prerequisite
        title="Counts need a source."
        description="No aggregate readings have reached this school. Staff can record assembly headcounts or connect a count device. A map of empty markers would not be a population estimate."
        to="/operations?tab=assembly"
        action="Open assembly areas"
      />
    );
  return (
    <section className="ops-card">
      <h2>Recorded occupancy and capacity</h2>
      <p>
        {data?.note} Refreshes every 30 seconds while open. No readings means no population
        estimate.
      </p>
      <div className="advanced-layer-map">
        <MapContainer
          center={[school?.lat ?? 14.15, school?.lng ?? 122.75]}
          zoom={school?.lat ? 16 : 10}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          {rows
            .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
            .map((row) => (
              <CircleMarker
                key={`${row.target}-${row.id}`}
                center={[row.lat, row.lng]}
                radius={Math.min(32, 8 + Math.sqrt(row.count))}
                pathOptions={{
                  color:
                    Date.now() - Date.parse(row.observedAt) > 120000
                      ? '#8293a8'
                      : row.capacity > 0 && row.count >= row.capacity
                        ? '#ff4960'
                        : '#00beee',
                  fillOpacity: 0.4,
                }}
              >
                <Popup>
                  {row.name} · {row.count} recorded / {row.capacity} registered capacity
                  <br />
                  {row.target}
                  <br />
                  {row.source}
                  <br />
                  {row.observedAt}
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>
      {rows.map((row) => (
        <div className="ops-row" key={`${row.target}-${row.id}`}>
          <strong>
            {row.name} · {row.count} / {row.capacity}
          </strong>
          <span>
            {Date.now() - Date.parse(row.observedAt) > 120000 ? 'Stale reading' : 'Recent sample'} ·{' '}
            {row.source} · {row.observedAt}
          </span>
        </div>
      ))}
      {!rows.length && <p>No aggregate occupancy samples recorded.</p>}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
