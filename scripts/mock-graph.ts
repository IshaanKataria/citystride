import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { GraphArtifact, GraphNode, GraphEdge } from "../app/lib/types";

// Melbourne CBD street grid — approximate coordinates
const STREETS = {
  bourke:    { lat: -37.8136, lngStart: 144.955, lngEnd: 144.975, main: true },
  collins:   { lat: -37.8162, lngStart: 144.955, lngEnd: 144.975, main: true },
  lonsdale:  { lat: -37.8112, lngStart: 144.955, lngEnd: 144.975, main: false },
  latrobe:   { lat: -37.8090, lngStart: 144.955, lngEnd: 144.975, main: false },
  flinders:  { lat: -37.8183, lngStart: 144.955, lngEnd: 144.975, main: true },
  swanston:  { lng: 144.9631, latStart: -37.820, latEnd: -37.807, main: true },
  elizabeth: { lng: 144.9608, latStart: -37.820, latEnd: -37.807, main: false },
  william:   { lng: 144.9563, latStart: -37.820, latEnd: -37.807, main: false },
  queen:     { lng: 144.9585, latStart: -37.820, latEnd: -37.807, main: false },
  russell:   { lng: 144.9690, latStart: -37.820, latEnd: -37.807, main: false },
  exhibition:{ lng: 144.9715, latStart: -37.820, latEnd: -37.807, main: false },
  spring:    { lng: 144.9740, latStart: -37.820, latEnd: -37.807, main: false },
} as const;

const nodes: GraphNode[] = [];
const edges: GraphEdge[] = [];
const nodeMap = new Map<string, number>();

let nodeCounter = 0;
let edgeCounter = 0;
let wayCounter = 0;

const coordKey = (lng: number, lat: number) =>
  `${lng.toFixed(5)},${lat.toFixed(5)}`;

