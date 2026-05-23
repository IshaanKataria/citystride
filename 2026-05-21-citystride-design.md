# CityStride — Design Spec

**Date:** 2026-05-21
**Source:** Brainstorm session on the consolidated requirements at [consolidated-requirements.md](../../../consolidated-requirements.md)
**Status:** Design locked; Section 3 (streetscore math) explicitly deferred.

---

## 0. Goal and framing

CityStride is a hackathon-build web application that turns Melbourne's open civic data into a transparent, interactive pedestrian streetscore map. The product is a data-first map experience: users open it, see Melbourne's pedestrian network colored by a composite streetscore, choose a moment in time, and ask for routes between two addresses.

**Goal for this build:** a hackathon demo. The entire scope from the consolidated requirements is treated as the *product vision*; this spec defines the *prioritized subset* that gets fully wired up plus the surfaces that are visible but stubbed.

**Framing principle (locks every visual and language choice):** the score is a **positive signal**, never a deficit signal. High score means "this street is doing the thing well." A low score is *not* a judgment — it just means "less of what you asked for right now." Color uses vibrant-to-dim, never red/warning. Language is descriptive ("Lit & Lively here"), never judgmental ("avoid this street"). No street is permanently labeled — change the time, change the streetscore.

This principle excludes crime data, crash heatmaps, "safety" overlays, and any visual element that stigmatizes a neighborhood or street.

---

## 1. System architecture

CityStride has a hard split between **build time** and **run time**. They share exactly one contract: the graph artifact.

```
┌─────────────────────────────────────────────┐
│  BUILD TIME  (one-shot, minutes)            │
│                                              │
│  Ingest scripts                              │
│  ├── Fetch CoM datasets                      │
│  ├── Build pedestrian network graph          │
│  ├── Compute per-segment metrics             │
│  │     ├── lux (street lights + feat. light) │
│  │     ├── ped count 168-vector (IDW)        │
│  │     ├── steepness (inverted, positive)    │
│  │     ├── surface quality                   │
│  │     ├── bailout proximity (transit)       │
│  │     ├── open venues 168-vector            │
│  │     └── canopy (trees)                    │
│  └── Write graph artifact                    │
└─────────────────────────────────────────────┘
                     │
                     ▼ graph artifact
┌─────────────────────────────────────────────┐
│  RUN TIME  (the demo)                        │
│                                              │
│  Web app (SPA + small API)                   │
│  ├── Map canvas (OSM base + Deck.gl)         │
│  ├── Plan-a-walk panel                       │
│  ├── Score legend                            │
│  ├── Time slider                             │
│  ├── Inspector card                          │
│  └── AI Explanation slide-out                │
│                                              │
│  Runtime API (in-memory graph)               │
└─────────────────────────────────────────────┘
```

### Why this split matters

- The build script can fail and rerun repeatedly without affecting the runtime. Once the graph is acceptable, it is frozen and untouched during demo day.
- The runtime app has no external dependencies during the demo except the Claude API call from the AI Explanation slide-out. The rest of the app works offline.
- The optional MCP server (stretch goal, Section 8) is just another consumer of the same in-memory graph — same routing code, different transport.

### Routing library

Routing runs on the server. The runtime accepts a route request, computes 3 A* searches on the in-memory graph, and returns the routes.

**Library: `ngraph.path`** for the A* search. Reasoning:

- We want full control over the edge cost function (this is the whole product).
- We do not want to hand-roll a priority queue on hackathon day.
- `ngraph.path` is purpose-built for "I have a custom graph, give me fast A*."
- Production routing engines (OSRM, Valhalla, GraphHopper) are the wrong tool — they route on OSM road geometry with their own cost models, not on our CoM pedestrian network with our streetscore.

### Map rendering

- **Base map:** OpenStreetMap tile data, rendered by **MapLibre GL JS** (free OSS, fully OSM-compatible). Tiles served by a provider (MapTiler, Stadia, Protomaps) or self-hosted.
- **Streetscore + route overlay:** **Deck.gl PathLayer**, drawn over the OSM base.
- The base map and our pedestrian network geometry don't need to align perfectly — minor visual drift between OSM road centerlines and CoM pedestrian segments is expected and acceptable.

