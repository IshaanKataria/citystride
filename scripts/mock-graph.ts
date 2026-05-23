import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { GraphArtifact, GraphNode, GraphEdge, AddressRecord } from "../app/lib/types";

// Melbourne CBD street grid — approximate coordinates
const STREETS = {
  bourke: { lat: -37.8136, lngStart: 144.955, lngEnd: 144.975 },
  collins: { lat: -37.8162, lngStart: 144.955, lngEnd: 144.975 },
  lonsdale: { lat: -37.8112, lngStart: 144.955, lngEnd: 144.975 },
  latrobe: { lat: -37.8090, lngStart: 144.955, lngEnd: 144.975 },
  flinders: { lat: -37.8183, lngStart: 144.955, lngEnd: 144.975 },
  swanston: { lng: 144.9631, latStart: -37.820, latEnd: -37.807 },
  elizabeth: { lng: 144.9608, latStart: -37.820, latEnd: -37.807 },
  william: { lng: 144.9563, latStart: -37.820, latEnd: -37.807 },
  queen: { lng: 144.9585, latStart: -37.820, latEnd: -37.807 },
  russell: { lng: 144.9690, latStart: -37.820, latEnd: -37.807 },
  exhibition: { lng: 144.9715, latStart: -37.820, latEnd: -37.807 },
  spring: { lng: 144.9740, latStart: -37.820, latEnd: -37.807 },
} as const;

const nodes: GraphNode[] = [];
const edges: GraphEdge[] = [];
const nodeMap = new Map<string, string>();

const coordKey = (lng: number, lat: number) =>
  `${lng.toFixed(5)},${lat.toFixed(5)}`;

