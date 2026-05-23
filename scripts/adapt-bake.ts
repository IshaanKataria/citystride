/**
 * Transforms the citystride bake output (bake-raw.json) into the
 * GraphArtifact format expected by the app frontend (graph.json).
 *
 * Also merges data/events.json (if present) into the artifact's
 * optional `events` field. Missing events.json → no events emitted.
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { Event, GraphArtifact } from "../app/lib/types";

const DATA_DIR = join(process.cwd(), "data");
const BAKE_RAW_PATH = join(DATA_DIR, "bake-raw.json");
const GRAPH_OUT_PATH = join(DATA_DIR, "graph.json");
const EVENTS_PATH = join(DATA_DIR, "events.json");

async function loadEvents(): Promise<readonly Event[] | undefined> {
  try {
    await access(EVENTS_PATH);
  } catch {
    return undefined;
  }
  const raw = await readFile(EVENTS_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    console.warn(`  events.json present but is not an array; ignoring`);
    return undefined;
  }
  return parsed as Event[];
}

async function adapt() {
  console.log("\n=== Adapting bake output to app format ===\n");

  const raw = await readFile(BAKE_RAW_PATH, "utf-8");
  const bake = JSON.parse(raw);

  console.log(`  Bake artifact: ${bake.nodes.length} nodes, ${bake.edges.length} edges`);

  const events = await loadEvents();
  if (events) {
    console.log(`  Events: ${events.length} entries from events.json`);
  } else {
    console.log(`  Events: none (data/events.json not found)`);
  }

  const artifact: GraphArtifact = {
    meta: bake.meta,
    nodes: bake.nodes,
    edges: bake.edges,
    ...(events ? { events } : {}),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(GRAPH_OUT_PATH, JSON.stringify(artifact), "utf-8");

  const sizeMb = (Buffer.byteLength(JSON.stringify(artifact)) / 1024 / 1024).toFixed(1);
  console.log(`\n  graph.json written (${sizeMb} MB)`);
  console.log(`  ${artifact.nodes.length} nodes, ${artifact.edges.length} edges${events ? `, ${events.length} events` : ""}`);
  console.log("\n=== Adaptation complete ===");
}

adapt().catch((err) => {
  console.error("Adaptation failed:", err);
  process.exit(1);
});
