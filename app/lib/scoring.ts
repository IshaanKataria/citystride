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

export const computeScore = (metrics: EdgeMetrics, hourOfWeek: number): number => {
  return (
    WEIGHTS.lux * metrics.lux +
    WEIGHTS.ped_vector * metricForTime(metrics.ped_vector, hourOfWeek) +
    WEIGHTS.steepness * metrics.steepness +
    WEIGHTS.surface * metrics.surface +
    WEIGHTS.canopy * metrics.canopy +
    WEIGHTS.transit * metrics.transit +
    WEIGHTS.venues_vector * metricForTime(metrics.venues_vector, hourOfWeek)
  );
};

export const edgeCost = (lengthM: number, score: number): number => {
  return lengthM * (1 + ALPHA * (1 - score));
};
