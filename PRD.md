# CityStride — Product Requirements Document

**Status:** Draft

---

## 1. Problem Statement

Melbourne has rich open civic data about its pedestrian infrastructure — lighting, foot traffic sensors, gradient, surface quality, tree canopy, transit stops, venue hours — but none of it is surfaced in a way that helps someone answer: *"What's the best street to walk right now?"*

Existing tools optimize for distance or transit schedules. No tool synthesizes the pedestrian experience across multiple environmental factors, and no tool shows how that experience changes by time of day.

## 2. Product Vision

CityStride turns Melbourne's open civic data into a transparent, interactive pedestrian streetscore map. Users open the app, see Melbourne's walkable network colored by a composite score, scrub through time to watch the city change, and plan routes that favor well-lit, active, pleasant streets.

**This PRD scopes the hackathon demo build.** The full product vision (running, cycling, events, gap analysis) is acknowledged via UI ghosts but not implemented.

## 3. Target Users

**Primary (demo day):** Hackathon judges evaluating the product.

**Intended (product vision):** Anyone walking in Melbourne who wants to pick a route based on more than just distance — commuters choosing well-lit paths home, tourists finding lively streets, urban planners auditing pedestrian infrastructure.

## 4. Core Principle — Positive Framing

Every design, language, and scoring decision follows one rule:

> The score is a **positive signal**, never a deficit signal. High score = "this street is doing the thing well." Low score = "less of what you asked for right now."

**This means:**
- Color gradient runs vibrant-to-dim, never red/warning.
- Language is descriptive ("Lit & Lively"), never judgmental ("avoid this street").
- No street is permanently labeled — change the time, change the score.
- Crime data, crash heatmaps, "safety" overlays, and any stigmatizing visuals are **excluded**.

## 5. Geographic Scope

City of Melbourne LGA only. Matches the CoM datasets cleanly. Out-of-boundary addresses get a friendly inline message ("CityStride only routes within the City of Melbourne") rather than silent failure.

## 6. Scope — What Ships

### 6.1 Fully Wired Features

#### F1: Streetscore Map
- Full-bleed map canvas with OpenStreetMap base tiles (MapLibre GL JS).
- Every pedestrian network edge in the viewport rendered as a colored polyline (Deck.gl PathLayer).
- Color driven by composite streetscore: vibrant-to-dim positive gradient.
- Initial view: CBD zoom, Friday 22:00.
- Every visible street is interactive from first load.

#### F2: Time Slider
- Horizontal slider at bottom of screen, hour-of-week index 0-167.
- Displays day + time readout (e.g., "Fri 22:00").
- Map recolors on slider release.
- Two time-varying metrics (pedestrian count, open venues) update per the 168-vector lookup; all other metrics are time-invariant.

#### F3: Inspector Card
- **Hover** any segment: tooltip near cursor showing street name + composite score.
- **Click** any segment: pinned card (bottom-left) showing:
  - Street name, composite score.
  - Per-metric breakdown: raw human-readable value (e.g., "24 lux avg," "~1,240 ped/hr") alongside normalized 0-1 bar.
  - Confidence flags where applicable (e.g., "estimated, 180m to nearest sensor").
- Click another segment to swap. Click empty map to dismiss.

#### F4: Plan-a-Walk Panel
- Floating panel, top-left.
- Two text inputs (from, to) with fuzzy autocomplete against a geocoder built from CoM Street Addresses (~63k records).
- "Find route" button triggers 3-route computation at the current slider time.
- Out-of-boundary addresses show inline message.

#### F5: 3-Route Generation & Display
- Three routes per query, computed via A* (ngraph.path) with edge penalties on prior routes to ensure differentiation.
- Routes rendered as numbered polylines (1/2/3 badges on map). Route 1 = recommended (highest avg streetscore), drawn thicker.
- Color-coded per route, distinct from streetscore palette.
- Streetscore layer dims slightly when routes are present.
- Route legend in the Plan-a-Walk panel: per-route score + length. Route 1 has "Recommended" label.

#### F6: Route Freezing & Recompute
- Routes are frozen at computation time. Changing the time slider does NOT recompute routes.
- Stale indicator appears when time changes post-computation: "Routes computed for [original time]."
- Explicit "Recompute" button refreshes routes for the new time.
- "Clear" link removes routes, returns to streetscore-only view.
- Map recoloring under frozen routes is intentional — it visualizes how the city changes around the same path.

