import crypto from 'node:crypto';
export function csvRows(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024)
    throw new Error('Use a CSV smaller than 1 MB.');
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted) quoted = false;
      else if (field === '') quoted = true;
      else throw new Error('Invalid CSV quoting.');
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quotation.');
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 501) throw new Error('CSV needs a header and 1–500 rows.');
  const headers = rows.shift().map((x) => x.replace(/^\uFEFF/, '').trim());
  if (new Set(headers).size !== headers.length || !headers.includes('name'))
    throw new Error('Use unique CSV headers including name; optional email and externalRef.');
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      throw new Error(`CSV row ${i + 2} has the wrong number of columns.`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
  });
}
export function csvCell(value) {
  const text = String(value ?? '');
  return (
    '"' +
    (typeof value === 'string' && /^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll(
      '"',
      '""',
    ) +
    '"'
  );
}
export function projectPoint(anchors, x, y) {
  if (!Array.isArray(anchors) || anchors.length !== 4)
    throw new Error('Four verified image-to-room anchor pairs are required.');
  const matrix = [];
  for (const a of anchors) {
    if (!Array.isArray(a) || a.length !== 4 || a.some((v) => !Number.isFinite(v) || v < 0 || v > 1))
      throw new Error('Anchor coordinates must be normalized 0–1.');
    const [u, v, X, Y] = a;
    matrix.push([u, v, 1, 0, 0, 0, -u * X, -v * X, X], [0, 0, 0, u, v, 1, -u * Y, -v * Y, Y]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++)
      if (Math.abs(matrix[r][col]) > Math.abs(matrix[pivot][col])) pivot = r;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const d = matrix[col][col];
    if (Math.abs(d) < 1e-10)
      throw new Error('Anchor pairs are degenerate; choose four distinct non-collinear corners.');
    for (let j = col; j < 9; j++) matrix[col][j] /= d;
    for (let r = 0; r < 8; r++)
      if (r !== col) {
        const f = matrix[r][col];
        for (let j = col; j < 9; j++) matrix[r][j] -= f * matrix[col][j];
      }
  }
  const h = matrix.map((r) => r[8]),
    den = h[6] * x + h[7] * y + 1;
  const point = [(h[0] * x + h[1] * y + h[2]) / den, (h[3] * x + h[4] * y + h[5]) / den];
  if (point.some((v) => !Number.isFinite(v) || v < 0 || v > 1))
    throw new Error('This point maps outside the room; do not infer a location.');
  return point;
}
export function relayPacket(input, now = Date.now()) {
  if (
    input?.version !== 1 ||
    !/^[-a-zA-Z0-9]{12,80}$/.test(input.id ?? '') ||
    !/^\d{6}$/.test(input.school ?? '') ||
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    Date.parse(input.expiresAt) <= now ||
    Date.parse(input.expiresAt) > now + 15 * 60000
  )
    throw new Error('Invalid or expired relay packet.');
  if (
    !['medical', 'fire', 'earthquake', 'other'].includes(input.kind) ||
    typeof input.note !== 'string' ||
    input.note.length > 500
  )
    throw new Error('Invalid relay content.');
  return {
    version: 1,
    training: input.training === true,
    id: input.id,
    school: input.school,
    kind: input.kind,
    note: input.note,
    expiresAt: input.expiresAt,
    unverified: true,
  };
}
export function deviceHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
export function safeEqual(a, b) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function officialUrl(raw) {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    [...url.searchParams.keys()].some(
      (key) =>
        !['f', 'format', 'where', 'outFields', 'outSR', 'returnGeometry', 'bbox', 'limit'].includes(
          key,
        ),
    ) ||
    url.hash ||
    ![
      'pagasa.dost.gov.ph',
      'phivolcs.dost.gov.ph',
      'mgb.gov.ph',
      'geoportal.gov.ph',
      'georisk.gov.ph',
      'usgs.gov',
    ].some((h) => url.hostname === h || url.hostname.endsWith('.' + h))
  )
    throw new Error(
      'Use a public HTTPS dataset from a supported official agency, without credentials or query tokens.',
    );
  return url.toString();
}
export function geoDataset(input) {
  if (
    input?.type !== 'FeatureCollection' ||
    !Array.isArray(input.features) ||
    input.features.length > 3000
  )
    throw new Error('Use a GeoJSON FeatureCollection with at most 3,000 features.');
  let points = 0;
  const walk = (c) => {
    if (!Array.isArray(c) || !c.length) throw new Error('Invalid coordinates.');
    if (typeof c[0] === 'number') {
      if (
        c.length < 2 ||
        !c.slice(0, 3).every(Number.isFinite) ||
        Math.abs(c[0]) > 180 ||
        Math.abs(c[1]) > 90
      )
        throw new Error('Use WGS84 longitude/latitude.');
      if (++points > 60000) throw new Error('Dataset has too many vertices.');
      return c.slice(0, 3);
    }
    return c.map(walk);
  };
  return {
    type: 'FeatureCollection',
    features: input.features.map((f, index) => {
      if (
        !['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(
          f.geometry?.type,
        )
      )
        throw new Error('Unsupported geometry type.');
      const coordinates = walk(f.geometry.coordinates);
      const position = (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number';
      const line = (p) => Array.isArray(p) && p.length >= 2 && p.every(position);
      const polygon = (p) =>
        Array.isArray(p) &&
        p.length > 0 &&
        p.every(
          (r) => line(r) && r.length >= 4 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1],
        );
      const valid =
        f.geometry.type === 'Point'
          ? position(coordinates)
          : f.geometry.type === 'LineString'
            ? line(coordinates)
            : f.geometry.type === 'MultiLineString'
              ? coordinates.every(line)
              : f.geometry.type === 'Polygon'
                ? polygon(coordinates)
                : coordinates.every(polygon);
      if (!valid)
        throw new Error('Coordinate nesting or polygon closure does not match the geometry type.');
      return {
        type: 'Feature',
        id: String(f.id ?? index).slice(0, 120),
        geometry: { type: f.geometry.type, coordinates },
        properties: {
          ...Object.fromEntries(
            Object.entries(f.properties ?? {})
              .filter(
                ([key, value]) =>
                  !['__proto__', 'constructor', 'prototype'].includes(key) &&
                  key.length <= 80 &&
                  ['string', 'number', 'boolean'].includes(typeof value),
              )
              .slice(0, 30)
              .map(([key, value]) => [
                key,
                typeof value === 'string' ? value.slice(0, 1000) : value,
              ]),
          ),
          name: String(
            f.properties?.name ?? f.properties?.title ?? 'Official mapped feature',
          ).slice(0, 180),
          description: String(f.properties?.description ?? '').slice(0, 1500),
        },
      };
    }),
  };
}
export function summarize(rows, spec) {
  const allowed = {
    hazards: ['building', 'room', 'severity', 'status', 'category', 'month'],
    inspections: ['building', 'room', 'status', 'month'],
    incidents: ['severity', 'status', 'kind', 'month'],
  };
  if (
    !allowed[spec.dataset] ||
    !Array.isArray(spec.groupBy) ||
    !spec.groupBy.length ||
    spec.groupBy.length > 3 ||
    spec.groupBy.some((k) => !allowed[spec.dataset].includes(k))
  )
    throw new Error('Choose a supported dataset and one to three grouping fields.');
  const groups = new Map();
  for (const row of rows) {
    const values = spec.groupBy.map((k) =>
      k === 'month'
        ? String(row.createdAt ?? row.startedAt ?? '').slice(0, 7)
        : String(row[k] ?? 'Unspecified'),
    );
    const key = JSON.stringify(values);
    if (!groups.has(key))
      groups.set(key, {
        group: Object.fromEntries(spec.groupBy.map((k, i) => [k, values[i]])),
        count: 0,
        resolved: 0,
        totalResolutionHours: 0,
        resolutionSamples: 0,
      });
    const g = groups.get(key);
    g.count++;
    if (row.resolvedAt && row.createdAt) {
      const hours = (Date.parse(row.resolvedAt) - Date.parse(row.createdAt)) / 3600000;
      if (Number.isFinite(hours) && hours >= 0) {
        g.resolved++;
        g.totalResolutionHours += hours;
        g.resolutionSamples++;
      }
    }
  }
  return [...groups.values()].map((g) => ({
    ...g,
    averageResolutionHours: g.resolutionSamples
      ? Math.round((g.totalResolutionHours / g.resolutionSamples) * 100) / 100
      : null,
  }));
}
