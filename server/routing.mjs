export function meters(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]),
    dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function inside(point, ring) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function blocked(a, b, zones) {
  const p = [a[1], a[0]],
    q = [b[1], b[0]];
  for (const z of zones) {
    if (!z.verified || (z.expires_at && Date.parse(z.expires_at) < Date.now())) continue;
    const geo = typeof z.geometry === 'string' ? JSON.parse(z.geometry) : z.geometry;
    const ring = geo.coordinates?.[0];
    if (!ring) continue;
    if (inside(p, ring) || inside(q, ring)) return true;
    for (let i = 1; i < ring.length; i++) {
      const c = ring[i - 1],
        d = ring[i];
      const r1 = cross(p, q, c),
        r2 = cross(p, q, d),
        r3 = cross(c, d, p),
        r4 = cross(c, d, q);
      const on = (a, b, c) =>
        Math.abs(cross(a, b, c)) < 1e-12 &&
        c[0] >= Math.min(a[0], b[0]) - 1e-12 &&
        c[0] <= Math.max(a[0], b[0]) + 1e-12 &&
        c[1] >= Math.min(a[1], b[1]) - 1e-12 &&
        c[1] <= Math.max(a[1], b[1]) + 1e-12;
      if ((r1 * r2 < 0 && r3 * r4 < 0) || on(p, q, c) || on(p, q, d) || on(c, d, p) || on(c, d, q))
        return true;
    }
  }
  return false;
}
export function planEvacuation({
  routes,
  points,
  zones = [],
  occupancy = [],
  buildingId,
  pointId,
  accessible = false,
  now = Date.now(),
}) {
  const graph = new Map(),
    starts = new Set(),
    targets = new Map();
  const key = (p) => p.map((x) => Number(x).toFixed(6)).join(',');
  const usablePoints = points
    .filter(
      (p) => p.status === 'open' && (!accessible || p.accessible) && (!pointId || p.id === pointId),
    )
    .filter((p) => {
      const report = occupancy.find((o) => o.assembly_point_id === p.id);
      return !(
        p.capacity > 0 &&
        report &&
        now - Date.parse(report.observed_at) < 600000 &&
        report.count >= p.capacity
      );
    });
  for (const route of routes) {
    if (route.status !== 'open' || !route.verified || (accessible && !route.accessible)) continue;
    const path = typeof route.path === 'string' ? JSON.parse(route.path) : route.path;
    if (!Array.isArray(path) || path.length < 2) continue;
    if (route.building_id === buildingId) starts.add(key(path[0]));
    const destination = usablePoints.find((p) => p.id === route.assembly_point_id);
    if (destination) targets.set(key(path[path.length - 1]), destination);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if (
        blocked(
          a,
          b,
          zones.filter((z) =>
            ['restricted', 'blocked', 'fire', 'flood', 'landslide'].includes(z.kind),
          ),
        )
      )
        continue;
      for (const p of [a, b]) if (!graph.has(key(p))) graph.set(key(p), { point: p, edges: [] });
      graph.get(key(a)).edges.push({ to: key(b), cost: meters(a, b), routeId: route.id });
      if (!route.one_way)
        graph.get(key(b)).edges.push({ to: key(a), cost: meters(a, b), routeId: route.id });
    }
  }
  const distance = new Map(),
    previous = new Map(),
    open = new Set();
  for (const s of starts)
    if (graph.has(s)) {
      distance.set(s, 0);
      open.add(s);
    }
  let goal;
  while (open.size) {
    let current;
    for (const candidate of open)
      if (current === undefined || distance.get(candidate) < distance.get(current))
        current = candidate;
    open.delete(current);
    if (targets.has(current)) {
      goal = current;
      break;
    }
    for (const edge of graph.get(current).edges) {
      const next = distance.get(current) + edge.cost;
      if (next < (distance.get(edge.to) ?? Infinity)) {
        distance.set(edge.to, next);
        previous.set(edge.to, { node: current, routeId: edge.routeId });
        open.add(edge.to);
      }
    }
  }
  if (!goal)
    return {
      available: false,
      reason:
        'No connected, verified open route is available for these constraints. Do not infer a safe route from the basemap.',
    };
  const path = [],
    used = new Set();
  let cursor = goal;
  while (cursor) {
    path.unshift(graph.get(cursor).point);
    const p = previous.get(cursor);
    if (p) used.add(p.routeId);
    cursor = p?.node;
  }
  const length = distance.get(goal);
  return {
    available: true,
    path,
    routeIds: [...used],
    assemblyPoint: targets.get(goal),
    distanceMeters: Math.round(length),
    estimatedMinutes: Math.ceil(length / (accessible ? 1 : 1.2) / 60),
    source: 'Registered verified walkways; computed geodesic distance',
    note: 'Estimated walking time excludes congestion and changing conditions. Approved school plans and responders take precedence.',
  };
}
