import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
type Suggestion = { id: number; name: string; count: number };
type Match = { id: number; ref: string; title: string; similarity: number; status: string };
export function HazardReviewTools() {
  const { can } = useAuth();
  const [rule, setRule] = useState({ enabled: false, threshold: 3, severity: 'high' }),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [matches, setMatches] = useState<Match[] | null>(null),
    [hazardId, setHazardId] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    try {
      const [config, data] = await Promise.all([
        api.get<{ rule: typeof rule }>('/api/escalation/rules'),
        api.get<{ suggestions: Suggestion[] }>('/api/escalation/suggestions'),
      ]);
      setRule(config.rule);
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    if (can('alerts:publish')) void load();
  }, [can]);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/escalation/rules', rule);
      setNotice('Threshold saved. Suggestions require administrator review before publishing.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <section className="ops-card">
      <h2>Review patterns before escalating</h2>
      {can('hazards:read') && (
        <form
          className="ops-form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
              setMatches(
                (await api.get<{ matches: Match[] }>(`/api/hazards/${hazardId}/duplicates`))
                  .matches,
              );
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <label>
            Find possible duplicates of hazard ID
            <input
              type="number"
              min={1}
              required
              value={hazardId}
              onChange={(e) => setHazardId(e.target.value)}
            />
          </label>
          <button className="command-action blue">Find similar reports</button>
        </form>
      )}
      {matches?.map((match) => (
        <a className="ops-row" key={match.id} href={`/hazards?open=${match.id}`}>
          <strong>
            {match.ref} · {match.title}
          </strong>
          <span>
            {match.similarity}% text/location similarity · {match.status}
          </span>
        </a>
      ))}
      {matches?.length === 0 && (
        <p>No similar unresolved reports were found. This does not rule out duplicates.</p>
      )}
      <p>
        Similarity uses recorded text and location. It does not merge records or verify a finding.
      </p>
      {can('admin:users') && (
        <form className="ops-form-grid" onSubmit={save}>
          <label>
            Minimum verified hazards in one building
            <input
              type="number"
              min={1}
              max={1000}
              value={rule.threshold}
              onChange={(e) => setRule({ ...rule, threshold: Number(e.target.value) })}
              required
            />
          </label>
          <label>
            Severity at or above
            <select
              value={rule.severity}
              onChange={(e) => setRule({ ...rule, severity: e.target.value })}
            >
              {['critical', 'high', 'medium'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="wide setup-confirm">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
            />
            Enable threshold-based review suggestions
          </label>
          <button className="command-action blue">Save review rule</button>
        </form>
      )}
      {suggestions.map((row) => (
        <div className="ops-notice" key={row.id}>
          <strong>{row.name}</strong>
          <p>
            {row.count} verified unresolved hazards meet the school’s threshold. Review conditions
            and decide whether an official alert is warranted.
          </p>
          <a href="/alerts" className="school-back">
            Review official announcements
          </a>
        </div>
      ))}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
