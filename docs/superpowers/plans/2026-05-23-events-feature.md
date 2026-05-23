# Events Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape City of Melbourne "What's On" events at bake time, activate the Event tab, and wire marker-click to the existing 3-route planning flow.

**Architecture:** One-shot HTTP scrape of whatson.melbourne.vic.gov.au extracts JSON-LD Event blocks from detail pages. Coordinates resolve via fuzzy match against the existing `data/raw/venues.json` (CoM Open Data) plus a tiny alias table. Output is a frozen `data/events.json`. The runtime's `graph-loader.ts` reads it alongside the existing graph artifact and attaches `events` to the in-memory `GraphArtifact`. Web adds a new `EventMarkers` deck.gl layer mounted in Event mode and a small store extension (`mode`, `selectedEventId`).

**Tech Stack:** TypeScript end-to-end. `tsx` for bake/runtime. Node 20+ native `fetch`. React + zustand + react-map-gl + deck.gl on web. No test framework — verification is manual per spec (`docs/superpowers/specs/2026-05-23-events-feature-design.md`).

**Background context (read first):**
- Spec: `docs/superpowers/specs/2026-05-23-events-feature-design.md` — the source of truth for behavior.
- `bake/src/build-graph.ts` is a TODO skeleton. The real graph artifact at `web/public/graph.json` was built by a different teammate script and committed. **Do not run `bake/src/build-graph.ts`** — it would clobber the artifact with empty arrays. Events get attached in `runtime/src/graph-loader.ts` instead, which is the right hook.
- The runtime serves `GET /api/graph`, which returns whatever `getArtifact()` returns — so adding events there propagates to web for free.
- This is a hackathon repo with **no test framework**. Verification steps are manual (curl + browser checks). Each task ends with a manual verify + commit.

---

## File Structure

**Bake-time (new):**
- `bake/src/event-venue-aliases.ts` — common-name → canonical-`feature_name` alias map (~10–15 entries).
- `bake/src/venue-resolver.ts` — token-set fuzzy match over `data/raw/venues.json`. Used only by the scraper.
- `bake/src/scrape-events.ts` — scraper entrypoint. Discovers slugs, fetches detail pages, extracts JSON-LD, resolves coordinates, writes `data/events.json`.

**Bake-time output (new, committed):**
- `data/events.json` — frozen list of events with resolved coordinates.

**Shared types:**
- `shared/types.ts` — add `Event` type, extend `GraphArtifact` with optional `events?: Event[]`.

**Runtime:**
- `runtime/src/graph-loader.ts` — also load `data/events.json` if present, attach as `events` on the artifact.
- `runtime/src/explain.ts` — accept optional `destinationLabel`, insert into Claude system context.

**Web (new):**
- `web/src/components/EventMarkers.tsx` — deck.gl `ScatterplotLayer` of events filtered by slider day, click/hover wired to store.

**Web (modified):**
- `web/src/lib/api.ts` — graph type already comes through; nothing structural, but `Event` import wired.
- `web/src/state/store.ts` — add `mode`, `selectedEventId`, setters; extend `clearRoutes`.
- `web/src/components/Ghosts.tsx` — activate Event tab, wire mode toggle.
- `web/src/components/MapLayers.tsx` — mount `<EventMarkers />` in Event mode.
- `web/src/components/PlanPanel.tsx` — To-input disable + × clear when event selected; hide Find-route button in Event mode; auto-`planWalk` on event-select.
- `web/src/components/HoverTooltip.tsx` — render event name + date range when hovering an event marker.
- `web/src/components/InspectorCard.tsx` — branch on `selectedEventId`: street metrics vs event detail.
- `web/src/styles.css` — `.event-marker`, `.event-marker--selected`, `.mode-inactive`, `.time-filter-pill`.

**Package script:**
- Root `package.json` — add `"scrape:events": "tsx bake/src/scrape-events.ts"`.

---

## Task 1: Add Event type and extend GraphArtifact

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add the Event type and extend GraphArtifact**

Append to `shared/types.ts` after the existing `Edge` types, before `RouteSegment`:

```ts
export type Event = {
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

Then change the `GraphArtifact` type to include events:

```ts
export type GraphArtifact = {
  version: string;
  built_at: string;
  bbox: [number, number, number, number];
  nodes: Node[];
  edges: Edge[];
  events?: Event[];
};
```

- [ ] **Step 2: Verify the type compiles**

Run from repo root:

```bash
cd web && npx tsc --noEmit -p . 2>&1 | head -20
```

Expected: zero errors, exit 0. (Web is the only package with `tsc -b` configured today.)

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add Event type and extend GraphArtifact"
```

---

## Task 2: Build the venue resolver + alias table

**Files:**
- Create: `bake/src/event-venue-aliases.ts`
- Create: `bake/src/venue-resolver.ts`

- [ ] **Step 1: Create the alias table**

Create `bake/src/event-venue-aliases.ts`:

```ts
// Common event-page venue names → canonical `feature_name` in data/raw/venues.json.
// Extend this table when the scraper warns about an un-resolvable venue.
export const VENUE_ALIASES: Record<string, string> = {
  "fed square": "Federation Square",
  "federation sq": "Federation Square",
  "ngv": "NGV International",
  "ngv international": "NGV International",
  "ngv australia": "The Ian Potter Centre: NGV Australia",
  "acmi": "Australian Centre For The Moving Image (ACMI)",
  "australian centre for the moving image": "Australian Centre For The Moving Image (ACMI)",
  "arts centre melbourne": "Victorian Arts Centre",
  "the arts centre": "Victorian Arts Centre",
  "arts centre": "Victorian Arts Centre",
  "hamer hall": "Hamer Hall",
  "state library": "State Library Victoria",
  "state library of victoria": "State Library Victoria",
  "queen vic market": "Queen Victoria Market",
  "qvm": "Queen Victoria Market",
  "royal exhibition building": "Royal Exhibition Building",
  "melbourne museum": "Melbourne Museum",
  "melbourne town hall": "Melbourne Town Hall",
  "town hall": "Melbourne Town Hall",
};
```

- [ ] **Step 2: Create the venue resolver**

