# Events Feature — Design Spec

**Date:** 2026-05-23
**Status:** Implemented
**Author:** Ryan Sinnott + Claude (pair)

## Goal

Surface City of Melbourne "What's On" events as clickable points on the CityStride map. Selecting an event drives the existing 3-route planning flow with the event location as destination. Activates the previously-ghosted **Event** tab.

## Scope

In scope:
- One-time scrape of https://whatson.melbourne.vic.gov.au at bake time, output frozen `data/events.json`.
- Resolve each event to lng/lat by fuzzy-matching its venue name against the existing `data/raw/venues.json` (CoM Open Data venues with `feature_name` + `co_ordinates`) and a small alias table for common name variants. Drop events that resolve neither way.
- Event tab in the mode bar becomes a real toggle alongside Walk.
- In Event mode: render event markers, filter by time slider (day-granular), click to set destination + compute 3 routes, swap inspector card to event detail, mention destination event in the Explain prompt.

Out of scope (deliberate cuts):
- Pagination of scraped listings; we take what the landing + 3 category pages give us (~25–40 events).
- Hour-granular event scheduling — the slider day-of-week is enough for the demo.
- Activating Run / Cycle tabs.
- Geocoding the From-input. The From textbox stays display-only as it is today — coords remain hardcoded Flinders St Station. The user can rename the From label freely; routing always starts from Flinders. Real address geocoding (PRD F4) remains a separate task.
- Refresh/re-scrape during the demo. "Import once for the demo, more elegant solution later" (user direction).

## Architecture

Follows the existing build/run split principle from the PRD.

**Bake time** (new):
1. `bake/src/scrape-events.ts` fetches the listings index + a few category pages, collects `/things-to-do/<slug>` links, dedupes against a deny-list of category slugs.
2. For each candidate slug, fetches the detail page and extracts the `<script type="application/ld+json">` block. Validates `@type === "Event"`. Pulls `name`, `description`, `startDate`, `endDate`, `location.name`, `location.address.streetAddress`.
3. Resolves coordinates via the geocoding pipeline (see below).
4. Writes `data/events.json` (~25–30 entries).

**Runtime** (unchanged):
- `bake/src/build-graph.ts` reads `data/events.json` if present and attaches the array as `events` on the `GraphArtifact`. Backward-compatible (missing file → empty array).
- `/api/graph` serves the events as part of the artifact.
- `/api/plan-walk` is unchanged; event coordinates are just another lng/lat destination.

**Web** (new layer + small state extensions):
- `EventMarkers.tsx` renders a deck.gl `ScatterplotLayer` over the streets layer when in Event mode.
- Click on a marker → `setSelectedEvent(id)` + `planWalk(from, event.position, time)`.
- Walk vs Event becomes a real toggle in the mode bar.

## Data Shapes

`Event` type (added to `shared/types.ts`):

```ts
type Event = {
  id: string;              // slug, e.g. "satay-and-reog-festival"
  name: string;
  description: string;     // truncated to ~280 chars at bake time
  url: string;             // canonical /things-to-do/<slug>
  start_date: string;      // ISO date "YYYY-MM-DD"
  end_date: string;        // ISO date
  venue_name: string;      // e.g. "Fed Square"
  address: string | null;  // streetAddress from JSON-LD; may be intersection
  position: [number, number];  // [lng, lat] — required; bake drops events without it
  resolved_via: "venues_json" | "alias_then_venues_json";
};
```

`GraphArtifact` extension: `events: Event[]` (additive; web treats as optional for backward compatibility).

Store extensions (`web/src/state/store.ts`):
- `mode: "walk" | "event"` (default `"walk"`)
- `selectedEventId: string | null`
- `setMode`, `setSelectedEvent` setters
- `clearRoutes` also clears `selectedEventId`

`data/events.json` is the array of `Event`. Small (~10–20 KB), committed to git (no LFS).

## Scraper Details

**Discovery:**
- Fetch `/things-to-do`, `/things-to-do/major-events`, `/things-to-do/free`, `/things-to-do/entertainment`.
- Regex `/things-to-do/<slug>` links, filter known category slugs via a `CATEGORY_SLUGS` deny-list constant (`free`, `family-and-kids`, `entertainment`, `attractions-and-sights`, `major-events`, etc.).
- Dedupe. Expect ~25–40 unique event slugs.

