import { GisHazardMapping } from './GisHazardMapping';
import { Prerequisite } from '@/components/workspace/Prerequisite';
import { PhotoRouteStudio } from './PhotoRouteStudio';
import { TaskLibrary } from '@/components/workspace/TaskLibrary';
import { ArrowLeft } from 'lucide-react';
import { specialistTasks } from '@/components/workspace/task-catalog';
import { useSearchParams } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import { CampusVideoSurvey } from './CampusVideoSurvey';
import { OccupancyReadings } from './OccupancyReadings';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { RosterImport } from './RosterImport';
import { ReportBuilder } from './ReportBuilder';
import { OfficialLayers } from './OfficialLayers';
import { ForegroundLocation } from './ForegroundLocation';
import { DevicePanel } from './DevicePanel';
import { CalibrationPanel } from './CalibrationPanel';
import { MeasuredModelBuilder } from './MeasuredModelBuilder';
import { PeerRelay } from './PeerRelay';
import { TestingPanel } from './TestingPanel';
import { ToolForm, type Row } from './tools';
export function AdvancedWorkspace() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tool') || 'library';
  function setTab(id: string) {
    const next = new URLSearchParams(params);
    next.set('tab', 'advanced');
    if (id !== 'paths') {
      next.delete('surveyId');
      next.delete('frame');
    }
    if (id === 'library') next.delete('tool');
    else next.set('tool', id);
    setParams(next);
  }
  const [data, setData] = useState<Row | null>(null),
    [buildings, setBuildings] = useState<Row[]>([]),
    [policy, setPolicy] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  async function load() {
    setError('');
    try {
      setData(await api.get('/api/operations'));
      if (can('buildings:read')) setBuildings((await api.get<Row>('/api/map')).buildings);
      if (can('alerts:publish')) setPolicy(await api.get('/api/advanced/delivery-policy'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    if (tab !== 'library') void load();
  }, [can, tab]);
  const tasks = specialistTasks(can);
  const current = tasks.find((task) => task.id === tab);
  if (!current)
    return (
      <TaskLibrary
        tasks={tasks}
        onSelect={setTab}
        storageKey="specialist"
        title="Make more of your campus."
        description="Explore imagery, plan improvements, or connect the services you actually need."
      />
    );
  return (
    <div className="advanced-workspace">
      <div className="workspace-context specialist-context">
        <button className="desk-back" onClick={() => setTab('library')}>
          <ArrowLeft size={16} /> Explore tools
        </button>
        <div>
          <span>{current.group}</span>
          <h2>{current.title}</h2>
          <p>{current.description}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {tab === 'paths' && can('evacuation:read') && <PhotoRouteStudio />}
      {tab === 'video' && can('buildings:read') && (
        <CampusVideoSurvey buildings={buildings} rooms={data?.rooms ?? []} />
      )}
      {tab === 'testing' && can('admin:users') && <TestingPanel />}
      {tab === 'imports' && can('rollcall:write') && <RosterImport />}
      {tab === 'reports' && can('hazards:read') && <ReportBuilder />}
      {tab === 'gis' && can('map:read') && <GisHazardMapping />}
      {tab === 'layers' && can('map:read') && <OfficialLayers />}
      {tab === 'models' &&
        can('buildings:read') &&
        (!loaded && !error ? (
          <p role="status">Loading campus spaces…</p>
        ) : loaded && !error && !buildings.length ? (
          <Prerequisite
            title="Start with real spaces."
            description="A measured campus view needs registered buildings, rooms and surveyed floor plans. Add those first, then build a footprint model here."
            to="/buildings"
            action="Open building directory"
          />
        ) : (
          <MeasuredModelBuilder buildings={buildings} />
        ))}{' '}
      {tab === 'calibration' && can('scan:write') && <CalibrationPanel />}
      {tab === 'occupancy' && can('evacuation:read') && <OccupancyReadings />}
      {tab === 'devices' &&
        can('admin:users') &&
        (!loaded && !error ? (
          <p role="status">Loading campus spaces…</p>
        ) : loaded && !error && !data?.assembly?.length && !data?.rooms?.length ? (
          <Prerequisite
            title="Give the reading a place to belong."
            description="Register a room or assembly area before connecting a count device. Every reading needs a real target."
            to="/buildings"
            action="Set up campus spaces"
          />
        ) : (
          <DevicePanel points={data?.assembly ?? []} rooms={data?.rooms ?? []} />
        ))}{' '}
      {tab === 'location' && <ForegroundLocation incidents={data?.sos ?? []} />}{' '}
      {tab === 'relay' && <PeerRelay />}
      {tab === 'delivery' && can('alerts:publish') && (
        <>
          <section className="ops-card">
            <h2>Notification fallback and SOS SMS policy</h2>
            <p>
              Fallback applies only when push was unavailable or failed before provider acceptance.
              It does not infer that an accepted push reached the device. Every SMS recipient must
              opt in; provider charges may apply.
            </p>
            <p>
              Push-to-SMS fallback: {policy?.policy.fallbackSms ? 'enabled' : 'off'} · SOS SMS to
              consented school responders: {policy?.policy.sosSms ? 'enabled' : 'off'}
            </p>
            <p>
              Training mode blocks external delivery. Queued/processed jobs do not prove message
              delivery; review provider receipts under Feeds & delivery.
            </p>
            {policy?.sosJobs.map((row: Row) => (
              <p key={row.id}>
                Incident {row.incidentId} · responder account {row.userId} · {row.state}
              </p>
            ))}
          </section>
          <ToolForm
            title="Process queued notification jobs"
            path="/api/advanced/delivery/drain"
            fields={[]}
            onSaved={() => void load()}
          />
          {can('admin:users') && (
            <ToolForm
              title="Update school delivery policy"
              path="/api/advanced/delivery-policy"
              fields={[
                {
                  name: 'fallbackSms',
                  label: 'Enable SMS fallback when push is unavailable/failed',
                  type: 'checkbox',
                },
                {
                  name: 'sosSms',
                  label: 'Enable SOS SMS jobs for consented school responders',
                  type: 'checkbox',
                },
              ]}
              onSaved={() => void load()}
            />
          )}
        </>
      )}
    </div>
  );
}
