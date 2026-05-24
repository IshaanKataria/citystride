import { describe, it, expect } from "vitest";
import { computeRoutes } from "./routing";
import type { GraphNode, GraphEdge } from "./types";

// Minimal graph: 4 nodes in an L-shape
//   0 --- 1
//         |
//         2 --- 3
const nodes: GraphNode[] = [
  { id: 0, lng: 144.960, lat: -37.816 },
  { id: 1, lng: 144.965, lat: -37.816 },
  { id: 2, lng: 144.965, lat: -37.820 },
  { id: 3, lng: 144.970, lat: -37.820 },
];

const makeEdge = (id: string, from: number, to: number, overrides: Partial<import("./types").EdgeMetrics> = {}): GraphEdge => ({
  id,
  fromNodeId: from,
  toNodeId: to,
  wayId: 1,
  geometry: [[nodes[from].lng, nodes[from].lat], [nodes[to].lng, nodes[to].lat]],
  length_m: 500,
  name: `edge-${id}`,
  highwayType: "footway",
  metrics: {
    lux: 0.5,
    steepness: 0.5,
    surface: 0.5,
    transit: 0.5,
    canopy: 0.5,
    ped_vector: [0.5, 0.5, 0.5],
    venues_vector: [0.5, 0.5, 0.5],
    ped_confidence: { nearest_sensor_m: null, sensor_count: 0, is_interpolated: false },
    ...overrides,
  },
});

const edges: GraphEdge[] = [
  makeEdge("e01", 0, 1),
  makeEdge("e12", 1, 2),
  makeEdge("e23", 2, 3),
];

describe("computeRoutes", () => {
  it("returns exactly 3 routes", () => {
    const routes = computeRoutes(nodes, edges, 0, 3, 0);
    expect(routes).toHaveLength(3);
  });

  it("assigns correct kinds", () => {
    const routes = computeRoutes(nodes, edges, 0, 3, 0);
    const kinds = routes.map((r) => r.kind);
    expect(kinds).toContain("lively");
    expect(kinds).toContain("accessible");
    expect(kinds).toContain("shortest");
  });

  it("assigns fixed ids: lively=1, accessible=2, shortest=3", () => {
    const routes = computeRoutes(nodes, edges, 0, 3, 0);
    const byKind = Object.fromEntries(routes.map((r) => [r.kind, r.id]));
    expect(byKind["lively"]).toBe(1);
    expect(byKind["accessible"]).toBe(2);
    expect(byKind["shortest"]).toBe(3);
  });

  it("shortest route has correct length", () => {
    const routes = computeRoutes(nodes, edges, 0, 3, 0);
    const shortest = routes.find((r) => r.kind === "shortest")!;
    // 3 edges × 500m each
    expect(shortest.length_m).toBe(1500);
  });

  it("returns empty array when no path exists", () => {
    const isolated: GraphEdge[] = [makeEdge("e01", 0, 1)]; // no path 0→3
    const routes = computeRoutes(nodes, isolated, 0, 3, 0);
    expect(routes).toHaveLength(0);
  });
});
