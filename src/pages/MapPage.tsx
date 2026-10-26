import {OfficialLayerOverlay} from '@/components/advanced/OfficialLayerOverlay';
import {CampusSearch} from '@/components/map/CampusSearch';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, GeoJSON, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import type {GeoJsonObject} from 'geojson';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  Search,
  Maximize,
  Minimize,
  X,
  RefreshCw,
  Building2,
  ShieldAlert,
  Wrench,
  Flag,
  Route as RouteIcon,
  Crosshair,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { BuildingDrawer } from '@/components/map/BuildingDrawer';
import {
  SEVERITY_META,
  SeverityBadge,
  StatusBadge,
  relativeTime,
} from '@/components/ui/hazard-bits';
import { cn } from '@/components/ui/card';
import type { MapPayload, Severity } from '@/lib/types';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

interface BasemapConfig {
  label: string;
  attribution: string;
  url?: string;
  className?: string;
}

// Keyless tile providers only. CARTO now watermarks requests without an API key,
// so street tiles come from OpenStreetMap and dark mode is produced with a CSS
// filter on the tile layer rather than a third-party keyed service.
const BASEMAPS: Record<'auto' | 'streets' | 'dark' | 'satellite' | 'terrain', BasemapConfig> = {
  auto: { label: 'Auto', attribution: OSM_ATTRIBUTION },
  streets: {
    label: 'Streets',
    url: OSM_URL,
    attribution: OSM_ATTRIBUTION,
  },
  dark: {
    label: 'Dark',
    url: OSM_URL,
    attribution: OSM_ATTRIBUTION,
    className: 'map-tiles-dark',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  terrain: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
  },
};

type BasemapId = keyof typeof BASEMAPS;


function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function buildingIcon(code: string, color: string, selected: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="radar-marker radar-marker--building ${selected ? 'radar-marker--selected' : ''}" style="--marker-color:${color};width:42px;height:42px">${escapeHtml(code)}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20],
  });
}

function hazardIcon(severity: Severity, selected: boolean) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.info;
  return L.divIcon({
    className: '',
    html: `<div class="radar-marker ${selected ? 'radar-marker--selected' : ''}" style="--marker-color:${meta.hex};width:30px;height:30px;font-size:14px">${meta.symbol}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function equipmentIcon(status: string) {
  const color = status === 'ok' ? '#0EA5E9' : status === 'missing' ? '#EF4444' : '#F59E0B';
  return L.divIcon({
    className: '',
    html: `<div class="radar-marker" style="--marker-color:${color};width:26px;height:26px;font-size:10px;border-radius:6px">${status === 'ok' ? '✓' : '!'}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
  });
}

function assemblyIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="radar-marker" style="--marker-color:#22C55E;width:34px;height:34px;font-size:12px;border-radius:6px">AP</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

function MapController({
  target,
  fullscreen,
}: {
  target: [number, number] | null;
  fullscreen: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 250);
    return () => window.clearTimeout(timer);
  }, [map, fullscreen]);

  useEffect(() => {
    if (!target) return;
    map.flyTo(target, 18, { duration: 0.7 });
  }, [map, target]);

  return null;
}

