# RADAR: Comprehensive Feature Catalogue and Research Roadmap

Date: 27 October 2026 · audited code: `44d511f` · main merge: `2f5f72d`

Documentation and proposed study backlog only. Proposed features are not implemented, institutionally approved or guaranteed to improve outcomes. Built status means code exists, not field safety certification.

## Current — Accounts, schools and permissions

### C001 · Email sign-in and signup [Built]

Local account registration/sign-in accepts ordinary email addresses, including Gmail; signup does not grant school staff privileges.

### C002 · Supabase account adapter [Activation]

Cloud Auth, recovery, PostgreSQL and private Storage adapters exist. Actual server credentials, account setup and live verification are still required.

### C003 · Camarines Norte school directory [Data needed]

Historical 2020–2021 directory: 377 schools across 12 municipalities. It is a selection aid, not a verified current DepEd inventory.

### C004 · Separate school workspaces [Built]

Create an empty school workspace with isolated records/uploads; historical demonstration records are not copied into real schools.

### C005 · School membership approval [Built]

Administrators approve new school access requests and assign school-specific roles. Approved users do not need repeated approval at each login.

### C006 · Six school roles [Built]

Administrator, inspector, teacher, responder, student and parent permissions are enforced on the server; class and evidence ownership add restrictions.

### C007 · School and role restoration [Built]

The last authorized school survives logout/login; school-specific permissions, map context and published imagery restore after access is rechecked.

### C008 · Account and access safeguards [Built]

Session expiry, inactive/revoked account checks, profile updates and administrator user/audit tools preserve accountability; public signup never grants private-school authority.

Evidence: `server/auth.mjs`, `server/workspaces.mjs`, `server/memberships.mjs`, `src/context/AuthContext.tsx`

## Current — Room inspection and evidence

### C009 · Campus space register [Data needed]

Register actual buildings, floors, rooms, use, department/contact, dimensions and identifiers; survey and verify the real campus data.

### C010 · Room inspection and QR workflow [Built]

Select or QR-open a registered room, capture/attach evidence, complete the six-area checklist and submit findings or an explicit no-visible-findings record.

### C011 · Camera and selected video frames [Built]

Browser photo capture and selected frame extraction retain previews. Physical phone camera/codec performance still needs field testing.

### C012 · Manual findings and categories [Built]

Record observations without AI and submit student observations without granting students verification authority.

### C013 · Optional room vision [Activation]

Consented bounded image analysis through the selected OpenAI/Gemini provider suggests findings; model output is not a confirmed hazard.

### C014 · Human review and correction [Built]

Authorized staff review, verify, reject or follow up observations; confidence is an uncalibrated output score, not proof of danger.

### C015 · Inspection history and comparison [Built]

Room inspection/correction history and before/after evidence comparisons support documented follow-up rather than invented continuous monitoring.

### C016 · Approximate finding placement [Experimental]

Manual floor-plan pins and optional four-anchor planar calibration can project points onto a calibrated plane; depth and other planes remain unresolved.

### C017 · Inspection schedules and reminders [Built]

Record inspection schedules, overdue status, checklist scoring and floor/building coverage. Reminders depend on backend job execution.

### C018 · Offline inspection drafts [Built]

Account/school-scoped drafts and photos can be saved on the device and explicitly synced, with idempotent creation and retry progress.

Evidence: `src/pages/ScanPage.tsx`, `src/pages/BuildingsPage.tsx`, `server/features.mjs`, `server/integrations.mjs`

## Current — Campus maps and spatial records

### C019 · School location editor [Data needed]

Authorized staff set real school coordinates and register building pins. Missing locations use a labeled regional overview, not fabricated coordinates.

### C020 · Basemaps and campus markers [Built]

Street, satellite, dark and terrain choices, registered building markers and room-linked records; third-party tile availability is network-dependent.

### C021 · Campus-wide search [Built]

School-scoped global search covers rooms, buildings, hazards, incidents, alerts and advisories; campus lookup also finds resources/gathering points, subject to permissions.

### C022 · Hazard marker filters [Built]

Filter findings by severity, category, verification, date and status; stale or unverified records are not promoted to official clearance.

### C023 · Aligned floor plans and features [Data needed]

Upload aligned plans and register room geometry, exits, doors, windows, ramps, stairs and access points using real source measurements.

### C024 · Editable campus zones [Built]

Draw and edit geographic restriction/geological zones. Registered verified restrictions can affect separately verified route planning.

### C025 · History snapshots and comparisons [Built]

Compare recorded campus states and historical inspection context; snapshots do not establish current on-site conditions.

### C026 · Official vector overlays [Activation]

Source-linked GeoJSON/CAP import/fetch, review/expiry and an opt-in USGS earthquake adapter exist. Current agency layers need provision; USGS is not PHIVOLCS PEIS or a campus-impact forecast.

### C027 · Real 3D and 360 assets [Data needed]

Uploaded self-contained GLB and actual panoramas have 2D fallbacks. Prepared first-person navigation needs verified metric geometry and spawn information.

### C028 · Measured footprint models [Experimental]

Generate GLB floor/room footprint planes from confirmed surveyed geometry. This is not an automatically reconstructed or current building interior.

Evidence: `src/pages/MapPage.tsx`, `src/components/map`, `src/components/workspace/CampusScene.tsx`, `server/routing.mjs`, `src/pages/SearchPage.tsx`, `server/official-data.mjs`

## Current — School imagery, GIS and model-output workflows

### C029 · Photo/video campus survey [Built]

Local video sampling, reviewed draft building labels, duplicate-view matching and links to registered rooms; a complete video is not uploaded or exhaustively analyzed.

### C030 · Published close-up campus view [Built]

Publish a reviewed survey frame/photo to the selected school dashboard, with bounded zoom, pan, frame selection and clickable registered-building links.

### C031 · Upload → Generate GIS draft [Activation]

The configured vision provider can propose visible campus-area/building polygons, walkways and possible concerns over a school photo or sampled video views.

### C032 · Editable image geometry [Built]

Rename/remove proposals, manually draw missing features and use keyboard point entry. Up to 40 reviewed/manual draft features can be stored.

### C033 · Private saved image-map drafts [Built]

Persist selected frames, provisional labels, geometry and review notes to the school. Image access requires inspection permission; saving does not register real buildings.

### C034 · Three-anchor geographic placement [Experimental]

A confirmed top-down view and three known non-collinear coordinates produce approximate affine EPSG:4326 placement, saved with source notes.

### C035 · GIS export [Built]

Export image-space draft JSON or approximate placed GeoJSON. Georeferencing is explicit; image pixels are never silently labeled as latitude/longitude.

### C036 · Building pin–polygon assessment [Built]

Check selected reviewed/unexpired area layers against registered pins, handling holes and multipolygons. No contact is not a safety finding.

### C037 · CNN-output import and review [Built]

Import georeferenced visible-feature polygons with model/version, imagery date, class, confidence and provenance. New layers are pending until reviewed.

### C038 · CNN threshold and layer controls [Built]

Pending/rejected model outputs stay out of assessments; selected-layer and confidence changes clear old results. A dedicated CNN is not trained or run by RADAR.

### C039 · Photo Route Studio [Built]

Draw/review visible image-space path segments, prepare field checks and save a school sketchbook. Sketches never automatically activate evacuation routes.

### C040 · Provider failure recovery [Built]

Timeout/quota/model errors and temporary 502/503/504 availability errors are surfaced. Explicit single-view recovery retains other views; no automatic provider retry/fallback occurs.

Evidence: `server/campus-map.mjs`, `server/gis.mjs`, `server/campus-video.mjs`, `server/image-paths.mjs`, `src/components/advanced`

## Current — Alerts, emergencies and consent

### C041 · School alert authoring [Built]

Four alert levels with staff-controlled publication, suspension reason/resumption, schedule, expiry and archive.

