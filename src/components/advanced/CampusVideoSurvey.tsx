import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Row } from './tools';
type Frame = { time: number; image: string };
type Candidate = {
  frameIndex: number;
  x: number;
  y: number;
  label: string;
  description: string;
  buildingId: number | null;
};
export function CampusVideoSurvey({ buildings, rooms }: { buildings: Row[]; rooms: Row[] }) {
  const { can } = useAuth();
  const video = useRef<HTMLVideoElement>(null),
    objectUrl = useRef('');
  const [source, setSource] = useState(''),
    [frames, setFrames] = useState<Frame[]>([]),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [selected, setSelected] = useState(0),
    [title, setTitle] = useState('Campus video survey'),
    [consent, setConsent] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [surveys, setSurveys] = useState<Row[]>([]),
    [route, setRoute] = useState<Row | null>(null),
    [accessible, setAccessible] = useState(false),
    [provider, setProvider] = useState<{
      configured: boolean;
      training: boolean;
      provider?: string;
    } | null>(null);
  async function load() {
    try {
      setSurveys((await api.get<Row>('/api/advanced/video-surveys')).surveys);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
    api
      .get<{ configured: boolean; training: boolean; provider?: string }>(
        '/api/advanced/video-provider',
      )
      .then(setProvider)
      .catch(() => {});
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) throw new Error('Load a playable video first.');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    let longest = Math.min(1920, Math.max(v.videoWidth, v.videoHeight)),
      image = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = longest / Math.max(v.videoWidth, v.videoHeight);
      canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      image = canvas.toDataURL('image/jpeg', 0.9);
      if (image.length <= 300000) break;
      longest = Math.floor(longest * 0.82);
    }
    if (image.length > 300000)
      throw new Error('Frame exceeds the image limit. Capture a less detailed view.');
    return { time: v.currentTime, image };
  }
  async function sample() {
    const v = video.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0 || v.duration > 14400)
      throw new Error('Use a playable video of up to four hours.');
    const next: Frame[] = [];
    v.pause();
    for (let i = 0; i < 6; i++) {
      const time = ((v.duration - 0.05) * (i + 0.5)) / 6;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          v.onseeked = null;
          reject(new Error('Video seeking timed out.'));
        }, 10000);
        v.onseeked = () => {
          clearTimeout(timer);
          v.onseeked = null;
          resolve();
        };
        v.currentTime = time;
      });
      next.push(capture());
    }
    setFrames(next);
    setCandidates([]);
    setSelected(0);
    setReviewed(false);
  }
  return (
    <section className="ops-card campus-video-survey">
      <h2>Campus video survey</h2>
      <p>
        Choose a walking or drone video. The full video stays on this device. Up to six selected
        JPEG frames can be sent to AI with your permission and saved to this school. Review for
        faces, student details and other private information before sharing.
      </p>
      {provider && (
        <p>
          Selected vision provider:{' '}
          <strong>{provider.provider === 'gemini' ? 'Google Gemini' : 'OpenAI'}</strong>.{' '}
          {provider.provider === 'gemini' &&
            'Free-tier eligibility, quotas and data-use terms are set by Google. Avoid sharing student faces or private records.'}
        </p>
      )}
      {provider && (!provider.configured || provider.training) && (
        <div role="status" className="ops-card">
          <h3>
            {provider.training
              ? 'Training mode: AI calls are disabled'
              : 'AI building detection needs configuration'}
          </h3>
          <p>
            For local Node.js, run <code>npm run setup:integrations</code> in your project terminal,
            select openai or gemini at “Vision provider”, enter its corresponding API key, then
            restart <code>npm run dev</code>. On Vercel, set <code>RADAR_VISION_PROVIDER</code> and
            the matching server API key, then redeploy. Your Supabase key cannot enable vision. Keep
            the private key out of chat.
          </p>
          <p>
            You can number buildings now: capture a frame, click each building in the image, then
            choose “Number marked buildings”.
          </p>
        </div>
      )}
      <p>
        New captures preserve JPEG quality at up to 1920 pixels on the longest edge. Re-capture
        older saved frames to improve clarity. Zoom cannot recover detail missing from the original
        video; pause at a steady, well-lit view before capturing.
      </p>
      <label>
        Campus video
        <input
          disabled={busy}
          type="file"
          accept="video/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
            objectUrl.current = URL.createObjectURL(f);
            setSource(objectUrl.current);
            setFrames([]);
            setCandidates([]);
            setReviewed(false);
            setRoute(null);
          }}
        />
      </label>
      {source && (
        <>
          <video
            ref={video}
            src={source}
            controls
            playsInline
            preload="metadata"
            style={{ width: '100%', maxHeight: 420 }}
          />
          <div className="ops-actions">
            <button disabled={busy} onClick={() => void action(sample)}>
              Sample six overview frames
            </button>
            <button
              disabled={busy || frames.length >= 6}
              onClick={() =>
                void action(async () => {
                  setFrames([...frames, capture()]);
                  setReviewed(false);
                })
              }
            >
              Capture current view ({frames.length}/6)
            </button>
          </div>
        </>
      )}
      <p>
        Use overhead footage for an aerial-style view. A normal video does not supply a
        georeferenced drone map, hidden rooms, reliable building identities or proof that a path is
        safe.
      </p>
      <label>
        <input
          type="checkbox"
          checked={accessible}
          onChange={(e) => {
            setAccessible(e.target.checked);
            setRoute(null);
          }}
        />{' '}
        Require registered accessible evacuation paths
      </label>
      {frames.length > 0 && (
        <>
          <div className="advanced-tabs">
            {frames.map((f, i) => (
              <button
                key={i}
                className={selected === i ? 'active' : ''}
                onClick={() => setSelected(i)}
              >
                View {i + 1} · {f.time.toFixed(1)}s
              </button>
            ))}
          </div>
          <div
            className="campus-video-frame"
            onClick={(e) => {
              if (!can('admin:users') || candidates.length >= 30) return;
              const r = e.currentTarget.getBoundingClientRect();
              setCandidates([
                ...candidates,
                {
                  frameIndex: selected,
                  x: (e.clientX - r.left) / r.width,
                  y: (e.clientY - r.top) / r.height,
                  label: `Building ${candidates.length + 1} (draft)`,
                  description: 'Manual video label',
                  buildingId: null,
                },
              ]);
              setReviewed(false);
            }}
          >
            <img src={frames[selected]?.image} alt={`Campus video keyframe ${selected + 1}`} />
            {candidates.map((c, i) =>
              c.frameIndex === selected ? (
                <span key={i} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
                  {i + 1}
                </span>
              ) : null,
            )}
          </div>
          <p>
            Click a building in the image to add a draft numbered label. Repeated views may show the
            same building; match those labels to one registered building.
          </p>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{' '}
            I have permission to send these selected frames to the configured AI provider.
          </label>
          <button
            disabled={
              busy || !consent || !can('scan:write') || !provider?.configured || provider?.training
            }
            onClick={() =>
              void action(async () => {
                const r = await api.post<Row>('/api/advanced/video-surveys/analyze', {
                  frames,
                  consent,
                });
                setCandidates(r.candidates);
                setReviewed(false);
                setNotice('AI suggestions are drafts. Review identities and duplicate views.');
              })
            }
          >
            Suggest building labels with AI
          </button>
          <button
            disabled={busy || !candidates.length || !can('admin:users')}
            onClick={() => {
              const numbers = new Map<string, number>();
              setCandidates(
                candidates.map((c, i) => {
                  const key = c.buildingId ? `building-${c.buildingId}` : `label-${i}`;
                  if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
                  return { ...c, label: `Building ${numbers.get(key)}` };
                }),
              );
              setReviewed(false);
              setNotice(
                'Marked buildings numbered. Matching building links reuse the same number. Review and save.',
              );
            }}
          >
            Number marked buildings
          </button>
          {candidates.map((c, i) => (
            <div key={i} className="ops-card">
              <strong>
                Label {i + 1} · view {c.frameIndex + 1}
              </strong>
              <input
                aria-label={`Building label ${i + 1}`}
                value={c.label}
                onChange={(e) => {
                  setCandidates(
                    candidates.map((v, n) => (n === i ? { ...v, label: e.target.value } : v)),
                  );
                  setReviewed(false);
                }}
              />
              <p>{c.description}</p>
              <label>
                Match to registered building
                <select
                  value={c.buildingId ?? ''}
                  onChange={(e) => {
                    setCandidates(
                      candidates.map((v, n) =>
                        n === i ? { ...v, buildingId: Number(e.target.value) || null } : v,
                      ),
                    );
                    setReviewed(false);
                    setRoute(null);
                  }}
                >
                  <option value="">Unlinked draft</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  setCandidates(candidates.filter((_, n) => n !== i));
                  setReviewed(false);
                }}
              >
                Remove duplicate or incorrect label
              </button>
              {c.buildingId && (
                <>
                  <Link
                    to={`/buildings?q=${encodeURIComponent(buildings.find((b) => b.id === c.buildingId)?.name ?? '')}`}
                  >
                    Open building and floors
                  </Link>
                  <p>Register actual floors and rooms there, then inspect each room:</p>
                  {rooms
                    .filter((r) => r.buildingId === c.buildingId)
                    .map((r) => (
                      <Link style={{ display: 'block' }} key={r.id} to={`/scan?roomId=${r.id}`}>
                        {r.code} · {r.name} — room scan
                      </Link>
                    ))}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        setRoute(
                          await api.get(
                            `/api/evacuation/plan?buildingId=${c.buildingId}&accessible=${accessible}`,
                          ),
                        );
                      })
                    }
                  >
                    Find a candidate route on verified walkways
                  </button>
                </>
              )}
            </div>
          ))}
          {route && (
            <div role="status">
              <p>
                {route.available
                  ? `${route.distanceMeters} m · about ${route.estimatedMinutes} minutes. ${route.note}`
                  : route.reason}
              </p>
              {route.available && route.path?.length > 1 && (
                <MapContainer
                  key={JSON.stringify(route.path)}
                  bounds={route.path as LatLngTuple[]}
                  style={{ height: 300, width: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  <Polyline
                    positions={route.path as LatLngTuple[]}
                    pathOptions={{ color: '#00c8a5', weight: 5 }}
                  />
                </MapContainer>
              )}
              <Link to="/evacuation">Review the evacuation map and current conditions</Link>
            </div>
          )}
          <label>
            Survey title
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />{' '}
            I reviewed the frames, building labels and links. These labels do not verify coordinates
            or safety.
          </label>
          <button
            disabled={busy || !reviewed || !can('admin:users')}
            onClick={() =>
              void action(async () => {
                await api.post('/api/advanced/video-surveys', {
                  title,
                  frames,
                  candidates,
                  reviewed,
                });
                setNotice('Reviewed video survey saved.');
                await load();
              })
            }
          >
            Save reviewed survey
          </button>
        </>
      )}
      <h3>Saved school surveys</h3>
      {surveys.map((s) => (
        <div key={s.id}>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const r = await api.get<Row>(`/api/advanced/video-surveys/${s.id}`);
                setFrames(r.payload.frames);
                setCandidates(r.payload.candidates);
                setTitle(r.title);
                setSelected(0);
                setReviewed(true);
                setRoute(null);
              })
            }
          >
            {s.title}
          </button>
          {can('admin:users') && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const result = await api.post<Row>(
                    `/api/advanced/video-surveys/${s.id}/dashboard`,
                    {},
                  );
                  setNotice(result.note);
                })
              }
            >
              Show on dashboard
            </button>
          )}
          {can('admin:users') && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (!window.confirm('Delete this saved survey and its keyframes?')) return;
                  await api.del(`/api/advanced/video-surveys/${s.id}`);
                  await load();
                })
              }
            >
              Delete
            </button>
          )}
        </div>
      ))}
      {busy && <p role="status">Processing…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
