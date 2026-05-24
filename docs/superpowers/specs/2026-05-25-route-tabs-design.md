# Route Tabs Design

**Date:** 2026-05-25  
**Status:** Approved

## Problem

All 3 named routes (Lively, Accessible, Shortest) are drawn simultaneously on the map, creating visual clutter and making individual routes hard to read.

## Goal

Show one route at a time via a tab strip. Switching tabs is instant (no recompute). Default tab is Lively.

## Approach

Option A: `selectedKind` state in `PlanWalkPanel`, passed up to `MapApp` via callback. `MapApp` filters map layers to only the selected route.

## State & Data Flow

`MapApp` gains:

```ts
const [selectedKind, setSelectedKind] = useState<RouteKind>("lively");
```

Resets to `"lively"` when routes are cleared.

`PlanWalkPanel` prop interface gains:

```ts
selectedKind: RouteKind;
onSelectKind: (kind: RouteKind) => void;
```

`getLayers` receives `selectedKind` and only draws the matching route's PathLayer. `selectedKind` added to `getLayers` dependency array.

## UI: Tab Strip

Replaces the route list. Visible only when `routes !== null`.

```
┌─────────────────────────────────────┐
│ Plan a Walk                          │
│ [From...] [To...]  [Find route]      │
│                                      │
│ ● Lively  ○ Accessible  ○ Shortest  │
│ ─────────────────────────────────── │
│ 2.3 km · score 74    [Explain] [↗]  │
└─────────────────────────────────────┘
```

- 3 tabs: Lively / Accessible / Shortest
- Active tab uses its route color (ROUTE_COLORS[0/1/2] for lively/accessible/shortest)
- Clicking a tab updates `selectedKind` — instant, no recompute
- Below tabs: single detail row for active route showing `length_m` + `score`
- Explain and Google Maps buttons remain on the detail row
- "Clear routes" link below detail row

## Map Layer Changes

`getLayers` changes from drawing all routes to drawing only the selected one:

```ts
// Only draw the selected route
const selected = routes.find(r => r.kind === selectedKind);
if (selected) {
  layers.push(new PathLayer({ ...selected, getWidth: 8, widthMinPixels: 5 }));
}
```

Width fixed at 8px (no longer conditional — only one route shown at a time). Base streetscore layer dimming behaviour unchanged.

## Out of Scope

- Animating between tab switches
- Showing multiple routes simultaneously ("compare" mode)
- Persisting selected tab across sessions
