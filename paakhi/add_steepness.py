"""
Enriches graph_slim.json with real CoM footpath steepness data.
Fetches from Melbourne open data, spatial-joins to each edge, overwrites steepness + grade_raw.
Run: python add_steepness.py
"""

import json, requests, math
from scipy.spatial import cKDTree
import numpy as np

DATA = "/Users/paakhi/Desktop/claude hackathon/data"

# ── Step 1: Fetch CoM footpath steepness dataset (full export) ───────────────
print("Fetching footpath steepness from CoM export API...")
url = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/footpath-steepness/exports/json"
r = requests.get(url, params={"limit": 100000}, timeout=120)
r.raise_for_status()
records = r.json()
print(f"  Got {len(records)} steepness records")

# ── Step 2: Extract coordinates + gradient values ─────────────────────────────
steep_pts  = []
steep_vals = []

for rec in records:
    geo = rec.get("geo_point_2d") or rec.get("geom_point") or rec.get("geometry")
    if not geo:
        continue
    # handle different formats
    if isinstance(geo, dict):
        lon = geo.get("lon") or geo.get("longitude")
        lat = geo.get("lat") or geo.get("latitude")
    else:
        continue

    # CoM footpath steepness uses gradepc (gradient %) and grade1in (1-in-X)
    grad = None
    for col in ["gradepc", "slope", "gradient", "grade", "steepness",
                "pct_slope", "mean_gradient", "avg_gradient"]:
        if col in rec and rec[col] is not None:
            try:
                grad = abs(float(rec[col]))
                break
            except:
                pass

    if lon and lat and grad is not None:
        steep_pts.append([lon, lat])
        steep_vals.append(grad)

print(f"  Usable steepness points: {len(steep_pts)}")
print(f"  Gradient range: {min(steep_vals):.2f}% – {max(steep_vals):.2f}%")

# ── Step 3: Load graph_slim.json ─────────────────────────────────────────────
print("\nLoading graph_slim.json...")
with open(f"{DATA}/graph_slim.json") as f:
    edges = json.load(f)
print(f"  {len(edges)} edges")

# ── Step 4: Build KD-tree + nearest-neighbour join ───────────────────────────
print("Spatial joining steepness to edges...")

steep_xy  = np.array(steep_pts)
steep_arr = np.array(steep_vals)
tree      = cKDTree(steep_xy)

# Edge midpoints
mid_xy = np.array([
    [(e["lon1"] + e["lon2"]) / 2, (e["lat1"] + e["lat2"]) / 2]
    for e in edges
])

dists, idxs = tree.query(mid_xy, k=1)

# Normalise gradient → steepness score (0=steep, 1=flat)
# Cap at 15% gradient (very steep for pedestrians)
MAX_GRAD = 15.0
steepness_scores = np.clip(1 - (steep_arr[idxs] / MAX_GRAD), 0, 1).round(4)
grade_raw        = steep_arr[idxs].round(3)
join_dist_m      = (dists * 111_000).round(1)   # approx degrees → metres

# ── Step 5: Update edges ──────────────────────────────────────────────────────
updated = 0
for i, edge in enumerate(edges):
    old = edge.get("steepness", None)
    edge["steepness"]  = float(steepness_scores[i])
    edge["grade_raw"]  = float(grade_raw[i])
    edge["steep_join_dist_m"] = float(join_dist_m[i])
    if old != edge["steepness"]:
        updated += 1

print(f"  Updated steepness on {updated}/{len(edges)} edges")
print(f"  Avg join distance: {join_dist_m.mean():.0f}m")
print(f"  Steepness range: {steepness_scores.min():.3f} – {steepness_scores.max():.3f}")

# ── Step 6: Write back ────────────────────────────────────────────────────────
out_path = f"{DATA}/graph_slim.json"
with open(out_path, "w") as f:
    json.dump(edges, f, separators=(",", ":"))

print(f"\nDone. Written → {out_path}")
print("Re-render map.qmd to see updated steepness layer.")
