import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createGraph, { type Graph } from "ngraph.graph";
import type { GraphArtifact, Edge, Node, LngLat } from "../../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAPH_FILE = process.env.GRAPH_FILE ?? join(__dirname, "..", "..", "bake", "output", "graph.json");

let cached: {
  artifact: GraphArtifact;
  graph: Graph<Node, Edge>;
  edgeById: Map<string, Edge>;
  segmentBetween: Map<string, Edge>;
} | null = null;

function validate(artifact: any): asserts artifact is GraphArtifact {
  if (!artifact || typeof artifact !== "object") throw new Error("graph: not an object");
  if (!artifact.version) throw new Error("graph: missing version");
  if (!Array.isArray(artifact.nodes) || artifact.nodes.length === 0) throw new Error("graph: empty nodes");
  if (!Array.isArray(artifact.edges) || artifact.edges.length === 0) throw new Error("graph: empty edges");
  const sample = artifact.edges[0];
  for (const field of ["id", "from_node", "to_node", "geometry", "length_m", "lux", "ped_count", "open_venues"]) {
    if (!(field in sample)) throw new Error(`graph: sample edge missing field "${field}"`);
  }
  if (!Array.isArray(sample.ped_count) || sample.ped_count.length !== 168) {
    throw new Error(`graph: ped_count must be 168-length array, got ${sample.ped_count?.length}`);
  }
}

export async function loadGraph() {
  if (cached) return cached;
  const raw = await readFile(GRAPH_FILE, "utf-8");
  const artifact = JSON.parse(raw);
  validate(artifact);

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

  cached = { artifact, graph, edgeById, segmentBetween };
  console.log(`Loaded graph: ${artifact.nodes.length} nodes, ${artifact.edges.length} edges (v${artifact.version})`);
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
