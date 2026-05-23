# Events Port to `app/` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the previously-shipped "What's On" events feature from the deprecated `web/` codebase onto the current `app/` codebase on `origin/main` — markers + click-to-route + event-detail inspector + active Events tab + time filtering + explain prompt destination label.

**Architecture:** Branch `feat/events-on-app` off `origin/main`. Reuse the existing scraper (`bake/src/scrape-events.ts`) verbatim; attach `data/events.json` to the graph artifact via `scripts/adapt-bake.ts`. Extend the existing-but-unused `useAppState` hook with `mode` + `selectedEventId`, refactor `MapApp` to consume it. Add new event UI components and modify the **inline** components inside `map-app.tsx` (the ones actually rendered) — do NOT touch the dead separate files under `app/components/inspector/`, `app/components/explain/`, `app/components/ghosts/`, `app/components/planner/`, `app/components/slider/`. Use the existing client-side `computeRoutes` + `findNearestNode` for event-driven routing.

**Tech Stack:** React 19, React Router 7, TypeScript, Vite, Tailwind 4, Deck.gl 9 (MapboxOverlay + ScatterplotLayer/PathLayer), MapLibre GL, ngraph.path, `@anthropic-ai/sdk`, tsx.

**Reference spec:** `docs/superpowers/specs/2026-05-23-events-port-to-app-design.md`.

---

## Plan-wide notes

- **Inline vs separate components.** `app/components/map-app.tsx` defines its own inline `PlanWalkPanel`, `InspectorCard`, `ExplainSlideOut`, `GhostTabs`, `TimeSlider`, `MapTooltip`, `ScoreLegend`. There are also separate files under `app/components/*` with the same component names, **but `map-app.tsx` does not import them — it uses the inline versions**. This plan modifies inline versions exclusively. The separate files are dead and remain untouched.
- **No automated tests in scope.** Per the spec ("Testing Strategy"), this port relies on manual verification. Each task ends with a build/typecheck commit; the final task is a manual smoke pass.
- **Commits.** Each task ends with a commit. Use `git add <listed-files>` (no `git add -A`). Commit messages follow existing repo style (`feat:`, `chore:`, `docs:`, `refactor:`, lowercase verb).
- **Working directory.** All commands assume the repo root `C:\Users\ryan_\Desktop\Project 2\citystride`. The shell is PowerShell — use PowerShell syntax in commands (`;` to chain, `$null` for null, etc.). Use `git`/`npm` directly.
- **OS line endings.** Git on this repo warns "LF will be replaced by CRLF" for new text files. That's expected; commit anyway.

---

### Task 1: Create branch and import events files

**Files:**
- Create branch: `feat/events-on-app`
- Copy from `feat/events-from-whatson`: `bake/src/scrape-events.ts`, `bake/src/venue-resolver.ts`, `bake/src/event-venue-aliases.ts`, `data/events.json`, `data/raw/venues.json`, `docs/superpowers/specs/2026-05-23-events-feature-design.md`, `docs/superpowers/specs/2026-05-23-events-port-to-app-design.md`, `docs/superpowers/plans/2026-05-23-events-port-to-app.md`
- Modify: `package.json` (add `scrape:events` script entry)

- [ ] **Step 1: Stash any uncommitted changes on current branch**

```powershell
git status
git stash push -m "pre-port stash" --include-untracked
```

If `git status` already shows clean, skip the stash. The known unstaged `web/package-lock.json` change is fine to stash and discard.

- [ ] **Step 2: Fetch origin and create the new branch off origin/main**

```powershell
git fetch origin
git checkout -b feat/events-on-app origin/main
```

Expected: switched to a new branch `feat/events-on-app` tracking nothing, HEAD at `origin/main` tip.

- [ ] **Step 3: Restore the events files from feat/events-from-whatson into the new branch**

```powershell
git checkout feat/events-from-whatson -- bake/src/scrape-events.ts bake/src/venue-resolver.ts bake/src/event-venue-aliases.ts
git checkout feat/events-from-whatson -- data/events.json data/raw/venues.json
git checkout feat/events-from-whatson -- docs/superpowers/specs/2026-05-23-events-feature-design.md docs/superpowers/specs/2026-05-23-events-port-to-app-design.md docs/superpowers/plans/2026-05-23-events-port-to-app.md
```

If `data/raw/venues.json` is tracked via Git LFS, the checkout brings the LFS pointer file — that's fine for the scraper's purposes since `bake/src/venue-resolver.ts` reads it via `fs.readFile` (and the file content is small JSON, not LFS-backed in practice). Verify with `Get-Item data/raw/venues.json | Select-Object Length` — if size is ~135 bytes you have a pointer; check `Get-Content data/raw/venues.json -TotalCount 1` to see if it starts with `version https://git-lfs...`. If it does, run `git lfs pull --include="data/raw/venues.json"`.

- [ ] **Step 4: Verify all files arrived**

```powershell
git status
```

Expected new staged files:
- `bake/src/scrape-events.ts`
- `bake/src/venue-resolver.ts`
- `bake/src/event-venue-aliases.ts`
- `data/events.json`
- `data/raw/venues.json`
- `docs/superpowers/specs/2026-05-23-events-feature-design.md`
- `docs/superpowers/specs/2026-05-23-events-port-to-app-design.md`
- `docs/superpowers/plans/2026-05-23-events-port-to-app.md`

- [ ] **Step 5: Add `scrape:events` script to root `package.json`**

Open `package.json`. In the `"scripts"` object, after `"bake:full"`, add:

```json
    "scrape:events": "tsx bake/src/scrape-events.ts"
```

Final `scripts` block should look like:

