# CityStride — Application Design Spec

**Date:** 2026-05-23
**Status:** Approved
**Source:** PRD.md

---

## 1. Overview

CityStride is a hackathon demo that turns Melbourne's open civic data into an interactive pedestrian streetscore map. Users see Melbourne's walkable network colored by a composite score, scrub through time to watch the city change, and plan routes that favor well-lit, active, pleasant streets.

This spec covers the frontend SSR application and build-time ingestion pipeline. No MCP server.

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React Router v7 (framework/SSR mode) | Built-in SSR, loaders, streaming, Vite-native |
| Bundler | Vite | Default for RR v7 framework mode |
| Styling | Tailwind CSS v4 + shadcn/ui | Utility-first + copy-paste component primitives |
| Map | MapLibre GL JS + Deck.gl PathLayer | Free OSM tiles + high-perf WebGL line rendering |
| Routing engine | ngraph.path (A*) | Custom edge cost functions, no full routing engine needed |
| AI Explanation | Claude API (streaming) | One-shot structured prompt per route |
| Geocoder | In-app fuzzy match on CoM Street Addresses | No external geocoding dependency |
| Runtime | Node.js | Server for SSR + Claude API proxy |

## 3. Project Structure

```
citystride/
├── app/                           # React Router v7 framework mode
│   ├── root.tsx                   # Root layout (html/head/body shell)
│   ├── routes/
│   │   ├── _index.tsx             # Main map route (home)
│   │   └── api.explain.ts        # Claude API streaming proxy
│   ├── components/
│   │   ├── map/
│   │   │   ├── CityMap.tsx        # MapLibre + Deck.gl canvas (client-only)
│   │   │   ├── MapTooltip.tsx     # Hover tooltip
│   │   │   └── RouteOverlay.tsx   # 3-route polylines
│   │   ├── inspector/
│   │   │   └── InspectorCard.tsx  # Pinned segment detail card
│   │   ├── planner/
│   │   │   └── PlanWalkPanel.tsx  # From/to inputs + route legend
│   │   ├── slider/
│   │   │   └── TimeSlider.tsx     # Hour-of-week slider (0-167)
│   │   ├── legend/
│   │   │   └── ScoreLegend.tsx    # Gradient legend panel
│   │   ├── explain/
│   │   │   └── ExplainSlideOut.tsx # AI explanation slide-out panel
│   │   ├── ghosts/
│   │   │   └── GhostTabs.tsx      # Disabled Run/Cycle/Event/Gap Finder tabs
│   │   └── ui/                    # shadcn/ui primitives
│   ├── lib/
│   │   ├── graph.ts               # Graph loading + querying
│   │   ├── scoring.ts             # Streetscore computation (weights, composite)
│   │   ├── routing.ts             # A* with ngraph.path, 3-route generation
│   │   ├── geocoder.ts            # Fuzzy address matching
│   │   └── time.ts                # Hour-of-week <-> day/time helpers
│   ├── hooks/
│   │   ├── useGraph.ts            # Graph context/provider
│   │   └── useRoutes.ts           # Route computation state
│   └── styles/
│       └── globals.css            # Tailwind v4 imports + design tokens
├── scripts/
│   └── ingest/                    # Build-time bake pipeline
│       ├── index.ts               # Orchestrator
│       ├── datasets.ts            # CoM dataset fetchers
│       ├── network.ts             # Pedestrian network builder
│       ├── metrics.ts             # Per-edge metric computation
│       ├── normalize.ts           # 0-1 normalization
│       └── output.ts              # Graph artifact writer
├── data/                          # Baked graph artifact output (gitignored)
├── public/                        # Static assets
├── react-router.config.ts         # RR v7 config
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── PRD.md
```

## 4. Architecture

### 4.1 Build/Run Split

Hard separation between build-time and runtime, as specified in the PRD.

**Build time:** `scripts/ingest/` fetches CoM open datasets, computes per-edge metrics, normalizes to 0-1 positive-framed scale, and writes a single graph artifact to `data/`. This runs once offline before the demo.

**Run time:** React Router v7 SSR app. The route loader reads the graph artifact from disk on the server and sends it to the client. All scoring, routing, and map rendering happen client-side. The only server-side runtime dependency is the Claude API proxy for AI explanations.

### 4.2 SSR Strategy

**SSR shell, client-only map.** The `_index.tsx` route server-renders the full UI chrome:
- PlanWalkPanel (top-left)
- ScoreLegend (top-right)
- TimeSlider (bottom)
- GhostTabs (disabled tabs)

The `CityMap` component is wrapped in a `ClientOnly` boundary and loads after hydration. This gives a fast initial paint with the UI shell visible immediately while the WebGL map initializes.

### 4.3 Graph Loading

The `_index.tsx` loader reads the baked graph artifact from disk:

```typescript
// app/routes/_index.tsx
export async function loader() {
  const graph = await readGraphArtifact("data/graph.json");
  return { graph };
}
```

The graph is passed to a `GraphProvider` context on the client. All components read from this shared context.

### 4.4 Client-Side Scoring

Composite streetscore is computed at runtime, not baked, so time changes recolor the map instantly.

```
composite = w1*lux + w2*ped_count[t] + w3*gentle_gradient
          + w4*surface_quality + w5*canopy + w6*bailout_proximity
          + w7*open_venues[t]
```

