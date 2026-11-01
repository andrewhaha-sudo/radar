import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Building2,
  Check,
  ChevronLeft,
  Crosshair,
  Footprints,
  Layers,
  MapPin,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { allRooms, places, scenes } from "./campus-data";
import type { Place, Room, SceneId } from "./campus-data";
import { canTravel, findPath } from "./navigation";
import type { Point } from "./navigation";
import "./campus-explorer.css";

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const movementKeys: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
};

function Student({
  position,
  direction,
  moving,
}: {
  position: Point;
  direction: string;
  moving: boolean;
}) {
  return (
    <g
      transform={`translate(${position.x},${position.y})`}
      className={`campus-student ${moving ? "is-walking" : ""}`}
      aria-label="Your character"
      pointerEvents="none"
    >
      <ellipse cx="0" cy="-1" rx="8" ry="3" fill="#14182d" opacity=".3" />
      <g
        className="campus-student-body"
        shapeRendering="crispEdges"
        stroke="#22213f"
        strokeWidth="1.5"
      >
        <path d="M-6-8h5v7h-6v-3h1zm7 0h5v7H1z" fill="#263351" />
        <path d="M-7-17H7v10H-7z" fill="#ffc548" />
        <path d="M-10-16h3v8h-3zm17 0h3v8H7z" fill="#f6ba87" />
        <path d="M-6-27H5v3h3v9H-7v-9h1z" fill="#f6ba87" />
        <path d="M-7-27h13v3h3v4H-9v-4h2z" fill="#7956d7" />
        <path d="M-6-25H5v2H-6z" fill="#b9a0ff" stroke="none" />
        {direction === "up" ? (
          <path d="M-5-16H5v9H-5z" fill="#5c66bd" />
        ) : (
          <path
            d={
              direction === "left"
                ? "M-6-20h2v3h-2z"
                : direction === "right"
                  ? "M4-20h2v3H4z"
                  : "M-4-20h2v3h-2zm6 0h2v3H2z"
            }
            fill="#22213f"
            stroke="none"
          />
        )}
      </g>
    </g>
  );
}

