import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphArtifact } from "../../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "output");
const OUTPUT_FILE = join(OUTPUT_DIR, "graph.json");

const CoM_API = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets";

async function fetchDataset(id: string, limit = 1000) {
  const url = `${CoM_API}/${id}/records?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${id}: ${res.status}`);
  return res.json();
}

async function main() {
  console.log("CityStride bake starting...");

  // TODO: fetch pedestrian network dataset, build node + edge list
  // TODO: fetch street lights, compute per-edge lux
  // TODO: fetch pedestrian counters, build IDW interpolator for 168-vector
  // TODO: fetch trees, compute per-edge canopy
  // TODO: fetch footpath steepness, invert to gentle_gradient
  // TODO: fetch tram stops, compute bailout_proximity
  // TODO: fetch venues + hours, build open_venues 168-vector
  // TODO: normalize all metrics to 0-1 positive-framed

  const artifact: GraphArtifact = {
    version: "0.1.0",
    built_at: new Date().toISOString(),
    bbox: [144.93, -37.83, 145.00, -37.79],
    nodes: [],
    edges: [],
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(artifact));
  console.log(`Wrote ${OUTPUT_FILE} (${artifact.nodes.length} nodes, ${artifact.edges.length} edges)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
