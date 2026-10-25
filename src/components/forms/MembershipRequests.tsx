import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
type Request = {
  id: number;
  name: string;
  email: string;
  requestedRole: string;
  note: string;
  createdAt: string;
};
export function MembershipRequests({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<Request[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<number | null>(null);
  async function load() {
    try {
      setRows((await api.get<{ requests: Request[] }>('/api/membership/requests')).requests);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function decide(row: Request, state: string, role: string) {
    if (
      !window.confirm(
        `${state === 'approved' ? 'Approve' : 'Decline'} ${row.name}’s school access request${state === 'approved' ? ` as ${role}` : ''}? Verify identity through your school’s usual process first.`,
      )
    )
      return;
    setBusy(row.id);
    setError('');
    try {
      await api.post(`/api/membership/requests/${row.id}/decision`, { state, role });
      await load();
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="ops-card">
      <h2>School access requests</h2>
      <p>Verify the person before approval. A request never grants access automatically.</p>
      {!rows.length && (
        <div className="setup-empty">
          <strong>No pending requests</strong>
          <p>
            Ask people to create an account, choose this school, and select Request school access.
          </p>
        </div>
      )}
      {rows.map((row) => (
        <div className="membership-request" key={row.id}>
          <div>
            <strong>{row.name}</strong>
            <p>
              {row.email} · requested {row.requestedRole}
            </p>
            <p>{row.note || 'No message supplied.'}</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void decide(row, 'approved', String(new FormData(e.currentTarget).get('role')));
            }}
          >
            <label>
              Approve as
              <select name="role" defaultValue={row.requestedRole}>
                {['student', 'parent', 'teacher', 'responder', 'inspector'].map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
            <button className="command-action blue" disabled={busy !== null}>
              Approve
            </button>
            <button
              type="button"
              className="school-back"
              disabled={busy !== null}
              onClick={() => void decide(row, 'rejected', row.requestedRole)}
            >
              Decline
            </button>
          </form>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