```json
  "scripts": {
    "build": "react-router build",
    "dev": "react-router dev",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "ingest": "tsx scripts/ingest/index.ts",
    "bake": "node scripts/bake/bake.js",
    "adapt": "tsx scripts/adapt-bake.ts",
    "bake:full": "npm run bake && npm run adapt",
    "scrape:events": "tsx bake/src/scrape-events.ts"
  },
```

- [ ] **Step 6: Install dependencies (no-op if already installed)**

```powershell
npm install
```

Expected: completes without errors. `tsx` is already a devDependency.

- [ ] **Step 7: Boot the dev server and confirm baseline Walk mode works**

```powershell
npm run dev
```

Open the printed URL in a browser (typically `http://localhost:5173`). Confirm:
- Map renders, streets coloured by score.
- Plan-a-Walk panel responds to street search.
- Time slider scrubs.

Then `Ctrl+C` to stop.

- [ ] **Step 8: Commit**

```powershell
git add bake/src/scrape-events.ts bake/src/venue-resolver.ts bake/src/event-venue-aliases.ts data/events.json data/raw/venues.json docs/superpowers/specs/2026-05-23-events-feature-design.md docs/superpowers/specs/2026-05-23-events-port-to-app-design.md docs/superpowers/plans/2026-05-23-events-port-to-app.md package.json
git commit -m "chore: import events scraper + data + specs from feat/events-from-whatson"
```

---

### Task 2: Make scraper self-contained (remove `shared/types.ts` dep)

**Files:**
- Modify: `bake/src/scrape-events.ts` (top of file — replace shared import with inline type)
- Modify: `bake/src/venue-resolver.ts` (top of file — same treatment)

- [ ] **Step 1: Find current `shared/types.ts` references**

```powershell
git grep -l "shared/types" bake/src/
```

Expected output: `bake/src/scrape-events.ts`, `bake/src/venue-resolver.ts`.

- [ ] **Step 2: Inline `Event` type in `bake/src/scrape-events.ts`**

Replace the existing import line:

```ts
import type { Event } from "../../shared/types.ts";
```

with:

```ts
type LngLat = readonly [number, number];

type Event = {
  id: string;
  name: string;
  description: string;
  url: string;
  start_date: string;
  end_date: string;
  venue_name: string;
  address: string | null;
  position: LngLat;
  resolved_via: "venues_json" | "alias_then_venues_json";
};
```

- [ ] **Step 3: Inline relevant types in `bake/src/venue-resolver.ts`**

Open `bake/src/venue-resolver.ts`. Identify any imports from `"../../shared/types"` or `"../../shared/types.ts"`. Replace them with local inline types. Based on the venue-resolver's responsibility (resolve venue name → coordinates), it likely only needs `LngLat`:

```ts
type LngLat = readonly [number, number];
```

If the resolver references any other shared type (e.g., a `Venue` shape it reads from `venues.json`), inline that too.

- [ ] **Step 4: Type-check that the scraper still compiles**

```powershell
npx tsc --noEmit bake/src/scrape-events.ts
```

Expected: no errors. If errors complain about missing types, inline them following the same pattern.

- [ ] **Step 5: (Optional smoke) run scraper against cached data**

The scraper hits the network; skip this step if you don't want to scrape. If you do:

```powershell
npm run scrape:events
```

Expected: writes `data/events.json` (~20–40 events). If it fails due to network, that's fine — we already have a committed `data/events.json` from the previous branch.

- [ ] **Step 6: Commit**

```powershell
git add bake/src/scrape-events.ts bake/src/venue-resolver.ts
git commit -m "refactor: inline event types in bake scripts (drop shared/ dep)"
```

---

### Task 3: Add `Event` and `Mode` types to `app/lib/types.ts`

**Files:**
- Modify: `app/lib/types.ts`

- [ ] **Step 1: Append `Event`, `Mode`, and extended types**

Open `app/lib/types.ts`. At the end of the file, append:

```ts
export interface Event {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly venue_name: string;
  readonly address: string | null;
  readonly position: readonly [number, number];
  readonly resolved_via: "venues_json" | "alias_then_venues_json";
}

export type Mode = "walk" | "event";
```

Then find the existing `GraphArtifact` interface and add the optional `events` field:

```ts
export interface GraphArtifact {
  readonly meta: GraphMeta;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly events?: readonly Event[];
}
```

Then find the existing `AppState` interface and add `mode` + `selectedEventId`:

```ts
export interface AppState {
  readonly viewport: { readonly lng: number; readonly lat: number; readonly zoom: number };
  readonly time: number;
  readonly routeQuery: {
    readonly fromNode: number;
    readonly toNode: number;
  } | null;
  readonly routes: readonly Route[] | null;
  readonly routeComputedAt: number | null;
  readonly pinnedSegmentId: string | null;
  readonly openExplanationRouteId: number | null;
  readonly mode: Mode;
  readonly selectedEventId: string | null;
}
```

- [ ] **Step 2: Type-check**

```powershell
npm run typecheck
```

Expected: no errors directly attributable to types.ts changes. (`useAppState` may complain because we haven't initialised `mode`/`selectedEventId` yet — that's fine, fix in Task 4.)

- [ ] **Step 3: Commit**

```powershell
git add app/lib/types.ts
git commit -m "feat: add Event + Mode types and extend GraphArtifact + AppState"
```

---

### Task 4: Extend `useAppState` with `mode` + `selectedEventId`

**Files:**
- Modify: `app/hooks/use-app-state.ts`

- [ ] **Step 1: Replace the whole file**

Replace the contents of `app/hooks/use-app-state.ts` with:

