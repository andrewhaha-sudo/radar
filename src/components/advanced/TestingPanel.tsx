import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { ToolForm, downloadText, type Row } from './tools';
export function TestingPanel() {
  const [data, setData] = useState<Row | null>(null),
    [permissions, setPermissions] = useState<Row>({}),
    [error, setError] = useState(''),
    [deviceNote, setDeviceNote] = useState('');
  async function load() {
    try {
      setData(await api.get('/api/advanced/testing'));
      const result: Row = {
        online: navigator.onLine,
        secureContext: window.isSecureContext,
        webRTC: 'RTCPeerConnection' in window,
        camera: 'mediaDevices' in navigator,
        gps: 'geolocation' in navigator,
        serviceWorker: 'serviceWorker' in navigator,
      };
      for (const name of ['camera', 'geolocation', 'notifications'])
        try {
          result[name + 'Permission'] = (
            await navigator.permissions.query({ name: name as PermissionName })
          ).state;
        } catch {
          result[name + 'Permission'] = 'not queryable';
        }
      setPermissions(result);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <section className="ops-card">
        <h2>Testing and configuration notebook</h2>
        <p>
          Use npm run test:lab for an isolated local training database with external sending
          blocked. Production configuration stays in private server settings. This page records
          observed acceptance outcomes; it does not mark a service passed merely because a key
          exists.
        </p>
        <div className="ops-grid">
          <div>
            <h3>Server prerequisites</h3>
            {Object.entries(data?.checks ?? {}).map(([key, value]) => (
              <p key={key}>
                {key}: {value ? 'present / responding' : 'missing / unavailable'}
              </p>
            ))}
            <p>Training environment: {data?.training ? 'YES — external delivery blocked' : 'no'}</p>
          </div>
          <div>
            <h3>This browser</h3>
            {Object.entries(permissions).map(([key, value]) => (
              <p key={key}>
                {key}: {String(value)}
              </p>
            ))}
          </div>
        </div>
        <div className="ops-form-grid">
          <button
            className="command-action blue"
            onClick={async () => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: false,
                });
                stream.getTracks().forEach((track) => track.stop());
                setDeviceNote(
                  'Camera opened and immediately closed. No photo was recorded or uploaded.',
                );
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            Test camera permission
          </button>
          <button
            className="command-action blue"
            onClick={() => {
              navigator.geolocation?.getCurrentPosition(
                (p) =>
                  setDeviceNote(
                    `GPS sample available, reported accuracy ${Math.round(p.coords.accuracy)} m. Coordinates were not saved.`,
                  ),
                () => setError('GPS sample unavailable or permission denied.'),
                { timeout: 15000 },
              );
            }}
          >
            Test GPS without storing position
          </button>
          <button
            className="school-back"
            onClick={() =>
              downloadText(
                'radar-testing-notebook.json',
                JSON.stringify(
                  {
                    exportedAt: new Date().toISOString(),
                    browser: permissions,
                    ...data,
                  },
                  null,
                  2,
                ),
                'application/json',
              )
            }
          >
            Export notebook
          </button>
          <button className="school-back" onClick={() => void load()}>
            Refresh status
          </button>
        </div>
        {deviceNote && <p role="status">{deviceNote}</p>}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </section>
      <ToolForm
        title="Record an actual acceptance test"
        path="/api/advanced/testing/results"
        fields={[
          {
            name: 'testKey',
            label: 'Capability tested',
            options: [
              'camera',
              'gps',
              'push',
              'sms',
              'email',
              'offline',
              'restore',
              'load',
              'security',
              'relay',
              'sensor',
              'model',
              'feed',
            ].map((value) => ({ value, label: value })),
          },
          {
            name: 'state',
            label: 'Observed outcome',
            options: ['passed', 'failed', 'blocked'].map((value) => ({
              value,
              label: value,
            })),
          },
          {
            name: 'note',
            label: 'Device, steps, actual evidence and limitations (never enter secrets)',
            type: 'textarea',
          },
        ]}
        onSaved={() => void load()}
      />
      <section className="ops-card">
        <h3>Recorded outcomes</h3>
        {data?.results.map((row: Row) => (
          <div className="ops-row" key={row.id}>
            <div>
              <strong>
                {row.testKey} · {row.state}
              </strong>
              <p>{row.note}</p>
              <small>
                {row.tester} · {row.createdAt} · manual observation
              </small>
            </div>
          </div>
        ))}
        {data?.results.length === 0 && <p>No acceptance evidence recorded yet.</p>}
      </section>
    </>
  );
}
