# Route Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one named route at a time on the map via a tab strip in `PlanWalkPanel`, with instant tab switching and no recompute.

**Architecture:** `MapApp` holds `selectedKind` state (default `"lively"`, resets on clear); passes it + setter to `PlanWalkPanel`; `getLayers` draws only the matching route's `PathLayer` at fixed 8px width. `PlanWalkPanel` replaces its route list with a 3-tab strip plus a single detail row for the active route.

**Tech Stack:** React (useState, useCallback), Deck.gl PathLayer, Tailwind CSS, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `app/components/map-app.tsx` | All changes live here — two tasks below |

---

### Task 1: `MapApp` — add `selectedKind` state and filter `getLayers`

**Files:**
- Modify: `app/components/map-app.tsx`

No pure unit test exists for `getLayers` (it's a React hook closure). Verification is visual — run dev server after this task and confirm only one route renders.

- [ ] **Step 1: Add `RouteKind` to the types import**

On line 11 change:
```ts
import type { GraphArtifact, GraphEdge, Route } from "~/lib/types";
```
to:
```ts
import type { GraphArtifact, GraphEdge, Route, RouteKind } from "~/lib/types";
```

- [ ] **Step 2: Add `selectedKind` state inside `MapApp`**

After the `[isComputing, setIsComputing]` line (~line 477), add:
```ts
const [selectedKind, setSelectedKind] = useState<RouteKind>("lively");
```

- [ ] **Step 3: Reset `selectedKind` to `"lively"` in `handleClear`**

The current `handleClear` at ~line 642:
```ts
const handleClear = useCallback(() => {
  setRoutes(null);
  setRouteComputedAt(null);
}, []);
```
Replace with:
```ts
const handleClear = useCallback(() => {
  setRoutes(null);
  setRouteComputedAt(null);
  setSelectedKind("lively");
}, []);
```

- [ ] **Step 4: Replace the multi-route loop in `getLayers` with single-route draw**

The current `getLayers` has this block (~lines 503–521):
```ts
if (routes) {
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const c = ROUTE_COLORS[i % ROUTE_COLORS.length];
    layers.push(new PathLayer<Route>({
      id: `route-${route.id}`,
      data: [route],
      getPath: (d) => d.geometry,
      getColor: [...c, 220] as [number, number, number, number],
      getWidth: route.kind === "lively" ? 8 : 5,
      widthMinPixels: route.kind === "lively" ? 5 : 3,
      widthMaxPixels: 12,
      pickable: false,
    }));
  }
}
```
Replace with:
```ts
if (routes) {
  const selected = routes.find(r => r.kind === selectedKind);
  if (selected) {
    const c = ROUTE_COLORS[(selected.id - 1) % ROUTE_COLORS.length];
    layers.push(new PathLayer<Route>({
      id: `route-${selected.id}`,
      data: [selected],
      getPath: (d) => d.geometry,
      getColor: [...c, 220] as [number, number, number, number],
      getWidth: 8,
      widthMinPixels: 5,
      widthMaxPixels: 12,
      pickable: false,
    }));
  }
}
```

- [ ] **Step 5: Add `selectedKind` to `getLayers` dependency array**

The current dep array at ~line 522:
```ts
}, [graph, time, routes]);
```
Change to:
```ts
}, [graph, time, routes, selectedKind]);
```

- [ ] **Step 6: Extend `PlanWalkPanel` prop interface and pass new props from `MapApp`**

Current prop type (~line 168):
```ts
const PlanWalkPanel = ({ graph, routes, isComputing, onFindRoute, onClear, onExplain }: {
  graph: GraphArtifact; routes: readonly Route[] | null; isComputing: boolean;
  onFindRoute: (from: number, to: number) => void; onClear: () => void; onExplain: (id: number) => void;
}) => {
```
Replace with:
```ts
const PlanWalkPanel = ({ graph, routes, isComputing, onFindRoute, onClear, onExplain, selectedKind, onSelectKind }: {
  graph: GraphArtifact; routes: readonly Route[] | null; isComputing: boolean;
  onFindRoute: (from: number, to: number) => void; onClear: () => void; onExplain: (id: number) => void;
  selectedKind: RouteKind; onSelectKind: (kind: RouteKind) => void;
}) => {
```

- [ ] **Step 7: Pass `selectedKind` and `onSelectKind` from `MapApp` to `PlanWalkPanel`**

In the JSX (~line 659):
```tsx
<PlanWalkPanel
  graph={graph}
  routes={routes}
  isComputing={isComputing}
  onFindRoute={handleFindRoute}
  onClear={handleClear}
  onExplain={(id) => { const r = routes?.find((rt) => rt.id === id); if (r) { setExplainRoute(r); } }}
/>
```
Replace with:
```tsx
<PlanWalkPanel
  graph={graph}
  routes={routes}
  isComputing={isComputing}
  onFindRoute={handleFindRoute}
  onClear={handleClear}
  onExplain={(id) => { const r = routes?.find((rt) => rt.id === id); if (r) { setExplainRoute(r); } }}
  selectedKind={selectedKind}
  onSelectKind={setSelectedKind}
/>
```

- [ ] **Step 8: Run type-check to confirm no errors from our changes**

```bash
cd /Users/abhilash/Projects/personal/city-stride && npx tsc --noEmit 2>&1 | grep -v "antialias\|api\.explain"
```

Expected: no new errors (pre-existing `antialias` and `api.explain` errors are fine to ignore).

- [ ] **Step 9: Commit**

```bash
git add app/components/map-app.tsx
git commit -m "feat(map): add selectedKind state, filter getLayers to single route"
```

---

### Task 2: `PlanWalkPanel` — replace route list with tab strip

**Files:**
- Modify: `app/components/map-app.tsx` (PlanWalkPanel component only)

- [ ] **Step 1: Add `KIND_TAB_ORDER` and `KIND_INDEX` constants just below `KIND_LABEL`**

After the existing `KIND_LABEL` constant (~line 13–17), add:
```ts
const KIND_TAB_ORDER: RouteKind[] = ["lively", "accessible", "shortest"];
const KIND_INDEX: Record<RouteKind, number> = { lively: 0, accessible: 1, shortest: 2 };
```

- [ ] **Step 2: Replace the route list in `PlanWalkPanel` with tab strip + detail row**

The current routes section (~lines 228–260):
```tsx
{routes && routes.length > 0 && (
  <div className="mt-3 border-t border-border pt-3 space-y-2">
    {routes.map((route, i) => {
      const c = ROUTE_COLORS[i % ROUTE_COLORS.length];
      return (
        <div key={route.id} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}>{route.id}</span>
            <span className="text-xs text-card-foreground font-medium">{KIND_LABEL[route.kind]}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatLength(route.length_m)}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onExplain(route.id)} className="text-xs text-muted-foreground underline hover:text-foreground">Explain</button>
            <a
              href={googleMapsUrl(route)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Maps (walking directions)"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Open route in Google Maps"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </a>
          </div>
        </div>
      );
    })}
    <button onClick={onClear} className="text-xs text-muted-foreground underline hover:text-foreground">Clear routes</button>
  </div>
)}
```

Replace with:
```tsx
{routes && routes.length > 0 && (
  <div className="mt-3 border-t border-border pt-3">
    {/* Tab strip */}
    <div className="flex gap-1 mb-3">
      {KIND_TAB_ORDER.map((kind) => {
        const route = routes.find(r => r.kind === kind);
        if (!route) return null;
        const c = ROUTE_COLORS[KIND_INDEX[kind]];
        const isActive = selectedKind === kind;
        return (
          <button
            key={kind}
            onClick={() => onSelectKind(kind)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              isActive ? "text-white" : "text-muted-foreground hover:text-foreground bg-muted"
            }`}
            style={isActive ? { backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` } : {}}
          >
            {KIND_LABEL[kind]}
          </button>
        );
      })}
    </div>
    {/* Detail row for active route */}
    {(() => {
      const active = routes.find(r => r.kind === selectedKind);
      if (!active) return null;
      return (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatLength(active.length_m)} · score {(active.score * 100).toFixed(0)}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onExplain(active.id)} className="text-xs text-muted-foreground underline hover:text-foreground">Explain</button>
            <a
              href={googleMapsUrl(active)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Maps (walking directions)"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Open route in Google Maps"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </a>
          </div>
        </div>
      );
    })()}
    <button onClick={onClear} className="mt-2 text-xs text-muted-foreground underline hover:text-foreground">Clear routes</button>
  </div>
)}
```

- [ ] **Step 3: Run type-check**

```bash
cd /Users/abhilash/Projects/personal/city-stride && npx tsc --noEmit 2>&1 | grep -v "antialias\|api\.explain"
```

Expected: no new errors.

- [ ] **Step 4: Run existing tests to confirm routing/scoring unchanged**

```bash
cd /Users/abhilash/Projects/personal/city-stride && npx vitest run
```

Expected: all 10 tests pass (5 scoring + 5 routing).

- [ ] **Step 5: Visual verification — start dev server and test**

```bash
cd /Users/abhilash/Projects/personal/city-stride && npm run dev
```

Open `http://localhost:5173` (or the port shown). Verify:
- After computing routes, tab strip shows 3 colored tabs: Lively / Accessible / Shortest
- Active tab (default: Lively) is colored with ROUTE_COLORS[0]
- Only one route line is drawn on the map at a time
- Clicking a tab instantly switches the map route and detail row — no recompute
- Detail row shows correct length + score for active tab
- Explain and Google Maps buttons work for active route
- "Clear routes" removes tabs and route line; next compute defaults back to Lively tab

- [ ] **Step 6: Commit**

```bash
git add app/components/map-app.tsx
git commit -m "feat(map): replace route list with tab strip, show one route at a time"
```
