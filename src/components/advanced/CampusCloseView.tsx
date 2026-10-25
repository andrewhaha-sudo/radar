import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Row } from './tools';
export function CampusCloseView({ revision }: { revision?: string }) {
  const { can, activeWorkspaceId } = useAuth();
  const [survey, setSurvey] = useState<Row | null>(null),
    [frame, setFrame] = useState(0),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setSurvey(null);
    setFrame(0);
    setError('');
    api
      .get<Row>('/api/campus-close-view')
      .then((r) => {
        if (live) setSurvey(r.survey);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [activeWorkspaceId, revision]);
  if (!survey)
    return can('admin:users') ? (
      <section className="command-panel campus-close-view">
        <h2>Campus close-up view</h2>
        <p>{error || 'Save a reviewed campus video survey, then choose “Show on dashboard”.'}</p>
        <Link to="/operations?tab=advanced&tool=video">Set up campus view →</Link>
      </section>
    ) : null;
  const frames = survey.payload.frames;
  return (
    <section className="command-panel campus-close-view">
      <h2>Campus close-up view · {survey.title}</h2>
      <p>
        Recorded campus imagery. Scroll to pan when zoomed; building labels were reviewed by school
        staff.
      </p>
      <div className="advanced-tabs">
        {frames.map((f: Row, i: number) => (
          <button
            key={i}
            className={frame === i ? 'active' : ''}
            onClick={() => {
              setFrame(i);
              setZoom(1);
            }}
          >
            View {i + 1} · {Number(f.time).toFixed(1)}s
          </button>
        ))}
      </div>
      <label>
        Close-up zoom{' '}
        <input
          type="range"
          min="1"
          max="4"
          step="0.25"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />{' '}
        {zoom}×
      </label>
      <div className="campus-close-scroll" tabIndex={0} aria-label="Campus image; scroll to pan">
        <div className="campus-close-image" style={{ width: `${zoom * 100}%` }}>
          <img src={frames[frame].image} alt={`Reviewed campus view ${frame + 1}`} />
          {survey.payload.candidates.map((c: Row, i: number) =>
            c.frameIndex === frame ? (
              <Link
                key={i}
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                className="campus-close-pin"
                to={
                  c.buildingId
                    ? `/buildings?q=${encodeURIComponent(c.buildingName || '')}`
                    : '/operations?tab=advanced&tool=video'
                }
              >
                {c.label || `Building ${i + 1}`}
              </Link>
            ) : null,
          )}
        </div>
      </div>
      {can('admin:users') && (
        <Link to="/operations?tab=advanced&tool=video">Manage saved campus view →</Link>
      )}
    </section>
  );
}
