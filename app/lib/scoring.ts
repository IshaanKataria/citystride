import type { EdgeMetrics } from "./types";

export const WEIGHTS = {
  lux: 0.25,
  ped_count: 0.20,
  gentle_gradient: 0.10,
  surface_quality: 0.10,
  canopy: 0.10,
  bailout_proximity: 0.10,
  open_venues: 0.15,
} as const;

export const ALPHA = 1.5;

export const computeScore = (metrics: EdgeMetrics, hourOfWeek: number): number => {
  return (
    WEIGHTS.lux * metrics.lux +
    WEIGHTS.ped_count * metrics.ped_count[hourOfWeek] +
    WEIGHTS.gentle_gradient * metrics.gentle_gradient +
    WEIGHTS.surface_quality * metrics.surface_quality +
    WEIGHTS.canopy * metrics.canopy +
    WEIGHTS.bailout_proximity * metrics.bailout_proximity +
    WEIGHTS.open_venues * metrics.open_venues[hourOfWeek]
  );
};

export const edgeCost = (lengthM: number, score: number): number => {
  return lengthM * (1 + ALPHA * (1 - score));
};
