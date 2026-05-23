import { loadGraphArtifact } from "~/lib/graph";
import { join } from "node:path";

export const loader = async () => {
  try {
    const graphPath = join(process.cwd(), "data", "graph.json");
    const graph = await loadGraphArtifact(graphPath);
    return Response.json(graph);
  } catch (err) {
    console.error("Failed to load graph:", err);
    return Response.json(null);
  }
};