Create `bake/src/venue-resolver.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VENUE_ALIASES } from "./event-venue-aliases.ts";
import type { LngLat } from "../../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENUES_PATH = join(__dirname, "..", "..", "data", "raw", "venues.json");

const CBD_BOUNDS = {
  lng_min: 144.93,
  lng_max: 145.0,
  lat_min: -37.83,
  lat_max: -37.79,
};

type Venue = {
  feature_name: string;
  co_ordinates: { lon: number; lat: number };
};

let venuesCache: Array<{ tokens: Set<string>; raw: Venue }> | null = null;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 1));
}

async function getVenues() {
  if (venuesCache) return venuesCache;
  const raw = JSON.parse(await readFile(VENUES_PATH, "utf-8")) as Venue[];
  venuesCache = raw
    .filter((v) => v.feature_name && v.co_ordinates)
    .map((v) => ({ tokens: tokenize(v.feature_name), raw: v }));
  return venuesCache;
}

function tokenSetSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

function inBounds(lng: number, lat: number): boolean {
  return (
    lng >= CBD_BOUNDS.lng_min &&
    lng <= CBD_BOUNDS.lng_max &&
    lat >= CBD_BOUNDS.lat_min &&
    lat <= CBD_BOUNDS.lat_max
  );
}

export type ResolveResult =
  | { position: LngLat; resolved_via: "venues_json" | "alias_then_venues_json" }
  | null;

export async function resolveVenue(venueName: string): Promise<ResolveResult> {
  const venues = await getVenues();
  const normalizedInput = normalize(venueName);
  const aliasHit = VENUE_ALIASES[normalizedInput];
  const queryName = aliasHit ?? venueName;
  const queryTokens = tokenize(queryName);

  let best: { sim: number; venue: Venue } | null = null;
  for (const v of venues) {
    const sim = tokenSetSimilarity(queryTokens, v.tokens);
    if (!best || sim > best.sim) best = { sim, venue: v.raw };
  }

  if (!best || best.sim < 0.5) return null;

  const lng = best.venue.co_ordinates.lon;
  const lat = best.venue.co_ordinates.lat;
  if (!inBounds(lng, lat)) return null;

  return {
    position: [lng, lat],
    resolved_via: aliasHit ? "alias_then_venues_json" : "venues_json",
  };
}
```

Note on threshold: 0.5 token-set Jaccard is intentionally permissive. The CBD bounds check screens out cross-suburb matches; a higher threshold would drop too many short venue names.

- [ ] **Step 3: Verify by running it inline against a known venue**

Run this one-liner from repo root:

```bash
cd bake && npx tsx --eval "import('./src/venue-resolver.ts').then(m => m.resolveVenue('Federation Square').then(r => console.log(JSON.stringify(r))))"
```

Expected output: a JSON object with `position` inside CBD bounds and `resolved_via: "venues_json"`. Example:

```json
{"position":[144.9686...,-37.8175...],"resolved_via":"venues_json"}
```

If `null` comes back, `Federation Square` isn't in venues.json under that exact name — try with the alias path:

```bash
cd bake && npx tsx --eval "import('./src/venue-resolver.ts').then(m => m.resolveVenue('Fed Square').then(r => console.log(JSON.stringify(r))))"
```

Expected: same coord, `resolved_via: "alias_then_venues_json"`.

- [ ] **Step 4: Commit**

```bash
git add bake/src/event-venue-aliases.ts bake/src/venue-resolver.ts
git commit -m "feat: venue fuzzy resolver + alias table for events"
```

---

## Task 3: Write the event scraper

**Files:**
- Create: `bake/src/scrape-events.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: Write the scraper**

Create `bake/src/scrape-events.ts`:

```ts
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVenue } from "./venue-resolver.ts";
import type { Event } from "../../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "..", "data");
const OUTPUT_FILE = join(OUTPUT_DIR, "events.json");

const BASE = "https://whatson.melbourne.vic.gov.au";
const LISTING_PAGES = [
  "/things-to-do",
  "/things-to-do/major-events",
  "/things-to-do/free",
  "/things-to-do/entertainment",
];
const CATEGORY_SLUGS = new Set([
  "free",
  "family-and-kids",
  "entertainment",
  "attractions-and-sights",
  "major-events",
  "food-and-drink",
  "shopping",
  "wellness",
  "outdoors",
  "tours-and-trails",
  "exhibitions",
  "music",
  "performance",
  "history-and-heritage",
  "community-events",
  "lgbtqia",
  "free-things-to-do",
]);
const UA = "CityStrideBot/0.1 (hackathon demo; +https://citystride.local)";
const FETCH_TIMEOUT_MS = 5000;
const REQUEST_DELAY_MS = 300;
const DESCRIPTION_MAX = 280;

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextRetry(url: string): Promise<string | null> {
  const first = await fetchText(url);
  if (first !== null) return first;
  await sleep(500);
  return fetchText(url);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractSlugs(html: string): string[] {
  const re = /\/things-to-do\/([a-z0-9][a-z0-9-]*)/g;
  const slugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (!CATEGORY_SLUGS.has(slug)) slugs.add(slug);
  }
  return [...slugs];
}

type LdEvent = {
  "@type": string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    "@type"?: string;
    name?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      postalCode?: string;
    };
  };
};

function extractJsonLd(html: string): LdEvent | null {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj && obj["@type"] === "Event") return obj as LdEvent;
    } catch {
      // try next block
    }
  }
  return null;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

async function discoverSlugs(): Promise<string[]> {
  const all = new Set<string>();
  for (const path of LISTING_PAGES) {
    const html = await fetchTextRetry(BASE + path);
    if (!html) {
      console.warn(`skip listing ${path}: fetch failed`);
      continue;
    }
    for (const slug of extractSlugs(html)) all.add(slug);
    await sleep(REQUEST_DELAY_MS);
  }
  return [...all];
}

async function scrapeOne(slug: string): Promise<Event | null> {
  const url = `${BASE}/things-to-do/${slug}`;
  const html = await fetchTextRetry(url);
  if (!html) {
    console.warn(`drop ${slug}: detail fetch failed`);
    return null;
  }
  const ld = extractJsonLd(html);
  if (!ld) {
    console.warn(`drop ${slug}: no JSON-LD Event block`);
    return null;
  }
  if (!ld.name || !ld.startDate || !ld.endDate || !ld.location?.name) {
    console.warn(`drop ${slug}: missing required fields`);
    return null;
  }

  const resolved = await resolveVenue(ld.location.name);
  if (!resolved) {
    console.warn(`drop ${slug}: venue '${ld.location.name}' not in venues.json`);
    return null;
  }

  return {
    id: slug,
    name: ld.name,
    description: truncate(ld.description ?? "", DESCRIPTION_MAX),
    url,
    start_date: ld.startDate,
    end_date: ld.endDate,
    venue_name: ld.location.name,
    address: ld.location.address?.streetAddress ?? null,
    position: resolved.position,
    resolved_via: resolved.resolved_via,
  };
}

