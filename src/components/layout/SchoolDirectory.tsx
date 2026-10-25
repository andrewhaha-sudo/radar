import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, ChevronDown, Search, X, MapPin, ArrowLeft, School, ShieldCheck } from 'lucide-react';
import entries from '@/data/camarines-norte-schools.json';
import { useAuth } from '@/context/AuthContext';

type DirectorySchool = typeof entries[number];
type DirectoryContext = { selected: DirectorySchool | null; select: (school: DirectorySchool | null) => void; open: () => void };
const Context = createContext<DirectoryContext | null>(null);
function useDirectory() {
  const value = useContext(Context);
  if (!value) throw new Error('School directory provider missing');
  return value;
}
export function SchoolDirectoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const storageKey = `radar:directory-school:${user?.id ?? 'guest'}`;
  const [selected, setSelected] = useState<DirectorySchool | null>(() => {
    try { const id = localStorage.getItem(storageKey); return entries.find(s => s.id === id) ?? null; }
    catch { return null; }
  });
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [sector, setSector] = useState('');
  const municipalities = useMemo(() => [...new Set(entries.map(s => s.municipality))].sort(), []);
  const results = useMemo(() => entries.filter(s => (!municipality || s.municipality === municipality) && (!sector || s.sector === sector) && `${s.name} ${s.id} ${s.municipality} ${s.barangay}`.toLowerCase().includes(query.trim().toLowerCase())), [query, municipality, sector]);
  function select(school: DirectorySchool | null) {
    setSelected(school); setOpen(false);
    try { if (school) localStorage.setItem(storageKey, school.id); else localStorage.removeItem(storageKey); } catch { /* Selection still works without storage. */ }
  }
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.getElementById('school-directory-dialog');
    dialog?.querySelector<HTMLInputElement>('input')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab' || !dialog) return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,a[href]')).filter(n => !n.hasAttribute('disabled'));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [isOpen]);
  return <Context.Provider value={{selected, select, open: () => { setQuery(''); setMunicipality(''); setSector(''); setOpen(true); }}}>{children}
    {isOpen && <div className="school-picker-backdrop" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section id="school-directory-dialog" className="school-picker" role="dialog" aria-modal="true" aria-labelledby="school-picker-title">
        <header><span className="school-picker-emblem"><School size={25}/></span><div><p>CAMARINES NORTE · PHILIPPINES</p><h2 id="school-picker-title">Choose your school</h2></div><button onClick={() => setOpen(false)} aria-label="Close school selector"><X size={21}/></button></header>
        <div className="school-picker-filters"><label className="school-search"><Search size={17}/><input aria-label="Search schools" placeholder="School name, BEIS ID, or barangay…" value={query} onChange={e => setQuery(e.target.value)}/></label><div><select aria-label="Municipality" value={municipality} onChange={e => setMunicipality(e.target.value)}><option value="">All 12 municipalities</option>{municipalities.map(m => <option key={m}>{m}</option>)}</select><select aria-label="School sector" value={sector} onChange={e => setSector(e.target.value)}><option value="">All sectors</option>{['Public','Private','SUCs/LUCs'].map(s => <option key={s}>{s}</option>)}</select></div></div>
        <div className="school-picker-count" role="status">{results.length} of {entries.length} schools <button onClick={() => { setQuery(''); setMunicipality(''); setSector(''); }}>Clear filters</button></div>
        <div className="school-picker-results">{results.map(s => <button key={s.id} aria-pressed={selected?.id === s.id} onClick={() => select(s)}><span className="school-result-icon"><Building2 size={20}/></span><span><strong>{s.name}</strong><small>{s.municipality} · {s.barangay || 'Barangay not listed'}</small><small>BEIS {s.id} · {s.sector}</small></span>{selected?.id === s.id && <ShieldCheck size={20}/>}</button>)}{!results.length && <p className="school-picker-empty">No matching schools. Try another name or clear the filters.</p>}</div>
        <footer><p>Historical masterlist · SY 2020–2021. New or renamed schools may be missing. Directory selection does not grant access to private campus records.</p><a href="https://github.com/darwinphi/ph-schools-dataset/tree/v1.0.1" target="_blank" rel="noreferrer">Directory source ↗</a></footer>
      </section>
    </div>}
  </Context.Provider>;
}
export function SchoolSelector() {
  const { selected, open } = useDirectory();
  const { school } = useAuth();
  return <button className="school-selector" onClick={open} aria-haspopup="dialog"><Building2 size={17}/><span><strong>{selected?.name ?? school?.name ?? 'Choose a school'}</strong><small>{selected ? 'Camarines Norte · Directory' : 'Connected workspace · Change school'}</small></span><ChevronDown size={15}/></button>;
}
export function SchoolWorkspaceBoundary({ children }: { children: ReactNode }) {
  const { selected, select, open } = useDirectory();
  const { school } = useAuth();
  if (!selected) return <>{children}</>;
  return <div className="stack-page school-directory-workspace"><button className="school-back" onClick={() => select(null)}><ArrowLeft size={16}/> Back to {school?.name ?? 'connected workspace'}</button><section className="command-panel"><div className="school-profile-heading"><span className="school-picker-emblem"><School size={32}/></span><div><p>CAMARINES NORTE · REGION V · PHILIPPINES</p><h1>{selected.name}</h1><span><MapPin size={14}/> {selected.municipality}{selected.barangay ? ` · ${selected.barangay}` : ''}</span></div></div><div className="school-profile-fields">{[['BEIS school ID',selected.id],['Municipality',selected.municipality],['Sector',selected.sector],['Curricular offering',selected.offering || 'Not listed'],['Street address',selected.address || 'Not listed'],['Directory school year','2020–2021']].map(([label,value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><div className="school-not-connected"><ShieldCheck size={26}/><div><h2>Campus workspace not connected</h2><p>This school is selectable in the directory. Verified buildings, room inspections, safety records, and an authorized school account are needed before its RADAR dashboard can be activated.</p><p>Your connected workspace’s records are kept separate.</p></div></div><div className="school-profile-actions"><button className="command-action blue" onClick={open}>Choose another school</button><button className="school-back" onClick={() => select(null)}>Return to connected workspace</button></div></section></div>;
}