const getOrCreateNode = (lng: number, lat: number): number => {
  const key = coordKey(lng, lat);
  if (nodeMap.has(key)) return nodeMap.get(key)!;
  const id = nodeCounter++;
  nodes.push({ id, lng, lat });
  nodeMap.set(key, id);
  return id;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// Collapse 168-hour pattern into 3 time buckets: morning [5-12), afternoon [12-17), evening [17+]
const makeTimeVector = (morning: number, afternoon: number, evening: number): readonly number[] =>
  [
    Math.min(1, Math.max(0, morning + rand(-0.05, 0.05))),
    Math.min(1, Math.max(0, afternoon + rand(-0.05, 0.05))),
    Math.min(1, Math.max(0, evening + rand(-0.05, 0.05))),
  ];

const makeMetrics = (isMain: boolean): GraphEdge["metrics"] => ({
  lux:       isMain ? rand(0.6, 1.0) : rand(0.1, 0.5),
  steepness: rand(0.5, 0.95),
  surface:   isMain ? rand(0.6, 0.95) : rand(0.3, 0.7),
  transit:   isMain ? rand(0.6, 1.0)  : rand(0.1, 0.5),
  canopy:    rand(0.2, 0.8),
  ped_vector: makeTimeVector(
    isMain ? rand(0.5, 0.9) : rand(0.1, 0.3),
    isMain ? rand(0.6, 1.0) : rand(0.15, 0.35),
    isMain ? rand(0.4, 0.8) : rand(0.05, 0.2),
  ),
  venues_vector: makeTimeVector(
    isMain ? rand(0.4, 0.7) : rand(0.05, 0.2),
    isMain ? rand(0.5, 0.9) : rand(0.1, 0.3),
    isMain ? rand(0.4, 0.8) : rand(0.05, 0.2),
  ),
  ped_confidence: {
    nearest_sensor_m: Math.round(rand(10, 300)),
    sensor_count: isMain ? Math.round(rand(1, 4)) : 0,
    is_interpolated: !isMain,
  },
});

const addStreetSegments = (
  name: string,
  isHorizontal: boolean,
  fixedCoord: number,
  start: number,
  end: number,
  segments: number,
  isMain: boolean,
) => {
  const step = (end - start) / segments;
  const wayId = wayCounter++;

  for (let i = 0; i < segments; i++) {
    const v1 = start + i * step;
    const v2 = start + (i + 1) * step;

    const [lng1, lat1] = isHorizontal ? [v1, fixedCoord] : [fixedCoord, v1];
    const [lng2, lat2] = isHorizontal ? [v2, fixedCoord] : [fixedCoord, v2];

    const fromNodeId = getOrCreateNode(lng1, lat1);
    const toNodeId   = getOrCreateNode(lng2, lat2);

    const dLng = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
    const dLat = (lat2 - lat1) * 110540;
    const length_m = Math.round(Math.sqrt(dLng * dLng + dLat * dLat));

    edges.push({
      id: `e${edgeCounter++}`,
      fromNodeId,
      toNodeId,
      wayId,
      geometry: [[lng1, lat1], [lng2, lat2]],
      length_m,
      name,
      highwayType: isMain ? "primary" : "footway",
      metrics: makeMetrics(isMain),
    });
  }
};

// East-west streets
addStreetSegments("Bourke St",   true,  STREETS.bourke.lat,   STREETS.bourke.lngStart,   STREETS.bourke.lngEnd,   12, true);
addStreetSegments("Collins St",  true,  STREETS.collins.lat,  STREETS.collins.lngStart,  STREETS.collins.lngEnd,  12, true);
addStreetSegments("Lonsdale St", true,  STREETS.lonsdale.lat, STREETS.lonsdale.lngStart, STREETS.lonsdale.lngEnd, 12, false);
addStreetSegments("La Trobe St", true,  STREETS.latrobe.lat,  STREETS.latrobe.lngStart,  STREETS.latrobe.lngEnd,  12, false);
addStreetSegments("Flinders St", true,  STREETS.flinders.lat, STREETS.flinders.lngStart, STREETS.flinders.lngEnd, 12, true);

// North-south streets
addStreetSegments("Swanston St",   false, STREETS.swanston.lng,   STREETS.swanston.latStart,   STREETS.swanston.latEnd,   8, true);
addStreetSegments("Elizabeth St",  false, STREETS.elizabeth.lng,  STREETS.elizabeth.latStart,  STREETS.elizabeth.latEnd,  8, false);
addStreetSegments("William St",    false, STREETS.william.lng,    STREETS.william.latStart,    STREETS.william.latEnd,    8, false);
addStreetSegments("Queen St",      false, STREETS.queen.lng,      STREETS.queen.latStart,      STREETS.queen.latEnd,      8, false);
addStreetSegments("Russell St",    false, STREETS.russell.lng,    STREETS.russell.latStart,    STREETS.russell.latEnd,    8, false);
addStreetSegments("Exhibition St", false, STREETS.exhibition.lng, STREETS.exhibition.latStart, STREETS.exhibition.latEnd, 8, false);
addStreetSegments("Spring St",     false, STREETS.spring.lng,     STREETS.spring.latStart,     STREETS.spring.latEnd,     8, false);

const artifact: GraphArtifact = {
  meta: {
    baked_at: new Date().toISOString(),
    edge_count: edges.length,
    node_count: nodes.length,
    time_buckets: ["morning", "afternoon", "evening"],
  },
  nodes,
  edges,
};

const run = async () => {
  const outDir = join(process.cwd(), "data");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "graph.json");
  await writeFile(outPath, JSON.stringify(artifact), "utf-8");
  const sizeMb = (Buffer.byteLength(JSON.stringify(artifact)) / 1024 / 1024).toFixed(2);
  console.log(`Mock graph written to ${outPath}`);
  console.log(`  ${nodes.length} nodes, ${edges.length} edges`);
  console.log(`  Size: ${sizeMb} MB`);
};

run();