async function main() {
  console.log("citystride event scraper starting...");
  const slugs = await discoverSlugs();
  console.log(`discovered ${slugs.length} candidate slugs`);

  const events: Event[] = [];
  const dropped: string[] = [];
  for (const slug of slugs) {
    const ev = await scrapeOne(slug);
    if (ev) events.push(ev);
    else dropped.push(slug);
    await sleep(REQUEST_DELAY_MS);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(events, null, 2));
  console.log(
    `Scraped ${slugs.length} candidates, kept ${events.length}, dropped ${dropped.length} (${dropped.join(", ")})`,
  );
  console.log(`wrote ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

Modify root `package.json` `scripts` block. Replace the existing `scripts` object with:

```json
"scripts": {
  "bake": "node bake/bake.js",
  "fetch": "node bake/fetch.js",
  "scrape:events": "tsx bake/src/scrape-events.ts"
}
```

- [ ] **Step 3: Install tsx at the root if not present**

```bash
npm install --save-dev tsx 2>&1 | tail -5
```

Expected: a single `added N packages` line, no errors. (tsx is already in bake/runtime devDependencies, but the root needs it for the `npm run` script.)

- [ ] **Step 4: Commit (without running the scraper yet)**

```bash
git add bake/src/scrape-events.ts package.json package-lock.json
git commit -m "feat: event scraper script"
```

---

## Task 4: Run the scraper and commit the output

**Files:**
- Create (via script): `data/events.json`

- [ ] **Step 1: Run the scraper**

```bash
npm run scrape:events
```

Expected: 30-60 seconds, finishes with a summary line like:

```
Scraped 28 candidates, kept 19, dropped 9 (slug-a, slug-b, ...)
wrote .../data/events.json
```

If "kept" is 0 or very low (<5), inspect the first warning lines — most likely cause is the venue name format doesn't match `feature_name` in venues.json. Add aliases to `bake/src/event-venue-aliases.ts` for the warned venues, commit that, then re-run the scraper.

- [ ] **Step 2: Sanity-check the output**

```bash
head -50 data/events.json
```

Expected: a JSON array of objects, each with `id`, `name`, `position` (a `[lng, lat]` pair where lng is around 144.96-144.98 and lat is around -37.80 to -37.82), and `resolved_via` either `"venues_json"` or `"alias_then_venues_json"`.

- [ ] **Step 3: Commit**

```bash
git add data/events.json
git commit -m "feat: scraped events snapshot for demo"
```

If you also added aliases during step 1, those should already be in a separate commit from Task 2 follow-up. If they're not committed yet:

```bash
git add bake/src/event-venue-aliases.ts
git commit -m "feat: extend venue alias table for scraped events"
```

---

## Task 5: Load events from graph-loader

**Files:**
- Modify: `runtime/src/graph-loader.ts`

- [ ] **Step 1: Read events.json and attach to artifact**

In `runtime/src/graph-loader.ts`, add the events file path constant after the `__dirname` line (around line 8):

```ts
const EVENTS_FILE = join(__dirname, "..", "..", "data", "events.json");
```

Add the Event type to the existing import from shared/types.ts (line 6):

```ts
import type { GraphArtifact, Edge, Node, LngLat, Event } from "../../shared/types.ts";
```

Then, inside `loadGraph()`, **after** the existing `validate(artifact, chosenPath)` call (line 124) and **before** `const graph = createGraph<...>` (line 126), insert:

```ts
  if (existsSync(EVENTS_FILE)) {
    try {
      const eventsRaw = JSON.parse(await readFile(EVENTS_FILE, "utf-8")) as Event[];
      artifact.events = eventsRaw;
      console.log(`Loaded ${eventsRaw.length} events from ${EVENTS_FILE}`);
    } catch (err) {
      console.warn(`events load failed (${EVENTS_FILE}): ${String(err)}`);
    }
  }
```

- [ ] **Step 2: Restart the runtime and verify**

If `npm run dev` is running in `runtime/`, tsx watch should auto-restart. Otherwise restart:

```bash
cd runtime && npm run dev
```

Wait for the log line: `Loaded N events from .../data/events.json`. Then in another terminal:

```bash
curl -s http://localhost:4001/api/graph | node -e "let d=''; process.stdin.on('data', c => d+=c).on('end', () => { const obj = JSON.parse(d); console.log('events:', Array.isArray(obj.events), obj.events?.length); console.log('first event:', JSON.stringify(obj.events?.[0])); })"
```

Expected: `events: true <N>` (matching the count from Task 4) followed by a JSON object for the first event with `position` inside CBD bounds.

- [ ] **Step 3: Commit**

```bash
git add runtime/src/graph-loader.ts
git commit -m "feat: load events.json into graph artifact at runtime"
```

---

## Task 6: Extend the web store with mode + selected event

**Files:**
- Modify: `web/src/state/store.ts`

- [ ] **Step 1: Add mode and selectedEventId to the store**

In `web/src/state/store.ts`, replace the entire file with:

```ts
import { create } from "zustand";
import type { GraphArtifact, Route, LngLat } from "../../../shared/types";

type RouteQuery = {
  from: LngLat;
  to: LngLat;
  fromLabel: string;
  toLabel: string;
};

type Mode = "walk" | "event";

type Store = {
  graph: GraphArtifact | null;
  time: number;
  mode: Mode;
  selectedEventId: string | null;
  routeQuery: RouteQuery | null;
  routes: Route[] | null;
  routeComputedAt: number | null;
  pinnedSegmentId: string | null;
  openExplanationRouteId: number | null;
  hoveredEdgeId: string | null;
  hoveredEventId: string | null;

  setGraph: (g: GraphArtifact) => void;
  setTime: (t: number) => void;
  setMode: (m: Mode) => void;
  setSelectedEvent: (id: string | null) => void;
  setRouteQuery: (q: RouteQuery | null) => void;
  setRoutes: (r: Route[] | null, computedAt?: number) => void;
  setPinnedSegment: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setHoveredEvent: (id: string | null) => void;
  setOpenExplanation: (id: number | null) => void;
  clearRoutes: () => void;
};

export const useStore = create<Store>((set) => ({
  graph: null,
  time: 94,
  mode: "walk",
  selectedEventId: null,
  routeQuery: null,
  routes: null,
  routeComputedAt: null,
  pinnedSegmentId: null,
  openExplanationRouteId: null,
  hoveredEdgeId: null,
  hoveredEventId: null,

  setGraph: (graph) => set({ graph }),
  setTime: (time) => set({ time }),
  setMode: (mode) => set({ mode }),
  setSelectedEvent: (selectedEventId) => set({ selectedEventId }),
  setRouteQuery: (routeQuery) => set({ routeQuery }),
  setRoutes: (routes, computedAt) =>
    set({ routes, routeComputedAt: computedAt ?? null }),
  setPinnedSegment: (pinnedSegmentId) => set({ pinnedSegmentId }),
  setHovered: (hoveredEdgeId) => set({ hoveredEdgeId }),
  setHoveredEvent: (hoveredEventId) => set({ hoveredEventId }),
  setOpenExplanation: (openExplanationRouteId) =>
    set({ openExplanationRouteId }),
  clearRoutes: () =>
    set({
      routes: null,
      routeComputedAt: null,
      routeQuery: null,
      selectedEventId: null,
    }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
cd web && npx tsc --noEmit -p .
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/state/store.ts
git commit -m "feat: store extensions for mode and selected event"
```

---

## Task 7: Activate the Event tab in Ghosts.tsx

**Files:**
- Modify: `web/src/components/Ghosts.tsx`

- [ ] **Step 1: Wire mode toggle**

Replace `web/src/components/Ghosts.tsx` with:

```tsx
import { useStore } from "../state/store";

type Mode = "walk" | "event";

const MODES: Array<{ label: string; mode: Mode | null; ghost: boolean }> = [
  { label: "Walk", mode: "walk", ghost: false },
  { label: "Run", mode: null, ghost: true },
  { label: "Cycle", mode: null, ghost: true },
  { label: "Event", mode: "event", ghost: false },
];

export function Ghosts() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const routes = useStore((s) => s.routes);
  const routeQuery = useStore((s) => s.routeQuery);
  const recommended = routes && routes[0];

  const mapsUrl = (() => {
    if (!recommended || !routeQuery) return null;
    const first = recommended.segments[0]?.geometry[0];
    const last =
      recommended.segments[recommended.segments.length - 1]?.geometry.slice(-1)[0];
    if (!first || !last) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${first[1]},${first[0]}&destination=${last[1]},${last[0]}&travelmode=walking`;
  })();

  return (
    <>
      <div className="modes">
        {MODES.map((m) => {
          const active = !m.ghost && m.mode === mode;
          const className = m.ghost
            ? "mode mode-ghost"
            : active
            ? "mode mode-active"
            : "mode mode-inactive";
          return (
            <button
              key={m.label}
              className={className}
              disabled={m.ghost}
              title={m.ghost ? "Coming soon" : ""}
              onClick={() => m.mode && setMode(m.mode)}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mapsUrl && (
        <a className="maps-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
          Open recommended route in Google Maps
        </a>
      )}
    </>
  );
}
```

- [ ] **Step 2: Manual verify in browser**

The vite dev server should hot-reload. Open http://localhost:5173/. Click the **Event** tab — it should become the active tab (visual style change). Click **Walk** — Walk becomes active. Run/Cycle remain disabled. No errors in the console.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Ghosts.tsx
git commit -m "feat: activate Event tab with mode toggle"
```

---

## Task 8: Build the EventMarkers component

**Files:**
- Create: `web/src/components/EventMarkers.tsx`

- [ ] **Step 1: Write the component**

Create `web/src/components/EventMarkers.tsx`:

```tsx
import { useEffect, useMemo } from "react";
import { useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useStore } from "../state/store";
import { planWalk } from "../lib/api";
import type { Event, LngLat } from "../../../shared/types";

const FLINDERS: LngLat = [144.967, -37.8183];

// Day-of-week index for the slider time (0 = Mon, 6 = Sun).
// Slider hour-of-week 0-167; div by 24 → day-of-week starting Monday.
function sliderDayOfWeek(time: number): number {
  return Math.floor(time / 24);
}

// Day-of-week (0=Mon..6=Sun) for an ISO date string "YYYY-MM-DD".
function dateDayOfWeek(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // 0=Mon..6=Sun
}

function eventActiveAt(ev: Event, sliderDay: number): boolean {
  const start = dateDayOfWeek(ev.start_date);
  const end = dateDayOfWeek(ev.end_date);
  if (start <= end) return sliderDay >= start && sliderDay <= end;
  // wraps the week (rare, but possible for ISO date ranges spanning weeks)
  return sliderDay >= start || sliderDay <= end;
}

export function EventMarkers() {
  const graph = useStore((s) => s.graph);
  const time = useStore((s) => s.time);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const setSelectedEvent = useStore((s) => s.setSelectedEvent);
  const setHoveredEvent = useStore((s) => s.setHoveredEvent);
  const setRouteQuery = useStore((s) => s.setRouteQuery);
  const setRoutes = useStore((s) => s.setRoutes);

  const overlay = useControl(
    () => new MapboxOverlay({ interleaved: false }),
  ) as unknown as MapboxOverlay;

  const activeEvents = useMemo(() => {
    if (!graph?.events) return [];
    const sliderDay = sliderDayOfWeek(time);
    return graph.events.filter((ev) => eventActiveAt(ev, sliderDay));
  }, [graph, time]);

  const layers = useMemo(() => {
    if (activeEvents.length === 0) return [];
    return [
      new ScatterplotLayer<Event>({
        id: "event-rings",
        data: activeEvents.filter((ev) => ev.id === selectedEventId),
        getPosition: (ev: Event) => [ev.position[0], ev.position[1]],
        getRadius: 16,
        getFillColor: [251, 191, 36, 60],
        getLineColor: [251, 191, 36, 230],
        getLineWidth: 2,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: false,
      }),
      new ScatterplotLayer<Event>({
        id: "event-markers",
        data: activeEvents,
        getPosition: (ev: Event) => [ev.position[0], ev.position[1]],
        getRadius: 8,
        getFillColor: [251, 191, 36, 240],
        getLineColor: [11, 15, 20, 230],
        getLineWidth: 2,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: true,
        onClick: async (info: any) => {
          const ev = info.object as Event | undefined;
          if (!ev) return;
          setSelectedEvent(ev.id);
          setRouteQuery({
            from: FLINDERS,
            to: ev.position,
            fromLabel: "Flinders St Station",
            toLabel: ev.name,
          });
          try {
            const res = await planWalk(FLINDERS, ev.position, time);
            setRoutes(res.routes, res.computed_at_time);
          } catch (err) {
            console.error("event planWalk failed:", err);
          }
        },
        onHover: (info: any) => {
          const ev = info.object as Event | undefined;
          setHoveredEvent(ev ? ev.id : null);
        },
      }),
    ];
  }, [activeEvents, selectedEventId, setSelectedEvent, setRouteQuery, setRoutes, setHoveredEvent, time]);

  useEffect(() => {
    overlay.setProps({ layers });
  }, [overlay, layers]);

  return null;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd web && npx tsc --noEmit -p .
```

Expected: zero errors. (Component isn't mounted yet, so no visible behavior.)

- [ ] **Step 3: Commit**

```bash
git add web/src/components/EventMarkers.tsx
git commit -m "feat: EventMarkers deck.gl layer + click/hover wiring"
```

---

## Task 9: Mount EventMarkers in MapLayers

**Files:**
- Modify: `web/src/components/MapLayers.tsx`

- [ ] **Step 1: Conditionally render EventMarkers in Event mode**

In `web/src/components/MapLayers.tsx`, add this import at the top (after the existing imports):

```tsx
import { EventMarkers } from "./EventMarkers";
```

Currently the component returns `null`. Change the function's return statement at the bottom of the file from:

```tsx
  return null;
```

To:

```tsx
  return <EventModeLayers />;
```

Then below the existing `MapLayers` function (still in the same file), add:

```tsx
function EventModeLayers() {
  const mode = useStore((s) => s.mode);
  if (mode !== "event") return null;
  return <EventMarkers />;
}
```

- [ ] **Step 2: Manual verify in browser**

In the browser at http://localhost:5173/:
1. Click **Event** tab. Amber dots should appear over the map at venue locations. Number depends on the slider position.
2. Drag the time slider. Marker set may change as different days have different events.
3. Hover a marker — cursor should change (deck.gl picking).
4. Click a marker — three routes should appear from Flinders St Station to the event, and the PlanPanel should show route rows + score/length. Click another marker — a new set of routes.
5. Click **Walk** — markers disappear, original behavior restored.

If markers don't appear: check the browser console for errors, and confirm `/api/graph` returns events (Task 5 verify).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/MapLayers.tsx
git commit -m "feat: mount EventMarkers when in Event mode"
```

---

## Task 10: Update PlanPanel for Event mode

**Files:**
- Modify: `web/src/components/PlanPanel.tsx`

- [ ] **Step 1: Make the panel mode-aware**

Replace `web/src/components/PlanPanel.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { planWalk } from "../lib/api";
import { formatTime } from "../lib/scoring";
import type { LngLat } from "../../../shared/types";
import { ExplainPane } from "./ExplainPane";

const FLINDERS: LngLat = [144.967, -37.8183];
const CARLTON: LngLat = [144.9712, -37.8054];

export function PlanPanel() {
  const time = useStore((s) => s.time);
  const mode = useStore((s) => s.mode);
  const routes = useStore((s) => s.routes);
  const routeComputedAt = useStore((s) => s.routeComputedAt);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const setSelectedEvent = useStore((s) => s.setSelectedEvent);
  const setRoutes = useStore((s) => s.setRoutes);
  const setRouteQuery = useStore((s) => s.setRouteQuery);
  const clearRoutes = useStore((s) => s.clearRoutes);
  const graph = useStore((s) => s.graph);

  const [fromLabel, setFromLabel] = useState("Flinders St Station");
  const [toLabel, setToLabel] = useState("Carlton Gardens");
  const [loading, setLoading] = useState(false);

  const selectedEvent =
    selectedEventId && graph?.events
      ? graph.events.find((e) => e.id === selectedEventId)
      : undefined;

  useEffect(() => {
    if (selectedEvent) setToLabel(selectedEvent.name);
  }, [selectedEvent]);

  const compute = async () => {
    setLoading(true);
    try {
      setRouteQuery({ from: FLINDERS, to: CARLTON, fromLabel, toLabel });
      const res = await planWalk(FLINDERS, CARLTON, time);
      setRoutes(res.routes, res.computed_at_time);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const recomputeAtCurrentTime = async () => {
    if (selectedEvent) {
      setLoading(true);
      try {
        const res = await planWalk(FLINDERS, selectedEvent.position, time);
        setRoutes(res.routes, res.computed_at_time);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      compute();
    }
  };

  const clearEventSelection = () => {
    setSelectedEvent(null);
    setToLabel("Carlton Gardens");
    clearRoutes();
  };

  const isStale =
    routes !== null && routeComputedAt !== null && routeComputedAt !== time;

  return (
    <div className="panel panel-top-left">
      <div className="brand">CityStride</div>
      <div className="subtitle">Walk by what's lit, lively, and gentle.</div>

      <div className="addr-group">
        <input
          className="addr"
          value={fromLabel}
          onChange={(e) => setFromLabel(e.target.value)}
          placeholder="From"
        />
        {selectedEvent ? (
          <div className="addr addr-locked">
            <span>{selectedEvent.name}</span>
            <button
              className="addr-clear"
              title="Clear event"
              onClick={clearEventSelection}
            >
              ×
            </button>
          </div>
        ) : (
          <input
            className="addr"
            value={toLabel}
            onChange={(e) => setToLabel(e.target.value)}
            placeholder="To"
          />
        )}
      </div>

      {mode === "walk" && (
        <button className="primary" onClick={compute} disabled={loading}>
          {loading ? "Finding..." : "Find route"}
        </button>
      )}

      {mode === "event" && !selectedEvent && (
        <div className="event-hint">Click an event marker on the map.</div>
      )}

      {routes && routes.length > 0 && (
        <div className="routes">
          {routes.map((r, idx) => (
            <div key={r.id} className={`route-row route-${idx + 1}`}>
              <span className="route-badge">{r.id}</span>
              <span className="route-meta">
                {r.id === 1 ? "Recommended  " : ""}
                {(r.avg_score * 100).toFixed(0)} score
                {"  ·  "}
                {(r.total_length_m / 1000).toFixed(2)} km
              </span>
              <button
                className="link explain-link"
                onClick={() => useStore.getState().setOpenExplanation(r.id)}
              >
                Explain
              </button>
            </div>
          ))}

          {isStale && (
            <div className="stale">
              <span>Routes computed for {formatTime(routeComputedAt ?? 0)}</span>
              <button onClick={recomputeAtCurrentTime} className="link">
                Recompute
              </button>
            </div>
          )}

          <button onClick={clearRoutes} className="link clear">
            Clear routes
          </button>
        </div>
      )}
      <ExplainPane />
    </div>
  );
}
```

- [ ] **Step 2: Manual verify in browser**

1. **Walk mode**: panel unchanged. Find route button visible and works.
2. **Event mode without selection**: Find route button gone, hint reads "Click an event marker on the map."
3. **Event mode with selected marker**: To input shows event name with an × button. Routes appear. Clicking × clears routes + selection + restores empty hint.
4. **Recompute** when slider moves: re-routes to the same event at the new time.
5. **Clear routes**: also clears the event selection.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/PlanPanel.tsx
git commit -m "feat: PlanPanel mode-aware, event selection UI"
```

---

## Task 11: Event hover tooltip + inspector card

**Files:**
- Modify: `web/src/components/HoverTooltip.tsx`
- Modify: `web/src/components/InspectorCard.tsx`

- [ ] **Step 1: Replace HoverTooltip with event-aware version**

Replace `web/src/components/HoverTooltip.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { composite } from "../lib/scoring";

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

export function HoverTooltip() {
  const hoveredEdgeId = useStore((s) => s.hoveredEdgeId);
  const hoveredEventId = useStore((s) => s.hoveredEventId);
  const graph = useStore((s) => s.graph);
  const time = useStore((s) => s.time);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const hovering = hoveredEdgeId || hoveredEventId;

  useEffect(() => {
    if (!hovering) {
      setPos(null);
      return;
    }
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [hovering]);

  if (!hovering || !graph || !pos) return null;

  // Event hover takes precedence (markers sit above edges in deck.gl picking order).
  if (hoveredEventId) {
    const event = graph.events?.find((e) => e.id === hoveredEventId);
    if (!event) return null;
    return (
      <div
        className="hover-tooltip"
        style={{ left: pos.x + 14, top: pos.y + 14 }}
      >
        <div className="hover-street">{event.name}</div>
        <div className="hover-score">
          {formatDateRange(event.start_date, event.end_date)}
        </div>
      </div>
    );
  }

  const edge = graph.edges.find((e) => e.id === hoveredEdgeId);
  if (!edge) return null;
  const score = composite(edge, time);

  return (
    <div
      className="hover-tooltip"
      style={{ left: pos.x + 14, top: pos.y + 14 }}
    >
      <div className="hover-street">{edge.street_name}</div>
      <div className="hover-score">{(score * 100).toFixed(0)} streetscore</div>
    </div>
  );
}
```

(Reusing `.hover-tooltip`, `.hover-street`, `.hover-score` so existing styles apply.)

- [ ] **Step 2: Replace InspectorCard with event-aware version**

Replace `web/src/components/InspectorCard.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { describeSegment } from "../lib/api";
import type { DescribeSegmentResponse } from "../../../shared/types";

const METRIC_LABELS: Record<string, string> = {
  lux: "Lighting",
  gentle_gradient: "Gentle gradient",
  surface_quality: "Surface quality",
  canopy: "Canopy",
  bailout_proximity: "Transit nearby",
  ped_count: "Foot traffic",
  open_venues: "Open venues",
};

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

export function InspectorCard() {
  const pinnedSegmentId = useStore((s) => s.pinnedSegmentId);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const time = useStore((s) => s.time);
  const setPinned = useStore((s) => s.setPinnedSegment);
  const clearRoutes = useStore((s) => s.clearRoutes);
  const graph = useStore((s) => s.graph);
  const [data, setData] = useState<DescribeSegmentResponse | null>(null);

  useEffect(() => {
    if (!pinnedSegmentId) {
      setData(null);
      return;
    }
    describeSegment(pinnedSegmentId, time).then(setData).catch(console.error);
  }, [pinnedSegmentId, time]);

  // Event detail variant takes precedence over street segment.
  const selectedEvent =
    selectedEventId && graph?.events
      ? graph.events.find((e) => e.id === selectedEventId)
      : undefined;

  if (selectedEvent) {
    return (
      <div className="panel inspector">
        <button className="close" onClick={() => clearRoutes()}>
          x
        </button>
        <div className="inspector-street">{selectedEvent.name}</div>
        <div className="inspector-date">
          {formatDateRange(selectedEvent.start_date, selectedEvent.end_date)}
        </div>
        <div className="inspector-score-row">
          <span className="inspector-score-label">
            {selectedEvent.venue_name}
            {selectedEvent.address ? ` — ${selectedEvent.address}` : ""}
          </span>
        </div>
        <p className="inspector-desc">{selectedEvent.description}</p>
        <a
          className="inspector-link"
          href={selectedEvent.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open page →
        </a>
      </div>
    );
  }

  if (!pinnedSegmentId || !data) return null;

  return (
    <div className="panel inspector">
      <button className="close" onClick={() => setPinned(null)}>
        x
      </button>
      <div className="inspector-street">{data.street_name}</div>
      <div className="inspector-score-row">
        <span className="inspector-score">
          {(data.composite_score * 100).toFixed(0)}
        </span>
        <span className="inspector-score-label">streetscore</span>
      </div>

      <div className="metrics">
        {Object.entries(data.metrics).map(([key, val]) => (
          <div key={key} className="metric-row">
            <span className="metric-label">{METRIC_LABELS[key] ?? key}</span>
            <div className="metric-bar">
              <div
                className="metric-bar-fill"
                style={{ width: `${val * 100}%` }}
              />
            </div>
            <span className="metric-val">{(val * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>

      {data.confidence.ped_count.distance_to_sensor_m > 200 && (
        <div className="confidence">
          Foot traffic estimated from sensor{" "}
          {data.confidence.ped_count.distance_to_sensor_m}m away.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual verify**

1. Switch to Event mode.
2. Hover an event marker → tooltip shows event name + date (reuses existing tooltip style).
3. Click the marker → InspectorCard shows event detail (name, dates, venue, description, link).
4. Click the × → selected event clears, card disappears.
5. Switch to Walk mode → click a street segment → InspectorCard shows the original street metrics. No regression.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/HoverTooltip.tsx web/src/components/InspectorCard.tsx
git commit -m "feat: event tooltip + inspector card detail"
```

---

## Task 12: Events count pill in TimeSlider

**Files:**
- Modify: `web/src/components/TimeSlider.tsx`

- [ ] **Step 1: Replace TimeSlider with mode-aware version**

Replace `web/src/components/TimeSlider.tsx` with:

```tsx
import { useMemo } from "react";
import { useStore } from "../state/store";
import { formatTime } from "../lib/scoring";

function sliderDayOfWeek(time: number): number {
  return Math.floor(time / 24);
}

function dateDayOfWeek(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  return (d.getUTCDay() + 6) % 7;
}

function eventActiveAt(start: string, end: string, sliderDay: number): boolean {
  const s = dateDayOfWeek(start);
  const e = dateDayOfWeek(end);
  if (s <= e) return sliderDay >= s && sliderDay <= e;
  return sliderDay >= s || sliderDay <= e;
}

export function TimeSlider() {
  const time = useStore((s) => s.time);
  const setTime = useStore((s) => s.setTime);
  const mode = useStore((s) => s.mode);
  const graph = useStore((s) => s.graph);

  const activeEventCount = useMemo(() => {
    if (mode !== "event" || !graph?.events) return 0;
    const day = sliderDayOfWeek(time);
    return graph.events.filter((e) =>
      eventActiveAt(e.start_date, e.end_date, day),
    ).length;
  }, [mode, graph, time]);

  return (
    <div className="panel panel-bottom">
      {mode === "event" && (
        <div className="time-filter-pill">
          {activeEventCount === 0
            ? "No events at this time — try another moment."
            : `${activeEventCount} event${activeEventCount === 1 ? "" : "s"} at ${formatTime(time)}`}
        </div>
      )}
      <div className="time-readout">{formatTime(time)}</div>
      <input
        type="range"
        min={0}
        max={167}
        value={time}
        onChange={(e) => setTime(Number(e.target.value))}
        className="time-slider"
      />
    </div>
  );
}
```

(The day-of-week helpers are duplicated from `EventMarkers.tsx`. If the duplication starts to grow, extract to `web/src/lib/event-filter.ts` — for now keep them local; two copies is below the threshold for premature extraction.)

- [ ] **Step 2: Manual verify**

1. Switch to Event tab. Pill appears above the slider with a count matching the visible markers.
2. Drag slider to a day with no events — pill reads "No events at this time — try another moment."
3. Switch to Walk mode — pill disappears.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/TimeSlider.tsx
git commit -m "feat: events count pill above slider in Event mode"
```

---

## Task 13: Styles for new UI surfaces (includes `.time-filter-pill`)

**Files:**
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add the new classes**

Append to `web/src/styles.css`:

```css
.mode-inactive {
  opacity: 0.7;
  cursor: pointer;
}
.mode-inactive:hover {
  opacity: 0.95;
}

.addr-locked {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.4);
  color: #fbbf24;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
}
.addr-clear {
  background: none;
  border: none;
  color: #fbbf24;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
}
.addr-clear:hover {
  color: #fff;
}

.event-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-style: italic;
  padding: 6px 0;
}

.time-filter-pill {
  font-size: 12px;
  color: rgba(251, 191, 36, 0.9);
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  padding: 4px 10px;
  border-radius: 999px;
  display: inline-block;
  margin-bottom: 8px;
}

.inspector-date {
  font-size: 12px;
  color: rgba(251, 191, 36, 0.85);
  margin-top: 4px;
}
.inspector-desc {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 8px;
}
.inspector-link {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  color: #fbbf24;
  text-decoration: none;
}
.inspector-link:hover {
  text-decoration: underline;
}
```

If the existing tooltip / inspector classes are named differently (e.g. `.tooltip` vs `.hover-tooltip`), adjust the matching class names from Task 11's JSX so the existing styles apply naturally. The point is consistency, not new ad-hoc surfaces.

- [ ] **Step 2: Manual verify**

Look at the running app:
1. The To input when an event is selected reads as a warm amber locked-look chip with × on the right.
2. Tabs that are clickable-but-not-active are slightly faded (not as dim as Run/Cycle, but not as bright as the active tab).
3. InspectorCard event variant has readable typography, link in amber.

- [ ] **Step 3: Commit**

```bash
git add web/src/styles.css
git commit -m "feat: styles for event mode UI"
```

---

## Task 14: Pass destination context to the Explain prompt

**Files:**
- Modify: `runtime/src/explain.ts`
- Modify: `runtime/src/index.ts`
- Modify: `web/src/components/ExplainPane.tsx`

- [ ] **Step 1: Extend `streamExplanation` and `buildUserMessage` to accept `destinationLabel`**

In `runtime/src/explain.ts`, change the `buildUserMessage` signature and body so the destination is appended to the prompt only when present. Replace the existing `buildUserMessage` and `streamExplanation` functions with:

```ts
async function buildUserMessage(
  route: Route,
  time: number,
  destinationLabel?: string,
): Promise<string> {
  const hour = Math.max(0, Math.min(167, Math.floor(time)));

  const segmentDetails: SegmentDetail[] = [];
  for (const seg of route.segments.slice(0, 5)) {
    const edge = await getEdgeById(seg.edge_id);
    if (!edge) {
      segmentDetails.push({
        street_name: seg.street_name,
        composite_score: seg.score_at_time,
        lux: 0,
        ped_count: 0,
        canopy: 0,
        steepness: 0,
        length_m: seg.length_m,
      });
      continue;
    }
    segmentDetails.push({
      street_name: edge.street_name || seg.street_name,
      composite_score: composite(edge, hour),
      lux: edge.lux,
      ped_count: edge.ped_count[hour],
      canopy: edge.canopy,
      steepness: 1 - edge.gentle_gradient,
      length_m: seg.length_m,
    });
  }

  const segsText = segmentDetails
    .map(
      (s, i) =>
        `  Segment ${i + 1}: ${s.street_name} — ${s.length_m}m, score ${(s.composite_score * 100).toFixed(0)}/100, ` +
        `lux ${(s.lux * 100).toFixed(0)}, pedestrians ${(s.ped_count * 100).toFixed(0)}/hr, ` +
        `canopy ${(s.canopy * 100).toFixed(0)}%, steepness ${(s.steepness * 100).toFixed(0)}%`,
    )
    .join("\n");

  const timeLabel = `${String(Math.floor(time / 7)).padStart(2, "0")}:${String((time % 7) * 10).padStart(2, "0")}`;

  const destinationLine = destinationLabel
    ? `\n- Destination: ${destinationLabel} — briefly name it in your explanation.`
    : "";

  return `Route overview:
- Total length: ${(route.total_length_m / 1000).toFixed(2)} km
- Average score: ${(route.avg_score * 100).toFixed(0)}/100
- Time of day: ${timeLabel} (hour-slot ${time}/167)${destinationLine}
- Segments (top ${segmentDetails.length}):
${segsText}

Write the 4-paragraph explanation now.`;
}

export async function streamExplanation(
  route: Route,
  time: number,
  res: Response,
  destinationLabel?: string,
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const userMessage = await buildUserMessage(route, time, destinationLabel);

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    stream.on("text", (text: string) => {
      res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
    });

    await stream.finalMessage();

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "no stack";
    console.error("EXPLAIN ERROR:", msg);
    console.error("STACK:", stack);
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
}
```

(The rest of `explain.ts` — imports, `SYSTEM_PROMPT`, `SegmentDetail` type, anthropic init — stays as is.)

- [ ] **Step 2: Read `destinationLabel` in the API handler**

In `runtime/src/index.ts`, change the `/api/explain-route` handler block to:

```ts
app.post("/api/explain-route", async (req, res) => {
  const { route, time, destinationLabel } = req.body ?? {};
  if (!route || typeof time !== "number") {
    res.status(400).json({ error: "missing route or time" });
    return;
  }
  await streamExplanation(route, time, res, destinationLabel);
});
```

- [ ] **Step 3: Send `destinationLabel` from ExplainPane**

In `web/src/components/ExplainPane.tsx`, change the existing `fetch("/api/explain-route", ...)` body so it includes `destinationLabel` when an event is selected. Specifically:

Inside the component (top of `ExplainPane`, after the existing `useStore` reads), add:

```tsx
  const selectedEventId = useStore((s) => s.selectedEventId);
  const graph = useStore((s) => s.graph);
```

In the `fetchExplanation` function, just before the existing `const res = await fetch("/api/explain-route", { ... })` call, add:

```tsx
    const selectedEvent =
      selectedEventId && graph?.events
        ? graph.events.find((e) => e.id === selectedEventId)
        : undefined;
    const destinationLabel = selectedEvent
      ? `the event "${selectedEvent.name}" at ${selectedEvent.venue_name}`
      : undefined;
```

Change the `body` line of the fetch from:

```tsx
        body: JSON.stringify({ route, time }),
```

to:

```tsx
        body: JSON.stringify({ route, time, destinationLabel }),
```

- [ ] **Step 4: Manual verify**

Make sure the runtime restarted (tsx watch picks up `explain.ts` and `index.ts` automatically) and the vite dev server is running.

1. Event mode → click a marker → wait for 3 routes.
2. Click **Explain** on Route 1.
3. The streaming explanation should mention the event by name within the first paragraph or two.
4. Then switch to Walk mode, click Find route, click Explain on Route 1. The explanation should NOT mention any event (no `destinationLabel` sent).

If `ANTHROPIC_API_KEY` in `runtime/.env` is blank, the explain stream will surface the friendly fallback error from the existing handler. That's expected and doesn't break the app.

- [ ] **Step 5: Commit**

```bash
git add runtime/src/explain.ts runtime/src/index.ts web/src/components/ExplainPane.tsx
git commit -m "feat: pass destination label to explain prompt"
```

---

## Task 15: End-to-end demo verification

**Files:** none — manual smoke pass.

- [ ] **Step 1: Walk-mode regression check**

1. Switch to Walk tab.
2. PlanPanel shows From/To inputs and Find route button.
3. Click Find route — three routes appear from Flinders to Carlton (as today).
4. Click a street segment — InspectorCard shows lighting/canopy/etc.
5. Drag time slider — map recolors, routes stay frozen, stale indicator appears.
6. Click Explain on Route 1 — streaming text describes the route (no event mention).
7. Clear routes — back to clean streetscore view.

If anything regressed, go back and fix in the relevant task.

- [ ] **Step 2: Event-mode happy path**

1. Switch to Event tab. Amber markers appear (count visible in console log or by inspecting).
2. Slider on Fri 22:00. Note marker count.
3. Drag slider to Sun 12:00. Marker count may change (different events).
4. Hover a marker — tooltip with event name + date.
5. Click a marker — three routes from Flinders to the event appear. PlanPanel To input shows event name with ×. InspectorCard shows event detail.
6. Click Explain on Route 1 — streaming text mentions the event by name.
7. Drag slider to another time. Stale indicator. Click Recompute — routes re-compute for the new time, same destination.
8. Click × on the To input — routes clear, hint returns.
9. Click another marker — repeats.

- [ ] **Step 3: Final commit (anything orphaned)**

```bash
git status
```

If anything's modified that wasn't committed (most likely `web/package-lock.json` from incidental npm activity), commit it:

```bash
git add -p  # carefully stage only what's related
git commit -m "chore: incidentals from events feature work"
```

- [ ] **Step 4: Tag the demo build (optional)**

```bash
git tag -a events-feature-v1 -m "Events feature implemented for demo"
```

- [ ] **Step 5: Update spec status**

In `docs/superpowers/specs/2026-05-23-events-feature-design.md`, change:

```markdown
**Status:** Approved for implementation
```

to:

```markdown
**Status:** Implemented
```

Then:

```bash
git add docs/superpowers/specs/2026-05-23-events-feature-design.md
git commit -m "docs: mark events feature spec implemented"
```

---

## Notes for the implementer

- **Don't run `bake/src/build-graph.ts`.** It's a TODO skeleton — running it will write an empty graph to `bake/output/graph.json`. The real artifact at `web/public/graph.json` was built by a separate script and committed; events get attached at runtime via `graph-loader.ts`, not at bake time.
- **No test framework.** Verification is manual: curl for runtime endpoints, browser observation for web. Don't introduce vitest/jest unless asked — that's its own scope decision.
- **`tsx watch` auto-reloads runtime.** When you change `runtime/src/*.ts`, the dev server picks it up automatically — wait for the "listening" line before curling.
- **Vite hot-reloads web.** Changes to `web/src/*` appear in the browser within a second. If they don't, check the vite terminal for errors.
- **If the venues.json fuzzy match misses too many real events** (kept count is low in Task 4), don't lower the threshold below 0.5 — instead add aliases. The threshold guards against cross-suburb false positives.
- **Description truncation is 280 chars** to keep `events.json` small and to fit the inspector card. If you want full descriptions, increase the constant and re-scrape.
- **All commits should be conventional-style** (`feat:`, `fix:`, `docs:`, `chore:`) to match the existing log.