export function MapPage() {
  const { resolvedMode } = useTheme();
  const { can } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [basemap, setBasemap] = useState<BasemapId>('auto');
  const [layersOpen, setLayersOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [focusedRoomId,setFocusedRoomId] = useState<number|null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<number | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);

  const [layers, setLayers] = useState({
    buildings: true,
    hazards: true,
    equipment: false,
    assembly: true,
    routes: true,
  });
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set(SEVERITIES));
  const [verification,setVerification]=useState('all');
  const [since,setSince]=useState('');
  const [category,setCategory]=useState('');
  const [zones,setZones]=useState<Array<{id:number;name:string;kind:string;source:string;verified:number;geometry:GeoJsonObject}>>([]);
  const [showZones,setShowZones]=useState(true);
  const [earthquakes,setEarthquakes]=useState<Array<{id:number;title:string;sourceName:string;publishedAt:string;details:string}>>([]);
  const [showEarthquakes,setShowEarthquakes]=useState(false);
  const [fetchedAt,setFetchedAt]=useState('');
  const [hideResolved, setHideResolved] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    api.get<{zones:typeof zones}>('/api/map/zones').then(d=>setZones(d.zones)).catch(()=>setZones([]));
    api.get<{items:typeof earthquakes}>('/api/advisories').then(d=>setEarthquakes(d.items.filter(e=>e.sourceName==='USGS'&&e.details))).catch(()=>setEarthquakes([]));
    api
      .get<MapPayload>('/api/map')
      .then((payload) => {setData(payload);setFetchedAt(new Date().toLocaleString());})
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const activeBasemap: { url: string; attribution: string; className?: string } = useMemo(() => {
    if (basemap === 'auto') {
      return {
        url: OSM_URL,
        attribution: OSM_ATTRIBUTION,
        className: resolvedMode === 'dark' ? 'map-tiles-dark' : undefined,
      };
    }
    const config = BASEMAPS[basemap];
    return {
      url: config.url ?? '',
      attribution: config.attribution,
      className: config.className,
    };
  }, [basemap, resolvedMode]);

  const filteredHazards = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.hazards.filter((hazard) => {
      if(verification==='verified'&&!['verified','in_progress'].includes(hazard.status))return false;
      if(verification==='pending'&&!['new','pending_review'].includes(hazard.status))return false;
      if(category&&hazard.category!==category)return false;
      if(since&&hazard.createdAt<new Date(since+'T00:00').toISOString())return false;
      if (!severityFilter.has(hazard.severity)) return false;
      if (hideResolved && hazard.status === 'resolved') return false;
      if (!q) return true;
      return [hazard.title, hazard.ref, hazard.buildingName, hazard.roomName, hazard.locationNote]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [data, severityFilter, hideResolved, query,verification,category,since]);

  const filteredBuildings = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.buildings;
    return data.buildings.filter((b) =>
      [b.name, b.code, b.description].some((value) => value.toLowerCase().includes(q)),
    );
  }, [data, query]);

  const groupedByBuilding = useMemo(() => {
    const map = new Map<number, typeof filteredHazards>();
    for (const hazard of filteredHazards) {
      if (!hazard.buildingId) continue;
      const list = map.get(hazard.buildingId) ?? [];
      list.push(hazard);
      map.set(hazard.buildingId, list);
    }
    return map;
  }, [filteredHazards]);

  const toggleSeverity = (severity: Severity) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  };

  const toggleLayer = (key: keyof typeof layers) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  const focusBuilding = (id: number, lat: number, lng: number) => {
    setSelectedBuildingId(id);
    setFlyTarget([lat, lng]);
  };

  const center = data?.school ? ([data.school.lat ?? 14.15, data.school.lng ?? 122.75] as [number, number]) : ([14.1145, 122.9550] as [number, number]);
  const selectedHazard = filteredHazards.find((h) => h.id === selectedHazardId) ?? null;

  return (
    <div
      className={cn(
        'campus-map-workspace flex flex-col bg-background',
        fullscreen ? 'fixed inset-0 z-[60]' : 'h-[calc(100svh-4rem)] min-h-[520px]',
      )}
    >
      {data?.school.lat == null && data && <p role="status" className="border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground">Camarines Norte overview. An administrator can set the school location in Buildings & rooms, then add each building’s actual coordinates.</p>}
      <div className="map-all-search"><CampusSearch onSelect={result=>{if(result.lat!=null&&result.lng!=null)setFlyTarget([result.lat,result.lng]);if(result.kind==='room'){if(can('buildings:read')){setFocusedRoomId(result.id);setSelectedBuildingId(result.buildingId??null);}else navigate(`/operations?tab=reports&roomId=${result.id}`);}else if(result.kind==='building'&&can('buildings:read')){setFocusedRoomId(null);setSelectedBuildingId(result.id);}}}/></div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 md:px-4">
        <details className="map-filter-disclosure"><summary>Filter markers</summary>        <div className="relative min-w-[180px] flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter visible markers…"
            aria-label="Filter visible map markers"
            className="h-9 pl-9"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

</details>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
            <ShieldAlert className="h-3.5 w-3.5" />
            {filteredHazards.length} open hazards
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/operations?tab=advanced&tool=gis')}
          >
            GIS mapping
          </Button>
          <Button
            variant={layersOpen ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setLayersOpen((p) => !p)}
            aria-expanded={layersOpen}
          >
            <Layers className="h-4 w-4" /> Layers
          </Button>
          <Button variant="outline" size="icon" onClick={load} aria-label="Refresh map data" title="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setFullscreen((p) => !p)}
            aria-label={fullscreen ? 'Exit fullscreen map' : 'Enter fullscreen map'}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-background/60 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-lg">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading campus map…
            </div>
          </div>
        )}

        {error && !data && (
          <div className="absolute inset-0 z-30 grid place-items-center p-4">
            <Card hover={false} className="max-w-sm p-6 text-center">
              <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-danger" />
              <h2 className="text-sm font-semibold">Map data unavailable</h2>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <Button size="sm" className="mt-4" onClick={load}>
                Retry
              </Button>
            </Card>
          </div>
        )}

        <MapContainer
          center={center}
          zoom={data?.school.lat == null ? 10 : 17}
          minZoom={data?.school.lat == null ? 5 : 14}
          maxZoom={20}
          scrollWheelZoom
          className="h-full w-full"
          attributionControl
        >
          <OfficialLayerOverlay/>
          <TileLayer
            key={`${basemap}-${resolvedMode}`}
            url={activeBasemap.url}
            attribution={activeBasemap.attribution}
            className={activeBasemap.className}
          />
          <MapController target={flyTarget} fullscreen={fullscreen} />

          {/* Evacuation routes */}
          {layers.routes &&
            data?.routes.map((route) => (
              <Polyline
                key={route.id}
                positions={route.path}
                pathOptions={{ color: '#22D3EE', weight: 4, opacity: 0.9, dashArray: '10 8' }}
              >
                <Tooltip sticky>
                  <span className="text-xs font-medium">{route.name}</span>
                  {route.notes ? <span className="block text-[11px] text-muted-foreground">{route.notes}</span> : null}
                </Tooltip>
              </Polyline>
            ))}

          {showZones&&zones.map(z=><GeoJSON key={`${z.id}-${z.verified}-${JSON.stringify(z.geometry)}`} data={z.geometry} style={{color:z.verified?'#ff493b':'#ffad20',weight:2,fillOpacity:.15,dashArray:z.verified?undefined:'5 5'}}><Popup><strong>{z.name}</strong><p>{z.kind} · {z.verified?'Verified source / geometry':'Unverified, provisional'}</p><p>{z.source}</p></Popup></GeoJSON>)}
          {showEarthquakes&&earthquakes.map(e=>{let point;try{point=JSON.parse(e.details);}catch{return null;}return Number.isFinite(point.lat)&&Number.isFinite(point.lng)?<CircleMarker key={e.id} center={[point.lat,point.lng]} radius={10} pathOptions={{color:'#ffad20'}}><Popup><strong>{e.title}</strong><p>USGS · {e.publishedAt}</p><p>No PEIS intensity or school impact is inferred.</p></Popup></CircleMarker>:null;})}
          {/* Buildings */}
          {layers.buildings &&
            filteredBuildings.map((building) => {
              const relatedHazards = groupedByBuilding.get(building.id) ?? [];
              const worst = relatedHazards.reduce<Severity | null>((acc, hazard) => {
                if (!acc) return hazard.severity;
                return SEVERITIES.indexOf(hazard.severity) < SEVERITIES.indexOf(acc) ? hazard.severity : acc;
              }, null);
              const color = worst ? SEVERITY_META[worst].hex : '#3B82F6';
              return (
                <Marker
                  key={building.id}
                  position={[building.lat, building.lng]}
                  icon={buildingIcon(building.code, color, selectedBuildingId === building.id)}
                  title={`${building.name} — open floor plans`}
                  eventHandlers={{ click: () => setSelectedBuildingId(building.id) }}
                >
                  <Popup>
                    <div className="min-w-[200px] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{building.name}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{building.code}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {building.floorCount} floors · {building.roomCount} rooms
                      </p>
                      {relatedHazards.length > 0 ? (
                        <p className="text-[11px] text-danger">
                          {relatedHazards.length} open hazard{relatedHazards.length === 1 ? '' : 's'} mapped
                        </p>
                      ) : (
                        <p className="text-[11px] text-success">No open hazards mapped</p>
                      )}
                      <button
                        onClick={() => setSelectedBuildingId(building.id)}
                        className="mt-1 w-full rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground"
                      >
                        Open building & floor plans
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* Hazards */}
          {layers.hazards &&
            filteredHazards.map((hazard) => {
              const building = data?.buildings.find((b) => b.id === hazard.buildingId);
              if (!building) return null;
              const hash = hazard.id * 0.000012;
              const position: [number, number] = [
                building.lat + hash,
                building.lng - hash * 0.8,
              ];
              return (
                <Marker
                  key={hazard.id}
                  position={position}
                  icon={hazardIcon(hazard.severity, selectedHazardId === hazard.id)}
                  title={`${hazard.title} (${hazard.ref}) — ${hazard.severity} severity`}
                  eventHandlers={{ click: () => setSelectedHazardId(hazard.id) }}
                >
                  <Popup>
                    <div className="min-w-[210px] space-y-1.5">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={hazard.severity} />
                        <StatusBadge status={hazard.status} />
                      </div>
                      <p className="text-sm font-semibold leading-tight">{hazard.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{hazard.ref}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {hazard.buildingName}
                        {hazard.roomName ? ` · ${hazard.roomName}` : ''}
                        {hazard.locationNote ? ` — ${hazard.locationNote}` : ''}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Reported {relativeTime(hazard.createdAt)}</p>
                      <button
                        onClick={() => navigate(`/hazards?open=${hazard.id}`)}
                        className="mt-1 w-full rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground"
                      >
                        Open hazard record
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* Safety equipment */}
          {layers.equipment &&
            data?.equipment
              .filter((item) => item.roomId || item.buildingId)
              .map((item, index) => {
                const building = data.buildings.find((b) => b.id === item.buildingId) ??
                  data.buildings.find((b) => b.id === data.hazards.find((h) => h.roomId === item.roomId)?.buildingId);
                if (!building) return null;
                const offset = ((index % 7) - 3) * 0.000045;
                return (
                  <Marker
                    key={item.id}
                    position={[building.lat + offset, building.lng + offset]}
                    icon={equipmentIcon(item.status)}
                    title={`${item.label} — ${item.status}`}
                  >
                    <Popup>
                      <div className="min-w-[180px] space-y-1">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground">{item.roomName ?? building.name}</p>
                        <Badge
                          variant={item.status === 'ok' ? 'success' : item.status === 'missing' ? 'danger' : 'warning'}
                          className="text-[10px] capitalize"
                        >
                          {item.status}
                        </Badge>
                        <p className="text-[11px] text-muted-foreground">Checked {relativeTime(item.lastCheckedAt)}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

          {/* Assembly points */}
          {layers.assembly &&
            data?.assemblyPoints.map((point) => (
              <Marker
                key={point.id}
                position={[point.lat, point.lng]}
                icon={assemblyIcon()}
                title={`${point.name} — assembly point`}
              >
                <Popup>
                  <div className="min-w-[180px] space-y-1">
                    <p className="text-sm font-semibold">{point.name}</p>
                    <p className="text-[11px] text-muted-foreground">Capacity {point.capacity}</p>
                    {point.notes && <p className="text-[11px] text-muted-foreground">{point.notes}</p>}
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>

        {/* Search results */}
        {query && data && (
          <div className="absolute left-3 top-3 z-20 max-h-[70%] w-[min(92vw,340px)] overflow-y-auto rounded-xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {filteredBuildings.length + filteredHazards.length} matches
            </p>
            {filteredBuildings.length === 0 && filteredHazards.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nothing matched “{query}”.</p>
            ) : (
              <div className="space-y-1">
                {filteredBuildings.map((building) => (
                  <button
                    key={`b-${building.id}`}
                    onClick={() => focusBuilding(building.id, building.lat, building.lng)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-accent-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{building.name}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {building.code} · {building.roomCount} rooms
                      </span>
                    </span>
                  </button>
                ))}
                {filteredHazards.map((hazard) => {
                  const building = data.buildings.find((b) => b.id === hazard.buildingId);
                  return (
                    <button
                      key={`h-${hazard.id}`}
                      onClick={() => {
                        if (building) focusBuilding(building.id, building.lat, building.lng);
                        setSelectedHazardId(hazard.id);
                      }}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <span
                        className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: SEVERITY_META[hazard.severity]?.hex }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{hazard.title}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {hazard.ref} · {hazard.roomName ?? hazard.buildingName}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Layers panel */}
        {layersOpen && (
          <div className="absolute right-3 top-3 z-20 max-h-[calc(100%-1.5rem)] w-[min(92vw,300px)] overflow-y-auto rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur animate-in">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Map layers</h2>
              <button
                onClick={() => setLayersOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                aria-label="Close layers panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Base map</p>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => setBasemap(id)}
                    aria-pressed={basemap === id}
                    className={cn(
                      'rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors',
                      basemap === id
                        ? 'border-accent-foreground bg-accent text-accent-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {BASEMAPS[id].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data layers</p>
              {[
                { key: 'buildings' as const, label: 'Buildings', icon: Building2 },
                { key: 'hazards' as const, label: 'Open hazards', icon: ShieldAlert },
                { key: 'equipment' as const, label: 'Safety equipment', icon: Wrench },
                { key: 'assembly' as const, label: 'Assembly points', icon: Flag },
                { key: 'routes' as const, label: 'Evacuation routes', icon: RouteIcon },
              ].map((layer) => {
                const Icon = layer.icon;
                return (
                  <label
                    key={layer.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={layers[layer.key]}
                      onChange={() => toggleLayer(layer.key)}
                      className="h-3.5 w-3.5 accent-[var(--accent-solid)]"
                    />
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {layer.label}
                  </label>
                );
              })}
            </div>

            <div className="mt-3 space-y-1.5 border-t border-border pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Severity filter</p>
              <div className="flex flex-wrap gap-1">
                {SEVERITIES.map((severity) => {
                  const active = severityFilter.has(severity);
                  const meta = SEVERITY_META[severity];
                  return (
                    <button
                      key={severity}
                      onClick={() => toggleSeverity(severity)}
                      aria-pressed={active}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-opacity',
                        active ? 'opacity-100' : 'opacity-35',
                      )}
                      style={{ borderColor: `${meta.hex}66`, color: meta.hex, background: `${meta.hex}14` }}
                    >
                      <span aria-hidden="true">{meta.symbol}</span> {meta.label}
                    </button>
                  );
                })}
              </div>
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={hideResolved}
                  onChange={(e) => setHideResolved(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent-solid)]"
                />
                Hide resolved hazards
              </label>
            </div>

            <div className="mt-3 space-y-2 text-[11px]"><label className="block">Verification<select className="w-full rounded border border-border bg-background p-2" value={verification} onChange={e=>setVerification(e.target.value)}><option value="all">All reports (unverified are provisional)</option><option value="verified">Verified / in progress</option><option value="pending">Needs review</option></select></label><label className="block">Hazard type<select className="w-full rounded border border-border bg-background p-2" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All types</option>{['electrical','structural','fire','chemical','slip','blocked_exit','other'].map(c=><option key={c}>{c}</option>)}</select></label><label className="block">Reported since (local date)<input className="w-full rounded border border-border bg-background p-2" type="date" value={since} onChange={e=>setSince(e.target.value)}/></label><label className="block"><input type="checkbox" checked={showZones} onChange={e=>setShowZones(e.target.checked)}/> Registered restriction / geological zones</label><label className="block"><input type="checkbox" checked={showEarthquakes} onChange={e=>setShowEarthquakes(e.target.checked)}/> USGS source event locations</label><p className="text-muted-foreground">Records fetched {fetchedAt||'—'}. Unverified reports are not official clearance decisions.</p></div>
            <button
              onClick={() => {
                setFlyTarget([center[0], center[1]]);
                setQuery('');
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              <Crosshair className="h-3.5 w-3.5" /> Recentre campus
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-6 left-3 z-10 hidden rounded-xl border border-border bg-card/90 p-2.5 shadow-lg backdrop-blur sm:block">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hazard severity
          </p>
          <ul className="space-y-1">
            {SEVERITIES.map((severity) => {
              const meta = SEVERITY_META[severity];
              return (
                <li key={severity} className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className="grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold text-white"
                    style={{ background: meta.hex }}
                    aria-hidden="true"
                  >
                    {meta.symbol}
                  </span>
                  {meta.label}
                </li>
              );
            })}
            <li className="flex items-center gap-1.5 border-t border-border pt-1 text-[11px] text-muted-foreground">
              <span className="grid h-3.5 w-3.5 place-items-center rounded-sm bg-success text-[7px] font-bold text-white">
                AP
              </span>
              Assembly point
            </li>
            <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-0.5 w-3.5 border-t-2 border-dashed border-cyan" /> Evacuation route
            </li>
          </ul>
        </div>

        {selectedHazard && (
          <div className="absolute bottom-6 left-3 z-10 hidden w-64 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur md:block">
            <div className="mb-1 flex items-center gap-1.5">
              <SeverityBadge severity={selectedHazard.severity} />
              <button
                onClick={() => setSelectedHazardId(null)}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent"
                aria-label="Clear selected hazard"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-sm font-medium leading-tight">{selectedHazard.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {selectedHazard.ref} · {selectedHazard.roomName ?? selectedHazard.buildingName}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => navigate(`/hazards?open=${selectedHazard.id}`)}
            >
              Open record
            </Button>
          </div>
        )}

        {fullscreen && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-md bg-card/90 px-2 py-1 text-[10px] text-muted-foreground">
            Press Esc to exit fullscreen
          </div>
        )}
      </div>

      <BuildingDrawer
        buildingId={selectedBuildingId}
        initialRoomId={focusedRoomId}
        onClose={() => setSelectedBuildingId(null)}
        canScan={can('scan:write')}
      />
    </div>
  );
}