#### F7: Score Legend
- Floating panel, top-right.
- Horizontal gradient strip: "Lower score" to "Higher score."
- One-line subtitle: "Score reflects lighting, foot traffic, gradient, surface, transit and canopy at the selected time."
- Footer: "Data: City of Melbourne open data."

#### F8: AI Explanation Slide-Out
- Triggered by "Explain" link on any route in the legend.
- Slides in from right edge, covers ~30% of canvas.
- One-shot explanation per route (not a chat).
- Header: "Why this route?" + route number badge.
- Streaming text body, 4-6 paragraphs, ~250 words max.
- Footer: "Explained by Claude" + elapsed time.
- Positive framing enforced via system prompt. References specific numbers, not vague adjectives.
- Acknowledges data limitations (e.g., interpolated ped counts).
- Retry button on API failure. Esc / X / backdrop click dismisses.
- **Graceful degradation:** If the Claude API fails, the rest of the app is completely unaffected.

#### F9: Build-Time Ingestion Pipeline
- One-shot script run offline before the demo.
- Fetches City of Melbourne open datasets.
- Builds pedestrian network graph with per-edge metrics:
  - **Time-invariant:** lighting (lux), gentle gradient, surface quality, canopy, transit/bailout proximity.
  - **Time-varying (168-vectors):** pedestrian count (IDW-interpolated from 145 sensors), open venue density.
- All metrics normalized to 0-1 positive-framed scale (higher = better; steepness inverted at bake time).
- Outputs a single graph artifact loaded once at runtime startup.
- Includes spatial index (viewport queries) and geocoder index (address resolution).

### 6.2 UI Ghosts (Visible, Disabled)

| Element | Purpose |
|---|---|
| Run / Cycle / Event tab buttons | Signal multimodal product vision. Disabled, "Coming soon" tooltip. |
| Planner view (Gap Finder) toggle | Signal planning capability. Disabled. |
| "Open in Google Maps" link | On recommended route. Ideally functional as a freebie. |
| "Available via MCP" badge | Only if MCP stretch goal ships. |

Zero backend. ~20 minutes of frontend work. Signal the product line.

### 6.3 Stretch Goals (only if core is solid by 15:30)

1. 24hr pulse autoplay on the time slider.
2. MCP server with 3 tools: `plan_walk`, `describe_segment`, `find_amenity_nearby`.
3. Working "Open in Google Maps" link (if not done as freebie).
4. Live-during-drag slider recolor.
5. Mobile responsive layout.

### 6.4 Explicitly Out of Scope

- RunSafe, CycleSafe, EventMode.
- Gap Finder as functional view.
- Weather, PTV real-time, construction overlays.
- User-configurable weights or preset modes.
- Crime data, crash data (excluded by positive-framing principle).
- Natural language / chat input for routing.
- WCAG 2.1 AA (aspirational, not gated).
- Auth, accounts, persistent user state.

## 7. Architecture

### Build/Run Split

Hard separation. The build script produces a graph artifact; the runtime loads it once and never re-fetches.

- **Build time:** Ingest scripts fetch CoM datasets, compute per-edge metrics, write graph artifact. Can fail and rerun freely.
- **Run time:** SPA + small API server. Loads graph into memory. No external dependencies during demo except Claude API for explanations.

### Technology Choices

| Component | Choice | Rationale |
|---|---|---|
| Base map | MapLibre GL JS + OSM tiles | Free, OSS, fully OSM-compatible |
| Overlays | Deck.gl PathLayer | High-perf WebGL line rendering over MapLibre |
| Routing | ngraph.path (A*) | Custom edge cost functions; no need for full routing engine |
| Graph format | Pre-baked artifact (JSON/binary) | Single load, in-memory, fast |
| AI Explanation | Claude API (streaming) | One-shot structured prompt per route |
| Geocoding | Built-in fuzzy match on CoM Street Addresses | No external geocoding dependency |

### Why Not OSRM/Valhalla/GraphHopper?

These route on OSM road geometry with their own cost models. CityStride routes on the CoM pedestrian network with a custom streetscore-driven cost function. The whole product *is* the custom cost function.

