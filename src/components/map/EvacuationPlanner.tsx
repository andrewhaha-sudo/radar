import { useEffect, useState, type FormEvent } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, CircleMarker } from 'react-leaflet';
import { api, errorMessage } from '@/lib/api';
type Row = Record<string, any>;
export function EvacuationPlanner() {
  const [buildings, setBuildings] = useState<Row[]>([]),
    [points, setPoints] = useState<Row[]>([]),
    [plan, setPlan] = useState<Row | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api
      .get<Row>('/api/map')
      .then((d) => {
        setBuildings(d.buildings);
        setPoints(d.assemblyPoints);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setError('');
    try {
      setPlan(
        await api.get<Row>(
          `/api/evacuation/plan?buildingId=${d.get('buildingId')}&pointId=${d.get('pointId') ?? ''}&accessible=${d.get('accessible') === 'on'}`,
        ),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <section className="ops-card">
      <h3>Verified walkway route planner</h3>
      <p>
        Uses the school’s registered connected walkways, closures, verified restricted zones,
        accessibility flags, and recent assembly-point counts.
      </p>
      <form onSubmit={submit} className="ops-form-grid">
        <label>
          Start building
          <select name="buildingId" required>
            <option value="">Choose…</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destination
          <select name="pointId">
            <option value="">Nearest available mapped point</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input name="accessible" type="checkbox" /> Require verified wheelchair accessibility
        </label>
        <button className="command-action blue">Calculate mapped route</button>
      </form>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {plan &&
        (plan.available ? (
          <>
            <p>
              {plan.distanceMeters} m · approximately {plan.estimatedMinutes} minutes ·{' '}
              {plan.assemblyPoint.name}
            </p>
            <div style={{ height: 300 }}>
              <MapContainer center={plan.path[0]} zoom={17} scrollWheelZoom={false}>
                <TileLayer
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="© OpenStreetMap contributors"
                />
                <Polyline positions={plan.path} pathOptions={{ color: '#00d5b0', weight: 5 }} />
                <CircleMarker center={plan.path[plan.path.length - 1]}>
                  <Popup>{plan.assemblyPoint.name}</Popup>
                </CircleMarker>
              </MapContainer>
            </div>
            <p>{plan.note}</p>
          </>
        ) : (
          <p>{plan.reason}</p>
        ))}
    </section>
  );
}