```ts
import { useState, useCallback } from "react";

import { INITIAL_HOUR_OF_WEEK } from "~/lib/time";
import type { AppState, Mode, Route } from "~/lib/types";

const INITIAL_STATE: AppState = {
  viewport: { lng: 144.963, lat: -37.814, zoom: 15 },
  time: INITIAL_HOUR_OF_WEEK,
  routeQuery: null,
  routes: null,
  routeComputedAt: null,
  pinnedSegmentId: null,
  openExplanationRouteId: null,
  mode: "walk",
  selectedEventId: null,
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
      selectedEventId: null,
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

  const setMode = useCallback((mode: Mode) => {
    setState((prev) => ({
      ...prev,
      mode,
      routes: null,
      routeQuery: null,
      routeComputedAt: null,
      selectedEventId: null,
      openExplanationRouteId: null,
      pinnedSegmentId: null,
    }));
  }, []);

  const setSelectedEvent = useCallback((selectedEventId: string | null) => {
    setState((prev) => ({ ...prev, selectedEventId }));
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
    setMode,
    setSelectedEvent,
    isStale,
  };
};
```

- [ ] **Step 2: Type-check**

```powershell
npm run typecheck
```

Expected: no errors in `use-app-state.ts`. (`map-app.tsx` still uses local `useState`, doesn't consume the hook yet — that's Task 8.)

- [ ] **Step 3: Commit**

```powershell
git add app/hooks/use-app-state.ts
git commit -m "feat: extend useAppState with mode and selectedEventId"
```

---

### Task 5: Add `app/lib/events.ts` helpers

**Files:**
- Create: `app/lib/events.ts`

- [ ] **Step 1: Create the helpers file**

Create `app/lib/events.ts` with:

```ts
import type { Event } from "~/lib/types";

// Day-of-week index for the slider time (0 = Mon, 6 = Sun).
// Slider hour-of-week 0-167; div by 24 → day-of-week starting Monday.
export const sliderDayOfWeek = (time: number): number => {
  return Math.floor(time / 24);
};

// Day-of-week (0=Mon..6=Sun) for an ISO date string "YYYY-MM-DD".
export const dateDayOfWeek = (iso: string): number => {
  const d = new Date(iso + "T00:00:00Z");
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7;
};

export const eventActiveAt = (ev: Event, sliderDay: number): boolean => {
  const start = dateDayOfWeek(ev.start_date);
  const end = dateDayOfWeek(ev.end_date);
  if (start <= end) return sliderDay >= start && sliderDay <= end;
  // wraps the week
  return sliderDay >= start || sliderDay <= end;
};

export const activeEventsAt = (
  events: readonly Event[],
  time: number,
): readonly Event[] => {
  const day = sliderDayOfWeek(time);
  return events.filter((ev) => eventActiveAt(ev, day));
};
```

- [ ] **Step 2: Type-check**

```powershell
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add app/lib/events.ts
git commit -m "feat: add events.ts time-filter helpers"
```

---

### Task 6: Extend `scripts/adapt-bake.ts` to attach `data/events.json`

**Files:**
- Modify: `scripts/adapt-bake.ts`

- [ ] **Step 1: Replace the file body**

Open `scripts/adapt-bake.ts`. Replace its entire contents with:

