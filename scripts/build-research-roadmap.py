#!/usr/bin/env python3
"""Build the reviewable research PDF/Markdown from the public feature catalogue.
Optional document tooling only: Python + reportlab. Not required to run RADAR.
"""
import json, re, html, collections
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, Line, String, Circle, Polygon
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/research'
DATA=json.loads((OUT/'feature-catalogue.json').read_text())
PDF=OUT/'RADAR-Feature-Catalogue-and-Research-Roadmap.pdf'
MD=OUT/'RADAR-Feature-Catalogue-and-Research-Roadmap.md'
FONTS=Path('/usr/share/fonts/truetype/dejavu')
for name,file in [('RadarSans','DejaVuSans.ttf'),('RadarSans-Bold','DejaVuSans-Bold.ttf'),('RadarSans-Oblique','DejaVuSans-Oblique.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(FONTS/file)))
pdfmetrics.registerFontFamily('RadarSans',normal='RadarSans',bold='RadarSans-Bold',italic='RadarSans-Oblique',boldItalic='RadarSans-Bold')
NAVY=HexColor('#092536'); TEAL=HexColor('#008B8D'); AQUA=HexColor('#4CD4CB'); INK=HexColor('#172C3A'); MUTED=HexColor('#526570'); PALE=HexColor('#EDF5F6'); BORDER=HexColor('#D8E4E8'); GOLD=HexColor('#B8781B')
W,H=A4; CW=W-84
S={
 'title':ParagraphStyle('title',fontName='RadarSans-Bold',fontSize=24,leading=30,textColor=NAVY,spaceAfter=14),
 'sub':ParagraphStyle('sub',fontName='RadarSans-Bold',fontSize=12.4,leading=17,textColor=TEAL,spaceBefore=10,spaceAfter=6),
 'body':ParagraphStyle('body',fontName='RadarSans',fontSize=9.3,leading=13.4,textColor=INK,spaceAfter=7),
 'small':ParagraphStyle('small',fontName='RadarSans',fontSize=8.0,leading=11.3,textColor=MUTED,spaceAfter=5),
 'cell':ParagraphStyle('cell',fontName='RadarSans',fontSize=8.25,leading=11.6,textColor=INK),
 'cellSmall':ParagraphStyle('cellSmall',fontName='RadarSans',fontSize=7.8,leading=10.8,textColor=INK),
 'th':ParagraphStyle('th',fontName='RadarSans-Bold',fontSize=8.0,leading=11.5,textColor=white),
 'cover':ParagraphStyle('cover',fontName='RadarSans-Bold',fontSize=32,leading=39,textColor=white,spaceAfter=20),
 'coverbody':ParagraphStyle('coverbody',fontName='RadarSans',fontSize=12,leading=18,textColor=HexColor('#CCDDE5'),spaceAfter=13),
 'coverkicker':ParagraphStyle('coverkicker',fontName='RadarSans-Bold',fontSize=10,leading=15,textColor=AQUA,spaceAfter=12),
}
md=['# '+DATA['title'],'',f"Document date: {DATA['date']}. Code baseline: `{DATA['baseline_commit']}`; main merge: `{DATA['main_merge']}`.",'',DATA['scope_note'],'']
pages=[]
def P(text,style='body'):
    return Paragraph(text,S[style])
def plain(text):
    return html.escape(str(text)).replace('\n','<br/>')
def body(text):
    md.extend([re.sub('<[^>]+>','',text),''])
    return P(text)
def sub(text):
    md.extend(['### '+text,''])
    return P(plain(text),'sub')
def bullets(items):
    for x in items: md.append('- '+re.sub('<[^>]+>','',x))
    md.append('')
    return [P('• '+x) for x in items]
def table(headers,rows,widths,small=False):
    sty='cellSmall' if small else 'cell'
    content=[[P(plain(x),'th') for x in headers]]+[[P(str(x),sty) for x in row] for row in rows]
    t=Table(content,colWidths=widths,hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,PALE]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LINEBELOW',(0,0),(-1,0),.8,TEAL),('LINEBELOW',(0,-1),(-1,-1),.5,BORDER)]))
    return t
def box(title,text):
    t=Table([[P(plain(title),'sub')],[P(text)]],colWidths=[CW])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.6,BORDER),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    return t
def page(title,items,kicker='RESEARCH PLANNING'):
    pages.append({'title':title,'items':items,'kicker':kicker})
    md.extend(['## '+title,''])
# Page 1
cover=[Spacer(1,48),P('RADAR / RESEARCH EDITION','coverkicker'),P('Campus safety,<br/>with evidence<br/>at its centre.','cover'),P('Comprehensive feature catalogue<br/>and research roadmap','coverbody'),Spacer(1,25),P('84 CURRENT FEATURE FAMILIES<br/>64 PROPOSED ADDITIONS','coverkicker'),P('For a school-focused study in Camarines Norte, Philippines','coverbody'),Spacer(1,28),P('27 October 2026 · Planning version 1.0','coverbody'),P('Audited code: 44d511f · main merge: 2f5f72d','coverbody'),Spacer(1,8),P('Built software, unfinished integrations and future research are clearly separated. No proposed feature, model accuracy or safety benefit is represented as established.','coverbody')]
page('Cover',cover,'RADAR')
page('Contents',[],'DOCUMENT MAP')
page('What this document commits to',[
 body('This document records the existing RADAR capability inventory and a proposed research backlog. Committing this PDF to GitHub commits <b>the plan and its status labels</b>; it does not implement the proposed software, approve a school study or guarantee delivery of all 64 additions.'),
 sub('Recommended study focus'),
 body('Evaluate a <b>human-reviewed, image-assisted campus mapping workflow</b> against simpler baselines. Use genuine geographic calibration, explainable evidence and measured correction time. Treat visual detection, geographic accuracy, route computation and usability as separate tasks.'),
 box('A stronger system is a validated combination','GIS stores and analyzes geographic information. A CNN is one family of image models. They solve different problems. Foundation segmentation models, multimodal vision, photogrammetry and graph optimization may add value, but none is universally “more powerful” or guaranteed to improve school safety.'),
 sub('Useful first contributions'),
 *bullets(['A clear dataset/annotation protocol and leakage-resistant evaluation.','An image-quality and privacy gate before sending school imagery to any provider.','A segmentation-assistance comparison with manual work and a simple CNN baseline.','Independent geographic checkpoint testing and explicit uncertainty.','A school-staff correction/review workflow with reproducible evidence and failure examples.']),
 P('The larger backlog is a menu for future work, not a recommendation to place every feature in one student study or one dashboard.','small')])
counts=collections.Counter(f['status'] for g in DATA['current_groups'] for f in g['features'])
page('Status legend and code baseline',[
 body('Baseline: <b>44d511f</b> on design/radar-command-dashboard. GitHub main at <b>2f5f72d</b> merges the same code through PR #4. Checked on 27 October 2026. Application code was not changed to produce this report.'),
 table(['Label','Meaning','Count'],[
 ('Built','Implementation exists in the repository. This is not a field-performance or safety certification.',str(counts['Built'])),
 ('Activation','Code exists, but external accounts/keys, data-use consent, funding, hosting or connectivity need activation/verification.',str(counts['Activation'])),
 ('Data needed','The workflow needs real school coordinates, survey geometry or verified assets before it represents a real campus.',str(counts['Data needed'])),
 ('Experimental','Prototype/approximate workflow exists; field accuracy, physical transport or survey/asset acceptance remains unverified.',str(counts['Experimental'])),
 ('Proposed','Not implemented in the audited baseline. An idea for future design, experimentation or deployment governance.','64'),
 ],[75,391,45]),Spacer(1,12),
 body('The 84 entries are <b>feature families</b>, not a count of buttons, API routes or independently certified modules. A family may contain several related controls. Proposals extend or complement existing families; they are not hidden claims of completion.'),
 sub('Existing verification evidence'),
 *bullets(['87 automated tests were reported passing at the code baseline; 36 feature tests passed with isolated embedded PostgreSQL.','Production build and scoped browser checks passed. Vision/model responses and school imagery in tests were synthetic or mocked.','The reported Gemini HTTP 503 remains an external availability problem. Error recovery tests do not prove live provider recovery.','Live Supabase/Storage acceptance, Vercel publication, actual SMS/push receipt, physical devices, verified 3D assets and CNN accuracy remain separate checks.'])])
for g in DATA['current_groups']:
    rows=[(f['id'],plain(f['name']),plain(f['status']),plain(f['description'])) for f in g['features']]
    page(g['title'],[P('CURRENT INVENTORY · '+str(len(rows))+' FEATURE FAMILIES','small'),table(['ID','Capability','Status','What exists / practical limit'],rows,[35,118,70,288],small=True),Spacer(1,12),P('Repository evidence: '+plain(' · '.join(g['evidence'])),'small')],'CURRENT CAPABILITIES')
page('Unfinished activation and development',[
 body('These items must not be described as complete merely because a screen, configuration wizard or adapter exists.'),
 table(['Item','Current boundary','Required next evidence'],[
 ('Live hosted storage/Auth','Supabase adapters exist; public URL/key alone do not configure private storage/database access.','Server-only setup, account tests, tenant isolation and a real database + private-media restore.'),
 ('Public hosting','Vercel adapter and guide exist; a deployment is not established by a GitHub push.','Hosting account/configuration, HTTPS, durable storage, working scheduled jobs and acceptance record.'),
 ('Live image analysis','Provider integration and consent/error handling exist.','A successful real-image request and a task-specific quality evaluation, separate from a read-only model check.'),
 ('Dedicated CNN inference','CNN polygon import/review exists; no trained model or inference runtime is bundled.','A licensed appropriate checkpoint, inference service/local runtime and independent local validation.'),
 ('Automatic metric campus map','Image drafts and approximate three-anchor placement exist.','Suitable imagery, camera/CRS control, orthorectification and independent checkpoints; not a walking-video shortcut.'),
 ('Real 3D and physical devices','Prepared assets, aggregate sensor adapters and peer relay exist.','Verified model/survey assets; physical camera/GPS/counting/relay acceptance on actual devices.'),
 ('External emergency delivery','Push/SMS jobs and receipt adapters exist.','Recipient consent, working HTTPS/provider configuration and real receipt tests; fallback procedures.'),
 ('Operational release','Test tooling exists; independent school deployment assurance is incomplete.','Security/load/accessibility acceptance, current official datasets, reviewed procedures and responsible staff.'),
 ],[105,192,214],small=True)])
page('The photo/video-to-map study workflow',[
 body('The main GIS screen already supports the user’s desired entry point: <b>upload → Generate GIS draft → review → save</b>. The scientific question is how to make its outputs accurate, useful and measurable, not how to rename every draft as a verified map.'),
 table(['Step','Existing workflow','Potential study extension'],[
 ('1. Capture','Choose a permitted school photo/video; video sampling selects three JPEG views.','Quality/redaction gate; a documented aerial or ground capture protocol (P012, P016).'),
 ('2. Propose','Configured vision suggests visible campus area/buildings, walkways and possible visible concerns.','Compare with promptable segmentation, instance models and a CNN baseline (P009–P011).'),
 ('3. Review','Users rename/remove/draw geometry, review uncertainty and save a private school draft.','Annotation/adjudication records and measured correction effort (P041).'),
 ('4. Locate','Optional known three-point affine placement for a confirmed top-down view.','Georeferenced raster/orthomosaic and independent checkpoint errors (P002–P003, P018).'),
 ('5. Compare','GIS checks selected reviewed area polygons against registered building pins.','Verified footprints and explicit uncertainty, not a probability derived from a pin (P001, P008).'),
 ('6. Act','School findings, repairs and verified evacuation paths remain separate approved records.','Explainable prioritization and evidence-linked action after human confirmation (P030, P064).'),
 ],[50,224,237],small=True),Spacer(1,12),
 box('A single view is not the whole campus','Video frames can repeat buildings or omit hazards. A visible campus outline is not a legal property boundary. Approximate placement does not correct terrain, lens distortion or perspective. A CNN/VLM result does not establish hidden structural safety or an approved evacuation route.')])
methods=[
 ('GIS + spatial indexing','Coordinates, overlays, contact/nearest/graph analysis.','Valid CRS, source geometry and dates.','Not an image detector; poor inputs still yield poor maps.'),
 ('CNN segmentation','Task-specific pixel/instance labels; useful baseline and possible edge runtime.','Appropriate weights, labeled validation and compute.','Transfer/domain errors; a generic classifier is not a campus hazard segmenter.'),
 ('Vision transformer / foundation features','Representations for segmentation, retrieval and adaptation experiments.','Licensed model, budget and local evaluation.','Not universally superior to a small CNN on limited devices/data.'),
 ('SAM / SAM 2-style masks','Prompt-assisted image/video outlines with human correction.','Prompts, usable imagery and model runtime.','A mask does not establish semantic hazard, geographic accuracy or physical truth.'),
 ('Text grounding + VLM','Language-guided candidates, descriptions and review notes.','Image-capable provider/model and explicit data-use permission.','Hallucination/localization errors; raw confidence is not calibrated risk.'),
 ('SfM/MVS + orthomosaic','Camera geometry, spatial reconstruction and orthorectified imagery.','Overlapping capture, calibration, control and reconstruction compute.','Missing texture/coverage, vegetation and camera motion cause failures.'),
 ('NeRF / Gaussian viewing','Recorded-scene novel-view visualization experiments.','Suitable capture and scene training/rendering.','Visual quality does not imply correct scale, semantics or live conditions.'),
 ('Temporal change detection','Compare aligned repeated imagery/records.','Dates, co-registration and independent change labels.','Lighting/season/registration can mimic damage.'),
 ('Evidence / sensor fusion','Combine independent evidence with source reliability and uncertainty.','Calibrated inputs and a defensible fusion method.','More sensors do not automatically improve reliability; conflicts/missingness matter.'),
 ('Graph optimization / simulation','Compare surveyed routes, capacities and scenario constraints.','Verified graph and grounded assumptions.','Shortest or simulated route is not guaranteed safe in an emergency.'),
 ('RAG over approved procedures','Retrieve school instructions with source citations.','Current approved documents and retrieval/answer evaluation.','Can misretrieve or overstate; no autonomous dispatch/medical/structural authority.'),
 ('Edge deployment + active learning','Reduce transfers and focus limited annotation effort.','Compatible compact model, device tests and labeling loop.','Privacy, speed and accuracy trade-offs must be measured.'),
]
page('Beyond a single CNN: use the right method',[
 P('COMPLEMENTARY METHODS, NOT A BLANKET POWER RANKING','small'),
 table(['Method','Useful contribution','Prerequisites','Key limitation'],[(plain(a),plain(b),plain(c),plain(d)) for a,b,c,d in methods],[92,146,128,145],small=True),
 P('All method additions beyond the existing GIS/vision adapters remain proposals unless explicitly marked in the current inventory. Benchmark on the actual study task and devices.','small')])
# Evidence-linked architecture drawing
D=Drawing(CW,330)
def node(x,y,w,h,title,lines,proposed=False):
    D.add(Rect(x,y,w,h,rx=7,fillColor=PALE,strokeColor=TEAL if not proposed else MUTED,strokeWidth=1,strokeDashArray=[3,3] if proposed else None))
    D.add(String(x+9,y+h-18,title,fontName='RadarSans-Bold',fontSize=8.5,fillColor=NAVY))
    for i,line in enumerate(lines):D.add(String(x+9,y+h-34-i*12,line,fontName='RadarSans',fontSize=7.5,fillColor=MUTED))
node(0,245,158,74,'SOURCE RECORDS',['Surveyed points, plans, dates','Official layers + school records'])
node(176,245,158,74,'IMAGERY',['Permitted photos/video frames','No hidden GPS inference'])
node(352,245,158,74,'FUTURE INPUTS',['Georeferenced mosaics / DEM','Validated sensors + checkpoints'],True)
for x,target in [(79,123),(255,387),(431,387)]:
    D.add(Line(x,245,target,223,strokeColor=TEAL))
    D.add(Polygon([target-3,229,target+3,229,target,223],fillColor=TEAL,strokeColor=TEAL))
node(0,140,246,83,'GEOGRAPHY + PROVENANCE',['Built: GIS / drafts / graph records','Proposed: versioning, checkpoints, uncertainty'])
node(264,140,246,83,'PERCEPTION + EXPERIMENTS',['Built: configured vision / CNN output import','Proposed: trained segmentation / change models'])
for x in [123,387]:D.add(Line(x,140,255,118,strokeColor=TEAL))
node(93,48,324,70,'HUMAN REVIEW IS THE RELEASE GATE',['Evidence, uncertainty, correction and field checks','No model output silently becomes an approved route'])
D.add(Line(255,48,255,26,strokeColor=TEAL))
D.add(String(32,8,'Reviewed records  →  maintenance tasks  →  approved plans  →  study outcomes',fontName='RadarSans-Bold',fontSize=8.5,fillColor=NAVY))
page('A hybrid, evidence-linked architecture',[
 body('Keep authoritative records, image suggestions and proposed model experiments as separate layers. A digital twin is only as trustworthy as its geometry, timestamps and evidence links; it is not automatically a live sensor of the school.'),D,Spacer(1,12),
 *bullets(['Store original source/revision/permission metadata alongside derived artifacts.','Version model predictions; never silently overwrite reviewed school facts.','Require explicit approval before operational publication, communication or route changes.','Keep research/training simulation visibly separate from current school operations.']),
 P('Diagram: solid boxes contain existing workflow families; the dashed source box describes proposed additional inputs. Proposed components named inside solid workflow boxes are not already implemented.','small')])
for g in DATA['proposed_groups']:
    rows=[]
    for f in g['features']:
        desc=plain(f['benefit'])+'<br/><b>Acceptance:</b> '+plain(f['acceptance'])+'<br/><b>Needs:</b> '+plain(f['dependencies'])
        rows.append((f['id'],plain(f['name']),f['priority'],desc))
    page(g['title'],[P('ALL ITEMS ON THIS PAGE ARE PROPOSED — NOT IMPLEMENTED','small'),table(['ID','Proposed addition','Tier','Study value, acceptance and dependencies'],rows,[35,114,40,322],small=True),Spacer(1,10),P('Priority guide: P0 foundation · P1 next · P2 extension · P3 long-term. No delivery promise.','small')],'PROPOSED BACKLOG')
page('A defensible study design',[
 sub('Suggested working title'),
 body('“RADAR: An Evidence-Linked Campus Mapping and Preparedness Workflow for Selected Schools in Camarines Norte.” This is a proposed title, not an institutional approval or completed study.'),
 sub('Primary research question'),
 body('Does an assisted, geographically calibrated and human-reviewed workflow improve mapping correctness and staff task effort compared with simpler workflows, under the same imagery, annotation budget and test conditions?'),
 table(['Experiment','Fair comparison','Primary evidence'],[
 ('A. Image delineation','Manual polygons vs current vision assistance vs a task-appropriate CNN vs proposed segmentation assistance.','Held-out IoU/boundary F1 and human correction time. Record false positives and abstentions.'),
 ('B. Geographic placement','Manual GIS/known-point placement vs the current three-anchor transform vs a proposed properly controlled orthomosaic workflow.','Independent checkpoint horizontal error, alignment failures and coverage; fitted control points are not a test set.'),
 ('C. Route constraints','Current Dijkstra vs a proposed multi-objective method on the same surveyed graph and closures.','Feasibility, constraint violations, route length and explanation fidelity; not a live-emergency safety claim.'),
 ('D. Human workflow','Current task flow vs a selected proposed flow, counterbalanced across equivalent tasks.','Correct completion, time, corrections, comprehension and validated usability/workload instruments.'),
 ],[84,223,204],small=True),
 sub('Hypotheses to predefine'),
 body('Examples: H1 reduces delineation time without exceeding a predeclared quality-loss margin; H2 reduces independent geographic error; H3 improves cross-view identity review without unacceptable false merges; H4 improves task completion/comprehension. Set margins and release thresholds before evaluation, with supervisors and school stakeholders—not after seeing results.')])
page('Data collection, labels and experimental splits',[
 body('Collect only data needed for the selected research questions. Avoid student faces, identities, medical details and unnecessary rosters in mapping datasets. A training-lab fixture is not a field dataset.'),
 table(['Data element','Protocol','Evidence to retain'],[
 ('Capture sessions','Record source permission, device, date, weather/lighting, position context and intended use.','Capture/session ID; permitted reuse and provider-sharing scope.'),
 ('Survey/geography','Use documented CRS, ground control and independent checkpoints; record scale/resolution.','Control/checkpoint roles, source, error and coordinate transform revision.'),
 ('Visible labels','Define classes and what counts as unknown/occluded; do not infer hidden structural defects from pixels.','Label handbook, examples, disagreements and adjudication trail.'),
 ('Annotation reliability','Where feasible, use two independent annotators and an adjudicator with relevant expertise.','Per-class agreement; disagreement patterns and changes to the taxonomy.'),
 ('Train/validation/test','Group by school/building/session as required by the generalization claim; remove near-duplicate frames across splits.','Locked split IDs and provenance. Distinguish new-school tests from same-school temporal tests.'),
 ('Class balance','Include negative/unclear examples and document rare classes; avoid manufacturing a balanced test set that hides field prevalence.','Class counts, exclusion criteria and known blind spots.'),
 ('Temporal change','Co-register dated imagery and obtain independent change labels before evaluating a change model.','Registration error, seasonal confounds and ground verification date.'),
 ('Dataset release','Prefer restricted or de-identified artifacts where disclosure could expose students or sensitive school layouts.','Access policy, retention/withdrawal rules and approved dissemination plan.'),
 ],[99,218,194],small=True),
 P('No participant count, number of schools, dataset size or model accuracy is claimed as already achieved. Confirm feasibility and sample requirements before locking the protocol.','small')])
page('Metrics that can support an honest conclusion',[
 table(['Task','Useful measures','What to avoid'],[
 ('Segmentation','IoU = intersection / union; class-wise Dice; boundary F1; instance AP if instance labels exist.','One averaged accuracy that hides missed rare concerns or boundary mistakes.'),
 ('Detection/localization','Per-class precision/recall; AP where appropriate; false positives and false negatives per image/session.','Treating model score as the probability a school is unsafe.'),
 ('Geographic accuracy','Horizontal RMSE = sqrt(mean(dx² + dy²)) on independent checkpoints; maximum/percentile error and coverage.','Testing on the same three points used to fit the transform.'),
 ('Cross-view identity','False merges, missed matches and reviewer correction effort.','Claiming a unique building inventory from sampled video labels alone.'),
 ('Change detection','Event/region precision/recall with registration-aware error analysis; confounding false positives.','Calling lighting, season or viewpoint changes structural damage.'),
 ('Routing','Feasible/available cases, constraint violations, graph-edge validity, distance/time estimate error in approved drills.','Certifying safety from shortest distance or an unvalidated simulation.'),
 ('Human workflow','Task success, errors, completion time, corrections, comprehension; SUS/TLX if correctly administered.','Equating satisfaction or animation preference with disaster-risk reduction.'),
 ('Reliability/cost','Latency distributions, 503/429/timeout rate, explicit retry rate, memory, battery and cost per accepted artifact.','Assuming free tiers, stable model aliases or model-list HTTP 200 guarantee successful analysis.'),
 ('Uncertainty','Reliability/calibration measures for outputs with suitable labels; abstention and coverage-risk curves.','Reporting ECE/Brier without defining the probability task or using raw scores as calibrated truth.'),
 ],[88,235,188],small=True),Spacer(1,12),
 body('Report confidence intervals and effect sizes where justified. State the unit of analysis (image, building, session, school or participant). Use grouped/paired analysis where dependencies exist; do not count adjacent video frames as independent schools.'),
 P('Numeric success thresholds and sample sizes should be preregistered or approved before the final test. This roadmap intentionally invents no result, p-value, accuracy target or guaranteed improvement.','small')])
page('Human study, inclusion and acceptance',[
 body('Use a supervised, non-emergency study. Mapping accuracy and usability can be evaluated without exposing students or staff to real hazards or staging a surprise emergency.'),
 sub('Representative roles and tasks'),
 *bullets(['Administrator: choose a school, approve an account, check a source, review a draft and restore the correct workspace.','Inspector/teacher: capture a clear view, correct a suggestion, save evidence and explain why the result is still a draft.','Responder: understand source freshness, inspect route limitations and distinguish server acknowledgement from external delivery.','Student/parent: understand allowed information and report status without gaining staff authority or seeing private imagery.']),
 sub('Recruitment and study conduct'),
 body('Start with a small feasibility pilot, then justify the final sample through the research question, resources and statistical plan. Include assistive-technology and lower-end-device users where relevant. Obtain applicable school/institutional review, informed consent and separate protections before involving minors. Keep research participation distinct from emergency access.'),
 sub('Suggested observations'),
 *bullets(['Counterbalance equivalent tasks to reduce learning/order effects; record assistance and failures, not just successful times.','Test at least a narrow phone, desktop, poor-network condition and reduced-motion/keyboard flow.','Check comprehension: “Does no overlap mean safe?” and “Does an image outline prove the property boundary?”','Evaluate review burden and error consequences, not only visual attractiveness.']),
 box('Required interpretation','A usability score, model benchmark or successful drill is evidence for that evaluated task. None alone establishes that RADAR reduces injury, predicts a disaster or replaces school safety professionals.')])
page('Delivery roadmap with evidence gates',[
 body('Illustrative sequence: approximately 16–20 weeks after permissions, data access and a feasible scope are agreed. This is an estimate for planning, not a staffing/hosting commitment. Reduce scope rather than skipping validation.'),
 table(['Phase','Illustrative timing','Deliverable and exit gate'],[
 ('0. Baseline & governance','Weeks 1–2','Verify existing app/account isolation, define consent/data retention, choose primary tasks, assign school reviewers and freeze the protocol.'),
 ('1. Data & baselines','Weeks 3–5','Capture permitted imagery, label a pilot set, survey reference points, lock grouped splits and run manual/CNN/current-vision baselines.'),
 ('2. One perception improvement','Weeks 6–9','Add quality/privacy gates and one segmentation-assistance method. Gate: reproducible held-out metrics and reviewable failures.'),
 ('3. Geographic validation','Weeks 10–12','Validate known-point/orthomosaic alignment with independent checkpoints; show uncertainty and reject unsuitable imagery.'),
 ('4. Human workflow evaluation','Weeks 13–15','Run counterbalanced non-emergency tasks across representative roles/devices; fix comprehension and accessibility barriers.'),
 ('5. Acceptance & report','Weeks 16–20','Lock final artifacts, complete failure/security/restore checks, report limits and produce the reproducible study package.'),
 ],[98,92,321],small=True),
 sub('Do not put every idea into the critical path'),
 body('The 64 proposals contain 19 P0 foundations, 24 P1 next increments, 18 P2 extensions and 3 P3 long-term experiments. Select a small coherent subset. NeRF/Gaussian viewing, SLAM, LiDAR, sensor fusion and complex crowd simulation should stay outside the core unless suitable data, expertise and an explicit evaluation budget already exist.'),
 P('A defensible minimum research increment combines P012, P016, P041–P044 and one of P009/P011, with P002 geographic validation and human review. Production governance P046/P059/P061/P062 remains necessary for real deployment.','small')])
page('Configuration and operational readiness',[
 table(['Dependency','What to configure/test','Boundary'],[
 ('Existing app','Use Node 24, one matching UI/API launcher, a backed-up durable database and current branch/main code.','Do not reseed/delete school records to refresh the interface.'),
 ('Vision service','Select an image-capable model; keep server-only keys private; obtain permission before uploads.','A ChatGPT subscription is not API credit. Free tiers and service availability vary.'),
 ('Temporary provider failure','Honor Retry-After; explicitly retry one view if useful; keep prior geometry on failure.','A 503 can be temporary overload. Do not rotate credentials or silently change provider on every error.'),
 ('Supabase/Storage','Configure private server database/Storage access and allowed Auth URLs; verify school isolation.','Public publishable keys are not database passwords or service-role credentials.'),
 ('Hosting/jobs','Verify HTTPS, function duration, payload limits, durable queues/cron and actual callback URLs on the target plan.','A pushed commit, health check or local preview is not a production deployment.'),
 ('SMS/push','Test consent, recipient authorization, sender/subscription setup and actual receipts.','Provider acceptance and phone receipt differ; preserve local emergency contact procedures.'),
 ('GIS/3D assets','Confirm coordinates, CRS, scale, imagery terms, source dates and measured models.','No survey data means an explicit missing-data state, not invented geometry.'),
 ('Research compute','Choose local CPU/edge/GPU or approved hosted compute according to model/device benchmarks.','No hardware price, cloud cost, license permission or free quota is guaranteed here.'),
 ],[96,229,186],small=True),Spacer(1,12),
 body('Separate demo, study and operational environments. Never use training credentials/data for real school emergencies. Budget capture, annotation, professional review, compute, hosting, communications and maintenance as separate costs before requesting institutional deployment.')])
page('Risks, limitations and stop conditions',[
 table(['Risk','Mitigation to evaluate','Stop/review trigger'],[
 ('False/missed visual concern','Human review, negative examples, unknown/abstention states and documented failures.','Unacceptable false negatives or unexplained confidence on the held-out set.'),
 ('Wrong geographic placement','Independent checkpoints, source/CRS checks and visible approximate status.','Unresolved CRS/scale mismatch, poor anchor geometry or insufficient control evidence.'),
 ('Private data exposure','Redaction/preview, purpose limitation, permissions and retention/deletion checks.','Missing permission, student-identifying exposure or cross-school access.'),
 ('Incorrect route interpretation','Verified graph, current closure review, constraints and explicit no-route states.','Missing connectivity, stale critical data or a user interpreting a draft as an approved plan.'),
 ('Provider outage/quota/cost','Manual fallback, bounded requests, explicit retry and budget visibility.','No provider acknowledgement, unexplained spend or repeated ambiguity.'),
 ('Model/domain shift','New-school/date tests, model cards, rollback and abstention.','Performance falls outside agreed release criteria for a participating context.'),
 ('Overclaimed study result','Preregister tasks/metrics, preserve failure data and separate mock/live/field evidence.','Leakage, post-hoc threshold selection or unsupported safety/prediction claims.'),
 ('Unmaintained deployment','Named owners, restore drills, verified contacts/datasets and review cadence.','No responsible staff, no tested restore or expired critical procedures.'),
 ],[101,224,186],small=True),
 sub('Release language'),
 body('Use “draft,” “reviewed suggestion,” “approximate placement” and “evaluated on the stated dataset” precisely. Do not use “guaranteed safe,” “predicts earthquakes,” “fully autonomous emergency response,” “accurate 3D from any video” or “more powerful than all CNN/GIS systems.”'),
 P('Philippine school/ethics/privacy obligations and operating procedures must be reviewed with the appropriate institution. This planning document is not a regulatory or engineering certification.','small')])
academic=[
 ('Ronneberger, Fischer & Brox (2015)','U-Net: Convolutional Networks for Biomedical Image Segmentation. A foundational segmentation architecture; not campus-trained weights.','https://arxiv.org/abs/1505.04597'),
 ('Vaswani et al. (2017)','Attention Is All You Need. Transformer architecture reference, not proof of campus-task superiority.','https://arxiv.org/abs/1706.03762'),
 ('Dosovitskiy et al. (2020)','An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale. Vision-transformer reference.','https://arxiv.org/abs/2010.11929'),
 ('Kirillov et al. (2023)','Segment Anything. Promptable segmentation reference; semantics and geographic calibration remain separate.','https://arxiv.org/abs/2304.02643'),
 ('Ravi et al. (2024)','SAM 2: Segment Anything in Images and Videos. A candidate research method, not implemented here.','https://arxiv.org/abs/2408.00714'),
 ('Liu et al. (2023)','Grounding DINO: Marrying DINO with Grounded Pre-Training for Open-Set Object Detection.','https://arxiv.org/abs/2303.05499'),
 ('Oquab et al. (2023)','DINOv2: Learning Robust Visual Features without Supervision. Representation/adaptation reference.','https://arxiv.org/abs/2304.07193'),
 ('Cheng et al. (2022)','Masked-attention Mask Transformer for Universal Image Segmentation (Mask2Former).','https://arxiv.org/abs/2112.01527'),
 ('Mildenhall et al. (2020)','NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis. Visualization is not survey truth.','https://arxiv.org/abs/2003.08934'),
 ('Kerbl et al. (2023)','3D Gaussian Splatting for Real-Time Radiance Field Rendering. Candidate scene visualization method.','https://arxiv.org/abs/2308.04079'),
 ('Lewis et al. (2020)','Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. Candidate for cited approved-procedure retrieval.','https://arxiv.org/abs/2005.11401'),
]
page('Research references: method starting points',[
 P('CANONICAL REFERENCES, NOT A SYSTEMATIC OR “LATEST MODEL” REVIEW','small'),
 *[P('<b>'+plain(a)+'</b><br/>'+plain(b)+'<br/><link href="'+c+'" color="#008B8D">'+c+'</link>','small') for a,b,c in academic],Spacer(1,8),
 body('These references motivate optional experiments. They do not supply licensed/locally validated deployment artifacts automatically. Check current repositories, licenses, weights, hardware needs and updated evaluations before selection. No external literature search or live model benchmark was performed for this PDF.')])
tech=[
 ('GeoJSON / WGS84 interchange','RFC 7946; distinguish geographic positions from image pixels.','https://datatracker.ietf.org/doc/html/rfc7946'),
 ('QGIS documentation','GIS review, CRS handling and geometry workflows.','https://docs.qgis.org/'),
 ('GDAL documentation','Geospatial raster/vector transformations and data handling.','https://gdal.org/en/stable/'),
 ('OpenDroneMap / COLMAP','Potential photogrammetry and reconstruction toolchains; verify suitability and licensing.','https://docs.opendronemap.org/ · https://colmap.github.io/'),
 ('WCAG 2.2','Accessibility evaluation reference.','https://www.w3.org/TR/WCAG22/'),
 ('Philippine National Privacy Commission','Data Privacy Act and institutional privacy guidance.','https://privacy.gov.ph/data-privacy-act/'),
 ('Official source authorities','PAGASA, PHIVOLCS and GeoRiskPH: verify current endpoints, dates, licensing and scope.','https://www.pagasa.dost.gov.ph/ · https://www.phivolcs.dost.gov.ph/ · https://www.georisk.gov.ph/'),
]
page('Technical references and repository evidence',[
 *[P('<b>'+plain(a)+'</b><br/>'+plain(b)+'<br/>'+plain(c),'small') for a,b,c in tech],
 sub('Auditable implementation sources'),
 *[P(plain(x),'small') for x in ['docs/RADAR-2-FEATURES.md — implementation inventory and operating limits.','docs/GIS-AND-CNN.md — image generator, GIS assessment and external CNN-output workflow.','docs/TESTING-AND-CONFIGURATION.md — service setup, advanced tools and isolated lab.','docs/WELCOME-AND-ACCOUNT-RESTORATION.md — account restoration, roles and interface motion.','docs/SUPABASE.md and docs/VERCEL.md — cloud setup and deployment boundaries.','server/vision-provider.mjs; server/campus-map.mjs; server/gis.mjs; server/routing.mjs — source behavior.','tests/vision-provider.test.mjs; tests/campus-map.test.mjs; tests/gis.test.mjs; tests/features.test.mjs — automated/mock evidence.']],
 P('Source URLs are reference pointers; live availability, current legal interpretation, licenses and agency dataset currency were not verified during document generation. Read the linked authority’s current guidance.','small')])
p0=[f for g in DATA['proposed_groups'] for f in g['features'] if f['priority']=='P0']
page('Backlog handover and study decision log',[
 body('Every proposal has a stable P-number in feature-catalogue.json and this PDF. Use those IDs in GitHub issues or a study tracker. Documentation status must not be replaced by an implementation claim until code and acceptance evidence exist.'),
 table(['First foundation IDs','Scope'],[
 (', '.join(f['id'] for f in p0[:5]),'Survey/georeferencing/versioning; image-quality and privacy gates.'),
 (', '.join(f['id'] for f in p0[5:10]),'Evidence provenance; route/accessibility survey; annotation and artifact registry.'),
 (', '.join(f['id'] for f in p0[10:15]),'Leakage-resistant baselines, research consent/notebook and inclusive evaluation.'),
 (', '.join(f['id'] for f in p0[15:]),'User feedback, retention, independent backups and security/load acceptance.'),
 ],[178,333],small=True),
 sub('Before a proposal becomes a development commitment'),
 *bullets(['Choose the primary research question and a realistic subset of P-items.','Assign a responsible owner, school reviewer, data/compute dependencies and acceptance evidence.','Specify what is a mock, prototype, provider-enabled test, field measurement or operational release.','Record the decision date and reasons for deferred features; do not mark unfinished features as “done.”','Keep each operational screen task-focused; progressive disclosure is preferable to dozens of empty panels.']),
 box('Deliverable package','This PDF is accompanied by an editable Markdown document, a machine-readable feature catalogue and an optional PDF-build script. The audited application baseline remains 44d511f; the new document commit does not make the 64 proposed additions operational.'),
 P('Recommended conclusion style: “The selected workflow was evaluated under these data, device and participant conditions, with these limitations.” Any stronger claim needs additional evidence.','small')])
# Resolve contents after page list is complete.
toc=[]
for i,p in enumerate(pages,1):
    if i<=2:continue
    toc.append((i,p['title']))
left=toc[:(len(toc)+1)//2];right=toc[(len(toc)+1)//2:]
contents=[]
for a,b in zip(left,right+[None]*(len(left)-len(right))):
    def entry(v):return P(f'<link href="#section-{v[0]}" color="#172C3A"><b>{v[0]:02}</b>  {plain(v[1])}</link>','small') if v else ''
    contents.append([entry(a),entry(b)])
toc_table=Table(contents,colWidths=[CW/2,CW/2]);toc_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),15),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
pages[1]['items']=[P('A complete inventory plus an explicitly unimplemented study backlog. Read the status legend before quoting a feature as established.'),Spacer(1,12),toc_table,Spacer(1,18),P('Quick reading: pages 3–4 explain status and claims; pages 5–13 catalogue current capability; pages 18–25 contain all 64 proposals; pages 26–32 describe evaluation and release gates.','small')]
# Rebuild Markdown in page order; source catalogue stays the canonical exact feature data.
lines=['# '+DATA['title'],'',f"Date: {DATA['date']} · audited code: `{DATA['baseline_commit']}` · main merge: `{DATA['main_merge']}`",'',DATA['scope_note'],'']
for g in DATA['current_groups']:
    lines += ['## Current — '+g['title'],'']
    for f in g['features']:lines += [f"### {f['id']} · {f['name']} [{f['status']}]",'',f['description'],'']
    lines += ['Evidence: '+', '.join('`'+x+'`' for x in g['evidence']), '']
