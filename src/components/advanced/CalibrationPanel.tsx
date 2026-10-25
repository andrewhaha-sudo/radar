import { Prerequisite } from '@/components/workspace/Prerequisite';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { ToolForm, type Row } from './tools';
export function CalibrationPanel() {
  const [scans, setScans] = useState<Row[]>([]),
    [scanId, setScanId] = useState(''),
    [data, setData] = useState<Row | null>(null),
    [photo, setPhoto] = useState(''),
    [observation, setObservation] = useState(''),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api
      .get<{ scans: Row[] }>('/api/scans')
      .then((result) => setScans(result.scans.filter((row) => row.status === 'draft')))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (scanId)
      api
        .get<Row>(`/api/scans/${scanId}`)
        .then(setData)
        .catch((err) => setError(errorMessage(err)));
  }, [scanId]);
  async function locate(e: React.MouseEvent<HTMLImageElement>) {
    if (!photo || !observation) return;
    const rectangle = e.currentTarget.getBoundingClientRect();
    try {
      const result = await api.post<{ x: number; y: number }>(
        `/api/advanced/observations/${observation}/project`,
        {
          photoId: photo,
          x: (e.clientX - rectangle.left) / rectangle.width,
          y: (e.clientY - rectangle.top) / rectangle.height,
        },
      );
      setNotice(
        `Approximate room position ${result.x.toFixed(3)}, ${result.y.toFixed(3)} saved. It will be attached to the finding when submitted; human verification is still required.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  if (!loaded && !error)
    return (
      <p role="status" className="studio-caption">
        Loading draft inspections…
      </p>
    );
  if (loaded && !error && !scans.length)
    return (
      <Prerequisite
        title="Start with a room photo."
        description="This tool places a finding onto a room plan using measured photo anchors. First create a draft inspection and attach evidence."
        to="/scan"
        action="Start a room inspection"
      />
    );
  return (
    <>
      <section className="ops-card">
        <h2>Place findings from calibrated evidence</h2>
        <p>
          Use four known image-to-room anchor pairs on the same planar surface. Ordinary camera
          photos cannot locate a hazard without this geometric evidence. This tool computes an
          approximate projection, not a hidden 3D reconstruction.
        </p>
        <label>
          Draft inspection
          <select
            aria-label="Calibration inspection"
            value={scanId}
            onChange={(e) => {
              setScanId(e.target.value);
              setPhoto('');
              setObservation('');
            }}
          >
            <option value="">Choose inspection…</option>
            {scans.map((row) => (
              <option key={row.id} value={row.id}>
                {row.buildingName} · {row.roomName} · #{row.id}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <div className="ops-form-grid">
            <label>
              Evidence image
              <select value={photo} onChange={(e) => setPhoto(e.target.value)}>
                <option value="">Choose image…</option>
                {data.photos.map((row: Row) => (
                  <option key={row.id} value={row.id}>
                    #{row.id} · {row.caption || 'Inspection photo'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finding to place
              <select value={observation} onChange={(e) => setObservation(e.target.value)}>
                <option value="">Choose finding…</option>
                {data.observations.map((row: Row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {photo && (
          <img
            className="calibration-image"
            src={data?.photos.find((row: Row) => String(row.id) === photo)?.url}
            onClick={(e) => void locate(e)}
            alt="Calibrated evidence; click the finding location after saving verified anchors"
          />
        )}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </section>
      {photo && (
        <ToolForm
          key={photo}
          title="Save verified planar anchor pairs"
          path={`/api/advanced/photos/${photo}/calibrate`}
          fields={[
            {
              name: 'anchors',
              label: 'Four anchor pairs [[imageX,imageY,roomX,roomY], …], normalized 0–1',
              type: 'json',
            },
            { name: 'source', label: 'Survey / anchor verification source' },
            {
              name: 'verified',
              label: 'I verified all four correspondences on the same plane',
              type: 'checkbox',
            },
          ]}
        />
      )}
    </>
  );
}
