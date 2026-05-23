"""
CityStride — Build-Time Ingest Pipeline
Run once: python ingest.py
Outputs: graph_artifact.json  (loaded by the runtime API)
"""

import json, math, time, requests, warnings
from pathlib import Path
from datetime import datetime
from collections import defaultdict

import numpy as np
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, LineString
from shapely.ops import nearest_points
from scipy.spatial import cKDTree
import networkx as nx

warnings.filterwarnings("ignore")

# ─── CONFIG ──────────────────────────────────────────────────────────────────
OUT_FILE   = Path(__file__).parent / "graph_artifact.json"
EPSG_PROJ  = 7855          # GDA2020 MGA zone 55 — Melbourne projected CRS (metres)
EPSG_GEO   = 4326          # WGS84 geographic

BASE_URL   = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets"
MAX_ROWS   = 100_000       # CoM API max per page

# Dataset IDs on data.melbourne.vic.gov.au
DS = {
    "ped_network":      "pedestrian-network",
    "footpaths":        "footpaths",
    "steepness":        "footpath-steepness",
    "street_lights":    "street-lights-with-emitted-lux-level-council-owned-lights-only",
    "feat_lighting":    "feature-lighting-including-light-type-wattage-and-location",
    "ped_count":        "pedestrian-counting-system-monthly-counts-per-hour",
    "ped_sensors":      "pedestrian-counting-system-sensor-locations",
    "trees":            "trees-with-species-and-dimensions-urban-forest",
    "tree_canopy":      "tree-canopies-2021-urban-forest",
    "surface_type":     "road-segments-with-surface-type",
    "tactile":          "tactile-ground-surface-indicator",
    "cafes":            "cafes-and-restaurants-with-seating-capacity",
    "bars":             "bars-and-pubs-with-patron-capacity",
    "business":         "business-establishments-with-address-and-industry-classification",
    "bus_stops":        "bus-stops",
    "tram_stops":       "city-circle-tram-stops",
    "taxi_ranks":       "taxi-ranks",
    "bike_share":       "bike-share-dock-locations",
    "street_addresses": "street-addresses",
    "live_music":       "live-music-venues",
}

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def fetch_geojson(dataset_id: str) -> gpd.GeoDataFrame:
    """Download a CoM dataset as GeoDataFrame (handles pagination)."""
    url = f"{BASE_URL}/{dataset_id}/exports/geojson"
    print(f"  Fetching {dataset_id}...", end=" ", flush=True)
    try:
        r = requests.get(url, params={"limit": MAX_ROWS}, timeout=60)
        r.raise_for_status()
        gdf = gpd.read_file(r.text, driver="GeoJSON")
        print(f"{len(gdf)} records")
        return gdf.to_crs(EPSG_PROJ)
    except Exception as e:
        print(f"FAILED ({e})")
        return gpd.GeoDataFrame()


def fetch_csv(dataset_id: str) -> pd.DataFrame:
    """Download a CoM dataset as plain CSV (for tabular-only datasets)."""
    url = f"{BASE_URL}/{dataset_id}/exports/csv"
    print(f"  Fetching {dataset_id} (CSV)...", end=" ", flush=True)
    try:
        r = requests.get(url, params={"limit": MAX_ROWS, "delimiter": ";"}, timeout=60)
        r.raise_for_status()
        from io import StringIO
        df = pd.read_csv(StringIO(r.text), sep=";")
        print(f"{len(df)} records")
        return df
    except Exception as e:
        print(f"FAILED ({e})")
        return pd.DataFrame()


def normalize(series: pd.Series, invert=False) -> pd.Series:
    """Min-max normalize to [0, 1]. invert=True flips so lower raw = higher score."""
    mn, mx = series.min(), series.max()
    if mx == mn:
        return pd.Series(0.5, index=series.index)
    norm = (series - mn) / (mx - mn)
    return 1 - norm if invert else norm


