import { createContext, useContext } from "react";

import type { GraphArtifact } from "~/lib/types";

const GraphContext = createContext<GraphArtifact | null>(null);

export const GraphProvider = GraphContext.Provider;

export const useGraph = (): GraphArtifact => {
  const graph = useContext(GraphContext);
  if (!graph) {
    throw new Error("useGraph must be used within a GraphProvider");
  }
  return graph;
};