```ts
/**
 * Transforms the citystride bake output (bake-raw.json) into the
 * GraphArtifact format expected by the app frontend (graph.json).
 *
 * Also merges data/events.json (if present) into the artifact's
 * optional `events` field. Missing events.json → no events emitted.
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { Event, GraphArtifact } from "../app/lib/types";

const DATA_DIR = join(process.cwd(), "data");
const BAKE_RAW_PATH = join(DATA_DIR, "bake-raw.json");
const GRAPH_OUT_PATH = join(DATA_DIR, "graph.json");
const EVENTS_PATH = join(DATA_DIR, "events.json");

async function loadEvents(): Promise<readonly Event[] | undefined> {
  try {
    await access(EVENTS_PATH);
  } catch {
    return undefined;
  }
  const raw = await readFile(EVENTS_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    console.warn(`  events.json present but is not an array; ignoring`);
    return undefined;
  }
  return parsed as Event[];
}

async function adapt() {
  console.log("\n=== Adapting bake output to app format ===\n");

  const raw = await readFile(BAKE_RAW_PATH, "utf-8");
  const bake = JSON.parse(raw);

  console.log(`  Bake artifact: ${bake.nodes.length} nodes, ${bake.edges.length} edges`);

  const events = await loadEvents();
  if (events) {
    console.log(`  Events: ${events.length} entries from events.json`);
  } else {
    console.log(`  Events: none (data/events.json not found)`);
  }

  const artifact: GraphArtifact = {
    meta: bake.meta,
    nodes: bake.nodes,
    edges: bake.edges,
    ...(events ? { events } : {}),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(GRAPH_OUT_PATH, JSON.stringify(artifact), "utf-8");

  const sizeMb = (Buffer.byteLength(JSON.stringify(artifact)) / 1024 / 1024).toFixed(1);
  console.log(`\n  graph.json written (${sizeMb} MB)`);
  console.log(`  ${artifact.nodes.length} nodes, ${artifact.edges.length} edges${events ? `, ${events.length} events` : ""}`);
  console.log("\n=== Adaptation complete ===");
}

adapt().catch((err) => {
  console.error("Adaptation failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check**

```powershell
npm run typecheck
```

Expected: no errors. If `bake-raw.json` is missing, the script will fail at runtime — but typecheck is unaffected.

- [ ] **Step 3: (Optional smoke) run adapt against an existing bake-raw.json**

If `data/bake-raw.json` exists locally:

```powershell
npm run adapt
```

Expected: prints the new "Events: N entries from events.json" line. Writes `data/graph.json` with `events` field populated.

If `bake-raw.json` is missing, that's fine — the adapt change is type-safe and we'll exercise it during manual verification in Task 14.

- [ ] **Step 4: Commit**

```powershell
git add scripts/adapt-bake.ts
git commit -m "feat: adapt-bake attaches data/events.json to GraphArtifact"
```

---

### Task 7: Refactor `MapApp` to consume `useAppState` (no behavioural change)

**Files:**
- Modify: `app/components/map-app.tsx` (replace the `MapApp` body and its internal state wiring; leave inline sub-components untouched in this task)

This is the largest mechanical refactor in the plan. The goal is to replace `MapApp`'s local `useState` block with `useAppState` while preserving exact current behaviour. We touch `mode`/`selectedEventId` later; this task just unifies state into the hook.

- [ ] **Step 1: Update imports at top of file**

In `app/components/map-app.tsx`, add to the existing import block:

```ts
import { useAppState } from "~/hooks/use-app-state";
```

- [ ] **Step 2: Replace the local state block in `MapApp`**

Find the body of the `MapApp` component. Replace:

```ts
const [time, setTime] = useState(INITIAL_HOUR_OF_WEEK);
const [pinnedEdge, setPinnedEdge] = useState<GraphEdge | null>(null);
const [hoveredEdge, setHoveredEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
const [routes, setRoutes] = useState<Route[] | null>(null);
const [routeComputedAt, setRouteComputedAt] = useState<number | null>(null);
const [isComputing, setIsComputing] = useState(false);
const [explainRoute, setExplainRoute] = useState<Route | null>(null);

const isStale = routes !== null && routeComputedAt !== null && routeComputedAt !== time;
```

with:

```ts
const {
  state,
  setTime,
  setRoutes: setRoutesInState,
  clearRoutes: clearRoutesInState,
  isStale,
} = useAppState();

// time/routes/etc. live in state; keep transient UI state local.
const time = state.time;
const routes = (state.routes as Route[] | null);
const routeComputedAt = state.routeComputedAt;
const [pinnedEdge, setPinnedEdge] = useState<GraphEdge | null>(null);
const [hoveredEdge, setHoveredEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
const [isComputing, setIsComputing] = useState(false);
const [explainRoute, setExplainRoute] = useState<Route | null>(null);
```

- [ ] **Step 3: Update the `handleFindRoute` callback**

Find:

```ts
const handleFindRoute = useCallback((fromNode: number, toNode: number) => {
  setIsComputing(true);
  requestAnimationFrame(() => {
    const result = computeRoutes(graph.nodes, graph.edges, fromNode, toNode, time);
    setRoutes(result);
    setRouteComputedAt(time);
    setIsComputing(false);
  });
}, [graph, time]);
```

Replace with:

```ts
const handleFindRoute = useCallback((fromNode: number, toNode: number) => {
  setIsComputing(true);
  requestAnimationFrame(() => {
    const result = computeRoutes(graph.nodes, graph.edges, fromNode, toNode, time);
    setRoutesInState(result, time);
    setIsComputing(false);
  });
}, [graph, time, setRoutesInState]);
```

- [ ] **Step 4: Update the `handleClear` callback**

Find:

```ts
const handleClear = useCallback(() => {
  setRoutes(null);
  setRouteComputedAt(null);
}, []);
```

Replace with:

```ts
const handleClear = useCallback(() => {
  clearRoutesInState();
}, [clearRoutesInState]);
```

- [ ] **Step 5: Type-check**

```powershell
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Smoke-test**

```powershell
npm run dev
```

Verify: Plan-a-Walk still finds routes, time slider still works, "Routes computed for…" recompute affordance still appears, explain pane still opens. `Ctrl+C` to stop.

- [ ] **Step 7: Commit**

```powershell
git add app/components/map-app.tsx
git commit -m "refactor: MapApp consumes useAppState (no behaviour change)"
```

---

### Task 8: Wire `mode` + `setMode` into `MapApp` and activate Events tab

**Files:**
- Modify: `app/components/map-app.tsx` (destructure `setMode` from `useAppState`; modify inline `GhostTabs` to accept `mode`/`setMode` props and make Events active)

- [ ] **Step 1: Destructure `setMode` and `setSelectedEvent` from the hook**

In `MapApp`, expand the `useAppState` destructure to include the new setters:

```ts
const {
  state,
  setTime,
  setRoutes: setRoutesInState,
  clearRoutes: clearRoutesInState,
  setMode,
  setSelectedEvent,
  isStale,
} = useAppState();

const mode = state.mode;
const selectedEventId = state.selectedEventId;
```

- [ ] **Step 2: Rewrite the inline `GhostTabs` component**

Find the inline `const GhostTabs = () => { ... }`. Replace its entire body with:

```ts
type GhostTabsProps = {
  mode: import("~/lib/types").Mode;
  onModeChange: (m: import("~/lib/types").Mode) => void;
};

const GhostTabs = ({ mode, onModeChange }: GhostTabsProps) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const tabs: { label: string; value: "walk" | "event" | null; active: boolean }[] = [
    { label: "Walk", value: "walk", active: true },
    { label: "Run", value: null, active: false },
    { label: "Cycle", value: null, active: false },
    { label: "Events", value: "event", active: true },
  ];
  return (
    <div className="absolute top-4 left-1/2 z-30 -translate-x-1/2 flex rounded-lg bg-gray-900/90 p-1 shadow-lg backdrop-blur">
      {tabs.map((tab) => {
        const selected = tab.value !== null && tab.value === mode;
        return (
          <div
            key={tab.label}
            className="relative"
            onMouseEnter={() => !tab.active && setHovered(tab.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              disabled={!tab.active}
              onClick={() => { if (tab.active && tab.value) onModeChange(tab.value); }}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-blue-600 text-white"
                  : tab.active
                    ? "text-gray-300 hover:text-white"
                    : "text-gray-400 cursor-not-allowed"
              }`}
            >
              {tab.label}
            </button>
            {hovered === tab.label && !tab.active && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 shadow">Coming soon</div>
            )}
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 3: Pass `mode`/`setMode` into the GhostTabs render**

