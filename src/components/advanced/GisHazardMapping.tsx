import { CampusMapGenerator } from './CampusMapGenerator';
import { Link } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import { Layers, Download, ScanSearch, MapPinned } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import type { Row } from './tools';

type Dataset = {
  models: Row[];
  official: Row[];
  buildings: Row[];
  labels: string[];
  basis: string;
  generatedAt: string;
};
export function GisHazardMapping() {
  const [mode, setMode] = useState('generate');
  return (
    <div className="gis-tool">
      <div className="gis-mode-tabs" role="group" aria-label="GIS workflow">
        <button
          className="desk-button"
          aria-pressed={mode === 'generate'}
          onClick={() => setMode('generate')}
        >
          Generate from photo / video
        </button>
        <button
          className="desk-button"
          aria-pressed={mode === 'layers'}
          onClick={() => setMode('layers')}
        >
          GIS layers & model results
        </button>
      </div>
      {mode === 'generate' ? <CampusMapGenerator /> : <GisLayersWorkbench />}
    </div>
  );
}
function GisLayersWorkbench() {
  const { school, can } = useAuth();
  const [data, setData] = useState<Dataset | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [threshold, setThreshold] = useState(0.5),
    [result, setResult] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [importing, setImporting] = useState(false),
    [content, setContent] = useState(''),
    [notes, setNotes] = useState<Record<number, string>>({});
  async function load() {
    const response = await api.get<Dataset>('/api/advanced/gis');
    setData(response);
    setSelected([
      ...response.official
        .filter((l) => l.verified && (!l.expiresAt || Date.parse(l.expiresAt) > Date.now()))
        .map((l) => `official:${l.id}`),
      ...response.models.filter((l) => l.reviewState === 'reviewed').map((l) => `model:${l.id}`),
    ]);
    setResult(null);
  }
  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err)));
  }, []);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  function exportGeojson() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result.geojson, null, 2)], { type: 'application/geo+json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'radar-building-layer-overlaps.geojson';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importModel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    await run(async () => {
      const body: Row = Object.fromEntries(new FormData(form));
      body.georeferenced = body.georeferenced === 'on';
      body.geojson = JSON.parse(content);
      body.observedAt = new Date(body.observedAt).toISOString();
      await api.post('/api/advanced/gis/models', body);
      setImporting(false);
      setContent('');
      await load();
    });
  }
  if (!data)
    return (
      <section className="ops-card">
        <p role={error ? 'alert' : 'status'}>{error || 'Loading school GIS layers…'}</p>
        {error && (
          <button className="desk-button" onClick={() => void run(load)}>
            Try again
          </button>
        )}
      </section>
    );
  const layers: Row[] = [
    ...data.official.map((l) => ({ ...l, key: `official:${l.id}`, source: 'official' })),
    ...data.models.map((l) => ({ ...l, key: `model:${l.id}`, source: 'cnn' })),
  ];
  const mapped = data.buildings.filter(
    (b) => typeof b.lat === 'number' && typeof b.lng === 'number',
  );
  return (
    <div className="gis-workbench">
      <section className="ops-card gis-intro">
        <div>
          <p className="desk-eyebrow">GEOGRAPHY + EVIDENCE</p>
          <h2>Where do mapped concerns meet your campus?</h2>
          <p>
            Compare registered building pins with hazard-area polygons. CNN layers are imported
            model suggestions; they remain separate from official datasets and school findings.
          </p>
        </div>
        <Layers size={36} aria-hidden="true" />
      </section>
      {error && (
        <p role="alert" className="desk-error">
          {error}
        </p>
      )}
      <section className="ops-card">
        <div className="gis-map">
          <MapContainer
            center={[
              school?.lat ?? mapped[0]?.lat ?? 14.15,
              school?.lng ?? mapped[0]?.lng ?? 122.75,
            ]}
            zoom={mapped.length || school?.lat != null ? 17 : 10}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />
            {layers
              .filter((l) => selected.includes(l.key))
              .map((l) => (
                <GeoJSON
                  key={`${l.key}:${threshold}`}
                  data={
                    (l.source === 'cnn'
                      ? {
                          ...l.geojson,
                          features: l.geojson.features.filter(
                            (f: Row) => f.properties.confidence >= threshold,
                          ),
                        }
                      : l.geojson) as GeoJsonObject
                  }
                  style={{
                    color: l.source === 'cnn' ? '#c28bff' : '#ffaf44',
                    weight: 2,
                    fillOpacity: 0.12,
                    dashArray: l.source === 'cnn' ? '5 5' : undefined,
                  }}
                  onEachFeature={(f, layer) => {
                    const text = document.createElement('span');
                    text.textContent = `${l.title} · ${l.source === 'cnn' ? `CNN ${l.modelName} ${l.modelVersion} · ${l.reviewState} · ${f.properties?.label} · confidence ${f.properties?.confidence}` : `${l.agency} · ${l.verified ? 'source reviewed' : 'unverified import'}`} · ${l.observedAt || l.publishedAt}`;
                    layer.bindPopup(text);
                  }}
                />
              ))}
            {mapped.map((b) => (
              <CircleMarker
                key={b.id}
                center={[b.lat, b.lng]}
                radius={8}
                pathOptions={{
                  color: '#fff',
                  fillColor: result?.assessment.find((r: Row) => r.id === b.id)?.evidence.length
                    ? '#ffaf44'
                    : '#27b9be',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Popup>
                  <strong>{b.name}</strong>
                  <p>
                    {result
                      ? `${result.assessment.find((r: Row) => r.id === b.id)?.evidence.length ?? 0} polygon contacts in this assessment`
                      : 'Registered building pin; run a layer check.'}
                  </p>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <p className="ops-footnote">
          Orange areas: imported source datasets. Dashed purple: CNN suggestions. Building pins are
          not building footprints. Basemap tiles require internet; dataset geometry does not depend
          on tile availability.
        </p>
        {!mapped.length && (
          <p>
            No building coordinates yet. Set your school location and register building pins before
            checking exposure.
          </p>
        )}
        <div className="gis-layers">
          {!layers.length && (
            <div className="desk-empty">
              <MapPinned size={28} />
              <p>
                No area datasets yet. Import an actual official dataset through Official datasets,
                or add georeferenced CNN output below.
              </p>
              <Link className="desk-link" to="/operations?tab=advanced&tool=layers">
                Open official datasets →
              </Link>
            </div>
          )}
          {layers.map((l) => (
            <label key={l.key}>
              <input
                type="checkbox"
                checked={selected.includes(l.key)}
                onChange={(e) => {
                  setSelected(
                    e.target.checked ? [...selected, l.key] : selected.filter((id) => id !== l.key),
                  );
                  setResult(null);
                }}
              />
              <span>
                <strong>{l.title}</strong>
                <small>
                  {l.source === 'cnn'
                    ? `${l.modelName} ${l.modelVersion} · ${l.reviewState} · imagery ${l.observedAt.slice(0, 10)}`
                    : `${l.agency} · ${!l.verified ? 'unverified; preview only' : l.expiresAt && Date.parse(l.expiresAt) <= Date.parse(data.generatedAt) ? 'expired; preview only' : 'source reviewed'} · published ${l.publishedAt.slice(0, 10)}`}
                </small>
              </span>
            </label>
          ))}
        </div>
        <div className="gis-actions">
          <label>
            Minimum CNN confidence{' '}
            <select
              aria-label="Minimum CNN confidence"
              value={threshold}
              onChange={(e) => {
                setThreshold(Number(e.target.value));
                setResult(null);
              }}
            >
              {[0.3, 0.5, 0.7, 0.9].map((v) => (
                <option key={v} value={v}>
                  {v * 100}% model output score
                </option>
              ))}
            </select>
          </label>
          <button
            className="desk-button primary"
            disabled={busy || !selected.length || !mapped.length}
            onClick={() =>
              void run(async () =>
                setResult(
                  await api.post('/api/advanced/gis/assess', { threshold, selectedIds: selected }),
                ),
              )
            }
          >
            <ScanSearch size={16} />
            {busy ? 'Working…' : 'Check selected areas'}
          </button>
          {result && (
            <button className="desk-button" onClick={exportGeojson}>
              <Download size={16} />
              Export GeoJSON
            </button>
          )}
        </div>
        <p className="ops-footnote">
          Checks use only selected, reviewed, unexpired official areas and reviewed CNN suggestions
          above the threshold. Pending/rejected models and fault lines can be previewed but do not
          enter the pin-in-polygon check. Confidence scores are not calibrated probabilities of
          danger.
        </p>
      </section>
      {result && (
        <section className="ops-card" aria-live="polite">
          <h2>Building contacts with mapped areas</h2>
          <p>{result.basis}</p>
          {result.assessment.map((b: Row) => (
            <div className="gis-building-result" key={b.id}>
              <strong>{b.name}</strong>
              <span>
                {!b.mapped
                  ? 'Add building coordinates'
                  : b.evidence.length
                    ? `${b.evidence.length} mapped contact${b.evidence.length === 1 ? '' : 's'} — inspect on site`
                    : 'No contact in these datasets; safety is not established'}
              </span>
              {b.evidence.map((hit: Row, i: number) => (
                <small key={i}>
                  {hit.title} ·{' '}
                  {hit.sourceType === 'cnn_suggestion'
                    ? `CNN suggestion: ${hit.kind}, ${Math.round(hit.confidence * 100)}% output score`
                    : hit.kind}
                </small>
              ))}
            </div>
          ))}
          <p className="ops-footnote">
            Checked {new Date(result.generatedAt).toLocaleString()}. Exports contain school building
            locations; share only with authorized people.
          </p>
        </section>
      )}
      <section className="ops-card">
        <h2>CNN imagery results</h2>
        <p>
          Use a trained segmentation model such as U-Net or DeepLab outside RADAR, then import its
          georeferenced polygons. No trained model or live inference service is bundled. A handheld
          photo or ordinary campus video is not a georeferenced map.
        </p>
        {can('advisories:write') && (
          <button className="desk-button" onClick={() => setImporting((v) => !v)}>
            {importing ? 'Close import' : 'Import CNN GeoJSON'}
          </button>
        )}
        {importing && (
          <form onSubmit={importModel} className="gis-import-form">
            <label>
              Layer title
              <input name="title" required maxLength={180} />
            </label>
            <label>
              Model name
              <input name="modelName" placeholder="Your trained U-Net" required maxLength={120} />
            </label>
            <label>
              Model version / checkpoint
              <input name="modelVersion" required maxLength={120} />
            </label>
            <label>
              Imagery acquisition date
              <input type="datetime-local" name="observedAt" required />
            </label>
            <label>
              Imagery source, resolution and model validation limitations
              <textarea name="sourceNote" required maxLength={1000} />
            </label>
            <input type="hidden" name="crs" value="EPSG:4326" />
            <label>
              GeoJSON file
              <input
                type="file"
                accept=".json,.geojson,application/json,application/geo+json"
                onChange={(e) =>
                  void run(async () => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1500000)
                      throw new Error('Use a GeoJSON file smaller than 1.5 MB.');
                    setContent(await file.text());
                  })
                }
              />
            </label>
            <label>
              GeoJSON content
              <textarea
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
              />
            </label>
            <p className="ops-footnote">
              Each Polygon/MultiPolygon needs properties.label ({data.labels.join(', ')}) and
              numeric properties.confidence from 0 to 1. Coordinates are [longitude, latitude], not
              pixels. Import cannot mark predictions as reviewed.
            </p>
            <label className="setup-confirm">
              <input type="checkbox" name="georeferenced" required />I checked the image
              georeferencing and the EPSG:4326 polygon alignment.
            </label>
            <button className="desk-button primary" disabled={busy}>
              Save for review
            </button>
          </form>
        )}
        {data.models.map((l) => (
          <div className="gis-model-review" key={l.id}>
            <strong>
              {l.title} · {l.reviewState}
            </strong>
            <p>{l.sourceNote}</p>
            {l.reviewNote && <p>Review: {l.reviewNote}</p>}
            {can('advisories:write') && (
              <>
                <label>
                  Review checks and remaining uncertainty
                  <textarea
                    value={notes[l.id] || ''}
                    onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })}
                    maxLength={1000}
                  />
                </label>
                <div className="gis-actions">
                  {['reviewed', 'rejected'].map((state) => (
                    <button
                      key={state}
                      className="desk-button"
                      disabled={busy || !notes[l.id]?.trim()}
                      onClick={() =>
                        void run(async () => {
                          await api.post(`/api/advanced/gis/models/${l.id}/review`, {
                            state,
                            note: notes[l.id],
                          });
                          await load();
                        })
                      }
                    >
                      {state === 'reviewed' ? 'Mark reviewed suggestion' : 'Reject layer'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
