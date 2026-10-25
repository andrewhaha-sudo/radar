import { PreparedCampusModel, type ModelMapping } from './PreparedCampusModel';
import { FirstPersonModel } from './FirstPersonModel';
import { createElement, useEffect, useRef, useState } from 'react';

type Asset = { id: number; kind: string; url: string; title: string; metadata?: string };
export function RoomMedia({
  assets,
  onRoomSelect,
}: {
  assets: Asset[];
  onRoomSelect?: (id: number) => void;
}) {
  const [selected, setSelected] = useState('');
  const [walk, setWalk] = useState(false);
  const asset = assets.find((a) => String(a.id) === selected) ?? assets[0];
  let metadata: {
    mapping?: ModelMapping;
    walkthrough?: { spawn: [number, number, number]; eyeHeight: number; verified: boolean };
  } = {};
  try {
    metadata = JSON.parse(asset?.metadata ?? '{}');
  } catch {
    /* Legacy assets have no walkthrough setup. */
  }
  useEffect(() => {
    if (asset?.kind === 'model') import('@google/model-viewer').catch(() => {});
  }, [asset?.kind]);
  return (
    <section className="ops-card">
      <h3>3D orbit &amp; room walkthrough</h3>
      {!asset ? (
        <p>
          No prepared model or panorama has been uploaded. Use the verified 2D floor plan until real
          assets are available.
        </p>
      ) : (
        <>
          <label>
            Prepared asset
            <select value={String(asset.id)} onChange={(e) => setSelected(e.target.value)}>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} · {a.kind}
                </option>
              ))}
            </select>
          </label>
          {asset.kind === 'model' ? (
            <>
              <button
                className="school-back"
                disabled={!metadata.walkthrough?.verified}
                onClick={() => setWalk(!walk)}
              >
                {walk ? 'Return to orbit view' : 'Enter prepared first-person walkthrough'}
              </button>
              {!metadata.walkthrough?.verified && (
                <p>
                  First-person navigation requires a verified starting floor position in the actual
                  model.
                </p>
              )}
              {walk && metadata.walkthrough?.verified ? (
                <FirstPersonModel url={asset.url} setup={metadata.walkthrough} />
              ) : metadata.mapping &&
                (metadata.mapping.rooms.length > 0 || metadata.mapping.floors.length > 0) ? (
                <PreparedCampusModel
                  key={asset.id}
                  url={asset.url}
                  mapping={metadata.mapping}
                  onRoomSelect={onRoomSelect}
                />
              ) : (
                <>
                  {createElement('model-viewer', {
                    src: asset.url,
                    'camera-controls': true,
                    'touch-action': 'pan-y',
                    alt: asset.title,
                    style: { width: '100%', height: '360px', background: 'var(--muted)' },
                  })}
                  <p>
                    Drag to orbit, pinch or scroll to zoom. This displays the uploaded school model.
                  </p>
                </>
              )}
            </>
          ) : asset.kind === 'panorama' ? (
            <Panorama url={asset.url} />
          ) : (
            <img src={asset.url} alt={asset.title} className="ops-evidence" />
          )}
        </>
      )}
    </section>
  );
}
function Panorama({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cleanup = () => {};
    let stopped = false;
    setError('');
    import('three')
      .then((THREE) => {
        if (stopped || !host.current) return;
        const target = host.current;
        let renderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch {
          setError(
            'This device cannot render the panorama. The original photo is available below.',
          );
          return;
        }
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
        const texture = new THREE.TextureLoader().load(
          url,
          () => {},
          undefined,
          () => setError('The panorama could not be loaded.'),
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        const geometry = new THREE.SphereGeometry(10, 48, 32);
        geometry.scale(-1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        scene.add(new THREE.Mesh(geometry, material));
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        target.appendChild(renderer.domElement);
        let yaw = 0,
          pitch = 0,
          lastX = 0,
          lastY = 0,
          drag = false,
          frame = 0;
        const resize = () => {
          const w = target.clientWidth,
            h = target.clientHeight;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(target);
        resize();
        const down = (e: PointerEvent) => {
          drag = true;
          lastX = e.clientX;
          lastY = e.clientY;
          target.setPointerCapture(e.pointerId);
        };
        const move = (e: PointerEvent) => {
          if (!drag) return;
          yaw -= (e.clientX - lastX) * 0.004;
          pitch = Math.max(-1.3, Math.min(1.3, pitch + (e.clientY - lastY) * 0.004));
          lastX = e.clientX;
          lastY = e.clientY;
        };
        const up = () => {
          drag = false;
        };
        const keys = (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft') yaw += 0.1;
          if (e.key === 'ArrowRight') yaw -= 0.1;
          if (e.key === 'ArrowUp') pitch = Math.min(1.3, pitch + 0.1);
          if (e.key === 'ArrowDown') pitch = Math.max(-1.3, pitch - 0.1);
          if (e.key.startsWith('Arrow')) e.preventDefault();
        };
        target.addEventListener('pointerdown', down);
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
        target.addEventListener('keydown', keys);
        const render = () => {
          camera.rotation.order = 'YXZ';
          camera.rotation.y = yaw;
          camera.rotation.x = pitch;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(render);
        };
        render();
        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          target.removeEventListener('pointerdown', down);
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', up);
          target.removeEventListener('pointercancel', up);
          target.removeEventListener('keydown', keys);
          geometry.dispose();
          material.dispose();
          texture.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => setError('The panorama viewer is unavailable.'));
    return () => {
      stopped = true;
      cleanup();
    };
  }, [url]);
  return (
    <>
      <div
        ref={host}
        className="ops-panorama"
        tabIndex={0}
        role="img"
        aria-label="Uploaded 360-degree room panorama; drag or use arrow keys to look around"
      />
      <p>
        Look around with touch, mouse, or arrow keys. This is uploaded imagery, not a reconstruction
        or live camera.
      </p>
      {error && <p role="alert">{error}</p>}
      <a href={url} target="_blank" rel="noreferrer">
        Open original panorama
      </a>
    </>
  );
}