### Geographic scope

City of Melbourne LGA only. Matches the CoM datasets cleanly. Out-of-boundary addresses get a friendly inline message in the Plan-a-walk panel ("CityStride only routes within the City of Melbourne") rather than silent failure.

---

## 2. Data model (planning-level)

### Build-time output

A single graph artifact (file or set of files) produced by the ingestion script. The runtime loads it once at startup and holds it in memory. The runtime never re-fetches from CoM during the demo.

### Atoms

- **Nodes** — points in the pedestrian network (intersections, footpath endpoints).
- **Edges** — walkable segments between nodes. **An edge is the unit of the streetscore.** Every metric, every color, every inspector card, every routing decision is keyed to an edge.

Each edge carries:

- Geometry (polyline for drawing).
- Length.
- **Time-invariant metrics** — lighting (lux), gentle gradient (inverted steepness, positive-framed), surface quality, canopy, transit/bailout proximity.
- **Time-varying metrics** — pedestrian count and open-venue density, each stored as a 168-vector (hour-of-week, 0 = Monday 00:00 .. 167 = Sunday 23:00).
- **Confidence flags** — most importantly for the pedestrian-count interpolation, so the inspector card can show "estimated, 180m to nearest sensor" honestly.

All metrics are stored in a **positive-framed, normalized form**: higher value = "more of the thing that's good for this metric." Steepness is inverted at bake time so 1.0 = flat. This keeps the runtime math uniform — every weight is "more is better."

### The graph also carries

- **Adjacency** — for routing.
- **Spatial index** over edge bounding boxes — for fast viewport queries during map pan/zoom.
- **Geocoder index** — built from CoM Street Addresses (~63k records); turns typed addresses into nodes via fuzzy match.

### The split that matters most

**Baked at build time:** raw normalized metrics per edge, plus the 168-vectors.
**Computed at runtime:** the composite streetscore (= scoring function of metrics for the active time).

This split means switching the time-of-week recolors the map instantly without rebaking.

### What's out of the data model

- Crime data — excluded by the positive-framing principle.
- VicRoads crash data — CycleSafe is deferred.
- Weather, PTV real-time, Ticketmaster — deferred (no live channel in scope).
- Any per-segment "safety" or "risk" score — excluded by the framing principle.

### Build-script responsibilities (this is where the algorithmically interesting work lives)

- Fetch and normalize all CoM datasets.
- Build the pedestrian network graph from the CoM Pedestrian Network dataset.
- Compute the pedestrian-count 168-vector per edge by IDW interpolation from the 145 sensor locations (inverse-square distance weighting, max range 400m, fallback to area-wide profile beyond).
- Compute lux per edge from street lights + feature lighting, decaying with distance.
- Compute the other per-edge metrics (steepness, surface, canopy, bailouts, open-venues 168-vector).
- Normalize every metric to a 0–1 positive-framed scale.
- Write the graph artifact.

The runtime is a read-only viewer over what the build script produces.

---

## 3. Streetscore math — DEFERRED

> **TODO (explore later):** the exact streetscore math is not finalized in this spec. The design above commits to the *shape* of the math but not the numbers.
>
> **Principles already locked:**
>
> - Score = weighted sum of normalized 0–1 metrics, all positive-framed (no negative weights, no inverted axes at runtime — any conceptual inversions happen at bake time).
> - **Weights are fixed in the algorithm. The user cannot change them.** No mode picker, no preset modes, no weight sliders in the UI.
> - Time affects the two time-varying metrics (pedestrians, open venues) via 168-vector lookup; the rest of the formula is time-invariant.
> - Edge cost for routing follows the WalkLight formula: `edge_cost = length_m × (1 + α × (1 − score))`, starting α = 1.5. α is a global "how much do we care about score vs distance" knob, not a per-mode setting.
> - Pedestrian count per edge is interpolated by inverse-distance weighting from the nearest 5 sensors, max 400m, inverse-square distance weights. Segments beyond 400m get a default low-confidence area-wide profile.
>
> **Open questions to resolve when we revisit:**
>
> - The actual fixed weight vector (6 numeric values, one per metric).
> - Whether α stays at 1.5 or gets tuned during the build based on observed route quality.
> - Normalization curves per metric (linear vs sigmoid clamping; how to handle the lux long tail).
> - How to handle confidence in scoring (e.g., should low-confidence ped counts be down-weighted, or only flagged in the UI?).
>
> Because weights are fixed in code (not user-facing), tuning is a development-time activity. The single fixed vector has to be defensible on stage: a judge can ask "why is Bourke St brighter than Spring St?" and the answer should be a specific reading of the inspector card. We tune by inspection during the build, freeze at ~14:30 demo day per Section 7.

