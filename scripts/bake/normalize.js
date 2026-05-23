/**
 * Normalizes all raw metrics to 0-1 positive-framed scale.
 * Higher = better for every metric (inversions happen here, never at runtime).
 */

export function normalizeAll(edges) {
  console.log('  normalize: scaling all metrics to 0-1...');

  // --- lux: log scale, 0 lux → 0, 50+ lux → 1.0 ---
  const LUX_MAX = 50;
  for (const e of edges) {
    const lux = e.metrics.lux_raw ?? 0;
    // log1p gives nice curve: small values still register
    e.metrics.lux = Math.min(Math.log1p(lux) / Math.log1p(LUX_MAX), 1);
  }

  // --- ped_vector: normalize across all edges so the global max = 1.0 ---
  let globalPedMax = 1;
  for (const e of edges) {
    const v = e.metrics.ped_vector_raw ?? [];
    for (const val of v) { if (val > globalPedMax) globalPedMax = val; }
  }
  for (const e of edges) {
    e.metrics.ped_vector = (e.metrics.ped_vector_raw ?? new Array(168).fill(0))
      .map(v => Math.round((v / globalPedMax) * 1000) / 1000);
  }

  // --- steepness: 0% grade → 1.0, 10%+ → 0.0 (positive = flat) ---
  for (const e of edges) {
    const grade = e.metrics.grade_pct_raw ?? 0;
    e.metrics.steepness = Math.round(Math.max(0, 1 - grade / 10) * 1000) / 1000;
  }

  // --- surface: already computed as 0-1 score inside raw ---
  for (const e of edges) {
    e.metrics.surface = e.metrics.surface_raw?.score ?? 0.7;
  }

  // --- transit: nearest stop → score. 0m → 1.0, 400m+ → 0.0 ---
  const TRANSIT_MAX_M = 400;
  for (const e of edges) {
    const dist = e.metrics.transit_raw?.nearest_stop_m ?? TRANSIT_MAX_M;
    e.metrics.transit = Math.round(Math.max(0, 1 - dist / TRANSIT_MAX_M) * 1000) / 1000;
  }

  // --- venues_vector: normalize across all edges ---
  let globalVenueMax = 1;
  for (const e of edges) {
    const v = e.metrics.venues_vector_raw ?? [];
    for (const val of v) { if (val > globalVenueMax) globalVenueMax = val; }
  }
  for (const e of edges) {
    e.metrics.venues_vector = (e.metrics.venues_vector_raw ?? new Array(168).fill(0))
      .map(v => Math.round((v / globalVenueMax) * 1000) / 1000);
  }

  // --- canopy: 0 trees → 0.0, 10+ → 1.0 ---
  for (const e of edges) {
    e.metrics.canopy = Math.min((e.metrics.canopy_raw ?? 0) / 10, 1);
  }
}
