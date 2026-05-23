import createGraph, { type Graph } from "ngraph.graph";
import path from "ngraph.path";
import type { Edge, Node, Route, RouteSegment, GraphArtifact, LngLat } from "../../../shared/types";
import { composite, edgeCost } from "./scoring";

let cached: {
  graph: Graph<Node, Edge>;
  edgeById: Map<string, Edge>;
  segmentBetween: Map<string, Edge>;
  artifact: GraphArtifact;
} | null = null;

export function buildGraph(artifact: GraphArtifact) {
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

  cached = { graph, edgeById, segmentBetween, artifact };
  return cached;
}

export function nearestNodeTo(lng: number, lat: number): Node {
  if (!cached) throw new Error("graph not built yet");
  let best: Node = cached.artifact.nodes[0];
  let bestDist = Infinity;
  for (const node of cached.artifact.nodes) {
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

function findOne(
  fromNodeId: string,
  toNodeId: string,
  hour: number,
  penalties: Map<string, number>,
  routeId: number
): Route | null {
  if (!cached) return null;
  const pathFinder = path.aStar(cached.graph as any, {
    distance(_a: any, _b: any, link: any) {
      const edge = link.data as Edge;
      const penalty = penalties.get(edge.id) ?? 1;
      return edgeCost(edge, hour) * penalty;
    },
  });

  const nodePath = pathFinder.find(fromNodeId, toNodeId);
  if (!nodePath || nodePath.length < 2) return null;

  const segments: RouteSegment[] = [];
  let totalLength = 0;
  let scoreSum = 0;

  for (let i = nodePath.length - 1; i > 0; i--) {
    const a = nodePath[i].id as string;
    const b = nodePath[i - 1].id as string;
    const edge = cached.segmentBetween.get(`${a}|${b}`);
    if (!edge) continue;
    const score = composite(edge, hour);
    totalLength += edge.length_m;
    scoreSum += score * edge.length_m;
    segments.push({
      edge_id: edge.id,
      street_name: edge.street_name,
      geometry: (edge.from_node === a ? edge.geometry : [...edge.geometry].reverse()) as LngLat[],
      length_m: edge.length_m,
      score_at_time: score,
    });
  }

  if (segments.length === 0) return null;

  return {
    id: routeId,
    total_length_m: totalLength,
    avg_score: scoreSum / totalLength,
    segments,
  };
}

export function findThreeRoutes(from: LngLat, to: LngLat, hour: number): Route[] {
  if (!cached) return [];

  const fromNode = nearestNodeTo(from[0], from[1]);
  const toNode = nearestNodeTo(to[0], to[1]);

  const penalties = new Map<string, number>();
  const found: Route[] = [];

  for (let i = 0; i < 3; i++) {
    let route = findOne(fromNode.id, toNode.id, hour, penalties, i + 1);
    if (!route && i > 0) {
      const fallback = new Map<string, number>();
      for (const [id, p] of penalties) fallback.set(id, Math.min(p, 1.5));
      route = findOne(fromNode.id, toNode.id, hour, fallback, i + 1);
    }
    if (!route) break;
    found.push(route);
    for (const seg of route.segments) {
      const current = penalties.get(seg.edge_id) ?? 1;
      penalties.set(seg.edge_id, current * 4);
    }
  }

  if (found.length === 0) return [];

  const sorted = [...found].sort((a, b) => b.avg_score - a.avg_score);
  return sorted.map((r, idx) => ({ ...r, id: idx + 1 }));
}

export function describeSegment(edgeId: string, hour: number) {
  if (!cached) return null;
  const edge = cached.edgeById.get(edgeId);
  if (!edge) return null;
  const h = Math.max(0, Math.min(167, Math.floor(hour)));
  return {
    edge_id: edge.id,
    street_name: edge.street_name,
    composite_score: composite(edge, h),
    metrics: {
      lux: edge.lux,
      gentle_gradient: edge.gentle_gradient,
      surface_quality: edge.surface_quality,
      canopy: edge.canopy,
      bailout_proximity: edge.bailout_proximity,
      ped_count: edge.ped_count[h],
      open_venues: edge.open_venues[h],
    },
    confidence: edge.confidence,
  };
}
