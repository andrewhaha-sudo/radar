import { useEffect, useRef, useState } from 'react';
export type ModelMapping = {
  floors: Array<{ node: string; floorId: number; label: string }>;
  rooms: Array<{ node: string; roomId: number; label: string }>;
};
export function PreparedCampusModel({
  url,
  mapping,
  onRoomSelect,
}: {
  url: string;
  mapping: ModelMapping;
  onRoomSelect?: (id: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    applyFloor = useRef<(id: string) => void>(() => {});
  const [floor, setFloor] = useState('all'),
    [selected, setSelected] = useState<ModelMapping['rooms'][number] | null>(null),
    [error, setError] = useState('');
  const mappingJson = JSON.stringify(mapping);
  useEffect(() => {
    let disposed = false,
      cleanup = () => {};
    const abort = new AbortController();
    setError('');
    Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/controls/OrbitControls.js'),
    ])
      .then(async ([THREE, { GLTFLoader }, { OrbitControls }]) => {
        if (disposed || !host.current) return;
        const target = host.current;
        let renderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch {
          setError('3D is unavailable on this device. Use the 2D campus map and room selector.');
          return;
        }
        try {
          const response = await fetch(url, { credentials: 'same-origin', signal: abort.signal });
          if (!response.ok) throw new Error('The prepared model is unavailable.');
          const model = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
          if (disposed) {
            renderer.dispose();
            return;
          }
          const prepared: ModelMapping = JSON.parse(mappingJson);
          const nodes = new Map<string, import('three').Object3D>();
          model.scene.traverse((object) => {
            if (object.name) nodes.set(object.name, object);
          });
          const absent = [...prepared.floors, ...prepared.rooms].filter(
            (item) => !nodes.has(item.node),
          );
          if (absent.length)
            throw new Error(
              `The model does not contain mapped objects: ${absent
                .slice(0, 5)
                .map((a) => a.node)
                .join(', ')}. Correct the prepared model mapping.`,
            );
          const scene = new THREE.Scene();
          scene.background = new THREE.Color('#061525');
          scene.add(model.scene);
          scene.add(new THREE.HemisphereLight(0xffffff, 0x446688, 2));
          const light = new THREE.DirectionalLight(0xffffff, 2);
          light.position.set(10, 25, 15);
          scene.add(light);
          const bounds = new THREE.Box3().setFromObject(model.scene);
          if (bounds.isEmpty()) throw new Error('The model has no viewable geometry.');
          const center = bounds.getCenter(new THREE.Vector3()),
            size = bounds.getSize(new THREE.Vector3()).length();
          const camera = new THREE.PerspectiveCamera(50, 1, 0.01, Math.max(size * 30, 1000));
          camera.position.copy(center).add(new THREE.Vector3(size * 0.8, size * 0.65, size * 0.8));
          renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
          target.appendChild(renderer.domElement);
          const controls = new OrbitControls(camera, renderer.domElement);
          controls.target.copy(center);
          controls.enableDamping = true;
          controls.update();
          const resize = () => {
            renderer.setSize(target.clientWidth, target.clientHeight);
            camera.aspect = target.clientWidth / target.clientHeight;
            camera.updateProjectionMatrix();
          };
          const observer = new ResizeObserver(resize);
          observer.observe(target);
          resize();
          applyFloor.current = (id) => {
            for (const floor of prepared.floors)
              nodes.get(floor.node)!.visible = id === 'all' || String(floor.floorId) === id;
          };
          const ray = new THREE.Raycaster(),
            pointer = new THREE.Vector2();
          let startX = 0,
            startY = 0,
            frame = 0;
          const down = (event: PointerEvent) => {
            startX = event.clientX;
            startY = event.clientY;
          };
          const pick = (event: PointerEvent) => {
            if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5) return;
            const box = renderer.domElement.getBoundingClientRect();
            pointer.set(
              ((event.clientX - box.left) / box.width) * 2 - 1,
              (-(event.clientY - box.top) / box.height) * 2 + 1,
            );
            ray.setFromCamera(pointer, camera);
            const hit = ray.intersectObject(model.scene, true).find((hit) => {
              let parent: import('three').Object3D | null = hit.object;
              while (parent) {
                if (!parent.visible) return false;
                parent = parent.parent;
              }
              return true;
            });
            let object = hit?.object;
            while (object) {
              const match = prepared.rooms.find((room) => room.node === object!.name);
              if (match) {
                setSelected(match);
                return;
              }
              object = object.parent ?? undefined;
            }
            setSelected(null);
          };
          renderer.domElement.addEventListener('pointerdown', down);
          renderer.domElement.addEventListener('pointerup', pick);
          const render = () => {
            controls.update();
            renderer.render(scene, camera);
            frame = requestAnimationFrame(render);
          };
          render();
          cleanup = () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            controls.dispose();
            applyFloor.current = () => {};
            renderer.domElement.removeEventListener('pointerdown', down);
            renderer.domElement.removeEventListener('pointerup', pick);
            model.scene.traverse((object) => {
              const mesh = object as import('three').Mesh;
              mesh.geometry?.dispose();
              for (const material of Array.isArray(mesh.material)
                ? mesh.material
                : mesh.material
                  ? [mesh.material]
                  : []) {
                for (const value of Object.values(material))
                  if (value instanceof THREE.Texture) value.dispose();
                material.dispose();
              }
            });
            renderer.dispose();
            renderer.domElement.remove();
          };
        } catch (err) {
          renderer.dispose();
          if (!disposed)
            setError(err instanceof Error ? err.message : 'Prepared model could not be loaded.');
        }
      })
      .catch(() => {
        if (!disposed) setError('3D renderer could not be loaded.');
      });
    return () => {
      disposed = true;
      abort.abort();
      cleanup();
    };
  }, [url, mappingJson]);
  return (
    <>
      <label>
        Model floor
        <select
          aria-label="Model floor"
          value={floor}
          onChange={(e) => {
            setFloor(e.target.value);
            setSelected(null);
            applyFloor.current(e.target.value);
          }}
        >
          <option value="all">All prepared floors</option>
          {mapping.floors.map((item) => (
            <option key={item.node} value={item.floorId}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div
        className="prepared-model-host"
        ref={host}
        role="img"
        aria-label="Recorded school model with selectable mapped floors and rooms"
      />
      <p>
        Drag to orbit, scroll to zoom, and click a mapped room. Floor and room links use the
        school’s prepared object names.
      </p>
      {selected && (
        <div className="ops-notice">
          <strong>{selected.label}</strong>
          {onRoomSelect && (
            <button className="school-back" onClick={() => onRoomSelect(selected.roomId)}>
              Open room record
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </>
  );
}
