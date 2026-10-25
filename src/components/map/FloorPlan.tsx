'use client';

import { cn } from '@/components/ui/card';
import type { Floor, Room } from '@/lib/types';

const ROOM_FILL: Record<string, string> = {
  classroom: 'color-mix(in srgb, var(--info) 10%, var(--card))',
  laboratory: 'color-mix(in srgb, var(--cyan) 12%, var(--card))',
  office: 'color-mix(in srgb, var(--primary) 9%, var(--card))',
  gymnasium: 'color-mix(in srgb, var(--warning) 12%, var(--card))',
  library: 'color-mix(in srgb, var(--accent-solid) 10%, var(--card))',
  cafeteria: 'color-mix(in srgb, var(--success) 10%, var(--card))',
  circulation: 'color-mix(in srgb, var(--muted-foreground) 10%, var(--card))',
  service: 'color-mix(in srgb, var(--text-muted) 12%, var(--card))',
  restroom: 'color-mix(in srgb, var(--text-muted) 9%, var(--card))',
};

function shortLabel(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function FloorPlan({
  floor,
  rooms,
  selectedRoomId,
  onSelectRoom,
}: {
  floor: Floor;
  rooms: Room[];
  selectedRoomId: number | null;
  onSelectRoom: (room: Room) => void;
}) {
  const width = floor.planWidth || 1000;
  const height = floor.planHeight || 620;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="group"
          aria-label={`Floor plan for ${floor.name}`}
        >
          <defs>
            <pattern id={`grid-${floor.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--border)" strokeOpacity="0.35" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill={`url(#grid-${floor.id})`} />

          {rooms.map((room) => {
            const hasHazards = (room.openHazards ?? 0) > 0;
            const selected = selectedRoomId === room.id;
            const fill = hasHazards
              ? 'color-mix(in srgb, var(--danger) 16%, var(--card))'
              : ROOM_FILL[room.type] ?? 'var(--card)';
            const label = shortLabel(room.name, Math.max(8, Math.floor(room.width / 9)));
            return (
              <g
                key={room.id}
                role="button"
                tabIndex={0}
                aria-label={`${room.code} ${room.name}${hasHazards ? `, ${room.openHazards} open hazards` : ''}`}
                onClick={() => onSelectRoom(room)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectRoom(room);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.width}
                  height={room.height}
                  rx={8}
                  fill={fill}
                  stroke={selected ? 'var(--accent-solid)' : hasHazards ? 'var(--danger)' : 'var(--border)'}
                  strokeWidth={selected ? 5 : 2}
                  className="transition-[stroke,fill] duration-150 hover:brightness-110"
                />
                <text
                  x={room.x + 14}
                  y={room.y + 30}
                  fill={hasHazards ? 'var(--danger)' : 'var(--foreground)'}
                  fontSize="18"
                  fontWeight="700"
                  fontFamily="var(--app-font-mono)"
                  pointerEvents="none"
                >
                  {room.code}
                </text>
                <text
                  x={room.x + 14}
                  y={room.y + 52}
                  fill="var(--text-muted)"
                  fontSize="14"
                  fontFamily="var(--app-font-sans)"
                  pointerEvents="none"
                >
                  {label}
                </text>
                {hasHazards && (
                  <g pointerEvents="none">
                    <circle cx={room.x + room.width - 24} cy={room.y + 24} r={13} fill="var(--danger)" />
                    <text
                      x={room.x + room.width - 24}
                      y={room.y + 29}
                      textAnchor="middle"
                      fill="#fff"
                      fontSize="13"
                      fontWeight="700"
                    >
                      {room.openHazards}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-danger bg-danger/20" /> Open hazard
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-border bg-card" /> Rooms
        </span>
        <span className={cn('ml-auto italic')}>Schematic plan — not to scale.</span>
      </div>
    </div>
  );
}