- Weights are a constant in `scoring.ts` (not user-configurable).
- Time-varying metrics (`ped_count`, `open_venues`) are looked up from 168-element vectors using the current hour-of-week from the time slider.
- All metrics are already normalized 0-1 at bake time.

### 4.5 Client-Side Routing

A* runs in the browser via `ngraph.path` with a custom cost function:

```
edge_cost = length_m * (1 + alpha * (1 - score))
```

- `alpha = 1.5` (global tuning knob, not user-facing).
- 3-route differentiation: Route 1 = base A*. Route 2 = A* with penalty on Route 1's edges. Route 3 = A* with penalty on Routes 1+2.
- Routes are frozen at computation time. Changing the time slider does NOT recompute routes.

### 4.6 AI Explanation (Server Proxy)

`app/routes/api.explain.ts` is a resource route that:
1. Receives route data + segment metrics from the client.
2. Constructs a system prompt enforcing positive framing.
3. Streams a Claude API response back to the client.
4. Graceful degradation: if the API fails, the rest of the app is unaffected.

## 5. Runtime State Model

Single source of truth, managed via React state (likely `useReducer` or Zustand):

```typescript
interface AppState {
  viewport: { lng: number; lat: number; zoom: number };
  time: number;                                    // 0-167 (hour-of-week)
  routeQuery: { from: string; to: string; fromNode: string; toNode: string } | null;
  routes: [Route, Route, Route] | null;            // frozen at computation time
  routeComputedAt: number | null;                  // time when routes were computed
  pinnedSegmentId: string | null;
  openExplanationRouteId: number | null;
}
```

No `weights` field. Weights are a constant.

## 6. Component Behavior

### CityMap (client-only)
- Full-bleed MapLibre GL JS canvas with OSM base tiles.
- Deck.gl PathLayer renders every pedestrian edge as a colored polyline.
- Color driven by composite streetscore: vibrant-to-dim positive gradient.
- Initial view: CBD zoom, Friday 22:00.
- Hover: tooltip near cursor (street name + score).
- Click: pins InspectorCard. Click empty map dismisses.
- When routes are present, streetscore layer dims slightly.

### TimeSlider
- Horizontal slider, bottom of screen. Range 0-167.
- Displays day + time readout (e.g., "Fri 22:00").
- Map recolors on slider release.
- If routes are frozen, shows stale indicator with "Recompute" button.

### InspectorCard
- Bottom-left pinned card on segment click.
- Shows: street name, composite score, per-metric breakdown with raw values and 0-1 bars.
- Confidence flags where applicable.

### PlanWalkPanel
- Top-left floating panel.
- Two text inputs with fuzzy autocomplete from CoM addresses.
- "Find route" triggers 3-route computation at current time.
- Route legend: per-route score + length. Route 1 labeled "Recommended."
- "Explain" link per route triggers ExplainSlideOut.
- "Recompute" button (visible when stale). "Clear" link removes routes.

### ScoreLegend
- Top-right floating panel.
- Horizontal gradient strip: "Lower score" to "Higher score."
- Subtitle explaining score factors.
- Footer: "Data: City of Melbourne open data."

### ExplainSlideOut
- Slides in from right, ~30% of canvas width.
- Header: "Why this route?" + route badge.
- Streaming text, 4-6 paragraphs, ~250 words max.
- Footer: "Explained by Claude" + elapsed time.
- Retry on API failure. Esc/X/backdrop dismisses.

### GhostTabs
- Disabled Run/Cycle/Event tab buttons with "Coming soon" tooltip.
- Disabled Gap Finder toggle.

## 7. Ingestion Pipeline

`scripts/ingest/index.ts` orchestrates:

1. **Fetch datasets** (`datasets.ts`) — download CoM open data CSVs/GeoJSON.
2. **Build network** (`network.ts`) — construct pedestrian graph (nodes + edges) from CoM Pedestrian Network dataset.
3. **Compute metrics** (`metrics.ts`) — for each edge, compute:
   - Time-invariant: lighting (lux), gentle gradient, surface quality, canopy, bailout proximity.
   - Time-varying: pedestrian count (IDW from 145 sensors as 168-vectors), open venue density (168-vectors).
4. **Normalize** (`normalize.ts`) — all metrics to 0-1 positive-framed scale. Steepness inverted.
5. **Output** (`output.ts`) — write single graph artifact to `data/graph.json`. Includes spatial index for viewport queries and geocoder index for address resolution.

## 8. Color & Framing

- Gradient runs vibrant-to-dim, never red/warning.
- Language is descriptive ("Lit & Lively"), never judgmental.
- No street is permanently labeled — change the time, change the score.
- No crime data, crash heatmaps, or "safety" overlays.

## 9. Demo Initial State

- CBD zoom centered on Melbourne.
- Time: Friday 22:00 (hour-of-week index 117).
- No routes. No pinned segment. Streetscore map fully visible.

## 10. Out of Scope

- MCP server.
- RunSafe, CycleSafe, EventMode.
- Gap Finder (functional).
- Weather, PTV real-time, construction overlays.
- User-configurable weights.
- Crime/crash data.
- Auth, accounts, persistent user state.
- WCAG 2.1 AA compliance.
- Mobile responsive layout (stretch only).
