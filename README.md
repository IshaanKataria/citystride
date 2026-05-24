# CityStride

Interactive pedestrian streetscore map for Melbourne. Every street in the City of Melbourne LGA colored by a composite walkability score that changes with time of day.

![CityStride map showing Melbourne streets colored by walkability score]

## What it does

- **Streetscore map** — every pedestrian edge colored by a composite score (lighting, foot traffic, gradient, surface quality, canopy, transit proximity)
- **Time slider** — scrub through 168 hours of the week; map recolors live
- **Route planner** — type two Melbourne addresses, get 3 scored walking routes (A\* with streetscore cost function)
- **Inspector** — hover or click any street segment for per-metric breakdown
- **AI explanation** — streaming Claude-powered explanation for any route

## Stack

| Layer | Tech |
| --- | --- |
| Framework | React Router v7 (SSR) |
| Map | MapLibre GL JS v5 |
| Overlays | Deck.gl PathLayer (WebGL) |
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

### 1. Bake the graph

Run once to produce `data/graph.json`. Requires internet access to fetch CoM open datasets (~2 min).

```sh
npm run bake
```

Cached raw data lands in `data/raw/`. Re-running skips fetches.

### 2. Dev server

```sh
npm install
npm run dev
```

App runs at `http://localhost:5173`. Requires `data/graph.json` to exist.

### 3. Type check

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
