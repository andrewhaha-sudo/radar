import { useEffect, useState, type FormEvent } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, useMapEvents } from 'react-leaflet';
import { api, errorMessage } from '@/lib/api';
type Zone = {
  id: number;
  name: string;
  kind: string;
  source: string;
  verified: number;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
};
function Draw({ onPoint }: { onPoint: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onPoint([e.latlng.lat, e.latlng.lng]) });
  return null;
}
export function ZoneEditor() {
  const [points, setPoints] = useState<Array<[number, number]>>([]),
    [zones, setZones] = useState<Zone[]>([]),
    [selected, setSelected] = useState(''),
    [center, setCenter] = useState<[number, number]>([14.15, 122.75]),
    [name, setName] = useState(''),
    [kind, setKind] = useState('restricted'),
    [source, setSource] = useState(''),
    [verified, setVerified] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    setZones((await api.get<{ zones: Zone[] }>('/api/map/zones')).zones);
  }
  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err)));
    api
      .get<{ school: { lat: number | null; lng: number | null } }>('/api/map')
      .then((d) => {
        if (d.school.lat != null && d.school.lng != null) setCenter([d.school.lat, d.school.lng]);
      })
      .catch(() => {});
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (points.length < 3) {
      setError('Mark at least three polygon corners.');
      return;
    }
    const ring = [...points.map(([lat, lng]) => [lng, lat]), [points[0][1], points[0][0]]];
    try {
      const body = {
        name,
        kind,
        source,
        verified,
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
      if (selected) await api.patch(`/api/map/zones/${selected}`, body);
      else await api.post('/api/map/zones', body);
      setNotice('Zone saved with version history.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <section className="ops-card">
      <h3>Draw and edit restricted / geological hazard zones</h3>
      <p>
        Click the map to mark polygon corners. Draw only from a genuine inspection or authoritative
        source. Only verified active restriction, fire, flood, landslide and blocked zones affect
        route calculations.
      </p>
      <label>
        Existing zone
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const z = zones.find((z) => String(z.id) === e.target.value);
            if (z) {
              setName(z.name);
              setKind(z.kind);
              setSource(z.source);
              setVerified(Boolean(z.verified));
              setPoints(z.geometry.coordinates[0].slice(0, -1).map((p) => [p[1], p[0]]));
            } else {
              setPoints([]);
              setName('');
              setSource('');
              setVerified(false);
            }
          }}
        >
          <option value="">Create new zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} · {z.verified ? 'verified' : 'unverified'}
            </option>
          ))}
        </select>
      </label>
      <div style={{ height: 320 }}>
        <MapContainer
          key={center.join(',')}
          center={center}
          zoom={center[0] === 14.15 ? 10 : 17}
          scrollWheelZoom
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          <Draw onPoint={(p) => setPoints((previous) => [...previous, p])} />
          {points.length >= 3 ? (
            <Polygon positions={points} pathOptions={{ color: verified ? '#ff493b' : '#ffad20' }} />
          ) : (
            <Polyline positions={points} />
          )}
        </MapContainer>
      </div>
      <button className="school-back" onClick={() => setPoints((p) => p.slice(0, -1))}>
        Undo last point
      </button>
      <button className="school-back" onClick={() => setPoints([])}>
        Clear polygon
      </button>
      <p>{points.length} registered corners. A missing basemap does not verify a location.</p>
      <form onSubmit={submit}>
        <fieldset className="ops-form-grid">
          <label>
            Zone name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {['restricted', 'blocked', 'fire', 'flood', 'landslide', 'fault', 'volcano'].map(
                (k) => (
                  <option key={k}>{k}</option>
                ),
              )}
            </select>
          </label>
          <label className="wide">
            Official source / inspecting staff
            <input value={source} onChange={(e) => setSource(e.target.value)} required />
          </label>
          <label>
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            Source and geometry verified by authorized staff
          </label>
          <button className="command-action blue">Save mapped zone</button>
        </fieldset>
      </form>
      {selected && (
        <button
          className="school-back"
          onClick={async () => {
            if (
              !window.confirm('Remove this zone from the current map while retaining its history?')
            )
              return;
            try {
              await api.del(`/api/map/zones/${selected}`);
              setSelected('');
              setPoints([]);
              await load();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          Remove selected zone
        </button>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
