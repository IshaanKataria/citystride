import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { GraphArtifact, GraphEdge } from "../app/lib/types";

const TIME_BUCKETS = ["morning", "afternoon", "evening"] as const;

const bucketForHour = (hour: number): number => {
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  return 2;
};

const compactVector = (values: readonly number[] | undefined): readonly number[] => {
  if (!values || values.length === 0) return [0, 0, 0];
  if (values.length <= TIME_BUCKETS.length) return values;

  const sums = [0, 0, 0];
  const counts = [0, 0, 0];

  for (let i = 0; i < values.length; i++) {
    const bucket = bucketForHour(i % 24);
    sums[bucket] += values[i] ?? 0;
    counts[bucket] += 1;
  }

  return sums.map((sum, index) => Number((sum / Math.max(1, counts[index])).toFixed(4)));
};

const compactEdge = (edge: GraphEdge): GraphEdge => {
  const { metrics } = edge;
  return {
    ...edge,
    metrics: {
      lux: metrics.lux,
      steepness: metrics.steepness,
      surface: metrics.surface,
      transit: metrics.transit,
      canopy: metrics.canopy,
      ped_vector: compactVector(metrics.ped_vector),
      venues_vector: compactVector(metrics.venues_vector),
      ped_confidence: metrics.ped_confidence,
    },
  };
};

const formatSize = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const run = async () => {
  const inputPath = process.argv[2] ?? join(process.cwd(), "data", "graph.json");
  const outputPath = process.argv[3] ?? join(process.cwd(), "public", "graph.json");
  const before = await stat(inputPath);

  console.log(`Reading ${inputPath} (${formatSize(before.size)})`);
  const graph = JSON.parse(await readFile(inputPath, "utf-8")) as GraphArtifact;

  const compacted: GraphArtifact = {
    ...graph,
    meta: {
      ...graph.meta,
      time_buckets: TIME_BUCKETS,
    },
    edges: graph.edges.map(compactEdge),
  };

  await writeFile(outputPath, JSON.stringify(compacted), "utf-8");

  const after = await stat(outputPath);
  const savedPct = ((1 - after.size / before.size) * 100).toFixed(1);
  console.log(`Wrote ${outputPath} (${formatSize(after.size)}, ${savedPct}% smaller)`);
};

run().catch((err) => {
  console.error("Graph compaction failed:", err);
  process.exit(1);
});
