# Named Route Strategies Design

**Date:** 2026-05-25  
**Status:** Approved

## Problem

Current routing computes 3 routes via penalized A* (diversity forcing). Routes are labelled 1/2/3 with no semantic meaning. Users can't choose a route based on intent.

## Goal

Replace with 3 semantically named routes:
- **Lively** — maximises foot traffic, venues, lighting
- **Accessible** — maximises flatness, surface quality, lighting
- **Shortest** — pure geometric distance

## Approach

Option A: independent A* run per kind, each with its own weight profile.

## Data Model

### `types.ts`

Add `RouteKind`:

```ts
export type RouteKind = "lively" | "accessible" | "shortest";
```

Add `kind` field to `Route`:

```ts
export interface Route {
  readonly id: number;
  readonly kind: RouteKind;
  readonly edges: readonly GraphEdge[];
  readonly geometry: [number, number][];
  readonly score: number;
  readonly length_m: number;
}
```

## Scoring

### `scoring.ts`

`computeScore` gains an optional `weights` parameter (defaults to current `WEIGHTS`).

Three weight profiles:

```ts
export const WEIGHTS_DEFAULT = {
  lux: 0.25, ped_vector: 0.20, venues_vector: 0.15,
  steepness: 0.10, surface: 0.10, canopy: 0.10, transit: 0.10,
};

export const WEIGHTS_LIVELY = {
  lux: 0.15, ped_vector: 0.35, venues_vector: 0.35,
  steepness: 0.05, surface: 0.05, canopy: 0.05, transit: 0.00,
};

export const WEIGHTS_ACCESSIBLE = {
  lux: 0.25, ped_vector: 0.00, venues_vector: 0.00,
  steepness: 0.50, surface: 0.25, canopy: 0.00, transit: 0.00,
};
```

`edgeCost` gains an `alpha` parameter (default `ALPHA = 1.5`). Shortest route passes `alpha = 0` → `edgeCost = length_m`.

## Routing

### `routing.ts` / `routing.worker.ts`

`findRoute` gains `weights` and `alpha` params.

`computeRoutes` runs 3 independent A* calls — no edge penalization between them:

```ts
export const computeRoutes = (nodes, edges, fromId, toId, hourOfWeek): Route[] => {
  const lively     = findRoute(..., WEIGHTS_LIVELY,     ALPHA);
  const accessible = findRoute(..., WEIGHTS_ACCESSIBLE, ALPHA);
  const shortest   = findRoute(..., WEIGHTS_DEFAULT,    0);

  return [
    lively     && { ...lively,      id: 1, kind: "lively" },
    accessible && { ...accessible,  id: 2, kind: "accessible" },
    shortest   && { ...shortest,    id: 3, kind: "shortest" },
  ].filter(Boolean);
};
```

Fixed id assignment: lively=1, accessible=2, shortest=3.

## UI

### `map-app.tsx` — `PlanWalkPanel`

- Replace numeric badge with kind label (capitalised): "Lively", "Accessible", "Shortest"
- Remove "Recommended" tag
- Badge color unchanged (ROUTE_COLORS[0/1/2])
- Map stroke width: lively gets wider stroke (was `route.id === 1`, becomes `route.kind === "lively"`)

### `ExplainSlideOut`

- Header shows kind name instead of numeric id

### Worker message protocol

Unchanged — still sends `Route[]`. `kind` field is part of `Route` so flows through automatically.

## Out of Scope

- Tuning weight values (can iterate post-ship)
- Deduplication / overlap detection between routes
- Persisting kind preference across sessions