Find the JSX usage `<GhostTabs />` in the `MapApp` return and replace with:

```tsx
<GhostTabs mode={mode} onModeChange={setMode} />
```

- [ ] **Step 4: Type-check**

```powershell
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Smoke-test**

```powershell
npm run dev
```

Verify: Top tab bar shows Walk + Events as active; clicking Events selects it (highlighted), clicking Walk selects Walk. Run/Cycle still ghosted. `Ctrl+C` to stop.

- [ ] **Step 6: Commit**

```powershell
git add app/components/map-app.tsx
git commit -m "feat: activate Events tab and wire mode toggle"
```

---

### Task 9: Add EventMarkers deck.gl layer + click handler in `MapApp`

**Files:**
- Modify: `app/components/map-app.tsx` (import ScatterplotLayer + helpers; compute Flinders node; add layer in `getLayers()` when mode === "event"; add `handleEventClick`)

- [ ] **Step 1: Update imports**

In `app/components/map-app.tsx`, extend the deck.gl import:

```ts
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
```

Add the events + graph helper imports:

```ts
import { findNearestNode } from "~/lib/graph";
import { activeEventsAt } from "~/lib/events";
import type { Event } from "~/lib/types";
```

(If `findNearestNode` is not already exported from `~/lib/graph`, verify by `git grep "export const findNearestNode" app/lib/graph.ts` — it is per current origin/main.)

Also extend `useMemo` to the React imports if it isn't already there:

```ts
import { useRef, useEffect, useCallback, useState, useMemo } from "react";
```

- [ ] **Step 2: Compute Flinders node ID once**

Inside `MapApp`, after the `useAppState` destructure, add:

```ts
const FLINDERS_LNG = 144.967;
const FLINDERS_LAT = -37.8183;

const flindersNodeId = useMemo(
  () => findNearestNode(graph.nodes, FLINDERS_LNG, FLINDERS_LAT).id,
  [graph.nodes],
);
```

- [ ] **Step 3: Add `handleEventClick` callback**

Place near `handleFindRoute`:

```ts
const handleEventClick = useCallback((ev: Event) => {
  const toNode = findNearestNode(graph.nodes, ev.position[0], ev.position[1]).id;
  setSelectedEvent(ev.id);
  setIsComputing(true);
  requestAnimationFrame(() => {
    const result = computeRoutes(graph.nodes, graph.edges, flindersNodeId, toNode, time);
    setRoutesInState(result, time);
    setIsComputing(false);
  });
}, [graph, time, flindersNodeId, setSelectedEvent, setRoutesInState]);
```

- [ ] **Step 4: Add event layers inside `getLayers`**

Find `getLayers` (the `useCallback` returning the Deck.gl layers array). After the existing `if (routes) { ... }` block but before `return layers;`, add:

```ts
if (mode === "event" && graph.events && graph.events.length > 0) {
  const active = activeEventsAt(graph.events, time);

  if (selectedEventId) {
    const selected = active.filter((ev) => ev.id === selectedEventId);
    layers.push(
      new ScatterplotLayer<Event>({
        id: "event-rings",
        data: selected as Event[],
        getPosition: (ev) => [ev.position[0], ev.position[1]],
        getRadius: 16,
        getFillColor: [251, 191, 36, 60],
        getLineColor: [251, 191, 36, 230],
        getLineWidth: 2,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: false,
      }),
    );
  }

  layers.push(
    new ScatterplotLayer<Event>({
      id: "event-markers",
      data: active as Event[],
      getPosition: (ev) => [ev.position[0], ev.position[1]],
      getRadius: 8,
      getFillColor: [251, 191, 36, 240],
      getLineColor: [11, 15, 20, 230],
      getLineWidth: 2,
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      stroked: true,
      pickable: true,
    }),
  );
}
```

Update `getLayers`'s `useCallback` dependency array to include the new dependencies. If the current dep array is `[graph, time, routes]`, change it to:

```ts
}, [graph, time, routes, mode, selectedEventId]);
```

- [ ] **Step 5: Route the deck.gl overlay's `onClick` to events when picked**

Find the `MapboxOverlay` construction inside the `useEffect` that initialises the map. Its existing `onClick` handles edges only:

```ts
onClick: (info) => {
  if (info.object) {
    setPinnedEdge(info.object as GraphEdge);
  } else {
    setPinnedEdge(null);
  }
},
```

Replace with:

```ts
onClick: (info) => {
  if (info.object && (info.object as any).resolved_via !== undefined) {
    handleEventClick(info.object as Event);
    return;
  }
  if (info.object) {
    setPinnedEdge(info.object as GraphEdge);
  } else {
    setPinnedEdge(null);
  }
},
```

Because the `MapboxOverlay` is constructed once in a `useEffect([])`, `handleEventClick` is captured stale. To fix this without restructuring the init effect: stash the latest handler in a ref. Above the `useEffect` that builds the map, add:

```ts
const handleEventClickRef = useRef(handleEventClick);
useEffect(() => { handleEventClickRef.current = handleEventClick; }, [handleEventClick]);
```

Then in the `MapboxOverlay`'s `onClick`, use:

```ts
onClick: (info) => {
  if (info.object && (info.object as any).resolved_via !== undefined) {
    handleEventClickRef.current(info.object as Event);
    return;
  }
  if (info.object) {
    setPinnedEdge(info.object as GraphEdge);
  } else {
    setPinnedEdge(null);
  }
},
```

- [ ] **Step 6: Type-check**

```powershell
npm run typecheck
```

Expected: clean.

- [ ] **Step 7: Smoke-test**

```powershell
npm run dev
```

Verify:
- Click Events tab → amber dots appear at event locations (or stay hidden if `data/events.json` was empty/missing).
- Hover changes cursor; clicking a dot computes 3 routes from Flinders to that event, drawn over the street layer.
- Clicking a second event re-routes to it; the ring moves to the newly-selected event.
- Switching back to Walk clears all event/route state.

`Ctrl+C` to stop.

- [ ] **Step 8: Commit**

```powershell
git add app/components/map-app.tsx
git commit -m "feat: render event markers and route to events on click"
```

---

### Task 10: Add `EventListPanel` and panel swap

**Files:**
- Create: `app/components/events/event-list-panel.tsx`
- Modify: `app/components/map-app.tsx` (import; render conditionally based on mode)

- [ ] **Step 1: Create the panel component**

Create `app/components/events/event-list-panel.tsx` with:

```tsx
import type { Event } from "~/lib/types";
import { activeEventsAt } from "~/lib/events";

