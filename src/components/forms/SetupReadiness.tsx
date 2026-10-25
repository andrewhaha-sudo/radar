import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Settings2, ArrowUpRight, RefreshCw } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
type Check = {
  id: string;
  name: string;
  state: 'ready' | 'configured' | 'missing';
  detail: string;
  href: string;
};
export function SetupReadiness() {
  const [checks, setChecks] = useState<Check[]>([]),
    [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function load() {
    setBusy(true);
    setError('');
    try {
      const result = await api.get<{ checks: Check[]; note: string }>('/api/setup/readiness');
      setChecks(result.checks);
      setNote(result.note);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="setup-readiness">
      <div className="setup-hero">
        <span className="command-feature-icon">
          <Settings2 size={28} />
        </span>
        <div>
          <p className="command-eyebrow">YOUR SCHOOL · LAUNCH CHECKLIST</p>
          <h2>Set up once. Know what’s connected.</h2>
          <p>
            Start with school location and real campus records, then connect the services your
            school needs.
          </p>
        </div>
        <button
          className="command-icon-button"
          aria-label="Refresh setup status"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="setup-check-grid">
        {checks.map((check) => (
          <article className="ops-card setup-check" key={check.id}>
            <div className="setup-check-title">
              <CheckCircle2 size={20} />
              <span className={`setup-status ${check.state}`}>
                {check.state === 'missing'
                  ? 'Needs setup'
                  : check.state === 'configured'
                    ? 'Needs live test'
                    : 'Recorded'}
              </span>
            </div>
            <h3>{check.name}</h3>
            <p>{check.detail}</p>
            <button className="school-back" onClick={() => navigate(check.href)}>
              Open setup <ArrowUpRight size={15} />
            </button>
          </article>
        ))}
      </div>
      <p className="ops-footnote">{note}</p>
      <div className="ops-card">
        <h3>Publish on Vercel</h3>
        <p>
          Import the design branch from GitHub, add private server environment variables, then
          deploy. Supabase stores accounts, school records and files; Vercel serves the app and API.
        </p>
        <a
          className="school-back"
          href="https://github.com/andrewhaha-sudo/radar/blob/design/radar-command-dashboard/docs/VERCEL.md"
          target="_blank"
          rel="noreferrer"
        >
          Open deployment guide <ArrowUpRight size={15} />
        </a>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