### C042 · Targeted alert audiences [Built]

School, grade, section, building and staff audience enforcement; records distinguish authorized recipients and reads.

### C043 · In-app notifications [Built]

Persistent school notifications and read state remain separate from claims of external phone delivery.

### C044 · Web push adapter [Activation]

HTTPS, VAPID, browser support, permission and recipient subscription are required. Provider acceptance is not phone receipt.

### C045 · Twilio SMS adapter [Activation]

Consented phone numbers, configured/funded sender, durable jobs and signed provider receipts are supported; live delivery has not been verified.

### C046 · Delivery policy and fallback [Activation]

Optional consented push-to-SMS/SOS SMS policies distinguish unavailable, failed, accepted and delivered states; ambiguous sends are not automatically resent.

### C047 · SOS request and acknowledgement [Built]

Two-second hold and confirmation, silent-intent flag, actual server response, acknowledgement, assignment and resolution. No guaranteed offline delivery.

### C048 · Safeguarded cancellation [Built]

Users can cancel their own unacknowledged request or request cancellation after acknowledgement; changes preserve the response record.

### C049 · Temporary emergency location [Built]

Explicit active-incident location sharing with accuracy, expiry, stop/delete and authorized responder access; no location trails or background tracking guarantee.

### C050 · Offline contacts and peer relay [Experimental]

Saved contact actions and manual WebRTC/expiring packet-file relay exist. Imported requests are unverified; physical peer transport and real delivery remain unverified.

Evidence: `src/pages/AlertsPage.tsx`, `src/pages/SOSPage.tsx`, `server/delivery.mjs`, `server/emergency-delivery.mjs`, `server/features.mjs`

## Current — Evacuation, accessibility and occupancy

### C051 · Verified walkway register [Data needed]

Routing depends on registered real connected paths and building endpoints; missing graph connections return unavailable rather than inventing a route.

### C052 · Assembly point register [Data needed]

Register actual gathering points, capacity, accessibility and approved geometry, with a source and responsible school staff.

### C053 · Dijkstra route planning [Built]

Plan along available verified graph connections to eligible assembly points; estimated distance/time are not indoor turn-by-turn guidance.

### C054 · Closures and restriction avoidance [Built]

Known closed paths and verified restriction polygons can remove graph options. Unreported hazards or dynamic smoke/fire are not modeled.

### C055 · Accessible route constraints [Built]

Use registered accessibility attributes and capacity information; actual ramps, gates, gradients and surface conditions must be field-checked.

### C056 · Alternative destinations [Built]

Consider another registered gathering point when current constraints or recent full-point information prevent an option.

### C057 · Aggregate occupancy readings [Activation]

Manual and token-authenticated aggregate room/assembly counts include source/time, nonce replay checks and stale-state marking; sensor accuracy needs testing.

### C058 · Nearest registered resources [Built]

Approximate nearest equipment/resource locations use building coordinates; straight-line proximity is not a verified indoor walking route.

Evidence: `server/routing.mjs`, `src/components/map/EvacuationPlanner.tsx`, `src/pages/EvacuationPage.tsx`, `src/components/advanced/DevicePanel.tsx`

## Current — People, reports and school operations

### C059 · Individual student rosters [Built]

Class/section records link authorized school accounts; assigned-teacher restrictions prevent unrelated teachers from changing a class.

### C060 · Roll call statuses and history [Built]

Five attendance statuses, reconciled counts, individual changes and class exports support accountable drills and incident follow-up.

### C061 · Authenticated QR check-in [Built]

QR helps an authenticated member check in; possession of a QR code is not identity verification or proof of location.

### C062 · CSV roster preview/commit [Built]

Bounded imports preview records, deduplicate, link active student accounts and explicitly commit without overwriting attendance.

### C063 · Student observation reports [Built]

Submit observations/evidence and follow own status. Policy-controlled identity hiding is limited; authorized investigators retain accountability.

### C064 · Corroboration and duplicate flags [Built]

One-vote-per-account/type corroboration and possible-duplicate suggestions aid human review; no automatic certified merge occurs.

### C065 · Guardian relationships and status [Built]

School-approved guardian relationships expose limited authorized reported status without precise emergency locations or medical information.

### C066 · School emergency settings [Built]

Configure actual contacts, procedures, reporting policy and follow-up intervals. No external agency is automatically contacted by editing a setting.

Evidence: `src/pages/RollCallPage.tsx`, `src/pages/OperationsPage.tsx`, `server/features.mjs`, `server/advanced.mjs`

## Current — Resources, recovery and analytics

### C067 · Equipment and stock register [Built]

Record location, stock, condition and expiry for registered school equipment/resources; data freshness depends on staff updates.

### C068 · Resource transaction journal [Built]

Checkout, return, consumption and replenishment records enforce nonnegative stock and support accountability.

### C069 · Stock and expiry reminders [Built]

Low-stock, condition and expiry reminders depend on the configured maintenance/job process and valid staff records.

### C070 · Corrective and recovery tasks [Built]

Track damage follow-up, repair/correction and recovery work; the app does not perform repairs or guarantee clearance.

### C071 · Private assistance requests [Built]

Restricted assistance/referral requests and staff updates support follow-up; real services must be arranged by authorized people.

### C072 · Operational dashboard [Built]

School safety summaries, inspection coverage, overdue work, unresolved severity/status and actual incidents avoid invented live measurements.

### C073 · Trend and recurrence review [Built]

Time/status/response trends and repeated concern groups support retrospective review; they are not validated hazard forecasts.

### C074 · Allowlisted custom reports [Built]

Filtered/grouped reports and authorized CSV exports use permitted dimensions rather than arbitrary SQL; spreadsheet formulas are neutralized where applicable.

Evidence: `src/pages/ResourcesPage.tsx`, `src/pages/RecoveryPage.tsx`, `src/pages/AnalyticsPage.tsx`, `src/components/advanced/ReportBuilder.tsx`

## Current — Interface, offline continuity and deployment

### C075 · Five-second opening and replay [Built]

RADAR shield/radar animation plays on fresh loads, including signed-in reloads; Skip, replay and reduced motion are available without replaying every internal navigation.

### C076 · Role-aware getting-started tour [Built]

Versioned account/browser-local tour explains the campus, tools and new features; completion/replay never changes permissions.

### C077 · Responsive task workspace [Built]

Search/pin tools, task groups, theme choices, compact campus tabs, prerequisite-aware empty states, mobile dock and keyboard controls reduce repeated panels.

### C078 · Interface motion and accessibility [Built]

Panel entrances, moving tab/dock indicators, button feedback and reduced-motion handling exist. Independent WCAG/physical-device acceptance remains pending.

### C079 · Scoped PWA snapshots [Built]

Explicitly saved read-only snapshots/plans and device drafts are account/school scoped; offline sessions expire and logout blocks cached restoration.

### C080 · Explicit offline synchronization [Built]

Reconnect does not silently submit records. Users choose sync, with idempotency, progress and failure visibility; offline emergency delivery is not guaranteed.

### C081 · SQLite/PostgreSQL storage [Built]

Local and cloud database adapters, school-scoped private uploads and additive schema upgrades exist; migration and live-hosted validation remain separate work.

### C082 · Vercel and integration setup [Activation]

Vercel adapter, Supabase/provider setup tools, presence/read-only diagnostics and health/version routes exist; real accounts, private settings and deployment need activation.

### C083 · Backup and operational jobs [Built]

Local consistent backups, integrity checks, request IDs/logs and durable maintenance jobs are implemented. Off-host encrypted backups and hosted restore drills remain deployment work.

### C084 · Isolated test and acceptance lab [Built]

Disposable seeded practice data blocks external AI/SMS/push calls. Automated SQLite/PostgreSQL/mock-provider checks and a manual acceptance notebook record evidence, not safety certification.

