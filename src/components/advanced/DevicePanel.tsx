import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { ToolForm, type Row } from './tools';
export function DevicePanel({ points, rooms = [] }: { points: Row[]; rooms?: Row[] }) {
  const [target, setTarget] = useState('assembly');
  const [devices, setDevices] = useState<Row[]>([]),
    [credential, setCredential] = useState<Row | null>(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setDevices((await api.get<{ devices: Row[] }>('/api/advanced/devices')).devices);
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
        <h2>Aggregate occupancy devices</h2>
        <p>
          Register a real device that reports counts only. No faces, camera images or personal
          tracking are collected by this endpoint. A registered source still needs on-site accuracy
          testing.
        </p>
        {devices.map((row) => (
          <div className="ops-row" key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <p>
                ID {row.id} · {row.active ? 'active' : 'revoked'} · last reading{' '}
                {row.lastSeenAt ?? 'never'}
              </p>
            </div>
            {row.active === 1 && (
              <button
                className="school-back"
                onClick={async () => {
                  if (!confirm('Revoke this device token?')) return;
                  try {
                    await api.del(`/api/advanced/devices/${row.id}`);
                    await load();
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Revoke token
              </button>
            )}
          </div>
        ))}
        {!devices.length && (
          <p>No devices registered. Manual timestamped assembly counts remain available.</p>
        )}
        {credential && (
          <div className="ops-notice">
            <strong>Copy the device token once</strong>
            <p>Device ID: {credential.id}</p>
            <code className="advanced-secret">{credential.token}</code>
            <button className="school-back" onClick={() => setCredential(null)}>
              Hide token
            </button>
            <p>
              Keep it in the device’s private settings. POST /api/device/occupancy with
              Authorization: Bearer TOKEN and JSON deviceId, count, observedAt (ISO timestamp),
              nonce (unique 12+ characters). TLS is required on the published app.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </section>
      <section className="ops-card">
        <label>
          Device target
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="assembly">Assembly point</option>
            <option value="room">Room</option>
          </select>
        </label>
      </section>
      <ToolForm
        key={target}
        title="Register a count device"
        path="/api/advanced/devices"
        fields={[
          { name: 'name', label: 'Device name' },
          {
            name: target === 'room' ? 'roomId' : 'assemblyPointId',
            label: target === 'room' ? 'Registered room' : 'Registered assembly point',
            options: (target === 'room' ? rooms : points).map((row) => ({
              value: row.id,
              label: row.name,
            })),
          },
        ]}
        onSaved={(row) => {
          setCredential(row);
          void load();
        }}
      />
    </>
  );
}