**Extraction per detail page:**
- `fetch(url)` with polite UA, 5 s timeout, 300 ms inter-request delay. Retry once on transient error, skip on second failure.
- Regex `<script type="application/ld+json"[^>]*>(.+?)</script>` (non-greedy, `s` flag). `JSON.parse` the captured group.
- If `@type !== "Event"` or required fields missing, skip with a warn log.
- Truncate `description` to ~280 chars.

**Geocoding pipeline (in order):**
1. **CoM Venues fuzzy match** — load `data/raw/venues.json` once (already in the repo: array of `{feature_name, co_ordinates: {lon, lat}, theme, sub_theme}`). Normalize both event `venue_name` and every `feature_name` (lowercase, strip non-alphanumeric, collapse whitespace), then score with token-set similarity. Accept best match if score ≥ 0.85 over a min-length threshold.
2. **Alias table** — `bake/src/event-venue-aliases.ts` exports ~10–15 common-name → canonical-feature-name mappings ("Fed Square" → "Federation Square", "NGV" → "National Gallery of Victoria", etc.). Applied to event `venue_name` before step 1.
3. **CBD bounds check** — drop any coordinate outside lng `[144.93, 145.00]`, lat `[-37.83, -37.79]`. Guards against accidental cross-suburb matches.
4. All fail → drop the event with `console.warn(slug, venue_name)` so the operator can decide whether to extend the alias table.

**Output:** writes `data/events.json` and prints a single-line summary: `Scraped N candidates, geocoded M, dropped K (slugs: ...)`.

**Total bake-step budget:** ~30 s for the full scrape.

## UI Behavior

**Mode toggle** (`web/src/components/Ghosts.tsx`):
- Event tab `active: true`, tooltip removed.
- All tabs become real buttons bound to `store.mode`. Run and Cycle stay ghosted (`disabled`, "Coming soon" tooltip).
- Inactive-but-clickable tabs get a new `mode-inactive` CSS class (between `mode-active` and `mode-ghost`).

**Walk mode:** unchanged. PlanPanel hardcoded Flinders→Carlton button still works as today.

**Event mode:**
- Streetscore layer stays (still needed to see *how* to walk to the event).
- New `<EventMarkers />` renders all events whose `[start_date, end_date]` interval contains the slider's current calendar day. Markers are warm amber (`#fbbf24`), ~10 px, pickable.
- Selected event marker gets a subtle ring.
- Time filter readout pill above the slider: `"3 events at Fri 22:00"` (live). Zero events → `"No events at this time — try another moment."`

**Click handling:**
- Event marker click: `setSelectedEvent(id)`, `setRouteQuery({ from: FLINDERS, to: event.position, fromLabel, toLabel: event.name })`, `planWalk(...)` immediately. From coord is the existing hardcoded Flinders St Station constant. No separate "Find route" confirmation.
- Empty map click: dismiss inspector and selected event (existing behavior preserved).
- Street segment clicks still pickable for inspector. Event markers take z-order precedence (deck.gl picking), so clicking a marker doesn't also pin a street.