---

## 4. Runtime app surfaces

### Canvas layout (locked)

Full-bleed map. Three translucent floating panels overlay it. One inspector card appears on demand. One slide-out for AI explanations appears on demand.

### Surface 1 — Map canvas

The hero. Always full-bleed. Two layers stacked over the OSM base map:

- **Streetscore layer** — every pedestrian network edge in the viewport, drawn as a colored polyline. Score drives hue along a positive vibrant-to-dim gradient. **Rendering method: Option A — colored line segments.** No glow, no particles, no heatmap regions in v1; those can be later polish.
- **Route layer** — when routes exist, three numbered polylines drawn over the streetscore layer. The streetscore layer dims slightly when routes are present so the paths pop.

The map reads: current time, current viewport, current route set, pinned segment.
The map writes: hover/click events on segments → inspector. Map clicks on empty space dismiss any pinned inspector.

Initial view: zoomed in on the CBD with every visible street interactive from the first second. Opening time-of-week: **Friday 22:00** (visually strongest data state for the demo).

### Surface 2 — Plan-a-walk panel (top-left, floating)

Two text inputs (from, to) with fuzzy autocomplete against the geocoder. A "Find route" button. When clicked:

- Both addresses resolve to graph nodes (or the panel shows an inline "couldn't find that address in the City of Melbourne" message).
- The 3-route computation runs at the **current time**.
- The route layer appears on the map. A route legend appears below the inputs.

The panel also holds:

- **Route legend** (appears after Find route): three numbered rows matching the on-map badges, each showing score + length. Recommended (Route 1) has a subtle highlight + "Recommended" label.
- **Per-route Explain link** — opens the AI Explanation slide-out for that specific route.
- **Recompute button** — appears when the time slider has changed after routes were computed, alongside a "Routes computed for Friday 22:00" stale indicator.
- **Clear link** — removes routes, returns map to streetscore-only mode.

**Routes are frozen** once computed. Changing time after computation updates the map color but not the route polylines. The user must click Recompute to refresh routes. (The map recoloring under stationary routes is a deliberate visualization; it shows how the city changes without the routes constantly moving.)

### Surface 3 — Score legend (top-right, floating)

A horizontal gradient strip from "Lower score" to "Higher score." A one-line subtitle: *"Score reflects lighting, foot traffic, gradient, surface, transit and canopy at the selected time."*

A small footer line beneath: *"Data: City of Melbourne open data."*

This surface exists because the user cannot change weights — they need to understand what the score reflects without a panel of sliders telling them.

### Surface 4 — Time slider (bottom strip, floating)

A horizontal slider, hour-of-week index 0–167. Drag (or click) to change the moment. Day + 24-hour readout shows next to the slider ("Fri 22:00").

**No autoplay button in v1.** The 24hr pulse animation is a stretch goal (Section 7), not a base requirement, because of unresolved performance uncertainty.

Map recolors on slider release. (If smooth-enough in testing, can flip to live-during-drag; defer to build time.)

### Surface 5 — Inspector card (bottom-left, on hover/click)

- **Hover** any street segment → tiny tooltip near cursor showing name + composite score ("Bourke St · 0.81").
- **Click** any street segment → pinned card in the bottom-left corner. Shows:
  - Segment name (where known).
  - Composite score.
  - **Two columns per metric:** raw human-meaningful value (e.g., "24 lux avg," "~1,240 ped/hr," "1.2% grade," "2 tram stops within 200m"), and the normalized 0–1 bar for the score model's view of that value.
  - **Confidence flags** where applicable ("estimated, 180m to nearest sensor").
  - "Pinned" tag and X to dismiss.

