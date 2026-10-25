import {lazy,Suspense} from 'react';
const AdvancedWorkspace=lazy(()=>import('@/components/advanced/AdvancedWorkspace').then(m=>({default:m.AdvancedWorkspace})));
import { MembershipRequests } from '@/components/forms/MembershipRequests';
import { SetupReadiness } from '@/components/forms/SetupReadiness';
import { HazardReviewTools } from '@/components/forms/HazardReviewTools';
import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { NotificationChannels } from '@/components/forms/NotificationChannels';
import { IntegrationStatus } from '@/components/forms/IntegrationStatus';
import QRCode from 'qrcode';
import { NearestResources } from '@/components/map/NearestResources';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { workspaceUrl, workspaceId, setWorkspaceScope } from '@/lib/workspace';
import { MapTimeline } from '@/components/map/MapTimeline';
import { ZoneEditor } from '@/components/map/ZoneEditor';
import { EvacuationPlanner } from '@/components/map/EvacuationPlanner';
import { RoomMedia } from '@/components/map/RoomMedia';

type Row = Record<string, any>;
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string | number;
  disabled?: boolean;
  options?: Array<{ value: string | number; label: string }>;
};
const options = (rows: Row[], label = 'name') =>
  rows.map((r) => ({ value: r.id, label: String(r[label] ?? r.id) }));
