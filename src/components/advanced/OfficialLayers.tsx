import { useEffect, useState, type FormEvent } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import type { Row } from './tools';
export function OfficialLayers() {
  const { school, can } = useAuth();
  const [layers, setLayers] = useState<Row[]>([]),
    [selected, setSelected] = useState<number[]>([]),
    [format, setFormat] = useState('geojson'),
    [content, setContent] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const result = await api.get<{ layers: Row[] }>('/api/advanced/layers');
      setLayers(result.layers);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: Row = Object.fromEntries(new FormData(e.currentTarget));
      body.verified = body.verified === 'on';
      for (const key of ['publishedAt', 'expiresAt'])
        if (body[key]) body[key] = new Date(body[key]).toISOString();
      const fetchSource =
        (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'fetch';
      if (!fetchSource) {
        if (format === 'cap') body.capXml = content;
        else body.geojson = JSON.parse(content);
      }
      await api.post(fetchSource ? '/api/advanced/layers/fetch' : '/api/advanced/layers', body);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="ops-card">
        <h2>Official regional hazard layers</h2>
        <p>
          Import source-linked WGS84 GeoJSON or supported CAP alert polygons from PAGASA, PHIVOLCS,
          MGB, GeoRisk or USGS. Timestamps and review state stay visible. Fault traces and alert
          areas do not predict school impact.
        </p>
        <div className="advanced-layer-map">
          <MapContainer
            center={[school?.lat ?? 14.15, school?.lng ?? 122.75]}
            zoom={10}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />
            {layers
              .filter((row) => selected.includes(row.id))
              .map((row) => (
                <GeoJSON
                  key={row.id}
                  data={row.geojson as GeoJsonObject}
                  style={{
                    color: row.verified ? '#ffb347' : '#8196b0',
                    weight: 3,
                    fillOpacity: 0.12,
                  }}
                  onEachFeature={(feature, layer) => {
                    const text = document.createElement('span');
                    text.textContent = `${feature.properties?.name ?? row.title} · ${row.agency} · ${row.freshness}`;
                    layer.bindPopup(text);
                  }}
                />
              ))}
          </MapContainer>
        </div>
        {layers.map((row) => (
          <div className="ops-row" key={row.id}>
            <label className="setup-confirm">
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, row.id]
                      : selected.filter((id) => id !== row.id),
                  )
                }
              />
              <span>
                <strong>{row.title}</strong>
                <small>
                  {row.kind} · {row.agency} · published {row.publishedAt} · {row.freshness}
                </small>
                <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                  Official source
                </a>
              </span>
            </label>
            {can('advisories:write') && (
              <button
                className="school-back"
                onClick={async () => {
                  if (!confirm('Remove this imported layer from this school?')) return;
                  await api.del(`/api/advanced/layers/${row.id}`);
                  await load();
                }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {!layers.length && (
          <p>No verified regional datasets imported. Nothing is displayed as a live agency feed.</p>
        )}
      </section>
      {can('advisories:write') && (
        <section className="ops-card">
          <h3>Import or fetch an official dataset</h3>
          <form onSubmit={submit}>
            <fieldset className="ops-form-grid" disabled={busy}>
              <label>
                Hazard layer
                <select name="kind">
                  {['typhoon', 'fault', 'volcano', 'flood', 'rainfall', 'landslide'].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Dataset title
                <input name="title" required />
              </label>
              <label>
                Issuing agency
                <input name="agency" required placeholder="Actual issuing agency" />
              </label>
              <label>
                Official HTTPS dataset URL
                <input
                  type="url"
                  name="sourceUrl"
                  required
                  placeholder="https://…pagasa.dost.gov.ph/…"
                />
              </label>
              <label>
                Source publication date
                <input name="publishedAt" type="datetime-local" required />
              </label>
              <label>
                Expires (if stated)
                <input name="expiresAt" type="datetime-local" />
              </label>
              <label>
                Import format
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="geojson">GeoJSON</option>
                  <option value="cap">CAP XML polygons</option>
                </select>
              </label>
              <label>
                Import file
                <input
                  type="file"
                  accept=".json,.geojson,.xml"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 1800000) {
                        setError('Use a file under 1.8 MB.');
                        return;
                      }
                      setContent(await file.text());
                    }
                  }}
                />
              </label>
              <label className="wide">
                Source contents
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste the actual GeoJSON or CAP XML; leave blank when fetching the URL."
                />
              </label>
              <label className="wide setup-confirm">
                <input name="verified" type="checkbox" />I checked the source, licence, issue time
                and geographic relevance.
              </label>
              <button className="command-action blue" value="import">
                Import reviewed data
              </button>
              <button className="command-action blue" value="fetch">
                Fetch actual dataset URL
              </button>
            </fieldset>
          </form>
          <p>
            Unsupported formats, redirects, credential URLs and unavailable sources fail explicitly.
            Website HTML is not an API dataset.
          </p>
        </section>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </>
  );
}
