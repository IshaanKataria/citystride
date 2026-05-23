/**
 * Computes all per-edge metrics from the raw datasets.
 * All outputs are raw (un-normalized) values; normalize.js handles 0-1 scaling.
 */

import RBush from 'rbush';

// --- Helpers ---

const R_EARTH = 6371008.8; // meters

function haversineM(lng1, lat1, lng2, lat2) {
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const lat1r = lat1 * (Math.PI / 180);
  const lat2r = lat2 * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLng / 2) ** 2;
  return R_EARTH * 2 * Math.asin(Math.sqrt(a));
}

// Degrees per meter at Melbourne latitude (~-37.8°)
const DEG_PER_M_LAT = 1 / 111195;
const DEG_PER_M_LNG = 1 / 87700;

function buildPointIndex(points) {
  const tree = new RBush();
  tree.load(points.map(p => ({
    minX: p.lng, maxX: p.lng,
    minY: p.lat, maxY: p.lat,
    data: p,
  })));
  return tree;
}

function queryRadius(tree, lng, lat, radiusM) {
  const dLat = radiusM * DEG_PER_M_LAT;
  const dLng = radiusM * DEG_PER_M_LNG;
  const bbox = { minX: lng - dLng, maxX: lng + dLng, minY: lat - dLat, maxY: lat + dLat };
  return tree.search(bbox).map(r => r.data);
}

function midpointOf(edge) {
  return edge.midpoint; // [lng, lat]
}

// --- Lighting ---

function parseLux(light) {
  if (light.label) {
    const n = parseFloat(light.label);
    if (!isNaN(n) && n > 0) return n;
  }
  const sub = (light.asset_subt ?? '').toLowerCase();
  if (sub.includes('led')) return 20;
  if (sub.includes('high')) return 30;
  if (sub.includes('feature')) return 15;
  return 12;
}

export function computeLighting(edges, streetlights) {
  console.log('  lighting: building spatial index...');

  const lights = streetlights
    .filter(l => l.geo_point_2d?.lon && l.geo_point_2d?.lat)
    .map(l => ({
      lng: l.geo_point_2d.lon,
      lat: l.geo_point_2d.lat,
      lux: parseLux(l),
    }));

  const tree = buildPointIndex(lights);
  const MAX_DIST_M = 50;

  console.log(`  lighting: computing lux per edge (${lights.length} lights indexed)...`);

  for (const edge of edges) {
    const [eLng, eLat] = midpointOf(edge);
    let totalLux = 0;

    for (const light of queryRadius(tree, eLng, eLat, MAX_DIST_M)) {
      const d = haversineM(eLng, eLat, light.lng, light.lat);
      if (d < MAX_DIST_M) {
        totalLux += light.lux / Math.max(1, d * d / 100);
      }
    }

    edge.metrics.lux_raw = Math.round(totalLux * 10) / 10;
  }
}

// --- Pedestrian counts → 168-vector ---

function buildSensorVectors(pedcounts) {
  const sensors = new Map();

  for (const row of pedcounts) {
    if (!row.location?.lon || !row.location?.lat) continue;

    const sid = row.location_id;
    if (!sensors.has(sid)) {
      sensors.set(sid, {
        sums: new Float64Array(168),
        counts: new Uint32Array(168),
        lng: row.location.lon,
        lat: row.location.lat,
        name: row.sensor_name,
      });
    }

    const s = sensors.get(sid);
    const date = new Date(row.sensing_date);
    const jsDay = date.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    const hour = row.hourday ?? 0;
    const idx = (isoDay - 1) * 24 + hour;

    if (idx >= 0 && idx < 168) {
      s.sums[idx] += (row.pedestriancount ?? 0);
      s.counts[idx]++;
    }
  }

  const result = [];
  for (const [sid, s] of sensors) {
    const avgVector = new Float32Array(168);
    for (let i = 0; i < 168; i++) {
      avgVector[i] = s.counts[i] > 0 ? s.sums[i] / s.counts[i] : 0;
    }
    result.push({ id: sid, lng: s.lng, lat: s.lat, name: s.name, avgVector });
  }
  return result;
}

