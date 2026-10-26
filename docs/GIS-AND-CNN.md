# GIS hazard mapping and CNN output integration

Open **Campus map → GIS mapping**, or **Tools & setup → Explore & plan → GIS hazard mapping**. The main screen is now **Generate from photo / video**. Choose **GIS layers & model results** for the geographic-layer comparison workbench. Both work with school-scoped records. Nothing is copied from a demonstration campus.

[Desktop preview](previews/gis-desktop.png) · [Mobile preview](previews/gis-mobile.png). Previews show synthetic data in an isolated training workspace, with basemap tile requests unavailable in this environment. No school damage is implied.

[Image-map generator preview](previews/campus-generator-desktop.png) · [Mobile generator](previews/campus-generator-mobile.png). These show a synthetic test picture and mocked AI output, not real campus detection.

## Generate from a school photo or video

1. As authorized inspection staff, choose a school photo or video. Use a clear overview; aerial/top-down imagery works best for campus outlines. Full video stays on the device.
2. Confirm permission to send the selected views to the configured vision provider, then press **Generate GIS draft**. A video is sampled into three chronological JPEG views; the provider receives these bounded frames, not the whole video. The current configured OpenAI/Gemini vision integration is used. Automatic proposals are bounded to 18 features and 12 points per feature to keep the response manageable; reviewed/manual drafts can contain up to 40 features. This is not a bundled CNN segmentation model. If the provider is not connected, the UI says so and manual drawing remains available; it never fabricates detections.
3. Review polygons and lines drawn directly over the image: visible campus area, provisional building outlines, visible walkways and possible concerns such as debris or standing water. Rename/remove proposals and draw missing features. Building candidate numbers are provisional labels, not registered building identities. Duplicate buildings across video views are not deduplicated automatically. Empty AI results remain empty.
4. Check the review box and save the draft. Images, frame-specific geometry and notes are stored in the selected school database. Saving does not create buildings, verified hazards, official boundaries or evacuation routes. Draft imagery requires `scan:read`; generation/save/placement requires `scan:write`. Approved students do not acquire private imagery access merely through `map:read`.
5. Reopen a saved school draft later, or export a normalized image-space JSON plan. Unplaced drafts intentionally have no GPS coordinates.

**Optional geographic placement:** For a top-down or orthorectified view, open **Place this view on a GIS map**. Mark three well-spaced, non-collinear image points with known latitude/longitude and document their source. Save the reviewed image draft first. After confirming the view/alignment, place it and export approximate EPSG:4326 GeoJSON. Anchors and the placed output persist with the saved draft. Degenerate and campus-scale-inconsistent anchors are rejected. The three-anchor affine transform does not correct perspective, terrain, lens distortion or camera motion, and is not a survey or photogrammetric reconstruction.

A normal walking video cannot automatically become a top-down GIS map. This workflow produces a separate editable image draft for each selected view; it does not stitch a mosaic or infer unknown GPS/scale. A visible campus area is not the school's legal parcel boundary. Real orthomosaics still require suitable aerial capture, camera geometry and photogrammetry/georeferencing.

The button sends an actual request only when a configured provider and permission are present. Timeouts preserve the previous geometry; no automatic retry is sent. Live provider results and model accuracy have not been verified in this cloud environment.

## What works now

- A GIS map combines registered building pins, source-linked official layers, and separately labeled CNN-output polygons.
- Choose layers and a minimum CNN confidence score, then check building-pin contact with polygons. Polygon holes, boundary contact and multipolygons are supported. Coordinate order is `[longitude, latitude]`, in EPSG:4326 (WGS84).
- Current reviewed official layers and reviewed CNN suggestions are eligible for the check. Pending/rejected CNN results and expired/unreviewed official datasets are preview-only. Line and point datasets are not assessed; there is no invented fault buffer.
- Model imports record a model name/version, imagery acquisition date, provenance/validation note and per-polygon class/confidence. The importing user must confirm georeferencing. Imported approval flags are discarded; new layers start pending. Authorized staff record review notes and can reject a layer later.
- Results show the source of every contact. Export building-pin results as GeoJSON for QGIS, including source references, threshold and the limits of the analysis. Changing selected layers or the threshold clears old results.
- Map-readable school members can view and assess. Import/review requires the existing `advisories:write` permission. School isolation and audit logging apply to model records. No new public endpoint or external provider call is introduced.

