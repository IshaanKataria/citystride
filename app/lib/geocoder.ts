import type { GraphEdge } from "./types";

interface Geocoder {
  readonly search: (query: string, limit?: number) => readonly GraphEdge[];
}

export const createStreetGeocoder = (edges: readonly GraphEdge[]): Geocoder => {
  const seen = new Set<string>();
  const uniqueEdges: GraphEdge[] = [];
  for (const edge of edges) {
    if (!edge.name || seen.has(edge.name)) continue;
    seen.add(edge.name);
    uniqueEdges.push(edge);
  }

  const normalized = uniqueEdges.map((e) => ({
    edge: e,
    lower: e.name.toLowerCase(),
  }));

  const search = (query: string, limit: number = 5): readonly GraphEdge[] => {
    const q = query.toLowerCase().trim();
    if (q.length === 0) return [];

    const scored: { edge: GraphEdge; score: number }[] = [];
    for (const { edge, lower } of normalized) {
      if (lower === q) {
        scored.push({ edge, score: 3 });
      } else if (lower.startsWith(q)) {
        scored.push({ edge, score: 2 });
      } else if (lower.includes(q)) {
        scored.push({ edge, score: 1 });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.edge);
  };

  return { search };
};
