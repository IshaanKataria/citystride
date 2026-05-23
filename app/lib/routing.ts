import createGraph from "ngraph.graph";
import { aStar } from "ngraph.path";

import { computeScore, edgeCost } from "./scoring";
import type { GraphEdge, GraphNode, Route } from "./types";

const EDGE_PENALTY = 5.0;

interface EdgeData {
  readonly edge: GraphEdge;
  readonly cost: number;
}

export const buildRoutingGraph = (
  edges: readonly GraphEdge[],
  hourOfWeek: number,
  penalizedEdgeIds?: ReadonlySet<string>,
) => {
  const graph = createGraph<unknown, EdgeData>();

  for (const edge of edges) {
    const score = computeScore(edge.metrics, hourOfWeek);
    let cost = edgeCost(edge.length_m, score);

    if (penalizedEdgeIds?.has(edge.id)) {
      cost *= EDGE_PENALTY;
    }

    graph.addLink(edge.fromNodeId, edge.toNodeId, { edge, cost });
    graph.addLink(edge.toNodeId, edge.fromNodeId, { edge, cost });
  }

  return graph;
};

const findRoute = (
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  fromId: number,
  toId: number,
  hourOfWeek: number,
  penalizedEdgeIds?: ReadonlySet<string>,
): Route | null => {
  const graph = buildRoutingGraph(edges, hourOfWeek, penalizedEdgeIds);

  const pathFinder = aStar(graph, {
    distance: (_from, _to, link) => link.data.cost,
    heuristic: (from, to) => {
      const fromNode = nodes.find((n) => n.id === from.id);
      const toNode = nodes.find((n) => n.id === to.id);
      if (!fromNode || !toNode) { return 0; }
      const dLng = (toNode.lng - fromNode.lng) * 111320 * Math.cos((fromNode.lat * Math.PI) / 180);
      const dLat = (toNode.lat - fromNode.lat) * 110540;
      return Math.sqrt(dLng * dLng + dLat * dLat);
    },
  });

  const path = pathFinder.find(fromId, toId);
  if (!path || path.length < 2) { return null; }

  const pathNodeIds = path.map((p) => Number(p.id));
  const routeEdges: GraphEdge[] = [];
  const geometry: [number, number][] = [];
  let totalLength = 0;
  let totalScore = 0;

  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const a = pathNodeIds[i];
    const b = pathNodeIds[i + 1];
    const edge = edges.find(
      (e) => (e.fromNodeId === a && e.toNodeId === b) || (e.fromNodeId === b && e.toNodeId === a),
    );
    if (edge) {
      routeEdges.push(edge);
      totalLength += edge.length_m;
      totalScore += computeScore(edge.metrics, hourOfWeek);
      for (const coord of edge.geometry) {
        geometry.push(coord as [number, number]);
      }
    }
  }

  const avgScore = routeEdges.length > 0 ? totalScore / routeEdges.length : 0;

  return {
    id: 0,
    edges: routeEdges,
    geometry,
    score: avgScore,
    length_m: totalLength,
  };
};

export const computeRoutes = (
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  fromId: number,
  toId: number,
  hourOfWeek: number,
): Route[] => {
  const route1 = findRoute(nodes, edges, fromId, toId, hourOfWeek);
  if (!route1) { return []; }

  const route1EdgeIds = new Set(route1.edges.map((e) => e.id));
  const route2 = findRoute(nodes, edges, fromId, toId, hourOfWeek, route1EdgeIds);

  const route12EdgeIds = new Set([
    ...route1EdgeIds,
    ...(route2?.edges.map((e) => e.id) ?? []),
  ]);
  const route3 = findRoute(nodes, edges, fromId, toId, hourOfWeek, route12EdgeIds);

  const routes = [route1, route2, route3]
    .filter((r): r is Route => r !== null)
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, id: i + 1 }));

  return routes;
};
