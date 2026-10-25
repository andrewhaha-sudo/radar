import { imagePathHandlers } from './image-paths.mjs';
import { visionApiKey } from './vision-provider.mjs';
import { campusVideoHandlers } from './campus-video.mjs';
import { drainDeliveryJobs } from './delivery.mjs';
import { drainSosSms } from './emergency-delivery.mjs';
import crypto from 'node:crypto';
import { db, coreDb, currentDatabaseContext, nowIso } from './db.mjs';
import { audit } from './auth.mjs';
import { runInWorkspace } from './workspaces.mjs';
import {
  csvRows,
  csvCell,
  projectPoint,
  relayPacket,
  deviceHash,
  safeEqual,
  officialUrl,
  geoDataset,
  summarize,
} from './advanced-utils.mjs';
import { fetchOfficial, parseCap } from './official-data.mjs';
import { channelStatus } from './delivery-utils.mjs';
export function advancedHandlers(h) {
  const {
    requireUser,
    requirePermission,
    readJson,
    json,
    HttpError,
    camel,
    camelAll,
    str,
    oneOf,
    finiteNumber,
  } = h;
  const routes = {};
  const scope = () => currentDatabaseContext()?.workspaceId ?? '';
  const date = (value) => {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) throw new HttpError(400, 'Use a valid timestamp.');
    return d.toISOString();
  };
  async function ownedClass(user, id) {
    requirePermission(user, 'rollcall:write');
    const row = await db.prepare('SELECT * FROM rollcall_classes WHERE id=?').get(id);
    if (!row) throw new HttpError(404, 'Class not found.');
    if (user.role === 'teacher' && row.teacher_id !== user.id)
      throw new HttpError(403, 'This class is assigned to another teacher.');
    return row;
  }
  routes['POST /api/advanced/rosters/:id/import'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const id = Number(ctx.params.id);
    await ownedClass(user, id);
    const body = await readJson(ctx.req);
    let rows;
    try {
      rows = csvRows(body.csv);
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    const seen = new Set(),
      preview = [];
    for (const [index, row] of rows.entries()) {
      const name = str(row.name, 120);
      if (!name) throw new HttpError(400, `Row ${index + 2}: name is required.`);
      const email = String(row.email ?? '').toLowerCase();
      const linked = email
        ? await db
            .prepare("SELECT id FROM users WHERE lower(email)=? AND role='student' AND active=1")
            .get(email)
        : null;
      if (email && !linked)
        throw new HttpError(
          400,
          `Row ${index + 2}: email must match an active student in this school, or leave it blank for a manual roster entry.`,
        );
      const key = deviceHash(email || row.externalRef || name.toLowerCase());
      if (seen.has(key))
        throw new HttpError(400, `Row ${index + 2}: duplicate person within the CSV.`);
      seen.add(key);
      const existing = await db
        .prepare(
          'SELECT id FROM rollcall_people WHERE class_id=? AND (import_key=? OR (student_id IS NOT NULL AND student_id=?) OR (student_id IS NULL AND display_name=?))',
        )
        .get(id, key, linked?.id ?? null, name);
      preview.push({
        name,
        email,
        studentId: linked?.id ?? null,
        key,
        action: existing ? 'skip_existing' : 'add',
      });
    }
    let added = 0;
    if (body.commit === true) {
      for (const row of preview.filter((r) => r.action === 'add')) {
        const inserted = await db
          .prepare(
            'INSERT INTO rollcall_people(class_id,student_id,display_name,qr_token,import_key,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(class_id,import_key) DO NOTHING RETURNING id',
          )
          .get(
            id,
            row.studentId,
            row.name,
            crypto.randomBytes(24).toString('hex'),
            row.key,
            nowIso(),
          );
        if (inserted) added++;
      }
      const count = (
        await db.prepare('SELECT COUNT(*) AS n FROM rollcall_people WHERE class_id=?').get(id)
      ).n;
      await db
        .prepare(
          'UPDATE rollcall_classes SET expected=CASE WHEN expected<? THEN ? ELSE expected END,updated_at=? WHERE id=?',
        )
        .run(count, count, nowIso(), id);
      await audit(user.id, 'roster.csv_import', 'class', id, {
        added,
        skipped: preview.length - added,
      });
    }
    return json(ctx.res, 200, {
      preview: preview.map(({ key: _key, ...row }) => row),
      added,
      dryRun: body.commit !== true,
      note: 'Import appends people only. Existing attendance/status records are not overwritten.',
    });
  };
  routes['GET /api/advanced/layers'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'map:read');
    const rows = await db
      .prepare('SELECT * FROM geo_layers ORDER BY created_at DESC LIMIT 100')
      .all();
    return json(ctx.res, 200, {
      layers: rows.map((r) => ({
        ...camel(r),
        geojson: JSON.parse(r.geojson),
        freshness:
          r.expires_at && r.expires_at < nowIso()
            ? 'expired'
            : r.verified
              ? 'verified_source_record'
              : 'unverified_import',
      })),
    });
  };
  async function saveLayer(ctx, user, body) {
    requirePermission(user, 'advisories:write');
    let source, geo, cap;
    try {
      source = officialUrl(body.sourceUrl);
      if (body.capXml) {
        cap = parseCap(body.capXml);
        geo = cap.geojson;
      } else geo = geoDataset(body.geojson);
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    const published = date(cap?.publishedAt ?? body.publishedAt);
    if (Date.parse(published) > Date.now() + 300000)
      throw new HttpError(400, 'Source publication cannot be in the future.');
    const expires = cap?.expiresAt ?? (body.expiresAt ? date(body.expiresAt) : null);
    if (expires && expires <= published)
      throw new HttpError(400, 'Expiry must follow publication.');
    const kind = oneOf(
      body.kind,
      ['typhoon', 'fault', 'volcano', 'flood', 'rainfall', 'landslide'],
      'Layer kind',
    );
    const title = str(body.title ?? cap?.title, 180);
    if (!title) throw new HttpError(400, 'Name the actual dataset.');
    const agency = str(body.agency, 120);
    if (!agency) throw new HttpError(400, 'Name the issuing agency.');
    const result = await db
      .prepare(
        'INSERT INTO geo_layers(kind,title,agency,source_url,geojson,published_at,expires_at,verified,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        kind,
        title,
        agency,
        source,
        JSON.stringify(geo),
        published,
        expires,
        body.verified === true ? 1 : 0,
        user.id,
        nowIso(),
      );
    await audit(user.id, 'official_layer.import', 'layer', result.lastInsertRowid, {
      kind,
      features: geo.features.length,
      verified: body.verified === true,
    });
    return json(ctx.res, 201, {
      id: Number(result.lastInsertRowid),
      features: geo.features.length,
    });
  }
  routes['POST /api/advanced/layers'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    return saveLayer(ctx, user, await readJson(ctx.req));
  };
  routes['POST /api/advanced/layers/fetch'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'advisories:write');
    const body = await readJson(ctx.req);
    try {
      const result = await fetchOfficial(body.sourceUrl);
      return await saveLayer(ctx, user, {
        ...body,
        ...result,
        publishedAt: result.publishedAt ?? body.publishedAt,
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, error.message);
    }
  };
  routes['DELETE /api/advanced/layers/:id'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'advisories:write');
    await db.prepare('DELETE FROM geo_layers WHERE id=?').run(Number(ctx.params.id));
    await audit(user.id, 'official_layer.remove', 'layer', ctx.params.id, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/advanced/floors/:id/survey'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const body = await readJson(ctx.req);
    if (body.verified !== true || body.layoutVerified !== true || !str(body.source, 500))
      throw new HttpError(400, 'Confirm actual surveyed scale/elevation and provide the source.');
    const result = await db
      .prepare(
        'UPDATE floors SET scale_px_per_m=?,elevation_m=?,survey_source=?,layout_verified=1 WHERE id=?',
      )
      .run(
        finiteNumber(body.scale, 'Pixels per metre', 0.01, 100000),
        finiteNumber(body.elevation, 'Surveyed floor elevation in metres', -100, 1000),
        str(body.source, 500),
        Number(ctx.params.id),
      );
    if (!result.changes) throw new HttpError(404, 'Floor not found.');
    await audit(user.id, 'floor.survey', 'floor', ctx.params.id, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['GET /api/advanced/models/:id/layout'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'buildings:read');
    const id = Number(ctx.params.id);
    const building = await db.prepare('SELECT * FROM buildings WHERE id=?').get(id);
    if (!building) throw new HttpError(404, 'Building not found.');
    const floors = await db
      .prepare('SELECT * FROM floors WHERE building_id=? ORDER BY level')
      .all(id);
    const rooms = await db
      .prepare('SELECT r.* FROM rooms r JOIN floors f ON f.id=r.floor_id WHERE f.building_id=?')
      .all(id);
    const ready =
      floors.length > 0 &&
      floors.every(
        (f) =>
          f.scale_px_per_m > 0 &&
          f.elevation_m != null &&
          f.survey_source &&
          f.layout_verified === 1,
      );
    return json(ctx.res, 200, {
      building: camel(building),
      floors: camelAll(floors),
      rooms: camelAll(rooms),
      ready,
      note: 'The model uses registered floor-plan outlines, verified scale and surveyed floor elevations. It represents room footprints, not unseen walls or photographic interiors.',
    });
  };
  routes['POST /api/advanced/photos/:id/calibrate'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'scan:write');
    const photo = await db
      .prepare(
        'SELECT p.id,s.status FROM scan_photos p JOIN scans s ON s.id=p.scan_id WHERE p.id=?',
      )
      .get(Number(ctx.params.id));
    if (!photo || photo.status === 'submitted')
      throw new HttpError(409, 'Choose a photo in a draft inspection.');
    const body = await readJson(ctx.req);
    if (body.verified !== true || !str(body.source, 500))
      throw new HttpError(
        400,
        'Verify that the four anchor pairs describe the same planar surface.',
      );
    try {
      projectPoint(body.anchors, body.anchors?.[0]?.[0], body.anchors?.[0]?.[1]);
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    await db
      .prepare(
        'INSERT INTO photo_calibrations(photo_id,anchors,source,created_by,created_at) VALUES (?,?,?,?,?) ON CONFLICT(photo_id) DO UPDATE SET anchors=excluded.anchors,source=excluded.source,created_by=excluded.created_by,created_at=excluded.created_at',
      )
      .run(photo.id, JSON.stringify(body.anchors), str(body.source, 500), user.id, nowIso());
    await audit(user.id, 'photo.calibrate', 'photo', photo.id, {});
    return json(ctx.res, 200, {
      ok: true,
      note: 'Only points on this verified plane can be projected. Ordinary uncalibrated camera photos cannot locate hazards automatically.',
    });
  };
  routes['POST /api/advanced/observations/:id/project'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'scan:write');
    const body = await readJson(ctx.req);
    const row = await db
      .prepare(
        'SELECT o.*,s.status AS scan_status FROM scan_observations o JOIN scans s ON s.id=o.scan_id WHERE o.id=?',
      )
      .get(Number(ctx.params.id));
    const photo = await db
      .prepare(
        'SELECT p.scan_id,c.anchors FROM scan_photos p JOIN photo_calibrations c ON c.photo_id=p.id WHERE p.id=?',
      )
      .get(Number(body.photoId));
    if (!row || row.scan_status === 'submitted' || photo?.scan_id !== row.scan_id)
      throw new HttpError(400, 'Use a calibrated image from this draft inspection.');
    let point;
    try {
      point = projectPoint(
        JSON.parse(photo.anchors),
        finiteNumber(body.x, 'Image x', 0, 1),
        finiteNumber(body.y, 'Image y', 0, 1),
      );
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    await db
      .prepare('UPDATE scan_observations SET mapped_x=?,mapped_y=? WHERE id=?')
      .run(...point, row.id);
    return json(ctx.res, 200, { x: point[0], y: point[1], approximate: true });
  };
  routes['POST /api/advanced/location/start'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const body = await readJson(ctx.req);
    if (body.consent !== true)
      throw new HttpError(400, 'Explicit temporary location consent is required.');
    const incident = await db
      .prepare("SELECT id FROM incidents WHERE id=? AND status<>'closed'")
      .get(Number(body.incidentId));
    if (!incident) throw new HttpError(400, 'Choose an active school incident.');
    const ends = new Date(
      Date.now() + finiteNumber(body.minutes ?? 15, 'Minutes', 5, 60, true) * 60000,
    ).toISOString();
    await db
      .prepare(
        'INSERT INTO foreground_sessions(user_id,incident_id,ends_at,started_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET incident_id=excluded.incident_id,ends_at=excluded.ends_at,started_at=excluded.started_at',
      )
      .run(user.id, incident.id, ends, nowIso());
    await audit(user.id, 'location.foreground.start', 'user', user.id, {
      endsAt: ends,
    });
    return json(ctx.res, 200, { endsAt: ends });
  };
  routes['POST /api/advanced/location/sample'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const session = await db
      .prepare(
        "SELECT s.* FROM foreground_sessions s JOIN incidents i ON i.id=s.incident_id WHERE s.user_id=? AND s.ends_at>? AND i.status<>'closed'",
      )
      .get(user.id, nowIso());
    if (!session) throw new HttpError(410, 'Location-sharing session ended.');
    const body = await readJson(ctx.req);
    await db
      .prepare(
        'INSERT INTO location_reports(user_id,lat,lng,accuracy,incident_id,expires_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,incident_id=excluded.incident_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at',
      )
      .run(
        user.id,
        finiteNumber(body.lat, 'Latitude', -90, 90),
        finiteNumber(body.lng, 'Longitude', -180, 180),
        finiteNumber(body.accuracy, 'Accuracy', 0, 100000),
        session.incident_id,
        session.ends_at,
        nowIso(),
      );
    return json(ctx.res, 200, { expiresAt: session.ends_at });
  };
  routes['DELETE /api/advanced/location'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    await db.prepare('DELETE FROM foreground_sessions WHERE user_id=?').run(user.id);
    await db.prepare('DELETE FROM location_reports WHERE user_id=?').run(user.id);
    await audit(user.id, 'location.foreground.stop', 'user', user.id, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['GET /api/advanced/devices'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    return json(ctx.res, 200, {
      devices: camelAll(
        await coreDb
          .prepare(
            'SELECT id,name,assembly_point_id,room_id,active,last_seen_at FROM occupancy_devices WHERE workspace_id=?',
          )
          .all(scope()),
      ),
    });
  };
  routes['POST /api/advanced/devices'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    if (!scope()) throw new HttpError(400, 'Open a real school workspace.');
    const body = await readJson(ctx.req);
    const room = body.roomId
      ? await db.prepare('SELECT id FROM rooms WHERE id=?').get(Number(body.roomId))
      : null;
    const point = body.roomId
      ? null
      : await db
          .prepare('SELECT id FROM assembly_points WHERE id=?')
          .get(Number(body.assemblyPointId));
    if (!point && !room) throw new HttpError(400, 'Choose a registered assembly point or room.');
    const token = crypto.randomBytes(32).toString('base64url');
    const name = str(body.name, 120);
    if (!name) throw new HttpError(400, 'Name the aggregate-count device.');
    const result = await coreDb
      .prepare(
        'INSERT INTO occupancy_devices(workspace_id,assembly_point_id,room_id,name,token_hash,created_by,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(scope(), point?.id ?? 0, room?.id ?? null, name, deviceHash(token), user.id, nowIso());
    await audit(user.id, 'occupancy.device.register', 'device', result.lastInsertRowid, {});
    return json(ctx.res, 201, {
      id: Number(result.lastInsertRowid),
      token,
      note: 'Copy this device-only token once. Send aggregate counts only; no images or personal identifiers.',
    });
  };
  routes['DELETE /api/advanced/devices/:id'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    await coreDb
      .prepare('UPDATE occupancy_devices SET active=0 WHERE id=? AND workspace_id=?')
      .run(Number(ctx.params.id), scope());
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/device/occupancy'] = async (ctx) => {
    const body = await readJson(ctx.req);
    const row = await coreDb
      .prepare('SELECT * FROM occupancy_devices WHERE id=? AND active=1')
      .get(Number(body.deviceId));
    const token = String(ctx.req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!row || !token || !safeEqual(row.token_hash, deviceHash(token)))
      throw new HttpError(403, 'Invalid device authorization.');
    const observed = date(body.observedAt);
    if (Math.abs(Date.now() - Date.parse(observed)) > 300000)
      throw new HttpError(400, 'Reading must be within five minutes of server time.');
    const nonce = str(body.nonce, 100);
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(nonce))
      throw new HttpError(400, 'Use a unique reading nonce.');
    const count = finiteNumber(body.count, 'Aggregate count', 0, 100000, true);
    const n = await coreDb
      .prepare(
        'INSERT INTO sensor_nonces(device_id,nonce,created_at) VALUES (?,?,?) ON CONFLICT(device_id,nonce) DO NOTHING RETURNING id',
      )
      .get(row.id, nonce, nowIso());
    if (!n) throw new HttpError(409, 'Reading already received.');
    await runInWorkspace(row.workspace_id, async () => {
      if (row.room_id)
        await db
          .prepare('INSERT INTO room_counts(room_id,count,source,observed_at) VALUES (?,?,?,?)')
          .run(row.room_id, count, `Registered device: ${row.name}`, observed);
      else
        await db
          .prepare(
            'INSERT INTO occupancy_reports(assembly_point_id,count,source,reported_by,observed_at) VALUES (?,?,?,NULL,?)',
          )
          .run(row.assembly_point_id, count, `Registered device: ${row.name}`, observed);
    });
    await coreDb
      .prepare('UPDATE occupancy_devices SET last_seen_at=? WHERE id=?')
      .run(nowIso(), row.id);
    await coreDb
      .prepare('DELETE FROM sensor_nonces WHERE created_at<?')
      .run(new Date(Date.now() - 86400000).toISOString());
    return json(ctx.res, 201, { received: true, observedAt: observed });
  };
  routes['GET /api/advanced/occupancy'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'evacuation:read');
    const rooms = await db
      .prepare(
        'SELECT c.*,r.name,r.capacity,b.lat,b.lng,b.name AS building_name FROM room_counts c JOIN rooms r ON r.id=c.room_id JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id WHERE c.id IN (SELECT MAX(id) FROM room_counts GROUP BY room_id)',
      )
      .all();
    const points = await db
      .prepare(
        'SELECT o.*,p.name,p.capacity,p.lat,p.lng FROM occupancy_reports o JOIN assembly_points p ON p.id=o.assembly_point_id WHERE o.id IN (SELECT MAX(id) FROM occupancy_reports GROUP BY assembly_point_id)',
      )
      .all();
    return json(ctx.res, 200, {
      rooms: camelAll(rooms),
      points: camelAll(points),
      note: 'Aggregate readings only. Room map positions use registered building pins. Readings older than two minutes are stale, not live density.',
    });
  };
  routes['POST /api/advanced/reports'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'hazards:read');
    const body = await readJson(ctx.req);
    const dataset = oneOf(body.dataset, ['hazards', 'inspections', 'incidents'], 'Dataset');
    if (dataset === 'inspections') requirePermission(user, 'scan:read');
    if (dataset === 'incidents') requirePermission(user, 'incidents:read');
    const from = body.from ? date(body.from) : '1970-01-01T00:00:00.000Z',
      to = body.to ? date(body.to) : nowIso();
    if (from > to) throw new HttpError(400, 'End date must follow start date.');
    const query =
      dataset === 'hazards'
        ? 'SELECT h.*,b.name AS building,r.name AS room FROM hazards h LEFT JOIN rooms r ON r.id=h.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings b ON b.id=f.building_id WHERE h.created_at>=? AND h.created_at<=? ORDER BY h.id LIMIT 20001'
        : dataset === 'inspections'
          ? 'SELECT s.*,s.started_at AS created_at,b.name AS building,r.name AS room FROM scans s JOIN rooms r ON r.id=s.room_id JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id WHERE s.started_at>=? AND s.started_at<=? ORDER BY s.id LIMIT 20001'
          : 'SELECT * FROM incidents WHERE created_at>=? AND created_at<=? ORDER BY id LIMIT 20001';
    let rows = camelAll(await db.prepare(query).all(from, to));
    if (rows.length > 20000)
      throw new HttpError(400, 'Narrow the date range to at most 20,000 source records.');
    if (body.building) rows = rows.filter((row) => row.building === body.building);
    let report;
    try {
      report = summarize(rows, { ...body, dataset });
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    await audit(user.id, 'report.custom', 'school', 1, {
      dataset,
      records: rows.length,
    });
    return json(ctx.res, 200, {
      dataset,
      from,
      to,
      sourceRecords: rows.length,
      rows: report,
      csv: [
        ['group', 'count', 'resolved', 'averageResolutionHours'].map(csvCell).join(','),
        ...report.map((r) =>
          [JSON.stringify(r.group), r.count, r.resolved, r.averageResolutionHours]
            .map(csvCell)
            .join(','),
        ),
      ].join('\r\n'),
    });
  };
  routes['GET /api/advanced/recurrence'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'hazards:read');
    const rows = await db
      .prepare(
        'SELECT h.id,h.ref,h.title,h.category,h.room_id,h.status,h.created_at,r.name AS room_name FROM hazards h LEFT JOIN rooms r ON r.id=h.room_id ORDER BY h.created_at DESC LIMIT 5000',
      )
      .all();
    const groups = new Map();
    for (const row of rows) {
      const key = `${row.room_id ?? 'unmapped'}:${
        row.category === 'other'
          ? row.title
              .toLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu, ' ')
              .trim()
          : row.category
      }`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(camel(row));
    }
    return json(ctx.res, 200, {
      groups: [...groups.values()]
        .filter((g) => g.length >= 2)
        .sort((a, b) => b.length - a.length)
        .slice(0, 50),
      note: 'Repeated recorded reports may be duplicates or recurring conditions. Review inspection dates and evidence; no recurrence prediction is made.',
    });
  };
  routes['GET /api/advanced/relay/ice'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const urls = String(process.env.RADAR_TURN_URLS ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (!urls.length) return json(ctx.res, 200, { iceServers: [], mode: 'local_network_only' });
    if (
      !process.env.RADAR_TURN_SECRET ||
      urls.some(
        (url) => !/^turns:[a-zA-Z0-9.-]+(?::[0-9]{1,5})?(?:\?transport=(?:tcp|udp))?$/.test(url),
      )
    )
      throw new HttpError(
        503,
        'Configure valid TURN TLS URLs and the server-only TURN REST secret.',
      );
    const expires = Math.floor(Date.now() / 1000) + 600;
    const username = `${expires}:${user.id}`;
    const credential = crypto
      .createHmac('sha1', process.env.RADAR_TURN_SECRET)
      .update(username)
      .digest('base64');
    return json(ctx.res, 200, {
      iceServers: [{ urls, username, credential }],
      expiresAt: new Date(expires * 1000).toISOString(),
      mode: 'configured_turn_requires_device_test',
    });
  };
  routes['POST /api/advanced/relay/receive'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'incidents:write');
    const body = await readJson(ctx.req);
    let packet;
    try {
      packet = relayPacket(body.packet);
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    if (packet.training === true && process.env.RADAR_TEST_LAB !== '1')
      throw new HttpError(409, 'Training relay packets cannot be recorded in a production school.');
    if (packet.school !== scope())
      throw new HttpError(409, 'Open the relay packet’s school before receiving it.');
    const result = await db
      .prepare(
        'INSERT INTO relay_inbox(packet_id,payload,received_by,created_at) VALUES (?,?,?,?) ON CONFLICT(packet_id) DO NOTHING RETURNING id',
      )
      .get(packet.id, JSON.stringify(packet), user.id, nowIso());
    if (!result) throw new HttpError(409, 'This relay packet was already received.');
    await audit(user.id, 'relay.unverified.receive', 'relay', result.id, {});
    return json(ctx.res, 201, {
      received: true,
      verified: false,
      message:
        'Saved for staff review. Sender identity and on-site conditions have not been verified; no emergency services were contacted.',
    });
  };
  routes['GET /api/advanced/relay/inbox'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'incidents:read');
    return json(ctx.res, 200, {
      packets: camelAll(
        await db.prepare('SELECT * FROM relay_inbox ORDER BY id DESC LIMIT 50').all(),
      ),
    });
  };
  routes['POST /api/advanced/delivery/drain'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'alerts:publish');
    const processed = await drainDeliveryJobs();
    await drainSosSms();
    return json(ctx.res, 200, {
      processed,
      note: 'Jobs processed. Inspect channel receipts; processing is not proof of delivery.',
    });
  };
  routes['GET /api/advanced/delivery-policy'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'alerts:publish');
    const row = await db
      .prepare("SELECT value FROM school_settings WHERE key='delivery_policy'")
      .get();
    return json(ctx.res, 200, {
      policy: row ? JSON.parse(row.value) : { fallbackSms: false, sosSms: false },
      sosJobs: camelAll(
        await db.prepare('SELECT * FROM emergency_sms_jobs ORDER BY id DESC LIMIT 50').all(),
      ),
    });
  };
  routes['POST /api/advanced/delivery-policy'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const body = await readJson(ctx.req);
    const policy = {
      fallbackSms: body.fallbackSms === true,
      sosSms: body.sosSms === true,
    };
    await db
      .prepare(
        "INSERT INTO school_settings(key,value,updated_at) VALUES ('delivery_policy',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      )
      .run(JSON.stringify(policy), nowIso());
    await audit(user.id, 'delivery.policy', 'school', 1, policy);
    return json(ctx.res, 200, { policy });
  };
  routes['GET /api/advanced/health'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const pending = await db
      .prepare("SELECT COUNT(*) AS n FROM delivery_jobs WHERE state='pending'")
      .get();
    const failed = await db
      .prepare("SELECT COUNT(*) AS n FROM delivery_jobs WHERE state IN ('failed','processing')")
      .get();
    const overdue = await db
      .prepare('SELECT COUNT(*) AS n FROM inspection_schedules WHERE next_due_at<?')
      .get(nowIso());
    const database = await db.prepare('SELECT 1 AS ok').get();
    return json(ctx.res, 200, {
      checkedAt: nowIso(),
      database: database.ok === 1,
      pendingDeliveryJobs: pending.n,
      failedOrUnconfirmedJobs: failed.n,
      overdueInspections: overdue.n,
      note: 'Authenticated operational health. Provider failures and unfinished jobs require review; database readiness does not guarantee emergency delivery.',
    });
  };
  routes['GET /api/advanced/testing'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const channels = channelStatus();
    const database = await db.prepare('SELECT 1 AS ok').get();
    return json(ctx.res, 200, {
      training: process.env.RADAR_TEST_LAB === '1',
      checks: {
        database: database.ok === 1,
        https: process.env.RADAR_PUBLIC_URL?.startsWith('https://') ?? false,
        visionConfigured: Boolean(visionApiKey()),
        pushConfigured: channels.push.configured,
        smsConfigured: channels.sms.configured,
        schedulerConfigured: Boolean(process.env.CRON_SECRET),
      },
      results: camelAll(
        await db
          .prepare(
            'SELECT a.*,u.name AS tester FROM acceptance_results a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100',
          )
          .all(),
      ),
      note: 'Configuration flags are not successful live tests. Record actual observed device/provider outcomes below; credentials stay in the server environment.',
    });
  };
  routes['POST /api/advanced/testing/results'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const body = await readJson(ctx.req);
    const key = oneOf(
      body.testKey,
      [
        'camera',
        'gps',
        'push',
        'sms',
        'email',
        'offline',
        'restore',
        'load',
        'security',
        'relay',
        'sensor',
        'model',
        'feed',
      ],
      'Test',
    );
    const state = oneOf(body.state, ['passed', 'failed', 'blocked'], 'Observed outcome');
    const note = str(body.note, 2000);
    if (!note)
      throw new HttpError(
        400,
        'Describe the actual test, device and evidence. Never enter secret values.',
      );
    await db
      .prepare(
        'INSERT INTO acceptance_results(test_key,state,note,actor_id,created_at) VALUES (?,?,?,?,?)',
      )
      .run(key, state, note, user.id, nowIso());
    await audit(user.id, 'acceptance.record', 'test', key, { state });
    return json(ctx.res, 201, { recorded: true });
  };
  return { ...routes, ...campusVideoHandlers(h),...imagePathHandlers(h) };
}
