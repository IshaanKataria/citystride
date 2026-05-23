/**
 * Serializes the graph to data/graph.json.
 *
 * Format the runtime (Node.js API) loads once at startup:
 * {
 *   nodes: Array<{ id, lng, lat }>,
 *   edges: Array<{ id, fromNodeId, toNodeId, geometry, length_m, name, metrics }>,
 *   meta: { baked_at, edge_count, node_count }
 * }
 *
 * Metrics on each edge (all fields present, all normalized 0-1 unless *_raw):
 *   lux, lux_raw
 *   ped_vector (168), ped_vector_raw (168), ped_confidence
 *   steepness, grade_pct_raw
 *   surface, surface_raw
 *   transit, transit_raw
 *   venues_vector (168), venues_vector_raw (168), venues_count
 *   canopy, canopy_raw
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', '..', 'data', 'bake-raw.json');

const ZERO_VEC_168 = new Array(168).fill(0);

function serializeEdge(e) {
  const m = e.metrics;
  return JSON.stringify({
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    wayId: e.wayId,
    geometry: e.geometry,
    length_m: e.length_m,
    name: e.name,
    highwayType: e.highwayType,
    metrics: {
      lux: m.lux ?? 0,
      steepness: m.steepness ?? 0,
      surface: m.surface ?? 0.7,
      transit: m.transit ?? 0,
      canopy: m.canopy ?? 0,
      ped_vector: m.ped_vector ?? ZERO_VEC_168,
      venues_vector: m.venues_vector ?? ZERO_VEC_168,
      lux_raw: m.lux_raw ?? 0,
      grade_pct_raw: m.grade_pct_raw ?? 0,
      surface_raw: m.surface_raw ?? { material: 'unknown', condition: 3, score: 0.7 },
      transit_raw: m.transit_raw ?? { nearest_stop_m: 9999, stops_within_200m: 0 },
      canopy_raw: m.canopy_raw ?? 0,
      ped_vector_raw: m.ped_vector_raw ?? ZERO_VEC_168,
      venues_count: m.venues_count ?? 0,
      ped_confidence: m.ped_confidence ?? { nearest_sensor_m: null, sensor_count: 0, is_interpolated: false },
    },
  });
}

export function writeArtifact(nodes, edges) {
  console.log(`Writing graph artifact: ${edges.length} edges, ${nodes.size} nodes...`);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  const fd = fs.openSync(OUT_PATH, 'w');
  const write = (s) => fs.writeSync(fd, s);

  const meta = JSON.stringify({
    baked_at: new Date().toISOString(),
    edge_count: edges.length,
    node_count: nodes.size,
  });

  write(`{"meta":${meta},"nodes":[`);

  let first = true;
  for (const n of nodes.values()) {
    if (!first) write(',');
    write(JSON.stringify({ id: n.id, lng: n.lng, lat: n.lat }));
    first = false;
  }

  write('],"edges":[');

  first = true;
  for (const e of edges) {
    if (!first) write(',');
    write(serializeEdge(e));
    first = false;
  }

  write(']}');
  fs.closeSync(fd);

  const size = fs.statSync(OUT_PATH).size;
  console.log(`graph.json written: ${(size / 1024 / 1024).toFixed(1)} MB`);
  return OUT_PATH;
}
