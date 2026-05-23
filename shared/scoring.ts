import { WEIGHTS, ROUTING_ALPHA, type Edge } from "./types";

export { WEIGHTS, ROUTING_ALPHA };

export function composite(edge: Edge, hour: number): number {
  const h = Math.max(0, Math.min(167, Math.floor(hour)));
  const score =
    edge.lux * WEIGHTS.lux +
    edge.gentle_gradient * WEIGHTS.gentle_gradient +
    edge.surface_quality * WEIGHTS.surface_quality +
    edge.canopy * WEIGHTS.canopy +
    edge.bailout_proximity * WEIGHTS.bailout_proximity +
    edge.ped_count[h] * WEIGHTS.ped_count +
    edge.open_venues[h] * WEIGHTS.open_venues;
  return Math.max(0, Math.min(1, score));
}

export function edgeCost(edge: Edge, hour: number): number {
  return edge.length_m * (1 + ROUTING_ALPHA * (1 - composite(edge, hour)));
}
