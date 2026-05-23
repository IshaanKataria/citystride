import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { GraphArtifact, AddressRecord, GraphNode } from "../../app/lib/types";

const OUTPUT_DIR = join(process.cwd(), "data");

const findNearestNode = (nodes: readonly GraphNode[], lng: number, lat: number): string => {
  let nearestId = nodes[0].id;
  let minDist = Infinity;

  for (const node of nodes) {
    const d = (node.lng - lng) ** 2 + (node.lat - lat) ** 2;
    if (d < minDist) {
      minDist = d;
      nearestId = node.id;
    }
  }

  return nearestId;
};

export const parseAddresses = (
  csv: string,
  nodes: readonly GraphNode[],
): AddressRecord[] => {
  const lines = csv.split("\n");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const addrIdx = header.findIndex((h) => h.includes("address") || h.includes("full_address"));
  const lngIdx = header.findIndex((h) => h.includes("lon") || h.includes("lng") || h.includes("x"));
  const latIdx = header.findIndex((h) => h.includes("lat") || h.includes("y"));

  const addresses: AddressRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const address = cols[addrIdx]?.trim();
    const lng = parseFloat(cols[lngIdx]);
    const lat = parseFloat(cols[latIdx]);

    if (!address || isNaN(lng) || isNaN(lat)) { continue; }

    addresses.push({
      address,
      lng,
      lat,
      nearestNodeId: findNearestNode(nodes, lng, lat),
    });
  }

  console.log(`  Parsed ${addresses.length} addresses`);
  return addresses;
};

export const writeGraphArtifact = async (artifact: GraphArtifact): Promise<void> => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, "graph.json");
  await writeFile(path, JSON.stringify(artifact), "utf-8");
  const sizeMb = (Buffer.byteLength(JSON.stringify(artifact)) / 1024 / 1024).toFixed(1);
  console.log(`  Graph artifact written to ${path} (${sizeMb} MB)`);
};