export function computePedestrians(edges, pedcounts) {
  console.log('  pedestrians: building sensor 168-vectors...');
  const sensors = buildSensorVectors(pedcounts);
  console.log(`  pedestrians: ${sensors.length} sensors with data`);

  const areaAvg = new Float32Array(168);
  for (const s of sensors) {
    for (let i = 0; i < 168; i++) areaAvg[i] += s.avgVector[i];
  }
  for (let i = 0; i < 168; i++) areaAvg[i] /= sensors.length;

  const MAX_RANGE_M = 400;
  const MAX_SENSORS = 5;

  const sensorTree = buildPointIndex(sensors);

  console.log('  pedestrians: IDW interpolation per edge...');
  for (const edge of edges) {
    const [eLng, eLat] = midpointOf(edge);

    const nearby = queryRadius(sensorTree, eLng, eLat, MAX_RANGE_M)
      .map(s => ({ s, d: haversineM(eLng, eLat, s.lng, s.lat) }))
      .filter(({ d }) => d <= MAX_RANGE_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_SENSORS);

    let pedVector;
    let nearestM;
    let usedCount;

    if (nearby.length === 0) {
      pedVector = Array.from(areaAvg);
      nearestM = null;
      usedCount = 0;
    } else {
      nearestM = Math.round(nearby[0].d);
      usedCount = nearby.length;

      const weights = nearby.map(({ d }) => 1 / Math.max(1, d * d));
      const totalW = weights.reduce((a, b) => a + b, 0);

      pedVector = new Array(168).fill(0);
      for (let i = 0; i < 168; i++) {
        let val = 0;
        for (let j = 0; j < nearby.length; j++) {
          val += nearby[j].s.avgVector[i] * weights[j];
        }
        pedVector[i] = Math.round(val / totalW);
      }
    }

    edge.metrics.ped_vector_raw = pedVector;
    edge.metrics.ped_confidence = {
      nearest_sensor_m: nearestM,
      sensor_count: usedCount,
      is_interpolated: usedCount > 0,
    };
  }
}

// --- Steepness ---

async function fetchElevations(nodes) {
  const nodeList = [...nodes.values()];
  const BATCH = 100;
  const CONCURRENCY = 20;
  const elevMap = new Map();

  const batches = [];
  for (let i = 0; i < nodeList.length; i += BATCH) {
    batches.push(nodeList.slice(i, i + BATCH));
  }

  let done = 0;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (batch) => {
      const lats = batch.map(n => n.lat).join(',');
      const lngs = batch.map(n => n.lng).join(',');
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const elevs = data.elevation ?? [];
        batch.forEach((n, j) => elevMap.set(n.id, elevs[j] ?? 0));
      } catch {
        batch.forEach(n => elevMap.set(n.id, 0));
      }
    }));
    done += chunk.length;
    if (done % 100 === 0 || done === batches.length) {
      console.log(`    elevation: ${done * BATCH}/${nodeList.length} nodes done`);
    }
  }
  return elevMap;
}

export async function computeSteepness(edges, nodes) {
  console.log(`  steepness: fetching elevations (${nodes.size} nodes, 20 concurrent batches)...`);
  const elevMap = await fetchElevations(nodes);

  for (const edge of edges) {
    const fromElev = elevMap.get(edge.fromNodeId) ?? 0;
    const toElev = elevMap.get(edge.toNodeId) ?? 0;
    const elevDiff = Math.abs(fromElev - toElev);
    const grade_pct = edge.length_m > 0 ? (elevDiff / edge.length_m) * 100 : 0;
    edge.metrics.grade_pct_raw = Math.round(grade_pct * 10) / 10;
  }
}

// --- Surface quality ---

const MATERIAL_SCORE = {
  'asphalt': 1.0,
  'concrete': 0.85,
  'paving stones': 0.9,
  'brick': 0.8,
  'gravel': 0.5,
  'grass': 0.3,
  'dirt': 0.2,
  'sand': 0.2,
};

export function computeSurface(edges, roadsurface) {
  console.log('  surface: building spatial index...');

  const surfacePoints = roadsurface
    .filter(r => r.geo_point_2d?.lon)
    .map(r => ({
      lng: r.geo_point_2d.lon,
      lat: r.geo_point_2d.lat,
      material: (r.material ?? 'concrete').toLowerCase(),
      condition: parseFloat(r.condition) || 3,
    }));

  const tree = buildPointIndex(surfacePoints);
  const SEARCH_RADIUS_M = 15;

  console.log('  surface: spatial lookup per edge...');

  for (const edge of edges) {
    const [eLng, eLat] = midpointOf(edge);

    let material = null;
    let condition = 3;

    if (edge.surface) {
      material = edge.surface.toLowerCase();
    } else {
      let bestD = Infinity;
      for (const sp of queryRadius(tree, eLng, eLat, SEARCH_RADIUS_M)) {
        const d = haversineM(eLng, eLat, sp.lng, sp.lat);
        if (d < bestD && d < SEARCH_RADIUS_M) {
          bestD = d;
          material = sp.material;
          condition = sp.condition;
        }
      }
    }

    const materialScore = MATERIAL_SCORE[material] ?? 0.7;
    const conditionScore = Math.min((condition - 1) / 4, 1);
    edge.metrics.surface_raw = {
      material: material ?? 'unknown',
      condition,
      score: Math.round((materialScore * 0.7 + conditionScore * 0.3) * 100) / 100,
    };
  }
}

