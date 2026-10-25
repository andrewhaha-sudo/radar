import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
type Frame = { blob: Blob; preview: string; second: number };
export function VideoFrames({ scanId, onSaved }: { scanId: number; onSaved: () => void }) {
  const [frames, setFrames] = useState<Frame[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function extract(file: File) {
    if (file.size > 200 * 1024 * 1024) {
      setError('Use a video smaller than 200 MB.');
      return;
    }
    setBusy(true);
    setError('');
    for (const f of frames) URL.revokeObjectURL(f.preview);
    setFrames([]);
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Video loading timed out.')), 15000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('This browser cannot decode that video.'));
        };
        video.src = url;
      });
      if (!Number.isFinite(video.duration) || video.duration > 300)
        throw new Error('Use a walkthrough up to five minutes long.');
      const result: Frame[] = [];
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image extraction is unavailable.');
      for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        const second = video.duration * fraction;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Video frame loading timed out.')),
            10000,
          );
          video.onseeked = () => {
            clearTimeout(timer);
            resolve();
          };
          video.currentTime = second;
        });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Frame capture failed.'))),
            'image/jpeg',
            0.85,
          ),
        );
        result.push({ blob, preview: URL.createObjectURL(blob), second });
      }
      setFrames(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }
  return (
    <section className="ops-card">
      <h3>Guided video walkthrough frames</h3>
      <p>
        Record the entrance, exits, walls, ceiling, electrical areas and safety equipment.
        Processing stays on this device until you choose to upload the five preview frames; the
        original video is not uploaded.
      </p>
      <input
        type="file"
        accept="video/*"
        capture="environment"
        disabled={busy}
        aria-label="Choose walkthrough video"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void extract(file);
        }}
      />
      {frames.length > 0 && (
        <>
          <div className="video-frame-grid">
            {frames.map((f) => (
              <figure key={f.second}>
                <img src={f.preview} alt={`Walkthrough frame at ${f.second.toFixed(1)} seconds`} />
                <figcaption>{f.second.toFixed(1)} seconds</figcaption>
              </figure>
            ))}
          </div>
          <button
            className="command-action blue"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                for (const f of frames) {
                  const file = new File([f.blob], `walkthrough-${f.second.toFixed(1)}.jpg`, {
                    type: 'image/jpeg',
                  });
                  const uploaded = await api.upload(file);
                  await api.post(`/api/scans/${scanId}/photos`, {
                    url: uploaded.url,
                    caption: `Walkthrough video frame at ${f.second.toFixed(1)} seconds`,
                  });
                }
                for (const f of frames) URL.revokeObjectURL(f.preview);
                setFrames([]);
                onSaved();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Processing…' : 'Upload reviewed frames'}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
