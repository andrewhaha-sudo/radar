import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ToolForm, type Row } from './tools';
export function MeasuredModelBuilder({ buildings }: { buildings: Row[] }) {
  const { can } = useAuth();
  const [building, setBuilding] = useState(''),
    [layout, setLayout] = useState<Row | null>(null),
    [floor, setFloor] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function load() {
    if (building)
      try {
        setLayout(await api.get(`/api/advanced/models/${building}/layout`));
      } catch (err) {
        setError(errorMessage(err));
      }
  }
  useEffect(() => {
    void load();
  }, [building]);
  async function generate() {
    setBusy(true);
    setError('');
    try {
      if (!layout?.ready || !layout.rooms.length)
        throw new Error(
          'Register rooms and verify every floor’s scale and surveyed elevation first.',
        );
      const THREE = await import('three');
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const scene = new THREE.Scene();
      scene.name = 'Measured_registered_floor_plan';
      const mapping = { floors: [] as Row[], rooms: [] as Row[] };
      for (const f of layout.floors) {
        const group = new THREE.Group();
        group.name = `Floor_${f.id}`;
        scene.add(group);
        mapping.floors.push({ node: group.name, floorId: f.id });
        for (const room of layout.rooms.filter((r: Row) => r.floorId === f.id)) {
          const width = room.width / f.scalePxPerM,
            length = room.height / f.scalePxPerM;
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, length),
            new THREE.MeshStandardMaterial({
              color:
                room.status === 'closed'
                  ? 0xe94858
                  : room.status === 'restricted'
                    ? 0xffba44
                    : 0x149ad1,
              side: THREE.DoubleSide,
            }),
          );
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(
            (room.x + room.width / 2) / f.scalePxPerM,
            f.elevationM,
            (room.y + room.height / 2) / f.scalePxPerM,
          );
          mesh.name = `Room_${room.id}`;
          group.add(mesh);
          mapping.rooms.push({ node: mesh.name, roomId: room.id });
        }
      }
      const exported = await new GLTFExporter().parseAsync(scene, {
        binary: true,
      });
      scene.traverse((object) => {
        const mesh = object as import('three').Mesh;
        mesh.geometry?.dispose();
        if (mesh.material && !Array.isArray(mesh.material)) mesh.material.dispose();
      });
      if (!(exported instanceof ArrayBuffer)) throw new Error('GLB export failed.');
      const uploaded = await api.upload(
        new File([exported], 'measured-layout.glb', {
          type: 'model/gltf-binary',
        }),
      );
      const room = layout.rooms[0];
      await api.post(`/api/rooms/${room.id}/assets`, {
        kind: 'model',
        title: `${layout.building.name} — measured floor-plan layout`,
        url: uploaded.url,
        mapping,
      });
      navigate(`/operations?tab=rooms&roomId=${room.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="ops-card">
        <h2>Build a model from measured campus plans</h2>
        <p>
          Creates selectable 3D room footprints from actual registered floor-plan outlines, verified
          pixels-per-metre scale and surveyed elevations. It does not invent walls, doors, interiors
          or photographic detail.
        </p>
        <label>
          Registered building
          <select
            value={building}
            onChange={(e) => {
              setBuilding(e.target.value);
              setFloor('');
            }}
          >
            <option value="">Choose building…</option>
            {buildings.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        {layout && (
          <>
            <p>
              {layout.rooms.length} registered rooms.{' '}
              {layout.ready ? 'All floor surveys recorded.' : 'Floor surveys incomplete.'}
            </p>
            <label>
              Floor survey
              <select value={floor} onChange={(e) => setFloor(e.target.value)}>
                <option value="">Choose floor…</option>
                {layout.floors.map((row: Row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} ·{' '}
                    {row.scalePxPerM
                      ? `${row.scalePxPerM} px/m, elevation ${row.elevationM} m`
                      : 'survey needed'}
                  </option>
                ))}
              </select>
            </label>
            {can('admin:users') && (
              <button
                className="command-action blue"
                disabled={!layout.ready || !layout.rooms.length || busy}
                onClick={() => void generate()}
              >
                {busy ? 'Building recorded layout…' : 'Generate and save measured layout model'}
              </button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </section>
      {floor && can('admin:users') && (
        <ToolForm
          key={floor}
          title="Verify floor-plan scale and elevation"
          path={`/api/advanced/floors/${floor}/survey`}
          fields={[
            {
              name: 'scale',
              label: 'Actual pixels per metre from the registered plan',
              type: 'number',
            },
            {
              name: 'elevation',
              label: 'Surveyed floor elevation in metres',
              type: 'number',
            },
            { name: 'source', label: 'Survey / plan source' },
            {
              name: 'layoutVerified',
              label:
                'I verified every registered room outline and position against the actual measured plan',
              type: 'checkbox',
            },
            {
              name: 'verified',
              label: 'I verified these measurements',
              type: 'checkbox',
            },
          ]}
          onSaved={() => void load()}
        />
      )}
    </>
  );
}
