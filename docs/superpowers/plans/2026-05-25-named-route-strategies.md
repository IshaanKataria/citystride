# Named Route Strategies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3 penalized-diversity A* routes with 3 semantically named routes — Lively, Accessible, and Shortest — each optimised with its own weight profile.

**Architecture:** Each route kind gets an independent A* run with a dedicated weight profile. `RouteKind` is added to the `Route` type and flows through worker → state → UI. The UI replaces numeric badges with kind labels.

**Tech Stack:** TypeScript, Vitest, React, ngraph.path, deck.gl PathLayer

---

## File Map

| File | Change |
|---|---|
| `app/lib/types.ts` | Add `RouteKind`, add `kind` to `Route` |
| `app/lib/scoring.ts` | Add `WEIGHTS_LIVELY`, `WEIGHTS_ACCESSIBLE`; make `computeScore` accept optional weights; make `edgeCost` accept optional alpha |
| `app/lib/routing.ts` | Thread `weights`+`alpha` through `findRoute`; rewrite `computeRoutes` as 3 independent calls |
| `app/lib/routing.worker.ts` | No change needed — `Route` type update flows through automatically |
| `app/components/map-app.tsx` | Update `PlanWalkPanel` and `ExplainSlideOut` to display kind labels |
| `app/lib/scoring.test.ts` | New — unit tests for weight profiles and `computeScore` with weights param |
| `app/lib/routing.test.ts` | New — unit tests for `computeRoutes` kind assignment |

---

## Task 1: Add `RouteKind` to types

**Files:**
- Modify: `app/lib/types.ts`

- [ ] **Step 1: Add `RouteKind` and update `Route`**

Open `app/lib/types.ts`. Add `RouteKind` before the `Route` interface, and add `kind` to `Route`:

```ts
export type RouteKind = "lively" | "accessible" | "shortest";

export interface Route {
  readonly id: number;
  readonly kind: RouteKind;
  readonly edges: readonly GraphEdge[];
  readonly geometry: [number, number][];
  readonly score: number;
  readonly length_m: number;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/abhilash/Projects/personal/city-stride
npm run typecheck 2>&1 | head -40
```

Expected: errors about `kind` missing in `routing.ts` — that's correct, fix comes in Task 3.

- [ ] **Step 3: Commit**

```bash
git add app/lib/types.ts
git commit -m "feat(types): add RouteKind and kind field to Route"
```

---

## Task 2: Add weight profiles and make scoring configurable

**Files:**
- Modify: `app/lib/scoring.ts`
- Create: `app/lib/scoring.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/lib/scoring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computeScore,
  edgeCost,
  WEIGHTS_DEFAULT,
  WEIGHTS_LIVELY,
  WEIGHTS_ACCESSIBLE,
  ALPHA,
} from "./scoring";
import type { EdgeMetrics } from "./types";

const flatMetrics: EdgeMetrics = {
  lux: 1,
  steepness: 1,
  surface: 1,
  transit: 1,
  canopy: 1,
  ped_vector: [1, 1, 1],
  venues_vector: [1, 1, 1],
  ped_confidence: { nearest_sensor_m: null, sensor_count: 0, is_interpolated: false },
};

const steepMetrics: EdgeMetrics = {
  lux: 0.5,
  steepness: 0.0,
  surface: 0.5,
  transit: 0.5,
  canopy: 0.5,
  ped_vector: [0.5, 0.5, 0.5],
  venues_vector: [0.5, 0.5, 0.5],
  ped_confidence: { nearest_sensor_m: null, sensor_count: 0, is_interpolated: false },
};

describe("computeScore with custom weights", () => {
  it("returns 1.0 for perfect metrics with any weights", () => {
    expect(computeScore(flatMetrics, 0, WEIGHTS_DEFAULT)).toBeCloseTo(1.0);
    expect(computeScore(flatMetrics, 0, WEIGHTS_LIVELY)).toBeCloseTo(1.0);
    expect(computeScore(flatMetrics, 0, WEIGHTS_ACCESSIBLE)).toBeCloseTo(1.0);
  });

  it("WEIGHTS_ACCESSIBLE penalises steepness more than WEIGHTS_LIVELY", () => {
    const accessibleScore = computeScore(steepMetrics, 0, WEIGHTS_ACCESSIBLE);
    const livelyScore = computeScore(steepMetrics, 0, WEIGHTS_LIVELY);
    // steepMetrics has steepness=0; ACCESSIBLE weights steepness at 0.50 so score drops more
    expect(accessibleScore).toBeLessThan(livelyScore);
  });

  it("WEIGHTS_LIVELY weights ped and venues more than WEIGHTS_ACCESSIBLE", () => {
    const highPedVenueMetrics: EdgeMetrics = {
      ...steepMetrics,
      ped_vector: [1, 1, 1],
      venues_vector: [1, 1, 1],
    };
    const livelyScore = computeScore(highPedVenueMetrics, 0, WEIGHTS_LIVELY);
    const accessibleScore = computeScore(highPedVenueMetrics, 0, WEIGHTS_ACCESSIBLE);
    expect(livelyScore).toBeGreaterThan(accessibleScore);
  });
});

describe("edgeCost with custom alpha", () => {
  it("alpha=0 returns pure length_m", () => {
    expect(edgeCost(100, 0.5, 0)).toBe(100);
    expect(edgeCost(200, 0.0, 0)).toBe(200);
  });

  it("alpha=ALPHA increases cost for low-score edges", () => {
    const goodCost = edgeCost(100, 1.0, ALPHA);
    const badCost = edgeCost(100, 0.0, ALPHA);
    expect(badCost).toBeGreaterThan(goodCost);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/abhilash/Projects/personal/city-stride
npx vitest run app/lib/scoring.test.ts 2>&1 | tail -20
```

