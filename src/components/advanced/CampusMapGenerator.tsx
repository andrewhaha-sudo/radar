import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import {
  Sparkles,
  ImagePlus,
  Save,
  Download,
  Pencil,
  Undo2,
  MapPinned,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { captureCampusImage } from '@/lib/campus-images';
import { downloadText, type Row } from './tools';
type Point = [number, number];
type Frame = { time: number; image: string; kind: 'photo' | 'video-frame' };
type Feature = {
  frameIndex: number;
  kind: string;
  geometryType: 'Polygon' | 'LineString';
  points: Point[];
  confidence: number;
  label: string;
  note: string;
};
const kinds = [
  'campus_area',
  'building',
  'walkway',
  'visible_debris',
  'standing_water',
  'visible_surface_damage',
  'blocked_walkway',
  'other_visible_feature',
];
const colors: Record<string, string> = {
  campus_area: '#58e0ce',
  building: '#64acff',
  walkway: '#ffe08b',
  visible_debris: '#ff977a',
  standing_water: '#56d8f3',
  visible_surface_damage: '#ff80a9',
  blocked_walkway: '#fb575e',
  other_visible_feature: '#c3a0ff',
};
const blankAnchors = () =>
  [0, 1, 2].map(() => ({ x: null as number | null, y: null as number | null, lat: '', lng: '' }));
function FitPlacedDraft({ data }: { data: GeoJsonObject }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      const bounds = L.geoJSON(data).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15), { animate: false, maxZoom: 19 });
    };
    fit();
    map.on('resize', fit);
    return () => {
      map.off('resize', fit);
    };
  }, [data, map]);
  return null;
}
export function CampusMapGenerator() {
  const { can } = useAuth(),
    writer = can('scan:write');
  const video = useRef<HTMLVideoElement>(null),
    url = useRef('');
  const [frames, setFrames] = useState<Frame[]>([]),
    [clip, setClip] = useState(''),
    [features, setFeatures] = useState<Feature[]>([]),
    [selected, setSelected] = useState(0),
    [title, setTitle] = useState('School image map draft'),
    [busy, setBusy] = useState(false),
    [generating, setGenerating] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [consent, setConsent] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [uncertainties, setUncertainties] = useState<string[]>([]),
    [id, setId] = useState<number | null>(null),
    [drafts, setDrafts] = useState<Row[]>([]),
    [provider, setProvider] = useState<Row | null>(null),
    [drawing, setDrawing] = useState(false),
    [kind, setKind] = useState('building'),
    [points, setPoints] = useState<Point[]>([]),
    [cursor, setCursor] = useState<Point>([0.5, 0.5]),
    [anchors, setAnchors] = useState(blankAnchors),
    [anchorIndex, setAnchorIndex] = useState<number | null>(null),
    [sourceNote, setSourceNote] = useState(''),
    [topDown, setTopDown] = useState(false),
    [geo, setGeo] = useState<Row | null>(null);
  const readable = can('scan:read');
  const load = useCallback(async () => {
    if (readable) setDrafts((await api.get<Row>('/api/advanced/campus-maps')).drafts);
  }, [readable]);
  useEffect(() => {
    if (!readable) return;
    void load().catch((e) => setError(errorMessage(e)));
    api
      .get<Row>('/api/advanced/campus-map-provider')
      .then(setProvider)
      .catch(() => {});
    return () => {
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, [load, readable]);
  useEffect(() => {
    if (!generating) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [generating]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setGenerating(false);
    }
  }
  function invalidate() {
    setId(null);
    setReviewed(false);
    setGeo(null);
  }
  function resetPlacement() {
    setAnchors(blankAnchors());
    setAnchorIndex(null);
    setTopDown(false);
    setSourceNote('');
    setGeo(null);
  }
  function frameAt(index: number) {
    setSelected(index);
    setDrawing(false);
    setPoints([]);
    resetPlacement();
  }
  function addPoint(p: Point) {
    if (busy) return;
    setCursor(p);
    if (drawing) setPoints((v) => [...v, p].slice(0, 40));
    else if (anchorIndex !== null) {
      setAnchors((v) => v.map((a, i) => (i === anchorIndex ? { ...a, x: p[0], y: p[1] } : a)));
      setGeo(null);
      setAnchorIndex(null);
    }
  }
  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (busy) return;
    const delta = e.shiftKey ? 0.05 : 0.01;
    let p: Point = [...cursor];
    if (e.key === 'ArrowLeft') p[0] -= delta;
    else if (e.key === 'ArrowRight') p[0] += delta;
    else if (e.key === 'ArrowUp') p[1] -= delta;
    else if (e.key === 'ArrowDown') p[1] += delta;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      addPoint(cursor);
      return;
    } else if (e.key === 'Escape') {
      setDrawing(false);
      setAnchorIndex(null);
      setPoints([]);
      return;
    } else return;
    e.preventDefault();
    p = p.map((v) => Math.max(0, Math.min(1, v))) as Point;
    setCursor(p);
  }
  async function sample() {
    const v = video.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0 || v.duration > 14400)
      throw new Error('Wait for a playable video of up to four hours to load.');
    v.pause();
    const next: Frame[] = [];
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          v.onseeked = null;
          reject(new Error('Video seeking timed out. Try a shorter clip.'));
        }, 10000);
        v.onseeked = () => {
          clearTimeout(timer);
          v.onseeked = null;
          resolve();
        };
        v.currentTime = ((v.duration - 0.05) * (i + 0.5)) / 3;
      });
      next.push({
        time: v.currentTime,
        image: captureCampusImage(v, v.videoWidth, v.videoHeight),
        kind: 'video-frame',
      });
    }
    setFrames(next);
    return next;
  }
  async function generate() {
    await run(async () => {
      setElapsed(0);
      setGenerating(true);
      const batch = frames.length ? frames : await sample();
      const output = await api.post<Row>('/api/advanced/campus-maps/generate', {
        frames: batch,
        consent,
      });
      setFeatures(output.features);
      setUncertainties(output.uncertainties);
      invalidate();
      setDrawing(false);
      setPoints([]);
      resetPlacement();
      setNotice(
        output.features.length
          ? 'Draft generated. Check the suggested outlines and labels below.'
          : 'No clear features were returned. Try a sharper overview or draw a feature manually.',
      );
    });
  }
  function finishShape() {
    const geometryType = kind === 'walkway' ? 'LineString' : 'Polygon';
    if (points.length < (geometryType === 'Polygon' ? 3 : 2)) {
      setError('Mark at least three polygon corners, or two walkway points.');
      return;
    }
    setFeatures((v) => [
      ...v,
      {
        frameIndex: selected,
        kind,
        geometryType,
        points,
        confidence: 1,
        label:
          kind === 'building'
            ? `Building candidate ${v.filter((f) => f.kind === 'building').length + 1}`
            : kind.replaceAll('_', ' '),
        note: 'Manually drawn draft; score 1 is not an AI confidence estimate.',
      },
    ]);
    setPoints([]);
    setDrawing(false);
    invalidate();
  }
  if (!can('scan:read'))
    return (
      <section className="ops-card">
        <h2>Generate a school image map</h2>
        <p>
          School inspection staff can prepare private image-derived drafts here. Use GIS layers &
          model results to view shared geographic datasets.
        </p>
      </section>
    );
  const frame = frames[selected];
  return (
    <div className="campus-map-generator" aria-busy={busy}>
      <fieldset className="generator-controls" disabled={busy}>
        <section className="ops-card generator-intro">
          <div>
            <p className="desk-eyebrow">YOUR SCHOOL, FROM YOUR CAMERA</p>
            <h2>Upload a view. Generate a campus draft.</h2>
            <p>
              Suggest the visible school area, building outlines, walkways and possible visible
              concerns. Draft labels are provisional; this does not register buildings, certify
              safety or establish the legal school boundary.
            </p>
          </div>
          <ImagePlus size={34} />
        </section>
        {error && (
          <p className="desk-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="ops-notice" role="status">
            {notice}
          </p>
        )}
        <section className="ops-card">
          <div className="generator-steps">
            <span>1 · Choose a photo or video</span>
            <span>2 · Generate & review</span>
            <span>3 · Optional location anchors</span>
          </div>
          <label className="generator-file">
            School photo or video
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/*"
              disabled={!writer || busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void run(async () => {
                  if (
                    !file.type.startsWith('video/') &&
                    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
                  )
                    throw new Error('Choose a JPEG, PNG, WebP or supported video.');
                  if (url.current) URL.revokeObjectURL(url.current);
                  url.current = URL.createObjectURL(file);
                  setFeatures([]);
                  setFrames([]);
                  setSelected(0);
                  setUncertainties([]);
                  setConsent(false);
                  setDrawing(false);
                  setPoints([]);
                  invalidate();
                  resetPlacement();
                  if (file.type.startsWith('video/')) setClip(url.current);
                  else {
                    setClip('');
                    const image = new Image();
                    await new Promise<void>((resolve, reject) => {
                      image.onload = () => resolve();
                      image.onerror = () => reject(new Error('Could not open this photo.'));
                      image.src = url.current;
                    });
                    setFrames([
                      {
                        time: 0,
                        image: captureCampusImage(image, image.naturalWidth, image.naturalHeight),
                        kind: 'photo',
                      },
                    ]);
                  }
                });
              }}
            />
          </label>
          <p className="ops-footnote">
            Aerial/top-down views work best for outlines. A walking video provides separate
            perspective views, not an orthomosaic. Full videos stay on your device; at most three
            sampled JPEG views are sent when you press Generate.
          </p>
          {clip && (
            <video
              ref={video}
              src={clip}
              controls
              playsInline
              preload="metadata"
              className="generator-video"
            />
          )}
          {provider && (
            <p className="ops-footnote">
              {provider.configured && !provider.training
                ? `AI suggestions use your configured ${provider.provider === 'gemini' ? 'Gemini' : 'OpenAI'} vision provider (${provider.model}).`
                : 'AI generation is not connected here. You can still prepare a draft manually; configure the existing vision provider to enable automatic suggestions.'}{' '}
              This generator uses vision suggestions, not a dedicated trained CNN segmentation
              model.
            </p>
          )}
          {writer && (
            <>
              <label className="setup-confirm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={busy}
                />
                I have permission to send the selected views to the configured AI provider and have
                checked them for private student information.
              </label>
              <div className="gis-actions">
                <button
                  className="desk-button primary"
                  disabled={
                    busy ||
                    (!frame && !clip) ||
                    !consent ||
                    !provider?.configured ||
                    provider?.training
                  }
                  onClick={() => void generate()}
                >
                  <Sparkles size={16} />
                  {generating ? `Generating draft · ${elapsed}s` : 'Generate GIS draft'}
                </button>
                {clip && (
                  <button
                    className="desk-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const next = await sample();
                        setFeatures([]);
                        setSelected(0);
                        invalidate();
                        resetPlacement();
                        setNotice(
                          `${next.length} views ready for manual drawing or AI generation.`,
                        );
                      })
                    }
                  >
                    Prepare video views
                  </button>
                )}
              </div>
            </>
          )}
        </section>
        {frame && (
          <section className="ops-card">
            <div className="generator-frame-tabs">
              {frames.map((f, i) => (
                <button
                  className="desk-button"
                  key={i}
                  aria-pressed={selected === i}
                  disabled={busy}
                  onClick={() => frameAt(i)}
                >
                  View {i + 1}
                  {f.kind === 'video-frame' ? ` · ${f.time.toFixed(1)}s` : ''}
                </button>
              ))}
            </div>
            <p className="ops-footnote">
              {geo
                ? 'Image draft with approximate GIS placement below.'
                : 'Image-space draft · no GPS yet.'}{' '}
              Blue: building; teal: visible campus area; yellow: walkway; coral/purple: possible
              concern. Repeated views may show the same building.
            </p>
            <div
              className={`generator-canvas ${drawing || anchorIndex !== null ? 'is-marking' : ''}`}
              tabIndex={0}
              role="group"
              aria-label="Campus image draft canvas"
              onKeyDown={keyDown}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                addPoint([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
              }}
            >
              <img src={frame.image} alt={`Uploaded school view ${selected + 1}`} />
              <svg
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-label="Draft geometry overlay"
              >
                {features.map(
                  (f, i) =>
                    f.frameIndex === selected && (
                      <g
                        key={i}
                        stroke={colors[f.kind]}
                        fill={f.geometryType === 'Polygon' ? `${colors[f.kind]}25` : 'none'}
                        strokeWidth={3}
                      >
                        {f.geometryType === 'Polygon' ? (
                          <polygon
                            points={f.points.map((p) => `${p[0] * 1000},${p[1] * 1000}`).join(' ')}
                          />
                        ) : (
                          <polyline
                            points={f.points.map((p) => `${p[0] * 1000},${p[1] * 1000}`).join(' ')}
                          />
                        )}
                        <text
                          x={Math.min(f.points[0][0] * 1000, 820)}
                          y={Math.max(f.points[0][1] * 1000, 30)}
                          fill={colors[f.kind]}
                          stroke="#04121f"
                          strokeWidth={4}
                          paintOrder="stroke"
                          fontSize={24}
                        >
                          {f.label}
                        </text>
                      </g>
                    ),
                )}
                {points.length > 0 && (
                  <polyline
                    points={points.map((p) => `${p[0] * 1000},${p[1] * 1000}`).join(' ')}
                    fill="none"
                    stroke="white"
                    strokeWidth={3}
                    strokeDasharray="6 5"
                  />
                )}
                {anchors.map(
                  (a, i) =>
                    a.x !== null &&
                    a.y !== null && (
                      <g key={i}>
                        <circle cx={a.x * 1000} cy={a.y * 1000} r={12} fill="#fff" />
                        <text
                          x={a.x * 1000 + 15}
                          y={a.y * 1000}
                          fill="white"
                          stroke="#04121f"
                          strokeWidth={4}
                          paintOrder="stroke"
                          fontSize={26}
                        >
                          {i + 1}
                        </text>
                      </g>
                    ),
                )}
                {(drawing || anchorIndex !== null) && (
                  <circle cx={cursor[0] * 1000} cy={cursor[1] * 1000} r={6} fill="white" />
                )}
              </svg>
            </div>
            {writer && (
              <>
                <div className="gis-actions">
                  <label>
                    Feature type
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                      disabled={drawing}
                    >
                      {kinds.map((k) => (
                        <option key={k} value={k}>
                          {k.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="desk-button"
                    disabled={busy || features.length >= 40}
                    onClick={() => {
                      setDrawing((v) => !v);
                      setPoints([]);
                      setAnchorIndex(null);
                    }}
                  >
                    <Pencil size={16} />
                    {drawing ? 'Cancel drawing' : 'Draw a feature'}
                  </button>
                  {drawing && (
                    <>
                      <button
                        className="desk-button"
                        onClick={() => setPoints((v) => v.slice(0, -1))}
                      >
                        <Undo2 size={16} />
                        Undo corner
                      </button>
                      <button className="desk-button primary" onClick={finishShape}>
                        Finish feature
                      </button>
                    </>
                  )}
                </div>
                {(drawing || anchorIndex !== null) && (
                  <p role="status">
                    {drawing
                      ? 'Click visible corners, then Finish feature.'
                      : `Click known location ${Number(anchorIndex) + 1} on the image.`}{' '}
                    Keyboard: arrows move the cursor, Enter places a point, Escape cancels.
                  </p>
                )}
              </>
            )}
            {features.map(
              (f, index) =>
                f.frameIndex === selected && (
                  <div className="generator-feature-row" key={index}>
                    <span className="generator-kind" style={{ color: colors[f.kind] }}>
                      {f.kind.replaceAll('_', ' ')}
                    </span>
                    <label>
                      Draft label
                      <input
                        value={f.label}
                        disabled={!writer || busy}
                        maxLength={100}
                        onChange={(e) => {
                          setFeatures((v) =>
                            v.map((p, i) => (i === index ? { ...p, label: e.target.value } : p)),
                          );
                          invalidate();
                        }}
                      />
                    </label>
                    <small>
                      {f.note.startsWith('Manually drawn')
                        ? 'Manual draft'
                        : `${Math.round(f.confidence * 100)}% model output score`}
                    </small>
                    {writer && (
                      <button
                        className="desk-button"
                        aria-label={`Remove ${f.label}`}
                        disabled={busy}
                        onClick={() => {
                          setFeatures((v) => v.filter((_, i) => i !== index));
                          invalidate();
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ),
            )}
            {uncertainties.length > 0 && (
              <div className="generator-uncertainties">
                <strong>Review before use</strong>
                <ul>
                  {uncertainties.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {writer && (
              <>
                <label>
                  Draft title
                  <input
                    value={title}
                    maxLength={180}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <label className="setup-confirm">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I reviewed the visible outlines and provisional labels. This remains an unverified
                  image draft.
                </label>
                <div className="gis-actions">
                  <button
                    className="desk-button primary"
                    disabled={busy || !reviewed || !features.length || id !== null}
                    onClick={() =>
                      void run(async () => {
                        const saved = await api.post<Row>('/api/advanced/campus-maps', {
                          title,
                          frames,
                          features,
                          uncertainties,
                          reviewed,
                        });
                        setId(saved.id);
                        await load();
                        setNotice(
                          'Draft saved to this school. No registered buildings, hazards or routes were changed.',
                        );
                      })
                    }
                  >
                    <Save size={16} />
                    {id ? 'Draft saved' : 'Save school draft'}
                  </button>
                  <button
                    className="desk-button"
                    disabled={!features.length}
                    onClick={() =>
                      downloadText(
                        'campus-image-draft.json',
                        JSON.stringify(
                          {
                            coordinateSpace: 'normalized_image',
                            title,
                            features,
                            uncertainties,
                            status: 'unverified_image_draft',
                          },
                          null,
                          2,
                        ),
                        'application/json',
                      )
                    }
                  >
                    Export image draft
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        {frame && writer && (
          <details className="ops-card generator-placement">
            <summary>
              <MapPinned size={18} />
              Place this view on a GIS map (optional)
            </summary>
            <p>
              Only use a top-down or orthorectified view. A normal walking-video frame cannot become
              an accurate GIS map with a simple transform. Mark three well-spaced image locations
              with known GPS coordinates; this produces approximate placement, not a survey.
            </p>
            <div className="generator-anchor-grid">
              {anchors.map((a, i) => (
                <div key={i}>
                  <button
                    className="desk-button"
                    disabled={busy}
                    aria-pressed={anchorIndex === i}
                    onClick={() => {
                      setAnchorIndex(i);
                      setDrawing(false);
                      setPoints([]);
                    }}
                  >
                    Mark anchor {i + 1}
                    {a.x !== null ? ' ✓' : ''}
                  </button>
                  <label>
                    Anchor {i + 1} latitude
                    <input
                      type="number"
                      step="any"
                      value={a.lat}
                      onChange={(e) => {
                        setAnchors((v) =>
                          v.map((p, j) => (j === i ? { ...p, lat: e.target.value } : p)),
                        );
                        setGeo(null);
                      }}
                    />
                  </label>
                  <label>
                    Anchor {i + 1} longitude
                    <input
                      type="number"
                      step="any"
                      value={a.lng}
                      onChange={(e) => {
                        setAnchors((v) =>
                          v.map((p, j) => (j === i ? { ...p, lng: e.target.value } : p)),
                        );
                        setGeo(null);
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
            <label>
              Source of known anchor coordinates
              <textarea
                value={sourceNote}
                maxLength={1000}
                onChange={(e) => {
                  setSourceNote(e.target.value);
                  setGeo(null);
                }}
                placeholder="Describe the surveyed points or source coordinates and alignment limitations."
              />
            </label>
            <label className="setup-confirm">
              <input
                type="checkbox"
                checked={topDown}
                onChange={(e) => {
                  setTopDown(e.target.checked);
                  setGeo(null);
                }}
              />
              This is a top-down/orthorectified view; I checked the known points and alignment.
            </label>
            <button
              className="desk-button primary"
              disabled={
                busy ||
                !id ||
                !topDown ||
                !sourceNote.trim() ||
                anchors.some((a) => a.x === null || a.y === null || !a.lat.trim() || !a.lng.trim())
              }
              onClick={() =>
                void run(async () => {
                  const placed = await api.post<Row>(
                    `/api/advanced/campus-maps/${id}/georeference`,
                    {
                      frameIndex: selected,
                      anchors: anchors.map((a) => ({
                        ...a,
                        lat: Number(a.lat),
                        lng: Number(a.lng),
                      })),
                      sourceNote,
                      topDownConfirmed: topDown,
                    },
                  );
                  setGeo(placed);
                  setNotice(
                    'Approximate GIS draft placed. Inspect alignment; it is not a surveyed school boundary.',
                  );
                })
              }
            >
              Place saved draft on GIS map
            </button>
            {!id && <p className="ops-footnote">Save the reviewed image draft first.</p>}
            {geo && (
              <>
                <p>{geo.basis}</p>
                <div className="generator-geo-map">
                  <MapContainer
                    key={JSON.stringify(anchors)}
                    center={[Number(anchors[0].lat), Number(anchors[0].lng)]}
                    zoom={18}
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="© OpenStreetMap contributors"
                    />
                    <FitPlacedDraft data={geo.geojson as GeoJsonObject} />
                    <GeoJSON
                      data={geo.geojson as GeoJsonObject}
                      style={{ color: '#58e0ce', fillOpacity: 0.15, weight: 2 }}
                    />
                  </MapContainer>
                </div>
                <button
                  className="desk-button"
                  onClick={() =>
                    downloadText(
                      'approximate-campus-draft.geojson',
                      JSON.stringify(geo.geojson, null, 2),
                      'application/geo+json',
                    )
                  }
                >
                  <Download size={16} />
                  Export approximate GeoJSON
                </button>
              </>
            )}
          </details>
        )}
        {drafts.length > 0 && (
          <section className="ops-card">
            <h2>Saved school image drafts</h2>
            {drafts.map((d) => (
              <button
                className="generator-saved-row"
                key={d.id}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const saved = await api.get<Row>(`/api/advanced/campus-maps/${d.id}`);
                    setTitle(saved.title);
                    setFrames(saved.payload.frames);
                    setFeatures(saved.payload.features);
                    setUncertainties(saved.payload.uncertainties);
                    setId(saved.id);
                    setReviewed(true);
                    setSelected(0);
                    setClip('');
                    setDrawing(false);
                    setPoints([]);
                    resetPlacement();
                    const placed = saved.payload.georeferences?.[0];
                    if (placed) {
                      setAnchors(
                        placed.anchors.map((a: Row) => ({
                          ...a,
                          lat: String(a.lat),
                          lng: String(a.lng),
                        })),
                      );
                      setGeo({
                        geojson: placed.geojson,
                        basis:
                          'Saved approximate three-anchor placement; review alignment before use.',
                      });
                      setSourceNote(placed.sourceNote);
                      setTopDown(true);
                    }
                  })
                }
              >
                <strong>{d.title}</strong>
                <small>Unverified draft · {new Date(d.updatedAt).toLocaleDateString()}</small>
              </button>
            ))}
          </section>
        )}
      </fieldset>
    </div>
  );
}