// --- Transit proximity ---

export function computeTransit(edges, transitstops) {
  console.log('  transit: building spatial index...');

  const stops = transitstops
    .filter(s => s.geo_point_2d?.lon)
    .map(s => ({ lng: s.geo_point_2d.lon, lat: s.geo_point_2d.lat, type: s.type }));

  const tree = buildPointIndex(stops);
  const COUNT_RADIUS_M = 200;
  const NEAREST_SEARCH_M = 1000; // wider net to find nearest stop

  console.log('  transit: nearest stop per edge...');

  for (const edge of edges) {
    const [eLng, eLat] = midpointOf(edge);

    const candidates = queryRadius(tree, eLng, eLat, NEAREST_SEARCH_M);
    let nearestM = Infinity;
    let count200m = 0;

    for (const stop of candidates) {
      const d = haversineM(eLng, eLat, stop.lng, stop.lat);
      if (d < nearestM) nearestM = d;
      if (d <= COUNT_RADIUS_M) count200m++;
    }

    // Fallback: if no stop found within 1km, scan all
    if (nearestM === Infinity) {
      for (const stop of stops) {
        const d = haversineM(eLng, eLat, stop.lng, stop.lat);
        if (d < nearestM) nearestM = d;
      }
    }

    edge.metrics.transit_raw = {
      nearest_stop_m: nearestM === Infinity ? 9999 : Math.round(nearestM),
      stops_within_200m: count200m,
    };
  }
}

// --- Open venues 168-vector ---

const THEME_HOURS = {
  'cafe':      [7, 16],
  'restaurant':[11, 22],
  'bar':       [17, 1],
  'pub':       [11, 1],
  'retail':    [9, 17],
  'arts':      [10, 18],
  'sport':     [6, 22],
  'education': [8, 17],
  'health':    [8, 18],
  'default':   [9, 18],
};

function themeToPattern(theme) {
  const t = (theme ?? 'default').toLowerCase();
  let hours = THEME_HOURS.default;
  for (const [key, val] of Object.entries(THEME_HOURS)) {
    if (t.includes(key)) { hours = val; break; }
  }

  const pattern = new Float32Array(168);
  for (let day = 0; day < 7; day++) {
    const [open, close] = hours;
    const closeNorm = close < open ? close + 24 : close;
    for (let h = 0; h < 24; h++) {
      const isOpen = h >= open && h < closeNorm;
      const weekendBoost = (day >= 5 && (t.includes('restaurant') || t.includes('bar') || t.includes('pub'))) ? 1.3 : 1.0;
      pattern[day * 24 + h] = isOpen ? weekendBoost : 0;
    }
  }
  return pattern;
}

export function computeVenues(edges, venues) {
  console.log('  venues: building spatial index...');

  const venuePoints = venues
    .filter(v => v.co_ordinates?.lon)
    .map(v => ({
      lng: v.co_ordinates.lon,
      lat: v.co_ordinates.lat,
      pattern: themeToPattern(v.sub_theme ?? v.theme),
    }));

  const tree = buildPointIndex(venuePoints);
  const RADIUS_M = 100;

  console.log('  venues: computing open-venue 168-vectors...');

  for (const edge of edges) {
    const [eLng, eLat] = midpointOf(edge);
    const venueVector = new Float32Array(168);
    let count = 0;

    for (const venue of queryRadius(tree, eLng, eLat, RADIUS_M)) {
      const d = haversineM(eLng, eLat, venue.lng, venue.lat);
      if (d <= RADIUS_M) {
        for (let i = 0; i < 168; i++) venueVector[i] += venue.pattern[i];
        count++;
      }
    }

    edge.metrics.venues_vector_raw = Array.from(venueVector);
    edge.metrics.venues_count = count;
  }
}

// --- Canopy ---

export function computeCanopy(edges, trees) {
  console.log('  canopy: building spatial index...');

  const treePoints = trees
    .filter(t => t.geolocation?.lon)
    .map(t => ({ lng: t.geolocation.lon, lat: t.geolocation.lat }));

  const treeTree = buildPointIndex(treePoints);
  const RADIUS_M = 30;

  console.log(`  canopy: counting trees per edge (${treePoints.length} trees indexed)...`);

  for (const edge of edges) {
    const [eLng, eLat] = midpointOf(edge);
    let count = 0;
    for (const tree of queryRadius(treeTree, eLng, eLat, RADIUS_M)) {
      if (haversineM(eLng, eLat, tree.lng, tree.lat) <= RADIUS_M) count++;
    }
    edge.metrics.canopy_raw = count;
  }
}
