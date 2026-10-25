export const UPLOAD_MIMES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'model/gltf-binary': '.glb',
  'application/octet-stream': '.glb',
};
export function validateGlb(buf) {
  if (
    buf.length < 20 ||
    buf.toString('ascii', 0, 4) !== 'glTF' ||
    buf.readUInt32LE(4) !== 2 ||
    buf.readUInt32LE(8) !== buf.length ||
    buf.toString('ascii', 16, 20) !== 'JSON'
  )
    throw new Error('Invalid GLB');
  const doc = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
  if (
    [...(doc.buffers ?? []), ...(doc.images ?? [])].some(
      (asset) => asset.uri && !asset.uri.startsWith('data:'),
    )
  )
    throw new Error('External model resources are not allowed');
}
