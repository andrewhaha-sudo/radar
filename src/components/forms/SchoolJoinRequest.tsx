import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
type Request = { workspaceId: string; state: string; requestedRole: string; decisionNote: string };
export function SchoolJoinRequest({ schoolId }: { schoolId: string }) {
  const [requests, setRequests] = useState<Request[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    try {
      setRequests((await api.get<{ requests: Request[] }>('/api/schools/requests/mine')).requests);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    void load();
  }, [schoolId]);
  const request = requests.find((r) => r.workspaceId === schoolId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{ message: string }>(`/api/schools/${schoolId}/join`, fields);
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ops-card join-school-card">
      <h2>Request access to this school</h2>
      <p>
        Create an account using Gmail or another valid email. School staff review your identity and
        requested role before granting access.
      </p>
      {request && (
        <p className="ops-notice">
          Request: {request.state.replaceAll('_', ' ')} · {request.requestedRole}
          {request.decisionNote ? ` · ${request.decisionNote}` : ''}
        </p>
      )}
      {request?.state !== 'pending' && request?.state !== 'approved' && (
        <form onSubmit={submit}>
          <fieldset disabled={busy || !navigator.onLine} className="ops-form-grid">
            <label>
              Your role
              <select name="role" aria-label="Your role">
                {['student', 'parent', 'teacher', 'responder', 'inspector'].map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
            <label>
              Message to school staff
              <input
                name="note"
                maxLength={1000}
                placeholder="Class, section or school connection; avoid sensitive IDs"
              />
            </label>
            <button className="command-action blue">
              {busy ? 'Sending request…' : 'Request school access'}
            </button>
          </fieldset>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
