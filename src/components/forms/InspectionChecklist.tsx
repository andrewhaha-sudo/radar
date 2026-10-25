import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
export function InspectionChecklist({ scanId, onSaved }: { scanId: number; onSaved: () => void }) {
  const areas = ['entrance', 'exits', 'walls', 'ceiling', 'electrical', 'equipment'];
  const [checks, setChecks] = useState<Record<string, boolean>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="ops-card">
      <h3>No visible findings? Complete the inspection checklist</h3>
      <p>
        Review every required area and attach at least one photo. Reject unsupported suggestions
        before confirming. This records a visual inspection, not structural or electrical
        certification.
      </p>
      {areas.map((area) => (
        <label key={area} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={checks[area] ?? false}
            onChange={(e) => setChecks({ ...checks, [area]: e.target.checked })}
          />
          Reviewed {area}
        </label>
      ))}
      <button
        className="command-action blue"
        disabled={busy || !areas.every((a) => checks[a])}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await api.post(`/api/scans/${scanId}/checklist`, {
              checklist: checks,
              noFindings: true,
            });
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Saving…' : 'Record no visible findings'}
      </button>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
