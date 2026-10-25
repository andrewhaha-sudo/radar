import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import { api, errorMessage } from '@/lib/api';
type Row = Record<string, any>;
export function MapTimeline() {
  const [versions, setVersions] = useState<Row[]>([]),
    [current, setCurrent] = useState<Row | null>(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState('');
  async function load() {
    const [history, map, zones] = await Promise.all([
      api.get<{ versions: Row[] }>('/api/map/versions'),
      api.get<Row>('/api/map'),
      api.get<{ zones: Row[] }>('/api/map/zones'),
    ]);
    setVersions(history.versions.filter((v) => v.entityType === 'school_map'));
    setCurrent({ ...map, zones: zones.zones, capturedAt: new Date().toISOString() });
  }
  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err)));
  }, []);
  const revision = versions.find((v) => String(v.id) === selected) ?? versions[0];
  const old = revision ? JSON.parse(revision.snapshot) : null;
  return (
    <section className="ops-card">
      <h3>Historical and current campus maps</h3>
      <p>
        Save an actual map revision before changing a plan. Comparisons show stored records and
        their capture times; they do not reconstruct undocumented past conditions.
      </p>
      <button
        className="command-action blue"
        onClick={async () => {
          try {
            await api.post('/api/map/snapshots', {});
            await load();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        Save current campus map revision
      </button>
      <label>
        Historical revision
        <select value={revision?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose revision…</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.createdAt} · revision {v.id}
            </option>
          ))}
        </select>
      </label>
      <div className="ops-grid">
        {[
          { label: 'Historical record', data: old },
          { label: 'Current fetched records', data: current },
        ].map((view) => (
          <div key={view.label}>
            <h3>{view.label}</h3>
            {view.data ? (
              <>
                <p>
                  {view.data.capturedAt} · {view.data.buildings.length} buildings ·{' '}
                  {view.data.hazards.length} recorded findings
                </p>
                <div style={{ height: 300 }}>
                  <MapContainer
                    key={`${view.label}-${revision?.id}`}
                    center={
                      view.data.buildings[0]
                        ? [view.data.buildings[0].lat, view.data.buildings[0].lng]
                        : [14.15, 122.75]
                    }
                    zoom={view.data.buildings.length ? 17 : 10}
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="© OpenStreetMap contributors"
                    />
                    {view.data.buildings.map((b: Row) => (
                      <CircleMarker key={b.id} center={[b.lat, b.lng]} radius={10}>
                        <Popup>
                          {b.name}
                          <br />
                          Registered building position; indoor findings remain tied to room records.
                        </Popup>
                      </CircleMarker>
                    ))}
                    {(view.data.zones ?? []).map((z: Row) => (
                      <GeoJSON
                        key={z.id}
                        data={
                          (typeof z.geometry === 'string'
                            ? JSON.parse(z.geometry)
                            : z.geometry) as GeoJsonObject
                        }
                        style={{ color: z.verified ? '#ff493b' : '#ffad20' }}
                      />
                    ))}
                  </MapContainer>
                </div>
              </>
            ) : (
              <p>No historical campus snapshot has been saved.</p>
            )}
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