Evidence: `src/components/layout`, `src/lib/offline.ts`, `public/sw.js`, `server/postgres.mjs`, `server/supabase.mjs`, `scripts`

## Proposed — Survey-quality GIS and site context

### P001 · Verified campus boundary and footprints [P0 · NOT IMPLEMENTED]

Separate legal/authorized site boundaries from visible image outlines and building pins.

Acceptance: Compare registered geometry against authorized survey/control evidence; store source, date and error.

Needs: School authorization; surveyed or licensed source geometry.

### P002 · Georeferencing quality dashboard [P0 · NOT IMPLEMENTED]

Show control-point geometry, independent checkpoint error, CRS and usable image extent.

Acceptance: Report held-out horizontal RMSE in metres; reject degenerate placement and display uncertainty.

Needs: Surveyed independent checkpoints; coordinate transformations.

### P003 · Raster/GeoTIFF and orthomosaic ingest [P1 · NOT IMPLEMENTED]

Use genuine map rasters with CRS/transform instead of manually pretending a photo is GIS.

Acceptance: Check CRS, transform, scale, nodata, upload limits and tile alignment on known points.

Needs: Licensed georeferenced imagery; raster tiling/storage pipeline.

### P004 · DEM and drainage context [P2 · NOT IMPLEMENTED]

Add terrain, slope, drainage and low-lying-area context to field planning.

Acceptance: Compare DEM resolution/vertical datum and observed drainage; label assumptions and missing culverts.

Needs: Suitable elevation data and hydrology expertise; no generic flood forecast.

### P005 · Multi-hazard scenario layers [P1 · NOT IMPLEMENTED]

Compare official flood, landslide, wind and earthquake-related datasets without mixing their meanings.

Acceptance: Show source, scenario, scale, dates and uncertainty separately; never sum arbitrary scores.

Needs: Licensed current agency layers; a documented combination method.

### P006 · Spatial index and large-layer tiling [P1 · NOT IMPLEMENTED]

Keep large campus/municipality datasets responsive on phones.

Acceptance: Benchmark query latency, memory, tile size and geometric agreement against untiled source.

Needs: Representative datasets and device benchmarks.

### P007 · Versioned GIS changes and approvals [P0 · NOT IMPLEMENTED]

Explain when geometry changed, who reviewed it, and which source supports the change.

Acceptance: Reproduce previous map versions; require review before a new official workspace layer replaces one.

Needs: Version schema, reviewer roles and audit/export policy.

### P008 · Geographic uncertainty envelopes [P1 · NOT IMPLEMENTED]

Show where a feature may lie instead of presenting a guessed point as exact.

Acceptance: Propagate stated location/model error and evaluate whether reference points fall within reported bounds.

Needs: Error estimates and independent survey references.

## Proposed — Stronger visual perception and human correction

### P009 · Promptable segmentation assistant [P1 · NOT IMPLEMENTED]

Use SAM/SAM 2-style interactive masks to accelerate outlining, with human corrections.

Acceptance: Compare IoU/boundary F1 and correction time to manual polygons and a CNN baseline.

Needs: Licensed model weights, compute and locally labeled images.

### P010 · Text-guided object grounding [P2 · NOT IMPLEMENTED]

Ground descriptions such as visible debris or blocked doorway into image regions.

Acceptance: Measure class-specific localization precision/recall and unsupported-query failures.

Needs: Grounding model plus local definitions and negative examples.

### P011 · Instance/panoptic campus segmentation [P1 · NOT IMPLEMENTED]

Separate adjacent buildings, paths and vegetation rather than only classifying the whole image.

Acceptance: Report per-class IoU, instance AP and split/merge errors across held-out locations.

Needs: Pixel/instance ground truth; trained or adapted model.

### P012 · Image-quality gate [P0 · NOT IMPLEMENTED]

Flag blur, glare, darkness and inadequate overview coverage before an expensive AI call.

Acceptance: Measure rejection accuracy and whether retake guidance improves downstream task results.

Needs: Representative good/bad photos and user retake study.

### P013 · Self-supervised feature adaptation [P2 · NOT IMPLEMENTED]

Explore DINOv2-style representations when labeled school imagery is limited.

Acceptance: Compare frozen/adapted embeddings and a supervised CNN with equal data splits and budget.

Needs: Permitted unlabeled imagery; reproducible feature pipeline.

### P014 · Cross-view building identity review [P1 · NOT IMPLEMENTED]

Suggest repeated-building matches across frames without inventing unique campus counts.

Acceptance: Report false merges/missed matches; require human links before registering identities.

Needs: View overlap and independently labeled cross-view correspondences.

### P015 · Active-learning annotation queue [P1 · NOT IMPLEMENTED]

Ask staff to label uncertain/diverse examples instead of collecting redundant easy frames.

Acceptance: Plot learning curves versus random sampling at equal annotation effort.

Needs: Labeling tool, model uncertainty outputs and annotation budget.

### P016 · Privacy-preserving image preparation [P0 · NOT IMPLEMENTED]

Offer face/document/plate redaction and show exactly what will leave the device.

Acceptance: Evaluate missed redactions and detection loss; require a visual consent preview.

Needs: Consent policy, redaction model and privacy evaluation data.

## Proposed — Reconstruction and evidence-linked digital twins

### P017 · SfM/MVS campus reconstruction [P2 · NOT IMPLEMENTED]

Create an actual photogrammetric model from overlapping suitable imagery.

Acceptance: Compare scale, completeness and checkpoint error against measured references.

Needs: Calibrated overlapping imagery, control points and reconstruction compute.

### P018 · Orthomosaic generation pipeline [P1 · NOT IMPLEMENTED]

Turn appropriate aerial capture into a real orthorectified map product.

Acceptance: Validate reprojection/checkpoint error, seams, missing surfaces and georeferencing metadata.

Needs: Capture protocol, photogrammetry tooling and authorized aerial access.

### P019 · Visual-inertial/SLAM capture experiment [P3 · NOT IMPLEMENTED]

Study camera trajectory and local geometry for indoor/covered areas where GPS is poor.

Acceptance: Report trajectory drift and relocalization failures; never treat an unanchored map as geographic truth.

Needs: Compatible devices, IMU calibration and independent route references.

### P020 · Semantic campus digital twin [P2 · NOT IMPLEMENTED]

Link verified rooms, assets, geometry and dated evidence to a versioned 3D view.

Acceptance: Every selected object resolves to a real record and revision; missing/stale information stays visible.

Needs: Verified geometry, stable identifiers and asset governance.

### P021 · NeRF/3D Gaussian viewing experiment [P3 · NOT IMPLEMENTED]

Explore smooth recorded-view navigation where capture permits novel-view rendering.

Acceptance: Measure viewing quality, mobile speed and metric error separately; appearance is not survey accuracy.

Needs: Suitable imagery, trained scene representation and device budget.

### P022 · BIM/IFC and CAD alignment [P2 · NOT IMPLEMENTED]

Reuse authorized building models/plans rather than reconstructing known geometry from guesses.

Acceptance: Validate units, transforms, object IDs and measured correspondence before accepting a source.

Needs: Licensed CAD/BIM files and as-built checks.

### P023 · LiDAR/depth-assisted survey option [P3 · NOT IMPLEMENTED]

Study measured depth when available instead of inferring all dimensions from one image.

Acceptance: Report sensor accuracy, coverage and registration error against independent measurements.

Needs: Compatible depth/LiDAR hardware and calibration.

### P024 · Map evidence provenance links [P0 · NOT IMPLEMENTED]

Make every geometric assertion traceable to imagery, measurements and reviewer decisions.

Acceptance: Open an object and retrieve its source date, capture context, revision and review trail.

Needs: Source retention rules and immutable evidence identifiers.

## Proposed — Multimodal detection and preventive maintenance

