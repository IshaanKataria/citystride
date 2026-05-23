# Melbourne Dataset → App Signal Map

## The 4 Routing Signals

| Signal | Powers | User Served |
|---|---|---|
| **A — Accessibility** | Can I physically navigate this path? | Wheelchair, stroller, elderly, crutches |
| **B — Vibrancy** | Does this street feel alive right now? | Night walkers, solo women, anxious pedestrians |
| **C — Terrain** | Is this path flat/paved/direct? | Runners, cyclists, anyone avoiding hills |
| **D — Community** | What's around this route worth stopping for? | Families, social walkers, circular economy participants |

---

## SIGNAL A — Accessibility (Specially Abled + Strollers + Elderly)

> *"Can my body/chair/pram actually get through here?"*

| Dataset | Records | Why it matters |
|---|---|---|
| **Footpath steepness** | 33,585 | Core routing weight — max gradient per segment |
| **Tactile Ground Surface Indicator** | 357 | Visually impaired navigation, bumpy surfaces flagged |
| **Footpaths** | — | Path geometry, width, presence |
| **Pedestrian Network** | — | Which paths are connected vs dead ends |
| **Road segments with surface type** | — | Sealed vs unsealed, pavement quality |
| **Street furniture (seats, bollards, bins, fountains)** | — | Bench locations = rest stop routing |
| **Drinking fountains** | — | Rest + hydration stops |
| **Public toilets** | — | Critical for elderly, parents with babies |
| **Older People Profile 2016** | — | Density map of WHERE elderly residents live → demand heat map |
| **Families with Children Profile 2016** | — | Stroller user density |
| **Childcare centres** | 29 | Destination layer for parents |
| **Playgrounds** | — | Destination layer for stroller users |
| **Landmarks (health services, hospitals)** | — | Medical destination routing |

**Routing logic:** Weighted Dijkstra where steep gradient = high cost, missing tactile = penalty, no bench within 200m = penalty

---

## SIGNAL B — Vibrancy (Alive Streets / Safe Feeling)

> *"Does this street feel like people are here?"*

| Dataset | Records | Why it matters |
|---|---|---|
| **Pedestrian Counting System (counts per hour)** | — | Real-time foot traffic per street sensor |
| **Pedestrian Counting System – Past Hour (per minute)** | — | Live pulse of street activity |
| **Pedestrian Counting System – Sensor Locations** | — | 145 sensors across Melbourne |
| **Street lights with emitted lux level** | — | Darkness score per segment at night |
| **Feature Lighting (type, wattage, location)** | — | Decorative/event lighting = perceived safety |
| **Café, restaurant, bistro seats** | 66,356 | Open venues = eyes on street |
| **Bar, tavern, pub patron capacity** | 5,304 | Nighttime activity density |
| **Business establishments location + industry** | 413,550 | Venue density per street segment |
| **Live Music Venues** | — | Nighttime vibrancy nodes |
| **Microlabs Sound Sensor Data** | — | Ambient activity level (sound = life) |
| **Microclimate Sensor Readings** | — | Temperature → comfort score |
| **Event permits 2014–2018** | — | Historical event density by street |
| **Outdoor non-smoking zones** | — | Comfort/safety indicator |

**Routing logic:** Vibrancy score = (pedestrian count × lux level × open venue count) at current hour. Routes ranked by score not just distance.

---

## SIGNAL C — Terrain (Runners / Cyclists / Flat Path Seekers)

> *"How hard is this route physically?"*

| Dataset | Records | Why it matters |
|---|---|---|
| **Footpath steepness** | 33,585 | Gradient per segment — primary terrain signal |
| **Digital Surface Model** | — | Full elevation grid of Melbourne |
| **Footpaths** | — | Path geometry |
| **Road segments with surface type** | — | Sealed vs gravel vs cobblestone |
| **Road Segment / Road corridors** | — | Full road network for cross-referencing |
| **Bicycle Network** | — | Off-road / shared path options |
| **Bicycle routes (informal, on-road, off-road)** | — | Scenic/flat alternatives |
| **Annual Bike Counts (Super Tuesday)** | — | Which routes cyclists prefer = proxy for pleasant terrain |
| **Tree Canopies 2021 (Urban Forest)** | — | Shade coverage per segment (heat safety for runners) |
| **Trees with species and dimensions** | — | Shade density per street |
| **Microclimate sensors** | — | Real temperature under canopy vs open street |
| **Parks / Open spaces (via Landmarks)** | — | Loop route options through green space |
| **Self Guided Walks** | — | Curated flat/scenic routes already mapped |

