import type { EdgeWithMetrics } from "./metrics";

export const normalizeEdges = (edges: readonly EdgeWithMetrics[]): EdgeWithMetrics[] => {
  const maxLux = Math.max(...edges.map((e) => e.metrics.lux));
  const maxCanopy = Math.max(...edges.map((e) => e.metrics.canopy));
  const maxPedCount = Math.max(...edges.flatMap((e) => e.metrics.ped_count));

  console.log(`  Normalizing: maxLux=${maxLux.toFixed(2)}, maxCanopy=${maxCanopy.toFixed(2)}, maxPed=${maxPedCount.toFixed(0)}`);

  return edges.map((edge) => ({
    ...edge,
    metrics: {
      ...edge.metrics,
      lux: maxLux > 0 ? edge.metrics.lux / maxLux : 0,
      canopy: maxCanopy > 0 ? edge.metrics.canopy / maxCanopy : 0,
      ped_count: maxPedCount > 0
        ? edge.metrics.ped_count.map((v) => v / maxPedCount)
        : edge.metrics.ped_count,
    },
  }));
};
