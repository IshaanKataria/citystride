# CityStride Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React Router v7 SSR app that renders Melbourne's pedestrian network as a streetscore-colored map with time-varying scores, 3-route planning, and AI explanations.

**Architecture:** SSR shell (panels, slider, legend) with client-only MapLibre+Deck.gl canvas. Build-time ingestion pipeline bakes CoM open data into a single graph artifact. Runtime loads graph once, computes scores and routes client-side. Claude API proxy for AI explanations.

**Tech Stack:** React Router v7 (framework mode), Vite, Tailwind CSS v4, shadcn/ui, MapLibre GL JS, Deck.gl, ngraph.path, Claude API (streaming)

---

## File Structure

```
app/
  root.tsx                          — HTML shell, Tailwind import, Outlet
  routes/
    _index.tsx                      — Main route: loader reads graph, renders all panels + client-only map
    api.explain.ts                  — Resource route: Claude API streaming proxy
  components/
    map/
      city-map.tsx                  — MapLibre + Deck.gl PathLayer (client-only)
      map-tooltip.tsx               — Hover tooltip (street name + score)
      route-overlay.tsx             — 3-route numbered polylines
    inspector/
      inspector-card.tsx            — Pinned segment detail card with metric bars
    planner/
      plan-walk-panel.tsx           — From/to inputs, route legend, recompute/clear
    slider/
      time-slider.tsx               — Hour-of-week slider with day+time readout
    legend/
      score-legend.tsx              — Gradient legend panel
    explain/
      explain-slide-out.tsx         — AI explanation slide-out panel
    ghosts/
      ghost-tabs.tsx                — Disabled Run/Cycle/Event/Gap Finder tabs
    client-only.tsx                 — ClientOnly wrapper for browser-only components
    ui/                             — shadcn/ui primitives (button, card, input, slider, tooltip, sheet)
  lib/
    graph.ts                        — Graph loading, spatial index queries, type definitions
    scoring.ts                      — Composite streetscore: weights constant + compute function
    routing.ts                      — A* via ngraph.path, 3-route differentiation, cost function
    geocoder.ts                     — Fuzzy address matching against CoM street addresses
    time.ts                         — Hour-of-week <-> { day, hour } conversion, display formatting
    colors.ts                       — Score-to-color mapping (vibrant-to-dim gradient)
    types.ts                        — Shared type definitions (Edge, GraphArtifact, Route, etc.)
  hooks/
    use-graph.ts                    — React context provider for graph data
    use-routes.ts                   — Route computation state machine
    use-app-state.ts                — Central app state (time, pinned segment, viewport, etc.)
  styles/
    globals.css                     — Tailwind v4 + design tokens + map overrides
scripts/
  ingest/
    index.ts                        — Pipeline orchestrator: fetch -> build -> normalize -> write
    datasets.ts                     — CoM dataset fetchers (pedestrian network, sensors, lights, etc.)
    network.ts                      — Build graph topology from CoM pedestrian network GeoJSON
    metrics.ts                      — Compute per-edge metrics (lighting, traffic, gradient, etc.)
    normalize.ts                    — Normalize all metrics to 0-1 positive-framed scale
    output.ts                       — Write graph artifact to data/graph.json
data/                               — Baked graph artifact (gitignored)
```

---

### Task 1: Scaffold React Router v7 Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `react-router.config.ts`
- Create: `app/root.tsx`
- Create: `app/routes/_index.tsx`
- Create: `app/styles/globals.css`
- Create: `.gitignore`

- [ ] **Step 1: Initialize project with React Router v7**

```bash
npx create-react-router@latest citystride --yes
```

If the CLI prompts, select: template = basic, package manager = npm.

Move contents from `citystride/` into project root if created as subdirectory:

```bash
mv citystride/* citystride/.* . 2>/dev/null; rmdir citystride
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install maplibre-gl @deck.gl/core @deck.gl/layers @deck.gl/mapbox ngraph.graph ngraph.path @anthropic-ai/sdk
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D tailwindcss @tailwindcss/vite vitest @testing-library/react @testing-library/user-event @types/react @types/react-dom jsdom
```

- [ ] **Step 4: Configure Vite with Tailwind**

Update `vite.config.ts`:

```typescript
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
});
```

- [ ] **Step 5: Configure React Router**

Update `react-router.config.ts`:

```typescript
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
} satisfies Config;
```

- [ ] **Step 6: Set up tsconfig path aliases**

Ensure `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "strict": true,
    "paths": {
      "~/*": ["./app/*"]
    }
  }
}
```

- [ ] **Step 7: Set up globals.css with Tailwind v4 and design tokens**

Write `app/styles/globals.css`:

```css
@import "tailwindcss";

:root {
  --color-blue-500: #2563eb;
  --color-purple-500: #7c3aed;
  --color-white: #ffffff;
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-500: #6b7280;
  --color-gray-900: #111827;
  --color-gray-950: #030712;

  --color-primary: var(--color-blue-500);
  --color-primary-foreground: var(--color-white);
  --color-secondary: var(--color-purple-500);
  --color-secondary-foreground: var(--color-white);
  --color-background: var(--color-white);
  --color-foreground: var(--color-gray-900);
  --color-muted: var(--color-gray-100);
  --color-muted-foreground: var(--color-gray-500);
  --color-border: var(--color-gray-200);

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-default: var(--radius-md);

  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.5rem;
  --font-size-2xl: 2rem;
}

@theme inline {
  --color-primary: var(--color-primary);
  --color-primary-foreground: var(--color-primary-foreground);
  --color-secondary: var(--color-secondary);
  --color-secondary-foreground: var(--color-secondary-foreground);
  --color-background: var(--color-background);
  --color-foreground: var(--color-foreground);
  --color-muted: var(--color-muted);
  --color-muted-foreground: var(--color-muted-foreground);
  --color-border: var(--color-border);
  --radius-default: var(--radius-default);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
}
```

- [ ] **Step 8: Set up root.tsx**

Write `app/root.tsx`:

```tsx
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";

import "./styles/globals.css";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CityStride — Melbourne Walkability</title>
        <Meta />
        <Links />
      </head>
      <body className="bg-background text-foreground">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
};

const App = () => {
  return <Outlet />;
};

export default App;
```

- [ ] **Step 9: Set up placeholder index route**

Write `app/routes/_index.tsx`:

```tsx
const IndexRoute = () => {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <h1 className="text-2xl font-bold">CityStride</h1>
    </div>
  );
};

export default IndexRoute;
```

- [ ] **Step 10: Update .gitignore**

Append to `.gitignore`:

```
data/
```

- [ ] **Step 11: Verify dev server starts**

```bash
npm run dev
```

Confirm: page loads at `http://localhost:5173` showing "CityStride" heading. Kill the server.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold React Router v7 project with Tailwind v4"
```

---

### Task 2: Install shadcn/ui Primitives

**Files:**
- Create: `app/components/ui/button.tsx`
- Create: `app/components/ui/card.tsx`
- Create: `app/components/ui/input.tsx`
- Create: `app/components/ui/slider.tsx`
- Create: `app/components/ui/tooltip.tsx`
- Create: `app/components/ui/sheet.tsx`
- Create: `app/lib/utils.ts`

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted: style = default, base color = neutral, CSS variables = yes. If it asks about framework, select React Router / Vite.

- [ ] **Step 2: Add required components**

```bash
npx shadcn@latest add button card input slider tooltip sheet
```

- [ ] **Step 3: Verify components installed**

Check that `app/components/ui/` (or wherever shadcn placed them) contains the component files. If shadcn used a different path (e.g., `components/ui/`), move them to `app/components/ui/`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add shadcn/ui primitives (button, card, input, slider, tooltip, sheet)"
```

---

### Task 3: Shared Types and Core Lib Modules

**Files:**
- Create: `app/lib/types.ts`
- Create: `app/lib/time.ts`
- Create: `app/lib/time.test.ts`
- Create: `app/lib/scoring.ts`
- Create: `app/lib/scoring.test.ts`
- Create: `app/lib/colors.ts`
- Create: `app/lib/colors.test.ts`

- [ ] **Step 1: Write shared type definitions**

Write `app/lib/types.ts`:

```typescript
export interface EdgeMetrics {
  readonly lux: number;
  readonly gentle_gradient: number;
  readonly surface_quality: number;
  readonly canopy: number;
  readonly bailout_proximity: number;
  readonly ped_count: readonly number[];
  readonly open_venues: readonly number[];
}

export interface GraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly geometry: readonly [number, number][];
  readonly length_m: number;
  readonly street_name: string;
  readonly metrics: EdgeMetrics;
  readonly confidence: {
    readonly ped_count: { readonly distance_to_sensor_m: number };
  };
}

export interface GraphNode {
  readonly id: string;
  readonly lng: number;
  readonly lat: number;
}

export interface GraphArtifact {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly addresses: readonly AddressRecord[];
  readonly bounds: {
    readonly minLng: number;
    readonly maxLng: number;
    readonly minLat: number;
    readonly maxLat: number;
  };
}

export interface AddressRecord {
  readonly address: string;
  readonly lng: number;
  readonly lat: number;
  readonly nearestNodeId: string;
}

export interface ScoredEdge {
  readonly edge: GraphEdge;
  readonly score: number;
}

export interface Route {
  readonly id: number;
  readonly edges: readonly GraphEdge[];
  readonly geometry: readonly [number, number][];
  readonly score: number;
  readonly length_m: number;
}

export interface AppState {
  readonly viewport: { readonly lng: number; readonly lat: number; readonly zoom: number };
  readonly time: number;
  readonly routeQuery: {
    readonly from: string;
    readonly to: string;
    readonly fromNode: string;
    readonly toNode: string;
  } | null;
  readonly routes: readonly Route[] | null;
  readonly routeComputedAt: number | null;
  readonly pinnedSegmentId: string | null;
  readonly openExplanationRouteId: number | null;
}
```