interface EventListPanelProps {
  readonly events: readonly Event[];
  readonly time: number;
  readonly selectedEventId: string | null;
  readonly onEventSelect: (ev: Event) => void;
}

function formatDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`;
}

export const EventListPanel = ({
  events,
  time,
  selectedEventId,
  onEventSelect,
}: EventListPanelProps) => {
  const active = activeEventsAt(events, time);

  return (
    <div className="absolute left-4 top-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur max-h-[60vh] overflow-y-auto">
      <h2 className="text-sm font-semibold text-white mb-1">What's on</h2>
      <p className="text-xs text-gray-400 mb-3">
        {active.length} {active.length === 1 ? "event" : "events"} today
      </p>
      {active.length === 0 && (
        <p className="text-xs text-gray-500">No events scheduled for this day.</p>
      )}
      <ul className="space-y-2">
        {active.map((ev) => (
          <li key={ev.id}>
            <button
              onClick={() => onEventSelect(ev)}
              className={`w-full text-left rounded-md p-2 transition-colors ${
                ev.id === selectedEventId
                  ? "bg-amber-500/20 ring-1 ring-amber-500/50"
                  : "hover:bg-white/5"
              }`}
            >
              <div className="text-sm text-white font-medium leading-tight">{ev.name}</div>
              <div className="text-xs text-gray-400 mt-1">{ev.venue_name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {formatDateRange(ev.start_date, ev.end_date)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

- [ ] **Step 2: Import in `map-app.tsx`**

Add to the imports:

```ts
import { EventListPanel } from "~/components/events/event-list-panel";
```

- [ ] **Step 3: Swap the left panel by mode**

Find the `<PlanWalkPanel ... />` call in `MapApp`'s return. Wrap it conditionally:

```tsx
{mode === "walk" ? (
  <PlanWalkPanel
    graph={graph}
    routes={routes}
    isComputing={isComputing}
    onFindRoute={handleFindRoute}
    onClear={handleClear}
    onExplain={(id) => { const r = routes?.find((rt) => rt.id === id); if (r) { setExplainRoute(r); } }}
  />
) : (
  <EventListPanel
    events={graph.events ?? []}
    time={time}
    selectedEventId={selectedEventId}
    onEventSelect={handleEventClick}
  />
)}
```

- [ ] **Step 4: Type-check**

```powershell
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Smoke-test**

```powershell
npm run dev
```

Verify:
- Walk tab → Plan-a-Walk panel on left, unchanged.
- Events tab → list of events in left panel, count matches markers on map.
- Clicking a list entry highlights it (amber ring), triggers route computation, marker on map gets selection ring.

- [ ] **Step 6: Commit**

```powershell
git add app/components/events/event-list-panel.tsx app/components/map-app.tsx
git commit -m "feat: EventListPanel in left rail when in Event mode"
```

---

### Task 11: Inspector card event-detail variant

**Files:**
- Modify: `app/components/map-app.tsx` (inline `InspectorCard` — split into edge variant and event variant; render conditionally in `MapApp`)

- [ ] **Step 1: Add `EventDetailCard` inline component**

In `app/components/map-app.tsx`, near the existing inline `InspectorCard`, add:

```tsx
function formatEventDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`;
}

const EventDetailCard = ({ event, onClose }: { event: Event; onClose: () => void }) => (
  <div className="absolute bottom-24 left-4 z-30 w-80 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="font-medium text-white leading-tight">{event.name}</h3>
        <p className="text-xs text-amber-400 mt-1">
          {formatEventDateRange(event.start_date, event.end_date)}
        </p>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none flex-shrink-0">&times;</button>
    </div>
    <p className="mt-2 text-xs text-gray-400">
      {event.venue_name}{event.address ? ` · ${event.address}` : ""}
    </p>
    <p className="mt-3 text-xs text-gray-300 leading-relaxed">{event.description}</p>
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-block text-xs text-blue-400 underline hover:text-blue-300"
    >
      Open page →
    </a>
  </div>
);
```

- [ ] **Step 2: Render the event card from `MapApp` when an event is selected**

In `MapApp`'s return, find the existing `{pinnedEdge && <InspectorCard ... />}` line. Replace with:

```tsx
{selectedEventId && graph.events && (() => {
  const ev = graph.events.find((e) => e.id === selectedEventId);
  if (!ev) return null;
  return <EventDetailCard event={ev} onClose={() => { setSelectedEvent(null); clearRoutesInState(); }} />;
})()}

