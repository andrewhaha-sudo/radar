import { useEffect, useState } from 'react';
import { readCachedImage, readDataPackDocument } from '@/lib/offline';
import { FloorPlan } from '@/components/map/FloorPlan';
import type { Floor, Room } from '@/lib/types';
type Pack = {
  emergencyContacts: Array<{ name: string; phone: string }>;
  procedures: string;
  floors: Floor[];
  rooms: Room[];
  savedAt: string;
};
export function OfflineEmergency() {
  const [pack, setPack] = useState<Pack | null>(null),
    [floorId, setFloorId] = useState(''),
    [image, setImage] = useState<string | null>(null),
    [roomId, setRoomId] = useState<number | null>(null);
  useEffect(() => {
    readDataPackDocument<Pack>('/api/emergency/pack')
      .then(setPack)
      .catch(() => {});
  }, []);
  const floor = pack?.floors.find((f) => String(f.id) === floorId);
  useEffect(() => {
    let current: string | null = null;
    let stopped = false;
    setImage(null);
    if (floor?.planImage)
      readCachedImage(floor.planImage)
        .then((url) => {
          current = url;
          if (stopped && url) URL.revokeObjectURL(url);
          else setImage(url);
        })
        .catch(() => {});
    return () => {
      stopped = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [floor?.planImage]);
  return (
    <section className="ops-card">
      <h3>Previously downloaded emergency instructions and floor plans</h3>
      {pack ? (
        <>
          <p>Snapshot saved {pack.savedAt}. These instructions and closures may have changed.</p>
          {pack.emergencyContacts.map((c) => (
            <p key={c.name}>
              <strong>{c.name}</strong> · <a href={`tel:${c.phone}`}>Call {c.phone}</a>
              <a href={`sms:${c.phone}`}>
                Open my phone’s SMS app (delivery is not guaranteed by RADAR)
              </a>
            </p>
          ))}
          <p style={{ whiteSpace: 'pre-wrap' }}>
            {pack.procedures || 'No approved procedures were included in this pack.'}
          </p>
          <label>
            Downloaded floor plan
            <select value={floorId} onChange={(e) => setFloorId(e.target.value)}>
              <option value="">Choose a floor…</option>
              {pack.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {floor && (
            <>
              <FloorPlan
                floor={{ ...floor, planImage: image ?? undefined }}
                rooms={pack.rooms.filter((r) => r.floorId === floor.id)}
                selectedRoomId={roomId}
                onSelectRoom={(r) => setRoomId(r.id)}
              />
              {floor.planImage && !image && (
                <p>
                  The plan image was not saved in this data pack. Registered room outlines remain
                  available.
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <p>
          Save an authorized data pack while connected to include school emergency contacts,
          instructions, and floor plans. An offline SOS cannot be assumed delivered.
        </p>
      )}
    </section>
  );
}
