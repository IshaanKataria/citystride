import { describe, it, expect } from "vitest";
import {
  computeScore,
  edgeCost,
  WEIGHTS_DEFAULT,
  WEIGHTS_LIVELY,
  WEIGHTS_ACCESSIBLE,
  ALPHA,
} from "./scoring";
import type { EdgeMetrics } from "./types";

const flatMetrics: EdgeMetrics = {
  lux: 1,
  steepness: 1,
  surface: 1,
  transit: 1,
  canopy: 1,
  ped_vector: [1, 1, 1],
  venues_vector: [1, 1, 1],
  ped_confidence: { nearest_sensor_m: null, sensor_count: 0, is_interpolated: false },
};

const steepMetrics: EdgeMetrics = {
  lux: 0.5,
  steepness: 0.0,
  surface: 0.5,
  transit: 0.5,
  canopy: 0.5,
  ped_vector: [0.5, 0.5, 0.5],
  venues_vector: [0.5, 0.5, 0.5],
  ped_confidence: { nearest_sensor_m: null, sensor_count: 0, is_interpolated: false },
};

describe("computeScore with custom weights", () => {
  it("returns 1.0 for perfect metrics with any weights", () => {
    expect(computeScore(flatMetrics, 0, WEIGHTS_DEFAULT)).toBeCloseTo(1.0);
    expect(computeScore(flatMetrics, 0, WEIGHTS_LIVELY)).toBeCloseTo(1.0);
    expect(computeScore(flatMetrics, 0, WEIGHTS_ACCESSIBLE)).toBeCloseTo(1.0);
  });

  it("WEIGHTS_ACCESSIBLE penalises steepness more than WEIGHTS_LIVELY", () => {
    const accessibleScore = computeScore(steepMetrics, 0, WEIGHTS_ACCESSIBLE);
    const livelyScore = computeScore(steepMetrics, 0, WEIGHTS_LIVELY);
    expect(accessibleScore).toBeLessThan(livelyScore);
  });

  it("WEIGHTS_LIVELY weights ped and venues more than WEIGHTS_ACCESSIBLE", () => {
    const highPedVenueMetrics: EdgeMetrics = {
      ...steepMetrics,
      ped_vector: [1, 1, 1],
      venues_vector: [1, 1, 1],
    };
    const livelyScore = computeScore(highPedVenueMetrics, 0, WEIGHTS_LIVELY);
    const accessibleScore = computeScore(highPedVenueMetrics, 0, WEIGHTS_ACCESSIBLE);
    expect(livelyScore).toBeGreaterThan(accessibleScore);
  });
});

describe("edgeCost with custom alpha", () => {
  it("alpha=0 returns pure length_m", () => {
    expect(edgeCost(100, 0.5, 0)).toBe(100);
    expect(edgeCost(200, 0.0, 0)).toBe(200);
  });

  it("alpha=ALPHA increases cost for low-score edges", () => {
    const goodCost = edgeCost(100, 1.0, ALPHA);
    const badCost = edgeCost(100, 0.0, ALPHA);
    expect(badCost).toBeGreaterThan(goodCost);
  });
});