{!selectedEventId && pinnedEdge && (
  <InspectorCard edge={pinnedEdge} time={time} onClose={() => setPinnedEdge(null)} />
)}
```

- [ ] **Step 3: Type-check**

```powershell
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Smoke-test**

```powershell
npm run dev
```

Verify:
- Events tab → click an event → bottom-left card shows event name, date range, venue, description, "Open page →" link.
- Click "x" → card closes, routes clear, marker selection clears.
- Walk mode → clicking an edge still pops the metrics inspector card.

- [ ] **Step 5: Commit**

```powershell
git add app/components/map-app.tsx
git commit -m "feat: inspector card event-detail variant"
```

---

### Task 12: "N events today" pill above TimeSlider

**Files:**
- Modify: `app/components/map-app.tsx` (inline `TimeSlider` — accept optional `eventsTodayCount`; show pill when present and > 0; pass count from `MapApp` when mode === "event")

- [ ] **Step 1: Extend `TimeSlider` props (the inline version)**

Find the inline `TimeSlider` component. Update its destructure to accept an optional `eventsTodayCount: number | null` (in addition to existing props):

```tsx
const TimeSlider = ({
  time, onTimeChange, isStale, routeComputedAt, onRecompute, eventsTodayCount,
}: {
  time: number;
  onTimeChange: (t: number) => void;
  isStale: boolean;
  routeComputedAt: number | null;
  onRecompute: () => void;
  eventsTodayCount?: number | null;
}) => (
  <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 flex flex-col items-center gap-1">
    {eventsTodayCount !== null && eventsTodayCount !== undefined && eventsTodayCount > 0 && (
      <div className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-300 ring-1 ring-amber-500/40">
        {eventsTodayCount} {eventsTodayCount === 1 ? "event" : "events"} today
      </div>
    )}
    <div className="rounded-lg bg-gray-900/90 px-6 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-white min-w-[80px]">{formatHourOfWeek(time)}</span>
        <input
          type="range" min={0} max={167} value={time}
          onChange={(e) => onTimeChange(parseInt(e.target.value, 10))}
          className="w-64 accent-blue-500"
        />
      </div>
      {isStale && routeComputedAt !== null && (
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
          <span>Routes computed for {formatHourOfWeek(routeComputedAt)}</span>
          <button onClick={onRecompute} className="text-blue-400 underline hover:text-blue-300">Recompute</button>
        </div>
      )}
    </div>
  </div>
);
```

(Note: this replaces the existing single-div wrapper with a flex column wrapper so the pill sits above the slider. Existing positioning (`bottom-6 left-1/2 -translate-x-1/2`) moves to the new wrapper; the inner slider div keeps its background.)

- [ ] **Step 2: Pass `eventsTodayCount` from `MapApp`**

Near the top of `MapApp`, compute the count via memo:

```ts
const eventsTodayCount = useMemo(() => {
  if (mode !== "event" || !graph.events) return null;
  return activeEventsAt(graph.events, time).length;
}, [mode, graph.events, time]);
```

Then in the `TimeSlider` JSX usage, add the prop:

```tsx
<TimeSlider
  time={time}
  onTimeChange={setTime}
  isStale={isStale}
  routeComputedAt={routeComputedAt}
  onRecompute={handleRecompute}
  eventsTodayCount={eventsTodayCount}
/>
```

- [ ] **Step 3: Type-check**

```powershell
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Smoke-test**

```powershell
npm run dev
```

Verify:
- Walk mode → no pill above slider.
- Events mode → small amber pill above slider showing "N events today". Number updates as you scrub the slider across days.

- [ ] **Step 5: Commit**

```powershell
git add app/components/map-app.tsx
git commit -m "feat: events count pill above slider in Event mode"
```

---

### Task 13: `api.explain` accepts `destinationLabel`

**Files:**
- Modify: `app/routes/api.explain.ts`

- [ ] **Step 1: Extend the request body type and the prompt**

In `app/routes/api.explain.ts`, find:

```ts
const body = await request.json();
const { route, allRoutes, time } = body as {
  route: Route;
  allRoutes?: Route[];
  time: number;
};
```

Replace with:

```ts
const body = await request.json();
const { route, allRoutes, time, destinationLabel } = body as {
  route: Route;
  allRoutes?: Route[];
  time: number;
  destinationLabel?: string;
};
```

Then find the existing user message:

```ts
content: `Time slot: hour ${time} of 168.
Recommended route id: ${route.id}.
All candidates:
${JSON.stringify(routesForPrompt, null, 2)}

Call the render_explanation tool now.`,
```

Replace with:

```ts
content: `Time slot: hour ${time} of 168.
Recommended route id: ${route.id}.${destinationLabel ? `
Destination: ${destinationLabel}.` : ""}
All candidates:
${JSON.stringify(routesForPrompt, null, 2)}

Call the render_explanation tool now.`,
```

- [ ] **Step 2: Type-check**

```powershell
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```powershell
git add app/routes/api.explain.ts
git commit -m "feat: api.explain accepts optional destinationLabel"
```

---

### Task 14: ExplainSlideOut passes `destinationLabel`