for g in DATA['proposed_groups']:
    lines += ['## Proposed — '+g['title'],'']
    for f in g['features']:lines += [f"### {f['id']} · {f['name']} [{f['priority']} · NOT IMPLEMENTED]",'',f['benefit'],'','Acceptance: '+f['acceptance'],'','Needs: '+f['dependencies'],'']
lines += ['## Study planning narrative','']
for index, item in enumerate(pages,1):
    if index <= 2 or item['kicker'] in ['CURRENT CAPABILITIES','PROPOSED BACKLOG']: continue
    lines += ['## '+item['title'],'']
    for element in item['items']:
        if isinstance(element, Paragraph): lines += [element.getPlainText(),'']
        elif isinstance(element, Table):
            for row_index,row in enumerate(element._cellvalues):
                cells=[]
                for cell in row:
                    if isinstance(cell,Paragraph): cells.append(cell.getPlainText().replace('|','/'))
                    elif isinstance(cell,(list,tuple)): cells.append(' '.join(x.getPlainText() if isinstance(x,Paragraph) else str(x) for x in cell))
                    else: cells.append(str(cell))
                lines.append('| '+' | '.join(cells)+' |')
                if row_index==0: lines.append('| '+' | '.join('---' for _ in cells)+' |')
            lines.append('')
        elif isinstance(element,Drawing): lines += ['Architecture: source records + permitted imagery + proposed validated inputs → geography/provenance + perception/experiments → human review → reviewed records, tasks and plans.','']