### P025 · Dated before/after change detection [P1 · NOT IMPLEMENTED]

Locate changes between aligned inspections or aerial surveys, reducing repetitive manual review.

Acceptance: Measure true changes, seasonal/lighting false positives and temporal leakage.

Needs: Co-registered repeat imagery and independently adjudicated change labels.

### P026 · Visible surface-damage segmentation [P1 · NOT IMPLEMENTED]

Localize visible cracks/spalling-like surface features for inspection follow-up.

Acceptance: Report segmentation/localization performance and false alarms; do not infer hidden structural capacity.

Needs: Locally labeled imagery; engineering review of visible-condition categories.

### P027 · Measured defect progression [P2 · NOT IMPLEMENTED]

Track a visible feature only when image scale and acquisition geometry support comparison.

Acceptance: Compare reported dimension change against physical measurements with uncertainty.

Needs: Repeated calibrated measurements; stable observation protocol.

### P028 · Optional environmental telemetry fusion [P2 · NOT IMPLEMENTED]

Combine aggregate water-level/rainfall/smoke-device readings with field records.

Acceptance: Evaluate time alignment, calibration, missing data and independent sensor checks.

Needs: Real maintained sensors; no simulated data shown as live.

### P029 · Missing-data-aware anomaly review [P2 · NOT IMPLEMENTED]

Flag unusual validated telemetry or record patterns without declaring an imminent disaster.

Acceptance: Evaluate false alarms per day, missed events and behavior during sensor outages.

Needs: Sufficient historical data with trustworthy event/maintenance labels.

### P030 · Explainable evidence fusion [P1 · NOT IMPLEMENTED]

Present why multiple sources warrant a field check instead of one unexplained danger score.

Acceptance: Reviewers can inspect source contributions and conflicting evidence; quantify decision consistency.

Needs: Defined evidence rules or validated interpretable model.

### P031 · Maintenance prioritization study [P1 · NOT IMPLEMENTED]

Rank documented corrective work by policy, exposure and unresolved evidence for staff approval.

Acceptance: Compare rank agreement and action timeliness with the existing staff process.

Needs: School-approved criteria, resource limits and historical task outcomes.

### P032 · Locally validated domain adaptation [P2 · NOT IMPLEMENTED]

Test whether models transfer between schools, materials, cameras and weather conditions.

Acceptance: Report per-school/domain performance and abstention; retrain only on permitted training data.

Needs: Multi-school consent and a protected external test set.

## Proposed — Routing and scenario-based preparedness

### P033 · Auditable route graph survey [P0 · NOT IMPLEMENTED]

Record real connectivity, entrances, gates, stairs, surface and clearance rather than deriving a route from appearance alone.

Acceptance: Field-audit sampled graph edges and document missing/disconnected sections.

Needs: Approved campus path survey and accessibility checks.

### P034 · Time-stamped graph closure workflow [P1 · NOT IMPLEMENTED]

Let authorized staff review temporary route closures with expiry and a reason.

Acceptance: Routes exclude current approved closures and recover only through explicit status policy.

Needs: Reliable staff updates and revision-aware route computation.

### P035 · Multi-objective route comparison [P1 · NOT IMPLEMENTED]

Compare distance, accessibility, capacity and approved exposure constraints without promising a safe optimum.

Acceptance: Benchmark against current Dijkstra and audited route alternatives; expose infeasibility.

Needs: A defensible graph, constraint definitions and tested algorithms.

### P036 · Accessibility field audit profiles [P0 · NOT IMPLEMENTED]

Support step-free, ramp/gate, width and assistance requirements with verified data.

Acceptance: Test representative tasks with participating users and measured edge attributes.

Needs: Voluntary accessibility input and inclusive design review.

### P037 · Aggregate congestion scenarios [P2 · NOT IMPLEMENTED]

Explore count-based crowd scenarios without tracking identifiable students.

Acceptance: Compare simulated queue/travel outcomes to supervised non-emergency drill observations.

Needs: Calibrated aggregate counts and reviewed simulation assumptions.

### P038 · Multi-exit assembly assignment [P2 · NOT IMPLEMENTED]

Study how capacities and accessible destinations affect assignment under constraints.

Acceptance: Report infeasible cases, fairness/accessibility trade-offs and capacity violations.

Needs: Verified destinations, capacities and school-approved constraints.

### P039 · Drill rehearsal simulator [P2 · NOT IMPLEMENTED]

Explore what-if closures and delayed communication in a clearly separate training mode.

Acceptance: No simulated alert or route becomes live; scenario outcome and assumptions remain exportable.

Needs: Scenario boundaries, consent and trained facilitators.

### P040 · Responder decision explanation [P1 · NOT IMPLEMENTED]

Show graph edges, closure evidence and stale inputs behind a route recommendation.

Acceptance: A reviewer can reproduce the result and identify why a route is unavailable or not chosen.

Needs: Versioned inputs and route explanation interface.

## Proposed — Research quality and reproducible experiments

### P041 · Annotation and adjudication workspace [P0 · NOT IMPLEMENTED]

Create consistent building/condition labels with disagreements reviewed explicitly.

Acceptance: Measure inter-rater agreement and retain adjudication reasons rather than silently overwriting labels.

Needs: Written label taxonomy and trained annotators.

### P042 · Dataset/model version registry [P0 · NOT IMPLEMENTED]

Tie every experiment and draft to exact data, split, code and model revisions.

Acceptance: A second researcher can reconstruct the exact evaluation artifact from recorded identifiers.

Needs: Artifact storage, hashes and version governance.

### P043 · Leakage-resistant split manager [P0 · NOT IMPLEMENTED]

Keep the same building/video sequence or near-duplicate frame out of both train and test.

Acceptance: Audit splits by school, date, building and capture sequence before evaluation.

Needs: Persistent capture/entity identifiers and deduplication checks.

### P044 · Baseline and ablation runner [P0 · NOT IMPLEMENTED]

Compare manual work, GIS-only rules, CNN baseline and each added method under the same budget.

Acceptance: Produce reproducible task metrics, seeds/configurations and failure examples.

Needs: Runnable baseline implementations and fixed evaluation protocol.

### P045 · Uncertainty and calibration evaluation [P1 · NOT IMPLEMENTED]

Test confidence calibration, abstention and out-of-distribution behavior instead of trusting raw scores.

Acceptance: Report reliability plots/Brier or ECE where appropriate, coverage and error among accepted cases.

Needs: Sufficient held-out labels; task-appropriate confidence interpretation.

### P046 · Research consent and data governance ledger [P0 · NOT IMPLEMENTED]

Track permitted purposes, withdrawal rules, anonymization and use restrictions for study data.

Acceptance: No image is exported to a provider or dataset without its applicable recorded permission.

Needs: Institutional/school review and a workable deletion policy.

### P047 · Experiment notebook and result export [P0 · NOT IMPLEMENTED]

Store hypothesis, dataset, run settings, metrics, limitations and reviewer observations together.

Acceptance: Export a traceable report that distinguishes observed results from plans and mocks.

Needs: Agreed experiment schema and responsible study team.

### P048 · Model cards and failure-case gallery [P1 · NOT IMPLEMENTED]

Make intended use, known failure modes and unsupported tasks visible to school staff.

Acceptance: Each released model has a source/license, test scope, failure examples and rollback version.

Needs: Actual validation evidence; no invented accuracy claims.

## Proposed — People, inclusion and learning

### P049 · Reviewed Filipino/local-language guidance [P1 · NOT IMPLEMENTED]

Make instructions understandable in the participating school’s languages.

Acceptance: Test comprehension with target users; review emergency wording and avoid automatic unreviewed translation.

Needs: School-approved terminology and fluent reviewers.

### P050 · WCAG-oriented accessibility audit [P0 · NOT IMPLEMENTED]