## 8. Data Requirements

### City of Melbourne Open Datasets

| Dataset | Used For |
|---|---|
| Pedestrian Network | Graph topology (nodes + edges) |
| Pedestrian Counting System (sensors) | Foot traffic 168-vectors via IDW interpolation |
| Street Lights | Lux calculation per edge |
| Feature Lighting | Supplementary lighting data |
| Street Addresses (~63k) | Geocoder index |
| Trees / Canopy | Canopy metric per edge |
| Footpath Surface / Quality | Surface quality metric |
| Elevation / Contours | Steepness (inverted to "gentle gradient") |
| Tram / Transit Stops | Bailout proximity metric |
| Venue Locations + Hours | Open venues 168-vectors |

All datasets are public, no auth, no practical rate limits.

### Per-Edge Data Shape

```
{
  geometry: polyline,
  length_m: number,
  // Time-invariant (0-1, positive-framed)
  lux: number,
  gentle_gradient: number,
  surface_quality: number,
  canopy: number,
  bailout_proximity: number,
  // Time-varying (168-element vectors, 0-1)
  ped_count: number[168],
  open_venues: number[168],
  // Metadata
  confidence: { ped_count: { distance_to_sensor_m: number } }
}
```

## 9. Scoring Model

### Locked Principles

- Composite streetscore = weighted sum of normalized 0-1 metrics.
- All metrics positive-framed (higher = better). Inversions happen at bake time.
- **Weights are fixed in code.** No user-facing controls, no preset modes.
- Time-varying metrics looked up from 168-vectors at the current hour-of-week.
- Computed at runtime (not baked), so time changes recolor the map instantly.

### Routing Cost

```
edge_cost = length_m * (1 + alpha * (1 - score))
```

Starting alpha = 1.5. Alpha is a global tuning knob, not user-facing.

### 3-Route Differentiation

- Route 1: A* with streetscore cost function.
- Route 2: A* with penalty multiplier on Route 1's edges.
- Route 3: A* with penalty multiplier on Routes 1+2's edges.
- Ranked by average streetscore. Highest = recommended.

### Open Tuning Decisions

- The actual fixed weight vector (6 numeric values, one per metric).
- Whether alpha stays at 1.5 or gets tuned during the build.
- Normalization curves per metric (linear vs sigmoid clamping).
- How to handle confidence in scoring (down-weight vs UI-only flag).

## 10. Runtime State Model

Single source of truth. All UI surfaces read from and write to it.

```
{
  viewport: { lng, lat, zoom },
  time: number,                           // 0-167 (hour-of-week)
  routeQuery: { from, to, fromNode, toNode } | null,
  routes: [Route, Route, Route] | null,   // frozen at computation time
  routeComputedAt: number | null,
  pinnedSegmentId: string | null,
  openExplanationRouteId: number | null
}
```

No `weights` field. Weights are a constant, not state.

## 11. Demo Flow (Acceptance Criteria)

The product is validated by executing four demo beats in sequence:

### Beat 1 — "Look at the city" (~25s)
- App opens at CBD zoom, Fri 22:00.
- All streets colored by streetscore.
- Hover shows tooltip. Click shows inspector card with raw numbers.
- **Pass:** Bourke/Swanston visibly brighter than quiet residential streets. Inspector shows specific numbers.

### Beat 2 — "Compare moments" (~35s)
- Drag slider: Fri 22:00 -> Tue 10:00 -> Sun 03:00.
- Map recolors at each stop.
- **Pass:** Visible, meaningful color changes across the three times.

### Beat 3 — "Route through it" (~45s)
- Set to Fri 22:00. Type "123 Bourke St" -> "Carlton Gardens."
- Three routes appear, numbered, color-coded.
- Click Explain on Route 1 -> AI explanation streams.
- **Pass:** Routes visually distinct. Inspector shows why Route 1 scores higher. Explanation references specific numbers.

### Beat 4 — "Time changes the recommendation" (~20s)
- Drag to Tue 10:00. Stale indicator appears.
- Click Recompute. Routes shift.
- **Pass:** At least one route changes meaningfully.

## 12. MCP Server (Stretch Goal)