export function CampusExplorer() {
  const [sceneId, setSceneId] = useState<SceneId>("campus");
  const [position, setPosition] = useState<Point>(scenes.campus.spawn);
  const [direction, setDirection] = useState("down");
  const [moving, setMoving] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [message, setMessage] = useState(
    "Welcome! Choose a building, or walk in through the main gate.",
  );
  const [route, setRoute] = useState<Point[]>([]);
  const [zoom, setZoom] = useState(1);
  const [artOnly, setArtOnly] = useState(false);
  const [showAreas, setShowAreas] = useState(false);
  const [floorSheet, setFloorSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const player = useRef(position);
  const path = useRef<Point[]>([]);
  const arrival = useRef<(() => void) | null>(null);
  const held = useRef(new Set<string>());
  const pendingRoom = useRef<Room | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const explorer = useRef<HTMLDivElement>(null);
  const scene = scenes[sceneId];

  const cancelMovement = useCallback(() => {
    path.current = [];
    arrival.current = null;
    pendingRoom.current = null;
    setRoute([]);
    setMoving(false);
  }, []);

  const changeScene = useCallback((id: SceneId, spawn?: Point) => {
    const point = spawn ?? scenes[id].spawn;
    path.current = [];
    arrival.current = null;
    held.current.clear();
    player.current = point;
    setSceneId(id);
    setPosition(point);
    setRoute([]);
    setMoving(false);
    setZoom(1);
    setFloorSheet(false);
    viewport.current?.scrollTo(0, 0);
    setMessage(
      `${scenes[id].name}. Click a destination or use the arrow keys to explore.`,
    );
  }, []);

  const walkTo = useCallback(
    (point: Point, onArrival?: () => void) => {
      const next = findPath(player.current, point, scenes[sceneId].walkable);
      if (!next) {
        setMessage(
          "That spot is outside the mapped walkways. Choose a connected path or a building.",
        );
        return false;
      }
      held.current.clear();
      path.current = next.slice(1);
      arrival.current = onArrival ?? null;
      setRoute(next);
      setMoving(true);
      return true;
    },
    [sceneId],
  );

  const choosePlace = (place: Place) => {
    cancelMovement();
    setSelected(place);
    setSelectedRoom(null);
    if (!place.arrival) {
      setMessage(place.description);
      return;
    }
    setMessage(`Walking to ${place.name}…`);
    walkTo(place.arrival, () =>
      setMessage(
        place.interior
          ? `You reached ${place.name}. Press E or choose Enter building.`
          : place.description,
      ),
    );
    viewport.current?.focus({ preventScroll: true });
  };

  const chooseRoom = (room: Room) => {
    cancelMovement();
    setSelectedRoom(room);
    pendingRoom.current = room;
    if (sceneId === "campus") {
      const building = places.find((p) => p.id === room.scene[0]);
      if (!building?.arrival || !building.interior) {
        setMessage(
          "Building 6’s outdoor entrance is not identified. Open its floor-plan view to explore.",
        );
        pendingRoom.current = null;
        return;
      }
      setSelected(building);
      setMessage(`Walking to ${room.name} via ${building.name}…`);
      if (!walkTo(building.arrival, () => changeScene(building.interior!)))
        pendingRoom.current = null;
    } else if (sceneId === room.scene) {
      pendingRoom.current = null;
      walkTo(room.point, () =>
        setMessage(
          `${room.name} · Floor ${room.scene.endsWith("2") ? 2 : 1}. You have reached the classroom door.`,
        ),
      );
    } else if (scene.stairs && scene.stairs.to === room.scene) {
      walkTo(scene.stairs.point, () =>
        changeScene(room.scene, scenes[room.scene].stairs!.point),
      );
    }
  };

  useEffect(() => {
    const room = pendingRoom.current;
    if (!room || sceneId === "campus") return;
    if (room.scene === sceneId) {
      pendingRoom.current = null;
      walkTo(room.point, () =>
        setMessage(
          `${room.name} · Floor ${room.scene.endsWith("2") ? 2 : 1}. You have reached the classroom door.`,
        ),
      );
    } else if (scene.stairs?.to === room.scene) {
      walkTo(scene.stairs.point, () =>
        changeScene(room.scene, scenes[room.scene].stairs!.point),
      );
    }
  }, [sceneId, scene, walkTo, changeScene]);

  useEffect(() => {
    if (artOnly || floorSheet) return;
    let frame = 0,
      previous = 0;
    const animate = (time: number) => {
      const dt = Math.min((time - (previous || time)) / 1000, 0.25);
      previous = time;
      const key = [...held.current].at(-1);
      const manual = key ? movementKeys[key] : null;
      const target = path.current[0];
      let next: Point | null = null;
      if (manual) {
        const stride = (sceneId === "campus" ? 110 : 145) * dt;
        next = {
          x: player.current.x + manual.x * stride,
          y: player.current.y + manual.y * stride,
        };
      } else if (target) {
        const length = distance(player.current, target),
          stride = (sceneId === "campus" ? 155 : 190) * dt;
        if (length <= stride) {
          next = target;
          path.current.shift();
          setRoute([...path.current]);
        } else
          next = {
            x:
              player.current.x +
              ((target.x - player.current.x) / length) * stride,
            y:
              player.current.y +
              ((target.y - player.current.y) / length) * stride,
          };
      }
      if (next && canTravel(player.current, next, scene.walkable)) {
        const dx = next.x - player.current.x,
          dy = next.y - player.current.y;
        if (dx || dy)
          setDirection(
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0
                ? "right"
                : "left"
              : dy > 0
                ? "down"
                : "up",
          );
        player.current = next;
        setPosition(next);
        setMoving(Boolean(dx || dy));
        if (zoom > 1 && svg.current && viewport.current) {
          const matrix = svg.current.getScreenCTM();
          if (matrix) {
            const pt = new DOMPoint(next.x, next.y).matrixTransform(matrix),
              box = viewport.current.getBoundingClientRect();
            if (
              pt.x < box.left + 80 ||
              pt.x > box.right - 80 ||
              pt.y < box.top + 80 ||
              pt.y > box.bottom - 80
            ) {
              viewport.current.scrollBy({
                left: pt.x - box.left - box.width / 2,
                top: pt.y - box.top - box.height / 2,
                behavior: "smooth",
              });
            }
          }
        }
      } else if (next) {
        path.current = [];
        arrival.current = null;
        setMoving(false);
      }
      if (!manual && !path.current.length) {
        setMoving(false);
        if (arrival.current) {
          const callback = arrival.current;
          arrival.current = null;
          setRoute([]);
          callback();
        }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const release = () => held.current.clear();
    const keyUp = (event: globalThis.KeyboardEvent) =>
      held.current.delete(
        event.key.length === 1 ? event.key.toLowerCase() : event.key,
      );
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      cancelAnimationFrame(frame);
      release();
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [scene, sceneId, artOnly, floorSheet, zoom]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [expanded]);

  const nearbyBuilding =
    sceneId === "campus"
      ? places.find(
          (p) => p.interior && p.arrival && distance(position, p.arrival) < 18,
        )
      : null;
  const nearStairs =
    scene.stairs && distance(position, scene.stairs.point) < 18;
  const nearExit = scene.exit && distance(position, scene.exit) < 18;
  const exitBuilding = () => {
    cancelMovement();
    if (sceneId.startsWith("six")) {
      setFloorSheet(true);
      setMessage("Building 6 has no assigned outdoor entrance.");
      return;
    }
    const building = places.find((p) => p.id === sceneId[0]);
    changeScene("campus", building?.arrival);
  };
  const interact = () => {
    if (nearbyBuilding?.interior) changeScene(nearbyBuilding.interior);
    else if (nearStairs && scene.stairs) {
      cancelMovement();
      changeScene(scene.stairs.to, scenes[scene.stairs.to].stairs!.point);
    } else if (nearExit) exitBuilding();
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      artOnly ||
      floorSheet ||
      (event.target as HTMLElement).matches("input, select, textarea, button")
    )
      return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (movementKeys[key]) {
      event.preventDefault();
      if (!held.current.has(key)) cancelMovement();
      held.current.add(key);
    } else if (key === "e") {
      event.preventDefault();
      interact();
    }
  };
  const clickMap = (event: React.MouseEvent<SVGSVGElement>) => {
    if (artOnly || floorSheet) return;
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    cancelMovement();
    walkTo(point);
    viewport.current?.focus({ preventScroll: true });
  };
  const touchStart = (key: string, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cancelMovement();
    held.current.add(key);
  };
  const displayedRooms = allRooms.filter((room) =>
    sceneId === "campus"
      ? !room.scene.startsWith("six")
      : room.scene.replace(/\d$/, "") === sceneId.replace(/\d$/, ""),
  );
  const visiblePlaces = places.filter((p) =>
    `${p.name} ${p.kind}`.toLowerCase().includes(query.toLowerCase()),
  );
  const crop = floorSheet
    ? { x: 0, y: 0, width: 2048, height: 682 }
    : scene.crop;
  const indoor = floorSheet || sceneId !== "campus";

  const directionPad = (
    <div className="campus-dpad" aria-label="Touch movement controls">
      {[
        {
          key: "ArrowUp",
          icon: ArrowUp,
          label: "Walk north",
          area: "up",
        },
        {
          key: "ArrowLeft",
          icon: ArrowLeft,
          label: "Walk west",
          area: "left",
        },
        {
          key: "ArrowDown",
          icon: ArrowDown,
          label: "Walk south",
          area: "down",
        },
        {
          key: "ArrowRight",
          icon: ArrowRight,
          label: "Walk east",
          area: "right",
        },
      ].map((control) => (
        <button
          key={control.key}
          style={{ gridArea: control.area }}
          aria-label={control.label}
          disabled={artOnly || floorSheet}
          onPointerDown={(e) => touchStart(control.key, e)}
          onPointerUp={() => held.current.delete(control.key)}
          onPointerCancel={() => held.current.clear()}
          onLostPointerCapture={() => held.current.clear()}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              cancelMovement();
              held.current.add(control.key);
            }
          }}
          onKeyUp={() => held.current.clear()}
          onBlur={() => held.current.clear()}
        >
          <control.icon size={19} />
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={explorer}
      className={`campus-explorer ${expanded ? "campus-explorer--expanded" : ""}`}
      onKeyDown={keyDown}
    >
      <header className="campus-heading">
        <div>
          <span className="campus-eyebrow">
            <span /> RADAR / EXPLORE YOUR CAMPUS
          </span>
          <h1>Every path. Every place.</h1>
          <p>
            Your school map, brought to life. Pick a destination and explore.
          </p>
        </div>
        <button
          className="campus-secondary"
          onClick={() => {
            cancelMovement();
            setFloorSheet(!floorSheet);
            setZoom(1);
          }}
        >
          <Layers size={16} />
          {floorSheet ? "Back to explorer" : "Indoor floor plans"}
        </button>
      </header>

      <div className="campus-layout">
        <section
          className="campus-map-panel"
          aria-label="Interactive school artwork"
        >
          <div className="campus-map-toolbar">
            <span>
              <MapPin size={15} />
              <strong>
                {floorSheet ? "Original school floor plans" : scene.name}
              </strong>
            </span>
            <div>
              <button
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
              >
                <Minus size={16} />
              </button>
              <output aria-label="Map zoom">{Math.round(zoom * 100)}%</output>
              <button
                aria-label="Zoom in"
                disabled={zoom >= 2.5}
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
              >
                <Plus size={16} />
              </button>
              <button
                aria-label="Reset map zoom"
                onClick={() => {
                  setZoom(1);
                  viewport.current?.scrollTo(0, 0);
                }}
              >
                <Crosshair size={16} />
              </button>
              <button
                aria-label={expanded ? "Exit expanded map" : "Expand map"}
                aria-pressed={expanded}
                onClick={() => setExpanded((e) => !e)}
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <div
            className={`campus-viewport ${indoor ? "campus-viewport--indoor" : ""}`}
            ref={viewport}
            tabIndex={0}
            aria-label="Map controls: arrow keys or WASD to walk, E to interact"
            onBlur={() => held.current.clear()}
          >
            <svg
              ref={svg}
              viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
              style={{ width: `${zoom * 100}%` }}
              onClick={clickMap}
              role="group"
              aria-label={
                floorSheet
                  ? "Original floor plans for Buildings A, B and 6"
                  : `${scene.name} interactive map`
              }
            >
              <image
                href={floorSheet ? "/maps/floor-plans.jpg" : scene.image}
                width={floorSheet ? 2048 : scene.imageWidth}
                height={floorSheet ? 682 : scene.imageHeight}
                style={{ imageRendering: "pixelated" }}
              />
              {!artOnly && !floorSheet && (
                <>
                  {showAreas &&
                    scene.walkable.map((r, i) => (
                      <rect
                        key={i}
                        {...r}
                        fill="#78e9d6"
                        fillOpacity=".4"
                        stroke="#143845"
                        strokeWidth="1"
                        pointerEvents="none"
                      />
                    ))}
                  {route.length > 1 && (
                    <polyline
                      points={[position, ...route]
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={4}
                      strokeDasharray="6 6"
                      pointerEvents="none"
                    />
                  )}
                  {sceneId === "campus" &&
                    places.map((place) => (
                      <g
                        key={place.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Explore ${place.name}`}
                        className={`campus-hotspot ${selected?.id === place.id ? "campus-hotspot--selected" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          choosePlace(place);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            choosePlace(place);
                          }
                        }}
                      >
                        <title>{place.name}</title>
                        <rect {...place.bounds} rx="4" />
                      </g>
                    ))}
                  {scene.rooms.map((room) => (
                    <g
                      key={room.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Walk to ${room.name}`}
                      className={`campus-hotspot ${selectedRoom?.id === room.id ? "campus-hotspot--selected" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        chooseRoom(room);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          chooseRoom(room);
                        }
                      }}
                    >
                      <title>{room.name}</title>
                      <rect {...room.door} />
                    </g>
                  ))}
                  {scene.stairs && (
                    <g
                      role="button"
                      tabIndex={0}
                      aria-label={`Use stairs to floor ${scene.stairs.to.endsWith("2") ? 2 : 1}`}
                      className="campus-hotspot"
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelMovement();
                        walkTo(scene.stairs!.point, () =>
                          changeScene(
                            scene.stairs!.to,
                            scenes[scene.stairs!.to].stairs!.point,
                          ),
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          cancelMovement();
                          walkTo(scene.stairs!.point, () =>
                            changeScene(
                              scene.stairs!.to,
                              scenes[scene.stairs!.to].stairs!.point,
                            ),
                          );
                        }
                      }}
                    >
                      <rect
                        x={scene.stairs.point.x - 27}
                        y={scene.stairs.point.y - 83}
                        width={56}
                        height={90}
                      />
                    </g>
                  )}
                  <Student
                    position={position}
                    direction={direction}
                    moving={moving}
                  />
                </>
              )}
            </svg>
          </div>
          {!artOnly && !floorSheet && (
            <div className="campus-mobile-controls">
              <span>HOLD A DIRECTION TO WALK</span>
              {directionPad}
            </div>
          )}
          <div className="campus-map-bottom">
            <label>
              <input
                type="checkbox"
                checked={artOnly}
                onChange={(e) => {
                  cancelMovement();
                  held.current.clear();
                  setArtOnly(e.target.checked);
                }}
              />{" "}
              Original artwork only
            </label>
            <span>Source artwork preserved</span>
          </div>
          {!artOnly && !floorSheet && (
            <div className="campus-status" role="status">
              <span className="campus-status-icon">
                <Footprints size={18} />
              </span>
              <p>{message}</p>
              {(nearbyBuilding || nearStairs || nearExit) && (
                <button className="campus-primary" onClick={interact}>
                  {nearbyBuilding
                    ? "Enter building"
                    : nearStairs
                      ? "Use stairs"
                      : "Exit building"}{" "}
                  <kbd>E</kbd>
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="campus-sidebar">
          <section className="campus-directory">
            <span className="campus-eyebrow">YOUR NEXT STOP</span>
            <h2>{indoor ? "Inside the school" : "Campus directory"}</h2>
            {floorSheet ? (
              <>
                <p className="campus-small">
                  Choose a building to explore its original hallways.
                </p>
                {(["a1", "b1", "six1"] as const).map((id) => (
                  <button
                    className="campus-location"
                    key={id}
                    onClick={() => {
                      cancelMovement();
                      setSelectedRoom(null);
                      changeScene(id);
                    }}
                  >
                    <span className="campus-location-icon">
                      <Building2 size={18} />
                    </span>
                    <span>
                      <strong>
                        {id === "a1"
                          ? "Building A"
                          : id === "b1"
                            ? "Building B"
                            : "Building 6"}
                      </strong>
                      <small>
                        {id === "a1"
                          ? "1 floor · 2 classrooms"
                          : id === "b1"
                            ? "2 floors · 4 classrooms"
                            : "2 floors · 10 classrooms"}
                      </small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
                <p className="campus-small">
                  Building 6’s outdoor entrance is unassigned. This view opens
                  its interior independently.
                </p>
              </>
            ) : (
              <>
                {sceneId !== "campus" && (
                  <button
                    className="campus-back"
                    onClick={() => {
                      cancelMovement();
                      changeScene("campus");
                      setSelectedRoom(null);
                    }}
                  >
                    <ChevronLeft size={15} /> Campus overview
                  </button>
                )}
                {sceneId === "campus" && (
                  <>
                    <input
                      className="campus-search"
                      placeholder="Find a place…"
                      aria-label="Find a place in the illustrated campus"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <div className="campus-locations">
                      {visiblePlaces.map((place) => (
                        <button
                          key={place.id}
                          className={`campus-location ${selected?.id === place.id ? "is-selected" : ""}`}
                          onClick={() => choosePlace(place)}
                          disabled={artOnly}
                        >
                          <span className="campus-location-icon">
                            {place.id === "court" ? (
                              <Crosshair size={18} />
                            ) : (
                              <Building2 size={18} />
                            )}
                          </span>
                          <span>
                            <strong>{place.name}</strong>
                            <small>{place.kind}</small>
                          </span>
                          {selected?.id === place.id ? (
                            <Check size={15} />
                          ) : (
                            <ArrowUpRight size={15} />
                          )}
                        </button>
                      ))}
                      {!visiblePlaces.length && (
                        <p className="campus-small">
                          No places match “{query}”.
                        </p>
                      )}
                    </div>
                  </>
                )}
                {selected && sceneId === "campus" && (
                  <div className="campus-place-details">
                    <strong>{selected.name}</strong>
                    <p>{selected.description}</p>
                    {selected.interior && (
                      <button
                        className="campus-primary"
                        disabled={artOnly}
                        onClick={() => {
                          cancelMovement();
                          walkTo(selected.arrival!, () =>
                            changeScene(selected.interior!),
                          );
                        }}
                      >
                        Walk inside <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                )}
                {sceneId.startsWith("six") && (
                  <p className="campus-small">
                    Building 6 · Interior preview. Outdoor entrance unassigned.
                  </p>
                )}
                <label className="campus-room-label" htmlFor="campus-room">
                  Go to a classroom
                </label>
                <select
                  id="campus-room"
                  value={selectedRoom?.id ?? ""}
                  disabled={artOnly}
                  onChange={(e) => {
                    const room = allRooms.find((r) => r.id === e.target.value);
                    if (room) chooseRoom(room);
                  }}
                >
                  <option value="">Choose a room…</option>
                  {displayedRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · Floor {r.scene.endsWith("2") ? 2 : 1}
                    </option>
                  ))}
                </select>
                {scene.stairs && (
                  <button
                    className="campus-secondary campus-wide"
                    disabled={artOnly}
                    onClick={() => {
                      cancelMovement();
                      walkTo(scene.stairs!.point, () =>
                        changeScene(
                          scene.stairs!.to,
                          scenes[scene.stairs!.to].stairs!.point,
                        ),
                      );
                    }}
                  >
                    <Layers size={16} /> Walk to floor{" "}
                    {scene.stairs.to.endsWith("2") ? 2 : 1}
                  </button>
                )}
                {scene.exit && (
                  <button
                    className="campus-secondary campus-wide"
                    disabled={artOnly}
                    onClick={() => {
                      cancelMovement();
                      walkTo(scene.exit!, exitBuilding);
                    }}
                  >
                    <ChevronLeft size={16} /> Walk to exit
                  </button>
                )}
              </>
            )}
          </section>
          <section className="campus-controls">
            <span className="campus-eyebrow">A LITTLE EXPLORATION</span>
            <h2>Make your way around.</h2>
            <p>
              Click a place to walk there. Use the arrow keys or <b>W A S D</b>{" "}
              to take over.
            </p>
            {directionPad}
            <label className="campus-walking-toggle">
              <input
                type="checkbox"
                checked={showAreas}
                onChange={(e) => setShowAreas(e.target.checked)}
              />{" "}
              Show mapped walking areas
            </label>
            <button
              className="campus-reset"
              onClick={() => {
                cancelMovement();
                changeScene(sceneId);
              }}
            >
              <RotateCcw size={13} /> Return to entrance
            </button>
          </section>
          <p className="campus-note">
            <span>REFERENCE MAP</span>Exploration routes illustrate the supplied
            artwork. Check the geographic map for school records; these routes
            are not verified evacuation guidance.
          </p>
        </aside>
      </div>
      <footer className="campus-footer">
        <span>
          RADAR <i>✦</i> A familiar place. A new perspective.
        </span>
        <span>Click to explore · E to interact</span>
      </footer>
    </div>
  );
}