def idw_interpolate(sensor_locs: np.ndarray, sensor_values: np.ndarray,
                    query_locs: np.ndarray, k=8, power=2) -> np.ndarray:
    """
    Inverse Distance Weighting from sensor_locs → query_locs.
    sensor_locs / query_locs: (N, 2) arrays of (x, y) in projected CRS.
    sensor_values: (N, T) — T time slots per sensor.
    Returns: (M, T) interpolated values for each query point.
    """
    tree = cKDTree(sensor_locs)
    dists, idxs = tree.query(query_locs, k=min(k, len(sensor_locs)))
    dists = np.where(dists == 0, 1e-10, dists)   # avoid div-by-zero
    weights = 1.0 / (dists ** power)
    weights /= weights.sum(axis=1, keepdims=True)
    # weights: (M, k), sensor_values[idxs]: (M, k, T)
    vals = sensor_values[idxs]                    # (M, k, T)
    return (weights[:, :, np.newaxis] * vals).sum(axis=1)  # (M, T)


def edge_midpoint(geom) -> tuple:
    """Return (x, y) midpoint of a LineString in projected CRS."""
    pt = geom.interpolate(0.5, normalized=True)
    return pt.x, pt.y


# ─── STEP 1 : FETCH ALL DATASETS ─────────────────────────────────────────────

print("\n=== STEP 1: Fetching datasets ===")
gdf = {}
for key, ds_id in DS.items():
    gdf[key] = fetch_geojson(ds_id)


# ─── STEP 2 : BUILD PEDESTRIAN NETWORK GRAPH ──────────────────────────────────

print("\n=== STEP 2: Building pedestrian network graph ===")

net = gdf["ped_network"]
if net.empty:
    # fallback to footpaths if ped_network unavailable
    net = gdf["footpaths"]

net = net[net.geometry.geom_type == "LineString"].copy()
net = net.reset_index(drop=True)
net["edge_id"] = net.index.astype(str)

# Build networkx graph for later A* routing reference
G = nx.Graph()
edge_records = []

for _, row in net.iterrows():
    geom = row.geometry
    coords = list(geom.coords)
    u = str(coords[0])
    v = str(coords[-1])
    length_m = geom.length
    G.add_edge(u, v, edge_id=row["edge_id"], length_m=length_m)

    midx, midy = edge_midpoint(geom)
    # convert midpoint back to WGS84
    mid_pt = gpd.GeoSeries([Point(midx, midy)], crs=EPSG_PROJ).to_crs(EPSG_GEO).iloc[0]

    edge_records.append({
        "edge_id":   row["edge_id"],
        "u":         u,
        "v":         v,
        "length_m":  round(length_m, 1),
        "mid_x":     midx,    # projected
        "mid_y":     midy,    # projected
        "mid_lng":   round(mid_pt.x, 6),
        "mid_lat":   round(mid_pt.y, 6),
        "geometry":  [list(c) for c in geom.coords],
        "street_name": str(row.get("rd_name", row.get("street_name", row.get("name", "")))),
    })

edges_df = pd.DataFrame(edge_records)
mid_xy   = edges_df[["mid_x", "mid_y"]].values
print(f"  {len(edges_df)} edges, {G.number_of_nodes()} nodes")


# ─── STEP 3 : COMPUTE PER-EDGE METRICS ────────────────────────────────────────

print("\n=== STEP 3: Computing per-edge metrics ===")

# ── 3a. LUX (street lights + feature lighting) ──────────────────────────────
print("  [lux]")
lux_pts = []

sl = gdf["street_lights"]
if not sl.empty and "luxvalue" in sl.columns:
    sl_pts = sl[sl.geometry.geom_type == "Point"].copy()
    lux_pts.append(sl_pts[["geometry", "luxvalue"]].rename(columns={"luxvalue": "lux"}))

fl = gdf["feat_lighting"]
if not fl.empty:
    # Feature lighting: estimate lux from wattage (rough proxy)
    watt_col = next((c for c in fl.columns if "watt" in c.lower()), None)
    fl_pts = fl[fl.geometry.geom_type == "Point"].copy()
    if watt_col:
        fl_pts["lux"] = pd.to_numeric(fl_pts[watt_col], errors="coerce").fillna(50) * 0.4
    else:
        fl_pts["lux"] = 50.0
    lux_pts.append(fl_pts[["geometry", "lux"]])

