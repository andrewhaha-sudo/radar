import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { downloadText, type Row } from './tools';
export function ReportBuilder() {
  const { can } = useAuth();
  const [dataset, setDataset] = useState('hazards'),
    [groups, setGroups] = useState<string[]>(['severity']),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [report, setReport] = useState<Row | null>(null),
    [recurrence, setRecurrence] = useState<Row[][]>([]),
    [error, setError] = useState('');
  const fields: Record<string, string[]> = {
    hazards: ['building', 'room', 'severity', 'status', 'category', 'month'],
    inspections: ['building', 'room', 'status', 'month'],
    incidents: ['severity', 'status', 'kind', 'month'],
  };
  useEffect(() => {
    api
      .get<{ groups: Row[][] }>('/api/advanced/recurrence')
      .then((d) => setRecurrence(d.groups))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  return (
    <>
      <section className="ops-card">
        <h2>Custom safety report</h2>
        <p>
          Aggregate recorded school data by up to three fields. Missing resolution timestamps remain
          unavailable; no response times are invented.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
              setReport(
                await api.post('/api/advanced/reports', {
                  dataset,
                  groupBy: groups,
                  from: from ? new Date(from).toISOString() : null,
                  to: to ? new Date(to).toISOString() : null,
                }),
              );
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <div className="ops-form-grid">
            <label>
              Dataset
              <select
                value={dataset}
                onChange={(e) => {
                  setDataset(e.target.value);
                  setGroups([fields[e.target.value][0]]);
                }}
              >
                <option value="hazards">Hazards</option>
                {can('scan:read') && <option value="inspections">Inspections</option>}
                {can('incidents:read') && <option value="incidents">Incidents</option>}
              </select>
            </label>
            <label>
              From
              <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <fieldset className="wide advanced-checkboxes">
              <legend>Group by (up to 3)</legend>
              {fields[dataset].map((field) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={groups.includes(field)}
                    disabled={!groups.includes(field) && groups.length >= 3}
                    onChange={(e) =>
                      setGroups(
                        e.target.checked ? [...groups, field] : groups.filter((f) => f !== field),
                      )
                    }
                  />
                  {field}
                </label>
              ))}
            </fieldset>
            <button className="command-action blue" disabled={!groups.length}>
              Build report
            </button>
          </div>
        </form>
        {report && (
          <>
            <p>
              {report.sourceRecords} source records · {report.from} to {report.to}
            </p>
            <button
              className="school-back"
              onClick={() => downloadText('radar-custom-report.csv', report.csv)}
            >
              Export report CSV
            </button>
            <div className="advanced-table">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Records</th>
                    <th>Resolved</th>
                    <th>Mean resolution hours</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row: Row, i: number) => (
                    <tr key={i}>
                      <td>
                        {Object.entries(row.group)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </td>
                      <td>{row.count}</td>
                      <td>{row.resolved}</td>
                      <td>{row.averageResolutionHours ?? 'No samples'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </section>
      <section className="ops-card">
        <h3>Repeated recorded conditions</h3>
        <p>
          These groups may include duplicate reports. Review dates, evidence and completed
          corrections before deciding a condition has recurred.
        </p>
        {recurrence.map((rows, i) => (
          <details key={i}>
            <summary>
              {rows[0].roomName ?? 'Unmapped location'} · {rows[0].category} · {rows.length} records
            </summary>
            {rows.map((row) => (
              <p key={row.id}>
                <a href={`/hazards?open=${row.id}`}>
                  {row.ref} · {row.title}
                </a>{' '}
                · {row.createdAt} · {row.status}
              </p>
            ))}
          </details>
        ))}
        {!recurrence.length && <p>No repeated record groups found.</p>}
      </section>
    </>
  );
}
