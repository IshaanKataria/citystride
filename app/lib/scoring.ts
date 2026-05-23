import type { EdgeMetrics } from "./types";

export const WEIGHTS = {
  lux: 0.25,
  ped_vector: 0.20,
  steepness: 0.10,
  surface: 0.10,
  canopy: 0.10,
  transit: 0.10,
  venues_vector: 0.15,
} as const;

export const ALPHA = 1.5;

export const computeScore = (metrics: EdgeMetrics, hourOfWeek: number): number => {
  return (
    WEIGHTS.lux * metrics.lux +
    WEIGHTS.ped_vector * metrics.ped_vector[hourOfWeek] +
    WEIGHTS.steepness * metrics.steepness +
    WEIGHTS.surface * metrics.surface +
    WEIGHTS.canopy * metrics.canopy +
    WEIGHTS.transit * metrics.transit +
    WEIGHTS.venues_vector * metrics.venues_vector[hourOfWeek]
  );
};

export const edgeCost = (lengthM: number, score: number): number => {
  return lengthM * (1 + ALPHA * (1 - score));
};