Verify keyboard, screen-reader, contrast, focus and reduced-motion flows on real devices.

Acceptance: Resolve documented barriers against an agreed WCAG 2.2 scope and representative tasks.

Needs: Assistive-technology users/test devices and audit time.

### P051 · Role-specific preparedness lessons [P2 · NOT IMPLEMENTED]

Offer short reviewed lessons and practice tasks for students, parents and staff.

Acceptance: Measure comprehension/retention and task completion without claiming real-emergency effectiveness.

Needs: Approved educational content and voluntary participation.

### P052 · Drill planning and after-action review [P1 · NOT IMPLEMENTED]

Plan supervised drills, record observations and turn findings into accountable follow-up.

Acceptance: Compare planned/observed task times and unresolved issues with a documented review.

Needs: School safety approval and a non-emergency protocol.

### P053 · Offline QR safety cards [P1 · NOT IMPLEMENTED]

Provide approved room/building instructions without requiring an account for private records.

Acceptance: QR resolves to the correct dated public guidance; no roster/location information is exposed.

Needs: Explicit public/private content separation and revision policy.

### P054 · School feedback and usability loop [P0 · NOT IMPLEMENTED]

Record confusing panels, inaccessible flows and failed tasks instead of adding unused features.

Acceptance: Prioritize and retest issues from observed tasks across all six roles.

Needs: Representative participants and a structured issue rubric.

### P055 · Consent-centered guardian communication [P2 · NOT IMPLEMENTED]

Help approved guardians understand drills and reported status without surveillance.

Acceptance: Confirm recipient authorization, opt-out behavior and absence of precise-location leakage.

Needs: Relationship verification and reviewed communication policy.

### P056 · Preparedness knowledge assistant [P2 · NOT IMPLEMENTED]

Retrieve school-approved procedures with citations and clear uncertainty using RAG.

Acceptance: Measure citation correctness, retrieval failure and unsafe/unsupported answer rate; no autonomous dispatch.

Needs: Curated current school documents, retrieval evaluation and human escalation.

## Proposed — Reliability, governance and sustainable operations

### P057 · Provider budget and availability dashboard [P1 · NOT IMPLEMENTED]

Show quotas, actual latency, failures and explicit lower-cost/single-view options.

Acceptance: Measure failure handling; no automatic provider switch or unapproved retry sends school data elsewhere.

Needs: Provider telemetry, consent policy and cost tracking.

### P058 · On-device/edge inference option [P2 · NOT IMPLEMENTED]

Reduce external transfers and network dependence when a compatible validated model exists.

Acceptance: Benchmark accuracy, latency, memory, battery and privacy versus server inference on target phones.

Needs: Licensed compact weights, compatible runtime and physical-device testing.

### P059 · Defined retention and deletion controls [P0 · NOT IMPLEMENTED]

Apply school-approved retention and deletion rules to images, exports, snapshots and derived models.

Acceptance: Test expiry/deletion and explain backup/legal hold limits with an audit record.

Needs: Institutional policy, ownership rules and restore/deletion procedures.

### P060 · Tamper-evident evidence manifests [P1 · NOT IMPLEMENTED]

Detect changes to evidence and study artifacts without claiming that a hash proves truth.

Acceptance: Verify image/document hashes, revisions and authorized signatures against test tampering.

Needs: Key management and a threat model; external trust is not automatic.

### P061 · Off-host backups and restore drills [P0 · NOT IMPLEMENTED]

Validate recovery of both databases and private media rather than only creating local files.

Acceptance: Restore into an isolated environment and verify school permissions and evidence integrity.

Needs: Encrypted independent storage and scheduled rehearsals.

### P062 · Independent security and load acceptance [P0 · NOT IMPLEMENTED]

Test tenant isolation, abuse, file handling and realistic simultaneous school use before deployment.

Acceptance: Record findings/remediation and measured performance on the intended hosting plan.

Needs: Authorized external assessment and representative workloads.

### P063 · Privacy-preserving multi-school reporting [P2 · NOT IMPLEMENTED]

Study regional patterns using agreed aggregation without exposing identifiable small groups.

Acceptance: Test suppression/re-identification risks and access rules; no unauthorized raw records leave a school.

Needs: Inter-school agreements and statistical disclosure review.

### P064 · Evidence-to-action task workflow [P1 · NOT IMPLEMENTED]

Convert reviewed concerns into assigned work with due dates, evidence and explicit closure approval.

Acceptance: Measure resolution timeliness and auditability; suggestions never auto-close or certify conditions.

Needs: School responsibilities, repair capacity and a closure verification protocol.

## Study planning narrative

## What this document commits to

This document records the existing RADAR capability inventory and a proposed research backlog. Committing this PDF to GitHub commits the plan and its status labels; it does not implement the proposed software, approve a school study or guarantee delivery of all 64 additions.

Recommended study focus

Evaluate a human-reviewed, image-assisted campus mapping workflow against simpler baselines. Use genuine geographic calibration, explainable evidence and measured correction time. Treat visual detection, geographic accuracy, route computation and usability as separate tasks.

| A stronger system is a validated combination |
| --- |
| GIS stores and analyzes geographic information. A CNN is one family of image models. They solve different problems. Foundation segmentation models, multimodal vision, photogrammetry and graph optimization may add value, but none is universally “more powerful” or guaranteed to improve school safety. |

Useful first contributions

• A clear dataset/annotation protocol and leakage-resistant evaluation.

• An image-quality and privacy gate before sending school imagery to any provider.

• A segmentation-assistance comparison with manual work and a simple CNN baseline.

• Independent geographic checkpoint testing and explicit uncertainty.

• A school-staff correction/review workflow with reproducible evidence and failure examples.

The larger backlog is a menu for future work, not a recommendation to place every feature in one student study or one dashboard.

## Status legend and code baseline

Baseline: 44d511f on design/radar-command-dashboard. GitHub main at 2f5f72d merges the same code through PR #4. Checked on 27 October 2026. Application code was not changed to produce this report.

| Label | Meaning | Count |
| --- | --- | --- |
| Built | Implementation exists in the repository. This is not a field-performance or safety certification. | 64 |
| Activation | Code exists, but external accounts/keys, data-use consent, funding, hosting or connectivity need activation/verification. | 9 |
| Data needed | The workflow needs real school coordinates, survey geometry or verified assets before it represents a real campus. | 7 |
| Experimental | Prototype/approximate workflow exists; field accuracy, physical transport or survey/asset acceptance remains unverified. | 4 |
| Proposed | Not implemented in the audited baseline. An idea for future design, experimentation or deployment governance. | 64 |

The 84 entries are feature families, not a count of buttons, API routes or independently certified modules. A family may contain several related controls. Proposals extend or complement existing families; they are not hidden claims of completion.

Existing verification evidence

• 87 automated tests were reported passing at the code baseline; 36 feature tests passed with isolated embedded PostgreSQL.

• Production build and scoped browser checks passed. Vision/model responses and school imagery in tests were synthetic or mocked.

• The reported Gemini HTTP 503 remains an external availability problem. Error recovery tests do not prove live provider recovery.

• Live Supabase/Storage acceptance, Vercel publication, actual SMS/push receipt, physical devices, verified 3D assets and CNN accuracy remain separate checks.

## Unfinished activation and development

These items must not be described as complete merely because a screen, configuration wizard or adapter exists.

