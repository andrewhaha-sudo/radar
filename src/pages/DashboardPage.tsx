import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  Building2,
  ClipboardCheck,
  Compass,
  MapPin,
  RefreshCw,
  ScanEye,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { relativeTime, SEVERITY_META } from '@/components/ui/hazard-bits';
import { CampusScene } from '@/components/workspace/CampusScene';
import type { DashboardPayload, MapPayload, AlertsPayload } from '@/lib/types';
export function DashboardPage() {
  const { user, school, can, activeWorkspaceId } = useAuth();
  const [data, setData] = useState<DashboardPayload>(),
    [map, setMap] = useState<MapPayload>(),
    [alerts, setAlerts] = useState<AlertsPayload>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const [d, m, a] = await Promise.all([
        api.get<DashboardPayload>('/api/dashboard'),
        api.get<MapPayload>('/api/map'),
        can('alerts:read') ? api.get<AlertsPayload>('/api/alerts') : Promise.resolve(undefined),
      ]);
      if (sequence.current === request) {
        setData(d);
        setMap(m);
        setAlerts(a);
      }
    } catch (e) {
      if (sequence.current === request) setError(errorMessage(e));
    } finally {
      if (sequence.current === request) setLoading(false);
    }
  }, [can, activeWorkspaceId]);
  useEffect(() => {
    setData(undefined);
    setMap(undefined);
    setAlerts(undefined);
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  const k = data?.kpis;
  const date = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: school?.timezone || 'Asia/Manila',
  }).format(new Date(data?.generatedAt || Date.now()));
  const findings = [...(map?.hazards ?? [])].sort(
    (a, b) =>
      ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) -
      ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity),
  );
  const firstStep = k?.totalRooms === 0;
  const tools = [
    {
      title: 'Inspect a room',
      text: 'Capture conditions. Review findings.',
      icon: ScanEye,
      to: '/scan',
      show: can('scan:read'),
    },
    {
      title: 'Explore the campus',
      text: 'Buildings, rooms and real imagery.',
      icon: MapPin,
      to: '/map',
      show: true,
    },
    {
      title: 'Check your people',
      text: 'Attendance and follow-up.',
      icon: Users,
      to: '/rollcall',
      show: can('rollcall:read'),
    },
    {
      title: 'Photo route studio',
      text: 'Sketch a path. Verify it on foot.',
      icon: Compass,
      to: '/operations?tab=advanced&tool=paths',
      show: can('evacuation:read'),
    },
  ].filter((t) => t.show);
  return (
    <div className="campus-desk stack-page">
      <header className="desk-hero">
        <div>
          <div className="desk-eyebrow">
            <span className="desk-status-dot" />
            {date}
          </div>
          <h1>
            Your campus.
            <br />A clearer picture.
          </h1>
          <p>
            Hello, {user?.name.split(' ')[0]}. Here’s where things stand at{' '}
            <strong>{school?.name}</strong>.
          </p>
          <div className="desk-hero-actions">
            <Link
              className="desk-button primary"
              to={
                firstStep && can('admin:users')
                  ? '/buildings'
                  : can('scan:read')
                    ? '/scan'
                    : '/operations'
              }
            >
              {firstStep && can('admin:users')
                ? 'Set up your campus'
                : can('scan:read')
                  ? 'Start an inspection'
                  : 'Open your workspace'}
              <ArrowUpRight size={17} />
            </Link>
            <Link className="desk-link" to="/operations">
              Find a task <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="desk-hero-note">
          <span className="desk-orbit" aria-hidden="true">
            <span />
            <Compass size={42} strokeWidth={1} />
          </span>
          <span className="desk-eyebrow">THE CAMPUS NOTEBOOK</span>
          <p>
            Small observations.
            <br />
            <strong>Better decisions.</strong>
          </p>
          <button onClick={() => void load()} disabled={loading} aria-label="Refresh dashboard">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading
              ? 'Checking records…'
              : data
                ? `Updated ${relativeTime(data.generatedAt)}`
                : 'Refresh records'}
          </button>
        </div>
      </header>
      {error && (
        <div className="desk-error" role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}
      {k && Boolean(k.activeIncidents || k.safetyNeedHelp) && (
        <section className="desk-response" aria-label="Response attention">
          <ShieldAlert size={23} />
          <div>
            <span className="desk-eyebrow">NEEDS ATTENTION</span>
            <h2>
              {k.activeIncidents
                ? `${k.activeIncidents} active incident${k.activeIncidents === 1 ? '' : 's'}`
                : 'A check-in needs follow-up'}
            </h2>
            <p>
              {k.safetyNeedHelp
                ? `${k.safetyNeedHelp} check-in${k.safetyNeedHelp === 1 ? '' : 's'} requesting help. `
                : ''}
              Follow school response procedures; call local emergency services for immediate danger.
            </p>
          </div>
          <Link className="desk-button" to={can('incidents:read') ? '/incidents' : '/sos'}>
            Open response
            <ArrowUpRight size={16} />
          </Link>
        </section>
      )}
      {Boolean(alerts?.active.length) && (
        <section className="desk-announcement">
          <Bell size={19} />
          <div>
            <span>FROM YOUR SCHOOL</span>
            <strong>{alerts!.active[0].title}</strong>
          </div>
          <Link to="/alerts">
            Read update <ArrowRight size={16} />
          </Link>
        </section>
      )}
      <section className="desk-numbers" aria-label="Campus summary" aria-busy={loading}>
        <Link to={can('buildings:read') ? '/buildings' : '/map'}>
          <Building2 size={18} />
          <span>Rooms on record</span>
          <strong>{k?.totalRooms ?? '—'}</strong>
          <small>
            {map?.buildings.length ?? '—'} {map?.buildings.length === 1 ? 'building' : 'buildings'}
          </small>
        </Link>
        {can('scan:read') && (
          <Link to="/scan">
            <ScanEye size={18} />
            <span>Inspection coverage</span>
            <strong>{k ? `${k.roomCoverage}%` : '—'}</strong>
            <small>{k ? `${k.roomsScanned} of ${k.totalRooms} rooms` : 'Loading records'}</small>
          </Link>
        )}
        {can('hazards:read') && (
          <Link to="/hazards">
            <ShieldAlert size={18} />
            <span>Open findings</span>
            <strong>{k?.unresolved ?? '—'}</strong>
            <small>
              {k
                ? `${findings.filter((h) => h.status === 'new' || h.status === 'pending_review').length} mapped, unverified`
                : 'Loading records'}
            </small>
          </Link>
        )}
        <Link to={can('incidents:read') ? '/incidents' : '/sos'}>
          <ClipboardCheck size={18} />
          <span>Active incidents</span>
          <strong>{k?.activeIncidents ?? '—'}</strong>
          <small>{k?.activeIncidents ? 'Response in progress' : 'Reported in RADAR'}</small>
        </Link>
      </section>
      <div className="desk-main">
        <CampusScene map={map} revision={data?.generatedAt} />
        <aside className="desk-focus">
          <header className="desk-section-heading">
            <div>
              <p className="desk-eyebrow">NEXT UP</p>
              <h2>{findings.length ? 'Needs a closer look' : 'Keep the momentum'}</h2>
            </div>
            <span className="desk-small-index">01 / FOCUS</span>
          </header>
          {can('hazards:read') && findings.length > 0 ? (
            <div className="desk-focus-list">
              {findings.slice(0, 4).map((h) => (
                <Link to={`/hazards?open=${h.id}`} key={h.id}>
                  <span
                    className="desk-severity"
                    style={{ background: SEVERITY_META[h.severity].hex }}
                  />
                  <div>
                    <small>
                      {h.buildingName || 'Campus observation'} · {h.severity}
                    </small>
                    <strong>{h.title}</strong>
                    <span>
                      {h.status === 'pending_review' || h.status === 'new'
                        ? 'Needs human review'
                        : 'Follow-up in progress'}
                    </span>
                  </div>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
              <Link className="desk-link" to="/hazards">
                All findings <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <div className="desk-checklist">
              <p>
                {loading
                  ? 'Checking your campus records…'
                  : k?.totalRooms
                    ? 'No open findings are listed on the map. Keep records fresh with regular inspections.'
                    : 'Build your workspace around your actual school. No sample campus records are added here.'}
              </p>
              {[
                {
                  title: 'Register your spaces',
                  text: 'Buildings, floors and rooms.',
                  done: Boolean(k?.totalRooms),
                  to: '/buildings',
                  show: can('buildings:read'),
                },
                {
                  title: 'Review your campus imagery',
                  text: 'A photo or video frame people recognize.',
                  done: false,
                  to: '/operations?tab=advanced&tool=video',
                  show: can('buildings:read'),
                },
                {
                  title: 'Make your first inspection',
                  text: 'Start with one familiar room.',
                  done: Boolean(k?.roomsScanned),
                  to: '/scan',
                  show: can('scan:read'),
                },
              ]
                .filter((t) => t.show)
                .map((t, i) => (
                  <Link key={t.title} to={t.to}>
                    <span className={t.done ? 'is-done' : ''}>
                      {t.done ? <Check size={14} /> : i + 1}
                    </span>
                    <div>
                      <strong>{t.title}</strong>
                      <small>{t.text}</small>
                    </div>
                    <ArrowRight size={14} />
                  </Link>
                ))}
            </div>
          )}
          <div className="desk-focus-footer">
            <span className="desk-label">GOOD TO KNOW</span>
            <p>
              Recorded conditions can change. Staff verification and the school’s response plan come
              first.
            </p>
          </div>
        </aside>
      </div>
      <section className="desk-shortcuts">
        <header className="desk-section-heading">
          <div>
            <p className="desk-eyebrow">LESS SEARCHING. MORE DOING.</p>
            <h2>Pick up where it matters.</h2>
          </div>
          <Link className="desk-link" to="/operations">
            All tools <ArrowUpRight size={16} />
          </Link>
        </header>
        <div>
          {tools.map((t) => (
            <Link to={t.to} key={t.title}>
              <t.icon size={24} strokeWidth={1.5} />
              <strong>{t.title}</strong>
              <p>{t.text}</p>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      </section>
      <footer className="desk-footer">
        <span>
          RADAR <span>/</span> Safer schools, together.
        </span>
        <Link to="/offline">
          Offline & saved work <ArrowUpRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
