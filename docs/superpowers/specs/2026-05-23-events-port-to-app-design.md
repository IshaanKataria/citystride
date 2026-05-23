# Events Port to `app/` — Design Spec

**Date:** 2026-05-23
**Status:** Approved (pending implementation)
**Author:** Ryan Sinnott + Claude (pair)

## Goal

Port the previously-shipped "What's On" events feature from the `web/` codebase onto the current `app/` codebase on `origin/main`. The events feature was built against an older `web/` React app that has since been superseded by a parallel React Router v7 + shadcn/Tailwind v4 implementation under `app/`. This spec describes a clean re-implementation in `app/` that preserves the feature's UX while adapting to `app/`'s state, routing, and component conventions.

Predecessor spec: `docs/superpowers/specs/2026-05-23-events-feature-design.md` (the `web/` implementation; remains valid history).

## Scope

In scope:
- Activate the previously-ghosted **Events** tab in `app/`'s `GhostTabs`.
- Render scraped City of Melbourne events as Deck.gl markers when in Event mode.
- Filter events by day-of-week derived from the time slider.
- Click marker → 3 routes computed from a fixed origin (Flinders St Station) to the event location, using `app/`'s existing client-side routing.
- Swap the inspector card to an event detail variant when an event is selected.
- Mention the destination event name in the explain prompt.
- Reuse the existing `bake/src/scrape-events.ts` scraper; attach `events.json` to the graph artifact via `scripts/adapt-bake.ts`.

Out of scope (deliberate cuts):
- Removing or migrating the `web/` directory. That's a separate decision after this lands.
- Hour-granular event filtering (day-of-week is enough, matches the `web/` shipped behaviour).
- Activating Run / Cycle tabs.
- Real From-address geocoding — From is hardcoded to Flinders St Station.
- Re-scrape during the demo.

## Branch & Integration Strategy

1. Create new branch `feat/events-on-app` off `origin/main`. Do **not** modify local `main` until the port is verified.
2. Reset divergent root files to `origin/main`'s versions: `package.json`, `package-lock.json`, `vercel.json`, `vite.config.ts`, `tsconfig.json`, `react-router.config.ts`. Adopt origin/main's `app/`, `public/`, `scripts/`, `.dockerignore`, `components.json` wholesale.
3. Carry across from `feat/events-from-whatson`: `bake/src/scrape-events.ts`, `bake/src/venue-resolver.ts`, `bake/src/event-venue-aliases.ts`, `data/events.json`, the events spec/plan docs in `docs/`.
4. Add a single script entry to root `package.json`: `"scrape:events": "tsx bake/src/scrape-events.ts"`.
5. Do **not** carry across any `web/src/` files. Re-implement events UI from scratch against `app/`.
6. After implementation, verify in the browser (see Testing). Push branch. Open PR into `main`.
7. After merge, retire `feat/events-from-whatson` branch.

## Architecture

### Bake-time (data pipeline)

- `bake/src/scrape-events.ts` (existing, unchanged) fetches CoM listings, extracts JSON-LD, resolves coordinates via `venue-resolver` + `event-venue-aliases`, writes `data/events.json`.
- `bake/src/scrape-events.ts` currently imports `Event` from `shared/types.ts`. Since `shared/` does not exist on `origin/main`, the `Event` type is inlined into `scrape-events.ts` (and the resolver) — a single ~10-line type. No `shared/` directory resurrected.
- `scripts/adapt-bake.ts` is extended: after building the `GraphArtifact`, attempt to read `data/events.json`. If present, parse and attach as `artifact.events`. Missing file → `events` field omitted (backward compatible).

### Runtime (`app/`)

- `app/routes/api.graph.ts` (existing) serves `data/graph.json`, which now optionally contains `events: Event[]`. No route changes required.
- Routing remains client-side via `app/lib/routing.ts` (`computeRoutes(nodes, edges, fromNodeId, toNodeId, hourOfWeek)`).
- Events drive routing by mapping `event.position` → nearest graph node via the existing `findNearestNode(nodes, lng, lat)` helper in `app/lib/graph.ts`.

## Data Shapes

`app/lib/types.ts` additions:

```ts
export interface Event {
  readonly id: string;                // slug, e.g. "satay-and-reog-festival"
  readonly name: string;
  readonly description: string;       // truncated to ~280 chars at bake time
  readonly url: string;
  readonly start_date: string;        // ISO date "YYYY-MM-DD"
  readonly end_date: string;
  readonly venue_name: string;
  readonly address: string | null;
  readonly position: readonly [number, number]; // [lng, lat]
  readonly resolved_via: "venues_json" | "alias_then_venues_json";
}

export type Mode = "walk" | "event";

export interface GraphArtifact {
  // existing fields ...
  readonly events?: readonly Event[];
}

export interface AppState {
  // existing fields ...
  readonly mode: Mode;
  readonly selectedEventId: string | null;
}
```

## State (`app/hooks/use-app-state.ts`)

The existing `useAppState` hook is currently defined but not consumed by `MapApp` (which uses local `useState`). This port:

1. Extends `useAppState` with:
   - `mode: Mode` (default `"walk"`)
   - `setMode(m: Mode)` — also clears `routes`, `routeQuery`, `routeComputedAt`, `selectedEventId`, `openExplanationRouteId`, `pinnedSegmentId`
   - `selectedEventId: string | null`
   - `setSelectedEvent(id: string | null)`
   - Modify `clearRoutes` to also clear `selectedEventId`
2. Refactors `MapApp` to consume `useAppState` instead of its current local `useState` pile. This is a targeted refactor of the file we're already changing.

Initial values: `mode: "walk"`, `selectedEventId: null`.

## Routing on Event Click

Hardcoded origin: Flinders St Station, `[144.967, -37.8183]`.

