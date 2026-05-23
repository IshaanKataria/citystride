import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphArtifact, Node, Edge, LngLat } from "../../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = join(__dirname, "..", "output", "graph.json");

const BBOX = {
  south: -37.8210,
  west: 144.9550,
  north: -37.8000,
  east: 144.9760,
};

const OVERPASS_QUERY = `
[out:json][timeout:30];
(
  way["highway"~"primary|secondary|tertiary|residential|living_street|pedestrian|footway|path|cycleway|service|unclassified"]
    (${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out body geom;
`.trim();

type OverpassPoint = { lat: number; lon: number };
type OverpassWay = {
  type: "way";
  id: number;
  geometry: OverpassPoint[];
  tags?: { name?: string; highway?: string; foot?: string; access?: string };
};

const HIGHWAY_CHARACTER: Record<string, "main" | "side" | "path"> = {
  primary: "main",
  secondary: "main",
  tertiary: "main",
  residential: "side",
  living_street: "side",
  service: "side",
  unclassified: "side",
  pedestrian: "path",
  footway: "path",
  path: "path",
  cycleway: "path",
};

function nodeId(lng: number, lat: number): string {
  return `n_${lng.toFixed(5)}_${lat.toFixed(5)}`;
}

function coordKey(lng: number, lat: number): string {
  return `${lng.toFixed(5)},${lat.toFixed(5)}`;
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

function polylineLength(pts: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += haversineMeters(pts[i - 1], pts[i]);
  }
  return total;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function metricsFromHash(id: string, character: "main" | "side" | "path") {
  const h1 = hashString(id + ":lux");
  const h2 = hashString(id + ":grad");
  const h3 = hashString(id + ":surf");
  const h4 = hashString(id + ":canopy");
  const h5 = hashString(id + ":bail");

  const baseline =
    character === "main" ? 0.65 : character === "path" ? 0.55 : 0.4;
  return {
    lux: Math.min(1, baseline + 0.3 * h1),
    gentle_gradient: 0.65 + 0.3 * h2,
    surface_quality: Math.min(1, baseline + 0.25 * h3),
    canopy:
      character === "path"
        ? 0.4 + 0.5 * h4
        : character === "main"
        ? 0.15 + 0.4 * h4
        : 0.25 + 0.5 * h4,
    bailout_proximity: Math.min(1, baseline + 0.3 * h5),
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

function buildTimeVectors(
  id: string,
  character: "main" | "side" | "path"
): { ped_count: number[]; open_venues: number[] } {
  const phase = hashString(id + ":phase") * 24;
  const personality = hashString(id + ":pers");
  const baselinePed =
    character === "main" ? 0.45 : character === "path" ? 0.3 : 0.15;
  const venueBoost =
    character === "main" ? 0.4 : character === "path" ? 0.25 : 0.2;

  const ped_count = new Array(168);
  const open_venues = new Array(168);

  for (let h = 0; h < 168; h++) {
    const dayFactor = dayHourFactor(h);
    const wobble = 0.1 * Math.sin(((h + phase) * Math.PI) / 12);
    ped_count[h] = Math.max(
      0,
      Math.min(
        1,
        baselinePed + dayFactor * 0.55 + wobble * (0.5 + personality * 0.5)
      )
    );
    const venueBase = venueOpenFactor(h);
    open_venues[h] = Math.max(0, Math.min(1, venueBase * (0.6 + venueBoost)));
  }
  return { ped_count, open_venues };
}

async function fetchWays(): Promise<OverpassWay[]> {
  console.log("Fetching Melbourne CBD ways from Overpass...");
  const body = "data=" + encodeURIComponent(OVERPASS_QUERY);
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "CityStride/0.1 (Claude Impact Lab Melbourne 2026)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { elements: OverpassWay[] };
  const ways = data.elements.filter((e) => e.type === "way" && e.geometry?.length >= 2);
  console.log(`Got ${ways.length} ways`);
  return ways;
}

function buildGraph(ways: OverpassWay[]): { nodes: Node[]; edges: Edge[] } {
  // Pass 1: count coordinate occurrences to find junctions
  const coordCount = new Map<string, number>();
  for (const way of ways) {
    const seen = new Set<string>();
    for (const pt of way.geometry) {
      const k = coordKey(pt.lon, pt.lat);
      if (!seen.has(k)) {
        seen.add(k);
        coordCount.set(k, (coordCount.get(k) ?? 0) + 1);
      }
    }
  }
  const isJunction = (lng: number, lat: number) => (coordCount.get(coordKey(lng, lat)) ?? 0) >= 2;

  // Pass 2: split each way at junctions
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];

  for (const way of ways) {
    const characterRaw = way.tags?.highway ?? "residential";
    const character = HIGHWAY_CHARACTER[characterRaw] ?? "side";
    const wayName = way.tags?.name ?? `${characterRaw} ${way.id}`;

    let buf: LngLat[] = [];
    let segIdx = 0;

    for (let i = 0; i < way.geometry.length; i++) {
      const pt = way.geometry[i];
      const xy: LngLat = [pt.lon, pt.lat];
      buf.push(xy);

      const isLast = i === way.geometry.length - 1;
      const isStart = i === 0;
      const junc = isJunction(pt.lon, pt.lat);

      if (buf.length >= 2 && !isStart && (junc || isLast)) {
        const a = buf[0];
        const b = buf[buf.length - 1];
        const aId = nodeId(a[0], a[1]);
        const bId = nodeId(b[0], b[1]);
        if (aId === bId) {
          buf = [xy];
          continue;
        }
        nodes.set(aId, { id: aId, position: a });
        nodes.set(bId, { id: bId, position: b });

        const edgeId = `e_${way.id}_${segIdx++}`;
        const metrics = metricsFromHash(edgeId, character);
        const timeVecs = buildTimeVectors(edgeId, character);
        const length_m = polylineLength(buf);

        edges.push({
          id: edgeId,
          from_node: aId,
          to_node: bId,
          geometry: buf.slice(),
          length_m,
          street_name: wayName,
          ...metrics,
          ...timeVecs,
          confidence: {
            ped_count: {
              distance_to_sensor_m: Math.round(50 + hashString(edgeId + ":conf") * 350),
            },
          },
        });

        buf = [xy];
      }
    }
  }

  return { nodes: [...nodes.values()], edges };
}

async function main() {
  const ways = await fetchWays();
  const { nodes, edges } = buildGraph(ways);

  const lngs = nodes.map((n) => n.position[0]);
  const lats = nodes.map((n) => n.position[1]);
  const artifact: GraphArtifact = {
    version: "0.2.0-osm",
    built_at: new Date().toISOString(),
    bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
    nodes,
    edges,
  };

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(artifact));

  // Mirror to web/public so the deployed app sees the same graph
  const PUBLIC_FILE = join(__dirname, "..", "..", "web", "public", "graph.json");
  await mkdir(dirname(PUBLIC_FILE), { recursive: true });
  await writeFile(PUBLIC_FILE, JSON.stringify(artifact));

  console.log(`Wrote ${nodes.length} nodes, ${edges.length} edges`);
  console.log(`bbox: ${artifact.bbox.join(", ")}`);
  console.log(`-> ${OUTPUT_FILE}`);
  console.log(`-> ${PUBLIC_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
