import { motion } from 'framer-motion';
import type { Row } from '@/components/advanced/tools';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Map, Camera, Building2, ArrowUpRight, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { CampusCloseView } from '@/components/advanced/CampusCloseView';
import type { MapPayload } from '@/lib/types';
export function CampusScene({ map, revision }: { map?: MapPayload; revision?: string }) {
  const { activeWorkspaceId, can } = useAuth();
  const choseView = useRef(false);
  const [view, setView] = useState('map'),
    [satellite, setSatellite] = useState(true),
    [tilesFailed, setTilesFailed] = useState(false),
    [published, setPublished] = useState<{ scope: string | null; survey: Row | null } | null>(null);
  useEffect(() => {
    choseView.current = false;
    setView('map');
  }, [activeWorkspaceId]);
  useEffect(() => {
    if (!revision) return;
    let live = true;
    api
      .get<{ survey: Row | null }>('/api/campus-close-view')
      .then((result) => {
        if (!live) return;
        setPublished({ scope: activeWorkspaceId, survey: result.survey });
        if (result.survey && !choseView.current) setView('photo');
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [activeWorkspaceId, revision]);
  return (
    <section className="desk-campus">
      <header className="desk-section-heading">
        <div>
          <p className="desk-eyebrow">KNOW YOUR WAY AROUND</p>
          <h2>Your campus</h2>
        </div>
        <Link to="/map" className="desk-link">
          Open full map <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="desk-view-tabs" role="tablist" aria-label="Campus views">
        {[
          { id: 'map', name: 'Map', icon: Map },
          { id: 'photo', name: 'Close-up', icon: Camera },
          { id: 'buildings', name: 'Buildings', icon: Building2 },
        ].map((v) => (
          <button
            role="tab"
            aria-selected={view === v.id}
            id={`campus-tab-${v.id}`}
            aria-controls="campus-view-content"
            tabIndex={view === v.id ? 0 : -1}
            onKeyDown={(event) => {
              const tabs = Array.from(
                event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              );
              const index = tabs.indexOf(event.currentTarget);
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              tabs[next].focus();
              tabs[next].click();
            }}
            key={v.id}
            onClick={() => {
              choseView.current = true;
              setView(v.id);
            }}
          >
            {view === v.id && (
              <motion.span
                className="campus-tab-indicator"
                layoutId="campus-tab-indicator"
                aria-hidden="true"
                transition={{ type: 'spring', stiffness: 440, damping: 36 }}
              />
            )}
            <v.icon size={16} />
            {v.name}
          </button>
        ))}
      </div>
      <div
        key={view}
        id="campus-view-content"
        className="desk-campus-content campus-view-enter"
        role="tabpanel"
        aria-labelledby={`campus-tab-${view}`}
        tabIndex={0}
      >
        {view === 'photo' && (
          <CampusCloseView
            key={activeWorkspaceId || 'root'}
            revision={revision}
            prefetched={published?.scope === activeWorkspaceId ? published.survey : undefined}
            embedded
          />
        )}
        {view === 'map' && (
          <>
            <div className="desk-map-frame">
              {map ? (
                <MapContainer
                  key={`${map.school.id}-${map.school.lat}-${map.school.lng}`}
                  center={[map.school.lat ?? 14.15, map.school.lng ?? 122.75]}
                  zoom={map.school.lat == null ? 10 : 17}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    key={String(satellite)}
                    url={
                      satellite
                        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
                    }
                    attribution={
                      satellite
                        ? 'Imagery © Esri, Maxar, Earthstar Geographics'
                        : '© OpenStreetMap contributors'
                    }
                    eventHandlers={{
                      tileerror: () => setTilesFailed(true),
                      tileload: () => setTilesFailed(false),
                    }}
                  />
                  {map.buildings.map((b) => (
                    <CircleMarker
                      key={b.id}
                      center={[b.lat, b.lng]}
                      radius={9}
                      pathOptions={{
                        color: '#fff',
                        fillColor: '#30b9bb',
                        weight: 2,
                        fillOpacity: 1,
                      }}
                    >
                      <Popup>
                        <strong>
                          {b.code} · {b.name}
                        </strong>
                        <p>
                          {b.roomCount} rooms · {b.floorCount} floors
                        </p>
                        <Link
                          to={
                            can('buildings:read')
                              ? `/buildings?q=${encodeURIComponent(b.name)}`
                              : '/map'
                          }
                        >
                          {can('buildings:read') ? 'Explore rooms →' : 'Open campus map →'}
                        </Link>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              ) : (
                <div className="desk-map-placeholder">
                  <MapPin size={32} />
                  <p>Loading your campus…</p>
                </div>
              )}
              <div className="desk-map-controls">
                <button
                  aria-pressed={!satellite}
                  onClick={() => {
                    setSatellite(false);
                    setTilesFailed(false);
                  }}
                >
                  Street
                </button>
                <button
                  aria-pressed={satellite}
                  onClick={() => {
                    setSatellite(true);
                    setTilesFailed(false);
                  }}
                >
                  Satellite
                </button>
              </div>
              {tilesFailed && (
                <p className="desk-map-message" role="status">
                  Map imagery is unavailable. Registered building pins still work.
                </p>
              )}
            </div>
            <footer>
              <MapPin size={15} />
              {map?.school.lat == null
                ? 'Regional overview · add a verified school location'
                : `${map?.buildings.length ?? 0} registered buildings · tap a pin to explore`}
            </footer>
          </>
        )}
        {view === 'buildings' && (
          <div className="desk-building-list">
            {map?.buildings.length ? (
              map.buildings.map((b, i) => (
                <Link
                  key={b.id}
                  to={can('buildings:read') ? `/buildings?q=${encodeURIComponent(b.name)}` : '/map'}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{b.name}</strong>
                    <small>
                      {b.code} · {b.roomCount} rooms · {b.floorCount} floors
                    </small>
                  </div>
                  <ArrowUpRight size={18} />
                </Link>
              ))
            ) : (
              <div className="desk-empty">
                <Building2 size={30} />
                <h3>Start with the places you know.</h3>
                <p>Register real buildings and rooms to give every inspection a home.</p>
                <Link className="desk-button" to="/buildings">
                  Open building directory
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
