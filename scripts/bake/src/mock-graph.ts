import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphArtifact, Node, Edge, LngLat } from "../../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = join(__dirname, "..", "output", "graph.json");

const HORIZONTAL_STREETS: Array<{ name: string; lat: number; character: "main" | "side" }> = [
  { name: "Flinders Street", lat: -37.8183, character: "main" },
  { name: "Collins Street", lat: -37.8160, character: "main" },
  { name: "Bourke Street", lat: -37.8141, character: "main" },
  { name: "Lonsdale Street", lat: -37.8118, character: "main" },
  { name: "La Trobe Street", lat: -37.8094, character: "main" },
  { name: "Victoria Street", lat: -37.8068, character: "side" },
  { name: "Carlton Street", lat: -37.8054, character: "side" },
];

const VERTICAL_STREETS: Array<{ name: string; lng: number; character: "main" | "side" }> = [
  { name: "Elizabeth Street", lng: 144.9648, character: "main" },
  { name: "Swanston Street", lng: 144.9670, character: "main" },
  { name: "Russell Street", lng: 144.9698, character: "main" },
  { name: "Exhibition Street", lng: 144.9712, character: "side" },
  { name: "Spring Street", lng: 144.9728, character: "side" },
  { name: "Nicholson Street", lng: 144.9740, character: "side" },
];

function nodeId(lng: number, lat: number): string {
  return `n_${lng.toFixed(5)}_${lat.toFixed(5)}`;
}

function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function metricsFromHash(id: string, character: "main" | "side") {
  const h1 = hashString(id + ":lux");
  const h2 = hashString(id + ":grad");
  const h3 = hashString(id + ":surf");
  const h4 = hashString(id + ":canopy");
  const h5 = hashString(id + ":bail");

  const baseline = character === "main" ? 0.6 : 0.4;
  return {
    lux: Math.min(1, baseline + 0.3 * h1),
    gentle_gradient: 0.6 + 0.4 * h2,
    surface_quality: baseline + 0.3 * h3,
    canopy: character === "main" ? 0.2 + 0.4 * h4 : 0.3 + 0.5 * h4,
    bailout_proximity: baseline + 0.3 * h5,
  };
}

function dayHourFactor(h: number): number {
  const day = Math.floor(h / 24);
  const hour = h % 24;
  let f = 0.25;
  if (hour >= 9 && hour <= 17 && day < 5) f += 0.4;
  if (hour >= 11 && hour <= 14 && day < 5) f += 0.1;
  if (hour >= 18 && hour <= 23 && (day === 4 || day === 5)) f += 0.55;
  if (hour >= 18 && hour <= 22 && day < 4) f += 0.2;
  if (hour >= 0 && hour <= 5) f -= 0.15;
  if (day === 6 && hour >= 10 && hour <= 18) f += 0.2;
  return Math.max(0, Math.min(1, f));
}

function venueOpenFactor(h: number): number {
  const day = Math.floor(h / 24);
  const hour = h % 24;
  if (day === 4 || day === 5) {
    if (hour >= 10 && hour <= 23) return 0.9;
    if (hour >= 0 && hour <= 1) return 0.7;
    return 0.05;
  }
  if (day === 6) {
    if (hour >= 10 && hour <= 21) return 0.7;
    return 0.05;
  }
  if (hour >= 9 && hour <= 22) return 0.65;
  return 0.05;
}

function buildTimeVectors(id: string, character: "main" | "side"): {
  ped_count: number[];
  open_venues: number[];
} {
  const phase = hashString(id + ":phase") * 24;
  const personality = hashString(id + ":pers");
  const baselinePed = character === "main" ? 0.4 : 0.15;

  const ped_count = new Array(168);
  const open_venues = new Array(168);

  for (let h = 0; h < 168; h++) {
    const dayFactor = dayHourFactor(h);
    const wobble = 0.1 * Math.sin(((h + phase) * Math.PI) / 12);
    ped_count[h] = Math.max(
      0,
      Math.min(1, baselinePed + dayFactor * 0.55 + wobble * (0.5 + personality * 0.5))
    );
    const venueBase = venueOpenFactor(h);
    open_venues[h] = Math.max(0, Math.min(1, venueBase * (0.6 + (character === "main" ? 0.4 : 0.2))));
  }
  return { ped_count, open_venues };
}

