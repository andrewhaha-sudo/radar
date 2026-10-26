# GIS hazard mapping and CNN output integration

Open **Campus map → GIS mapping**, or **Tools & setup → Explore & plan → GIS hazard mapping**. This tool works with school-scoped building coordinates and actual geographic area datasets. Nothing is copied from a demonstration campus.

[Desktop preview](previews/gis-desktop.png) · [Mobile preview](previews/gis-mobile.png). Previews show synthetic data in an isolated training workspace, with basemap tile requests unavailable in this environment. No school damage is implied.

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

Validated with synthetic geometry only: 82 automated tests pass; 35 feature tests also pass against embedded PostgreSQL. Checks cover polygon holes/boundaries, invalid model inputs, confidence thresholds, pending/rejected exclusion, school isolation, role restrictions and provenance preservation. Chromium checks cover import, review, map display, assessment, threshold changes, GeoJSON download and the 390px layout. No model accuracy or actual school hazard detection has been measured.