if lux_pts:
    all_lux = pd.concat(lux_pts, ignore_index=True)
    all_lux = gpd.GeoDataFrame(all_lux, geometry="geometry", crs=EPSG_PROJ)
    lux_xy  = np.array([(p.x, p.y) for p in all_lux.geometry])
    lux_vals = all_lux["lux"].fillna(0).values.reshape(-1, 1)

    tree_lux = cKDTree(lux_xy)
    # sum lux within 40m radius of each edge midpoint
    lux_scores = []
    for pt in mid_xy:
        idxs = tree_lux.query_ball_point(pt, r=40)
        lux_scores.append(float(lux_vals[idxs].sum()) if idxs else 0.0)
    edges_df["raw_lux"]  = lux_scores
    edges_df["lux"]      = normalize(pd.Series(lux_scores)).round(4)
else:
    edges_df["raw_lux"]  = 0.0
    edges_df["lux"]      = 0.5


# ── 3b. PED COUNT 168-VECTOR (IDW from sensors) ─────────────────────────────
print("  [ped_count 168-vector]")

sensor_locs_gdf = gdf["ped_sensors"]
ped_raw         = fetch_csv(DS["ped_count"])

sensor_168 = None
sensor_xy  = None

if not sensor_locs_gdf.empty and not ped_raw.empty:
    # Find sensor ID column
    sid_col  = next((c for c in sensor_locs_gdf.columns if "sensor" in c.lower() and "id" in c.lower()), None)
    # Find count + datetime columns in ped_raw
    cnt_col  = next((c for c in ped_raw.columns if "count" in c.lower()), None)
    dt_col   = next((c for c in ped_raw.columns if "date" in c.lower() or "time" in c.lower()), None)
    rid_col  = next((c for c in ped_raw.columns if "sensor" in c.lower() and "id" in c.lower()), None)

    if all([sid_col, cnt_col, dt_col, rid_col]):
        ped_raw[dt_col]  = pd.to_datetime(ped_raw[dt_col], errors="coerce")
        ped_raw[cnt_col] = pd.to_numeric(ped_raw[cnt_col], errors="coerce").fillna(0)
        ped_raw["dow"]   = ped_raw[dt_col].dt.dayofweek   # 0=Mon
        ped_raw["hour"]  = ped_raw[dt_col].dt.hour
        ped_raw["slot"]  = ped_raw["dow"] * 24 + ped_raw["hour"]  # 0-167

        pivot = (ped_raw.groupby([rid_col, "slot"])[cnt_col]
                 .mean()
                 .unstack(fill_value=0)
                 .reindex(columns=range(168), fill_value=0))

        # Align sensor locations with pivot index
        sensor_locs_gdf = sensor_locs_gdf[sensor_locs_gdf[sid_col].isin(pivot.index)].copy()
        pivot            = pivot.loc[sensor_locs_gdf[sid_col].values]

        sensor_xy    = np.array([(p.x, p.y) for p in sensor_locs_gdf.geometry])
        sensor_168   = pivot.values.astype(float)   # (N_sensors, 168)

        # IDW interpolate to every edge midpoint
        interp = idw_interpolate(sensor_xy, sensor_168, mid_xy, k=8)  # (N_edges, 168)

        # Normalize each slot independently
        slot_max = interp.max(axis=0, keepdims=True)
        slot_max = np.where(slot_max == 0, 1, slot_max)
        ped_norm = (interp / slot_max).round(4)

        edges_df["ped_count_168"]     = list(ped_norm.tolist())
        edges_df["nearest_sensor_m"]  = cKDTree(sensor_xy).query(mid_xy)[0].round(1)
    else:
        edges_df["ped_count_168"]    = [[0.3] * 168] * len(edges_df)
        edges_df["nearest_sensor_m"] = 9999.0
else:
    edges_df["ped_count_168"]    = [[0.3] * 168] * len(edges_df)
    edges_df["nearest_sensor_m"] = 9999.0


# ── 3c. STEEPNESS (inverted → gentle gradient score) ─────────────────────────
print("  [steepness]")

