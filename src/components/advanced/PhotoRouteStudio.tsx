import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Download,
  Footprints,
  ImagePlus,
  MousePointer2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { captureCampusImage } from '@/lib/campus-images';
import { useAuth } from '@/context/AuthContext';
import { downloadText, type Row } from './tools';
type Point = [number, number];
type Path = { name: string; description: string; points: Point[] };
const colors = ['#58e0ce', '#ffc56d', '#b5a6ff'];
export function PhotoRouteStudio() {
  const { can, user } = useAuth();
  const [params] = useSearchParams();
  const surveyId = params.get('surveyId');
  const requestedFrame = params.get('frame') || '0';
  const writer = can('scan:write') || can('evacuation:write');
  const video = useRef<HTMLVideoElement>(null),
    sourceUrl = useRef('');
  const [image, setImage] = useState(''),
    [clip, setClip] = useState(''),
    [source, setSource] = useState('photo'),
    [title, setTitle] = useState('Campus path sketch'),
    [id, setId] = useState<number | null>(null),
    [authorId, setAuthorId] = useState<number | null>(null),
    [paths, setPaths] = useState<Path[]>([]),
    [active, setActive] = useState(0),
    [drawing, setDrawing] = useState(false),
    [cursor, setCursor] = useState<Point>([0.5, 0.5]),
    [stage, setStage] = useState(0),
    [checks, setChecks] = useState<Record<string, boolean>>({}),
    [notes, setNotes] = useState(''),
    [uncertainties, setUncertainties] = useState<string[]>([]),
    [provider, setProvider] = useState<Row | null>(null),
    [consent, setConsent] = useState(false),
    [saved, setSaved] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    try {
      setSaved((await api.get<Row>('/api/advanced/image-paths')).drafts);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
    api
      .get<Row>('/api/advanced/video-provider')
      .then(setProvider)
      .catch(() => {});
    return () => {
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
    };
  }, []);
  useEffect(() => {
    if (!surveyId) return;
    let live = true;
    api
      .get<Row>(`/api/advanced/video-surveys/${encodeURIComponent(surveyId)}`)
      .then((survey) => {
        if (!live) return;
        const index = Number(requestedFrame);
        const first =
          survey.payload.frames[
            Number.isInteger(index) && index >= 0 && index < survey.payload.frames.length
              ? index
              : 0
          ];
        if (first) {
          fresh();
          setClip('');
          setImage(first.image);
          setTitle(`${survey.title} · path sketch`);
          setSource(first.kind === 'photo' ? 'photo' : 'video-frame');
          setStage(1);
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [surveyId, requestedFrame]);
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
  function fresh() {
    setId(null);
    setAuthorId(null);
    setPaths([]);
    setActive(0);
    setDrawing(false);
    setChecks({});
    setNotes('');
    setUncertainties([]);
    setConsent(false);
  }
  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await action(async () => {
      if (
        !file.type.startsWith('video/') &&
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      )
        throw new Error('Choose a JPEG, PNG, WebP or a video supported by your browser.');
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = URL.createObjectURL(file);
      fresh();
      setImage('');
      if (file.type.startsWith('video/')) {
        setClip(sourceUrl.current);
        setSource('video-frame');
        setStage(0);
      } else {
        setClip('');
        const photo = new Image();
        await new Promise<void>((resolve, reject) => {
          photo.onload = () => resolve();
          photo.onerror = () => reject(new Error('This image could not be opened.'));
          photo.src = sourceUrl.current;
        });
        setImage(captureCampusImage(photo, photo.naturalWidth, photo.naturalHeight));
        setSource('photo');
        setTitle('Campus path sketch');
        setStage(1);
      }
    });
  }
  function start() {
    setPaths((previous) => [
      ...previous,
      { name: `Path ${previous.length + 1}`, description: 'Manual image sketch', points: [] },
    ]);
    setActive(paths.length);
    setDrawing(true);
  }
  function point(p: Point) {
    if (!drawing || !writer || busy) return;
    setPaths((previous) =>
      previous.map((path, i) =>
        i === active && path.points.length < 30 ? { ...path, points: [...path.points, p] } : path,
      ),
    );
  }
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (!drawing) return;
    const delta = 0.02;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      setCursor(([x, y]) => [
        Math.max(
          0,
          Math.min(1, x + (e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0)),
        ),
        Math.max(
          0,
          Math.min(1, y + (e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0)),
        ),
      ]);
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      point(cursor);
    }
  }
  async function open(row: Row) {
    await action(async () => {
      const draft = await api.get<Row>(`/api/advanced/image-paths/${row.id}`);
      setId(draft.id);
      setAuthorId(draft.created_by);
      setTitle(draft.title);
      setImage(draft.image);
      setSource(draft.source);
      setPaths(draft.paths);
      setChecks(draft.checks);
      setNotes(draft.notes);
      setUncertainties(draft.uncertainties);
      setClip('');
      setActive(0);
      setDrawing(false);
      setStage(1);
    });
  }
  const valid =
    paths.length > 0 && paths.every((path) => path.name.trim() && path.points.length >= 2);
  return (
    <div className="route-studio">
      <div className="studio-intro">
        <span className="studio-unverified">IMAGE SKETCH · NOT AN APPROVED ROUTE</span>
        <h2>
          See a path.
          <br />
          Check it on the ground.
        </h2>
        <p>
          Turn a familiar view into a useful field-walk sketch. No GPS coordinates or safety
          guarantees are inferred from a picture.
        </p>
      </div>
      <nav className="studio-steps" aria-label="Route sketch steps">
        {['Choose a view', 'Trace & compare', 'Field checklist'].map((name, i) => (
          <button
            key={name}
            disabled={busy || (i > 0 && !image)}
            aria-current={stage === i ? 'step' : undefined}
            onClick={() => setStage(i)}
          >
            <span>{stage > i ? <Check size={14} /> : i + 1}</span>
            {name}
            <ArrowRight size={14} />
          </button>
        ))}
      </nav>
      {error && (
        <p className="desk-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="studio-notice" role="status">
          {notice}
        </p>
      )}
      {stage === 0 && (
        <div className="studio-source">
          {!writer && (
            <p className="studio-caption">
              Your role can view saved sketches. A school inspector or route planner can add a new
              one.
            </p>
          )}
          <label className="studio-upload">
            <ImagePlus size={36} strokeWidth={1.2} />
            <strong>A photo, or one good video frame.</strong>
            <span>
              Use school-approved imagery without private student details. Choose a view where the
              walkway is visible. JPEG, PNG, WebP or supported video.
            </span>
            <input
              aria-label="Choose route photo or video"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/*"
              disabled={busy || !writer}
              onChange={(e) => void choose(e)}
            />
          </label>
          {clip && (
            <div>
              <video ref={video} src={clip} controls playsInline />
              <button
                className="desk-button primary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const v = video.current;
                    if (!v) throw new Error('Load a video first.');
                    setImage(captureCampusImage(v, v.videoWidth, v.videoHeight));
                    setTitle(`Video path sketch · ${v.currentTime.toFixed(1)}s`);
                    setStage(1);
                  })
                }
              >
                <Camera size={17} /> Use this frame
              </button>
            </div>
          )}
          {image && (
            <button className="desk-link" onClick={() => setStage(1)}>
              Continue with your current view <ArrowRight size={15} />
            </button>
          )}
        </div>
      )}
      {stage === 1 && image && (
        <>
          <div className="studio-workbench">
            <div>
              <div className="studio-canvas-viewport">
                <div
                  className={`studio-canvas ${drawing ? 'is-drawing' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Route image. While drawing, click points or use arrow keys and Enter."
                  onKeyDown={keys}
                  onClick={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    point([(e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height]);
                  }}
                >
                  <img
                    src={image}
                    alt="Campus view for unverified path sketches"
                    draggable={false}
                  />
                  <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
                    {paths.map((path, i) => (
                      <g key={i} opacity={i === active ? 1 : 0.6}>
                        <polyline
                          points={path.points.map((p) => `${p[0] * 1000},${p[1] * 1000}`).join(' ')}
                          fill="none"
                          stroke="#071923"
                          strokeWidth={i === active ? 10 : 8}
                          vectorEffect="non-scaling-stroke"
                        />
                        <polyline
                          points={path.points.map((p) => `${p[0] * 1000},${p[1] * 1000}`).join(' ')}
                          fill="none"
                          stroke={colors[i % 3]}
                          strokeWidth={i === active ? 5 : 3}
                          vectorEffect="non-scaling-stroke"
                          strokeDasharray="9 6"
                        />
                        {path.points.map((p, n) => (
                          <circle
                            key={n}
                            cx={p[0] * 1000}
                            cy={p[1] * 1000}
                            r={n === 0 || n === path.points.length - 1 ? 8 : 4}
                            fill={colors[i % 3]}
                            stroke="#fff"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                    ))}
                    {drawing && (
                      <g stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
                        <path
                          d={`M ${cursor[0] * 1000 - 10},${cursor[1] * 1000} h20 M ${cursor[0] * 1000},${cursor[1] * 1000 - 10} v20`}
                        />
                      </g>
                    )}
                  </svg>
                </div>
              </div>
              <p className="studio-caption">
                {drawing
                  ? 'Tap points along the visible walkway. Mark at least two points, then finish.'
                  : 'Choose a sketch to compare it, or start a new one.'}{' '}
                These are image points, not mapped directions.
              </p>
              <div className="studio-drawing-actions">
                <button
                  className="desk-button primary"
                  disabled={
                    !writer ||
                    busy ||
                    paths.length >= 3 ||
                    paths.some((path) => path.points.length < 2)
                  }
                  onClick={start}
                >
                  <Plus size={16} /> New path
                </button>
                {paths.length > 0 && (
                  <>
                    <button
                      className="desk-button"
                      disabled={!writer || busy}
                      onClick={() => setDrawing((v) => !v)}
                    >
                      <MousePointer2 size={15} />
                      {drawing ? 'Finish drawing' : 'Add points'}
                    </button>
                    <button
                      className="desk-button"
                      disabled={!writer || !paths[active]?.points.length || busy}
                      onClick={() =>
                        setPaths((previous) =>
                          previous.map((path, i) =>
                            i === active ? { ...path, points: path.points.slice(0, -1) } : path,
                          ),
                        )
                      }
                    >
                      <Undo2 size={15} /> Undo
                    </button>
                  </>
                )}
              </div>
            </div>
            <aside className="studio-path-list">
              <span className="desk-eyebrow">COMPARE YOUR OPTIONS</span>
              {!paths.length ? (
                <div className="studio-path-empty">
                  <Footprints size={30} />
                  <h3>Start with what you can see.</h3>
                  <p>
                    Trace a continuous walkway. Leave hidden turns and uncertain connections for the
                    field walk.
                  </p>
                </div>
              ) : (
                paths.map((path, i) => (
                  <button
                    aria-pressed={i === active}
                    className={i === active ? 'selected' : ''}
                    key={i}
                    onClick={() => {
                      setActive(i);
                      setDrawing(false);
                    }}
                  >
                    <span style={{ color: colors[i % 3] }}>0{i + 1}</span>
                    <div>
                      <strong>{path.name}</strong>
                      <small>{path.points.length} image points · unverified</small>
                    </div>
                  </button>
                ))
              )}
              {paths[active] && (
                <div className="studio-path-edit">
                  <label>
                    Sketch name
                    <input
                      value={paths[active].name}
                      maxLength={100}
                      disabled={!writer}
                      onChange={(e) =>
                        setPaths((previous) =>
                          previous.map((path, i) =>
                            i === active ? { ...path, name: e.target.value } : path,
                          ),
                        )
                      }
                    />
                  </label>
                  <p>{paths[active].description}</p>
                  <button
                    disabled={!writer || busy}
                    onClick={() => {
                      setPaths((previous) => previous.filter((_, i) => i !== active));
                      setActive(0);
                      setDrawing(false);
                    }}
                  >
                    <Trash2 size={13} /> Remove this sketch
                  </button>
                </div>
              )}
              <details className="studio-ai">
                <summary>
                  <Sparkles size={15} /> Optional image assistance
                </summary>
                <p>
                  Ask your selected provider to suggest visible walking-path segments. Suggestions
                  stay unverified. This tool works fully with manual sketches.
                </p>
                {provider?.configured && !provider.training ? (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />{' '}
                      I have permission to send this image to{' '}
                      {provider.provider === 'gemini' ? 'Google Gemini' : 'OpenAI'}.
                    </label>
                    <button
                      className="desk-button"
                      disabled={!writer || !consent || busy}
                      onClick={() =>
                        void action(async () => {
                          const result = await api.post<Row>('/api/advanced/image-paths/suggest', {
                            image,
                            consent,
                          });
                          setPaths(result.paths);
                          setUncertainties(result.uncertainties);
                          setActive(0);
                          setDrawing(false);
                          setNotice(
                            result.paths.length
                              ? 'Possible segments added. Review each one and check it on site.'
                              : 'No continuous walkway was identified in this view. You can make a manual sketch.',
                          );
                        })
                      }
                    >
                      Suggest visible segments
                    </button>
                    <p>Suggestions replace the current draft paths in this view.</p>
                  </>
                ) : (
                  <p>AI is unavailable in this session. Manual sketching is ready to use.</p>
                )}
              </details>
            </aside>
          </div>
          <div className="studio-step-footer">
            <button className="desk-link" onClick={() => setStage(0)}>
              <ArrowLeft size={15} /> Change view
            </button>
            <button
              className="desk-button"
              onClick={() => {
                setDrawing(false);
                setStage(2);
              }}
            >
              Prepare a field walk <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}
      {stage === 2 && image && (
        <div className="studio-review">
          <div>
            <span className="desk-eyebrow">BEFORE A ROUTE BECOMES REAL</span>
            <h2>A sketch is a starting point.</h2>
            <p>
              Walk the actual path with authorized school staff. Record what you observe here. This
              checklist does not certify safety or publish an evacuation route.
            </p>
            {uncertainties.length > 0 && (
              <div className="studio-uncertainties">
                <h3>Things the image could not confirm</h3>
                <ul>
                  {uncertainties.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
            {[
              {
                key: 'surface',
                name: 'Surface & changes in level',
                text: 'Check steps, slopes, drainage and trip hazards.',
              },
              {
                key: 'access',
                name: 'Doors & gates',
                text: 'Confirm they can actually be opened when needed.',
              },
              {
                key: 'obstructions',
                name: 'Clear passage',
                text: 'Check the full path for obstacles and changing conditions.',
              },
              {
                key: 'destination',
                name: 'Where it leads',
                text: 'Confirm the connection to a school-approved gathering point.',
              },
            ].map((check) => (
              <label className="studio-check" key={check.key}>
                <input
                  type="checkbox"
                  checked={checks[check.key] || false}
                  disabled={!writer}
                  onChange={(e) =>
                    setChecks((previous) => ({ ...previous, [check.key]: e.target.checked }))
                  }
                />
                <span>
                  <strong>{check.name}</strong>
                  <small>{check.text}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="studio-save">
            <label>
              Sketch title
              <input
                value={title}
                disabled={!writer}
                maxLength={150}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Field notes
              <textarea
                rows={5}
                disabled={!writer}
                placeholder="What did staff actually observe? Who checked it, and when? Leave checks unticked until the field walk."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <button
              className="desk-button primary"
              disabled={!writer || !valid || !title.trim() || busy}
              onClick={() =>
                void action(async () => {
                  const result = await api.post<Row>('/api/advanced/image-paths', {
                    id: id && (authorId === user?.id || can('admin:users')) ? id : null,
                    title,
                    image,
                    source,
                    paths,
                    checks,
                    notes,
                    uncertainties,
                  });
                  setId(result.id);
                  setAuthorId(user?.id ?? null);
                  setNotice(result.note);
                  await load();
                })
              }
            >
              <Save size={16} />{' '}
              {id
                ? authorId === user?.id || can('admin:users')
                  ? 'Update school sketch'
                  : 'Save your own copy'
                : 'Save school sketch'}
            </button>
            <button
              className="desk-button"
              disabled={!valid}
              onClick={() =>
                downloadText(
                  `radar-path-sketch-${id || 'draft'}.json`,
                  JSON.stringify(
                    {
                      kind: 'radar-unverified-image-paths',
                      title,
                      image,
                      source,
                      paths,
                      checks,
                      notes,
                      uncertainties,
                      coordinateSystem: 'normalized-image-points',
                      approved: false,
                    },
                    null,
                    2,
                  ),
                  'application/json',
                )
              }
            >
              <Download size={16} /> Export field copy
            </button>
            {!valid && <p>Draw at least one path with two points before saving.</p>}
            <Link className="desk-link" to="/operations?tab=assembly">
              Open verified route planning <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
      <section className="studio-saved">
        <header>
          <h3>School sketchbook</h3>
          <span>{saved.length} saved views</span>
        </header>
        {saved.length ? (
          saved.map((row) => (
            <div key={row.id}>
              <button disabled={busy} onClick={() => void open(row)}>
                <span>{row.source === 'video-frame' ? 'Video frame' : 'Photo'}</span>
                <strong>{row.title}</strong>
                <small>Unverified image sketch</small>
                <ArrowRight size={16} />
              </button>
              {writer && (can('admin:users') || row.created_by === user?.id) && (
                <button
                  aria-label={`Delete ${row.title}`}
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      if (!confirm('Delete this saved image sketch?')) return;
                      await api.del(`/api/advanced/image-paths/${row.id}`);
                      if (id === row.id) setId(null);
                      await load();
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))
        ) : (
          <p>Your first saved sketch will appear here. Start with one clear photo.</p>
        )}
      </section>
      {busy && (
        <p role="status" className="studio-notice">
          Working on your sketch… Your image stays available if the request fails.
        </p>
      )}
    </div>
  );
}
