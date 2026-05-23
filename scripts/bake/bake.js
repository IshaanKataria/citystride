/**
 * Main bake orchestrator.
 * Run: node bake/bake.js
 *
 * Steps:
 *   1. Fetch all datasets (cached after first run)
 *   2. Build OSM pedestrian network graph
 *   3. Compute per-edge metrics
 *   4. Normalize metrics 0-1
 *   5. Write graph.json
 */

import { fetchAll } from './fetch.js';
import { buildNetwork } from './network.js';
import {
  computeLighting,
  computePedestrians,
  computeSteepness,
  computeSurface,
  computeTransit,
  computeVenues,
  computeCanopy,
} from './metrics.js';
import { normalizeAll } from './normalize.js';
import { writeArtifact } from './artifact.js';

async function bake() {
  const t0 = Date.now();
  console.log('=== CityStride Bake ===');

  // 1. Fetch
  const datasets = await fetchAll();

  // 2. Network
  console.log('\nBuilding network...');
  const { nodes, edges } = buildNetwork(datasets.osm);

  // 3. Metrics
  console.log('\nComputing metrics...');
  computeLighting(edges, datasets.streetlights);
  computePedestrians(edges, datasets.pedcounts);
  await computeSteepness(edges, nodes);
  computeSurface(edges, datasets.roadsurface);
  computeTransit(edges, datasets.transitstops);
  computeVenues(edges, datasets.venues);
  computeCanopy(edges, datasets.trees);

  // 4. Normalize
  console.log('\nNormalizing...');
  normalizeAll(edges);

  // 5. Write
  console.log('\nWriting artifact...');
  const outPath = writeArtifact(nodes, edges);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s → ${outPath}`);
}

bake().catch(err => {
  console.error('Bake failed:', err);
  process.exit(1);
});
