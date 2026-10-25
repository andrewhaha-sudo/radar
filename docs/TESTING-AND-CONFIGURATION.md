# Testing and configuring RADAR

The update is on `design/radar-command-dashboard`. These instructions prepare software and isolated testing; they do not certify a campus or enable private providers automatically.

## Open an isolated practice environment

Use Node 24 or newer:

```sh
git pull origin design/radar-command-dashboard
npm ci
npm run build
npm run test:lab
```

Open `http://localhost:8799`. Training login: `admin@northridge.edu` / `Admin#2026`. These credentials belong only to seeded development/training data. The lab creates disposable databases and uploads, does not load `.env`, strips private provider settings, and blocks external AI/push/SMS delivery. Stopping it deletes its records. Choose another port with `RADAR_LAB_PORT` if necessary. Do not use training mode for real emergencies. Training relay packets cannot be accepted by the production relay inbox.

For normal development use `npm run dev` and the Local URL it prints. Keep UI and API from the same launcher running. `npm run preview` alone does not run the API.

## Configure private services

```sh
npm run setup:supabase
npm run setup:integrations
npm run config:check
```

Both setup wizards preserve existing settings and use hidden private inputs. Enter keeps a setting; the integration wizard accepts `CLEAR` to remove one. Configuration and backups are ignored by Git and written with owner-only file permissions. Never paste private secrets into chat. `config:check` reports presence only, not successful connectivity. `npm run config:live` optionally makes read-only provider account/model-list requests; it does not send SMS or analyze photos. Use `npm run check:supabase` for the separate database/Auth/Storage checks.

See [SUPABASE.md](SUPABASE.md) and [VERCEL.md](VERCEL.md). Your public Supabase URL/key cannot replace the private database URI and Storage service-role configuration. Vercel still needs an account, GitHub import, private environment variables and a deployment. Gmail addresses are supported. School access remains administrator approved.

## Campus video survey

Open **Campus operations → Advanced tools & testing → Campus video survey**.

1. Choose a local walking/drone video. The full video remains on the device; select up to six overview keyframes automatically or capture views manually with the player. Browser format/codec support applies; the video must have a seekable duration of up to four hours.
2. Inspect frames for private student information. With permission, explicitly send selected JPEGs to the configured vision provider. Without a provider, click buildings to add manual numbered labels.
3. Review every suggested building and duplicate view. Match labels to real registered buildings; candidate numbers are draft labels, not official building IDs. No coordinates, room counts or verified hazards are invented.
4. Open the building directory to register its actual floors/rooms. Follow each linked room to the existing inspection workflow. AI findings and approximate pins still need human review.
5. Review and save the survey. Saved keyframes/labels belong to that school's private workspace and can be deleted by an administrator. The full video is not archived or uploaded by this workflow.
6. Request a candidate route for a linked building. This calls the existing verified-walkway planner, accounting for registered closures/capacity/accessibility data. If connected verified paths are absent, it returns unavailable. Video-visible pavement is not proof of a safe route.

Aerial footage supplies an aerial *view*, not a georeferenced orthomosaic or reconstructed 3D campus. A walking video cannot automatically become Google Street View or an accurate drone map. Those require calibrated imagery, surveying and reconstruction tooling. Use actual panoramas/GLB assets and verified school coordinates for those existing map modes. Six sampled frames can miss buildings and hazards; this is assisted review, not exhaustive whole-video analysis.

## Advanced tools

