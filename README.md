# RADAR

**RADAR** is a campus safety and disaster-response platform for schools. It brings the
campus map, guided room inspections, hazard findings, alerts, evacuation routes,
emergency resources, safety check-ins, recovery tasks and analytics into one auditable
record with server-enforced role permissions.

RADAR is deliberately honest about its limits:

- It **never contacts emergency services**. Call your local emergency number when there
  is immediate danger.
- AI-assisted detection is reported as **unconfigured** until a provider is connected.
  Observations entered by people require verification.
- Live disaster feeds are reported as **unconfigured** until a connector is configured.
  Nothing is fabricated to look live.
- Every number in the interface comes from the school database. There is no demo-data
  banner, simulated telemetry or generated activity.

## Features

| Area | What it does |
| --- | --- |
| Campus map | Buildings, floors, rooms, equipment, hazards, evacuation routes and assembly points with keyless tile basemaps. |
| Guided scans | Room-by-room inspections with observations, evidence uploads and review workflow. |
| Hazard workspace | Severity, verification, ownership, corrective actions, evidence and full history. |
| Incidents | Open, update and close incidents, with linked hazards and roll call. |
| Roll call | Class expectations, present/absent counts and drill snapshots. |
| Alerts | Four-level alerts (green / yellow / orange / red) with delivery and read tracking, plus manual advisories. |
| Disaster watch | Manual official advisories with freshness states; live feed connectors report unconfigured honestly. |
| Safety check-ins | “I’m safe” / “I need help” status with optional location sharing and staff board. |
| Evacuation | Route and assembly-point status, accessible alternatives, roll-call snapshot and printable directory. |
| Resources | AEDs, extinguishers, first aid, eyewash, spill kits, lighting and radios with expiry and last-checked state. |
| Recovery | Repair and inspection tasks plus damage assessments with an explicit clearance decision. |
| Analytics | Trends, severity mix, building coverage, alert reach and CSV exports scoped to permissions. |
| Offline | Installable PWA shell, user-triggered read-only data pack, and an explicit outbox that never replays silently. |
| Administration | Users, roles, audit log and school settings. |

## Roles

Permissions are enforced by the API, not just hidden in the UI.

- **Administrator** — full access, user management and audit history.
- **Safety inspector** — scans, hazards, incidents, alerts, evacuation, resources and recovery.
- **Teacher** — class roll call, safety check-ins, hazard reporting and read access to campus safety state.
- **Responder** — incident, evacuation, resource and alert response.
- **Student / parent** — campus map, alerts addressed to them, safety check-in and their own class information.

## Tech stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4 (semantic tokens, four themes, light/dark/system modes, custom accent)
- Leaflet with OpenStreetMap / Esri World Imagery / OpenTopoMap tiles (no API key required)
- Recharts for analytics
- Zero-dependency Node.js API (`node:http`, `node:sqlite`) with scrypt password hashing,
  HttpOnly session cookies, server-side RBAC and an append-only audit log
- Service worker for the production app shell; explicit Cache API data pack for offline reads

## Getting started

Requirements: Node.js 22+ (for `node:sqlite`) and npm.

```bash
npm install
npm run seed      # create server/data/radar.db and seed the demo school
npm run dev       # API on 127.0.0.1:8787 + Vite on localhost:5173
```

Open <http://localhost:5173>.

Production build:

```bash
npm run build
npm start         # serves the built app and API from 127.0.0.1:8787
```

### Seeded accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@northridge.edu` | `Admin#2026` |
| Safety inspector | `inspector@northridge.edu` | `Inspect#2026` |
| Teacher | `teacher@northridge.edu` | `Teach#2026` |
| Responder | `responder@northridge.edu` | `Respond#2026` |
| Student | `student@northridge.edu` | `Student#2026` |
| Parent | `parent@northridge.edu` | `Parent#2026` |

Change these credentials before using a real deployment.

### Data and migration

