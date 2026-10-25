import { useCallback, useEffect, useState, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, ArrowRight, Bell, Building2, CheckCircle2, ClipboardCheck, Layers, MapPinned, ScanEye, ShieldCheck, Siren, Users, Wifi, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { relativeTime, SEVERITY_META } from '@/components/ui/hazard-bits';
import type { DashboardPayload, MapPayload, AlertsPayload } from '@/lib/types';

export function DashboardPage() {
  const { user, school, can, activeWorkspaceId } = useAuth();
  const navigate = useNavigate();
  const [today] = useState(() => new Date().toISOString());
  const [data, setData] = useState<DashboardPayload>();
  const [map, setMap] = useState<MapPayload>();
  const [alerts, setAlerts] = useState<AlertsPayload>();
  const [error, setError] = useState('');
  const [tileError, setTileError] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [buildings, setBuildings] = useState(true);
  const [hazards, setHazards] = useState(true);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [dashboard, campus, notices] = await Promise.all([
        api.get<DashboardPayload>('/api/dashboard'), api.get<MapPayload>('/api/map'),
        can('alerts:read') ? api.get<AlertsPayload>('/api/alerts') : Promise.resolve(undefined),
      ]);
      setData(dashboard); setMap(campus); setAlerts(notices);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [can]);
  useEffect(() => { void load(); }, [load]); // Reload when the signed-in account changes.
  const k = data?.kpis;
  const actions = [
    { label: 'Report Hazard', icon: AlertTriangle, href: '/hazards', tone: 'red', show: can('hazards:write') },
    { label: 'SOS Emergency', icon: Siren, href: '/sos', tone: 'red', show: can('sos:create') },
    { label: 'Start Roll Call', icon: Users, href: '/rollcall', tone: 'blue', show: can('rollcall:read') },
    { label: 'Evacuation Routes', icon: MapPinned, href: '/evacuation', tone: 'green', show: can('evacuation:read') },
  ];
  return <div className="command-dashboard stack-page">
    <div className="command-greeting">
      <span className="command-avatar">{user?.name?.charAt(0)}</span>
      <div><p className="command-eyebrow">CAMPUS SAFETY COMMAND CENTER</p><h1>Welcome back, {user?.name}!</h1><p>Stay informed. Stay prepared. Stay safe.</p></div>
      <div className="command-date"><span>{new Date(data?.generatedAt ?? today).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span><strong>{school?.name}</strong></div>
      <button className="command-icon-button" onClick={() => void load()} disabled={loading} aria-label="Refresh dashboard"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
    </div>
    {error && <div role="alert" className="command-error">{error}<button onClick={() => void load()}>Try again</button></div>}
    {activeWorkspaceId && k?.totalRooms === 0 && <section className="command-panel workspace-onboarding"><div><h2>Set up your school campus</h2><p>Your workspace is empty. Add the school’s real buildings, floors, and rooms to begin inspections. Campus coordinates have not been recorded yet.</p></div><button className="command-action blue" onClick={() => navigate('/buildings')}>Add buildings &amp; rooms <ArrowRight size={16}/></button></section>}
    <button className="school-back" onClick={() => navigate('/operations')}>Open RADAR 2.0 campus operations <ArrowRight size={15}/></button>
    <div className="command-stats" aria-busy={loading}>
      <Metric icon={Building2} title="Total Rooms" value={k?.totalRooms} hint="Across your campus" tone="blue" onClick={() => navigate('/map')}/>
      {can('scan:read') && <Metric icon={ScanEye} title="Scanned Rooms" value={k?.roomsScanned} hint={`${k?.roomCoverage ?? 0}% complete`} tone="green" onClick={() => navigate('/scan')}/>}
      {can('hazards:read') && <Metric icon={ShieldCheck} title="Active Hazards" value={k?.unresolved} hint="Unresolved findings" tone="red" onClick={() => navigate('/hazards')}/>}
      {can('hazards:read') && <Metric icon={ClipboardCheck} title="Pending Review" value={k?.pendingReview} hint="Awaiting verification" tone="amber" onClick={() => navigate('/hazards?status=pending_review')}/>}
      {can('alerts:read') && <Metric icon={Bell} title="Active Alerts" value={k?.activeAlertCount} hint={k?.alertLevel ? `${k.alertLevel} alert level` : 'No active alerts'} tone="pink" onClick={() => navigate('/alerts')}/>}
    </div>
    <div className="command-main-grid">
      <section className="command-panel command-map-panel"><PanelTitle title="Campus Map" action="Full map" onClick={() => navigate('/map')}/>
        <div className="command-map">
          {map && <MapContainer center={[map.school.lat ?? 14.15, map.school.lng ?? 122.75]} zoom={map.school.lat == null ? 10 : 17} scrollWheelZoom={false} style={{background: 'var(--muted)'}}>
            <TileLayer eventHandlers={{tileerror: () => setTileError(true), tileload: () => setTileError(false)}} key={String(satellite)} url={satellite ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'} attribution={satellite ? 'Imagery © Esri, Maxar, Earthstar Geographics' : '© OpenStreetMap contributors'}/>
            {buildings && map.buildings.map(b => <CircleMarker key={b.id} center={[b.lat,b.lng]} radius={10} pathOptions={{color:'#a6e5ff',fillColor:'#007bff',fillOpacity:1,weight:2}}><Popup><strong>{b.name}</strong><p>{b.roomCount} rooms · {b.floorCount} floors</p><button onClick={() => navigate('/map')}>Explore building →</button></Popup></CircleMarker>)}
            {hazards && map.hazards.map(h => { const b = map.buildings.find(b => b.id === h.buildingId); return b && <CircleMarker key={h.id} center={[b.lat,b.lng]} radius={6} pathOptions={{color:'#fff',fillColor:SEVERITY_META[h.severity].hex,fillOpacity:1,weight:1}}><Popup><strong>{h.title}</strong><p>{h.severity} · {h.buildingName}</p><button onClick={() => navigate(`/hazards?open=${h.id}`)}>View finding →</button></Popup></CircleMarker>; })}
          </MapContainer>}
          <div className="command-map-tools"><div className="command-segment">{['Map','Satellite'].map((label,i) => <button key={label} className={satellite === Boolean(i) ? 'selected' : ''} onClick={() => { setTileError(false); setSatellite(Boolean(i)); }}>{label}</button>)}</div><div className="command-layer-panel"><h3><Layers size={14}/> Map Layers</h3><label><Building2 size={14}/> Buildings<input type="checkbox" checked={buildings} onChange={e => setBuildings(e.target.checked)}/></label><label><AlertTriangle size={14}/> Hazard Markers<input type="checkbox" checked={hazards} onChange={e => setHazards(e.target.checked)}/></label><button onClick={() => navigate('/map')}>All map layers <ArrowRight size={13}/></button></div></div>
          {map?.school.lat == null && <div className="workspace-location-notice">Camarines Norte overview · School location not set</div>}
          {tileError && <div role="status" className="command-tile-status">Basemap unavailable. Campus markers remain interactive. Try another map layer.</div>}
          <div className="command-map-legend">{['low','medium','high','critical','info'].map(s => <span key={s}><i style={{background:SEVERITY_META[s as keyof typeof SEVERITY_META].hex}}/>{s}</span>)}</div>
          {!map && <div className="command-map-loading">{loading ? 'Loading campus map…' : 'Campus map unavailable'}</div>}
        </div>
      </section>
      <div className="command-right"><section className="command-panel"><PanelTitle title="Recent Alerts" action="View all" onClick={() => navigate(can('alerts:read') ? '/alerts' : '/notifications')}/><div className="command-alerts">{alerts?.active.length ? alerts.active.slice(0,4).map(a => <button key={a.id} onClick={() => navigate('/alerts')}><span className={`command-alert-icon ${a.level}`}><Bell size={20}/></span><span><strong>{a.title}</strong><small>{a.audienceLabel} · {relativeTime(a.publishedAt)}</small></span><span className={`command-level ${a.level}`}>{a.level}</span></button>) : <div className="command-empty"><CheckCircle2 size={28}/><strong>{can('alerts:read') ? 'No active alerts' : 'Stay connected'}</strong><p>{can('alerts:read') ? 'Published campus alerts will appear here.' : 'Your campus notifications are one click away.'}</p></div>}</div></section>
      <section className="command-panel command-quick"><PanelTitle title="Quick Actions"/><div>{actions.filter(a => a.show).map(a => <button key={a.href} className={`command-action ${a.tone}`} onClick={() => navigate(a.href)}><a.icon size={18}/>{a.label}</button>)}<button className="command-action blue" onClick={() => navigate('/notifications')}><Bell size={18}/> Notifications</button></div></section></div>
    </div>
    <div className="command-bottom-grid">
      {can('scan:read') && <section className="command-panel command-workflow"><PanelTitle title="Room Scanning"/><div className="command-steps">{['Select Room','Capture Images','Review Findings','Submit'].map((step,i) => <span key={step}><b>{i+1}</b>{step}</span>)}</div><div className="command-workflow-body"><span className="command-feature-icon"><ScanEye size={34}/></span><div><h3>Your next inspection starts here</h3><p>Document room conditions, attach evidence, and submit findings for review.</p></div><button className="command-action blue" onClick={() => navigate('/scan')}>Start scanning <ArrowRight size={16}/></button></div><div className="command-progress"><span style={{width:`${k?.roomCoverage ?? 0}%`}}/></div><small>{k?.roomsScanned ?? '—'} of {k?.totalRooms ?? '—'} rooms inspected</small></section>}
      {can('hazards:read') && <section className="command-panel"><PanelTitle title="Hazard Reports" action="View all" onClick={() => navigate('/hazards')}/><div className="command-findings">{map?.hazards.length ? map.hazards.slice(0,3).map(h => <button key={h.id} onClick={() => navigate(`/hazards?open=${h.id}`)}><span className="command-finding-symbol" style={{color:SEVERITY_META[h.severity].hex}}><AlertTriangle size={23}/></span><span><strong>{h.title}</strong><small>{h.buildingName ?? h.locationNote} · {h.severity}</small></span><ArrowRight size={15}/></button>) : <div className="command-empty"><ShieldCheck size={28}/><p>No findings recorded.</p></div>}</div></section>}
      <section className="command-panel"><PanelTitle title="Emergency Command Center"/><div className={`command-incident ${k?.activeIncidents ? 'has-incident' : ''}`}><Siren size={30}/><div><small>Campus response</small><h3>{k ? `${k.activeIncidents} active incident${k.activeIncidents === 1 ? '' : 's'}` : 'Loading status…'}</h3><p>Call local emergency services for immediate danger.</p></div></div><div className="command-response-stats"><div><Users size={19}/><strong>{k?.rollcallCompletion ?? '—'}%</strong><small>Roll call</small></div><div><ShieldCheck size={19}/><strong>{k?.safetyNeedHelp ?? '—'}</strong><small>Need assistance</small></div></div><button className="command-text-link" onClick={() => navigate(can('incidents:read') ? '/incidents' : '/sos')}>Open emergency workspace <ArrowRight size={15}/></button></section>
    </div>
    <footer className="command-footer">{[{icon:MapPinned,title:'Interactive Maps',text:'Your campus at a glance'},{icon:ScanEye,title:'Guided Inspections',text:'Capture and review findings'},{icon:Bell,title:'Campus Alerts',text:'Stay informed and aware'},{icon:ShieldCheck,title:'Role-Based Access',text:'Secure, accountable workflows'},{icon:Wifi,title:'Offline Support',text:'Read saved campus snapshots'}].map(f => <div key={f.title}><f.icon size={22}/><span><strong>{f.title}</strong><small>{f.text}</small></span></div>)}</footer>
  </div>;
}
function PanelTitle({title,action,onClick}:{title:string;action?:string;onClick?:()=>void}) { return <div className="command-panel-title"><h2>{title}</h2>{action && <button onClick={onClick}>{action} <ArrowRight size={12}/></button>}</div>; }
function Metric({icon:Icon,title,value,hint,tone,onClick}:{icon:ElementType;title:string;value?:number;hint:string;tone:string;onClick:()=>void}) { return <button className={`command-metric ${tone}`} onClick={onClick}><span className="command-metric-icon"><Icon size={25}/></span><span><small>{title}</small><strong>{value ?? '—'}</strong><em>{hint}</em></span></button>; }