| Item | Current boundary | Required next evidence |
| --- | --- | --- |
| Live hosted storage/Auth | Supabase adapters exist; public URL/key alone do not configure private storage/database access. | Server-only setup, account tests, tenant isolation and a real database + private-media restore. |
| Public hosting | Vercel adapter and guide exist; a deployment is not established by a GitHub push. | Hosting account/configuration, HTTPS, durable storage, working scheduled jobs and acceptance record. |
| Live image analysis | Provider integration and consent/error handling exist. | A successful real-image request and a task-specific quality evaluation, separate from a read-only model check. |
| Dedicated CNN inference | CNN polygon import/review exists; no trained model or inference runtime is bundled. | A licensed appropriate checkpoint, inference service/local runtime and independent local validation. |
| Automatic metric campus map | Image drafts and approximate three-anchor placement exist. | Suitable imagery, camera/CRS control, orthorectification and independent checkpoints; not a walking-video shortcut. |
| Real 3D and physical devices | Prepared assets, aggregate sensor adapters and peer relay exist. | Verified model/survey assets; physical camera/GPS/counting/relay acceptance on actual devices. |
| External emergency delivery | Push/SMS jobs and receipt adapters exist. | Recipient consent, working HTTPS/provider configuration and real receipt tests; fallback procedures. |
| Operational release | Test tooling exists; independent school deployment assurance is incomplete. | Security/load/accessibility acceptance, current official datasets, reviewed procedures and responsible staff. |

## The photo/video-to-map study workflow

The main GIS screen already supports the user’s desired entry point: upload → Generate GIS draft → review → save. The scientific question is how to make its outputs accurate, useful and measurable, not how to rename every draft as a verified map.

| Step | Existing workflow | Potential study extension |
| --- | --- | --- |
| 1. Capture | Choose a permitted school photo/video; video sampling selects three JPEG views. | Quality/redaction gate; a documented aerial or ground capture protocol (P012, P016). |
| 2. Propose | Configured vision suggests visible campus area/buildings, walkways and possible visible concerns. | Compare with promptable segmentation, instance models and a CNN baseline (P009–P011). |
| 3. Review | Users rename/remove/draw geometry, review uncertainty and save a private school draft. | Annotation/adjudication records and measured correction effort (P041). |
| 4. Locate | Optional known three-point affine placement for a confirmed top-down view. | Georeferenced raster/orthomosaic and independent checkpoint errors (P002–P003, P018). |
| 5. Compare | GIS checks selected reviewed area polygons against registered building pins. | Verified footprints and explicit uncertainty, not a probability derived from a pin (P001, P008). |
| 6. Act | School findings, repairs and verified evacuation paths remain separate approved records. | Explainable prioritization and evidence-linked action after human confirmation (P030, P064). |

| A single view is not the whole campus |
| --- |
| Video frames can repeat buildings or omit hazards. A visible campus outline is not a legal property boundary. Approximate placement does not correct terrain, lens distortion or perspective. A CNN/VLM result does not establish hidden structural safety or an approved evacuation route. |

## Beyond a single CNN: use the right method

COMPLEMENTARY METHODS, NOT A BLANKET POWER RANKING

| Method | Useful contribution | Prerequisites | Key limitation |
| --- | --- | --- | --- |
| GIS + spatial indexing | Coordinates, overlays, contact/nearest/graph analysis. | Valid CRS, source geometry and dates. | Not an image detector; poor inputs still yield poor maps. |
| CNN segmentation | Task-specific pixel/instance labels; useful baseline and possible edge runtime. | Appropriate weights, labeled validation and compute. | Transfer/domain errors; a generic classifier is not a campus hazard segmenter. |
| Vision transformer / foundation features | Representations for segmentation, retrieval and adaptation experiments. | Licensed model, budget and local evaluation. | Not universally superior to a small CNN on limited devices/data. |
| SAM / SAM 2-style masks | Prompt-assisted image/video outlines with human correction. | Prompts, usable imagery and model runtime. | A mask does not establish semantic hazard, geographic accuracy or physical truth. |
| Text grounding + VLM | Language-guided candidates, descriptions and review notes. | Image-capable provider/model and explicit data-use permission. | Hallucination/localization errors; raw confidence is not calibrated risk. |
| SfM/MVS + orthomosaic | Camera geometry, spatial reconstruction and orthorectified imagery. | Overlapping capture, calibration, control and reconstruction compute. | Missing texture/coverage, vegetation and camera motion cause failures. |
| NeRF / Gaussian viewing | Recorded-scene novel-view visualization experiments. | Suitable capture and scene training/rendering. | Visual quality does not imply correct scale, semantics or live conditions. |
| Temporal change detection | Compare aligned repeated imagery/records. | Dates, co-registration and independent change labels. | Lighting/season/registration can mimic damage. |
| Evidence / sensor fusion | Combine independent evidence with source reliability and uncertainty. | Calibrated inputs and a defensible fusion method. | More sensors do not automatically improve reliability; conflicts/missingness matter. |
| Graph optimization / simulation | Compare surveyed routes, capacities and scenario constraints. | Verified graph and grounded assumptions. | Shortest or simulated route is not guaranteed safe in an emergency. |
| RAG over approved procedures | Retrieve school instructions with source citations. | Current approved documents and retrieval/answer evaluation. | Can misretrieve or overstate; no autonomous dispatch/medical/structural authority. |
| Edge deployment + active learning | Reduce transfers and focus limited annotation effort. | Compatible compact model, device tests and labeling loop. | Privacy, speed and accuracy trade-offs must be measured. |

All method additions beyond the existing GIS/vision adapters remain proposals unless explicitly marked in the current inventory. Benchmark on the actual study task and devices.

## A hybrid, evidence-linked architecture

Keep authoritative records, image suggestions and proposed model experiments as separate layers. A digital twin is only as trustworthy as its geometry, timestamps and evidence links; it is not automatically a live sensor of the school.

Architecture: source records + permitted imagery + proposed validated inputs → geography/provenance + perception/experiments → human review → reviewed records, tasks and plans.

• Store original source/revision/permission metadata alongside derived artifacts.

• Version model predictions; never silently overwrite reviewed school facts.

• Require explicit approval before operational publication, communication or route changes.

• Keep research/training simulation visibly separate from current school operations.

Diagram: solid boxes contain existing workflow families; the dashed source box describes proposed additional inputs. Proposed components named inside solid workflow boxes are not already implemented.

## A defensible study design

Suggested working title

“RADAR: An Evidence-Linked Campus Mapping and Preparedness Workflow for Selected Schools in Camarines Norte.” This is a proposed title, not an institutional approval or completed study.

Primary research question

Does an assisted, geographically calibrated and human-reviewed workflow improve mapping correctness and staff task effort compared with simpler workflows, under the same imagery, annotation budget and test conditions?

| Experiment | Fair comparison | Primary evidence |
| --- | --- | --- |
| A. Image delineation | Manual polygons vs current vision assistance vs a task-appropriate CNN vs proposed segmentation assistance. | Held-out IoU/boundary F1 and human correction time. Record false positives and abstentions. |
| B. Geographic placement | Manual GIS/known-point placement vs the current three-anchor transform vs a proposed properly controlled orthomosaic workflow. | Independent checkpoint horizontal error, alignment failures and coverage; fitted control points are not a test set. |
| C. Route constraints | Current Dijkstra vs a proposed multi-objective method on the same surveyed graph and closures. | Feasibility, constraint violations, route length and explanation fidelity; not a live-emergency safety claim. |
| D. Human workflow | Current task flow vs a selected proposed flow, counterbalanced across equivalent tasks. | Correct completion, time, corrections, comprehension and validated usability/workload instruments. |

Hypotheses to predefine

Examples: H1 reduces delineation time without exceeding a predeclared quality-loss margin; H2 reduces independent geographic error; H3 improves cross-view identity review without unacceptable false merges; H4 improves task completion/comprehension. Set margins and release thresholds before evaluation, with supervisors and school stakeholders—not after seeing results.

## Data collection, labels and experimental splits

Collect only data needed for the selected research questions. Avoid student faces, identities, medical details and unnecessary rosters in mapping datasets. A training-lab fixture is not a field dataset.

