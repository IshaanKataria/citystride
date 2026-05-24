/**
 * Serializes the graph to public/graph.json (compacted, app-ready).
 *
 * Metrics on each edge (normalized 0-1):
 *   lux, steepness, surface, transit, canopy, ped_confidence
 *   ped_vector (3 time buckets), venues_vector (3 time buckets)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', '..', 'public', 'graph.json');

const TIME_BUCKETS = ['morning', 'afternoon', 'evening'];
const ZERO_VEC_3 = [0, 0, 0];

function bucketForHour(hour) {
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  return 2;
}

function compactVector(values) {
  if (!values || values.length === 0) return ZERO_VEC_3;
  if (values.length <= 3) return values;

  const sums = [0, 0, 0];
  const counts = [0, 0, 0];
  for (let i = 0; i < values.length; i++) {
    const b = bucketForHour(i % 24);
    sums[b] += values[i] ?? 0;
    counts[b] += 1;
  }
  return sums.map((s, i) => Number((s / Math.max(1, counts[i])).toFixed(4)));
}

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
      ped_vector: compactVector(m.ped_vector),
      venues_vector: compactVector(m.venues_vector),
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
    time_buckets: TIME_BUCKETS,
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