## CNN inference is not bundled

RADAR **does not currently train or run a CNN**. It accepts georeferenced segmentation output from an external trained model. U-Net and DeepLab are examples of suitable model architectures; listing them does not supply trained weights or evidence of local accuracy. The existing Gemini vision integration remains separate and is not renamed as a CNN.

A practical local workflow, without a paid API:

1. Acquire permitted, sufficiently sharp aerial imagery and produce an orthorectified/georeferenced mosaic in a photogrammetry/GIS tool. Ordinary walkthrough video and single handheld photos have perspective distortion; they are not geographic maps. A raw drone photograph also needs correct orthorectification/georeferencing.
2. Select or train a segmentation checkpoint for the exact visible classes and image resolution. Document imagery permissions, training/validation data and model limitations. Test it on separate locally relevant images; measure per-class IoU/precision/recall before using its suggestions operationally.
3. Run the model locally using its own inference software (for example a compatible PyTorch or ONNX pipeline). Preserve the mosaic transform and CRS in the output raster. RADAR does not execute uploaded model files or install Python packages.
4. In QGIS/GDAL, polygonize the classified mask, retain the class/score values, check geometry, and reproject to EPSG:4326. A numeric score must come from the model's documented output or polygon aggregation; do not invent confidence if the model does not provide it.
5. Give each polygon `properties.label` and numeric `properties.confidence` from 0 to 1. Import it into RADAR with the model/version and real imagery date. Check alignment against registered school coordinates, then record the review and uncertainties.
6. Inspect suspected conditions on site before creating a school finding or changing an approved evacuation plan. RADAR does not turn imported predictions into verified hazards or approved routes automatically.

Supported visible-feature labels:

```text
visible_debris
standing_water
visible_surface_damage
blocked_walkway
other_visible_feature
```

Example **schema only** (synthetic coordinates near 0°, not a real school or a model inference):

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[0,0],[0.001,0],[0.001,0.001],[0,0.001],[0,0]]]
    },
    "properties": {"label":"visible_debris","confidence":0.82}
  }]
}
```

Imports are limited to 500 polygons and 1.5 MB. Geometry nesting, ring closure, numeric WGS84 coordinates, class labels and confidence bounds are validated. Imported polygons still need GIS topology and alignment review; the software does not establish that a claimed CNN actually produced the file. Use QGIS geometry validation before importing. Currently only the latest 100 official and model layers are exposed by this workbench.

## Interpreting results

A pin overlapping a polygon is a **spatial contact**, not a measured building damage percentage. Building footprints, elevation, drainage, survey error and model error are not represented by a building pin. A low confidence score does not prove safety, and the score itself is not a calibrated probability of danger. No overlap only means no contact in the selected available layers. A pixel classifier cannot forecast earthquakes, establish structural integrity or certify a safe route.

Basemap imagery is internet-dependent and is not analyzed by this workflow. Imported vectors and pin contact checks work independently of basemap tile availability. GeoJSON exports contain school coordinates and should be shared only with authorized people.

## Configuration and verification

No new API key or server setting is required for GIS or model-output imports. Startup adds `gis_model_layers` through the existing additive SQLite/PostgreSQL school schema. Restart the old backend after pulling this branch. A trained model, calibrated imagery and real field validation remain prerequisites for genuine CNN-derived data.

Validated with synthetic geometry only: 86 automated tests pass; 36 feature tests also pass against embedded PostgreSQL. Checks cover polygon holes/boundaries, invalid model inputs, confidence thresholds, pending/rejected exclusion, school isolation, role restrictions and provenance preservation. Chromium checks cover import, review, map display, assessment, threshold changes, GeoJSON download and the 390px layout. No model accuracy or actual school hazard detection has been measured.

Generator checks additionally cover image-space geometry validation, mocked provider output validation, three-anchor placement and rejection cases, staff permissions, private draft persistence and school isolation. Browser checks use a synthetic campus picture and mocked AI response, followed by real draft-save/export endpoints; local MP4 sampling and a provider-free manual-drawing fallback are exercised. These are software checks, not evidence of real campus detection accuracy.
