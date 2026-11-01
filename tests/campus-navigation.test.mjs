import test from "node:test";
import assert from "node:assert/strict";
import {
  findPath,
  canTravel,
  isWalkable,
} from "../src/components/map/navigation.ts";
import { scenes, places } from "../src/components/map/campus-data.ts";

test("every mapped campus entrance is reachable without crossing a blocked area", () => {
  const { spawn, walkable } = scenes.campus;
  for (const place of places.filter((place) => place.arrival)) {
    const route = findPath(spawn, place.arrival, walkable);
    assert.ok(route, `${place.name} must be reachable`);
    assert.deepEqual(route.at(-1), place.arrival);
    for (let i = 1; i < route.length; i++)
      assert.ok(canTravel(route[i - 1], route[i], walkable));
  }
});

test("all sixteen classroom doors and both sets of stairs have connected approaches", () => {
  assert.deepEqual(
    ["a1", "b1", "b2", "six1", "six2"].map((id) => scenes[id].rooms.length),
    [2, 2, 2, 5, 5],
  );
  for (const scene of Object.values(scenes).filter(
    (scene) => scene.rooms.length,
  )) {
    for (const target of [
      ...scene.rooms.map((room) => room.point),
      ...(scene.stairs ? [scene.stairs.point] : []),
    ]) {
      const route = findPath(scene.spawn, target, scene.walkable);
      assert.ok(route, `${scene.name} has a disconnected destination`);
      for (let i = 1; i < route.length; i++)
        assert.ok(canTravel(route[i - 1], route[i], scene.walkable));
    }
    if (scene.stairs) {
      const other = scenes[scene.stairs.to];
      assert.equal(
        scenes[other.stairs.to],
        scene,
        "stairs must connect back to the originating floor",
      );
    }
  }
});

test("pond, trees, buildings, fence and decorative regions are non-walkable", () => {
  for (const point of [
    { x: 212, y: 620 },
    { x: 700, y: 950 },
    { x: 604, y: 350 },
    { x: 800, y: 759 },
    { x: 620, y: 80 },
    { x: 600, y: 1150 },
  ]) {
    assert.equal(isWalkable(point, scenes.campus.walkable), false);
    assert.equal(
      findPath(scenes.campus.spawn, point, scenes.campus.walkable),
      null,
    );
  }
});

test("movement cannot tunnel through a wall even during a long step", () => {
  const areas = [
    { x: 0, y: 0, width: 20, height: 20 },
    { x: 24, y: 0, width: 20, height: 20 },
  ];
  assert.equal(canTravel({ x: 10, y: 10 }, { x: 34, y: 10 }, areas), false);
  assert.equal(findPath({ x: 10, y: 10 }, { x: 34, y: 10 }, areas), null);
});

test("A* follows an L-shaped hallway without cutting its corner", () => {
  const areas = [
    { x: 0, y: 0, width: 100, height: 20 },
    { x: 80, y: 0, width: 20, height: 100 },
  ];
  const from = { x: 10, y: 10 },
    to = { x: 90, y: 90 };
  assert.equal(canTravel(from, to, areas), false);
  const route = findPath(from, to, areas);
  assert.ok(route);
  for (let i = 1; i < route.length; i++)
    assert.ok(canTravel(route[i - 1], route[i], areas));
});