function ActionForm({
  title,
  fields,
  path,
  method = 'post',
  onSaved,
  transform,
}: {
  title: string;
  fields: Field[];
  path: string;
  method?: 'post' | 'patch';
  onSaved: () => void;
  transform?: (data: Row) => Row;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const requestKey = useRef(crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const data: Row = Object.fromEntries(formData);
    if (path === '/api/hazards') data.clientRequestId = requestKey.current;
    for (const field of fields) {
      if (field.type === 'datetime-local' && data[field.name])
        data[field.name] = new Date(data[field.name]).toISOString();
    }
    for (const field of fields)
      if (field.type === 'checkbox') data[field.name] = data[field.name] === 'on';
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await api[method]<Row>(path, transform ? transform(data) : data);
      const file = formData.get('photo');
      if (response?.hazard?.id && file instanceof File && file.size) {
        const uploaded = await api.upload(file);
        await api.post(`/api/hazards/${response.hazard.id}/evidence`, {
          url: uploaded.url,
          caption: 'Reporter photo evidence',
        });
      }
      requestKey.current = crypto.randomUUID();
      setMessage('Saved.');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ops-card">
      <h3>{title}</h3>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="ops-form-grid">
          {fields.map((f) => (
            <label key={f.name} className={f.type === 'textarea' ? 'wide' : ''}>
              {f.label}
              {f.options ? (
                <select name={f.name} required={f.required ?? true} defaultValue={f.value ?? ''}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea name={f.name} required={f.required ?? true} defaultValue={f.value} />
              ) : (
                <input
                  name={f.name}
                  type={f.type ?? 'text'}
                  disabled={f.disabled}
                  required={f.type === 'checkbox' ? false : (f.required ?? true)}
                  defaultValue={f.type === 'checkbox' ? undefined : f.value}
                  step={f.type === 'number' ? 'any' : undefined}
                />
              )}
            </label>
          ))}
          <button className="command-action blue" type="submit">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-success">
          {message}
        </p>
      )}
    </section>
  );
}
export function OperationsPage() {
  const { activeWorkspaceId, user } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const expected = params.get('school');
  const mismatch = expected !== null && expected !== (activeWorkspaceId ?? 'original');
  async function switchSchool() {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/workspaces/select', {
        beisId: expected === 'original' ? null : expected,
      });
      setWorkspaceScope(expected === 'original' ? null : expected, user?.accountScope ?? user?.id);
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (mismatch)
    return (
      <section className="ops-card">
        <h1>This QR code belongs to another school workspace</h1>
        <p>
          Open the school recorded in this code before accessing its room or attendance record.
          Membership is checked by the server.
        </p>
        <p>School workspace: {expected}</p>
        <button
          disabled={busy || !navigator.onLine}
          className="command-action blue"
          onClick={() => void switchSchool()}
        >
          {busy ? 'Checking access…' : 'Open the QR code’s school workspace'}
        </button>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </section>
    );
  return <OperationsContent />;
}
function OperationsContent() {
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab =
    params.get('tab') ??
    (can('admin:users') ? 'readiness' : can('buildings:read') ? 'rooms' : 'response');
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [myReports, setMyReports] = useState<Row>({
    reports: [],
    policy: { allowAnonymous: false },
  });
  const [members, setMembers] = useState<Row[]>([]),
    [classes, setClasses] = useState<Row[]>([]),
    [classId, setClassId] = useState(''),
    [roster, setRoster] = useState<Row[]>([]);
  const [roomId, setRoomId] = useState(params.get('roomId') ?? ''),
    [record, setRecord] = useState<Row | null>(null),
    [resourceId, setResourceId] = useState(''),
    [history, setHistory] = useState<Row[]>([]),
    [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.get<Row>('/api/operations');
      setData(result);
      setMyReports(await api.get<Row>('/api/reports/mine'));
      if (can('admin:users'))
        setMembers((await api.get<{ members: Row[] }>('/api/members')).members);
      if (can('rollcall:read'))
        setClasses((await api.get<{ classes: Row[] }>('/api/rollcall')).classes);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [can]);
  useEffect(() => {
    void load();
  }, [load]);
  const requestedRoomId=params.get('roomId');
  useEffect(()=>{if(requestedRoomId!==null)setRoomId(requestedRoomId);},[requestedRoomId]);
  const loadRoom = useCallback(async () => {
    if (!roomId) {
      setRecord(null);
      return;
    }
    try {
      setRecord(await api.get<Row>(`/api/rooms/${roomId}/record`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [roomId]);
  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);
  const loadRoster = useCallback(async () => {
    if (!classId) return;
    try {
      setRoster((await api.get<{ people: Row[] }>(`/api/rollcall/${classId}/roster`)).people);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [classId]);
  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);
  useEffect(() => {
    if (resourceId && can('resources:write'))
      api
        .get<{ history: Row[] }>(`/api/resources/${resourceId}/history`)
        .then((r) => setHistory(r.history))
        .catch((err) => setError(errorMessage(err)));
  }, [resourceId, data, can]);
  async function action(path: string, body: unknown, method: 'post' | 'del' = 'post') {
    setError('');
    try {
      if (method === 'del') await api.del(path);
      else {
        const result = await api.post<Row>(path, body);
        if (result.person) setClassId(String(result.person.classId));
      }
      await load();
      await loadRoster();
      setNotice('Updated.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function shareLocation(incidentId: number) {
    if (!navigator.geolocation) {
      setError('Location is not supported on this device.');
      return;
    }
    if (
      !window.confirm(
        'Share your approximate current position with authorized school responders for 15 minutes?',
      )
    )
      return;
    navigator.geolocation.getCurrentPosition(
      (p) =>
        void action('/api/safety/location', {
          consent: true,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          incidentId,
          minutes: 15,
        }),
      () => setError('Location permission was denied or a position could not be obtained.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  const tabs = [
    { id: 'reports', name: 'Report a hazard', show: can('hazards:write') || can('hazards:report') },
    { id: 'rooms', name: 'Room records', show: can('buildings:read') },
    {
      id: 'rollcall',
      name: 'Individual roll call',
      show: can('rollcall:read') || Boolean(params.get('token')),
    },
    { id: 'response', name: 'SOS & location', show: true },
    { id: 'integrations', name: 'Feeds & delivery', show: true },
    { id: 'resources', name: 'Inventory history', show: can('resources:read') },
    { id: 'assembly', name: 'Assembly & routes', show: can('evacuation:read') },
    { id: 'recovery', name: 'Assistance', show: true },
    { id: 'members', name: 'School members', show: can('admin:users') },
    { id: 'guardians', name: 'Guardian updates', show: user?.role === 'parent' },
    { id: 'settings', name: 'Emergency settings', show: can('admin:users') },
    {id:'advanced',name:'Advanced tools & testing',show:true},
    { id: 'readiness', name: 'Setup & launch', show: can('admin:users') },
    { id: 'review', name: 'Review patterns', show: can('hazards:read') },
  ].filter((t) => t.show);
  return (
    <div className="stack-page operations-page">
      <header className="ops-heading">
        <span className="command-feature-icon">
          <ShieldCheck size={30} />
        </span>
        <div>
          <p className="command-eyebrow">RADAR 2.0 · CAMPUS OPERATIONS</p>
          <h1>Inspection &amp; response workspace</h1>
          <p>School records, accountable actions, and verified campus information.</p>
        </div>
        <button
          className="command-icon-button"
          onClick={() => void load()}
          disabled={busy}
          aria-label="Refresh operations"
        >
          <RefreshCw size={17} />
        </button>
      </header>
      <nav className="ops-tabs" aria-label="Operations sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setParams({ tab: t.id })}
          >
            {t.name}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="command-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="ops-notice">
          {notice}
        </p>
      )}
      {!data && <p>{busy ? 'Loading school operations…' : 'No data loaded.'}</p>}
      {data && tab === 'rooms' && can('buildings:read') && (
        <>
          <div className="ops-card">
            <h2>Room inspection records</h2>
            {data.permissions.staff && (
              <button
                className="school-back"
                onClick={() => void action('/api/inspections/reminders', {})}
              >
                Run due inspection, stock and check-in reminders
              </button>
            )}
            <p>
              {data.overdue} scheduled inspections overdue. Scores use published criteria and never
              certify a building as safe.
            </p>
            <div className="ops-grid">
              {(data.coverage ?? []).map((group: Row) => (
                <div key={group.floorId} className="ops-row">
                  <strong>
                    {group.buildingName} · {group.floorName}
                  </strong>
                  <span>
                    {group.percent}% inspected ({group.inspected}/{group.total}) · {group.overdue}{' '}
                    overdue · {group.pending} awaiting verification
                  </span>
                </div>
              ))}
            </div>
            <label>
              Choose a room
              <select
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  setParams({ tab: 'rooms', roomId: e.target.value });
                }}
              >
                <option value="">Choose a room…</option>
                {(data.rooms ?? []).map((r: Row) => (
                  <option key={r.id} value={r.id}>
                    {r.buildingName} · {r.floorName} · {r.code} {r.name} ·{' '}
                    {String(r.inspectionState ?? 'unscanned').replaceAll('_', ' ')}
                    {r.nextDueAt && r.nextDueAt < new Date().toISOString() ? ' · overdue' : ''}
                  </option>
                ))}
              </select>
            </label>
            {!(data.rooms ?? []).length && (
              <button className="command-action blue" onClick={() => navigate('/buildings')}>
                Add campus rooms <ArrowRight size={15} />
              </button>
            )}
          </div>
          {record && (
            <>
              <div className="ops-grid">
                <section className="ops-card">
                  <h2>{record.room.name}</h2>
                  <p>
                    {record.context?.buildingName} · {record.context?.floorName} ·{' '}
                    {record.room.code}
                  </p>
                  <div className="ops-score">
                    {record.score.value ?? 'Not inspected'}
                    {record.score.value != null && (
                      <small>/100 {record.score.provisional ? 'provisional' : ''}</small>
                    )}
                  </div>
                  <p>{record.score.note}</p>
                  <p>Penalties: critical 30 · high 20 · medium 10 · low 5 · info 0.</p>
                  <p>Last inspection: {record.room.lastInspectedAt ?? 'No submitted inspection'}</p>
                </section>
                <section className="ops-card">
                  <h3>Room QR code</h3>
                  <img
                    className="ops-qr"
                    src={record.qr.image}
                    alt={`Room QR code for ${record.room.name}`}
                  />
                  <a href={record.qr.url}>Open room record</a>
                  <button className="school-back" onClick={() => window.print()}>
                    Print this record
                  </button>
                </section>
              </div>
              <EvidenceCompare photos={record.photos} />
              <RoomMedia
                assets={record.assets}
                onRoomSelect={(id) => {
                  setRoomId(String(id));
                  setParams({ tab: 'rooms', roomId: String(id) });
                }}
              />
              {can('scan:write') && (
                <ActionForm
                  title="Recurring inspection schedule"
                  path={`/api/rooms/${roomId}/schedule`}
                  onSaved={() => {
                    void load();
                    void loadRoom();
                  }}
                  fields={[
                    {
                      name: 'intervalDays',
                      label: 'Repeat every (days)',
                      type: 'number',
                      value: record.schedule?.intervalDays ?? 30,
                    },
                    { name: 'nextDueAt', label: 'Next inspection date', type: 'datetime-local' },
                  ]}
                />
              )}
              {can('admin:users') && (
                <>
                  <ActionForm
                    title="Room measurements and responsibilities"
                    path={`/api/rooms/${roomId}/details`}
                    method="patch"
                    onSaved={() => void loadRoom()}
                    fields={[
                      {
                        name: 'widthM',
                        label: 'Width in metres (optional verified measurement)',
                        type: 'number',
                        required: false,
                        value: record.room.widthM ?? '',
                      },
                      {
                        name: 'lengthM',
                        label: 'Length in metres (optional verified measurement)',
                        type: 'number',
                        required: false,
                        value: record.room.lengthM ?? '',
                      },
                      {
                        name: 'intendedUse',
                        label: 'Intended use',
                        required: false,
                        value: record.room.intendedUse,
                      },
                      {
                        name: 'department',
                        label: 'Responsible department',
                        required: false,
                        value: record.room.department,
                      },
                      {
                        name: 'emergencyContact',
                        label: 'Emergency contact / extension',
                        required: false,
                        value: record.room.emergencyContact,
                      },
                    ]}
                  />
                  <AssetForm
                    roomId={roomId}
                    floorId={record.room.floorId}
                    onSaved={() => void loadRoom()}
                  />
                  <ActionForm
                    title="Edit room floor-plan geometry"
                    path={`/api/rooms/${roomId}/layout`}
                    method="patch"
                    onSaved={() => void loadRoom()}
                    fields={['x', 'y', 'width', 'height', 'capacity'].map((name) => ({
                      name,
                      label: name,
                      type: 'number',
                      value: record.room[name],
                    }))}
                  />
                  <ActionForm
                    title="Mark a door, exit, window or accessible feature"
                    path={`/api/rooms/${roomId}/features`}
                    onSaved={() => void loadRoom()}
                    fields={[
                      {
                        name: 'kind',
                        label: 'Feature',
                        options: [
                          'door',
                          'exit',
                          'window',
                          'stairs',
                          'ramp',
                          'accessible_entrance',
                        ].map((value) => ({ value, label: value })),
                      },
                      { name: 'label', label: 'Label' },
                      { name: 'x', label: 'Horizontal fraction (0–1)', type: 'number' },
                      { name: 'y', label: 'Vertical fraction (0–1)', type: 'number' },
                      { name: 'accessible', label: 'Verified accessible', type: 'checkbox' },
                    ]}
                  />
                </>
              )}
              <section className="ops-card">
                <h3>Room findings &amp; approximate positions</h3>
                {record.hazards.map((item: Row) => (
                  <div key={item.id} className="ops-row">
                    <div>
                      <strong>{item.title}</strong>
                      <p>
                        {item.severity} · {item.status} ·{' '}
                        {item.pinX == null
                          ? 'Position not recorded'
                          : `Approximate x ${item.pinX}, y ${item.pinY}`}
                      </p>
                      <button
                        className="school-back"
                        onClick={() => navigate(`/hazards?open=${item.id}`)}
                      >
                        Open evidence and correction workflow
                      </button>
                    </div>
                    {can('hazards:verify') && (
                      <ActionForm
                        title="Place finding"
                        path={`/api/hazards/${item.id}/pin`}
                        onSaved={() => void loadRoom()}
                        fields={[
                          { name: 'x', label: 'x (0–1)', type: 'number' },
                          { name: 'y', label: 'y (0–1)', type: 'number' },
                        ]}
                      />
                    )}
                  </div>
                ))}
                {!record.hazards.length && <p>No unresolved findings recorded.</p>}
              </section>
            </>
          )}
        </>
      )}
      {data && tab === 'reports' && (
        <>
          <ActionForm
            title="Report a visible hazard"
            path="/api/hazards"
            onSaved={() => void load()}
            fields={[
              { name: 'title', label: 'What did you observe?' },
              { name: 'description', label: 'Description and evidence notes', type: 'textarea' },
              { name: 'photo', label: 'Photo evidence (optional)', type: 'file', required: false },
              {
                name: 'severity',
                label: 'Proposed severity (subject to verification)',
                options: ['low', 'medium', 'high', 'critical', 'info'].map((value) => ({
                  value,
                  label: value,
                })),
              },
              {
                name: 'category',
                label: 'Hazard category',
                options: [
                  'electrical',
                  'structural',
                  'fire',
                  'chemical',
                  'slip',
                  'blocked_exit',
                  'other',
                ].map((value) => ({ value, label: value })),
              },
              {
                name: 'roomId',
                label: 'Room ID if known',
                type: 'number',
                required: false,
                value: params.get('roomId') ?? '',
              },
              { name: 'locationNote', label: 'Location description' },
              {
                name: 'anonymous',
                disabled: !myReports.policy.allowAnonymous,
                label: myReports.policy.allowAnonymous
                  ? 'Hide identity from general views (administrators retain audit access)'
                  : 'Identity-hidden reporting is disabled by school policy',
                type: 'checkbox',
              },
            ]}
          />
          <section className="ops-card">
            <h3>My reports and verification status</h3>
            {myReports.reports.map((r: Row) => (
              <p key={r.id}>
                {r.ref} · {r.title} · {r.status} · proposed {r.severity}
              </p>
            ))}
          </section>
          <ActionForm
            title="Corroborate a report or flag a possible duplicate"
            path="/api/operations/feedback"
            onSaved={() => void load()}
            fields={[
              { name: 'hazardId', label: 'Report numeric ID', type: 'number' },
              {
                name: 'kind',
                label: 'Feedback',
                options: [
                  { value: 'confirm', label: 'I observed this too' },
                  { value: 'duplicate', label: 'Possible duplicate' },
                ],
              },
              { name: 'note', label: 'Evidence / duplicate report reference', required: false },
            ]}
          />
        </>
      )}
      {data && tab === 'rollcall' && (
        <>
          {params.get('token') && (
            <section className="ops-card">
              <h3>School ID check-in</h3>
              <button
                className="command-action blue"
                onClick={() => void action('/api/rollcall/qr', { token: params.get('token') })}
              >
                Confirm my check-in / open assigned student
              </button>
            </section>
          )}
          {can('rollcall:write') && (
            <ActionForm
              title="Create a class or section"
              path="/api/rollcall/classes"
              onSaved={() => void load()}
              fields={[
                { name: 'name', label: 'Class / section name' },
                { name: 'grade', label: 'Grade level' },
                ...(can('admin:users')
                  ? [
                      {
                        name: 'teacherId',
                        label: 'Assigned teacher',
                        options: options(
                          members.filter(
                            (m) => m.active !== 0 && ['teacher', 'admin'].includes(m.role),
                          ),
                        ),
                      },
                    ]
                  : []),
                { name: 'expected', label: 'Expected headcount', type: 'number', value: 0 },
              ]}
            />
          )}
          <section className="ops-card">
            <h3>Assigned class roster</h3>
            <label>
              Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Choose class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade} · {c.name}
                  </option>
                ))}
              </select>
            </label>
            {classId && (
              <a className="school-back" href={workspaceUrl(`/api/rollcall/${classId}/report`)}>
                Download attendance report
              </a>
            )}
            {roster.map((person) => (
              <div key={person.id} className="ops-row">
                <div>
                  <strong>{person.displayName}</strong>
                  <p>
                    {person.status.replaceAll('_', ' ')} · {person.updatedAt}
                  </p>
                  <RosterQR token={person.qrToken} />
                </div>
                {can('rollcall:write') && (
                  <label>
                    Recorded status
                    <select
                      value={person.status}
                      onChange={(e) =>
                        void action(`/api/rollcall/people/${person.id}/status`, {
                          status: e.target.value,
                        })
                      }
                    >
                      {['not_checked', 'present', 'missing', 'injured', 'unaccounted'].map(
                        (value) => (
                          <option key={value} value={value}>
                            {value.replaceAll('_', ' ')}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </section>
          {classId && can('rollcall:write') && (
            <ActionForm
              title="Add a student to the roster"
              path={`/api/rollcall/${classId}/roster`}
              onSaved={() => {
                void loadRoster();
                void load();
              }}
              fields={[
                { name: 'name', label: 'Official student name' },
                {
                  name: 'studentId',
                  label: 'School account ID (optional, needed for self check-in)',
                  type: 'number',
                  required: false,
                },
              ]}
            />
          )}
          <p className="ops-footnote">
            Unchecked and overdue check-ins require follow-up. They do not prove someone is trapped
            or that a rescue was dispatched.
          </p>
        </>
      )}
      {data && tab === 'response' && (
        <>
          <section className="ops-card">
            <h2>SOS requests</h2>
            <button className="command-action red" onClick={() => navigate('/sos')}>
              Open press-and-hold SOS
            </button>
            {data.sos.map((s: Row) => (
              <div className="ops-row" key={s.id}>
                <div>
                  <strong>
                    {s.ref} · {s.kind}
                  </strong>
                  <p>
                    {s.state} · {s.location} · {s.silent ? 'Silent request' : 'Standard request'}
                  </p>
                  <p>
                    {s.acknowledgedAt ? `Acknowledged ${s.acknowledgedAt}` : 'Not acknowledged yet'}
                  </p>
                  {!['cancelled', 'resolved'].includes(s.state) && (
                    <button className="school-back" onClick={() => shareLocation(s.incidentId)}>
                      Share my approximate position for 15 minutes
                    </button>
                  )}
                </div>
                {can('incidents:write') && !['cancelled', 'resolved'].includes(s.state) && (
                  <ActionForm
                    title="Responder update"
                    path={`/api/sos/${s.incidentId}/respond`}
                    onSaved={() => void load()}
                    fields={[
                      {
                        name: 'state',
                        label: 'Response status',
                        options: [
                          'acknowledged',
                          'assigned',
                          'resolved',
                          ...(s.state === 'cancel_requested' ? ['cancelled'] : []),
                        ].map((value) => ({ value, label: value })),
                      },
                      {
                        name: 'responderId',
                        label: 'Responder account ID (optional)',
                        type: 'number',
                        required: false,
                      },
                    ]}
                  />
                )}{' '}
                {s.reporterId === user?.id && !['cancelled', 'resolved'].includes(s.state) && (
                  <ActionForm
                    title="Request cancellation"
                    path={`/api/sos/${s.incidentId}/cancel`}
                    onSaved={() => void load()}
                    fields={[{ name: 'reason', label: 'Cancellation reason' }]}
                  />
                )}
              </div>
            ))}
            {!data.sos.length && <p>No SOS requests recorded.</p>}
          </section>
          <section className="ops-card">
            <h3>Location consent</h3>
            <p>
              Sharing is optional, temporary and approximate. Location is collected only after your
              permission during an active school incident. Authorized responders can view it until
              expiry.
            </p>
            <button
              className="command-action blue"
              onClick={() => void action('/api/safety/location', null, 'del')}
            >
              Stop sharing and delete my coordinates
            </button>
            {data.permissions.staff &&
              (data.locations ?? []).map((l: Row) => (
                <p key={l.userId}>
                  {l.name}: {l.lat}, {l.lng} · accuracy ±{Math.round(l.accuracy)} m · updated{' '}
                  {l.updatedAt} · expires {l.expiresAt}
                </p>
              ))}
          </section>
        </>
      )}
      {data && tab === 'integrations' && (
        <>
          <IntegrationStatus />
          <NotificationChannels />
        </>
      )}
      {data && tab === 'resources' && (
        <>
          <NearestResources />
          <section className="ops-card">
            <h2>Resource stock and accountability</h2>
            <button className="school-back" onClick={() => navigate('/resources')}>
              Open full resource register
            </button>
            <label>
              Resource
              <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                <option value="">Choose resource…</option>
                {(data.resources ?? []).map((r: Row) => (
                  <option key={r.id} value={r.id}>
                    {r.label} · {r.quantity} available
                    {r.quantity <= (r.lowStockThreshold ?? 0) ? ' · low stock' : ''}
                  </option>
                ))}
              </select>
            </label>
          </section>
          {resourceId && can('resources:write') && (
            <>
              <ActionForm
                title="Record checkout, return or replenishment"
                path={`/api/resources/${resourceId}/movements`}
                onSaved={() => void load()}
                fields={[
                  {
                    name: 'kind',
                    label: 'Movement',
                    options: ['checkout', 'return', 'replenish', 'consume'].map((value) => ({
                      value,
                      label: value,
                    })),
                  },
                  { name: 'quantity', label: 'Units', type: 'number', value: 1 },
                  { name: 'holder', label: 'Issued to / returned by', required: false },
                  { name: 'note', label: 'Reason / reference', required: false },
                ]}
              />
              <section className="ops-card">
                <h3>Movement history</h3>
                {history.map((item) => (
                  <p key={item.id}>
                    {item.kind} · {item.quantity} units · {item.holder || '—'} · {item.createdAt}
                  </p>
                ))}
                {!history.length && <p>No movements recorded.</p>}
              </section>
            </>
          )}
        </>
      )}
      {data && tab === 'assembly' && (
        <>
          {can('admin:users') && <MapTimeline />}
          {can('evacuation:write') && <ZoneEditor />}
          <EvacuationPlanner key={(data.assembly ?? []).length} />
          <section className="ops-card">
            <h2>Assembly point capacity</h2>
            <p>
              Counts below are time-stamped estimates from the recorded measurement source, not
              automatic live crowd detection.
            </p>
            {(data.assembly ?? []).map((point: Row) => {
              const count = (data.occupancy ?? []).find((r: Row) => r.assemblyPointId === point.id);
              return (
                <div className="ops-row" key={point.id}>
                  <div>
                    <strong>{point.name}</strong>
                    <p>
                      {count
                        ? `${count.count} estimated / ${point.capacity} capacity · ${count.source} · ${count.observedAt}`
                        : `Capacity ${point.capacity}; no occupancy measurement`}
                    </p>
                    {count && point.capacity > 0 && count.count >= point.capacity * 0.85 && (
                      <p className="text-warning">
                        Approaching or exceeding registered capacity. Responders should assess an
                        available alternate point.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <button className="school-back" onClick={() => navigate('/evacuation')}>
              Open evacuation routes and point status
            </button>
          </section>
          {can('evacuation:write') && (
            <>
              <ActionForm
                title="Register an actual assembly point"
                path="/api/evacuation/assembly"
                onSaved={() => void load()}
                fields={[
                  { name: 'name', label: 'Assembly point name' },
                  { name: 'lat', label: 'Latitude', type: 'number' },
                  { name: 'lng', label: 'Longitude', type: 'number' },
                  { name: 'capacity', label: 'Approved capacity', type: 'number' },
                  { name: 'accessible', label: 'Verified accessible', type: 'checkbox' },
                ]}
              />
              <ActionForm
                title="Register an approved mapped walkway"
                path="/api/evacuation/routes"
                onSaved={() => void load()}
                fields={[
                  { name: 'name', label: 'Route name' },
                  { name: 'buildingId', label: 'Start building ID', type: 'number' },
                  {
                    name: 'pointId',
                    label: 'Destination assembly point',
                    options: options(data.assembly ?? []),
                  },
                  {
                    name: 'path',
                    label: 'Verified [latitude, longitude] path points (JSON)',
                    type: 'textarea',
                  },
                  { name: 'source', label: 'Approving staff / official plan reference' },
                  { name: 'accessible', label: 'Verified wheelchair accessible', type: 'checkbox' },
                  { name: 'oneWay', label: 'One-way walkway', type: 'checkbox' },
                  {
                    name: 'verified',
                    label: 'I verified this walkway against the approved school plan',
                    type: 'checkbox',
                  },
                ]}
              />
              <ActionForm
                title="Record an occupancy estimate"
                path="/api/occupancy"
                onSaved={() => void load()}
                fields={[
                  {
                    name: 'pointId',
                    label: 'Assembly point',
                    options: options(data.assembly ?? []),
                  },
                  { name: 'count', label: 'Observed count', type: 'number' },
                  { name: 'source', label: 'Measurement source (e.g. teacher headcount)' },
                ]}
              />
            </>
          )}
        </>
      )}
      {data && tab === 'recovery' && (
        <>
          <ActionForm
            title="Request confidential assistance"
            path="/api/assistance"
            onSaved={() => void load()}
            fields={[
              {
                name: 'kind',
                label: 'Assistance type',
                options: ['supplies', 'medical', 'repair', 'counselling', 'other'].map((value) => ({
                  value,
                  label: value,
                })),
              },
              { name: 'note', label: 'Request details', type: 'textarea' },
            ]}
          />
          <section className="ops-card">
            <h3>
              {data.permissions.staff ? 'Authorized recovery requests' : 'My assistance requests'}
            </h3>
            {data.assistance.map((a: Row) => (
              <div className="ops-row" key={a.id}>
                <div>
                  <strong>
                    {a.kind} · {a.state}
                  </strong>
                  <p>{a.note}</p>
                  <p>{a.referral}</p>
                </div>
                {data.permissions.staff && (
                  <ActionForm
                    title="Recovery follow-up"
                    path={`/api/assistance/${a.id}`}
                    method="patch"
                    onSaved={() => void load()}
                    fields={[
                      {
                        name: 'state',
                        label: 'Status',
                        options: ['submitted', 'acknowledged', 'referred', 'fulfilled'].map(
                          (value) => ({ value, label: value }),
                        ),
                      },
                      {
                        name: 'referral',
                        label: 'Confidential referral / follow-up',
                        type: 'textarea',
                        required: false,
                      },
                    ]}
                  />
                )}
              </div>
            ))}
          </section>
        </>
      )}
      {data && tab === 'guardians' && (
        <section className="ops-card">
          <h2>Authorized student check-ins</h2>
          {(data.guardianChecks ?? []).map((c: Row, i: number) => (
            <p key={i}>
              {c.name}: {c.status ?? 'No check-in recorded'} · {c.updatedAt ?? 'No timestamp'}
            </p>
          ))}
          {!(data.guardianChecks ?? []).length && (
            <p>
              An administrator must approve a student–guardian relationship before check-ins can be
              viewed.
            </p>
          )}
        </section>
      )}
      {data && tab === 'members' && can('admin:users') && (
        <>
          <MembershipRequests onSaved={() => void load()} />
          <ActionForm
            title="Add an existing RADAR account to this school"
            path="/api/members"
            onSaved={() => void load()}
            fields={[
              { name: 'email', label: 'Registered email', type: 'email' },
              {
                name: 'role',
                label: 'School role',
                options: ['admin', 'inspector', 'teacher', 'responder', 'student', 'parent'].map(
                  (value) => ({ value, label: value }),
                ),
              },
            ]}
          />
          <p className="ops-footnote">
            The person must register and sign in first. Adding them grants only the selected school
            role; it does not send an email or grant system-wide administration.
          </p>
          <section className="ops-card">
            {members.map((m) => (
              <div className="ops-row" key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  <p>
                    {m.email} · account {m.id} · {m.role} {m.active === 0 ? '· access revoked' : ''}
                  </p>
                </div>
                {m.id !== user?.id && m.active !== 0 && (
                  <button
                    className="school-back"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Revoke this school's access for ${m.name}? Historical records will be retained.`,
                        )
                      )
                        void action(`/api/members/${m.id}`, null, 'del');
                    }}
                  >
                    Revoke school access
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
      {tab==='advanced'&&<Suspense fallback={<p>Loading advanced tools…</p>}><AdvancedWorkspace/></Suspense>}
      {tab === 'readiness' && can('admin:users') && <SetupReadiness />}
      {tab === 'review' && can('hazards:read') && <HazardReviewTools />}
      {data && tab === 'settings' && can('admin:users') && (
        <>
          <ActionForm
            title="Emergency contacts and offline instructions"
            path="/api/settings/emergency"
            onSaved={() => void load()}
            transform={(d) => ({
              contacts: [{ name: d.name, phone: d.phone }],
              procedures: d.procedures,
            })}
            fields={[
              { name: 'name', label: 'Official school emergency contact' },
              { name: 'phone', label: 'Contact number' },
              { name: 'procedures', label: 'Approved school procedures', type: 'textarea' },
            ]}
          />
          <ActionForm
            title="Attendance follow-up interval"
            path="/api/settings/followups"
            onSaved={() => void load()}
            fields={[
              {
                name: 'minutes',
                label: 'Minutes before a follow-up reminder (5–1440)',
                type: 'number',
                value: 30,
              },
            ]}
          />
          <ActionForm
            title="School reporting policy"
            path="/api/settings/reporting"
            onSaved={() => void load()}
            fields={[
              {
                name: 'allowAnonymous',
                label: 'Allow identity-hidden reports (audited privately)',
                type: 'checkbox',
              },
            ]}
          />
          <ActionForm
            title="Authorize a parent / guardian relationship"
            path="/api/guardians"
            onSaved={() => void load()}
            fields={[
              { name: 'studentId', label: 'Student school-account ID', type: 'number' },
              { name: 'guardianId', label: 'Parent school-account ID', type: 'number' },
            ]}
          />
        </>
      )}
    </div>
  );
}
function EvidenceCompare({ photos }: { photos: Row[] }) {
  const [left, setLeft] = useState(''),
    [right, setRight] = useState('');
  const before =
    photos.find((p) => String(p.id) === left) ?? photos.find((p) => p.scanId !== photos[0]?.scanId);
  const after = photos.find((p) => String(p.id) === right) ?? photos[0];
  return (
    <section className="ops-card">
      <h3>Before-and-after inspection evidence</h3>
      {!photos.length ? (
        <p>No inspection images uploaded yet.</p>
      ) : (
        <div className="ops-grid">
          {[
            { name: 'Previous', photo: before, selected: left, set: setLeft },
            { name: 'Current', photo: after, selected: right, set: setRight },
          ].map((side) => (
            <div key={side.name}>
              <label>
                {side.name}
                <select value={side.photo?.id ?? ''} onChange={(e) => side.set(e.target.value)}>
                  <option value="">Choose image…</option>
                  {photos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.caption || 'Inspection image'} · {p.createdAt}
                    </option>
                  ))}
                </select>
              </label>
              {side.photo ? (
                <img
                  className="ops-evidence"
                  src={side.photo.url}
                  alt={side.photo.caption || `${side.name} inspection evidence`}
                />
              ) : (
                <p>A second inspection image is needed for comparison.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function RosterQR({ token }: { token: string }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    QRCode.toDataURL(
      `${window.location.origin}/operations?tab=rollcall&token=${token}&school=${workspaceId() || 'original'}`,
      {
        width: 150,
        margin: 2,
      },
    )
      .then(setImage)
      .catch(() => {});
  }, [token]);
  return image ? (
    <img className="ops-id-qr" src={image} alt="Authenticated student check-in QR code" />
  ) : null;
}
function AssetForm({
  roomId,
  floorId,
  onSaved,
}: {
  roomId: string;
  floorId: number;
  onSaved: () => void;
}) {
  const [assetKind, setAssetKind] = useState('photo');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const file = d.get('file');
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (
        d.get('walkVerified') === 'on' &&
        ['spawnX', 'spawnY', 'spawnZ'].some((k) => !String(d.get(k) ?? '').trim())
      )
        throw new Error('Enter all three verified model starting coordinates.');
      const mappingText = String(d.get('mapping') ?? '').trim();
      const mapping = mappingText ? JSON.parse(mappingText) : undefined;
      const result = await api.upload(file);
      if (d.get('kind') === 'floorplan')
        await api.post(`/api/floors/${floorId}/plan`, {
          url: result.url,
          source: d.get('title'),
          width: d.get('width'),
          height: d.get('height'),
          verified: d.get('verified') === 'on',
        });
      else
        await api.post(`/api/rooms/${roomId}/assets`, {
          url: result.url,
          kind: d.get('kind'),
          title: d.get('title'),
          mapping,
          walkthrough:
            d.get('walkVerified') === 'on'
              ? {
                  verified: true,
                  spawn: [
                    Number(d.get('spawnX')),
                    Number(d.get('spawnY')),
                    Number(d.get('spawnZ')),
                  ],
                  eyeHeight: Number(d.get('eyeHeight')),
                }
              : undefined,
        });
      form.reset();
      setAssetKind('photo');
      setNotice('Asset saved to this school’s room record.');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ops-card">
      <h3>Add a room photo, floor plan or recorded 3D view</h3>
      <p>Upload an actual school asset. Choose its type to see the matching setup fields.</p>
      <form onSubmit={submit}>
        <fieldset className="ops-form-grid" disabled={busy}>
          <label>
            Asset type
            <select name="kind" value={assetKind} onChange={(e) => setAssetKind(e.target.value)}>
              <option value="photo">Photo</option>
              <option value="panorama">360° panorama</option>
              <option value="model">Prepared GLB model</option>
              <option value="floorplan">Floor-plan image</option>
            </select>
          </label>
          <label>
            {assetKind === 'floorplan' ? 'Approved plan source' : 'Asset title'}
            <input name="title" required maxLength={200} />
          </label>
          {assetKind === 'floorplan' && (
            <>
              <label>
                Floor-plan pixel width
                <input name="width" type="number" min={1} defaultValue={1000} required />
              </label>
              <label>
                Floor-plan pixel height
                <input name="height" type="number" min={1} defaultValue={620} required />
              </label>
              <label className="wide setup-confirm">
                <input name="verified" type="checkbox" />I verified the floor-plan source and
                alignment with registered rooms.
              </label>
            </>
          )}
          {assetKind === 'panorama' && (
            <p className="wide">
              Use actual equirectangular 360° room imagery, typically twice as wide as it is high.
              An ordinary photo cannot show the full room.
            </p>
          )}
          {assetKind === 'model' && (
            <details className="wide model-import-settings">
              <summary>Optional floor links and first-person navigation</summary>
              <p>
                These settings require a prepared school model. Leave them blank for simple orbit
                view. Current record: room {roomId}, floor {floorId}.
              </p>
              <div className="ops-form-grid">
                <label className="wide">
                  Prepared floor/room object mapping (JSON)
                  <textarea
                    name="mapping"
                    placeholder={JSON.stringify({
                      floors: [{ node: 'actual_floor_object_name', floorId }],
                      rooms: [{ node: 'actual_room_object_name', roomId: Number(roomId) }],
                    })}
                  />
                  <small>
                    Object names must match the actual GLB. Mapped rooms and floors must belong to
                    this building.
                  </small>
                </label>
                {['X', 'Y', 'Z'].map((axis) => (
                  <label key={axis}>
                    Starting floor {axis} (metres)
                    <input name={`spawn${axis}`} type="number" step="any" />
                  </label>
                ))}
                <label>
                  Virtual eye height (metres)
                  <input
                    name="eyeHeight"
                    type="number"
                    min={0.5}
                    max={3}
                    step="any"
                    defaultValue={1.6}
                  />
                </label>
                <label className="wide setup-confirm">
                  <input name="walkVerified" type="checkbox" />I verified the model’s metric scale
                  and starting floor position.
                </label>
              </div>
            </details>
          )}
          <label className="wide">
            {assetKind === 'model'
              ? 'GLB file, self-contained with embedded textures'
              : 'Image file'}{' '}
            (up to 10 MB)
            <input
              key={assetKind}
              name="file"
              type="file"
              required
              accept={
                assetKind === 'model' ? '.glb,model/gltf-binary' : 'image/jpeg,image/png,image/webp'
              }
            />
          </label>
          <button className="command-action blue">{busy ? 'Uploading…' : 'Save asset'}</button>
        </fieldset>
      </form>
      {notice && (
        <p role="status" className="text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
