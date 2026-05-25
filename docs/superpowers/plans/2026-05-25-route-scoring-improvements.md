# Route Scoring & Diversity Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix route quality scoring accuracy, add a 4th "balanced" route kind, discount uncertain pedestrian data, and force visual diversity between routes via soft edge penalty.

**Architecture:** All changes are confined to `scoring.ts`, `routing.ts`, and `types.ts`. The soft edge penalty inflates the quality-penalty term (not the base distance) for edges already used by earlier routes; `shortest` (alpha=0) is unaffected. `RouteKind` union is additive — no UI breakage.

**Tech Stack:** TypeScript, ngraph.graph, ngraph.path, Vitest

---

### Task 1: Length-weighted route score

**Files:**
- Modify: `app/lib/routing.ts` (inside `findRoute`, lines 87–101)

- [ ] **Step 1: Write the failing test**

Add to `app/lib/routing.test.ts` inside the `describe("computeRoutes")` block:

```ts
it("score is weighted by edge length, not simple average", () => {
  // Two edges: one short low-quality, one long high-quality
  // Length-weighted avg should be closer to high-quality score
  const shortBad = makeEdge("sb", 0, 1, {
    lux: 0.0, steepness: 0.0, surface: 0.0, transit: 0.0, canopy: 0.0,
    ped_vector: [0.0, 0.0, 0.0], venues_vector: [0.0, 0.0, 0.0],
  });
  const longGood = makeEdge("lg", 1, 2, {
    lux: 1.0, steepness: 1.0, surface: 1.0, transit: 1.0, canopy: 1.0,
    ped_vector: [1.0, 1.0, 1.0], venues_vector: [1.0, 1.0, 1.0],
  });
  // Override length_m to make the difference clear
  const shortBadLong: GraphEdge = { ...shortBad, length_m: 100 };
  const longGoodLong: GraphEdge = { ...longGood, length_m: 900 };

  const routes = computeRoutes(nodes, [shortBadLong, longGoodLong, makeEdge("e23", 2, 3)], 0, 3, 0);
  // For lively route: length-weighted score should be > 0.5 (dominated by 900 m good edge)
  const lively = routes.find(r => r.kind === "lively")!;
  expect(lively.score).toBeGreaterThan(0.5);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/lib/routing.test.ts 2>&1 | tail -20
```

Expected: test fails (current code uses simple average).

- [ ] **Step 3: Implement length-weighted score in `findRoute`**

In `app/lib/routing.ts`, replace the accumulation block (lines 89–101):

```ts
let totalLength = 0;
let weightedScoreSum = 0;

for (let i = 0; i < pathNodeIds.length - 1; i++) {
  const edge = edgeMap.get(edgeKey(pathNodeIds[i], pathNodeIds[i + 1]));
  if (edge) {
    routeEdges.push(edge);
    const edgeScore = computeScore(edge.metrics, hourOfWeek, weights);
    totalLength += edge.length_m;
    weightedScoreSum += edgeScore * edge.length_m;
    for (const coord of edge.geometry) {
      geometry.push(coord as [number, number]);
    }
  }
}

const avgScore = totalLength > 0 ? weightedScoreSum / totalLength : 0;
```

- [ ] **Step 4: Run tests to verify passing**

```bash
npx vitest run app/lib/routing.test.ts 2>&1 | tail -20
```

Expected: all tests pass including the new length-weighted test.

- [ ] **Step 5: Commit**

```bash
git add app/lib/routing.ts app/lib/routing.test.ts
git commit -m "fix(routing): use length-weighted average for route score"
```

---

### Task 2: Pedestrian confidence discount

**Files:**
- Modify: `app/lib/scoring.ts`
- Modify: `app/lib/scoring.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `app/lib/scoring.test.ts`:

```ts
import { pedConfidenceFactor } from "./scoring";
import type { EdgeMetrics } from "./types";

describe("pedConfidenceFactor", () => {
  it("returns 1.0 for direct sensor data", () => {
    expect(pedConfidenceFactor({ nearest_sensor_m: 50, sensor_count: 2, is_interpolated: false })).toBe(1.0);
  });

  it("returns 0.3 when no sensor at all", () => {
    expect(pedConfidenceFactor({ nearest_sensor_m: null, sensor_count: 0, is_interpolated: true })).toBe(0.3);
  });

  it("returns 0.5 when nearest sensor > 300 m", () => {
    expect(pedConfidenceFactor({ nearest_sensor_m: 400, sensor_count: 1, is_interpolated: true })).toBe(0.5);
  });

  it("returns 0.8 for interpolated but close sensor", () => {
    expect(pedConfidenceFactor({ nearest_sensor_m: 200, sensor_count: 2, is_interpolated: true })).toBe(0.8);
  });
});