function main() {
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const segmentMap = new Map<string, Edge>();

  for (const street of HORIZONTAL_STREETS) {
    const sortedX = [...VERTICAL_STREETS].sort((a, b) => a.lng - b.lng);
    for (let i = 0; i < sortedX.length - 1; i++) {
      const a: LngLat = [sortedX[i].lng, street.lat];
      const b: LngLat = [sortedX[i + 1].lng, street.lat];
      const aId = nodeId(a[0], a[1]);
      const bId = nodeId(b[0], b[1]);
      nodes.set(aId, { id: aId, position: a });
      nodes.set(bId, { id: bId, position: b });

      const edgeId = `e_${street.name.replace(/\s+/g, "_")}_${i}`;
      const metrics = metricsFromHash(edgeId, street.character);
      const timeVecs = buildTimeVectors(edgeId, street.character);

      const edge: Edge = {
        id: edgeId,
        from_node: aId,
        to_node: bId,
        geometry: [a, b],
        length_m: haversineMeters(a, b),
        street_name: street.name,
        ...metrics,
        ...timeVecs,
        confidence: { ped_count: { distance_to_sensor_m: Math.round(50 + hashString(edgeId + ":conf") * 350) } },
      };
      edges.push(edge);
      segmentMap.set(`${aId}|${bId}`, edge);
    }
  }

  for (const street of VERTICAL_STREETS) {
    const sortedY = [...HORIZONTAL_STREETS].sort((a, b) => a.lat - b.lat);
    for (let i = 0; i < sortedY.length - 1; i++) {
      const a: LngLat = [street.lng, sortedY[i].lat];
      const b: LngLat = [street.lng, sortedY[i + 1].lat];
      const aId = nodeId(a[0], a[1]);
      const bId = nodeId(b[0], b[1]);
      nodes.set(aId, { id: aId, position: a });
      nodes.set(bId, { id: bId, position: b });

      const edgeId = `e_${street.name.replace(/\s+/g, "_")}_${i}`;
      const metrics = metricsFromHash(edgeId, street.character);
      const timeVecs = buildTimeVectors(edgeId, street.character);

      const edge: Edge = {
        id: edgeId,
        from_node: aId,
        to_node: bId,
        geometry: [a, b],
        length_m: haversineMeters(a, b),
        street_name: street.name,
        ...metrics,
        ...timeVecs,
        confidence: { ped_count: { distance_to_sensor_m: Math.round(50 + hashString(edgeId + ":conf") * 350) } },
      };
      edges.push(edge);
      segmentMap.set(`${aId}|${bId}`, edge);
    }
  }

  const allLngs = [...nodes.values()].map((n) => n.position[0]);
  const allLats = [...nodes.values()].map((n) => n.position[1]);
  const bbox: [number, number, number, number] = [
    Math.min(...allLngs),
    Math.min(...allLats),
    Math.max(...allLngs),
    Math.max(...allLats),
  ];

  const artifact: GraphArtifact = {
    version: "0.1.0-mock",
    built_at: new Date().toISOString(),
    bbox,
    nodes: [...nodes.values()],
    edges,
  };

  return artifact;
}

async function run() {
  const artifact = main();
  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(artifact));
  console.log(`Mock graph: ${artifact.nodes.length} nodes, ${artifact.edges.length} edges`);
  console.log(`bbox: ${artifact.bbox.join(", ")}`);
  console.log(`-> ${OUTPUT_FILE}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
