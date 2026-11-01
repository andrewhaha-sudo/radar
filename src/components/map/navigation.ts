export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A positive walkability mask keeps the image, fences, trees and buildings intact.
// Coordinates are always source-image pixels, independent of display size or zoom.
export function isWalkable(point: Point, areas: Rect[], radius = 3) {
  return [
    [0, 0],
    [-radius, 0],
    [radius, 0],
    [0, -radius],
    [0, radius],
  ].every(([dx, dy]) =>
    areas.some(
      (r) =>
        point.x + dx >= r.x &&
        point.x + dx <= r.x + r.width &&
        point.y + dy >= r.y &&
        point.y + dy <= r.y + r.height,
    ),
  );
}

export function canTravel(from: Point, to: Point, areas: Rect[]) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2),
  );
  for (let i = 0; i <= steps; i++) {
    if (
      !isWalkable(
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
        areas,
      )
    )
      return false;
  }
  return true;
}

/** Four-way A*, with no diagonal corner cutting or teleporting across obstacles. */
export function findPath(
  from: Point,
  to: Point,
  areas: Rect[],
): Point[] | null {
  const size = 4;
  const snap = (point: Point): Point | null => {
    const x = Math.round(point.x / size) * size;
    const y = Math.round(point.y / size) * size;
    const candidates: Point[] = [];
    for (let dy = -8; dy <= 8; dy += size)
      for (let dx = -8; dx <= 8; dx += size) {
        const p = { x: x + dx, y: y + dy };
        if (isWalkable(p, areas) && canTravel(point, p, areas))
          candidates.push(p);
      }
    return (
      candidates.sort(
        (a, b) =>
          Math.hypot(a.x - point.x, a.y - point.y) -
          Math.hypot(b.x - point.x, b.y - point.y),
      )[0] ?? null
    );
  };
  if (!isWalkable(from, areas) || !isWalkable(to, areas)) return null;
  const start = snap(from),
    goal = snap(to);
  if (!start || !goal) return null;
  const key = (p: Point) => `${p.x},${p.y}`;
  const heuristic = (p: Point) =>
    Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
  const open = [start];
  const cost = new Map([[key(start), 0]]);
  const parent = new Map<string, Point>();
  const closed = new Set<string>();
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      if (
        cost.get(key(open[i]))! + heuristic(open[i]) <
        cost.get(key(open[best]))! + heuristic(open[best])
      )
        best = i;
    }
    const current = open.splice(best, 1)[0];
    const currentKey = key(current);
    if (currentKey === key(goal)) {
      const points = [to, goal];
      let cursor = current;
      while (parent.has(key(cursor))) {
        cursor = parent.get(key(cursor))!;
        points.push(cursor);
      }
      points.push(from);
      return points
        .reverse()
        .filter(
          (p, i, all) =>
            i === 0 ||
            i === all.length - 1 ||
            !(
              (all[i - 1].x === p.x && p.x === all[i + 1].x) ||
              (all[i - 1].y === p.y && p.y === all[i + 1].y)
            ),
        );
    }
    closed.add(currentKey);
    for (const [dx, dy] of [
      [size, 0],
      [-size, 0],
      [0, size],
      [0, -size],
    ]) {
      const next = { x: current.x + dx, y: current.y + dy },
        nextKey = key(next);
      if (closed.has(nextKey) || !canTravel(current, next, areas)) continue;
      const nextCost = cost.get(currentKey)! + size;
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue;
      if (!cost.has(nextKey)) open.push(next);
      cost.set(nextKey, nextCost);
      parent.set(nextKey, current);
    }
  }
  return null;
}