```ts
// In MapApp, computed once via useMemo against graph:
const flindersNodeId = useMemo(
  () => findNearestNode(graph.nodes, 144.967, -37.8183).id,
  [graph.nodes],
);

// On event marker click:
const handleEventClick = (ev: Event) => {
  const toNodeId = findNearestNode(graph.nodes, ev.position[0], ev.position[1]).id;
  setSelectedEvent(ev.id);
  setRouteQuery({ fromNode: flindersNodeId, toNode: toNodeId });
  const routes = computeRoutes(graph.nodes, graph.edges, flindersNodeId, toNodeId, state.time);
  setRoutes(routes, state.time);
};
```

No max-distance guard: events are scraped from CoM and sit inside the CBD bbox by construction.

## Components

### New: `app/components/events/event-markers.tsx`

- Mounted by `MapApp.getLayers()` only when `state.mode === "event"`.
- Two Deck.gl `ScatterplotLayer`s:
  - `event-rings`: ring around the currently-selected event (radius 16px, amber, hollow stroke).
  - `event-markers`: solid amber dots (radius 8px) for all events active at the current day.
- `pickable: true` on markers; `onClick` invokes the handler in §"Routing on Event Click"; `onHover` updates a local hover state for the tooltip.
- Helpers factored into `app/lib/events.ts` (consumed by `EventMarkers`, `EventListPanel`, and `TimeSlider` pill):
  - `sliderDayOfWeek(time: number): number` — `Math.floor(time / 24)`.
  - `dateDayOfWeek(iso: string): number` — UTC parse, convert Sun-first to Mon-first.
  - `eventActiveAt(ev: Event, sliderDay: number): boolean` — handles week-wrapping range.
  - `activeEventsAt(events: readonly Event[], time: number): readonly Event[]` — convenience filter.

### New: `app/components/events/event-list-panel.tsx`

- Mounted in the left rail when `state.mode === "event"` (replacing `PlanWalkPanel`).
- Lists events active today: name, venue, formatted date range. Clicking a row triggers the same `handleEventClick` flow as marker click.
- Includes a small header "N events today".

### Modified: `app/components/inspector/inspector-card.tsx`

- When `state.selectedEventId` is set and the event resolves, render the event detail variant:
  - Name
  - Formatted date range
  - Venue name + address
  - Description
  - "Open page →" external link
- Falls back to existing edge inspector when no event is selected.
- Close button clears `selectedEventId` (and routes, via `clearRoutes`).

### Modified: `app/components/ghosts/ghost-tabs.tsx`

- "Events" tab becomes active. `active` state is controlled by `state.mode`. Click handler calls `setMode("event")` for Events, `setMode("walk")` for Walk. Run / Cycle stay ghosted with "Coming soon".

### Modified: `app/components/slider/time-slider.tsx`

- When `state.mode === "event"`, show a small "N events today" pill above the slider, where N = count of events active for `sliderDayOfWeek(state.time)`.

### Modified: `app/components/map-app.tsx`

- Consume `useAppState` (replace local `useState`).
- Memoize `flindersNodeId`.
- Conditionally render `EventMarkers` layer when `mode === "event"`.
- Conditionally swap left rail: `PlanWalkPanel` when `mode === "walk"`, `EventListPanel` when `mode === "event"`.

## Explain Prompt

- `app/routes/api.explain.ts`: accept optional `{ destinationLabel?: string }` in the request body. If present, include `"Destination: ${destinationLabel}"` in the user message sent to Claude.
- `ExplainSlideOut` (or wherever the fetch lives): when opening the explain pane and `selectedEventId` is set, look up the event's `name` and pass as `destinationLabel`.
- When in Walk mode (no event), omit the field — prompt remains as it is on `origin/main`.

## Visual / UX Continuity

- Marker color: amber `rgb(251,191,36)` — matches the `web/` implementation.
- Inspector event-detail style: follow `app/`'s existing inspector card visual language (gray-900/95 background, etc.), not `web/`'s flatter styles. The CSS classes from `web/src/styles.css` are not carried over.

## Error Handling

- Missing `data/events.json` at bake → no events emitted, app behaves as before. No UI affordance is shown for "no events" — Events tab is simply not very useful.
- Zero events active on the selected day → marker layer empty, event list panel shows "No events today".
- `findNearestNode` is guaranteed to return a node (graph has nodes by precondition). No null-handling needed.

## Testing Strategy

Manual verification only (matches existing test surface):

1. After branch setup and dependency install: `npm run dev` boots cleanly.
2. Walk mode is unchanged from `origin/main` (no regressions in `PlanWalkPanel`, `TimeSlider`, `ExplainSlideOut`, `InspectorCard` for edges).
3. Events tab is clickable; switching tabs clears prior route/event state.
4. With `data/events.json` present, markers render at expected lat/lngs in Event mode.
5. Time slider day-shift hides/shows day-restricted events; "N events today" pill updates.
6. Click on marker → 3 routes draw between Flinders and the event; inspector shows event detail.
7. Click "Explain" on an event-driven route → explanation references the event by name.
8. Click on a different marker → state updates cleanly (rings move, routes recompute, inspector swaps).

No automated tests are added in this scope.

## Risks / Open Questions

- **`tsx` availability**: `tsx` is currently listed in `app/` dev dependencies (via `origin/main`'s `package.json`). `npm run scrape:events` relies on it. Confirmed available; no new dependency required.
- **Bake input format**: `scripts/adapt-bake.ts` is a near-pass-through; reading `data/events.json` is additive and shouldn't disturb existing behaviour. Verified by re-running adapt locally if needed.
- **PlanWalkPanel mount**: swapping panels (unmount/mount) means in-flight typeahead state in Plan-a-Walk resets when toggling to Events and back. Acceptable for this UX.
