import createGraph from "ngraph.graph";
import { aStar } from "ngraph.path";

import {
  computeScore,
  edgeCost,
  WEIGHTS_DEFAULT,
  WEIGHTS_LIVELY,
  WEIGHTS_ACCESSIBLE,
  ALPHA,
} from "./scoring";
import type { WeightProfile } from "./scoring";
import type { GraphEdge, GraphNode, Route, RouteKind } from "./types";

interface EdgeData {
  readonly edge: GraphEdge;
  readonly cost: number;
}

const buildRoutingGraph = (
  edges: readonly GraphEdge[],
  hourOfWeek: number,
  weights: WeightProfile,
  alpha: number,
) => {
  const graph = createGraph<unknown, EdgeData>();

  for (const edge of edges) {
    const score = computeScore(edge.metrics, hourOfWeek, weights);
    const cost = edgeCost(edge.length_m, score, alpha);
    graph.addLink(edge.fromNodeId, edge.toNodeId, { edge, cost });
    graph.addLink(edge.toNodeId, edge.fromNodeId, { edge, cost });
  }

  return graph;
};

// Key: "fromNodeId-toNodeId" (both directions stored)
type EdgeKey = `${number}-${number}`;
const edgeKey = (a: number, b: number): EdgeKey => `${a}-${b}`;

const buildEdgeMap = (edges: readonly GraphEdge[]): Map<EdgeKey, GraphEdge> => {
  const map = new Map<EdgeKey, GraphEdge>();
  for (const edge of edges) {
    map.set(edgeKey(edge.fromNodeId, edge.toNodeId), edge);
    map.set(edgeKey(edge.toNodeId, edge.fromNodeId), edge);
  }
  return map;
};

const findRoute = (
  nodeMap: Map<number, GraphNode>,
  edgeMap: Map<EdgeKey, GraphEdge>,
  edges: readonly GraphEdge[],
  fromId: number,
  toId: number,
  hourOfWeek: number,
  weights: WeightProfile,
  alpha: number,
): Omit<Route, "id" | "kind"> | null => {
  const graph = buildRoutingGraph(edges, hourOfWeek, weights, alpha);

  const pathFinder = aStar(graph, {
    distance: (_from, _to, link) => link.data.cost,
    heuristic: (from, to) => {
      const fromNode = nodeMap.get(Number(from.id));
      const toNode = nodeMap.get(Number(to.id));
      if (!fromNode || !toNode) return 0;
      const dLng = (toNode.lng - fromNode.lng) * 111320 * Math.cos((fromNode.lat * Math.PI) / 180);
      const dLat = (toNode.lat - fromNode.lat) * 110540;
      return Math.sqrt(dLng * dLng + dLat * dLat);
    },
  });

  let path: ReturnType<typeof pathFinder.find>;
  try {
    path = pathFinder.find(fromId, toId);
  } catch {
    return null;
  }
  if (!path || path.length < 2) return null;

  const pathNodeIds = path.map((p) => Number(p.id));
  const routeEdges: GraphEdge[] = [];
  const geometry: [number, number][] = [];
  let totalLength = 0;
  let totalScore = 0;

  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const edge = edgeMap.get(edgeKey(pathNodeIds[i], pathNodeIds[i + 1]));
    if (edge) {
      routeEdges.push(edge);
      totalLength += edge.length_m;
      totalScore += computeScore(edge.metrics, hourOfWeek, weights);
      for (const coord of edge.geometry) {
        geometry.push(coord as [number, number]);
      }
    }
  }

  const avgScore = routeEdges.length > 0 ? totalScore / routeEdges.length : 0;

  return { edges: routeEdges, geometry, score: avgScore, length_m: totalLength };
};

export const computeRoutes = (
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  fromId: number,
  toId: number,
  hourOfWeek: number,
): Route[] => {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = buildEdgeMap(edges);

  const strategies: Array<{ kind: RouteKind; id: number; weights: WeightProfile; alpha: number }> = [
    { kind: "lively",     id: 1, weights: WEIGHTS_LIVELY,     alpha: ALPHA },
    { kind: "accessible", id: 2, weights: WEIGHTS_ACCESSIBLE, alpha: ALPHA },
    { kind: "shortest",   id: 3, weights: WEIGHTS_DEFAULT,    alpha: 0 },
  ];

  const routes: Route[] = [];
  for (const { kind, id, weights, alpha } of strategies) {
    const result = findRoute(nodeMap, edgeMap, edges, fromId, toId, hourOfWeek, weights, alpha);
    if (result) routes.push({ ...result, id, kind });
  }

  return routes;
};
