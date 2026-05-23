import path from "ngraph.path";
import type { Edge, Route, RouteSegment } from "../../shared/types.ts";
import { loadGraph, getSegmentBetween } from "./graph-loader.ts";
import { composite, edgeCost } from "./scoring.ts";

export async function findRoute(
  fromNodeId: string,
  toNodeId: string,
  hour: number,
  penalties: Map<string, number> = new Map(),
  routeId: number = 1
): Promise<Route | null> {
  const { graph } = await loadGraph();
  const pathFinder = path.aStar(graph as any, {
    distance(_fromNode: any, _toNode: any, link: any) {
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

  // ngraph returns nodes in reverse order (target -> source). Iterate accordingly.
  for (let i = nodePath.length - 1; i > 0; i--) {
    const a = nodePath[i].id as string;
    const b = nodePath[i - 1].id as string;
    const edge = await getSegmentBetween(a, b);
    if (!edge) continue;
    const score = composite(edge, hour);
    totalLength += edge.length_m;
    scoreSum += score * edge.length_m;
    segments.push({
      edge_id: edge.id,
      street_name: edge.street_name,
      geometry: edge.from_node === a ? edge.geometry : [...edge.geometry].reverse(),
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

export async function findThreeRoutes(
  fromNodeId: string,
  toNodeId: string,
  hour: number
): Promise<Route[]> {
  const penalties = new Map<string, number>();
  const found: Route[] = [];

  for (let i = 0; i < 3; i++) {
    let route = await findRoute(fromNodeId, toNodeId, hour, penalties, i + 1);
    if (!route && i > 0) {
      const fallback = new Map<string, number>();
      for (const [id, p] of penalties) fallback.set(id, Math.min(p, 1.5));
      route = await findRoute(fromNodeId, toNodeId, hour, fallback, i + 1);
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
