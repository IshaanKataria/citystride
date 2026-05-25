# Route Scoring & Diversity Improvements

**Date:** 2026-05-25  
**Status:** Approved

## Problem

Three issues with current routing:

1. **Identical routes** — lively/accessible/balanced can converge to the same path if quality differences are small on a constrained graph.
2. **Misleading route score** — simple average of edge scores weights a short low-quality edge equally with a long high-quality one.
3. **Missing "balanced" route** — `WEIGHTS_DEFAULT` is defined but never used as a strategy; there is no route between "shortest" and "lively".

Secondary issue: `ped_vector` is treated as ground truth even when the underlying sensor is 400 m away and the value is IDW-interpolated area average.

## Design

### 1. Length-weighted route score

**File:** `app/lib/routing.ts`, inside `findRoute`

Replace:
```ts
const avgScore = routeEdges.length > 0 ? totalScore / routeEdges.length : 0;
```

With accumulated weighted score:
```ts
let weightedScoreSum = 0;
// per edge: weightedScoreSum += score * edge.length_m
const avgScore = totalLength > 0 ? weightedScoreSum / totalLength : 0;
```

Each edge contributes proportional to its length. A 10 m alley no longer drags down a 500 m boulevard.

---

### 2. Pedestrian confidence discount

**File:** `app/lib/scoring.ts`

Add a helper:
```ts
export const pedConfidenceFactor = (conf: EdgeMetrics["ped_confidence"]): number => {
  if (!conf.is_interpolated) return 1.0;
  if (conf.nearest_sensor_m === null) return 0.3;
  if (conf.nearest_sensor_m > 300) return 0.5;
  return 0.8;
};
```

In `computeScore`, multiply the `ped_vector` term:
```ts
weights.ped_vector * metricForTime(metrics.ped_vector, hourOfWeek) * pedConfidenceFactor(metrics.ped_confidence)
```

Weights still sum to 1.0 across profiles — the discount only reduces the effective contribution of uncertain data, not the declared weight.

---

### 3. Add "balanced" route kind

**File:** `app/lib/types.ts`

```ts
export type RouteKind = "lively" | "accessible" | "balanced" | "shortest";
```

**File:** `app/lib/routing.ts`, `computeRoutes`

Add to strategies array:
```ts
{ kind: "balanced", id: 4, weights: WEIGHTS_DEFAULT, alpha: ALPHA },
```

Strategy order: `lively → accessible → balanced → shortest`.  
`id` assignment: lively=1, accessible=2, balanced=3, shortest=4.  
Update `shortest` from id=3 to id=4.

---

### 4. Soft edge penalty for diversity

**File:** `app/lib/routing.ts`

After each route is computed, its edge IDs are added to `usedEdgeIds`. The next route's graph is built with those edges penalised.

#### In `computeRoutes`:
```ts
const DIVERSITY_PENALTY = 2.5;
const usedEdgeIds = new Set<string>();

for (const { kind, id, weights, alpha } of strategies) {
  const result = findRoute(nodeMap, edgeMap, edges, fromId, toId, hourOfWeek,
                           weights, alpha, usedEdgeIds, DIVERSITY_PENALTY);
  if (result) {
    routes.push({ ...result, id, kind });
    for (const e of result.edges) usedEdgeIds.add(e.id);
  }
}
```

#### In `buildRoutingGraph`:
```ts
const buildRoutingGraph = (
  edges, hourOfWeek, weights, alpha,
  usedEdgeIds: ReadonlySet<string>, diversityPenalty: number
) => {
  for (const edge of edges) {
    const score = computeScore(edge.metrics, hourOfWeek, weights);
    const penaltyFactor = usedEdgeIds.has(edge.id) ? diversityPenalty : 1;
    // Base length is never penalised — only the quality-based penalty term scales
    const cost = edge.length_m + penaltyFactor * alpha * edge.length_m * (1 - score);
    ...
  }
};
```

**Key invariant:** `shortest` uses `alpha=0`, so the penalty term is `0` regardless of `penaltyFactor`. Shortest route is always pure distance — diversity penalty has zero effect on it.

---

## Affected files

| File | Change |
|------|--------|
| `app/lib/scoring.ts` | Add `pedConfidenceFactor`, apply in `computeScore` |
| `app/lib/routing.ts` | Length-weighted score, `usedEdgeIds` penalty, add balanced strategy, update ids |
| `app/lib/types.ts` | Add `"balanced"` to `RouteKind` |
| `app/lib/scoring.test.ts` | Tests for `pedConfidenceFactor` |
| `app/lib/routing.test.ts` | Update id expectations, add diversity test |

## What does NOT change

- `edgeCost` helper signature (stays in scoring.ts, still used externally)
- Metric normalization pipeline (`normalize.js`, `metrics.js`)
- `ALPHA` constant
- All three existing weight profiles
- UI/map layers — `RouteKind` union addition is additive

## Open questions / tuning notes

- `DIVERSITY_PENALTY = 2.5` is a starting value. If routes still overlap visually, try 3.0–4.0. If routes become unreasonably long, try 1.8.
- Confidence thresholds (300 m, 0.3/0.5/0.8) can be adjusted after observing real route differences.
