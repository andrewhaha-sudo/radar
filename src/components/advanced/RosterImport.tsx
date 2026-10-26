import { Prerequisite } from '@/components/workspace/Prerequisite';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { downloadText, type Row } from './tools';
export function RosterImport() {
  const [classes, setClasses] = useState<Row[]>([]),
    [classId, setClassId] = useState(''),
    [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api
      .get<{ classes: Row[] }>('/api/rollcall')
      .then((d) => setClasses(d.classes))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoaded(true));
  }, []);
  async function run(commit: boolean) {
    setBusy(true);
    setError('');
    try {
      setPreview(
        await api.post(`/api/advanced/rosters/${classId}/import`, {
          csv,
          commit,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (!loaded && !error)
    return (
      <p role="status" className="studio-caption">
        Loading assigned classes…
      </p>
    );
  if (loaded && !error && !classes.length)
    return (
      <Prerequisite
        title="Create a class before adding its people."
        description="There are no assigned classes available for import. A school administrator can register a class and assign its teacher, then you can preview a roster here."
        to="/operations?tab=rollcall"
        action="Open class roll call"
      />
    );
  return (
    <section className="ops-card">
      <h2>Import a class roster</h2>
      <p>
        CSV columns: name, optional email, optional externalRef. Linked email must belong to an
        active student in this school. Imports append people without changing existing attendance.
      </p>
      <button
        className="school-back"
        onClick={() => downloadText('radar-roster-template.csv', 'name,email,externalRef\r\n')}
      >
        Download empty CSV template
      </button>
      <div className="ops-form-grid">
        <label>
          Assigned class
          <select
            aria-label="Import class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Choose class…</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 1024 * 1024) {
                  setError('Use a CSV under 1 MB.');
                  return;
                }
                setCsv(await file.text());
                setPreview(null);
              }
            }}
          />
        </label>
        <label className="wide">
          CSV contents
          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
            placeholder="name,email,externalRef"
          />
        </label>
        <button
          className="command-action blue"
          disabled={!classId || !csv || busy}
          onClick={() => void run(false)}
        >
          Preview import
        </button>
        {preview?.dryRun && (
          <button className="command-action blue" disabled={busy} onClick={() => void run(true)}>
            Confirm reviewed import
          </button>
        )}
      </div>
      {preview && (
        <>
          <p role="status">
            {preview.dryRun ? 'Preview only; nothing imported.' : `${preview.added} people added.`}
          </p>
          <div className="advanced-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Account link</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row: Row, i: number) => (
                  <tr key={i}>
                    <td>{row.name}</td>
                    <td>{row.email || 'Manual roster entry'}</td>
                    <td>{row.action.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!classes.length && (
        <p>Create a class and assign its teacher under Individual roll call first.</p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