steep = gdf["steepness"]
if not steep.empty:
    grad_col = next((c for c in steep.columns
                     if any(x in c.lower() for x in ["gradient", "slope", "grade", "steep"])), None)
    if grad_col:
        steep[grad_col] = pd.to_numeric(steep[grad_col], errors="coerce").abs().fillna(0)
        # Spatial join: each edge midpoint → nearest steepness record
        mid_gdf = gpd.GeoDataFrame(
            edges_df[["edge_id"]],
            geometry=[Point(x, y) for x, y in mid_xy],
            crs=EPSG_PROJ
        )
        steep_joined = gpd.sjoin_nearest(mid_gdf, steep[[grad_col, "geometry"]],
                                         how="left", max_distance=30)
        edges_df["raw_gradient_pct"] = steep_joined[grad_col].fillna(0).values
        edges_df["steepness"]        = normalize(
            pd.Series(edges_df["raw_gradient_pct"]), invert=True
        ).round(4)
    else:
        edges_df["raw_gradient_pct"] = 0.0
        edges_df["steepness"]        = 0.7
else:
    edges_df["raw_gradient_pct"] = 0.0
    edges_df["steepness"]        = 0.7


# ── 3d. SURFACE QUALITY ───────────────────────────────────────────────────────
print("  [surface_quality]")

# Surface type scoring map (higher = more pedestrian-friendly)
surface_scores = {
    "asphalt": 1.0, "concrete": 0.95, "paved": 0.9,
    "brick": 0.75,  "cobblestone": 0.5, "gravel": 0.3,
    "unpaved": 0.2, "dirt": 0.1,
}

surf = gdf["surface_type"]
if not surf.empty:
    surf_col = next((c for c in surf.columns if "surface" in c.lower()), None)
    if surf_col:
        mid_gdf = gpd.GeoDataFrame(
            edges_df[["edge_id"]],
            geometry=[Point(x, y) for x, y in mid_xy],
            crs=EPSG_PROJ
        )
        surf_joined = gpd.sjoin_nearest(mid_gdf, surf[[surf_col, "geometry"]],
                                        how="left", max_distance=15)
        def score_surface(val):
            if pd.isna(val):
                return 0.8
            val = str(val).lower()
            for k, v in surface_scores.items():
                if k in val:
                    return v
            return 0.8
        edges_df["surface_quality"] = surf_joined[surf_col].apply(score_surface).values
    else:
        edges_df["surface_quality"] = 0.8
else:
    edges_df["surface_quality"] = 0.8

# Tactile ground surface: presence within 20m = accessibility bonus
tact = gdf["tactile"]
if not tact.empty:
    tact_xy = np.array([(p.x, p.y) for p in tact.geometry if p.geom_type == "Point"])
    if len(tact_xy):
        tree_tact = cKDTree(tact_xy)
        dists_tact, _ = tree_tact.query(mid_xy)
        tact_bonus = (dists_tact < 20).astype(float) * 0.05
        edges_df["surface_quality"] = (edges_df["surface_quality"] + tact_bonus).clip(0, 1).round(4)


# ── 3e. BAILOUT PROXIMITY (transit stops) ────────────────────────────────────
print("  [bailout_proximity]")

transit_pts = []
for key in ["bus_stops", "tram_stops", "taxi_ranks", "bike_share"]:
    gd = gdf[key]
    if not gd.empty:
        pts = gd[gd.geometry.geom_type == "Point"].geometry
        transit_pts.extend([(p.x, p.y) for p in pts])

if transit_pts:
    tree_transit = cKDTree(np.array(transit_pts))
    dists_transit, _ = tree_transit.query(mid_xy)
    edges_df["bailout_dist_m"] = dists_transit.round(1)
    # 0m = score 1.0, 500m = score 0.0 (linear decay)
    edges_df["bailout_proximity"] = (1 - (dists_transit / 500).clip(0, 1)).round(4)
else:
    edges_df["bailout_dist_m"]    = 9999.0
    edges_df["bailout_proximity"] = 0.3


# ── 3f. OPEN VENUES 168-VECTOR ────────────────────────────────────────────────
print("  [open_venues 168-vector]")

venue_pts = []
for key in ["cafes", "bars", "live_music"]:
    gd = gdf[key]
    if not gd.empty:
        pts = gd[gd.geometry.geom_type == "Point"].geometry
        venue_pts.extend([(p.x, p.y) for p in pts])

# Business establishments — filter to food/hospitality/retail ANZSIC
biz = gdf["business"]
if not biz.empty:
    anzsic_col = next((c for c in biz.columns if "anzsic" in c.lower() or "industry" in c.lower()), None)
    if anzsic_col:
        active_biz = biz[biz[anzsic_col].astype(str).str.contains(
            "cafe|coffee|restaurant|bar|hotel|retail|shop|food|beverage",
            case=False, na=False
        )]
        pts = active_biz[active_biz.geometry.geom_type == "Point"].geometry
        venue_pts.extend([(p.x, p.y) for p in pts])