describe("computeScore confidence discount", () => {
  it("lowers score for unconfident ped data vs direct sensor", () => {
    const directMetrics: EdgeMetrics = {
      ...steepMetrics,
      ped_vector: [1.0, 1.0, 1.0],
      ped_confidence: { nearest_sensor_m: 50, sensor_count: 2, is_interpolated: false },
    };
    const interpolatedMetrics: EdgeMetrics = {
      ...steepMetrics,
      ped_vector: [1.0, 1.0, 1.0],
      ped_confidence: { nearest_sensor_m: null, sensor_count: 0, is_interpolated: true },
    };
    const directScore = computeScore(directMetrics, 0, WEIGHTS_LIVELY);
    const interpolatedScore = computeScore(interpolatedMetrics, 0, WEIGHTS_LIVELY);
    expect(interpolatedScore).toBeLessThan(directScore);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run app/lib/scoring.test.ts 2>&1 | tail -20
```

Expected: fails with "pedConfidenceFactor is not a function".

- [ ] **Step 3: Add `pedConfidenceFactor` and apply in `computeScore`**

In `app/lib/scoring.ts`, add after the `timeBucketIndex` function:

```ts
export const pedConfidenceFactor = (conf: EdgeMetrics["ped_confidence"]): number => {
  if (!conf.is_interpolated) return 1.0;
  if (conf.nearest_sensor_m === null) return 0.3;
  if (conf.nearest_sensor_m > 300) return 0.5;
  return 0.8;
};
```

Update the `computeScore` function to apply the discount:

```ts
export const computeScore = (
  metrics: EdgeMetrics,
  hourOfWeek: number,
  weights: WeightProfile = WEIGHTS_DEFAULT,
): number => {
  const pedFactor = pedConfidenceFactor(metrics.ped_confidence);
  return (
    weights.lux * metrics.lux +
    weights.ped_vector * metricForTime(metrics.ped_vector, hourOfWeek) * pedFactor +
    weights.steepness * metrics.steepness +
    weights.surface * metrics.surface +
    weights.canopy * metrics.canopy +
    weights.transit * metrics.transit +
    weights.venues_vector * metricForTime(metrics.venues_vector, hourOfWeek)
  );
};
```

Note: `scoring.ts` needs the `EdgeMetrics` import. Add at top if not already present:

```ts
import type { EdgeMetrics } from "./types";
```

- [ ] **Step 4: Run tests to verify passing**

```bash
npx vitest run app/lib/scoring.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/lib/scoring.ts app/lib/scoring.test.ts
git commit -m "feat(scoring): add ped_confidence discount to computeScore"
```

---

### Task 3: Add "balanced" route kind

**Files:**
- Modify: `app/lib/types.ts`
- Modify: `app/lib/routing.ts`
- Modify: `app/lib/routing.test.ts`

- [ ] **Step 1: Write failing tests**

Update the existing tests in `app/lib/routing.test.ts`:

```ts
it("returns exactly 4 routes", () => {
  const routes = computeRoutes(nodes, edges, 0, 3, 0);
  expect(routes).toHaveLength(4);
});

it("assigns correct kinds including balanced", () => {
  const routes = computeRoutes(nodes, edges, 0, 3, 0);
  const kinds = routes.map((r) => r.kind);
  expect(kinds).toContain("lively");
  expect(kinds).toContain("accessible");
  expect(kinds).toContain("balanced");
  expect(kinds).toContain("shortest");
});

it("assigns fixed ids: lively=1, accessible=2, balanced=3, shortest=4", () => {
  const routes = computeRoutes(nodes, edges, 0, 3, 0);
  const byKind = Object.fromEntries(routes.map((r) => [r.kind, r.id]));
  expect(byKind["lively"]).toBe(1);
  expect(byKind["accessible"]).toBe(2);
  expect(byKind["balanced"]).toBe(3);
  expect(byKind["shortest"]).toBe(4);
});
```

Replace the old `"assigns fixed ids: lively=1, accessible=2, shortest=3"` test entirely.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run app/lib/routing.test.ts 2>&1 | tail -20
```

Expected: fails — wrong count, missing "balanced", wrong id for shortest.

- [ ] **Step 3: Update `RouteKind` in types.ts**

```ts
export type RouteKind = "lively" | "accessible" | "balanced" | "shortest";
```

- [ ] **Step 4: Update strategies in `computeRoutes`**

In `app/lib/routing.ts`, replace the `strategies` array:

```ts
const strategies: Array<{ kind: RouteKind; id: number; weights: WeightProfile; alpha: number }> = [
  { kind: "lively",     id: 1, weights: WEIGHTS_LIVELY,     alpha: ALPHA },
  { kind: "accessible", id: 2, weights: WEIGHTS_ACCESSIBLE, alpha: ALPHA },
  { kind: "balanced",   id: 3, weights: WEIGHTS_DEFAULT,    alpha: ALPHA },
  { kind: "shortest",   id: 4, weights: WEIGHTS_DEFAULT,    alpha: 0 },
];
```

- [ ] **Step 5: Run tests to verify passing**

```bash
npx vitest run app/lib/routing.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/lib/types.ts app/lib/routing.ts app/lib/routing.test.ts
git commit -m "feat(routing): add 'balanced' route kind using WEIGHTS_DEFAULT"
```

---

### Task 4: Soft edge penalty for diversity

**Files:**
- Modify: `app/lib/routing.ts`
- Modify: `app/lib/routing.test.ts`

- [ ] **Step 1: Write failing diversity test**

Add to `app/lib/routing.test.ts`. This requires a graph with a clear bypass path. Extend the existing fixture:

```ts
// Diamond graph: two paths from 0 to 3
//   0 --- 1 --- 3   (top path, high ped+venues quality)
//   0 --- 2 --- 3   (bottom path, same metrics)
const diamondNodes: GraphNode[] = [
  { id: 0, lng: 144.960, lat: -37.816 },
  { id: 1, lng: 144.963, lat: -37.814 },  // top
  { id: 2, lng: 144.963, lat: -37.818 },  // bottom
  { id: 3, lng: 144.966, lat: -37.816 },
];

const highQuality: Partial<import("./types").EdgeMetrics> = {
  lux: 1.0, steepness: 1.0, surface: 1.0, transit: 1.0, canopy: 1.0,
  ped_vector: [1.0, 1.0, 1.0], venues_vector: [1.0, 1.0, 1.0],
};

const diamondEdges: GraphEdge[] = [
  makeEdge("d01", 0, 1, highQuality),
  makeEdge("d13", 1, 3, highQuality),
  makeEdge("d02", 0, 2, highQuality),
  makeEdge("d23", 2, 3, highQuality),
];

describe("route diversity", () => {
  it("lively and accessible routes use different edges when alternatives exist", () => {
    const routes = computeRoutes(diamondNodes, diamondEdges, 0, 3, 0);
    const lively = routes.find(r => r.kind === "lively")!;
    const accessible = routes.find(r => r.kind === "accessible")!;

    const livelyIds = new Set(lively.edges.map(e => e.id));
    const accessibleIds = new Set(accessible.edges.map(e => e.id));

    // At least one edge differs between the two routes
    const sharedCount = [...livelyIds].filter(id => accessibleIds.has(id)).length;
    expect(sharedCount).toBeLessThan(lively.edges.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/lib/routing.test.ts 2>&1 | tail -20
```

Expected: fails — without penalty, both routes take the same path.

- [ ] **Step 3: Add diversity penalty to `buildRoutingGraph` and `findRoute`**

Replace `buildRoutingGraph` in `app/lib/routing.ts`:

```ts
const DIVERSITY_PENALTY = 2.5;

const buildRoutingGraph = (
  edges: readonly GraphEdge[],
  hourOfWeek: number,
  weights: WeightProfile,
  alpha: number,
  usedEdgeIds: ReadonlySet<string> = new Set(),
) => {
  const graph = createGraph<unknown, EdgeData>();

  for (const edge of edges) {
    const score = computeScore(edge.metrics, hourOfWeek, weights);
    const penaltyFactor = usedEdgeIds.has(edge.id) ? DIVERSITY_PENALTY : 1;
    const cost = edge.length_m + penaltyFactor * alpha * edge.length_m * (1 - score);
    graph.addLink(edge.fromNodeId, edge.toNodeId, { edge, cost });
    graph.addLink(edge.toNodeId, edge.fromNodeId, { edge, cost });
  }

  return graph;
};
```

Update `findRoute` signature to accept `usedEdgeIds`:

```ts
const findRoute = (
  nodeMap: Map<number, GraphNode>,
  edgeMap: Map<EdgeKey, GraphEdge>,
  edges: readonly GraphEdge[],
  fromId: number,
  toId: number,
  hourOfWeek: number,
  weights: WeightProfile,
  alpha: number,
  usedEdgeIds: ReadonlySet<string> = new Set(),
): Omit<Route, "id" | "kind"> | null => {
  const graph = buildRoutingGraph(edges, hourOfWeek, weights, alpha, usedEdgeIds);
  // ... rest unchanged
```

Update `computeRoutes` to accumulate used edges between strategies:

```ts
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
    { kind: "balanced",   id: 3, weights: WEIGHTS_DEFAULT,    alpha: ALPHA },
    { kind: "shortest",   id: 4, weights: WEIGHTS_DEFAULT,    alpha: 0 },
  ];

  const routes: Route[] = [];
  const usedEdgeIds = new Set<string>();

  for (const { kind, id, weights, alpha } of strategies) {
    const result = findRoute(nodeMap, edgeMap, edges, fromId, toId, hourOfWeek, weights, alpha, usedEdgeIds);
    if (result) {
      routes.push({ ...result, id, kind });
      for (const e of result.edges) usedEdgeIds.add(e.id);
    }
  }

  return routes;
};
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run app/lib/ 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/lib/routing.ts app/lib/routing.test.ts
git commit -m "feat(routing): add soft edge penalty for route diversity"
```

---

### Task 5: Final check — run full test suite

- [ ] **Step 1: Run all tests**

```bash
npx vitest run 2>&1 | tail -30
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit if anything was fixed**

Only commit if step 1 or 2 found issues that needed fixing.
