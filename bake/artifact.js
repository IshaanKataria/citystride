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
const OUT_PATH = path.join(__dirname, '..', 'data', 'graph.json');

export function writeArtifact(nodes, edges) {
  console.log(`Writing graph artifact: ${edges.length} edges, ${nodes.size} nodes...`);

  const artifact = {
    meta: {
      baked_at: new Date().toISOString(),
      edge_count: edges.length,
      node_count: nodes.size,
    },
    nodes: [...nodes.values()].map(n => ({
      id: n.id,
      lng: n.lng,
      lat: n.lat,
    })),
    edges: edges.map(e => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      wayId: e.wayId,
      geometry: e.geometry,
      length_m: e.length_m,
      name: e.name,
      highwayType: e.highwayType,
      metrics: {
        // Normalized 0-1
        lux: e.metrics.lux ?? 0,
        steepness: e.metrics.steepness ?? 0,
        surface: e.metrics.surface ?? 0.7,
        transit: e.metrics.transit ?? 0,
        canopy: e.metrics.canopy ?? 0,
        ped_vector: e.metrics.ped_vector ?? new Array(168).fill(0),
        venues_vector: e.metrics.venues_vector ?? new Array(168).fill(0),

        // Raw human-readable values (for inspector card)
        lux_raw: e.metrics.lux_raw ?? 0,
        grade_pct_raw: e.metrics.grade_pct_raw ?? 0,
        surface_raw: e.metrics.surface_raw ?? { material: 'unknown', condition: 3, score: 0.7 },
        transit_raw: e.metrics.transit_raw ?? { nearest_stop_m: 9999, stops_within_200m: 0 },
        canopy_raw: e.metrics.canopy_raw ?? 0,
        ped_vector_raw: e.metrics.ped_vector_raw ?? new Array(168).fill(0),
        venues_count: e.metrics.venues_count ?? 0,
        ped_confidence: e.metrics.ped_confidence ?? { nearest_sensor_m: null, sensor_count: 0, is_interpolated: false },
      },
    })),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(artifact));
  const size = fs.statSync(OUT_PATH).size;
  console.log(`graph.json written: ${(size / 1024 / 1024).toFixed(1)} MB`);
  return OUT_PATH;
}