- [ ] **Step 2: Write failing test for time module**

Write `app/lib/time.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { formatHourOfWeek, hourOfWeekFromDayHour, dayHourFromHourOfWeek } from "./time";

describe("time", () => {
  it("should convert day and hour to hour-of-week index", () => {
    expect(hourOfWeekFromDayHour(0, 0)).toBe(0);
    expect(hourOfWeekFromDayHour(0, 23)).toBe(23);
    expect(hourOfWeekFromDayHour(1, 0)).toBe(24);
    expect(hourOfWeekFromDayHour(4, 22)).toBe(118);
    expect(hourOfWeekFromDayHour(6, 23)).toBe(167);
  });

  it("should convert hour-of-week index back to day and hour", () => {
    expect(dayHourFromHourOfWeek(0)).toEqual({ day: 0, hour: 0 });
    expect(dayHourFromHourOfWeek(118)).toEqual({ day: 4, hour: 22 });
    expect(dayHourFromHourOfWeek(167)).toEqual({ day: 6, hour: 23 });
  });

  it("should format hour-of-week as human-readable string", () => {
    expect(formatHourOfWeek(118)).toBe("Fri 22:00");
    expect(formatHourOfWeek(0)).toBe("Mon 00:00");
    expect(formatHourOfWeek(34)).toBe("Tue 10:00");
    expect(formatHourOfWeek(147)).toBe("Sun 03:00");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run app/lib/time.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement time module**

Write `app/lib/time.ts`:

```typescript
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const hourOfWeekFromDayHour = (day: number, hour: number): number => {
  return day * 24 + hour;
};

export const dayHourFromHourOfWeek = (hourOfWeek: number): { day: number; hour: number } => {
  const day = Math.floor(hourOfWeek / 24);
  const hour = hourOfWeek % 24;
  return { day, hour };
};

export const formatHourOfWeek = (hourOfWeek: number): string => {
  const { day, hour } = dayHourFromHourOfWeek(hourOfWeek);
  const dayName = DAY_NAMES[day];
  const hourStr = hour.toString().padStart(2, "0");
  return `${dayName} ${hourStr}:00`;
};

export const INITIAL_HOUR_OF_WEEK = hourOfWeekFromDayHour(4, 22);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run app/lib/time.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write failing test for scoring module**

Write `app/lib/scoring.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { computeScore, WEIGHTS } from "./scoring";
import type { EdgeMetrics } from "./types";

describe("scoring", () => {
  it("should return 1.0 for a perfect edge at any time", () => {
    const metrics: EdgeMetrics = {
      lux: 1,
      gentle_gradient: 1,
      surface_quality: 1,
      canopy: 1,
      bailout_proximity: 1,
      ped_count: Array(168).fill(1),
      open_venues: Array(168).fill(1),
    };

    const score = computeScore(metrics, 0);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it("should return 0.0 for a zero-score edge at any time", () => {
    const metrics: EdgeMetrics = {
      lux: 0,
      gentle_gradient: 0,
      surface_quality: 0,
      canopy: 0,
      bailout_proximity: 0,
      ped_count: Array(168).fill(0),
      open_venues: Array(168).fill(0),
    };

    const score = computeScore(metrics, 0);
    expect(score).toBeCloseTo(0.0, 5);
  });

  it("should vary score based on time for time-varying metrics", () => {
    const metrics: EdgeMetrics = {
      lux: 0.5,
      gentle_gradient: 0.5,
      surface_quality: 0.5,
      canopy: 0.5,
      bailout_proximity: 0.5,
      ped_count: Array.from({ length: 168 }, (_, i) => (i === 0 ? 1.0 : 0.0)),
      open_venues: Array.from({ length: 168 }, (_, i) => (i === 0 ? 1.0 : 0.0)),
    };

    const scoreAtZero = computeScore(metrics, 0);
    const scoreAtOne = computeScore(metrics, 1);
    expect(scoreAtZero).toBeGreaterThan(scoreAtOne);
  });

  it("should have weights that sum to 1", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
npx vitest run app/lib/scoring.test.ts
```

Expected: FAIL.

- [ ] **Step 8: Implement scoring module**

Write `app/lib/scoring.ts`:

```typescript
import type { EdgeMetrics } from "./types";

export const WEIGHTS = {
  lux: 0.25,
  ped_count: 0.20,
  gentle_gradient: 0.10,
  surface_quality: 0.10,
  canopy: 0.10,
  bailout_proximity: 0.10,
  open_venues: 0.15,
} as const;

export const ALPHA = 1.5;

export const computeScore = (metrics: EdgeMetrics, hourOfWeek: number): number => {
  return (
    WEIGHTS.lux * metrics.lux +
    WEIGHTS.ped_count * metrics.ped_count[hourOfWeek] +
    WEIGHTS.gentle_gradient * metrics.gentle_gradient +
    WEIGHTS.surface_quality * metrics.surface_quality +
    WEIGHTS.canopy * metrics.canopy +
    WEIGHTS.bailout_proximity * metrics.bailout_proximity +
    WEIGHTS.open_venues * metrics.open_venues[hourOfWeek]
  );
};

export const edgeCost = (lengthM: number, score: number): number => {
  return lengthM * (1 + ALPHA * (1 - score));
};
```

- [ ] **Step 9: Run test to verify it passes**

```bash
npx vitest run app/lib/scoring.test.ts
```

Expected: PASS.

- [ ] **Step 10: Write failing test for colors module**

Write `app/lib/colors.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { scoreToColor } from "./colors";

describe("colors", () => {
  it("should return dim color for score 0", () => {
    const color = scoreToColor(0);
    expect(color).toEqual([80, 80, 80, 200]);
  });

  it("should return vibrant color for score 1", () => {
    const color = scoreToColor(1);
    expect(color).toEqual([0, 200, 120, 255]);
  });

  it("should interpolate for mid scores", () => {
    const color = scoreToColor(0.5);
    expect(color[0]).toBeGreaterThan(0);
    expect(color[0]).toBeLessThan(80);
    expect(color[3]).toBeGreaterThan(200);
    expect(color[3]).toBeLessThanOrEqual(255);
  });

  it("should clamp scores outside 0-1", () => {
    expect(scoreToColor(-0.5)).toEqual(scoreToColor(0));
    expect(scoreToColor(1.5)).toEqual(scoreToColor(1));
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

```bash
npx vitest run app/lib/colors.test.ts
```

Expected: FAIL.

- [ ] **Step 12: Implement colors module**

Write `app/lib/colors.ts`:

```typescript
const DIM: readonly [number, number, number, number] = [80, 80, 80, 200];
const VIBRANT: readonly [number, number, number, number] = [0, 200, 120, 255];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const scoreToColor = (score: number): [number, number, number, number] => {
  const t = clamp(score, 0, 1);
  return [
    Math.round(lerp(DIM[0], VIBRANT[0], t)),
    Math.round(lerp(DIM[1], VIBRANT[1], t)),
    Math.round(lerp(DIM[2], VIBRANT[2], t)),
    Math.round(lerp(DIM[3], VIBRANT[3], t)),
  ];
};

export const ROUTE_COLORS = [
  [59, 130, 246],
  [168, 85, 247],
  [249, 115, 22],
] as const;
```

- [ ] **Step 13: Run test to verify it passes**

```bash
npx vitest run app/lib/colors.test.ts
```

Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add app/lib/types.ts app/lib/time.ts app/lib/time.test.ts app/lib/scoring.ts app/lib/scoring.test.ts app/lib/colors.ts app/lib/colors.test.ts
git commit -m "feat: add shared types, time, scoring, and color modules with tests"
```

---

### Task 4: Geocoder Module

**Files:**
- Create: `app/lib/geocoder.ts`
- Create: `app/lib/geocoder.test.ts`

- [ ] **Step 1: Write failing test**

Write `app/lib/geocoder.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createGeocoder } from "./geocoder";
import type { AddressRecord } from "./types";

const ADDRESSES: AddressRecord[] = [
  { address: "123 Bourke Street", lng: 144.963, lat: -37.813, nearestNodeId: "n1" },
  { address: "456 Collins Street", lng: 144.960, lat: -37.815, nearestNodeId: "n2" },
  { address: "789 Swanston Street", lng: 144.963, lat: -37.810, nearestNodeId: "n3" },
  { address: "1 Carlton Gardens", lng: 144.971, lat: -37.806, nearestNodeId: "n4" },
];

describe("geocoder", () => {
  it("should return exact match first", () => {
    const geocoder = createGeocoder(ADDRESSES);
    const results = geocoder.search("123 Bourke Street");
    expect(results[0].address).toBe("123 Bourke Street");
  });

  it("should match partial input", () => {
    const geocoder = createGeocoder(ADDRESSES);
    const results = geocoder.search("Bourke");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].address).toContain("Bourke");
  });

  it("should be case-insensitive", () => {
    const geocoder = createGeocoder(ADDRESSES);
    const results = geocoder.search("bourke");
    expect(results.length).toBeGreaterThan(0);
  });

  it("should return empty array for no match", () => {
    const geocoder = createGeocoder(ADDRESSES);
    const results = geocoder.search("zzzzz");
    expect(results).toEqual([]);
  });

  it("should limit results", () => {
    const geocoder = createGeocoder(ADDRESSES);
    const results = geocoder.search("Street", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/lib/geocoder.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement geocoder**

Write `app/lib/geocoder.ts`:

```typescript
import type { AddressRecord } from "./types";