An MCP server exposing the same backend capabilities as the web app, enabling Claude Desktop as a client.

### Tools

1. **`plan_walk`** — input: from, to, time. Output: 3 routes with per-segment metadata.
2. **`describe_segment`** — input: point or address, optional time. Output: composite score + raw metrics.
3. **`find_amenity_nearby`** — input: point, amenity type (transit, drinking fountain, public toilet), radius. Output: nearby amenities.

### MCP Demo Beat (~30s, after main demo)
Open Claude Desktop: *"What's the walkability of Bourke St between Spring and Russell on Friday at 10pm?"* Claude calls `describe_segment`, returns the same numbers the web app shows. Point: this isn't a one-off web app, it's a civic data service.

### Out of MCP Scope
- No interactive map rendering inside Claude.
- No streaming / live updates.
- No AI Explanation tool (Claude *is* the explanation when called from Claude).

## 13. Risk Mitigation & Cut Paths

| # | Risk | Trigger | Cut Path |
|---|---|---|---|
| 1 | Bake script can't produce usable graph by 13:00 | 12:30, graph missing or wrong values | Cut metrics to lighting + traffic + gradient only. Shrink to CBD. Use area-wide averages if IDW fails. |
| 2 | Map performance bad at CBD zoom | <20fps or laggy slider | Threshold-cull low-score edges. Reduce zoom. Fall back to MapLibre line layers. |
| 3 | Routing slow or bad routes | >2s per route or visibly bad paths | Tune alpha down. Drop to 2 or 1 route. |
| 4 | AI Explanation fails on stage | Spinner >5s | Pre-cached fallback for demo route. Skip the beat entirely. |
| 5 | Geocoding misses demo addresses | Demo address returns no match | Hardcoded demo coordinates. Lat/lng fallback input. |
| 6 | Routes look identical | >80% overlap | Increase edge penalty. Pick better demo addresses. Drop to 2 routes. |
| 7 | Browser/projector issues | Blank map or broken layout | Own laptop. Pre-test on projector. Screen-recorded backup. |
| 8 | Time runs out | 15:00 and routes not rendering | Cut in order: ghosts, AI explanation, inspector detail, time slider, multi-route. |

**Minimum viable demo:** OSM base + streetscore-colored streets + single route A to B.

## 14. Build Schedule

| Time | Milestone |
|---|---|
| 10:30 | CoM datasets confirmed accessible. Bake script scaffold. |
| 11:00 | Bake script produces a viable graph file (any quality). |
| 12:00 | Demo-ready graph. Runtime API skeleton up. |
| 13:00 | Map renders streetscore. Inspector on hover. Time slider works. |
| **13:30** | **Bake script frozen.** |
| 14:00 | Plan-a-walk functional. 3 routes computed and rendered. Recompute works. |
| **14:30** | **Weights frozen.** Score legend rendered. UI ghosts added. |
| 15:00 | AI Explanation wired. End-to-end rehearsal. |
| **15:30** | **Stretch decision point.** Pick one: pulse autoplay OR MCP OR polish. |
| 16:30 | Final dry-run. Buffer for breakage. |
| 17:00 | Submission. |
| 18:00 | Demo to judges. |

**Discipline rules:**
- No bake re-runs after 13:30.
- No weight changes after 14:30.
- No new datasets after 12:00.
- AI Explanation is "nice if working," not "must demo."
- Demo follows the four beats in order. No improvisation.

## 15. Non-Requirements

Explicitly **not** requirements for this build:

- Authentication, user accounts, or persistent state.
- Hosting or deployment (localhost demo).
- Data accuracy guarantees (positive framing + CoM attribution suffices).
- Real-time data feeds.
- Accessibility compliance (aspirational only).
- Mobile support (stretch goal).
- Analytics or telemetry.
- Error monitoring beyond demo resilience.

## 16. Success Criteria

1. All four demo beats execute without failure.
2. A judge can ask "why is this street scored higher?" and the inspector card provides a specific, evidence-based answer.
3. Time slider produces visible, meaningful changes to the map.
4. Routes are visibly distinct and the recommended route is defensibly the best-scored option.
5. The positive-framing principle holds — no red, no "avoid," no stigma anywhere in the UI or AI output.

---

*End of PRD.*