# Typical open hours model (168-vector template per venue type):
# hour_open[h] = fraction of venues open at hour h
# Modelled from Melbourne typical trading hours
def venue_open_vector() -> list:
    """Returns 168-slot vector: fraction of venues open at (dow, hour)."""
    vec = []
    for dow in range(7):
        for h in range(24):
            is_weekend = dow >= 5
            if is_weekend:
                frac = (0.8 if 9 <= h <= 23
                        else 0.3 if h == 0
                        else 0.1)
            else:
                frac = (0.9 if 7 <= h <= 21
                        else 0.4 if 22 <= h <= 23
                        else 0.1)
            vec.append(frac)
    return vec

OPEN_TEMPLATE = np.array(venue_open_vector())  # (168,)

if venue_pts:
    venue_xy  = np.array(venue_pts)
    tree_ven  = cKDTree(venue_xy)
    # Count venues within 100m of each edge midpoint
    counts    = np.array([len(tree_ven.query_ball_point(pt, r=100)) for pt in mid_xy], dtype=float)
    cnt_norm  = normalize(pd.Series(counts)).values  # (N_edges,)
    # Multiply density by open-hours template → (N_edges, 168)
    open_vec  = np.outer(cnt_norm, OPEN_TEMPLATE).round(4)
    edges_df["open_venues_168"]  = list(open_vec.tolist())
    edges_df["venue_count_100m"] = counts.astype(int)
else:
    edges_df["open_venues_168"]  = [[0.2] * 168] * len(edges_df)
    edges_df["venue_count_100m"] = 0


# ── 3g. CANOPY (trees) ────────────────────────────────────────────────────────
print("  [canopy]")

trees = gdf["trees"]
if not trees.empty:
    tree_pts = trees[trees.geometry.geom_type == "Point"].copy()
    # Use canopy diameter if available, else crown spread
    diam_col = next((c for c in tree_pts.columns
                     if any(x in c.lower() for x in ["canopy", "crown", "spread", "diam"])), None)
    if diam_col:
        tree_pts["diam"] = pd.to_numeric(tree_pts[diam_col], errors="coerce").fillna(4)
    else:
        tree_pts["diam"] = 4.0  # default 4m canopy

    tree_xy   = np.array([(p.x, p.y) for p in tree_pts.geometry])
    tree_diam = tree_pts["diam"].values
    tree_kd   = cKDTree(tree_xy)

    canopy_scores = []
    for pt in mid_xy:
        # Sum canopy area (πr²) within 30m
        idxs = tree_kd.query_ball_point(pt, r=30)
        area = sum(math.pi * (tree_diam[i] / 2) ** 2 for i in idxs)
        canopy_scores.append(area)

    edges_df["raw_canopy_m2"] = canopy_scores
    edges_df["canopy"]        = normalize(pd.Series(canopy_scores)).round(4)
else:
    edges_df["raw_canopy_m2"] = 0.0
    edges_df["canopy"]        = 0.3


# ─── STEP 4 : COMPOSITE SCORE ─────────────────────────────────────────────────

print("\n=== STEP 4: Computing composite score ===")

# Time-invariant composite (used for static heatmap coloring)
# Weights reflect CityStride product values
W = dict(lux=0.25, ped_count_peak=0.20, steepness=0.15,
         surface_quality=0.15, bailout_proximity=0.10,
         open_venues_peak=0.10, canopy=0.05)

# Peak ped count = Friday evening slot (slot 4*24+18 = 114)
FRI_EVE = 4 * 24 + 18

def get_slot(col168, slot):
    v = col168[slot] if isinstance(col168, list) else 0.3
    return v

edges_df["ped_peak"]  = edges_df["ped_count_168"].apply(lambda x: get_slot(x, FRI_EVE))
edges_df["venue_peak"]= edges_df["open_venues_168"].apply(lambda x: get_slot(x, FRI_EVE))

