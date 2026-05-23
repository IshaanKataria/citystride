import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createGraph, { type Graph } from "ngraph.graph";
import type { GraphArtifact, Edge, Node, LngLat } from "../../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try teammate's real data first, then fall back to my mock
const CANDIDATE_PATHS = [
  process.env.GRAPH_FILE,
  join(__dirname, "..", "..", "data", "graph.json"),
  join(__dirname, "..", "..", "bake", "output", "graph.json"),
].filter(Boolean) as string[];

let cached: {
  artifact: GraphArtifact;
  graph: Graph<Node, Edge>;
  edgeById: Map<string, Edge>;
  segmentBetween: Map<string, Edge>;
  loadedFrom: string;
} | null = null;

function adaptIfTeammateFormat(raw: any): GraphArtifact {
  // My format: nodes[0].position = [lng,lat], edges[0].from_node, flat metrics
  // Teammate format: nodes[0].lng/lat, edges[0].fromNodeId, edges[0].metrics.{lux,ped_vector,...}
  if (raw.nodes?.[0]?.position) return raw;
  if (!raw.nodes?.[0]?.lng || !raw.edges?.[0]?.fromNodeId) {
    throw new Error("graph: unrecognized format");
  }

  const lngs = raw.nodes.map((n: any) => n.lng);
  const lats = raw.nodes.map((n: any) => n.lat);
  const bbox: [number, number, number, number] = [
    Math.min(...lngs), Math.min(...lats),
    Math.max(...lngs), Math.max(...lats),
  ];

  const fillVector = (v: any) =>
    Array.isArray(v) && v.length === 168 ? v : new Array(168).fill(0.4);

  return {
    version: raw.meta?.baked_at ?? "teammate-bake",
    built_at: raw.meta?.baked_at ?? new Date().toISOString(),
    bbox,
    nodes: raw.nodes.map((n: any) => ({
      id: String(n.id),
      position: [n.lng, n.lat] as LngLat,
    })),
    edges: raw.edges.map((e: any) => {
      const m = e.metrics ?? {};
      return {
        id: String(e.id),
        from_node: String(e.fromNodeId),
        to_node: String(e.toNodeId),
        geometry: e.geometry as LngLat[],
        length_m: e.length_m ?? 50,
        street_name: e.name ?? "Unnamed",
        lux: typeof m.lux === "number" ? m.lux : 0.5,
        gentle_gradient: typeof m.steepness === "number" ? m.steepness : 0.5,
        surface_quality: typeof m.surface === "number" ? m.surface : 0.5,
        canopy: typeof m.canopy === "number" ? m.canopy : 0.5,
        bailout_proximity: typeof m.transit === "number" ? m.transit : 0.5,
        ped_count: fillVector(m.ped_vector),
        open_venues: fillVector(m.venues_vector),
        confidence: {
          ped_count: {
            distance_to_sensor_m: typeof m.ped_confidence === "number"
              ? Math.round((1 - m.ped_confidence) * 500)
              : 200,
          },
        },
      };
    }),
  };
}

function validate(artifact: GraphArtifact, path: string) {
  if (!Array.isArray(artifact.nodes) || artifact.nodes.length === 0) {
    throw new Error(`graph ${path}: empty nodes`);
  }
  if (!Array.isArray(artifact.edges) || artifact.edges.length === 0) {
    throw new Error(`graph ${path}: empty edges`);
  }
  const sample = artifact.edges[0];
  if (!Array.isArray(sample.ped_count) || sample.ped_count.length !== 168) {
    throw new Error(`graph ${path}: ped_count must be 168-length array`);
  }
}

export async function loadGraph() {
  if (cached) return cached;

  let chosenPath: string | null = null;
  for (const p of CANDIDATE_PATHS) {
    if (existsSync(p)) {
      chosenPath = p;
      break;
    }
  }
  if (!chosenPath) {
    throw new Error(`graph: no file found at any of ${CANDIDATE_PATHS.join(", ")}`);
  }

  const raw = JSON.parse(await readFile(chosenPath, "utf-8"));
  const artifact = adaptIfTeammateFormat(raw);
  validate(artifact, chosenPath);

  const graph = createGraph<Node, Edge>();
  for (const node of artifact.nodes) graph.addNode(node.id, node);

  const edgeById = new Map<string, Edge>();
  const segmentBetween = new Map<string, Edge>();
  for (const edge of artifact.edges) {
    graph.addLink(edge.from_node, edge.to_node, edge);
    edgeById.set(edge.id, edge);
    segmentBetween.set(`${edge.from_node}|${edge.to_node}`, edge);
    segmentBetween.set(`${edge.to_node}|${edge.from_node}`, edge);
  }

  cached = { artifact, graph, edgeById, segmentBetween, loadedFrom: chosenPath };
  console.log(`Loaded graph from ${chosenPath}: ${artifact.nodes.length} nodes, ${artifact.edges.length} edges`);
  return cached;
}

export async function getArtifact(): Promise<GraphArtifact> {
  return (await loadGraph()).artifact;
}

export async function getEdgeById(id: string): Promise<Edge | undefined> {
  return (await loadGraph()).edgeById.get(id);
}

export async function getSegmentBetween(fromId: string, toId: string): Promise<Edge | undefined> {
  return (await loadGraph()).segmentBetween.get(`${fromId}|${toId}`);
}

export async function nearestNodeTo(lng: number, lat: number): Promise<Node> {
  const { artifact } = await loadGraph();
  let best: Node = artifact.nodes[0];
  let bestDist = Infinity;
  for (const node of artifact.nodes) {
    const dx = node.position[0] - lng;
    const dy = node.position[1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}
