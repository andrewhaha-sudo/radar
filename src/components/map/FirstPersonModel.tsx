import { useEffect, useRef, useState } from 'react';
type Setup = { spawn: [number, number, number]; eyeHeight: number; verified: boolean };
export function FirstPersonModel({ url, setup }: { url: string; setup: Setup }) {
  const [spawnX, spawnY, spawnZ] = setup.spawn;
  const eyeHeight = setup.eyeHeight;
  const host = useRef<HTMLDivElement>(null),
    keys = useRef(new Set<string>());
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false,
      cleanup = () => {};
    const controller = new AbortController();
    setError('');
    Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js')])
      .then(async ([THREE, { GLTFLoader }]) => {
        if (stopped || !host.current) return;
        const target = host.current;
        let renderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch {
          setError('This device cannot run the 3D walkthrough. Use the 2D floor plan.');
          return;
        }
        try {
          const response = await fetch(url, {
            credentials: 'same-origin',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('Prepared model could not be loaded.');
          const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
          if (stopped) {
            renderer.dispose();
            return;
          }
          const scene = new THREE.Scene();
          scene.background = new THREE.Color('#071321');
          scene.add(gltf.scene);
          scene.add(new THREE.HemisphereLight(0xffffff, 0x445577, 2));
          const sun = new THREE.DirectionalLight(0xffffff, 2);
          sun.position.set(10, 30, 10);
          scene.add(sun);
          const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 2000);
          camera.position.set(spawnX, spawnY + eyeHeight, spawnZ);
          renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
          target.appendChild(renderer.domElement);
          let yaw = 0,
            pitch = 0,
            drag = false,
            lastX = 0,
            lastY = 0,
            frame = 0,
            lastTime = performance.now();
          const resize = () => {
            renderer.setSize(target.clientWidth, target.clientHeight);
            camera.aspect = target.clientWidth / target.clientHeight;
            camera.updateProjectionMatrix();
          };
          const observer = new ResizeObserver(resize);
          observer.observe(target);
          resize();
          const canvas = renderer.domElement;
          const down = (e: PointerEvent) => {
            drag = true;
            lastX = e.clientX;
            lastY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
            target.focus();
          };
          const move = (e: PointerEvent) => {
            if (!drag) return;
            yaw -= (e.clientX - lastX) * 0.004;
            pitch = Math.max(-1.4, Math.min(1.4, pitch - (e.clientY - lastY) * 0.004));
            lastX = e.clientX;
            lastY = e.clientY;
          };
          const up = () => {
            drag = false;
          };
          const keyboard = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (
              ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
            ) {
              e.preventDefault();
              keys.current.add(key);
            }
          };
          const release = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
          const blur = () => keys.current.clear();
          canvas.addEventListener('pointerdown', down);
          canvas.addEventListener('pointermove', move);
          canvas.addEventListener('pointerup', up);
          canvas.addEventListener('pointercancel', up);
          target.addEventListener('keydown', keyboard);
          target.addEventListener('keyup', release);
          window.addEventListener('blur', blur);
          target.addEventListener('blur', blur);
          const ray = new THREE.Raycaster(),
            delta = new THREE.Vector3(),
            candidate = new THREE.Vector3(),
            direction = new THREE.Vector3();
          const render = (time: number) => {
            const dt = Math.min(0.05, (time - lastTime) / 1000);
            lastTime = time;
            camera.rotation.set(pitch, yaw, 0, 'YXZ');
            delta.set(0, 0, 0);
            const held = keys.current;
            if (held.has('w') || held.has('arrowup')) delta.z -= 1;
            if (held.has('s') || held.has('arrowdown')) delta.z += 1;
            if (held.has('a') || held.has('arrowleft')) delta.x -= 1;
            if (held.has('d') || held.has('arrowright')) delta.x += 1;
            if (delta.lengthSq()) {
              delta
                .normalize()
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
                .multiplyScalar(dt * 1.5);
              direction.copy(delta).normalize();
              ray.set(camera.position, direction);
              ray.far = delta.length() + 0.25;
              const obstruction = ray.intersectObject(gltf.scene, true);
              if (!obstruction.length) {
                candidate.copy(camera.position).add(delta);
                ray.set(
                  new THREE.Vector3(candidate.x, candidate.y + 0.35, candidate.z),
                  new THREE.Vector3(0, -1, 0),
                );
                ray.far = eyeHeight + 0.75;
                const ground = ray
                  .intersectObject(gltf.scene, true)
                  .find(
                    (hit) =>
                      hit.face &&
                      hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.2,
                  );
                if (ground) {
                  camera.position.x = candidate.x;
                  camera.position.z = candidate.z;
                  camera.position.y = ground.point.y + eyeHeight;
                }
              }
            }
            renderer.render(scene, camera);
            frame = requestAnimationFrame(render);
          };
          frame = requestAnimationFrame(render);
          cleanup = () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            canvas.removeEventListener('pointerdown', down);
            canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', up);
            canvas.removeEventListener('pointercancel', up);
            target.removeEventListener('keydown', keyboard);
            target.removeEventListener('keyup', release);
            window.removeEventListener('blur', blur);
            target.removeEventListener('blur', blur);
            keys.current.clear();
            gltf.scene.traverse((object) => {
              const mesh = object as import('three').Mesh;
              if (mesh.geometry) mesh.geometry.dispose();
              if (mesh.material) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const material of materials) {
                  for (const value of Object.values(material))
                    if (value instanceof THREE.Texture) value.dispose();
                  material.dispose();
                }
              }
            });
            renderer.dispose();
            canvas.remove();
          };
        } catch (err) {
          renderer.dispose();
          if (!stopped)
            setError(
              err instanceof Error ? err.message : 'The prepared walkthrough is unavailable.',
            );
        }
      })
      .catch(() => {
        if (!stopped) setError('The 3D walkthrough renderer could not be loaded.');
      });
    return () => {
      stopped = true;
      controller.abort();
      cleanup();
    };
  }, [url, spawnX, spawnY, spawnZ, eyeHeight]);
  return (
    <>
      <div
        className="first-person-host"
        ref={host}
        tabIndex={0}
        role="application"
        aria-label="Prepared school-model walkthrough; use W A S D or touch controls to move"
      />
      <div className="first-person-controls">
        {[
          { key: 'w', name: 'Forward', label: '↑' },
          { key: 'a', name: 'Left', label: '←' },
          { key: 's', name: 'Back', label: '↓' },
          { key: 'd', name: 'Right', label: '→' },
        ].map((button) => (
          <button
            key={button.key}
            className="command-icon-button"
            aria-label={`Move ${button.name.toLowerCase()} in model`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              keys.current.add(button.key);
            }}
            onPointerUp={() => keys.current.delete(button.key)}
            onPointerCancel={() => keys.current.delete(button.key)}
          >
            {button.label}
          </button>
        ))}
      </div>
      <p>
        Drag to look; use W/A/S/D or touch arrows to move over the prepared model’s surfaces. This
        is recorded geometry, not live conditions or approved evacuation guidance.
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </>
  );
}