edges_df["composite"] = (
    W["lux"]               * edges_df["lux"]             +
    W["ped_count_peak"]    * edges_df["ped_peak"]         +
    W["steepness"]         * edges_df["steepness"]        +
    W["surface_quality"]   * edges_df["surface_quality"]  +
    W["bailout_proximity"] * edges_df["bailout_proximity"]+
    W["open_venues_peak"]  * edges_df["venue_peak"]       +
    W["canopy"]            * edges_df["canopy"]
).round(4)

print(f"  Score range: {edges_df['composite'].min():.3f} – {edges_df['composite'].max():.3f}")
print(f"  Score mean:  {edges_df['composite'].mean():.3f}")


# ─── STEP 5 : BUILD GEOCODER INDEX ────────────────────────────────────────────

print("\n=== STEP 5: Building geocoder index ===")

addr_gdf = gdf["street_addresses"]
geocoder = []

if not addr_gdf.empty:
    name_col = next((c for c in addr_gdf.columns
                     if "address" in c.lower() or "street" in c.lower()), None)
    if name_col:
        addr_geo = addr_gdf[addr_gdf.geometry.geom_type == "Point"].to_crs(EPSG_GEO)
        for _, row in addr_geo.iterrows():
            geocoder.append({
                "label": str(row.get(name_col, "")),
                "lat":   round(row.geometry.y, 6),
                "lng":   round(row.geometry.x, 6),
            })
    print(f"  {len(geocoder)} addresses indexed")
else:
    print("  Geocoder unavailable — address lookup will be degraded")


# ─── STEP 6 : ASSEMBLE & WRITE GRAPH ARTIFACT ─────────────────────────────────

print("\n=== STEP 6: Writing graph artifact ===")

def build_node_list(G_nx):
    nodes = []
    for n in G_nx.nodes():
        try:
            xy_str = n.strip("()").split(",")
            x, y   = float(xy_str[0]), float(xy_str[1])
            pt     = gpd.GeoSeries([Point(x, y)], crs=EPSG_PROJ).to_crs(EPSG_GEO).iloc[0]
            nodes.append({"id": n, "lat": round(pt.y, 6), "lng": round(pt.x, 6)})
        except Exception:
            nodes.append({"id": n, "lat": 0, "lng": 0})
    return nodes

edge_list = []
for _, row in edges_df.iterrows():
    edge_list.append({
        "id":          row["edge_id"],
        "u":           row["u"],
        "v":           row["v"],
        "length_m":    row["length_m"],
        "geometry":    row["geometry"],
        "street_name": row["street_name"],
        "mid_lat":     row["mid_lat"],
        "mid_lng":     row["mid_lng"],
        "metrics": {
            "lux":               row["lux"],
            "steepness":         row["steepness"],
            "surface_quality":   row["surface_quality"],
            "canopy":            row["canopy"],
            "bailout_proximity": row["bailout_proximity"],
            "ped_count_168":     row["ped_count_168"],
            "open_venues_168":   row["open_venues_168"],
            "composite":         row["composite"],
        },
        "raw": {
            "lux_avg":            row["raw_lux"],
            "gradient_pct":       row["raw_gradient_pct"],
            "canopy_m2":          row["raw_canopy_m2"],
            "bailout_dist_m":     row["bailout_dist_m"],
            "venue_count_100m":   row["venue_count_100m"],
            "nearest_sensor_m":   row["nearest_sensor_m"],
        }
    })

artifact = {
    "meta": {
        "built_at":   datetime.utcnow().isoformat() + "Z",
        "n_edges":    len(edge_list),
        "n_nodes":    G.number_of_nodes(),
        "n_geocoder": len(geocoder),
        "crs_source": EPSG_PROJ,
        "weights":    W,
    },
    "edges":    edge_list,
    "nodes":    build_node_list(G),
    "geocoder": geocoder,
}

OUT_FILE.write_text(json.dumps(artifact, separators=(",", ":")))
size_mb = OUT_FILE.stat().st_size / 1_048_576

print(f"\n  Written → {OUT_FILE}")
print(f"  Size:      {size_mb:.1f} MB")
print(f"  Edges:     {len(edge_list)}")
print(f"  Nodes:     {G.number_of_nodes()}")
print(f"  Geocoder:  {len(geocoder)} addresses")
print("\n  Done. Load graph_artifact.json at runtime startup.")