| Data element | Protocol | Evidence to retain |
| --- | --- | --- |
| Capture sessions | Record source permission, device, date, weather/lighting, position context and intended use. | Capture/session ID; permitted reuse and provider-sharing scope. |
| Survey/geography | Use documented CRS, ground control and independent checkpoints; record scale/resolution. | Control/checkpoint roles, source, error and coordinate transform revision. |
| Visible labels | Define classes and what counts as unknown/occluded; do not infer hidden structural defects from pixels. | Label handbook, examples, disagreements and adjudication trail. |
| Annotation reliability | Where feasible, use two independent annotators and an adjudicator with relevant expertise. | Per-class agreement; disagreement patterns and changes to the taxonomy. |
| Train/validation/test | Group by school/building/session as required by the generalization claim; remove near-duplicate frames across splits. | Locked split IDs and provenance. Distinguish new-school tests from same-school temporal tests. |
| Class balance | Include negative/unclear examples and document rare classes; avoid manufacturing a balanced test set that hides field prevalence. | Class counts, exclusion criteria and known blind spots. |
| Temporal change | Co-register dated imagery and obtain independent change labels before evaluating a change model. | Registration error, seasonal confounds and ground verification date. |
| Dataset release | Prefer restricted or de-identified artifacts where disclosure could expose students or sensitive school layouts. | Access policy, retention/withdrawal rules and approved dissemination plan. |

No participant count, number of schools, dataset size or model accuracy is claimed as already achieved. Confirm feasibility and sample requirements before locking the protocol.

## Metrics that can support an honest conclusion

| Task | Useful measures | What to avoid |
| --- | --- | --- |
| Segmentation | IoU = intersection / union; class-wise Dice; boundary F1; instance AP if instance labels exist. | One averaged accuracy that hides missed rare concerns or boundary mistakes. |
| Detection/localization | Per-class precision/recall; AP where appropriate; false positives and false negatives per image/session. | Treating model score as the probability a school is unsafe. |
| Geographic accuracy | Horizontal RMSE = sqrt(mean(dx² + dy²)) on independent checkpoints; maximum/percentile error and coverage. | Testing on the same three points used to fit the transform. |
| Cross-view identity | False merges, missed matches and reviewer correction effort. | Claiming a unique building inventory from sampled video labels alone. |
| Change detection | Event/region precision/recall with registration-aware error analysis; confounding false positives. | Calling lighting, season or viewpoint changes structural damage. |
| Routing | Feasible/available cases, constraint violations, graph-edge validity, distance/time estimate error in approved drills. | Certifying safety from shortest distance or an unvalidated simulation. |
| Human workflow | Task success, errors, completion time, corrections, comprehension; SUS/TLX if correctly administered. | Equating satisfaction or animation preference with disaster-risk reduction. |
| Reliability/cost | Latency distributions, 503/429/timeout rate, explicit retry rate, memory, battery and cost per accepted artifact. | Assuming free tiers, stable model aliases or model-list HTTP 200 guarantee successful analysis. |
| Uncertainty | Reliability/calibration measures for outputs with suitable labels; abstention and coverage-risk curves. | Reporting ECE/Brier without defining the probability task or using raw scores as calibrated truth. |

Report confidence intervals and effect sizes where justified. State the unit of analysis (image, building, session, school or participant). Use grouped/paired analysis where dependencies exist; do not count adjacent video frames as independent schools.

Numeric success thresholds and sample sizes should be preregistered or approved before the final test. This roadmap intentionally invents no result, p-value, accuracy target or guaranteed improvement.

## Human study, inclusion and acceptance

Use a supervised, non-emergency study. Mapping accuracy and usability can be evaluated without exposing students or staff to real hazards or staging a surprise emergency.

Representative roles and tasks

• Administrator: choose a school, approve an account, check a source, review a draft and restore the correct workspace.

• Inspector/teacher: capture a clear view, correct a suggestion, save evidence and explain why the result is still a draft.

• Responder: understand source freshness, inspect route limitations and distinguish server acknowledgement from external delivery.

• Student/parent: understand allowed information and report status without gaining staff authority or seeing private imagery.

Recruitment and study conduct

Start with a small feasibility pilot, then justify the final sample through the research question, resources and statistical plan. Include assistive-technology and lower-end-device users where relevant. Obtain applicable school/institutional review, informed consent and separate protections before involving minors. Keep research participation distinct from emergency access.

Suggested observations

• Counterbalance equivalent tasks to reduce learning/order effects; record assistance and failures, not just successful times.

• Test at least a narrow phone, desktop, poor-network condition and reduced-motion/keyboard flow.

• Check comprehension: “Does no overlap mean safe?” and “Does an image outline prove the property boundary?”

• Evaluate review burden and error consequences, not only visual attractiveness.

| Required interpretation |
| --- |
| A usability score, model benchmark or successful drill is evidence for that evaluated task. None alone establishes that RADAR reduces injury, predicts a disaster or replaces school safety professionals. |

## Delivery roadmap with evidence gates

Illustrative sequence: approximately 16–20 weeks after permissions, data access and a feasible scope are agreed. This is an estimate for planning, not a staffing/hosting commitment. Reduce scope rather than skipping validation.

| Phase | Illustrative timing | Deliverable and exit gate |
| --- | --- | --- |
| 0. Baseline & governance | Weeks 1–2 | Verify existing app/account isolation, define consent/data retention, choose primary tasks, assign school reviewers and freeze the protocol. |
| 1. Data & baselines | Weeks 3–5 | Capture permitted imagery, label a pilot set, survey reference points, lock grouped splits and run manual/CNN/current-vision baselines. |
| 2. One perception improvement | Weeks 6–9 | Add quality/privacy gates and one segmentation-assistance method. Gate: reproducible held-out metrics and reviewable failures. |
| 3. Geographic validation | Weeks 10–12 | Validate known-point/orthomosaic alignment with independent checkpoints; show uncertainty and reject unsuitable imagery. |
| 4. Human workflow evaluation | Weeks 13–15 | Run counterbalanced non-emergency tasks across representative roles/devices; fix comprehension and accessibility barriers. |
| 5. Acceptance & report | Weeks 16–20 | Lock final artifacts, complete failure/security/restore checks, report limits and produce the reproducible study package. |

Do not put every idea into the critical path

The 64 proposals contain 19 P0 foundations, 24 P1 next increments, 18 P2 extensions and 3 P3 long-term experiments. Select a small coherent subset. NeRF/Gaussian viewing, SLAM, LiDAR, sensor fusion and complex crowd simulation should stay outside the core unless suitable data, expertise and an explicit evaluation budget already exist.

A defensible minimum research increment combines P012, P016, P041–P044 and one of P009/P011, with P002 geographic validation and human review. Production governance P046/P059/P061/P062 remains necessary for real deployment.

## Configuration and operational readiness

| Dependency | What to configure/test | Boundary |
| --- | --- | --- |
| Existing app | Use Node 24, one matching UI/API launcher, a backed-up durable database and current branch/main code. | Do not reseed/delete school records to refresh the interface. |
| Vision service | Select an image-capable model; keep server-only keys private; obtain permission before uploads. | A ChatGPT subscription is not API credit. Free tiers and service availability vary. |
| Temporary provider failure | Honor Retry-After; explicitly retry one view if useful; keep prior geometry on failure. | A 503 can be temporary overload. Do not rotate credentials or silently change provider on every error. |
| Supabase/Storage | Configure private server database/Storage access and allowed Auth URLs; verify school isolation. | Public publishable keys are not database passwords or service-role credentials. |
| Hosting/jobs | Verify HTTPS, function duration, payload limits, durable queues/cron and actual callback URLs on the target plan. | A pushed commit, health check or local preview is not a production deployment. |
| SMS/push | Test consent, recipient authorization, sender/subscription setup and actual receipts. | Provider acceptance and phone receipt differ; preserve local emergency contact procedures. |
| GIS/3D assets | Confirm coordinates, CRS, scale, imagery terms, source dates and measured models. | No survey data means an explicit missing-data state, not invented geometry. |
| Research compute | Choose local CPU/edge/GPU or approved hosted compute according to model/device benchmarks. | No hardware price, cloud cost, license permission or free quota is guaranteed here. |

