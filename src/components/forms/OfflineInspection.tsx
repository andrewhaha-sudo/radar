import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useOffline } from '@/context/OfflineContext';
import { readDataPackDocument } from '@/lib/offline';
import { saveOfflineFile, deleteOfflineFile } from '@/lib/offline-files';
import { errorMessage } from '@/lib/api';
import type { Room } from '@/lib/types';
export function OfflineInspection() {
  const { can } = useAuth();
  const { enqueue } = useOffline();
  const [rooms, setRooms] = useState<Room[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    readDataPackDocument<{ rooms: Room[] }>('/api/emergency/pack')
      .then((pack) => setRooms(pack?.rooms ?? []))
      .catch(() => {});
  }, []);
  if (!can('scan:write') && !can('hazards:write') && !can('hazards:report')) return null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setBusy(true);
    setError('');
    setNotice('');
    const saved: string[] = [];
    try {
      const scan = d.get('kind') === 'scan-draft';
      if (scan && !d.get('roomId'))
        throw new Error('Choose a downloaded room for the inspection draft.');
      if (!scan && !String(d.get('title') ?? '').trim()) throw new Error('Enter a report title.');
      const attachments = [];
      for (const file of d.getAll('photos'))
        if (file instanceof File && file.size) {
          const id = await saveOfflineFile(file);
          saved.push(id);
          attachments.push({ id, caption: 'Evidence captured for an offline record' });
        }
      const body = scan
        ? { roomId: d.get('roomId'), notes: d.get('notes') }
        : {
            title: d.get('title'),
            description: d.get('notes'),
            roomId: d.get('roomId') || null,
            locationNote: d.get('locationNote'),
            severity: d.get('severity') || 'low',
            category: 'other',
          };
      enqueue({
        kind: scan ? 'scan-draft' : 'hazard',
        label: scan ? 'Offline inspection draft' : String(d.get('title')),
        path: scan ? '/api/scans' : '/api/hazards',
        method: 'POST',
        body,
        attachments,
      });
      form.reset();
      setNotice(
        'Saved on this device. Nothing has been delivered. Reconnect, review the outbox, and choose Send queued. Inspection drafts still require online review and submission.',
      );
    } catch (err) {
      for (const id of saved) void deleteOfflineFile(id).catch(() => {});
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ops-card">
      <h3>Save an eligible report or inspection draft offline</h3>
      <p>
        Photo evidence is saved in this account and school's device storage. Reconnecting never
        silently submits it. SOS requests and official alerts cannot be queued as if they were
        delivered.
      </p>
      <form onSubmit={submit}>
        <fieldset className="ops-form-grid" disabled={busy}>
          <label>
            Record type
            <select name="kind">
              <option value="hazard">Hazard report</option>
              {can('scan:write') && <option value="scan-draft">Inspection draft</option>}
            </select>
          </label>
          <label>
            Room from downloaded plan
            <select name="roomId">
              <option value="">No room selected</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Report title
            <input name="title" placeholder="Required for a hazard report" />
          </label>
          <label>
            Proposed severity
            <select name="severity">
              {['low', 'medium', 'high', 'critical', 'info'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Location description
            <input name="locationNote" />
          </label>
          <label className="wide">
            Inspection notes / observation description
            <textarea name="notes" required />
          </label>
          <label className="wide">
            Photos (JPEG, PNG or WebP, up to 10 MB each)
            <input
              type="file"
              name="photos"
              accept="image/jpeg,image/png,image/webp"
              multiple
              capture="environment"
            />
          </label>
          <button className="command-action blue">
            {busy ? 'Saving on device…' : 'Save to this device’s outbox'}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