MD.write_text('\n'.join(lines)+'\n')
class Doc(SimpleDocTemplate):
    def afterFlowable(self,flow):
        if hasattr(flow,'_bookmark'):
            self.canv.bookmarkPage(flow._bookmark)
            self.canv.addOutlineEntry(flow._section_title,flow._bookmark,0,False)

def furniture(c,doc):
    n=doc.page
    c.saveState()
    if n==1:
        c.setFillColor(NAVY);c.rect(0,0,W,H,fill=1,stroke=0)
        c.setStrokeColor(HexColor('#174657'))
        for r in [72,112,155]:c.circle(W-74,H-130,r,stroke=1,fill=0)
        c.setStrokeColor(AQUA);c.setLineWidth(1.6);c.line(42,H-44,W-42,H-44)
    else:
        c.setStrokeColor(BORDER);c.line(42,H-43,W-42,H-43)
        c.setFillColor(TEAL);c.setFont('RadarSans-Bold',7.5);c.drawString(42,H-32,'RADAR  /  FEATURE CATALOGUE + RESEARCH ROADMAP')
    c.setFont('RadarSans',7.2);c.setFillColor(HexColor('#A2BDC8') if n==1 else MUTED)
    c.drawString(42,27,'27 OCT 2026  ·  CODE BASELINE 44d511f  ·  PROPOSALS ARE NOT IMPLEMENTED')
    c.drawRightString(W-42,27,f'{n:02} / {len(pages):02}')
    c.restoreState()
flow=[]
for i,p in enumerate(pages,1):
    if i>1:flow.append(PageBreak())
    if i!=1:
        flow.append(P(plain(p['kicker']),'small'))
        heading=P(plain(p['title']),'title');heading._bookmark=f'section-{i}';heading._section_title=p['title'];flow.append(heading)
    else:
        marker=Spacer(1,0);marker._bookmark='section-1';marker._section_title=DATA['title'];flow.append(marker)
    flow.extend(p['items'])
doc=Doc(str(PDF),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=60,bottomMargin=47,title=DATA['title'],author='RADAR project research planning',subject='Implemented feature families, unfinished integrations, proposed research features and evaluation design',pageCompression=1)
doc.build(flow,onFirstPage=furniture,onLaterPages=furniture)
(OUT/'pdf-page-map.json').write_text(json.dumps([{'page':i,'title':p['title']} for i,p in enumerate(pages,1)],indent=2)+'\n')
print(f'Built {PDF}; designed pages: {len(pages)}; source: {MD}')
