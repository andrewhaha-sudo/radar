import { useEffect, useState, type FormEvent } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { MapPin, LocateFixed, Save } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
function PositionPicker({
  point,
  onChange,
}: {
  point: [number, number] | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const latitude = point?.[0],
    longitude = point?.[1];
  useMapEvents({ click: (e) => onChange(e.latlng.lat, e.latlng.lng) });
  useEffect(() => {
    if (latitude != null && longitude != null)
      map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
  }, [latitude, longitude, map]);
  return point ? (
    <CircleMarker
      center={point}
      radius={12}
      pathOptions={{ color: '#00cfff', fillColor: '#007bff', fillOpacity: 0.8 }}
    />
  ) : null;
}
export function SchoolLocation() {
  const { school, refresh } = useAuth();
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [lat, setLat] = useState(school?.locationVerified ? String(school.lat) : ''),
    [lng, setLng] = useState(school?.locationVerified ? String(school.lng) : ''),
    [source, setSource] = useState(school?.locationSource ?? ''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const valid =
    lat !== '' &&
    lng !== '' &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180;
  const point: [number, number] | null = valid ? [Number(lat), Number(lng)] : null;
  function choose(latitude: number, longitude: number) {
    setLat(latitude.toFixed(7));
    setLng(longitude.toFixed(7));
    setConfirmed(false);
    setNotice('');
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.patch('/api/school/location', {
        lat: Number(lat),
        lng: Number(lng),
        source,
        verified: confirmed,
      });
      await refresh();
      setNotice(
        'School location saved. Open Campus map to see the new center. Building pins retain their own positions.',
      );
      setConfirmed(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setError(
        'Location is not available on this device. Click the map or enter verified coordinates.',
      );
      return;
    }
    setError('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        choose(p.coords.latitude, p.coords.longitude);
        setSource(
          `On-site GPS sample, reported accuracy ${Math.round(p.coords.accuracy)} metres; visually checked on map`,
        );
      },
      () =>
        setError(
          'Location permission was denied or a position was unavailable. Choose the school on the map instead.',
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  return (
    <section className="school-location-card command-panel">
      <div className="school-location-heading">
        <span className="command-feature-icon">
          <MapPin size={25} />
        </span>
        <div>
          <p className="command-eyebrow">CAMPUS SETUP · STEP 1</p>
          <h2>Set your school’s location</h2>
          <p>
            {school?.name}. Click the school on the map, use GPS while on campus, or enter verified
            coordinates.
          </p>
        </div>
        <span className={`setup-status ${school?.locationVerified ? 'ready' : 'missing'}`}>
          {school?.locationVerified ? 'Location recorded' : 'Location needed'}
        </span>
      </div>
      <div className="school-location-layout">
        <div className="school-location-map">
          <MapContainer
            center={point ?? [14.15, 122.75]}
            zoom={point ? 17 : 10}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
              eventHandlers={{
                tileerror: () => setTilesUnavailable(true),
                tileload: () => setTilesUnavailable(false),
              }}
            />
            <PositionPicker point={point} onChange={choose} />
          </MapContainer>
        </div>
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="ops-form-grid">
            <button type="button" className="command-action blue wide" onClick={locate}>
              <LocateFixed size={16} />
              Use my current position
            </button>
            <label>
              School latitude
              <input
                type="number"
                step="any"
                min={-90}
                max={90}
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  setConfirmed(false);
                }}
                required
                placeholder="e.g. 14.11"
              />
            </label>
            <label>
              School longitude
              <input
                type="number"
                step="any"
                min={-180}
                max={180}
                value={lng}
                onChange={(e) => {
                  setLng(e.target.value);
                  setConfirmed(false);
                }}
                required
                placeholder="e.g. 122.95"
              />
            </label>
            <label className="wide">
              Verification source
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                required
                maxLength={500}
                placeholder="On-site GPS, verified campus survey, or checked map pin"
              />
            </label>
            <label className="wide setup-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              I checked that this pin is the actual school location.
            </label>
            <button className="command-action blue wide" disabled={!valid || !confirmed || busy}>
              <Save size={16} />
              {busy ? 'Saving location…' : 'Save school location'}
            </button>
          </fieldset>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-success">
              {notice}
            </p>
          )}
        </form>
      </div>
      {tilesUnavailable && (
        <p className="map-load-notice" role="status">
          Map imagery is unavailable. Enter coordinates from a trusted map or use GPS while on
          campus, then verify the actual location before saving.
        </p>
      )}
      <p className="school-location-footnote">
        The initial regional map is a search area, not a verified school pin. School coordinates set
        the campus map center; each building needs its own actual location.
      </p>
    </section>
  );
}
