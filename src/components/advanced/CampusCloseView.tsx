import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Camera, Expand, Minus, Plus, X, Footprints } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Row } from './tools';
function ImageCanvas({
  survey,
  frame,
  zoom,
  large = false,
}: {
  survey: Row;
  frame: number;
  zoom: number;
  large?: boolean;
}) {
  const { can } = useAuth();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 280 }),
    [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const resize = new ResizeObserver(() => {
      if (node.clientWidth && node.clientHeight)
        setSize({ w: node.clientWidth, h: node.clientHeight });
    });
    resize.observe(node);
    return () => resize.disconnect();
  }, []);
  const width = Math.min(size.w, size.h * aspect) * zoom;
  return (
    <div
      ref={box}
      className={`campus-close-scroll ${large ? 'is-large' : ''}`}
      tabIndex={0}
      aria-label="Campus image; scroll to pan"
    >
      <div
        className="campus-close-image"
        style={{ width, minWidth: 0, marginInline: zoom === 1 ? 'auto' : 0 }}
      >
        <img
          src={survey.payload.frames[frame].image}
          onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          alt={`Reviewed campus view ${frame + 1}`}
        />
        {survey.payload.candidates
          .filter((c: Row) => c.frameIndex === frame)
          .map((c: Row, i: number) => (
            <Link
              key={i}
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              className="campus-close-pin"
              to={
                c.buildingId && can('buildings:read')
                  ? `/buildings?q=${encodeURIComponent(c.buildingName || '')}`
                  : '/map'
              }
            >
              {c.label || `Building ${i + 1}`}
            </Link>
          ))}
      </div>
    </div>
  );
}
export function CampusCloseView({
  revision,
  embedded = false,
  prefetched,
}: {
  revision?: string;
  embedded?: boolean;
  prefetched?: Row | null;
}) {
  const { can, activeWorkspaceId } = useAuth();
  const modal = useRef<HTMLDialogElement>(null);
  const [survey, setSurvey] = useState<Row | null>(null),
    [frame, setFrame] = useState(0),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setSurvey(null);
    setFrame(0);
    setZoom(1);
    setError('');
    if (prefetched !== undefined) {
      setSurvey(prefetched);
      setLoading(false);
      return () => {
        live = false;
      };
    }
    api
      .get<Row>('/api/campus-close-view')
      .then((r) => {
        if (live) setSurvey(r.survey);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [activeWorkspaceId, revision, retry, prefetched]);
  if (!survey)
    return (
      <section className={`campus-close-view ${embedded ? 'is-embedded' : ''}`}>
        <div className="desk-empty">
          <Camera size={32} strokeWidth={1.3} />
          <h3>{loading ? 'Opening your campus view…' : 'See the campus through your own lens.'}</h3>
          <p>
            {error ||
              'Choose a campus photo or video frame, label familiar places, and publish it here.'}
          </p>
          {error ? (
            <button className="desk-button" onClick={() => setRetry((v) => v + 1)}>
              Try again
            </button>
          ) : can('admin:users') && !loading ? (
            <Link className="desk-button" to="/operations?tab=advanced&tool=video">
              Create a campus view <ArrowUpRight size={15} />
            </Link>
          ) : (
            !loading && <p>Your school team can publish a reviewed view here.</p>
          )}
        </div>
      </section>
    );
  const controls = (
    <div className="close-view-toolbar">
      <label>
        View
        <select
          aria-label="Recorded campus view"
          value={frame}
          onChange={(e) => {
            setFrame(Number(e.target.value));
            setZoom(1);
          }}
        >
          {survey.payload.frames.map((f: Row, i: number) => (
            <option value={i} key={i}>
              View {i + 1}
              {f.kind === 'photo' ? ' · Photo' : ` · ${Number(f.time).toFixed(1)}s`}
            </option>
          ))}
        </select>
      </label>
      <div className="close-zoom">
        <button
          aria-label="Zoom out campus view"
          disabled={zoom <= 1}
          onClick={() => setZoom((v) => Math.max(1, v - 0.5))}
        >
          <Minus size={16} />
        </button>
        <label>
          <span className="sr-only">Close-up zoom</span>
          <input
            type="range"
            min="1"
            max="4"
            step="0.5"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <output>{zoom}×</output>
        </label>
        <button
          aria-label="Zoom in campus view"
          disabled={zoom >= 4}
          onClick={() => setZoom((v) => Math.min(4, v + 0.5))}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
  return (
    <section className={`campus-close-view ${embedded ? 'is-embedded' : ''}`}>
      {!embedded && <h2>Campus close-up view · {survey.title}</h2>}
      {controls}
      <ImageCanvas survey={survey} frame={frame} zoom={zoom} />
      <footer>
        <span>Recorded view · {survey.title}</span>
        <button onClick={() => modal.current?.showModal()}>
          <Expand size={15} /> Expand
        </button>
        {(can('scan:write') || can('evacuation:write')) && (
          <Link to={`/operations?tab=advanced&tool=paths&surveyId=${survey.id}&frame=${frame}`}>
            <Footprints size={14} /> Sketch a path
          </Link>
        )}
        {can('admin:users') && (
          <Link to="/operations?tab=advanced&tool=video">
            Edit views <ArrowUpRight size={14} />
          </Link>
        )}
      </footer>
      <dialog ref={modal} className="campus-view-dialog">
        <header>
          <div>
            <span className="desk-eyebrow">RECORDED CAMPUS VIEW</span>
            <h2>{survey.title}</h2>
          </div>
          <button onClick={() => modal.current?.close()} aria-label="Close expanded campus view">
            <X size={22} />
          </button>
        </header>
        {controls}
        <ImageCanvas survey={survey} frame={frame} zoom={zoom} large />
        <p>
          Scroll to pan. Labels link to school records; imagery is not a live safety assessment.
        </p>
      </dialog>
    </section>
  );
}