- **Roster import:** download the CSV template; `name` is required, optional `email` must link to an active school student, optional `externalRef` aids deduplication. Preview first, then explicitly commit. At most 500 entries; append/deduplicate without overwriting attendance. Teachers can import only assigned classes. CSV exports neutralize spreadsheet formulas.
- **Custom reports:** select real hazard/inspection/incident records, date range, building and up to three allowlisted grouping dimensions. Export the result. Repeated room/category/title groups are review candidates, not predictions.
- **Official datasets:** upload bounded WGS84 GeoJSON or supported CAP polygon XML with actual agency/source/published/expiry metadata. Remote fetch accepts supported public HTTPS agency hosts only and refuses redirects/private URLs. It does not scrape agency web pages. CAP without supported polygons fails explicitly. Verify provenance before checking verified; selected verified/unexpired layers can appear on the main map. No preconfigured live PAGASA/PHIVOLCS feed or regional dataset is invented. The existing opt-in USGS feed remains separate.
- **Measured model builder:** enter actual pixels/metre, floor elevations and survey source. Explicitly confirm the registered room footprints match the surveyed plan. It exports a navigable GLB of measured footprint planes with floor/room links, not a reconstructed building interior. Default room rectangles must be corrected before verification.
- **Calibrated pins:** for a draft scan photo, supply four non-collinear normalized image-to-room planar correspondences and survey evidence. Project a clicked finding or let configured room vision suggest a visible image point. The homography applies only to that plane; walls, depth/parallax and other floors need separate calibration. Reject/adjust uncertain pins. Human acceptance is required before findings enter the hazard register.
- **Foreground GPS:** explicit permission, active incident, fixed 5–60 minute window. Sends only the latest sample with accuracy while the screen is visible; stops on hide, unmount, expiry or explicit stop. No location trails or background tracking guarantee.
- **Count devices:** register an aggregate room/assembly device as administrator. Copy its device-only token once; only a hash is stored. Revoke compromised devices. No photos/biometrics/identity payloads. Timestamp tolerance is five minutes, unique nonce prevents replay. Readings older than two minutes are marked stale; room markers use building positions and are approximate. Latest counts refresh every 30 seconds. Physical accuracy must be tested on site.
- **Delivery policy:** administrator opts into push-to-SMS fallback and/or SOS SMS to consented active responders/admins. Defaults are off. Fallback applies when push is unavailable/fails before acceptance; it cannot infer whether an accepted push reached a phone. Consent, provider configuration and charges apply. Manual queue processing and receipts distinguish unconfigured/failed/accepted/delivered states. Ambiguous sends are not automatically retried.
- **Test notebook:** camera/GPS/browser checks plus manual evidence entries for physical/integration/load/security/restore tests. A saved “pass” is an administrator's recorded observation, not automated certification. Export observations for review.

## Count device example

Configure `RADAR_PUBLIC_URL`, `RADAR_DEVICE_ID` and private `RADAR_DEVICE_TOKEN` locally on the count sender, never browser `VITE_` variables. Preview without sending:

```sh
npm run device:send -- 12 --dry-run
npm run device:send -- 12
```

The real request is `POST /api/device/occupancy`, bearer device token, JSON `{deviceId,count,observedAt,nonce}`. The server binds the token to its registered school/target; the client cannot select another workspace. This is an adapter contract and example sender, not firmware for an unspecified sensor.

## Peer relay and network testing

The relay uses manual offer/answer exchange and a WebRTC data channel, with no public signalling service. Pair only trusted devices. A packet is a short, expiring, unverified request; peer receipt and staff receipt are separate. File export/import is available when direct transport fails. Staff explicitly save to the school inbox; no packet automatically creates an official incident or dispatches help. Operational offline use requires a previously loaded authorized app.

Default ICE configuration has no third-party STUN/TURN servers and requires a compatible local network. For networks needing a relay, configure your own **TLS TURN REST-compatible** service:

```dotenv
RADAR_TURN_URLS=turns:your-turn-host.example:5349?transport=tcp
RADAR_TURN_SECRET=
```

Set the shared secret privately on server and TURN service. Authenticated clients receive ten-minute HMAC credentials, never the shared secret. TURN requires connectivity and is not offline radio. Test offer/answer, actual packet arrival, explicit ACK, expiry, duplicate rejection and disconnect on two real devices/networks. The cloud test browser produced zero usable ICE candidates even in an independent minimal WebRTC test; live peer transport remains unverified here. Packet file fallback is tested separately.

## Verification and operation

```sh
npm test
RADAR_FEATURE_PG=1 node --test tests/features.test.mjs
npm run build
npm run lint
```

The PostgreSQL command uses disposable embedded PGlite, not your live Supabase project. Test production HTTPS on real Android/iOS devices for camera/GPS/push, provider receipts, network loss, membership revocation and school boundaries before launch. AI responses are covered by mock-provider tests; actual analysis requires credentials, consent and a real photo/video test. Load tests, independent security assessment and hosted backup restores remain required deployment work.

Enable `RADAR_STRUCTURED_LOGS=true` for request ID, method, sanitized path, status and duration logs. Query strings, bodies and credentials are excluded. Admin `/api/advanced/health` reports pending/failed/processing jobs and overdue inspection counts. Connect your host's log/uptime alerts; these counters are not centralized monitoring by themselves. On serverless hosting configure the documented scheduled maintenance endpoint.

Local backup verification:

```sh
npm run backup
npm run backup:verify -- .backups/<snapshot-directory>
```

Stop writes for a consistent application snapshot. Integrity/foreign-key checks do not prove a full restore; restore into an isolated installation and inspect records/uploads. Hosted PostgreSQL and Storage backups need separate off-host retention and a rehearsed project restore. `.env` is not included in backups.
