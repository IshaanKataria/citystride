/**
 * Transforms the citystride bake output (bake-raw.json) into the
 * GraphArtifact format expected by the app frontend (graph.json).
 *
 * Field mapping:
 *   bake                → app
 *   fromNodeId/toNodeId → from/to
 *   name                → street_name
 *   metrics.steepness   → metrics.gentle_gradient
 *   metrics.surface     → metrics.surface_quality
 *   metrics.transit     → metrics.bailout_proximity
 *   metrics.ped_vector  → metrics.ped_count
 *   metrics.venues_vector → metrics.open_venues
 *   ped_confidence      → confidence.ped_count
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GraphArtifact, GraphEdge, GraphNode, AddressRecord } from "../app/lib/types";

const DATA_DIR = join(process.cwd(), "data");
const BAKE_RAW_PATH = join(DATA_DIR, "bake-raw.json");
const GRAPH_OUT_PATH = join(DATA_DIR, "graph.json");

interface BakeEdge {
  id: string;
  fromNodeId: number | string;
  toNodeId: number | string;
  geometry: [number, number][];
  length_m: number;
  name: string | null;
  metrics: {
    lux: number;
    steepness: number;
    surface: number;
    transit: number;
    canopy: number;
    ped_vector: number[];
    venues_vector: number[];
    ped_confidence: {
      nearest_sensor_m: number | null;
      sensor_count: number;
    };
  };
}

interface BakeNode {
  id: number | string;
  lng: number;
  lat: number;
}

interface BakeArtifact {
  meta: { baked_at: string; edge_count: number; node_count: number };
  nodes: BakeNode[];
  edges: BakeEdge[];
}

// Fetch and parse CoM street addresses for geocoding
async function fetchAddresses(nodes: GraphNode[]): Promise<AddressRecord[]> {
  const cachePath = join(DATA_DIR, "raw", "streetAddresses.csv");

  let csv: string;
  if (existsSync(cachePath)) {
    console.log("  [cached] Street Addresses");
    csv = await readFile(cachePath, "utf-8");
  } else {
    console.log("  [fetch] Street Addresses...");
    const url =
      "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/street-addresses/exports/csv?limit=-1&timezone=Australia%2FMelbourne";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch addresses: ${res.status}`);
    csv = await res.text();
    await mkdir(join(DATA_DIR, "raw"), { recursive: true });
    await writeFile(cachePath, csv, "utf-8");
  }

  const lines = csv.split("\n");
  const header = lines[0].split(";").map((h) => h.trim().toLowerCase());
  const addrIdx = header.findIndex(
    (h) => h.includes("address") || h.includes("full_address") || h.includes("clue_small_area"),
  );
  const lngIdx = header.findIndex((h) => h.includes("lon") || h.includes("lng") || h.includes("x_coordinate"));
  const latIdx = header.findIndex((h) => h.includes("lat") || h.includes("y_coordinate"));

  // Also check for a geopoint column
  const geoIdx = header.findIndex((h) => h.includes("geo_point") || h.includes("geopoint"));

  const addresses: AddressRecord[] = [];
  const nodeArray = nodes;

  const findNearest = (lng: number, lat: number): string => {
    let nearestId = nodeArray[0].id;
    let minDist = Infinity;
    for (const node of nodeArray) {
      const d = (node.lng - lng) ** 2 + (node.lat - lat) ** 2;
      if (d < minDist) {
        minDist = d;
        nearestId = node.id;
      }
    }
    return nearestId;
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");

    // Try to get address from various possible columns
    let address = "";
    // Look for building_address or street_address columns
    const buildingAddrIdx = header.findIndex((h) => h.includes("building_address"));
    const streetAddrIdx = header.findIndex((h) => h.includes("street_address"));
    if (buildingAddrIdx >= 0 && cols[buildingAddrIdx]?.trim()) {
      address = cols[buildingAddrIdx].trim();
    } else if (streetAddrIdx >= 0 && cols[streetAddrIdx]?.trim()) {
      address = cols[streetAddrIdx].trim();
    } else if (addrIdx >= 0 && cols[addrIdx]?.trim()) {
      address = cols[addrIdx].trim();
    }

    if (!address) continue;

    let lng: number | undefined;
    let lat: number | undefined;

    // Try geopoint column first (format: "lat, lng")
    if (geoIdx >= 0 && cols[geoIdx]) {
      const parts = cols[geoIdx].split(",").map((s) => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        lat = parts[0];
        lng = parts[1];
      }
    }

    // Fall back to separate lng/lat columns
    if (lng === undefined || lat === undefined) {
      lng = parseFloat(cols[lngIdx]);
      lat = parseFloat(cols[latIdx]);
    }

    if (isNaN(lng!) || isNaN(lat!)) continue;

    addresses.push({
      address,
      lng: lng!,
      lat: lat!,
      nearestNodeId: findNearest(lng!, lat!),
    });
  }

  console.log(`  Parsed ${addresses.length} addresses`);
  return addresses;
}

async function adapt() {
  console.log("\n=== Adapting bake output to app format ===\n");

  const raw = await readFile(BAKE_RAW_PATH, "utf-8");
  const bake: BakeArtifact = JSON.parse(raw);

  console.log(`  Bake artifact: ${bake.nodes.length} nodes, ${bake.edges.length} edges`);

  // Transform nodes
  const nodes: GraphNode[] = bake.nodes.map((n) => ({
    id: String(n.id),
    lng: n.lng,
    lat: n.lat,
  }));

  // Transform edges: map field names from citystride → app format
  const edges: GraphEdge[] = bake.edges.map((e) => ({
    id: e.id,
    from: String(e.fromNodeId),
    to: String(e.toNodeId),
    geometry: e.geometry,
    length_m: e.length_m,
    street_name: e.name ?? "Unknown",
    metrics: {
      lux: e.metrics.lux ?? 0,
      gentle_gradient: e.metrics.steepness ?? 0.7,
      surface_quality: e.metrics.surface ?? 0.5,
      canopy: e.metrics.canopy ?? 0,
      bailout_proximity: e.metrics.transit ?? 0,
      ped_count: e.metrics.ped_vector ?? new Array(168).fill(0),
      open_venues: e.metrics.venues_vector ?? new Array(168).fill(0),
    },
    confidence: {
      ped_count: {
        distance_to_sensor_m: e.metrics.ped_confidence?.nearest_sensor_m ?? 999,
      },
    },
  }));

  // Compute bounds
  const lngs = nodes.map((n) => n.lng);
  const lats = nodes.map((n) => n.lat);

  // Fetch and parse addresses
  console.log("\nGeocoding addresses...");
  const addresses = await fetchAddresses(nodes);

  const artifact: GraphArtifact = {
    nodes,
    edges,
    addresses,
    bounds: {
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
    },
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(GRAPH_OUT_PATH, JSON.stringify(artifact), "utf-8");

  const sizeMb = (Buffer.byteLength(JSON.stringify(artifact)) / 1024 / 1024).toFixed(1);
  console.log(`\n  graph.json written (${sizeMb} MB)`);
  console.log(`  ${nodes.length} nodes, ${edges.length} edges, ${addresses.length} addresses`);
  console.log("\n=== Adaptation complete ===");
}

adapt().catch((err) => {
  console.error("Adaptation failed:", err);
  process.exit(1);
});