const getOrCreateNode = (lng: number, lat: number): string => {
  const key = coordKey(lng, lat);
  if (nodeMap.has(key)) { return nodeMap.get(key)!; }
  const id = `n_${nodes.length}`;
  nodes.push({ id, lng, lat });
  nodeMap.set(key, id);
  return id;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const makeMetrics = (isMainStreet: boolean) => {
  const baseLux = isMainStreet ? rand(0.6, 1.0) : rand(0.1, 0.5);
  const baseCanopy = rand(0.2, 0.8);
  const baseSurface = isMainStreet ? rand(0.6, 0.95) : rand(0.3, 0.7);
  const baseBailout = isMainStreet ? rand(0.6, 1.0) : rand(0.1, 0.5);
  const baseGradient = rand(0.5, 0.95);

  // Time-varying: pedestrian counts peak during business hours and Fri/Sat nights
  const pedCount = Array.from({ length: 168 }, (_, h) => {
    const dayOfWeek = Math.floor(h / 24);
    const hour = h % 24;
    const isWeekday = dayOfWeek < 5;
    const isWeekend = !isWeekday;

    let base = isMainStreet ? 0.3 : 0.05;

    // Business hours bump
    if (isWeekday && hour >= 8 && hour <= 18) {
      base += isMainStreet ? 0.5 : 0.15;
    }
    // Lunch peak
    if (isWeekday && hour >= 12 && hour <= 13) {
      base += isMainStreet ? 0.2 : 0.05;
    }
    // Friday/Saturday night
    if ((dayOfWeek === 4 || dayOfWeek === 5) && hour >= 19 && hour <= 23) {
      base += isMainStreet ? 0.4 : 0.1;
    }
    // Weekend daytime
    if (isWeekend && hour >= 10 && hour <= 16) {
      base += isMainStreet ? 0.3 : 0.1;
    }
    // Late night dip
    if (hour >= 1 && hour <= 5) {
      base *= 0.2;
    }

    return Math.min(1, base + rand(-0.05, 0.05));
  });

  // Venues: more open during business hours and evenings
  const openVenues = Array.from({ length: 168 }, (_, h) => {
    const hour = h % 24;
    if (hour >= 7 && hour <= 22) {
      return isMainStreet ? rand(0.5, 0.9) : rand(0.1, 0.4);
    }
    return isMainStreet ? rand(0.05, 0.2) : rand(0, 0.1);
  });

  return {
    metrics: {
      lux: baseLux,
      gentle_gradient: baseGradient,
      surface_quality: baseSurface,
      canopy: baseCanopy,
      bailout_proximity: baseBailout,
      ped_count: pedCount,
      open_venues: openVenues,
    },
    confidence: {
      ped_count: { distance_to_sensor_m: Math.round(rand(10, 300)) },
    },
  };
};

let edgeCounter = 0;

const addStreetSegments = (
  name: string,
  isHorizontal: boolean,
  fixedCoord: number,
  start: number,
  end: number,
  segments: number,
  isMainStreet: boolean,
) => {
  const step = (end - start) / segments;

  for (let i = 0; i < segments; i++) {
    const v1 = start + i * step;
    const v2 = start + (i + 1) * step;

    const [lng1, lat1] = isHorizontal ? [v1, fixedCoord] : [fixedCoord, v1];
    const [lng2, lat2] = isHorizontal ? [v2, fixedCoord] : [fixedCoord, v2];

    const fromId = getOrCreateNode(lng1, lat1);
    const toId = getOrCreateNode(lng2, lat2);

    const { metrics, confidence } = makeMetrics(isMainStreet);

    const dLng = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
    const dLat = (lat2 - lat1) * 110540;
    const length = Math.round(Math.sqrt(dLng * dLng + dLat * dLat));

    edges.push({
      id: `e_${edgeCounter++}`,
      from: fromId,
      to: toId,
      geometry: [[lng1, lat1], [lng2, lat2]],
      length_m: length,
      street_name: name,
      metrics,
      confidence,
    });
  }
};

// East-west streets
const MAIN_EW = ["Bourke St", "Collins St", "Flinders St"];
addStreetSegments("Bourke St", true, STREETS.bourke.lat, STREETS.bourke.lngStart, STREETS.bourke.lngEnd, 12, true);
addStreetSegments("Collins St", true, STREETS.collins.lat, STREETS.collins.lngStart, STREETS.collins.lngEnd, 12, true);
addStreetSegments("Lonsdale St", true, STREETS.lonsdale.lat, STREETS.lonsdale.lngStart, STREETS.lonsdale.lngEnd, 12, false);
addStreetSegments("La Trobe St", true, STREETS.latrobe.lat, STREETS.latrobe.lngStart, STREETS.latrobe.lngEnd, 12, false);
addStreetSegments("Flinders St", true, STREETS.flinders.lat, STREETS.flinders.lngStart, STREETS.flinders.lngEnd, 12, true);

// North-south streets
addStreetSegments("Swanston St", false, STREETS.swanston.lng, STREETS.swanston.latStart, STREETS.swanston.latEnd, 8, true);
addStreetSegments("Elizabeth St", false, STREETS.elizabeth.lng, STREETS.elizabeth.latStart, STREETS.elizabeth.latEnd, 8, false);
addStreetSegments("William St", false, STREETS.william.lng, STREETS.william.latStart, STREETS.william.latEnd, 8, false);
addStreetSegments("Queen St", false, STREETS.queen.lng, STREETS.queen.latStart, STREETS.queen.latEnd, 8, false);
addStreetSegments("Russell St", false, STREETS.russell.lng, STREETS.russell.latStart, STREETS.russell.latEnd, 8, false);
addStreetSegments("Exhibition St", false, STREETS.exhibition.lng, STREETS.exhibition.latStart, STREETS.exhibition.latEnd, 8, false);
addStreetSegments("Spring St", false, STREETS.spring.lng, STREETS.spring.latStart, STREETS.spring.latEnd, 8, false);

// Addresses
const addresses: AddressRecord[] = [
  { address: "123 Bourke Street", lng: 144.963, lat: -37.8136, nearestNodeId: "" },
  { address: "200 Bourke Street", lng: 144.965, lat: -37.8136, nearestNodeId: "" },
  { address: "350 Bourke Street", lng: 144.968, lat: -37.8136, nearestNodeId: "" },
  { address: "100 Collins Street", lng: 144.962, lat: -37.8162, nearestNodeId: "" },
  { address: "250 Collins Street", lng: 144.966, lat: -37.8162, nearestNodeId: "" },
  { address: "1 Flinders Street", lng: 144.956, lat: -37.8183, nearestNodeId: "" },
  { address: "Flinders Street Station", lng: 144.9668, lat: -37.8183, nearestNodeId: "" },
  { address: "1 Swanston Street", lng: 144.9631, lat: -37.819, nearestNodeId: "" },
  { address: "200 Swanston Street", lng: 144.9631, lat: -37.814, nearestNodeId: "" },
  { address: "Carlton Gardens", lng: 144.9715, lat: -37.8070, nearestNodeId: "" },
  { address: "Melbourne Central", lng: 144.9631, lat: -37.8100, nearestNodeId: "" },
  { address: "Federation Square", lng: 144.9690, lat: -37.8180, nearestNodeId: "" },
  { address: "State Library", lng: 144.9631, lat: -37.8098, nearestNodeId: "" },
  { address: "Parliament Station", lng: 144.9740, lat: -37.8112, nearestNodeId: "" },
  { address: "Queen Victoria Market", lng: 144.9563, lat: -37.8075, nearestNodeId: "" },
  { address: "50 Lonsdale Street", lng: 144.958, lat: -37.8112, nearestNodeId: "" },
  { address: "150 La Trobe Street", lng: 144.961, lat: -37.8090, nearestNodeId: "" },
  { address: "300 Elizabeth Street", lng: 144.9608, lat: -37.812, nearestNodeId: "" },
  { address: "100 William Street", lng: 144.9563, lat: -37.815, nearestNodeId: "" },
  { address: "80 Spring Street", lng: 144.9740, lat: -37.814, nearestNodeId: "" },
];

// Snap addresses to nearest node
for (const addr of addresses) {
  let nearest = nodes[0];
  let minDist = Infinity;
  for (const node of nodes) {
    const d = (node.lng - addr.lng) ** 2 + (node.lat - addr.lat) ** 2;
    if (d < minDist) {
      minDist = d;
      nearest = node;
    }
  }
  (addr as any).nearestNodeId = nearest.id;
}

const lngs = nodes.map((n) => n.lng);
const lats = nodes.map((n) => n.lat);

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

const run = async () => {
  const outDir = join(process.cwd(), "data");
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, "graph.json");
  await writeFile(path, JSON.stringify(artifact), "utf-8");
  const sizeMb = (Buffer.byteLength(JSON.stringify(artifact)) / 1024 / 1024).toFixed(2);
  console.log(`Mock graph written to ${path}`);
  console.log(`  ${nodes.length} nodes, ${edges.length} edges, ${addresses.length} addresses`);
  console.log(`  Size: ${sizeMb} MB`);
};

run();
