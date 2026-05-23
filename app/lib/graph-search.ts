import type { GraphEdge, GraphNode } from "./types";

const haversineDistSq = (lng1: number, lat1: number, lng2: number, lat2: number): number => {
  const dLng = lng2 - lng1;
  const dLat = lat2 - lat1;
  return dLng * dLng + dLat * dLat;
};

export const findNearestNode = (
  nodes: readonly GraphNode[],
  lng: number,
  lat: number,
): GraphNode => {
  let nearest = nodes[0];
  let minDist = haversineDistSq(lng, lat, nearest.lng, nearest.lat);

  for (let i = 1; i < nodes.length; i++) {
    const dist = haversineDistSq(lng, lat, nodes[i].lng, nodes[i].lat);
    if (dist < minDist) {
      minDist = dist;
      nearest = nodes[i];
    }
  }

  return nearest;
};

interface Bounds {
  readonly minLng: number;
  readonly maxLng: number;
  readonly minLat: number;
  readonly maxLat: number;
}

export const getEdgesInBounds = (
  edges: readonly GraphEdge[],
  bounds: Bounds,
): readonly GraphEdge[] => {
  return edges.filter((edge) =>
    edge.geometry.some(
      ([lng, lat]) =>
        lng >= bounds.minLng &&
        lng <= bounds.maxLng &&
        lat >= bounds.minLat &&
        lat <= bounds.maxLat,
    ),
  );
};