**Files:**
- Modify: `app/components/map-app.tsx` (inline `ExplainSlideOut` — accept `destinationLabel` prop; include in POST body; pass from `MapApp` when route was triggered by an event click)

- [ ] **Step 1: Extend `ExplainSlideOut` props in the inline component**

In `app/components/map-app.tsx`, find the inline `ExplainSlideOut` component. Update its prop type:

```ts
const ExplainSlideOut = ({
  route,
  allRoutes,
  time,
  destinationLabel,
  onClose,
}: {
  route: Route;
  allRoutes: Route[] | null;
  time: number;
  destinationLabel?: string;
  onClose: () => void;
}) => {
```

Find the existing fetch body inside `doFetch`:

```ts
body: JSON.stringify({ route, allRoutes, time }),
```

Replace with:

```ts
body: JSON.stringify({ route, allRoutes, time, destinationLabel }),
```

- [ ] **Step 2: Pass `destinationLabel` from `MapApp`**

In `MapApp`'s return, find the existing `<ExplainSlideOut ... />` call and add the prop:

```tsx
{explainRoute && (
  <ExplainSlideOut
    route={explainRoute}
    allRoutes={routes}
    time={time}
    destinationLabel={
      selectedEventId && graph.events
        ? graph.events.find((e) => e.id === selectedEventId)?.name
        : undefined
    }
    onClose={() => setExplainRoute(null)}
  />
)}
```

- [ ] **Step 3: Type-check**

```powershell
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Smoke-test**

```powershell
npm run dev
```

Verify:
- Events mode → click event → click "Explain" on a route → explanation text now references the event by name (e.g., "Heading to Satay and Reog Festival…" depending on Claude's phrasing).
- Walk mode → explain still works as before (no event mentioned).

`Ctrl+C` to stop.

- [ ] **Step 5: Commit**

```powershell
git add app/components/map-app.tsx
git commit -m "feat: pass destination event name to explain prompt"
```

---

### Task 15: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Boot the dev server**

```powershell
npm run dev
```

- [ ] **Step 2: Walk through the spec's test plan**

Verify each item from the spec's "Testing Strategy" section:

1. Walk mode is unchanged: search for streets, find route, see 3 routes, hover/click edges → inspector pops, slider updates colour scale, explain pane opens with structured content.
2. Click Events tab — Plan-a-Walk panel disappears, EventListPanel appears.
3. Amber markers visible on map matching list count.
4. Scrub time slider across days — pill count updates; markers/list update for the new day.
5. Click an event in the list — amber ring on map, 3 routes drawn, event detail card in bottom-left.
6. Click "Explain" — explanation mentions the event by name.
7. Click a different event marker on the map — selection moves, routes recompute.
8. Click Walk tab — events clear (markers gone, panel swapped back to Plan-a-Walk, routes cleared, inspector closed).

- [ ] **Step 3: Run typecheck and build**

Stop dev server. Then:

```powershell
npm run typecheck
npm run build
```

Expected: both pass with no errors. Build produces the `build/` directory.

- [ ] **Step 4: Note any issues**

If any step in Step 2 fails, fix in a follow-up commit on this branch before opening the PR. Use the systematic-debugging skill if a bug is non-obvious.

- [ ] **Step 5: Commit notes (if any fixes were needed)**

Any fixes use a commit message of the form `fix: <what>` and the file scope is added with `git add <specific-files>`.

---

### Task 16: Push branch and open PR to main

**Files:** none (git/gh operations)

- [ ] **Step 1: Push the branch**

```powershell
git push -u origin feat/events-on-app
```

- [ ] **Step 2: Open the PR**

```powershell
gh pr create --base main --head feat/events-on-app --title "feat: port What's On events feature to app/" --body @'
## Summary
- Brings the What's On events feature (scraper, markers, click-to-route, inspector, explain prompt) over to the current `app/` codebase. The previous implementation in `web/` is superseded by the React Router v7 app under `app/`.
- Reuses the existing `bake/src/scrape-events.ts` scraper verbatim; `scripts/adapt-bake.ts` now attaches `data/events.json` to the graph artifact.
- Refactors `MapApp` to consume the existing `useAppState` hook (previously unused); extends the hook with `mode` and `selectedEventId`.
- Activates the previously-ghosted Events tab. In Event mode: deck.gl marker layer, left-rail event list, event-detail inspector card, "N events today" pill above the slider.
- Event click maps `event.position` → nearest graph node via `findNearestNode`, then calls the existing client-side `computeRoutes` with Flinders St Station as origin.
- `api.explain` now accepts optional `destinationLabel`; when present, the LLM prompt references the destination by name.

Spec: `docs/superpowers/specs/2026-05-23-events-port-to-app-design.md`
Plan: `docs/superpowers/plans/2026-05-23-events-port-to-app.md`

## Test plan
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run dev` → Walk mode is unchanged from `main`
- [ ] Events tab activates and shows markers + list
- [ ] Click an event → 3 routes drawn from Flinders to event; detail card; explain references event
- [ ] Time slider day-scrub updates active events count and visibility
- [ ] Switching tabs clears state

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```

PowerShell here-string note: the closing `'@` must be at column 0.

- [ ] **Step 3: Verify PR URL was returned**

`gh pr create` prints the PR URL. Capture and surface it to the user.

---

## Out of scope — follow-up branches

Not covered by this plan, deliberately deferred:
- Removing the `web/` directory. After the PR merges, decide separately.
- Cleaning up `app/`'s duplicate components (inline-vs-separate-files). The PR should not touch the unused separate files.
- Activating Run / Cycle tabs.
- Real From-address geocoding.
- Hour-granular event filtering.