**PlanPanel updates:**
- From input remains display-only — routing origin is always the hardcoded Flinders St Station coord, as it is today. Renaming the From text changes only the label shown in the legend. Real address geocoding is out of scope (PRD F4 remains future work).
- To input: in Walk mode, unchanged. In Event mode with `selectedEventId !== null`, input disables and displays the event name with a small `×` to clear (which also clears the route and selected event).
- Find-route button: visible in Walk mode (today's behavior). Hidden in Event mode — routes auto-compute on event marker click.
- Recompute / stale-time / Clear routes buttons unchanged. Clear routes also clears `selectedEventId`.

**HoverTooltip:** when hovering an event marker, shows `event.name` and date range formatted as `Fri 23 May` (or `Fri 23 May → Tue 27 May` for ranges).

**InspectorCard:** when `selectedEventId !== null`, content swaps from street metrics to event detail: name, formatted date range, venue name, truncated description, "Open page" link to the canonical URL. Card frame, pin/close mechanics unchanged.

**ExplainPane:** unchanged surface. The `runtime/src/explain.ts` system prompt accepts an optional `destinationLabel` field on the request. When the destination is an event, web sends `destinationLabel: "the event '<event.name>' at <venue_name>"`; explain.ts inserts one context line. Output naturally mentions the event by name.

## File-by-File Changes

**New (6):**
- `bake/src/scrape-events.ts` — scraper entrypoint. ~200 lines.
- `bake/src/event-venue-aliases.ts` — common-name → canonical-`feature_name` alias map. ~20 lines.
- `bake/src/venue-resolver.ts` — small token-set fuzzy match over `venues.json`, used only at bake time. ~60 lines.
- `data/events.json` — frozen scraped output. Committed.
- `web/src/components/EventMarkers.tsx` — ScatterplotLayer + click/hover wiring. ~80 lines.
- `docs/superpowers/specs/2026-05-23-events-feature-design.md` — this file.

**Modified (10):**
- `shared/types.ts` — add `Event`, extend `GraphArtifact.events`.
- `bake/src/build-graph.ts` — read `data/events.json` if present, attach to artifact.
- `web/src/state/store.ts` — add `mode`, `selectedEventId`, setters; extend `clearRoutes`.
- `web/src/components/Ghosts.tsx` — Event tab activation, mode toggle wiring, `mode-inactive` style.
- `web/src/components/MapLayers.tsx` — mount `<EventMarkers />` in Event mode; ensure z-order with streets layer.
- `web/src/components/PlanPanel.tsx` — To-field disable-on-event-selected with × clear; Find-route button hidden when `mode === "event"` (route-computed by marker click in that mode).
- `web/src/components/InspectorCard.tsx` — branch on `selectedEventId`: street metrics vs event detail.
- `web/src/components/HoverTooltip.tsx` — event hover content.
- `web/src/styles.css` — `.event-marker`, `.event-marker--selected`, `.mode-inactive`, `.time-filter-pill`.
- `runtime/src/explain.ts` — accept optional `destinationLabel`, insert into system context.
- Root `package.json` — add `"scrape:events": "tsx bake/src/scrape-events.ts"` script.

## Test Plan (Manual)

No test infra exists in this hackathon codebase. Manual verification:

1. **Bake**: `npm run scrape:events` once. Eyeball the console summary (expect ~25–30 events kept, a handful dropped). Open `data/events.json`, sanity-check one entry has plausible coords inside Melbourne CBD.
2. **Runtime restart**: confirm `/api/graph` payload includes the `events` field.
3. **Web — Event mode**:
   - Switch to Event tab. Markers appear, filtered by slider position.
   - Drag slider to different days. Marker set updates. Pill text matches count.
   - Hover a marker — tooltip shows event name + date.
   - Click a marker — 3 routes render, PlanPanel's To input shows event name, inspector card shows event detail.
   - Click `Explain` on Route 1 — streaming text references the event by name.
4. **Web — back to Walk mode**: markers gone, original click-to-inspect behavior intact, original Find-route button still works.
5. **Edge cases**:
   - Drag slider to a moment with no events — pill reads "No events at this time."
   - Clear routes — selected event also clears.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Site markup changes between bake runs | JSON-LD extraction is stable; per user direction, scrape is one-shot for demo and frozen. |
| R2 | <60% geocode coverage looks thin | Seed venue table aggressively with ~30 CBD venues from a pre-pass over listing pages. |
| R3 | Most events are full-day, slider is hour-of-week | Treat any event whose date range covers the slider's calendar day as "happening" (day-granular filter). |
| R4 | Marker color collides with route palette | Use warm amber `#fbbf24`; verify visually on running app and shift hue if it clashes. |
| R5 | Click on marker also pins a street | Z-order via deck.gl picking — event marker layer mounted after streets layer; marker click suppresses street click. |

## Decisions Locked

1. **Bake-time scrape**, frozen `data/events.json` — no runtime scraping.
2. **Activate Event tab** as a real mode; do not show event markers in Walk mode.
3. **Time filter is day-granular**.
4. **Route origin** = hardcoded Flinders St Station (unchanged from today). From-input remains label-only.
5. **Click event auto-triggers `planWalk`** — no separate Find-route confirmation.
6. **No pagination**; landing + 3 category pages is enough for demo coverage.
7. **No Playwright**; plain HTTP + JSON-LD extraction is sufficient (site is server-rendered Rails).

## Next Step

After this spec is approved by the user, transition to `superpowers:writing-plans` to produce an implementation plan with checkpoints.
