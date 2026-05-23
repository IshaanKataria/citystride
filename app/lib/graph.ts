import { readFile } from "node:fs/promises";

import type { GraphArtifact } from "./types";

export { findNearestNode, getEdgesInBounds } from "./graph-search";

export const loadGraphArtifact = async (path: string): Promise<GraphArtifact> => {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as GraphArtifact;
};
