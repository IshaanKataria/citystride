import type { EdgeMetrics } from "./types";

export interface WeightProfile {
  readonly lux: number;
  readonly ped_vector: number;
  readonly steepness: number;
  readonly surface: number;
  readonly canopy: number;
  readonly transit: number;
  readonly venues_vector: number;
}

export const WEIGHTS_DEFAULT: WeightProfile = {
  lux: 0.25,
  ped_vector: 0.20,
  venues_vector: 0.15,
  steepness: 0.10,
  surface: 0.10,
  canopy: 0.10,
  transit: 0.10,
};

export const WEIGHTS_LIVELY: WeightProfile = {
  lux: 0.15,
  ped_vector: 0.35,
  venues_vector: 0.35,
  steepness: 0.05,
  surface: 0.05,
  canopy: 0.05,
  transit: 0.00,
};

export const WEIGHTS_ACCESSIBLE: WeightProfile = {
  lux: 0.25,
  ped_vector: 0.00,
  venues_vector: 0.00,
  steepness: 0.50,
  surface: 0.25,
  canopy: 0.00,
  transit: 0.00,
};

// Keep WEIGHTS as alias for backwards compat with existing callers
export const WEIGHTS = WEIGHTS_DEFAULT;

export const ALPHA = 1.5;

export const timeBucketIndex = (hourOfWeek: number): number => {
  const hour = ((hourOfWeek % 24) + 24) % 24;
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  return 2;
};

export const metricForTime = (values: readonly number[] | undefined, hourOfWeek: number): number => {
  if (!values || values.length === 0) return 0;
  if (values.length <= 3) return values[timeBucketIndex(hourOfWeek)] ?? values[values.length - 1] ?? 0;
  return values[hourOfWeek] ?? values[((hourOfWeek % values.length) + values.length) % values.length] ?? 0;
};

export const computeScore = (
  metrics: EdgeMetrics,
  hourOfWeek: number,
  weights: WeightProfile = WEIGHTS_DEFAULT,
): number => {
  return (
    weights.lux * metrics.lux +
    weights.ped_vector * metricForTime(metrics.ped_vector, hourOfWeek) +
    weights.steepness * metrics.steepness +
    weights.surface * metrics.surface +
    weights.canopy * metrics.canopy +
    weights.transit * metrics.transit +
    weights.venues_vector * metricForTime(metrics.venues_vector, hourOfWeek)
  );
};

export const edgeCost = (lengthM: number, score: number, alpha: number = ALPHA): number => {
  return lengthM * (1 + alpha * (1 - score));
};
