# CityStride

Interactive pedestrian streetscore map for Melbourne. Every street in the City of Melbourne LGA colored by a composite walkability score that changes with time of day.

![CityStride map showing Melbourne streets colored by walkability score]

## What it does

- **Streetscore map** — every pedestrian edge colored by a composite score (lighting, foot traffic, gradient, surface quality, canopy, transit proximity)
- **Time slider** — scrub through 168 hours of the week; map recolors live
- **Route planner** — type two Melbourne streets, get 3 scored walking routes (Lively / Accessible / Shortest) shown as tabs
- **Route rendering** — smoothed geometry (corner-cutting algorithm), MapLibre native line layers with GPU blur glow; streets dim to background when route is active
- **Inspector** — hover or click any street segment for per-metric breakdown
- **AI explanation** — Claude-powered slide-out explaining why a route was chosen, with metric highlights and street picks

## Stack

| Layer | Tech |
| --- | --- |
| Framework | React Router v7 (SSR) |
| Map | MapLibre GL JS v5 |
| Street score overlay | Deck.gl PathLayer (WebGL) |
| Route rendering | MapLibre native line layers (GPU blur glow) |
| Routing | ngraph.path (A\* in Web Worker) |
| AI | Anthropic SDK (streaming) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Deploy | Vercel / Docker |

## Repo layout

```text
app/
  routes/         React Router routes (_index, api/graph, api/explain)
  components/     UI components (map-app, planner, inspector, legend, …)
  hooks/          useGraph, useWorker
  lib/            graph types, scoring, geocoder
scripts/
  bake/           one-shot data pipeline (Node.js)
    fetch.js      downloads City of Melbourne open datasets
    network.js    builds OSM pedestrian network
    metrics.js    computes per-edge metrics
    normalize.js  normalizes metrics 0-1
    artifact.js   writes data/graph.json
data/
  graph.json      baked graph artifact (loaded at runtime)
```

## Getting started

### 1. Install dependencies

```sh
npm install
```

### 2. Set env vars

```sh
cp .env.example .env        # or create .env manually
# Add your Anthropic API key — required for route explanations
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Bake the graph

Run once to produce `data/graph.json`. Fetches City of Melbourne open datasets (~2 min, requires internet).

```sh
npm run bake
```

Cached raw data lands in `data/raw/`. Re-running skips already-fetched files.

### 4. Dev server

```sh
npm run dev
```

App runs at `http://localhost:5173`.

### 5. Type check

```sh
npm run typecheck
```

## Scoring model

```text
composite_score = weighted_sum(lux, gentle_gradient, surface_quality, canopy, bailout_proximity, ped_count[t], open_venues[t])
edge_cost       = length_m × (1 + 1.5 × (1 − score))
```

All metrics normalized 0–1, positive-framed (higher = better). Time-varying metrics (`ped_count`, `open_venues`) are 168-element vectors indexed by hour-of-week.

## Routes

Three routes per query via successive A\* runs with edge penalties to force differentiation. Route 1 = highest average streetscore = recommended.

## Deploy

### Vercel

Push to main — Vercel runs `npm run build` automatically. Bake must run separately; commit `data/graph.json`.

### Docker

```sh
docker build -t citystride .
docker run -p 3000:3000 citystride
```

## Data

City of Melbourne open datasets: pedestrian network, pedestrian counting sensors, street lights, trees, footpath surfaces, tram stops, venue locations. All public, no auth required.

Geographic scope: City of Melbourne LGA only.