interface Geocoder {
  readonly search: (query: string, limit?: number) => readonly AddressRecord[];
}

export const createGeocoder = (addresses: readonly AddressRecord[]): Geocoder => {
  const normalized = addresses.map((a) => ({
    record: a,
    lower: a.address.toLowerCase(),
  }));

  const search = (query: string, limit: number = 5): readonly AddressRecord[] => {
    const q = query.toLowerCase().trim();
    if (q.length === 0) {
      return [];
    }

    const scored: { record: AddressRecord; score: number }[] = [];

    for (const { record, lower } of normalized) {
      if (lower === q) {
        scored.push({ record, score: 3 });
      } else if (lower.startsWith(q)) {
        scored.push({ record, score: 2 });
      } else if (lower.includes(q)) {
        scored.push({ record, score: 1 });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.record);
  };

  return { search };
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/lib/geocoder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/geocoder.ts app/lib/geocoder.test.ts
git commit -m "feat: add fuzzy geocoder with tests"
```

---

### Task 5: Graph Loading Module

**Files:**
- Create: `app/lib/graph.ts`
- Create: `app/lib/graph.test.ts`

- [ ] **Step 1: Write failing test**

Write `app/lib/graph.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { findNearestNode, getEdgesInBounds } from "./graph";
import type { GraphNode, GraphEdge, EdgeMetrics } from "./types";

const ZERO_METRICS: EdgeMetrics = {
  lux: 0,
  gentle_gradient: 0,
  surface_quality: 0,
  canopy: 0,
  bailout_proximity: 0,
  ped_count: Array(168).fill(0),
  open_venues: Array(168).fill(0),
};

const NODES: GraphNode[] = [
  { id: "n1", lng: 144.963, lat: -37.813 },
  { id: "n2", lng: 144.960, lat: -37.815 },
  { id: "n3", lng: 144.971, lat: -37.806 },
];

const EDGES: GraphEdge[] = [
  {
    id: "e1", from: "n1", to: "n2",
    geometry: [[144.963, -37.813], [144.960, -37.815]],
    length_m: 300, street_name: "Bourke St",
    metrics: ZERO_METRICS,
    confidence: { ped_count: { distance_to_sensor_m: 50 } },
  },
  {
    id: "e2", from: "n1", to: "n3",
    geometry: [[144.963, -37.813], [144.971, -37.806]],
    length_m: 500, street_name: "Swanston St",
    metrics: ZERO_METRICS,
    confidence: { ped_count: { distance_to_sensor_m: 100 } },
  },
];

describe("graph", () => {
  it("should find nearest node to a point", () => {
    const nearest = findNearestNode(NODES, 144.962, -37.814);
    expect(nearest.id).toBe("n1");
  });

  it("should filter edges within bounds", () => {
    const result = getEdgesInBounds(EDGES, {
      minLng: 144.955, maxLng: 144.965,
      minLat: -37.820, maxLat: -37.810,
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("e1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/lib/graph.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement graph module**

Write `app/lib/graph.ts`:

```typescript
import { readFile } from "node:fs/promises";

import type { GraphArtifact, GraphEdge, GraphNode } from "./types";

export const loadGraphArtifact = async (path: string): Promise<GraphArtifact> => {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as GraphArtifact;
};

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/lib/graph.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/graph.ts app/lib/graph.test.ts
git commit -m "feat: add graph loading and spatial query module with tests"
```

---

### Task 6: Routing Module (A* with ngraph.path)

**Files:**
- Create: `app/lib/routing.ts`
- Create: `app/lib/routing.test.ts`

- [ ] **Step 1: Write failing test**

Write `app/lib/routing.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildRoutingGraph, computeRoutes } from "./routing";
import type { GraphEdge, GraphNode, EdgeMetrics } from "./types";

const makeMetrics = (score: number): EdgeMetrics => ({
  lux: score,
  gentle_gradient: score,
  surface_quality: score,
  canopy: score,
  bailout_proximity: score,
  ped_count: Array(168).fill(score),
  open_venues: Array(168).fill(score),
});

const NODES: GraphNode[] = [
  { id: "a", lng: 0, lat: 0 },
  { id: "b", lng: 1, lat: 0 },
  { id: "c", lng: 2, lat: 0 },
  { id: "d", lng: 1, lat: 1 },
];

const EDGES: GraphEdge[] = [
  {
    id: "e1", from: "a", to: "b",
    geometry: [[0, 0], [1, 0]], length_m: 100,
    street_name: "Main St", metrics: makeMetrics(0.8),
    confidence: { ped_count: { distance_to_sensor_m: 10 } },
  },
  {
    id: "e2", from: "b", to: "c",
    geometry: [[1, 0], [2, 0]], length_m: 100,
    street_name: "Main St", metrics: makeMetrics(0.8),
    confidence: { ped_count: { distance_to_sensor_m: 10 } },
  },
  {
    id: "e3", from: "a", to: "d",
    geometry: [[0, 0], [1, 1]], length_m: 141,
    street_name: "Side St", metrics: makeMetrics(0.3),
    confidence: { ped_count: { distance_to_sensor_m: 200 } },
  },
  {
    id: "e4", from: "d", to: "c",
    geometry: [[1, 1], [2, 0]], length_m: 141,
    street_name: "Side St", metrics: makeMetrics(0.3),
    confidence: { ped_count: { distance_to_sensor_m: 200 } },
  },
];

describe("routing", () => {
  it("should build a routing graph from edges", () => {
    const graph = buildRoutingGraph(EDGES, 0);
    expect(graph.getNodesCount()).toBe(4);
    expect(graph.getLinksCount()).toBe(4);
  });

  it("should compute routes from A to C", () => {
    const routes = computeRoutes(NODES, EDGES, "a", "c", 0);
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes.length).toBeLessThanOrEqual(3);
    expect(routes[0].score).toBeGreaterThanOrEqual(routes[routes.length - 1].score);
  });

  it("should prefer high-score edges", () => {
    const routes = computeRoutes(NODES, EDGES, "a", "c", 0);
    const firstRouteEdgeIds = routes[0].edges.map((e) => e.id);
    expect(firstRouteEdgeIds).toContain("e1");
    expect(firstRouteEdgeIds).toContain("e2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/lib/routing.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement routing module**

Write `app/lib/routing.ts`:

```typescript
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

    graph.addLink(edge.from, edge.to, { edge, cost });
    graph.addLink(edge.to, edge.from, { edge, cost });
  }

  return graph;
};

const findRoute = (
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  fromId: string,
  toId: string,
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

  const pathNodeIds = path.map((p) => String(p.id));
  const routeEdges: GraphEdge[] = [];
  const geometry: [number, number][] = [];
  let totalLength = 0;
  let totalScore = 0;

  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const a = pathNodeIds[i];
    const b = pathNodeIds[i + 1];
    const edge = edges.find(
      (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
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
  fromId: string,
  toId: string,
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/lib/routing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/routing.ts app/lib/routing.test.ts
git commit -m "feat: add A* routing with 3-route differentiation and tests"
```

---

### Task 7: Build-Time Ingestion Pipeline

**Files:**
- Create: `scripts/ingest/index.ts`
- Create: `scripts/ingest/datasets.ts`
- Create: `scripts/ingest/network.ts`
- Create: `scripts/ingest/metrics.ts`
- Create: `scripts/ingest/normalize.ts`
- Create: `scripts/ingest/output.ts`
- Create: `scripts/tsconfig.json`

- [ ] **Step 1: Add tsx for running TypeScript scripts**

```bash
npm install -D tsx
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "ingest": "tsx scripts/ingest/index.ts"
  }
}
```

- [ ] **Step 2: Create scripts tsconfig**

Write `scripts/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["ingest/**/*.ts"]
}
```

- [ ] **Step 3: Implement dataset fetchers**

Write `scripts/ingest/datasets.ts`:

```typescript
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "data", "raw");

const COM_DATASETS = {
  pedestrianNetwork: {
    name: "Pedestrian Network",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/pedestrian-network?method=export&type=GeoJSON",
  },
  pedestrianCounting: {
    name: "Pedestrian Counting Sensors",
    url: "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-sensor-locations/exports/geojson",
  },
  pedestrianCounts: {
    name: "Pedestrian Counts (Monthly)",
    url: "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-monthly-counts-per-hour/exports/csv?limit=-1&timezone=Australia%2FMelbourne",
  },
  streetLights: {
    name: "Street Lights",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/street-lights?method=export&type=GeoJSON",
  },
  trees: {
    name: "Trees with Canopy",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/trees-with-canopy-cover?method=export&type=GeoJSON",
  },
  footpathQuality: {
    name: "Footpath Quality",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/footpath-quality?method=export&type=GeoJSON",
  },
  tramStops: {
    name: "Tram Stops",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/tram-stops?method=export&type=GeoJSON",
  },
  streetAddresses: {
    name: "Street Addresses",
    url: "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/street-addresses/exports/csv?limit=-1&timezone=Australia%2FMelbourne",
  },
} as const;

type DatasetKey = keyof typeof COM_DATASETS;

const fetchDataset = async (key: DatasetKey): Promise<string> => {
  const dataset = COM_DATASETS[key];
  const ext = dataset.url.includes("GeoJSON") || dataset.url.includes("geojson") ? "geojson" : "csv";
  const cachePath = join(CACHE_DIR, `${key}.${ext}`);

  if (existsSync(cachePath)) {
    console.log(`  [cached] ${dataset.name}`);
    const { readFile } = await import("node:fs/promises");
    return readFile(cachePath, "utf-8");
  }

  console.log(`  [fetch] ${dataset.name}...`);
  const response = await fetch(dataset.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${dataset.name}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  await writeFile(cachePath, text, "utf-8");
  return text;
};

export interface RawDatasets {
  readonly pedestrianNetwork: unknown;
  readonly pedestrianCounting: unknown;
  readonly pedestrianCounts: string;
  readonly streetLights: unknown;
  readonly trees: unknown;
  readonly footpathQuality: unknown;
  readonly tramStops: unknown;
  readonly streetAddresses: string;
}

export const fetchAllDatasets = async (): Promise<RawDatasets> => {
  console.log("Fetching CoM datasets...");
  await mkdir(CACHE_DIR, { recursive: true });

  const [
    pedestrianNetwork,
    pedestrianCounting,
    pedestrianCounts,
    streetLights,
    trees,
    footpathQuality,
    tramStops,
    streetAddresses,
  ] = await Promise.all([
    fetchDataset("pedestrianNetwork").then((t) => JSON.parse(t)),
    fetchDataset("pedestrianCounting").then((t) => JSON.parse(t)),
    fetchDataset("pedestrianCounts"),
    fetchDataset("streetLights").then((t) => JSON.parse(t)),
    fetchDataset("trees").then((t) => JSON.parse(t)),
    fetchDataset("footpathQuality").then((t) => JSON.parse(t)),
    fetchDataset("tramStops").then((t) => JSON.parse(t)),
    fetchDataset("streetAddresses"),
  ]);

  console.log("All datasets fetched.");
  return {
    pedestrianNetwork,
    pedestrianCounting,
    pedestrianCounts,
    streetLights,
    trees,
    footpathQuality,
    tramStops,
    streetAddresses,
  };
};
```

- [ ] **Step 4: Implement network builder**

Write `scripts/ingest/network.ts`:

This module takes the CoM Pedestrian Network GeoJSON and builds graph nodes + edges. The GeoJSON features are LineStrings representing walkable segments.

```typescript
interface GeoJsonFeature {
  type: "Feature";
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: number[][] | number[][][];
  };
  properties: Record<string, unknown>;
}

interface GeoJsonCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

interface RawNode {
  id: string;
  lng: number;
  lat: number;
}

interface RawEdge {
  id: string;
  from: string;
  to: string;
  geometry: [number, number][];
  length_m: number;
  street_name: string;
}

const coordKey = (lng: number, lat: number): string =>
  `${lng.toFixed(7)},${lat.toFixed(7)}`;

const haversineDistance = (
  lng1: number, lat1: number, lng2: number, lat2: number,
): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const buildNetwork = (
  geojson: unknown,
): { nodes: RawNode[]; edges: RawEdge[] } => {
  const fc = geojson as GeoJsonCollection;
  const nodeMap = new Map<string, RawNode>();
  const edges: RawEdge[] = [];
  let edgeCounter = 0;

  const getOrCreateNode = (lng: number, lat: number): string => {
    const key = coordKey(lng, lat);
    if (!nodeMap.has(key)) {
      nodeMap.set(key, { id: `n_${nodeMap.size}`, lng, lat });
    }
    return nodeMap.get(key)!.id;
  };

  for (const feature of fc.features) {
    const lines: number[][][] =
      feature.geometry.type === "MultiLineString"
        ? (feature.geometry.coordinates as number[][][])
        : [feature.geometry.coordinates as number[][]];

    const streetName =
      (feature.properties.street_name as string) ??
      (feature.properties.name as string) ??
      "Unknown";

    for (const coords of lines) {
      if (coords.length < 2) { continue; }

      const fromCoord = coords[0];
      const toCoord = coords[coords.length - 1];
      const fromId = getOrCreateNode(fromCoord[0], fromCoord[1]);
      const toId = getOrCreateNode(toCoord[0], toCoord[1]);

      let length = 0;
      for (let i = 1; i < coords.length; i++) {
        length += haversineDistance(
          coords[i - 1][0], coords[i - 1][1],
          coords[i][0], coords[i][1],
        );
      }

      edges.push({
        id: `e_${edgeCounter++}`,
        from: fromId,
        to: toId,
        geometry: coords.map((c) => [c[0], c[1]] as [number, number]),
        length_m: Math.round(length),
        street_name: streetName,
      });
    }
  }

  console.log(`  Network: ${nodeMap.size} nodes, ${edges.length} edges`);
  return { nodes: Array.from(nodeMap.values()), edges };
};
```

- [ ] **Step 5: Implement metrics computation**

Write `scripts/ingest/metrics.ts`:

This module computes per-edge metrics by spatially joining lights, trees, sensors, etc. to each edge.

```typescript
interface RawEdge {
  id: string;
  from: string;
  to: string;
  geometry: [number, number][];
  length_m: number;
  street_name: string;
}

interface PointFeature {
  geometry: { coordinates: number[] };
  properties: Record<string, unknown>;
}

interface GeoJsonCollection {
  type: "FeatureCollection";
  features: PointFeature[];
}

interface SensorHourlyCounts {
  sensorId: string;
  lng: number;
  lat: number;
  hourly: number[];
}

interface EdgeWithMetrics extends RawEdge {
  metrics: {
    lux: number;
    gentle_gradient: number;
    surface_quality: number;
    canopy: number;
    bailout_proximity: number;
    ped_count: number[];
    open_venues: number[];
  };
  confidence: {
    ped_count: { distance_to_sensor_m: number };
  };
}

const edgeMidpoint = (geometry: [number, number][]): [number, number] => {
  const mid = Math.floor(geometry.length / 2);
  return geometry[mid];
};

const distToEdge = (
  point: [number, number],
  edgeMid: [number, number],
): number => {
  const dLng = (point[0] - edgeMid[0]) * 111320 * Math.cos((edgeMid[1] * Math.PI) / 180);
  const dLat = (point[1] - edgeMid[1]) * 110540;
  return Math.sqrt(dLng * dLng + dLat * dLat);
};

const countFeaturesNear = (
  features: readonly PointFeature[],
  edgeMid: [number, number],
  radiusM: number,
): number => {
  let count = 0;
  for (const f of features) {
    const pt: [number, number] = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
    if (distToEdge(pt, edgeMid) <= radiusM) {
      count++;
    }
  }
  return count;
};

const nearestFeatureDist = (
  features: readonly PointFeature[],
  edgeMid: [number, number],
): number => {
  let minDist = Infinity;
  for (const f of features) {
    const pt: [number, number] = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
    const d = distToEdge(pt, edgeMid);
    if (d < minDist) { minDist = d; }
  }
  return minDist;
};

export const parseSensorCounts = (
  sensorLocations: unknown,
  countsCsv: string,
): SensorHourlyCounts[] => {
  const sensorGeo = sensorLocations as GeoJsonCollection;
  const sensorMap = new Map<string, { lng: number; lat: number }>();

  for (const f of sensorGeo.features) {
    const id = String(f.properties.sensor_id ?? f.properties.id ?? "");
    if (id) {
      sensorMap.set(id, {
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      });
    }
  }

  const lines = countsCsv.split("\n");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const sensorIdIdx = header.findIndex((h) => h.includes("sensor_id"));
  const dayIdx = header.findIndex((h) => h.includes("day"));
  const timeIdx = header.findIndex((h) => h.includes("time") || h.includes("hour"));
  const countIdx = header.findIndex((h) => h.includes("count") || h.includes("hourly"));

  const hourlyBySensor = new Map<string, number[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < Math.max(sensorIdIdx, dayIdx, timeIdx, countIdx) + 1) { continue; }

    const sensorId = cols[sensorIdIdx]?.trim();
    const dayOfWeek = parseInt(cols[dayIdx], 10);
    const hour = parseInt(cols[timeIdx], 10);
    const count = parseInt(cols[countIdx], 10);

    if (!sensorId || isNaN(dayOfWeek) || isNaN(hour) || isNaN(count)) { continue; }

    if (!hourlyBySensor.has(sensorId)) {
      hourlyBySensor.set(sensorId, Array(168).fill(0));
    }
    const idx = dayOfWeek * 24 + hour;
    if (idx >= 0 && idx < 168) {
      const arr = hourlyBySensor.get(sensorId)!;
      arr[idx] = (arr[idx] + count) / 2;
    }
  }

  const result: SensorHourlyCounts[] = [];
  for (const [sensorId, hourly] of hourlyBySensor) {
    const loc = sensorMap.get(sensorId);
    if (loc) {
      result.push({ sensorId, lng: loc.lng, lat: loc.lat, hourly });
    }
  }

  console.log(`  Parsed ${result.length} sensors with hourly counts`);
  return result;
};

const idwInterpolate = (
  sensors: readonly SensorHourlyCounts[],
  edgeMid: [number, number],
  maxDistM: number = 500,
): { counts: number[]; nearestDist: number } => {
  const nearby: { sensor: SensorHourlyCounts; dist: number }[] = [];

  for (const sensor of sensors) {
    const d = distToEdge([sensor.lng, sensor.lat], edgeMid);
    if (d <= maxDistM) {
      nearby.push({ sensor, dist: Math.max(d, 1) });
    }
  }

  if (nearby.length === 0) {
    const nearest = sensors.reduce((best, s) => {
      const d = distToEdge([s.lng, s.lat], edgeMid);
      return d < best.dist ? { sensor: s, dist: d } : best;
    }, { sensor: sensors[0], dist: Infinity });
    return { counts: nearest.sensor.hourly, nearestDist: nearest.dist };
  }

  const counts = Array(168).fill(0);
  let totalWeight = 0;

  for (const { sensor, dist } of nearby) {
    const weight = 1 / (dist * dist);
    totalWeight += weight;
    for (let h = 0; h < 168; h++) {
      counts[h] += sensor.hourly[h] * weight;
    }
  }

  for (let h = 0; h < 168; h++) {
    counts[h] /= totalWeight;
  }

  return { counts, nearestDist: nearby[0].dist };
};

export const computeEdgeMetrics = (
  edges: readonly RawEdge[],
  streetLights: unknown,
  trees: unknown,
  footpathQuality: unknown,
  tramStops: unknown,
  sensors: readonly SensorHourlyCounts[],
): EdgeWithMetrics[] => {
  const lights = (streetLights as GeoJsonCollection).features;
  const treeFeatures = (trees as GeoJsonCollection).features;
  const footpaths = (footpathQuality as GeoJsonCollection).features;
  const trams = (tramStops as GeoJsonCollection).features;

  console.log(`  Computing metrics for ${edges.length} edges...`);

  return edges.map((edge, i) => {
    if (i % 1000 === 0 && i > 0) {
      console.log(`    ${i}/${edges.length}`);
    }

    const mid = edgeMidpoint(edge.geometry);

    const lightCount = countFeaturesNear(lights, mid, 50);
    const lux = Math.min(lightCount / 5, 1);

    const treeCount = countFeaturesNear(treeFeatures, mid, 30);
    const canopy = Math.min(treeCount / 8, 1);

    const nearestTram = nearestFeatureDist(trams, mid);
    const bailout_proximity = Math.max(0, 1 - nearestTram / 500);

    const nearFootpath = footpaths.filter(
      (f) => distToEdge([f.geometry.coordinates[0], f.geometry.coordinates[1]], mid) < 30,
    );
    const surface_quality =
      nearFootpath.length > 0
        ? nearFootpath.reduce((sum, f) => {
            const rating = Number(f.properties.condition_rating ?? f.properties.quality ?? 3);
            return sum + rating / 5;
          }, 0) / nearFootpath.length
        : 0.5;

    const { counts: ped_count, nearestDist } = idwInterpolate(sensors, mid);

    const gentle_gradient = 0.7;

    const open_venues = Array(168).fill(0.5);

    return {
      ...edge,
      metrics: {
        lux,
        gentle_gradient,
        surface_quality,
        canopy,
        bailout_proximity,
        ped_count,
        open_venues,
      },
      confidence: {
        ped_count: { distance_to_sensor_m: Math.round(nearestDist) },
      },
    };
  });
};
```

- [ ] **Step 6: Implement normalization**

Write `scripts/ingest/normalize.ts`:

```typescript
interface EdgeWithMetrics {
  metrics: {
    lux: number;
    gentle_gradient: number;
    surface_quality: number;
    canopy: number;
    bailout_proximity: number;
    ped_count: number[];
    open_venues: number[];
  };
  [key: string]: unknown;
}

const normalizeArray = (values: readonly number[]): number[] => {
  const max = Math.max(...values);
  if (max === 0) { return values.map(() => 0); }
  return values.map((v) => v / max);
};

export const normalizeEdges = <T extends EdgeWithMetrics>(edges: readonly T[]): T[] => {
  const maxLux = Math.max(...edges.map((e) => e.metrics.lux));
  const maxCanopy = Math.max(...edges.map((e) => e.metrics.canopy));
  const maxPedCount = Math.max(...edges.flatMap((e) => e.metrics.ped_count));

  console.log(`  Normalizing: maxLux=${maxLux.toFixed(2)}, maxCanopy=${maxCanopy.toFixed(2)}, maxPed=${maxPedCount.toFixed(0)}`);

  return edges.map((edge) => ({
    ...edge,
    metrics: {
      ...edge.metrics,
      lux: maxLux > 0 ? edge.metrics.lux / maxLux : 0,
      canopy: maxCanopy > 0 ? edge.metrics.canopy / maxCanopy : 0,
      ped_count: maxPedCount > 0
        ? edge.metrics.ped_count.map((v) => v / maxPedCount)
        : edge.metrics.ped_count,
    },
  }));
};
```

- [ ] **Step 7: Implement output writer**

Write `scripts/ingest/output.ts`:

```typescript
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { GraphArtifact, AddressRecord, GraphNode } from "../../app/lib/types";

const OUTPUT_DIR = join(process.cwd(), "data");

const findNearestNode = (nodes: readonly GraphNode[], lng: number, lat: number): string => {
  let nearestId = nodes[0].id;
  let minDist = Infinity;

  for (const node of nodes) {
    const d = (node.lng - lng) ** 2 + (node.lat - lat) ** 2;
    if (d < minDist) {
      minDist = d;
      nearestId = node.id;
    }
  }

  return nearestId;
};

export const parseAddresses = (
  csv: string,
  nodes: readonly GraphNode[],
): AddressRecord[] => {
  const lines = csv.split("\n");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const addrIdx = header.findIndex((h) => h.includes("address") || h.includes("full_address"));
  const lngIdx = header.findIndex((h) => h.includes("lon") || h.includes("lng") || h.includes("x"));
  const latIdx = header.findIndex((h) => h.includes("lat") || h.includes("y"));

  const addresses: AddressRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const address = cols[addrIdx]?.trim();
    const lng = parseFloat(cols[lngIdx]);
    const lat = parseFloat(cols[latIdx]);

    if (!address || isNaN(lng) || isNaN(lat)) { continue; }

    addresses.push({
      address,
      lng,
      lat,
      nearestNodeId: findNearestNode(nodes, lng, lat),
    });
  }

  console.log(`  Parsed ${addresses.length} addresses`);
  return addresses;
};

export const writeGraphArtifact = async (artifact: GraphArtifact): Promise<void> => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, "graph.json");
  await writeFile(path, JSON.stringify(artifact), "utf-8");
  const sizeMb = (Buffer.byteLength(JSON.stringify(artifact)) / 1024 / 1024).toFixed(1);
  console.log(`  Graph artifact written to ${path} (${sizeMb} MB)`);
};
```

- [ ] **Step 8: Implement pipeline orchestrator**

Write `scripts/ingest/index.ts`:

```typescript
import { fetchAllDatasets } from "./datasets";
import { buildNetwork } from "./network";
import { computeEdgeMetrics, parseSensorCounts } from "./metrics";
import { normalizeEdges } from "./normalize";
import { parseAddresses, writeGraphArtifact } from "./output";
import type { GraphArtifact } from "../../app/lib/types";

const run = async (): Promise<void> => {
  console.log("=== CityStride Ingestion Pipeline ===\n");

  const datasets = await fetchAllDatasets();

  console.log("\nBuilding pedestrian network...");
  const { nodes, edges } = buildNetwork(datasets.pedestrianNetwork);

  console.log("\nParsing sensor data...");
  const sensors = parseSensorCounts(
    datasets.pedestrianCounting,
    datasets.pedestrianCounts,
  );

  console.log("\nComputing edge metrics...");
  const edgesWithMetrics = computeEdgeMetrics(
    edges,
    datasets.streetLights,
    datasets.trees,
    datasets.footpathQuality,
    datasets.tramStops,
    sensors,
  );

  console.log("\nNormalizing metrics...");
  const normalizedEdges = normalizeEdges(edgesWithMetrics);

  console.log("\nParsing addresses...");
  const addresses = parseAddresses(datasets.streetAddresses, nodes);

  console.log("\nWriting graph artifact...");
  const lngs = nodes.map((n) => n.lng);
  const lats = nodes.map((n) => n.lat);

  const artifact: GraphArtifact = {
    nodes,
    edges: normalizedEdges,
    addresses,
    bounds: {
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
    },
  };

  await writeGraphArtifact(artifact);

  console.log("\n=== Pipeline complete ===");
  console.log(`  ${nodes.length} nodes`);
  console.log(`  ${normalizedEdges.length} edges`);
  console.log(`  ${addresses.length} addresses`);
};

run().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
```

- [ ] **Step 9: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: add build-time ingestion pipeline for CoM datasets"
```

---

### Task 8: App State and Hooks

**Files:**
- Create: `app/hooks/use-app-state.ts`
- Create: `app/hooks/use-graph.ts`
- Create: `app/hooks/use-routes.ts`

- [ ] **Step 1: Implement app state hook**

Write `app/hooks/use-app-state.ts`:

```typescript
import { useState, useCallback } from "react";

import { INITIAL_HOUR_OF_WEEK } from "~/lib/time";
import type { AppState, Route } from "~/lib/types";

const INITIAL_STATE: AppState = {
  viewport: { lng: 144.963, lat: -37.814, zoom: 15 },
  time: INITIAL_HOUR_OF_WEEK,
  routeQuery: null,
  routes: null,
  routeComputedAt: null,
  pinnedSegmentId: null,
  openExplanationRouteId: null,
};

export const useAppState = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);

  const setTime = useCallback((time: number) => {
    setState((prev) => ({ ...prev, time }));
  }, []);

  const setPinnedSegment = useCallback((pinnedSegmentId: string | null) => {
    setState((prev) => ({ ...prev, pinnedSegmentId }));
  }, []);

  const setRoutes = useCallback((routes: readonly Route[], computedAt: number) => {
    setState((prev) => ({
      ...prev,
      routes,
      routeComputedAt: computedAt,
    }));
  }, []);

  const clearRoutes = useCallback(() => {
    setState((prev) => ({
      ...prev,
      routes: null,
      routeQuery: null,
      routeComputedAt: null,
    }));
  }, []);

  const setRouteQuery = useCallback(
    (query: AppState["routeQuery"]) => {
      setState((prev) => ({ ...prev, routeQuery: query }));
    },
    [],
  );

  const setOpenExplanation = useCallback((routeId: number | null) => {
    setState((prev) => ({ ...prev, openExplanationRouteId: routeId }));
  }, []);

  const isStale =
    state.routes !== null &&
    state.routeComputedAt !== null &&
    state.routeComputedAt !== state.time;

  return {
    state,
    setTime,
    setPinnedSegment,
    setRoutes,
    clearRoutes,
    setRouteQuery,
    setOpenExplanation,
    isStale,
  };
};
```

- [ ] **Step 2: Implement graph context**

Write `app/hooks/use-graph.ts`:

```typescript
import { createContext, useContext } from "react";

import type { GraphArtifact } from "~/lib/types";

const GraphContext = createContext<GraphArtifact | null>(null);

export const GraphProvider = GraphContext.Provider;

export const useGraph = (): GraphArtifact => {
  const graph = useContext(GraphContext);
  if (!graph) {
    throw new Error("useGraph must be used within a GraphProvider");
  }
  return graph;
};
```

- [ ] **Step 3: Implement routes hook**

Write `app/hooks/use-routes.ts`:

```typescript
import { useCallback, useState } from "react";

import { computeRoutes } from "~/lib/routing";
import type { GraphArtifact, Route } from "~/lib/types";

interface UseRoutesResult {
  readonly routes: readonly Route[] | null;
  readonly isComputing: boolean;
  readonly compute: (fromNode: string, toNode: string, hourOfWeek: number) => void;
  readonly clear: () => void;
  readonly computedAt: number | null;
}

export const useRouteComputation = (graph: GraphArtifact): UseRoutesResult => {
  const [routes, setRoutes] = useState<readonly Route[] | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [computedAt, setComputedAt] = useState<number | null>(null);

  const compute = useCallback(
    (fromNode: string, toNode: string, hourOfWeek: number) => {
      setIsComputing(true);
      requestAnimationFrame(() => {
        const result = computeRoutes(graph.nodes, graph.edges, fromNode, toNode, hourOfWeek);
        setRoutes(result);
        setComputedAt(hourOfWeek);
        setIsComputing(false);
      });
    },
    [graph],
  );

  const clear = useCallback(() => {
    setRoutes(null);
    setComputedAt(null);
  }, []);

  return { routes, isComputing, compute, clear, computedAt };
};
```

- [ ] **Step 4: Commit**

```bash
git add app/hooks/
git commit -m "feat: add app state, graph context, and route computation hooks"
```

---

### Task 9: ClientOnly Wrapper and Map Component

**Files:**
- Create: `app/components/client-only.tsx`
- Create: `app/components/map/city-map.tsx`
- Create: `app/components/map/map-tooltip.tsx`

- [ ] **Step 1: Implement ClientOnly wrapper**

Write `app/components/client-only.tsx`:

```tsx
import { useState, useEffect, type ReactNode } from "react";

interface ClientOnlyProps {
  readonly children: () => ReactNode;
  readonly fallback?: ReactNode;
}

export const ClientOnly = ({ children, fallback = null }: ClientOnlyProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children()}</>;
};
```

- [ ] **Step 2: Implement CityMap component**

Write `app/components/map/city-map.tsx`:

```tsx
import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Deck } from "@deck.gl/core";
import { PathLayer } from "@deck.gl/layers";

import { useGraph } from "~/hooks/use-graph";
import { computeScore } from "~/lib/scoring";
import { scoreToColor, ROUTE_COLORS } from "~/lib/colors";
import type { GraphEdge, Route } from "~/lib/types";

import { MapTooltip } from "./map-tooltip";

interface CityMapProps {
  readonly time: number;
  readonly routes: readonly Route[] | null;
  readonly pinnedSegmentId: string | null;
  readonly onHoverSegment: (edge: GraphEdge | null) => void;
  readonly onClickSegment: (edge: GraphEdge | null) => void;
}

export const CityMap = ({
  time,
  routes,
  pinnedSegmentId,
  onHoverSegment,
  onClickSegment,
}: CityMapProps) => {
  const graph = useGraph();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{
    edge: GraphEdge;
    x: number;
    y: number;
  } | null>(null);

  const updateLayers = useCallback(() => {
    if (!deckRef.current) { return; }

    const hasRoutes = routes && routes.length > 0;

    const streetscoreLayer = new PathLayer<GraphEdge>({
      id: "streetscore",
      data: graph.edges as GraphEdge[],
      getPath: (d) => d.geometry,
      getColor: (d) => {
        const score = computeScore(d.metrics, time);
        const color = scoreToColor(score);
        if (hasRoutes) {
          return [color[0], color[1], color[2], 100] as [number, number, number, number];
        }
        return color;
      },
      getWidth: 3,
      widthMinPixels: 2,
      widthMaxPixels: 8,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 120],
      updateTriggers: {
        getColor: [time, hasRoutes],
      },
    });

    const layers = [streetscoreLayer];

    if (routes) {
      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
        layers.push(
          new PathLayer<Route>({
            id: `route-${route.id}`,
            data: [route],
            getPath: (d) => d.geometry,
            getColor: [...color, 220] as [number, number, number, number],
            getWidth: route.id === 1 ? 8 : 5,
            widthMinPixels: route.id === 1 ? 5 : 3,
            widthMaxPixels: 12,
            pickable: false,
          }),
        );
      }
    }

    deckRef.current.setProps({ layers });
  }, [graph, time, routes]);

  useEffect(() => {
    if (!containerRef.current) { return; }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [144.963, -37.814],
      zoom: 15,
      antialias: true,
    });

    const deck = new Deck({
      parent: containerRef.current,
      viewState: {
        longitude: 144.963,
        latitude: -37.814,
        zoom: 15,
      },
      controller: false,
      layers: [],
      getTooltip: () => null,
      onHover: (info) => {
        if (info.object) {
          setHoveredEdge({
            edge: info.object as GraphEdge,
            x: info.x,
            y: info.y,
          });
          onHoverSegment(info.object as GraphEdge);
        } else {
          setHoveredEdge(null);
          onHoverSegment(null);
        }
      },
      onClick: (info) => {
        if (info.object) {
          onClickSegment(info.object as GraphEdge);
        } else {
          onClickSegment(null);
        }
      },
    });

    map.on("move", () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      deck.setProps({
        viewState: {
          longitude: center.lng,
          latitude: center.lat,
          zoom,
          bearing,
          pitch,
        },
      });
    });

    mapRef.current = map;
    deckRef.current = deck;

    return () => {
      deck.finalize();
      map.remove();
    };
  }, []);

  useEffect(() => {
    updateLayers();
  }, [updateLayers]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {hoveredEdge && (
        <MapTooltip
          edge={hoveredEdge.edge}
          x={hoveredEdge.x}
          y={hoveredEdge.y}
          time={time}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 3: Implement MapTooltip**

Write `app/components/map/map-tooltip.tsx`:

```tsx
import { computeScore } from "~/lib/scoring";
import type { GraphEdge } from "~/lib/types";

interface MapTooltipProps {
  readonly edge: GraphEdge;
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

export const MapTooltip = ({ edge, x, y, time }: MapTooltipProps) => {
  const score = computeScore(edge.metrics, time);

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-md bg-gray-900 px-3 py-2 text-sm text-white shadow-lg"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="font-medium">{edge.street_name}</div>
      <div className="text-muted-foreground">
        Score: {(score * 100).toFixed(0)}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Commit**

```bash
git add app/components/client-only.tsx app/components/map/
git commit -m "feat: add ClientOnly wrapper, CityMap with Deck.gl, and MapTooltip"
```

---

### Task 10: UI Panels (TimeSlider, ScoreLegend, InspectorCard)

**Files:**
- Create: `app/components/slider/time-slider.tsx`
- Create: `app/components/legend/score-legend.tsx`
- Create: `app/components/inspector/inspector-card.tsx`

- [ ] **Step 1: Implement TimeSlider**

Write `app/components/slider/time-slider.tsx`:

```tsx
import { formatHourOfWeek } from "~/lib/time";

interface TimeSliderProps {
  readonly time: number;
  readonly onTimeChange: (time: number) => void;
  readonly isStale: boolean;
  readonly routeComputedAt: number | null;
  readonly onRecompute: () => void;
}

export const TimeSlider = ({
  time,
  onTimeChange,
  isStale,
  routeComputedAt,
  onRecompute,
}: TimeSliderProps) => {
  return (
    <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-gray-900/90 px-6 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-white min-w-[80px]">
          {formatHourOfWeek(time)}
        </span>
        <input
          type="range"
          min={0}
          max={167}
          value={time}
          onChange={(e) => onTimeChange(parseInt(e.target.value, 10))}
          className="w-64 accent-primary"
        />
      </div>
      {isStale && routeComputedAt !== null && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Routes computed for {formatHourOfWeek(routeComputedAt)}</span>
          <button
            onClick={onRecompute}
            className="text-primary underline hover:text-primary/80"
          >
            Recompute
          </button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Implement ScoreLegend**

Write `app/components/legend/score-legend.tsx`:

```tsx
export const ScoreLegend = () => {
  return (
    <div className="absolute right-4 top-4 z-30 rounded-lg bg-gray-900/90 px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Lower score</span>
        <div
          className="h-3 w-32 rounded-sm"
          style={{
            background: "linear-gradient(to right, rgb(80,80,80), rgb(0,200,120))",
          }}
        />
        <span className="text-xs text-muted-foreground">Higher score</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground max-w-[280px]">
        Score reflects lighting, foot traffic, gradient, surface, transit and canopy at the selected time.
      </p>
      <p className="mt-1 text-xs text-muted-foreground/60">
        Data: City of Melbourne open data.
      </p>
    </div>
  );
};
```

- [ ] **Step 3: Implement InspectorCard**

Write `app/components/inspector/inspector-card.tsx`:

```tsx
import { computeScore } from "~/lib/scoring";
import type { GraphEdge } from "~/lib/types";

interface InspectorCardProps {
  readonly edge: GraphEdge;
  readonly time: number;
  readonly onClose: () => void;
}

interface MetricBarProps {
  readonly label: string;
  readonly value: number;
  readonly rawLabel: string;
}

const MetricBar = ({ label, value, rawLabel }: MetricBarProps) => (
  <div className="flex items-center gap-2">
    <span className="w-24 text-xs text-muted-foreground">{label}</span>
    <div className="flex-1 h-2 rounded-full bg-gray-700">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${(value * 100).toFixed(0)}%` }}
      />
    </div>
    <span className="w-20 text-xs text-right text-muted-foreground">{rawLabel}</span>
  </div>
);

export const InspectorCard = ({ edge, time, onClose }: InspectorCardProps) => {
  const score = computeScore(edge.metrics, time);
  const m = edge.metrics;

  return (
    <div className="absolute bottom-24 left-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-white">{edge.street_name}</h3>
          <p className="text-sm text-primary">{(score * 100).toFixed(0)} / 100</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-white text-lg leading-none">
          &times;
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <MetricBar label="Lighting" value={m.lux} rawLabel={`${(m.lux * 100).toFixed(0)}%`} />
        <MetricBar
          label="Foot traffic"
          value={m.ped_count[time]}
          rawLabel={`${(m.ped_count[time] * 100).toFixed(0)}%`}
        />
        <MetricBar label="Gradient" value={m.gentle_gradient} rawLabel={`${(m.gentle_gradient * 100).toFixed(0)}%`} />
        <MetricBar label="Surface" value={m.surface_quality} rawLabel={`${(m.surface_quality * 100).toFixed(0)}%`} />
        <MetricBar label="Canopy" value={m.canopy} rawLabel={`${(m.canopy * 100).toFixed(0)}%`} />
        <MetricBar label="Transit" value={m.bailout_proximity} rawLabel={`${(m.bailout_proximity * 100).toFixed(0)}%`} />
        <MetricBar
          label="Venues"
          value={m.open_venues[time]}
          rawLabel={`${(m.open_venues[time] * 100).toFixed(0)}%`}
        />
      </div>

      {edge.confidence.ped_count.distance_to_sensor_m > 150 && (
        <p className="mt-2 text-xs text-muted-foreground/60">
          Estimated: {edge.confidence.ped_count.distance_to_sensor_m}m to nearest sensor
        </p>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Commit**

```bash
git add app/components/slider/ app/components/legend/ app/components/inspector/
git commit -m "feat: add TimeSlider, ScoreLegend, and InspectorCard panels"
```

---

### Task 11: PlanWalkPanel with Geocoder

**Files:**
- Create: `app/components/planner/plan-walk-panel.tsx`

- [ ] **Step 1: Implement PlanWalkPanel**

Write `app/components/planner/plan-walk-panel.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";

import { useGraph } from "~/hooks/use-graph";
import { createGeocoder } from "~/lib/geocoder";
import { ROUTE_COLORS } from "~/lib/colors";
import type { AddressRecord, Route } from "~/lib/types";

interface PlanWalkPanelProps {
  readonly routes: readonly Route[] | null;
  readonly isComputing: boolean;
  readonly onFindRoute: (fromNode: string, toNode: string) => void;
  readonly onClear: () => void;
  readonly onExplain: (routeId: number) => void;
}

export const PlanWalkPanel = ({
  routes,
  isComputing,
  onFindRoute,
  onClear,
  onExplain,
}: PlanWalkPanelProps) => {
  const graph = useGraph();
  const geocoderRef = useRef(createGeocoder(graph.addresses));

  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromMatch, setFromMatch] = useState<AddressRecord | null>(null);
  const [toMatch, setToMatch] = useState<AddressRecord | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<readonly AddressRecord[]>([]);
  const [toSuggestions, setToSuggestions] = useState<readonly AddressRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFromChange = (value: string) => {
    setFromText(value);
    setFromMatch(null);
    setError(null);
    setFromSuggestions(value.length >= 2 ? geocoderRef.current.search(value) : []);
  };

  const handleToChange = (value: string) => {
    setToText(value);
    setToMatch(null);
    setError(null);
    setToSuggestions(value.length >= 2 ? geocoderRef.current.search(value) : []);
  };

  const selectFrom = (addr: AddressRecord) => {
    setFromText(addr.address);
    setFromMatch(addr);
    setFromSuggestions([]);
  };

  const selectTo = (addr: AddressRecord) => {
    setToText(addr.address);
    setToMatch(addr);
    setToSuggestions([]);
  };

  const handleSubmit = () => {
    if (!fromMatch || !toMatch) {
      setError("Please select valid addresses from the suggestions.");
      return;
    }
    onFindRoute(fromMatch.nearestNodeId, toMatch.nearestNodeId);
  };

  return (
    <div className="absolute left-4 top-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
      <h2 className="text-sm font-semibold text-white mb-3">Plan a Walk</h2>

      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="From address..."
            value={fromText}
            onChange={(e) => handleFromChange(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          {fromSuggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {fromSuggestions.map((addr) => (
                <li key={addr.address}>
                  <button
                    onClick={() => selectFrom(addr)}
                    className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700"
                  >
                    {addr.address}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="To address..."
            value={toText}
            onChange={(e) => handleToChange(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          {toSuggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {toSuggestions.map((addr) => (
                <li key={addr.address}>
                  <button
                    onClick={() => selectTo(addr)}
                    className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700"
                  >
                    {addr.address}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={isComputing}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isComputing ? "Computing..." : "Find route"}
        </button>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>

      {routes && routes.length > 0 && (
        <div className="mt-3 border-t border-gray-700 pt-3">
          <div className="space-y-2">
            {routes.map((route, i) => {
              const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
              return (
                <div key={route.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})` }}
                    >
                      {route.id}
                    </span>
                    <div className="text-xs text-white">
                      <span className="font-medium">{(route.score * 100).toFixed(0)}</span>
                      <span className="text-muted-foreground ml-1">{route.length_m}m</span>
                    </div>
                    {route.id === 1 && (
                      <span className="text-xs text-primary">Recommended</span>
                    )}
                  </div>
                  <button
                    onClick={() => onExplain(route.id)}
                    className="text-xs text-muted-foreground underline hover:text-white"
                  >
                    Explain
                  </button>
                </div>
              );
            })}
          </div>
          <button
            onClick={onClear}
            className="mt-2 text-xs text-muted-foreground underline hover:text-white"
          >
            Clear routes
          </button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add app/components/planner/
git commit -m "feat: add PlanWalkPanel with geocoder autocomplete and route legend"
```

---

### Task 12: AI Explanation (API Route + SlideOut)

**Files:**
- Create: `app/routes/api.explain.ts`
- Create: `app/components/explain/explain-slide-out.tsx`

- [ ] **Step 1: Implement Claude API streaming proxy**

Write `app/routes/api.explain.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

import type { Route } from "~/lib/types";

export const action = async ({ request }: { request: Request }) => {
  const body = await request.json();
  const { route, time } = body as { route: Route; time: number };

  const client = new Anthropic();

  const systemPrompt = `You are a walking route advisor for Melbourne, Australia. You explain why a specific walking route was recommended by the CityStride app.

Rules:
- Use positive framing only. Describe what makes the route good, never what makes alternatives bad.
- Reference specific numbers from the route data (scores, distances, metrics).
- Acknowledge any data limitations (e.g., estimated pedestrian counts).
- Keep the explanation to 4-6 paragraphs, ~250 words max.
- Use descriptive language like "well-lit," "lively," "tree-lined" — never "safe" or "avoid."
- Do not mention crime, danger, or safety concerns.`;

  const edgeSummaries = route.edges.slice(0, 10).map((e) => ({
    street: e.street_name,
    length: e.length_m,
    lux: (e.metrics.lux * 100).toFixed(0),
    traffic: (e.metrics.ped_count[time] * 100).toFixed(0),
    canopy: (e.metrics.canopy * 100).toFixed(0),
    surface: (e.metrics.surface_quality * 100).toFixed(0),
    transit: (e.metrics.bailout_proximity * 100).toFixed(0),
  }));

  const userPrompt = `Explain why Route ${route.id} (score: ${(route.score * 100).toFixed(0)}/100, length: ${route.length_m}m) is recommended.

Key segments:
${JSON.stringify(edgeSummaries, null, 2)}`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
};
```

- [ ] **Step 2: Implement ExplainSlideOut**

Write `app/components/explain/explain-slide-out.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";

import type { Route } from "~/lib/types";
import { ROUTE_COLORS } from "~/lib/colors";

interface ExplainSlideOutProps {
  readonly route: Route;
  readonly time: number;
  readonly onClose: () => void;
}

export const ExplainSlideOut = ({ route, time, onClose }: ExplainSlideOutProps) => {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());

  const fetchExplanation = async () => {
    setIsStreaming(true);
    setError(null);
    setText("");
    startTime.current = Date.now();

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route, time }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) { throw new Error("No response body"); }

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          setText((prev) => prev + decoder.decode(value));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get explanation");
    } finally {
      setIsStreaming(false);
      setElapsed(((Date.now() - startTime.current) / 1000));
    }
  };

  useEffect(() => {
    fetchExplanation();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const color = ROUTE_COLORS[(route.id - 1) % ROUTE_COLORS.length];

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[30%] min-w-[320px] bg-gray-900 shadow-2xl overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Why this route?</span>
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})` }}
              >
                {route.id}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-white text-lg"
            >
              &times;
            </button>
          </div>

          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchExplanation}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {text}
              {isStreaming && <span className="animate-pulse">|</span>}
            </div>
          )}

          {!isStreaming && !error && (
            <div className="mt-6 text-xs text-muted-foreground/60">
              Explained by Claude &middot; {elapsed.toFixed(1)}s
            </div>
          )}
        </div>
      </div>
    </>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.explain.ts app/components/explain/
git commit -m "feat: add Claude API streaming proxy and ExplainSlideOut panel"
```

---

### Task 13: Ghost Tabs

**Files:**
- Create: `app/components/ghosts/ghost-tabs.tsx`

- [ ] **Step 1: Implement GhostTabs**

Write `app/components/ghosts/ghost-tabs.tsx`:

```tsx
import { useState } from "react";

const GHOST_TABS = [
  { label: "Walk", active: true },
  { label: "Run", active: false },
  { label: "Cycle", active: false },
  { label: "Events", active: false },
] as const;

export const GhostTabs = () => {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  return (
    <div className="absolute top-4 left-1/2 z-30 -translate-x-1/2 flex rounded-lg bg-gray-900/90 p-1 shadow-lg backdrop-blur">
      {GHOST_TABS.map((tab) => (
        <div
          key={tab.label}
          className="relative"
          onMouseEnter={() => !tab.active && setHoveredTab(tab.label)}
          onMouseLeave={() => setHoveredTab(null)}
        >
          <button
            disabled={!tab.active}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab.active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground cursor-not-allowed"
            }`}
          >
            {tab.label}
          </button>
          {hoveredTab === tab.label && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-muted-foreground shadow">
              Coming soon
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add app/components/ghosts/
git commit -m "feat: add ghost tabs (Run, Cycle, Events) with coming soon tooltip"
```

---

### Task 14: Wire Everything in the Index Route

**Files:**
- Modify: `app/routes/_index.tsx`

- [ ] **Step 1: Wire the full index route**

Replace `app/routes/_index.tsx` with:

```tsx
import { lazy, Suspense } from "react";
import { useLoaderData } from "react-router";

import { ClientOnly } from "~/components/client-only";
import { InspectorCard } from "~/components/inspector/inspector-card";
import { ScoreLegend } from "~/components/legend/score-legend";
import { PlanWalkPanel } from "~/components/planner/plan-walk-panel";
import { TimeSlider } from "~/components/slider/time-slider";
import { GhostTabs } from "~/components/ghosts/ghost-tabs";
import { GraphProvider } from "~/hooks/use-graph";
import { useAppState } from "~/hooks/use-app-state";
import { useRouteComputation } from "~/hooks/use-routes";
import { loadGraphArtifact } from "~/lib/graph";
import type { GraphArtifact, GraphEdge } from "~/lib/types";

const LazyCityMap = lazy(() =>
  import("~/components/map/city-map").then((m) => ({ default: m.CityMap }))
);
const LazyExplainSlideOut = lazy(() =>
  import("~/components/explain/explain-slide-out").then((m) => ({ default: m.ExplainSlideOut }))
);

export const loader = async () => {
  const graph = await loadGraphArtifact("data/graph.json");
  return { graph };
};

const MapView = () => {
  const { graph } = useLoaderData<{ graph: GraphArtifact }>();
  const {
    state,
    setTime,
    setPinnedSegment,
    setOpenExplanation,
    isStale,
  } = useAppState();
  const { routes, isComputing, compute, clear, computedAt } = useRouteComputation(graph);

  const pinnedEdge = state.pinnedSegmentId
    ? graph.edges.find((e) => e.id === state.pinnedSegmentId) ?? null
    : null;

  const handleClickSegment = (edge: GraphEdge | null) => {
    setPinnedSegment(edge?.id ?? null);
  };

  const handleFindRoute = (fromNode: string, toNode: string) => {
    compute(fromNode, toNode, state.time);
  };

  const handleRecompute = () => {
    if (state.routeQuery) {
      compute(state.routeQuery.fromNode, state.routeQuery.toNode, state.time);
    }
  };

  const openExplanationRoute = state.openExplanationRouteId !== null && routes
    ? routes.find((r) => r.id === state.openExplanationRouteId) ?? null
    : null;

  return (
    <GraphProvider value={graph}>
      <div className="relative h-screen w-screen overflow-hidden">
        <ClientOnly
          fallback={
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
              <p className="text-muted-foreground">Loading map...</p>
            </div>
          }
        >
          {() => (
            <Suspense fallback={<div className="absolute inset-0 bg-gray-950" />}>
              <LazyCityMap
                time={state.time}
                routes={routes}
                pinnedSegmentId={state.pinnedSegmentId}
                onHoverSegment={() => {}}
                onClickSegment={handleClickSegment}
              />
            </Suspense>
          )}
        </ClientOnly>

        <GhostTabs />
        <ScoreLegend />

        <PlanWalkPanel
          routes={routes}
          isComputing={isComputing}
          onFindRoute={handleFindRoute}
          onClear={clear}
          onExplain={(routeId) => setOpenExplanation(routeId)}
        />

        <TimeSlider
          time={state.time}
          onTimeChange={setTime}
          isStale={isStale}
          routeComputedAt={computedAt}
          onRecompute={handleRecompute}
        />

        {pinnedEdge && (
          <InspectorCard
            edge={pinnedEdge}
            time={state.time}
            onClose={() => setPinnedSegment(null)}
          />
        )}

        {openExplanationRoute && (
          <ClientOnly>
            {() => (
              <Suspense fallback={null}>
                <LazyExplainSlideOut
                  route={openExplanationRoute}
                  time={state.time}
                  onClose={() => setOpenExplanation(null)}
                />
              </Suspense>
            )}
          </ClientOnly>
        )}
      </div>
    </GraphProvider>
  );
};

const IndexRoute = () => {
  return <MapView />;
};

export default IndexRoute;
```

- [ ] **Step 2: Verify the app compiles**

```bash
npm run build
```

Expected: Build succeeds. There may be warnings about missing `data/graph.json` at runtime — that is expected until the ingestion pipeline runs.

- [ ] **Step 3: Commit**

```bash
git add app/routes/_index.tsx
git commit -m "feat: wire all components into the index route"
```

---

### Task 15: Vitest Configuration

**Files:**
- Create: `vitest.config.ts` (if not already created by scaffolding)

- [ ] **Step 1: Configure Vitest**

Write `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    globals: true,
  },
});
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass (time, scoring, colors, geocoder, graph, routing).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "feat: configure Vitest test runner"
```

---

### Task 16: End-to-End Smoke Test

**Files:** None new — this is a manual verification task.

- [ ] **Step 1: Run the ingestion pipeline**

```bash
npm run ingest
```

Expected: Pipeline fetches datasets, builds graph, writes `data/graph.json`. Note the counts printed.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 3: Verify Demo Beat 1 — "Look at the city"**

Open `http://localhost:5173`. Confirm:
- Map loads with colored streetscore polylines.
- Bourke/Swanston are visibly brighter than quiet streets.
- Hover shows tooltip with street name and score.
- Click shows inspector card with per-metric breakdown.

- [ ] **Step 4: Verify Demo Beat 2 — "Compare moments"**

Drag slider from Fri 22:00 to Tue 10:00 to Sun 03:00. Confirm:
- Map recolors at each stop.
- Visible, meaningful color changes across the three times.

- [ ] **Step 5: Verify Demo Beat 3 — "Route through it"**

Set to Fri 22:00. Enter "Bourke" in the From field, select an address. Enter "Carlton" in the To field, select an address. Click "Find route." Confirm:
- Three routes appear, numbered, color-coded.
- Route 1 labeled "Recommended" with highest score.
- Click "Explain" on Route 1 — AI explanation streams in.

- [ ] **Step 6: Verify Demo Beat 4 — "Time changes the recommendation"**

Drag slider to Tue 10:00. Confirm:
- Stale indicator appears.
- Click "Recompute."
- At least one route changes meaningfully.

- [ ] **Step 7: Fix any issues found**

If any beat fails, fix the issue in the relevant component/module and re-test.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "fix: resolve issues from end-to-end smoke test"
```

Only commit if changes were made in step 7.
