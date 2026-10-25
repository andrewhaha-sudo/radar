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
  const [tab, setTab] = useState('relay'),
    [data, setData] = useState<Row | null>(null),
    [buildings, setBuildings] = useState<Row[]>([]),
    [policy, setPolicy] = useState<Row | null>(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setData(await api.get('/api/operations'));
      if (can('buildings:read')) setBuildings((await api.get<Row>('/api/map')).buildings);
      if (can('alerts:publish')) setPolicy(await api.get('/api/advanced/delivery-policy'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    void load();
  }, [can]);
  const tabs = [
    ['video', 'Campus video survey', can('buildings:read')],
    ['testing', 'Test notebook', can('admin:users')],
    ['imports', 'Roster import', can('rollcall:write')],
    ['reports', 'Custom reports', can('hazards:read')],
    ['layers', 'Official datasets', can('map:read')],
    ['models', 'Measured model builder', can('buildings:read')],
    ['calibration', 'Calibrated pins', can('scan:write')],
    ['occupancy', 'Occupancy readings', can('evacuation:read')],
    ['devices', 'Count devices', can('admin:users')],
    ['location', 'Foreground GPS', true],
    ['relay', 'Peer relay', true],
    ['delivery', 'Delivery policy', can('alerts:publish')],
  ];
  return (
    <div className="advanced-workspace">
      <nav className="advanced-tabs" aria-label="Advanced tools">
        {tabs
          .filter((row) => row[2])
          .map((row) => (
            <button
              key={String(row[0])}
              className={tab === row[0] ? 'active' : ''}
              onClick={() => setTab(String(row[0]))}
            >
              {row[1]}
            </button>
          ))}
      </nav>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {tab === 'video' && can('buildings:read') && (
        <CampusVideoSurvey buildings={buildings} rooms={data?.rooms ?? []} />
      )}
      {tab === 'testing' && can('admin:users') && <TestingPanel />}
      {tab === 'imports' && can('rollcall:write') && <RosterImport />}
      {tab === 'reports' && can('hazards:read') && <ReportBuilder />}
      {tab === 'layers' && can('map:read') && <OfficialLayers />}
      {tab === 'models' && can('buildings:read') && (
        <MeasuredModelBuilder buildings={buildings} />
      )}{' '}
      {tab === 'calibration' && can('scan:write') && <CalibrationPanel />}
      {tab === 'occupancy' && can('evacuation:read') && <OccupancyReadings />}
      {tab === 'devices' && can('admin:users') && (
        <DevicePanel points={data?.assembly ?? []} rooms={data?.rooms ?? []} />
      )}{' '}
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