Expected: FAIL — `WEIGHTS_DEFAULT`, `WEIGHTS_LIVELY`, `WEIGHTS_ACCESSIBLE` not exported; `computeScore` doesn't accept weights param; `edgeCost` doesn't accept alpha param.

- [ ] **Step 3: Update `scoring.ts`**

Replace the full content of `app/lib/scoring.ts`:

```ts
import type { EdgeMetrics } from "./types";

export interface WeightProfile {
  readonly lux: number;
  readonly ped_vector: number;
  readonly steepness: number;
  readonly surface: number;
  readonly canopy: number;
  readonly transit: number;
  readonly venues_vector: number;
}

export const WEIGHTS_DEFAULT: WeightProfile = {
  lux: 0.25,
  ped_vector: 0.20,
  venues_vector: 0.15,
  steepness: 0.10,
  surface: 0.10,
  canopy: 0.10,
  transit: 0.10,
};

export const WEIGHTS_LIVELY: WeightProfile = {
  lux: 0.15,
  ped_vector: 0.35,
  venues_vector: 0.35,
  steepness: 0.05,
  surface: 0.05,
  canopy: 0.05,
  transit: 0.00,
};

export const WEIGHTS_ACCESSIBLE: WeightProfile = {
  lux: 0.25,
  ped_vector: 0.00,
  venues_vector: 0.00,
  steepness: 0.50,
  surface: 0.25,
  canopy: 0.00,
  transit: 0.00,
};

// Keep WEIGHTS as alias for backwards compat with existing callers
export const WEIGHTS = WEIGHTS_DEFAULT;

export const ALPHA = 1.5;

export const timeBucketIndex = (hourOfWeek: number): number => {
  const hour = ((hourOfWeek % 24) + 24) % 24;
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  return 2;
};

export const metricForTime = (values: readonly number[] | undefined, hourOfWeek: number): number => {
  if (!values || values.length === 0) return 0;
  if (values.length <= 3) return values[timeBucketIndex(hourOfWeek)] ?? values[values.length - 1] ?? 0;
  return values[hourOfWeek] ?? values[((hourOfWeek % values.length) + values.length) % values.length] ?? 0;
};

export const computeScore = (
  metrics: EdgeMetrics,
  hourOfWeek: number,
  weights: WeightProfile = WEIGHTS_DEFAULT,
): number => {
  return (
    weights.lux * metrics.lux +
    weights.ped_vector * metricForTime(metrics.ped_vector, hourOfWeek) +
    weights.steepness * metrics.steepness +
    weights.surface * metrics.surface +
    weights.canopy * metrics.canopy +
    weights.transit * metrics.transit +
    weights.venues_vector * metricForTime(metrics.venues_vector, hourOfWeek)
  );
};

export const edgeCost = (lengthM: number, score: number, alpha: number = ALPHA): number => {
  return lengthM * (1 + alpha * (1 - score));
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run app/lib/scoring.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: only errors about `kind` missing in routing.ts (from Task 1). No scoring errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/scoring.ts app/lib/scoring.test.ts
git commit -m "feat(scoring): add weight profiles and make computeScore/edgeCost configurable"
```