Clicking another segment swaps the pin. Clicking empty map dismisses.

This is the most important surface for the demo's credibility — it's where the score stops being a number and becomes evidence.

### Surface 6 — AI Explanation slide-out (on-demand, from right edge)

Triggered by clicking Explain on a specific route. Slides in from the right, covers ~30% of the canvas, map stays visible behind it.

- One-shot explanation per route (not a chat).
- Header: "Why this route?" + route number badge.
- Streaming text body, 4–6 short paragraphs (~250 words max).
- Footer: "Explained by Claude · ~1.2s" with elapsed time.
- Retry button if the stream errors. Esc / backdrop click / X dismisses.

Claude is given a structured summary of the route (edge sequence, per-edge raw + normalized metrics, time context, the fixed weight vector, the other routes' average scores) and asked to narrate **why this route scored how it scored**. Not asked to recommend changes, judge other routes, or give general walking advice. Positive framing enforced via system prompt.

Failure modes: API timeout → "Couldn't load explanation. Retry?" The rest of the app is unaffected — this is a side channel.

### Runtime state

A single source of state. Every panel reads from and writes to it.

- Current viewport (lng, lat, zoom).
- Current time (0–167, hour-of-week).
- Current route query (from address, to address, resolved nodes).
- Current route set (3 routes, frozen once computed, with their original time stamp).
- Pinned segment id.
- Open explanation route id.

No `weights` field — weights are a fixed constant in the scoring algorithm.

---

## 5. The connected demo beats

The whole design serves a single ~2-minute live demo:

### Beat 1 — "Look at the city" (~25s)

App opens at CBD zoom, time = Friday 22:00, streetscore layer rendered, color legend top-right.

Presenter narrates: *"Every walkable segment in Melbourne, colored by how vibrant it is right now — Friday night. Bourke and Swanston blaze; quiet residential streets fade out."*

Hover a bright segment → tooltip. Click → inspector card surfaces the raw numbers behind the color (1,240 ped/hr, 24 lux avg, 1.2% grade, 2 tram stops within 200m). The model is transparent within seconds.

### Beat 2 — "Compare moments" (~35s)

Presenter drags the time slider through three points: Friday 22:00 → Tuesday 10:00 → Sunday 03:00. Map snaps to a new color state each time. Bourke St blazes Friday night, steady Tuesday morning, dark Sunday at 3am. **Same scoring, three honestly different times, three honestly different recommendations** — the city is dynamic, the model is consistent.

### Beat 3 — "Route through it" (~45s)

Time set back to Friday 22:00. Presenter types into Plan-a-walk: "123 Bourke St" → "Carlton Gardens." Clicks Find route.

Three numbered routes appear on the map. Route 1 is recommended (highest avg score, ~0.82) and thicker; Routes 2 and 3 are alternatives in different accent colors. Legend below the inputs shows score + length for each.

Presenter narrates: *"Same A-to-B, three options, all evaluated by the same model. Route 1 takes Bourke St — most lit and active right now. Route 3 is shorter but uses quieter streets that don't score as well at this hour."*

Hover a segment on Route 1 → inspector card shows raw numbers. Click Explain on Route 1 → AI Explanation slide-out streams Claude narrating the route.

### Beat 4 — "Time changes the recommendation" (~20s)

Presenter drags slider to Tuesday 10:00. Map recolors instantly. "Routes computed for Friday 22:00" stale indicator appears. Presenter clicks Recompute → routes refresh for the new time. Routes 1 and 2 shift to a tree-lined Carlton path. **Same model, different recommendation, because the city is different now.**

### Roadmap-visible (not built)

Per the "prioritized subset, full scope visible" framing:

- Run / Cycle / Event tab buttons in a corner — disabled with "Coming soon" tooltips.
- Planner view toggle (Gap Finder concept) — disabled button.
- "Open in Google Maps" link on the recommended route — visible, ideally functional (opens a Google Maps query in a new tab) as a freebie.
- "Available via MCP" badge if MCP stretch ships, otherwise omitted.

These are pure UI ghosts. Zero backend behind them. They cost ~20 minutes of frontend work and signal the product line.

---

## 6. AI Explanation — what Claude does and doesn't do

Detailed in Surface 6 above. Recapping the constraints:

- **One-shot per route.** Not a chat.
- **Narrate, don't compute.** Everything quantitative is computed on our side and passed to Claude in a structured payload.
- **Positive framing enforced via system prompt.** No "avoid X." Yes "Route 1 takes advantage of strong lighting on Bourke St (28 lux average)."
- **Acknowledge data limits.** "Pedestrian count is estimated for the last 200m — the nearest sensor is on Russell St."
- **Reference real numbers.** Not "well-lit," but "lighting averages 28 lux."
- **~250 words, 4–6 short paragraphs, streamed.**

What Claude is **not** asked to do: pick a different route, judge other routes, give general walking advice, mention anything outside the structured payload, or invent geography.

The explanation is a side channel. If it fails, the rest of the demo is unaffected.

---

## 7. Scope discipline — what's wired vs ghost vs stretch vs deferred

### Fully wired (the product)

- Map canvas with OSM base + Deck.gl streetscore + Deck.gl route overlay.
- Streetscore computed live for the viewport at the current time.
- Time slider with map recolor on release.
- Plan-a-walk panel with geocoder autocomplete and Find route.
- 3-route generation (A* × 3 with edge penalties on prior routes, ranked by avg score, recommended = highest).
- Route layer with numbered badges, color-coded, recommended thicker.
- Route legend in the panel with per-route score, length, Explain link, Recompute button.
- Inspector card with hover tooltip + click-to-pin, raw values + normalized bars + composite score + confidence flags.
- Score legend (top-right) — gradient + one-line subtitle + data attribution.
- AI Explanation slide-out with streaming and Retry.
- Bake script producing the graph artifact from CoM data, run once offline.
- Runtime API loading the graph and serving viewport + route + segment + explanation passthrough.

### UI ghost (visible, disabled, no backend)

- Run / Cycle / Event tab buttons.
- Planner view (Gap Finder) toggle.
- "Open in Google Maps" link on recommended route (ideally functional as a freebie).
- "Available via MCP" badge if MCP stretch ships.

### Stretch goals (only if core is solid by ~15:30 demo day)

1. **24hr pulse autoplay** on the existing slider.
2. **MCP server** exposing 3 tools (Section 8).
3. **Working Open-in-Google-Maps** if not done as freebie.
4. **Live-during-drag slider recolor** if release-only feels too jerky.
5. **Mobile responsive layout.**

### Deferred (out of scope, in the design only as acknowledged absences)

- RunSafe (running loops, surface preferences, water/toilet waypoints).
- CycleSafe (crash data, dooring zones, bike routes).
- EventMode (dispersal routing, Ticketmaster, PTV real-time).
- Gap Finder as functional view (UI ghost only).
- Weather, PTV real-time, construction overlays.
- User-tweakable weights / preset modes (excluded by locked decision).
- Crime data, VicRoads crash data (excluded by positive-framing principle).
- Chat input (natural language → route). Deferred.
- WCAG 2.1 AA compliance — aspirational, not gated.

### Discipline rules (these stop scope-creep on demo day)

1. **Bake script frozen at ~13:30 demo day.** No bake re-runs in the last 4 hours.
2. **Streetscore weight vector frozen at ~14:30 demo day.** Tuning weights past that point is a rabbit hole.
3. **No new datasets after 12:00 demo day.**
4. **AI Explanation is "nice if working," not "must demo."** If the API misbehaves, presenter closes the panel and continues.
5. **Demo walks the four beats in order.** No improvisation in front of judges.

### Demo-day schedule

| Time | Milestone |
|---|---|
| 10:30 | CoM datasets confirmed accessible. Bake script scaffold. |
| 11:00 | Bake script produces a viable graph file (any quality). |
| 12:00 | Lunch. Bake script produces the demo-ready graph. Runtime API skeleton up. |
| 13:00 | Map renders viewport streetscore. Inspector on hover works. Time slider scrubs and recolors. |
| 13:30 | **Bake script frozen.** |
| 14:00 | Plan-a-walk panel functional. 3 routes computed and rendered with badges. Recompute button works. |
| 14:30 | **Weights frozen.** Score legend rendered. UI ghosts added. |
| 15:00 | AI Explanation slide-out wired. End-to-end demo walkthrough rehearsed once. |
| 15:30 | Stretch slot: pulse autoplay OR MCP OR polish. **Pick one only.** |
| 16:30 | Final demo dry-run. Buffer for breakage. |
| 17:00 | Submission. |
| 18:00 | Demo to judges. |

---

## 8. MCP server (stretch goal)

Out of scope for the base build. Included here so we know what we *could* ship if everything else is rock-solid by 15:30.

### Thesis

The runtime web app already has a working backend that does everything the consolidated requirements describe — route, segment stats, geocoding, explanation. An MCP server is just a second transport for that same backend. No new domain logic, no new data.

### Tools (3, mapped to existing capabilities)

1. **`plan_walk`** — input: from, to, time. Output: 3 routes with per-segment metadata.
2. **`describe_segment`** — input: a point or address, optional time. Output: composite score + raw metrics + nearby amenities.
3. **`find_amenity_nearby`** — input: a point, an amenity type (transit, drinking fountain, public toilet), a radius. Output: nearby amenities.

No `segment_search` (Gap Finder is deferred). No separate `nearby_bailouts` — folds into `find_amenity_nearby`.

### MCP demo beat (if it ships)

After the main 2-minute web app demo, presenter opens Claude Desktop in a second window: *"What's the walkability of Bourke St between Spring and Russell on Friday at 10pm?"* Claude calls `describe_segment`, returns the same numbers the web app's inspector card showed. **30-second tail.** Point: this isn't a one-off web app, it's a civic data service.

### What's explicitly out of MCP scope

- No interactive map rendering inside Claude (no MCP App iframe pattern).
- No streaming / live updates.
- No AI Explanation tool (Claude *is* the explanation when called from Claude).

### Decision point

At **15:30 demo day**, decide whether to build MCP based on:

- Core app fully working end-to-end? Yes/no.
- AI Explanation works? Yes/no.
- Demo dry-run completed once? Yes/no.
- No outstanding bugs? Yes/no.

If any answer is no, the stretch slot goes to bug-fix / polish. **The decision is made at 15:30, not before.**

---

## 9. Risks and cut paths

Each risk lists likelihood, trigger ("how we'd know we're in trouble"), and cut path ("what we'd remove or change").

### Risk 1 — Bake script doesn't finish a usable graph by ~13:00

- **Likelihood:** Medium. The IDW interpolation is the most algorithmically intense step.
- **Trigger:** 12:30 and the graph either doesn't exist or contains obviously wrong values.
- **Cut path:**
  1. Cut metrics, not segments. Ship with only lighting + foot traffic + gradient. Surface / canopy / bailouts get neutral 1.0 values.
  2. Shrink scope from full LGA to CBD only (~10k edges).
  3. If interpolation breaks, use area-wide ped count averages instead of per-edge values.
- **Deal-breaker:** if lighting doesn't bake. Over-invest there if needed.

### Risk 2 — Map performance is bad at CBD zoom

- **Likelihood:** Low–medium.
- **Trigger:** Frame rate <20fps at default zoom, or slider scrub feels laggy.
- **Cut path:**
  1. Threshold-cull: hide edges with score < 0.2 (dim segments disappear).
  2. Lower demo zoom to Hoddle Grid only.
  3. Replace Deck.gl PathLayer with vanilla MapLibre line layers (less pretty, more predictable).

### Risk 3 — A* routing slow or returns bad routes

- **Likelihood:** Low.
- **Trigger:** Route takes >2s, or recommended route is visibly worse than alternatives.
- **Cut path:**
  1. Tune α downward (e.g., 0.8 instead of 1.5) if routes zigzag.
  2. Drop to single-route output if alternatives don't differentiate.
  3. Use only 2 routes if 3 always converge.

### Risk 4 — AI Explanation hangs or fails on stage

- **Likelihood:** Low–medium (conference wifi).
- **Trigger:** "Explain" clicked → spinner >5s with no streamed text.
- **Cut path:**
  1. Pre-warmed cached explanation for the canonical demo route; falls back after 3s.
  2. Skip the beat entirely. Demo is unaffected.

### Risk 5 — Geocoding misses demo addresses

- **Likelihood:** Very low if we test demo addresses pre-demo.
- **Trigger:** "123 Bourke St" returns no match or wrong place.
- **Cut path:**
  1. Hardcode demo address coordinates as fallback.
  2. Lat/lng input as a fallback UI.

### Risk 6 — Routes look identical to each other

- **Likelihood:** Medium. Edge-penalty re-routing can produce duplicates in dense grids.
- **Trigger:** Routes overlap >80% on the map.
- **Cut path:**
  1. Increase edge penalty multiplier (×3 → ×5 or ×10).
  2. Pick demo addresses to maximize routing flexibility (longer walks, more grid options).
  3. Drop to 2 routes if 3 always converge.

### Risk 7 — Browser / projector incompatibility

- **Likelihood:** Low if we test on the demo machine.
- **Trigger:** Blank map, broken layout at projector resolution.
- **Cut path:**
  1. Bring own laptop. Don't trust venue hardware.
  2. Test on the projector pre-demo.
  3. Screen-recorded video backup of demo running locally.

### Risk 8 — Time runs out before demo is end-to-end

- **Likelihood:** Medium.
- **Trigger:** 15:00 and route layer isn't rendering, or inspector isn't wired.
- **Cut path (in order, things we cut not features we abandon):**
  1. Drop UI ghosts.
  2. Drop AI Explanation.
  3. Drop inspector card detail (tooltip only).
  4. Drop time slider (single hour demo).
  5. Drop 3-route output (single route only).

**Minimum viable demo:** OSM base + streetscore-colored streets + single route from A to B. Below that, we don't have a product.

### Not worried about

- CoM data access (public, no auth, no practical rate limits).
- Anthropic API costs (single-digit dollars for a hackathon).
- Domain / hosting (localhost demo).
- Auth / users / accounts (none exist).
- Data accuracy litigation risk (positive framing + CoM attribution handles it).

---

## Locked decisions (summary, for fast reference)

1. **Goal:** Hackathon demo. Full scope visible (tabs, layers as ghosts) but only a slice fully wired.
2. **Product framing:** Data-first web app with a map canvas. Streetscore map → Route planner, sharing one canvas. MCP is a stretch.
3. **Framing principle:** Positive reinforcement only. No red/danger, no "avoid," no stigmatizing language. Score is "more of what you asked for," not "bad street."
4. **Geographic scope:** City of Melbourne LGA only.
5. **Initial view:** Zoomed on CBD, every visible street interactive immediately. Opening time: Friday 22:00.
6. **Rendering:** Colored line segments (Option A). No glow/particles/heatmap in v1.
7. **Canvas layout:** Full-bleed map + floating cards (Layout 2). Plan-a-walk top-left, score legend top-right, time slider bottom strip.
8. **Inspector:** Hover = tooltip; click = pinned card with raw values + normalized bars + composite score + confidence flags.
9. **Routes:** 3 per query, numbered badges 1/2/3 on the map, recommended thicker, color-coded. All ranked by streetscore. Routes are **frozen** once computed; stale indicator + Recompute button when time changes.
10. **Time slider:** Manual scrub only in v1; recolor on release. **24hr pulse autoplay is a stretch goal.**
11. **Score weights:** **Fixed in the algorithm.** No user-facing weight panel. No preset modes.
12. **Score legend:** Top-right floating panel — color ramp + one-line explainer + data attribution footer.
13. **AI Explanation:** Slide-out from right edge. One-shot per route. Streaming. Positive-framed, evidence-based, ~250 words.
14. **Routing library:** `ngraph.path` for A*. 3 A* searches per query with edge penalties on prior routes.
15. **Map renderer:** MapLibre GL JS over OSM tiles, Deck.gl PathLayer for overlays.
16. **Architecture:** Hard build/run split. Pre-baked graph artifact loaded once at runtime startup. No live data dependencies in the demo.
17. **MCP server:** Stretch goal only. 3 tools (`plan_walk`, `describe_segment`, `find_amenity_nearby`). Decision made at 15:30.
18. **Streetscore math (Section 3):** Deferred. Principles locked; numbers TBD.

---

*End of design spec.*
