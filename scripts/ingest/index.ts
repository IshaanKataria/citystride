import { fetchAllDatasets } from "./datasets";
import { buildNetwork } from "./network";
import { computeEdgeMetrics, parseSensorCounts } from "./metrics";
import { normalizeEdges } from "./normalize";
import { parseAddresses, writeGraphArtifact } from "./output";
import type { GraphArtifact } from "../../app/lib/types";

const run = async (): Promise<void> => {
  console.log("=== CityStride Ingestion Pipeline ===\n");

  const datasets = await fetchAllDatasets();

  console.log("\nBuilding pedestrian network...");
  const { nodes, edges } = buildNetwork(datasets.pedestrianNetwork);

  console.log("\nParsing sensor data...");
  const sensors = parseSensorCounts(
    datasets.pedestrianCounting,
    datasets.pedestrianCounts,
  );

  console.log("\nComputing edge metrics...");
  const edgesWithMetrics = computeEdgeMetrics(
    edges,
    datasets.streetLights,
    datasets.trees,
    datasets.footpathQuality,
    datasets.tramStops,
    sensors,
  );

  console.log("\nNormalizing metrics...");
  const normalizedEdges = normalizeEdges(edgesWithMetrics);

  console.log("\nParsing addresses...");
  const addresses = parseAddresses(datasets.streetAddresses, nodes);

  console.log("\nWriting graph artifact...");
  const lngs = nodes.map((n) => n.lng);
  const lats = nodes.map((n) => n.lat);

  const artifact: GraphArtifact = {
    nodes,
    edges: normalizedEdges,
    addresses,
    bounds: {
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
    },
  };

  await writeGraphArtifact(artifact);

  console.log("\n=== Pipeline complete ===");
  console.log(`  ${nodes.length} nodes`);
  console.log(`  ${normalizedEdges.length} edges`);
  console.log(`  ${addresses.length} addresses`);
};

run().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