---

## Task 3: Rewrite routing to use named strategies

**Files:**
- Modify: `app/lib/routing.ts`
- Create: `app/lib/routing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/lib/routing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeRoutes } from "./routing";
import type { GraphNode, GraphEdge } from "./types";

// Minimal graph: 4 nodes in an L-shape
//   0 --- 1
//         |
//         2 --- 3
// Direct path 0→1→2→3 is shortest
// No alternative geometry to force distinct routes, so all 3 may share segments

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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run app/lib/routing.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Route.kind` doesn't exist yet in routing output.

- [ ] **Step 3: Rewrite `routing.ts`**

Replace the full content of `app/lib/routing.ts`:

```ts
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

  const path = pathFinder.find(fromId, toId);
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run app/lib/routing.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: errors only in `map-app.tsx` about `kind` (UI not updated yet). No errors in routing or scoring.

- [ ] **Step 6: Commit**

```bash
git add app/lib/routing.ts app/lib/routing.test.ts
git commit -m "feat(routing): replace penalized diversity with named strategy routes"
```

---

## Task 4: Update UI to show kind labels

**Files:**
- Modify: `app/components/map-app.tsx`

- [ ] **Step 1: Add a kind label helper near the top of `map-app.tsx`**

After the imports block (around line 12), add:

```ts
const KIND_LABEL: Record<import("~/lib/types").RouteKind, string> = {
  lively:     "Lively",
  accessible: "Accessible",
  shortest:   "Shortest",
};
```

- [ ] **Step 2: Update `PlanWalkPanel` route list**

In `PlanWalkPanel`, find the route list item (around line 224–250). Replace the inner `div` content:

**Find this block:**
```tsx
<div className="flex items-center gap-2 min-w-0">
  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}>{route.id}</span>
  <span className="text-xs text-card-foreground font-medium tabular-nums">{(route.score * 100).toFixed(0)}</span>
  <span className="text-xs text-muted-foreground tabular-nums">{formatLength(route.length_m)}</span>
  {route.id === 1 && <span className="text-xs text-primary">Recommended</span>}
</div>
```

**Replace with:**
```tsx
<div className="flex items-center gap-2 min-w-0">
  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}>{route.id}</span>
  <span className="text-xs text-card-foreground font-medium">{KIND_LABEL[route.kind]}</span>
  <span className="text-xs text-muted-foreground tabular-nums">{formatLength(route.length_m)}</span>
</div>
```

- [ ] **Step 3: Update route stroke width to use kind instead of id**

In `getLayers`, find:

```ts
getWidth: route.id === 1 ? 8 : 5,
widthMinPixels: route.id === 1 ? 5 : 3,
```

Replace with:

```ts
getWidth: route.kind === "lively" ? 8 : 5,
widthMinPixels: route.kind === "lively" ? 5 : 3,
```

- [ ] **Step 4: Update `ExplainSlideOut` header**

In `ExplainSlideOut`, find the loading text (around line 376):

```tsx
<p className="text-xs text-muted-foreground/60">Claude is comparing the three routes…</p>
```

No change needed there. Find the header badge (around line 349–353):

```tsx
<span
  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-card"
  style={{ backgroundColor: accent }}
>
  {route.id}
</span>
<span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Why this route?</span>
```

Replace with:

```tsx
<span
  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-card"
  style={{ backgroundColor: accent }}
>
  {route.id}
</span>
<span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
  {KIND_LABEL[route.kind]} — Why this route?
</span>
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/components/map-app.tsx
git commit -m "feat(ui): show named route kinds (Lively/Accessible/Shortest) in panel and explain drawer"
```

---

## Task 5: Verify in browser

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open app, plan a walk, confirm**

- Route panel shows "Lively", "Accessible", "Shortest" labels (not "1 Recommended", "2", "3")
- Lively route has thicker stroke on map
- Clicking "Explain" on each shows kind name in the slide-out header

- [ ] **Step 3: Run all tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Final typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.