- The SQLite database lives at `server/data/radar.db` (WAL mode).
- If a pre-rename `hazardlink.db` exists and `radar.db` does not, the server copies it
  once so existing installations keep their records.
- Sessions use the `radar_session` cookie. Theme and offline preferences are stored under
  `radar:*` keys; legacy `hazardlink:*` preferences are migrated on first load.
- Run `npm run seed` only against an empty database — it skips seeding when users exist.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | API/HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `NODE_ENV` | `development` | `production` serves `dist` with SPA fallback |
| `RADAR_DB_DIR` | `server/data` | Optional database directory override |

No external service keys are required. Map tiles use keyless providers; if a tile
provider is unreachable the map degrades rather than inventing features.

## Accessibility and safety conventions

- Severity and alert level are always shown with an icon, a symbol **and** a text label —
  never colour alone.
- Destructive or public actions (publishing an alert, closing a route, clearing a room)
  require confirmation and are written to the audit log.
- Offline writes stay in the local outbox until the user explicitly chooses **Send queued**.
- Cached data is labelled as a snapshot; the UI never implies it is live.
- Reduced-motion preferences are respected across the radar ambient background and page
  transitions.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | API + Vite dev server |
| `npm run dev:ui` | Vite only |
| `npm run dev:api` | API only |
| `npm run seed` | Seed an empty database |
| `npm run lint` | Oxlint |
| `npm test` | API integration tests (isolated temporary database) |
| `npm run build` | Type-check and production build |
| `npm start` | Production server |

## Project layout

```
server/            Node HTTP API, SQLite schema, seed data, uploads
src/components/    Reusable UI, layout and domain components
src/context/       Theme, auth and offline providers
src/lib/           Typed API client, types, tokens, offline helpers
src/pages/         Route-level pages
public/            Manifest, favicon, service worker
```

## License

Internal school deployment software. Add your organisation's licence before distributing.

## Camarines Norte school workspaces

Sign in as an administrator, click the school selector in the top bar, and choose a school. Click **Create school workspace** to create a separate, empty campus database and open its dashboard. Existing workspaces have an **Open school workspace** button. The selector also lets you return to the original workspace.

On the new dashboard, choose **Add buildings & rooms**. Expand **Add buildings, floors & rooms**, then add a building with its real latitude/longitude, a floor, and rooms. The first building supplies the campus map's initial center. Until then, map views show a labelled Camarines Norte overview; no school coordinates or inspection results are fabricated. Buildings, rooms, hazards, alerts and other operational records are never copied from the demonstration campus.

The directory remains a historical 2020–2021 masterlist, with the source documented in `src/data/README.md`. Creating a workspace is local RADAR setup, not verification of official school affiliation. At present, only the administrator account that creates a workspace can open it; invitations and additional school-member accounts are not implemented.

The original account database stays in `server/data/radar.db` (or `RADAR_DB_DIR/radar.db`). School databases are stored at `RADAR_DB_DIR/workspaces/<BEIS ID>/radar.db`, with each school's uploaded files in that directory's `uploads/` subfolder. Back up the entire data directory, including SQLite WAL files when present, and the original `server/uploads/` directory. Workspace databases are created without demo seeding. Existing original-campus records are retained; schema upgrades add workspace registration, session selection, and school-location metadata automatically on server startup.

Workspace selection belongs to the signed-in session. A request's workspace expectation prevents stale tabs and queued writes from being applied to another school after a switch. Offline data packs and outboxes are separated by account and workspace; older unscoped data packs and queued items are not automatically migrated or replayed. Downloads and uploads use the selected school scope. New workspace uploads require the owner's authenticated session and are not publicly cached.

After updating this code, stop the old development server with Ctrl+C and run `npm run dev` again so the API loads the new routes and migrations. `npm test` includes integration checks for ownership, empty-school creation, campus record creation, isolation, stale requests, uploads, and persistence across server restart.