**Routing logic:** Elevation gain per km = fitness cost. Flat + shaded + paved = low cost. Steep + unshaded + gravel = high cost for accessibility, low cost for challenge-seekers (toggle).

---

## SIGNAL D — Community (Social Walkers / Circular Economy Nodes)

> *"What's worth walking to or past?"*

| Dataset | Records | Why it matters |
|---|---|---|
| **Playgrounds** | — | Family gathering points |
| **Public barbecues** | — | Community gathering spots |
| **Public artworks, fountains and monuments** | — | Interesting stops on route |
| **Outdoor artworks** | — | Cultural waypoints |
| **Laneways with greening potential** | — | Hidden green routes |
| **Trees with species and dimensions** | — | Nature richness score per route |
| **Former creeks / water flow routes** | — | Heritage/nature walking narrative |
| **Renewals for Nature: garden bed inventory 2024** | — | Proximity to community gardens |
| **Event permits** | — | Live community events on route |
| **Venues for event bookings** | — | Community spaces |
| **Argyle Square Benches usage data** | — | Which communal spaces are actually used |
| **Argyle Square sound stage activity** | — | Community gathering proxy |
| **Bicycle routes** | — | Shared active transport routes |
| **Self Guided Walks** | — | Existing community-curated paths |
| **Landmarks (schools, galleries, museums, sports)** | — | Community destination layer |
| **Café, restaurant, bistro seats** | 66,356 | Stopping/meeting points |
| **Childcare centres** | 29 | Community infrastructure nodes |
| **Free and cheap support services (Helping Out)** | — | Community resource layer |
| **Social Indicators by year** | — | Neighbourhood liveability context |

**Routing logic:** Community score = density of stops worth pausing at + social infrastructure + greenery along path

---

## Dataset Overlap Matrix

```
Dataset                          A    B    C    D
─────────────────────────────────────────────────
Footpath steepness               ●    ·    ●    ·
Pedestrian counting              ·    ●    ·    ·
Street lights / lux              ○    ●    ·    ·
Café / restaurant seats          ·    ●    ·    ●
Tactile Ground Surface           ●    ·    ·    ·
Public toilets                   ●    ·    ·    ○
Drinking fountains               ●    ·    ●    ○
Street furniture / benches       ●    ·    ○    ●
Trees / canopy                   ○    ·    ●    ●
Playgrounds                      ○    ·    ·    ●
Bicycle network                  ·    ·    ●    ○
Landmarks                        ●    ·    ·    ●
Digital Surface Model            ·    ·    ●    ·
Microclimate sensors             ·    ○    ●    ·
Sound sensor data                ·    ●    ·    ·
Event permits                    ·    ●    ·    ●
Self Guided Walks                ·    ·    ○    ●
Social Indicators                ○    ·    ·    ●

● = primary signal   ○ = secondary signal   · = not relevant
```

---

## Per User Profile — Which Signals to Weight

| User | A | B | C | D |
|---|---|---|---|---|
| **Elderly walker** | ●●● | ○ | ●● | ○ |
| **Parent + stroller** | ●●● | ○ | ●● | ●● |
| **Night solo walker** | ○ | ●●● | ○ | ○ |
| **Morning runner** | ○ | ○ | ●●● | ○ |
| **Social weekend walk** | ○ | ● | ○ | ●●● |
| **Wheelchair user** | ●●● | ○ | ●● | ○ |
| **Cyclist** | ○ | ○ | ●●● | ● |

---

## Minimum Viable Datasets to Ship (Day 1)

If you had to pick just 6 to get a working demo:

1. `Footpath steepness` — backbone of routing
2. `Pedestrian Network` — graph structure
3. `Pedestrian Counting System` — vibrancy signal
4. `Street lights with lux level` — night safety
5. `Public toilets + Drinking fountains` — rest layer
6. `Street furniture (benches)` — accessibility layer

Everything else is enrichment on top.