Separate demo, study and operational environments. Never use training credentials/data for real school emergencies. Budget capture, annotation, professional review, compute, hosting, communications and maintenance as separate costs before requesting institutional deployment.

## Risks, limitations and stop conditions

| Risk | Mitigation to evaluate | Stop/review trigger |
| --- | --- | --- |
| False/missed visual concern | Human review, negative examples, unknown/abstention states and documented failures. | Unacceptable false negatives or unexplained confidence on the held-out set. |
| Wrong geographic placement | Independent checkpoints, source/CRS checks and visible approximate status. | Unresolved CRS/scale mismatch, poor anchor geometry or insufficient control evidence. |
| Private data exposure | Redaction/preview, purpose limitation, permissions and retention/deletion checks. | Missing permission, student-identifying exposure or cross-school access. |
| Incorrect route interpretation | Verified graph, current closure review, constraints and explicit no-route states. | Missing connectivity, stale critical data or a user interpreting a draft as an approved plan. |
| Provider outage/quota/cost | Manual fallback, bounded requests, explicit retry and budget visibility. | No provider acknowledgement, unexplained spend or repeated ambiguity. |
| Model/domain shift | New-school/date tests, model cards, rollback and abstention. | Performance falls outside agreed release criteria for a participating context. |
| Overclaimed study result | Preregister tasks/metrics, preserve failure data and separate mock/live/field evidence. | Leakage, post-hoc threshold selection or unsupported safety/prediction claims. |
| Unmaintained deployment | Named owners, restore drills, verified contacts/datasets and review cadence. | No responsible staff, no tested restore or expired critical procedures. |

Release language

Use “draft,” “reviewed suggestion,” “approximate placement” and “evaluated on the stated dataset” precisely. Do not use “guaranteed safe,” “predicts earthquakes,” “fully autonomous emergency response,” “accurate 3D from any video” or “more powerful than all CNN/GIS systems.”

Philippine school/ethics/privacy obligations and operating procedures must be reviewed with the appropriate institution. This planning document is not a regulatory or engineering certification.

## Research references: method starting points

CANONICAL REFERENCES, NOT A SYSTEMATIC OR “LATEST MODEL” REVIEW

Ronneberger, Fischer & Brox (2015)U-Net: Convolutional Networks for Biomedical Image Segmentation. A foundational segmentation architecture; not campus-trained weights.https://arxiv.org/abs/1505.04597

Vaswani et al. (2017)Attention Is All You Need. Transformer architecture reference, not proof of campus-task superiority.https://arxiv.org/abs/1706.03762

Dosovitskiy et al. (2020)An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale. Vision-transformer reference.https://arxiv.org/abs/2010.11929

Kirillov et al. (2023)Segment Anything. Promptable segmentation reference; semantics and geographic calibration remain separate.https://arxiv.org/abs/2304.02643

Ravi et al. (2024)SAM 2: Segment Anything in Images and Videos. A candidate research method, not implemented here.https://arxiv.org/abs/2408.00714

Liu et al. (2023)Grounding DINO: Marrying DINO with Grounded Pre-Training for Open-Set Object Detection.https://arxiv.org/abs/2303.05499

Oquab et al. (2023)DINOv2: Learning Robust Visual Features without Supervision. Representation/adaptation reference.https://arxiv.org/abs/2304.07193

Cheng et al. (2022)Masked-attention Mask Transformer for Universal Image Segmentation (Mask2Former).https://arxiv.org/abs/2112.01527

Mildenhall et al. (2020)NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis. Visualization is not survey truth.https://arxiv.org/abs/2003.08934

Kerbl et al. (2023)3D Gaussian Splatting for Real-Time Radiance Field Rendering. Candidate scene visualization method.https://arxiv.org/abs/2308.04079

Lewis et al. (2020)Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. Candidate for cited approved-procedure retrieval.https://arxiv.org/abs/2005.11401

These references motivate optional experiments. They do not supply licensed/locally validated deployment artifacts automatically. Check current repositories, licenses, weights, hardware needs and updated evaluations before selection. No external literature search or live model benchmark was performed for this PDF.

## Technical references and repository evidence

GeoJSON / WGS84 interchangeRFC 7946; distinguish geographic positions from image pixels.https://datatracker.ietf.org/doc/html/rfc7946

QGIS documentationGIS review, CRS handling and geometry workflows.https://docs.qgis.org/

GDAL documentationGeospatial raster/vector transformations and data handling.https://gdal.org/en/stable/

OpenDroneMap / COLMAPPotential photogrammetry and reconstruction toolchains; verify suitability and licensing.https://docs.opendronemap.org/ · https://colmap.github.io/

WCAG 2.2Accessibility evaluation reference.https://www.w3.org/TR/WCAG22/

Philippine National Privacy CommissionData Privacy Act and institutional privacy guidance.https://privacy.gov.ph/data-privacy-act/

Official source authoritiesPAGASA, PHIVOLCS and GeoRiskPH: verify current endpoints, dates, licensing and scope.https://www.pagasa.dost.gov.ph/ · https://www.phivolcs.dost.gov.ph/ · https://www.georisk.gov.ph/

Auditable implementation sources

docs/RADAR-2-FEATURES.md — implementation inventory and operating limits.

docs/GIS-AND-CNN.md — image generator, GIS assessment and external CNN-output workflow.

docs/TESTING-AND-CONFIGURATION.md — service setup, advanced tools and isolated lab.

docs/WELCOME-AND-ACCOUNT-RESTORATION.md — account restoration, roles and interface motion.

docs/SUPABASE.md and docs/VERCEL.md — cloud setup and deployment boundaries.

server/vision-provider.mjs; server/campus-map.mjs; server/gis.mjs; server/routing.mjs — source behavior.

tests/vision-provider.test.mjs; tests/campus-map.test.mjs; tests/gis.test.mjs; tests/features.test.mjs — automated/mock evidence.

Source URLs are reference pointers; live availability, current legal interpretation, licenses and agency dataset currency were not verified during document generation. Read the linked authority’s current guidance.

## Backlog handover and study decision log

Every proposal has a stable P-number in feature-catalogue.json and this PDF. Use those IDs in GitHub issues or a study tracker. Documentation status must not be replaced by an implementation claim until code and acceptance evidence exist.

| First foundation IDs | Scope |
| --- | --- |
| P001, P002, P007, P012, P016 | Survey/georeferencing/versioning; image-quality and privacy gates. |
| P024, P033, P036, P041, P042 | Evidence provenance; route/accessibility survey; annotation and artifact registry. |
| P043, P044, P046, P047, P050 | Leakage-resistant baselines, research consent/notebook and inclusive evaluation. |
| P054, P059, P061, P062 | User feedback, retention, independent backups and security/load acceptance. |

Before a proposal becomes a development commitment

• Choose the primary research question and a realistic subset of P-items.

• Assign a responsible owner, school reviewer, data/compute dependencies and acceptance evidence.

• Specify what is a mock, prototype, provider-enabled test, field measurement or operational release.

• Record the decision date and reasons for deferred features; do not mark unfinished features as “done.”

• Keep each operational screen task-focused; progressive disclosure is preferable to dozens of empty panels.

| Deliverable package |
| --- |
| This PDF is accompanied by an editable Markdown document, a machine-readable feature catalogue and an optional PDF-build script. The audited application baseline remains 44d511f; the new document commit does not make the 64 proposed additions operational. |

Recommended conclusion style: “The selected workflow was evaluated under these data, device and participant conditions, with these limitations.” Any stronger claim needs additional evidence.

