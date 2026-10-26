import { db, nowIso } from './db.mjs';
import { audit } from './auth.mjs';
import { cnnDataset, exposureAssessment, CNN_LABELS } from './gis-utils.mjs';

export function gisHandlers(h) {
  const { requireUser, requirePermission, readJson, json, HttpError, camelAll, str } = h;
  async function layers() {
    return camelAll(
      await db.prepare('SELECT * FROM gis_model_layers ORDER BY created_at DESC LIMIT 100').all(),
    ).map((row) => ({ ...row, geojson: JSON.parse(row.geojson) }));
  }
  return {
    'GET /api/advanced/gis': async (ctx) => {
      const user = await requireUser(ctx.req);
      requirePermission(user, 'map:read');
      const models = await layers();
      const official = camelAll(
        await db.prepare('SELECT * FROM geo_layers ORDER BY created_at DESC LIMIT 100').all(),
      ).map((row) => ({ ...row, geojson: JSON.parse(row.geojson) }));
      const buildings = await db
        .prepare('SELECT id,name,lat,lng FROM buildings ORDER BY name')
        .all();
      return json(ctx.res, 200, {
        models,
        official,
        buildings,
        labels: CNN_LABELS,
        inference: 'external_model_output_required',
        generatedAt: nowIso(),
        basis:
          'Registered building pins, not surveyed footprints. No overlap does not establish safety.',
      });
    },
    'POST /api/advanced/gis/assess': async (ctx) => {
      const user = await requireUser(ctx.req);
      requirePermission(user, 'map:read');
      const body = await readJson(ctx.req);
      const threshold = body.threshold ?? 0.5;
      if (
        typeof threshold !== 'number' ||
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 1
      )
        throw new HttpError(400, 'Confidence threshold must be between 0 and 1.');
      const models = await layers();
      const official = camelAll(
        await db.prepare('SELECT * FROM geo_layers ORDER BY created_at DESC LIMIT 100').all(),
      ).map((row) => ({
        ...row,
        geojson: JSON.parse(row.geojson),
      }));
      const buildings = await db
        .prepare('SELECT id,name,lat,lng FROM buildings ORDER BY name')
        .all();
      const selected = body.selectedIds;
      if (
        selected !== undefined &&
        (!Array.isArray(selected) ||
          selected.length > 200 ||
          selected.some(
            (id) => typeof id !== 'string' || !/^(official|model):[1-9][0-9]*$/.test(id),
          ))
      )
        throw new HttpError(400, 'Use at most 200 official/model layer IDs.');
      const assessment = exposureAssessment(
        buildings,
        selected ? official.filter((layer) => selected.includes(`official:${layer.id}`)) : official,
        selected ? models.filter((layer) => selected.includes(`model:${layer.id}`)) : models,
        threshold,
      );
      const geojson = {
        type: 'FeatureCollection',
        features: assessment
          .filter((b) => b.mapped)
          .map((b) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
            properties: {
              buildingId: b.id,
              name: b.name,
              outcome: b.outcome,
              basis: 'registered_building_pin',
              overlaps: b.evidence.length,
              sources: JSON.stringify(b.evidence),
              confidenceThreshold: threshold,
            },
          })),
      };
      return json(ctx.res, 200, {
        assessment,
        geojson,
        generatedAt: nowIso(),
        basis:
          'Pin-in-polygon contact only. No overlap is not a safety clearance. Fault lines and point layers are not buffered or assessed; image suggestions need field inspection. No evacuation routes were generated or approved.',
      });
    },
    'POST /api/advanced/gis/models': async (ctx) => {
      const user = await requireUser(ctx.req);
      requirePermission(user, 'advisories:write');
      const body = await readJson(ctx.req);
      const title = str(body.title, 180),
        modelName = str(body.modelName, 120),
        modelVersion = str(body.modelVersion, 120),
        sourceNote = str(body.sourceNote, 1000);
      if (
        !title ||
        !modelName ||
        !modelVersion ||
        !sourceNote ||
        body.crs !== 'EPSG:4326' ||
        body.georeferenced !== true
      )
        throw new HttpError(
          400,
          'Supply a title, model/version, imagery provenance and explicit georeferenced EPSG:4326 confirmation.',
        );
      const observed = new Date(body.observedAt);
      if (
        typeof body.observedAt !== 'string' ||
        !body.observedAt.trim() ||
        !Number.isFinite(observed.getTime()) ||
        observed.getTime() > Date.now() + 300000
      )
        throw new HttpError(400, 'Supply a valid imagery acquisition date, not in the future.');
      let geo;
      try {
        geo = cnnDataset(body.geojson);
      } catch (error) {
        throw new HttpError(400, error.message);
      }
      const result = await db
        .prepare(
          'INSERT INTO gis_model_layers(title,model_name,model_version,source_note,observed_at,geojson,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          title,
          modelName,
          modelVersion,
          sourceNote,
          observed.toISOString(),
          JSON.stringify(geo),
          user.id,
          nowIso(),
        );
      await audit(user.id, 'gis.model.import', 'gis_model_layer', result.lastInsertRowid, {
        modelName,
        modelVersion,
        features: geo.features.length,
      });
      return json(ctx.res, 201, {
        id: Number(result.lastInsertRowid),
        reviewState: 'pending',
        features: geo.features.length,
      });
    },
    'POST /api/advanced/gis/models/:id/review': async (ctx) => {
      const user = await requireUser(ctx.req);
      requirePermission(user, 'advisories:write');
      const body = await readJson(ctx.req),
        note = str(body.note, 1000);
      if (!['reviewed', 'rejected'].includes(body.state) || !note)
        throw new HttpError(
          400,
          'Select reviewed or rejected and record the checks and limitations.',
        );
      const existing = await db
        .prepare('SELECT id FROM gis_model_layers WHERE id=?')
        .get(Number(ctx.params.id));
      if (!existing) throw new HttpError(404, 'School model layer not found.');
      await db
        .prepare(
          'UPDATE gis_model_layers SET review_state=?,review_note=?,reviewed_by=?,reviewed_at=? WHERE id=?',
        )
        .run(body.state, note, user.id, nowIso(), existing.id);
      await audit(user.id, 'gis.model.review', 'gis_model_layer', existing.id, {
        state: body.state,
      });
      return json(ctx.res, 200, { id: existing.id, reviewState: body.state });
    },
  };
}
