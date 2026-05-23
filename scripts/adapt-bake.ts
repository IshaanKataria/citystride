/**
 * Transforms the citystride bake output (bake-raw.json) into the
 * GraphArtifact format expected by the app frontend (graph.json).
 *
 * The app types now match the bake output schema directly, so this
 * script is a pass-through with minimal validation.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { GraphArtifact } from "../app/lib/types";

const DATA_DIR = join(process.cwd(), "data");
const BAKE_RAW_PATH = join(DATA_DIR, "bake-raw.json");
const GRAPH_OUT_PATH = join(DATA_DIR, "graph.json");

async function adapt() {
  console.log("\n=== Adapting bake output to app format ===\n");

  const raw = await readFile(BAKE_RAW_PATH, "utf-8");
  const bake = JSON.parse(raw);

  console.log(`  Bake artifact: ${bake.nodes.length} nodes, ${bake.edges.length} edges`);

  const artifact: GraphArtifact = {
    meta: bake.meta,
    nodes: bake.nodes,
    edges: bake.edges,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(GRAPH_OUT_PATH, JSON.stringify(artifact), "utf-8");

  const sizeMb = (Buffer.byteLength(JSON.stringify(artifact)) / 1024 / 1024).toFixed(1);
  console.log(`\n  graph.json written (${sizeMb} MB)`);
  console.log(`  ${artifact.nodes.length} nodes, ${artifact.edges.length} edges`);
  console.log("\n=== Adaptation complete ===");
}

adapt().catch((err) => {
  console.error("Adaptation failed:", err);
  process.exit(1);
});
