import { useState, type FormEvent } from 'react';
import { Plus, Building2, Layers, DoorOpen } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Building, Floor } from '@/lib/types';

export function CampusSetup({ buildings, floors, onSaved }: {buildings: Building[]; floors: Floor[]; onSaved: () => Promise<void>}) {
  const [kind, setKind] = useState<'building' | 'floor' | 'room'>('building');
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const url = kind === 'building' ? '/api/buildings' : kind === 'floor' ? `/api/buildings/${data.buildingId}/floors` : `/api/floors/${data.floorId}/rooms`;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.post(url, data);
      form.reset();
      await onSaved();
      setMessage(`${kind.charAt(0).toUpperCase() + kind.slice(1)} added.`);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className="command-panel campus-setup"><button className="campus-setup-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Plus size={18}/><strong>Add buildings, floors &amp; rooms</strong><span>{expanded ? 'Close' : 'Open'}</span></button>{expanded && <div className="campus-setup-body"><div className="campus-setup-tabs">{[{id:'building',label:'Building',icon:Building2},{id:'floor',label:'Floor',icon:Layers},{id:'room',label:'Room',icon:DoorOpen}].map(t => <button key={t.id} className={kind === t.id ? 'selected' : ''} onClick={() => {setKind(t.id as typeof kind); setError(''); setMessage('');}}><t.icon size={16}/>{t.label}</button>)}</div>
      {error && <p role="alert" className="text-danger">{error}</p>}{message && <p role="status" className="text-success">{message}</p>}
      <form key={kind} onSubmit={submit} className="campus-setup-form"><fieldset disabled={busy}>
        {kind === 'building' && <><label>Building name<input name="name" required maxLength={120} placeholder="e.g. Main Building"/></label><label>Building code<input name="code" required maxLength={30} placeholder="e.g. MAIN"/></label><label>Latitude<input name="lat" type="number" step="any" min={-90} max={90} required placeholder="Actual building latitude"/></label><label>Longitude<input name="lng" type="number" step="any" min={-180} max={180} required placeholder="Actual building longitude"/></label><label className="campus-setup-wide">Address<input name="address" maxLength={2000} placeholder="Building street address (optional)"/></label><p className="campus-setup-wide">Use coordinates verified on a map or at the campus. The first building sets the campus map’s initial center.</p></>}
        {kind === 'floor' && <><label>Building<select aria-label="Building" name="buildingId" required defaultValue=""><option value="" disabled>Select building</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Floor name<input name="name" required maxLength={120} placeholder="e.g. Ground Floor"/></label><label>Floor level<input name="level" type="number" min={-10} max={150} step={1} required placeholder="e.g. 1"/></label>{!buildings.length && <p>Add a building first.</p>}</>}
        {kind === 'room' && <><label>Floor<select aria-label="Floor" name="floorId" required defaultValue=""><option value="" disabled>Select floor</option>{floors.map(f => <option key={f.id} value={f.id}>{buildings.find(b => b.id === f.buildingId)?.name} · {f.name}</option>)}</select></label><label>Room code<input name="code" maxLength={30} required placeholder="e.g. 101"/></label><label>Room name<input name="name" maxLength={120} required placeholder="e.g. Grade 11 Classroom"/></label><label>Room type<select name="type">{['classroom','laboratory','office','gymnasium','library','cafeteria','circulation','service','restroom'].map(t => <option key={t}>{t}</option>)}</select></label><label>Capacity<input name="capacity" type="number" min={0} max={100000} step={1} defaultValue={30} required/></label>{!floors.length && <p>Add a building and floor first.</p>}</>}
        <button className="command-action blue campus-setup-wide" type="submit" disabled={busy || (kind === 'floor' && !buildings.length) || (kind === 'room' && !floors.length)}>{busy ? 'Saving…' : `Add ${kind}`}</button>
      </fieldset></form></div>}</section>;
}
