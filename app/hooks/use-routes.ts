import { useCallback, useState } from "react";

import { computeRoutes } from "~/lib/routing";
import type { GraphArtifact, Route } from "~/lib/types";

interface UseRoutesResult {
  readonly routes: readonly Route[] | null;
  readonly isComputing: boolean;
  readonly compute: (fromNode: string, toNode: string, hourOfWeek: number) => void;
  readonly clear: () => void;
  readonly computedAt: number | null;
}

export const useRouteComputation = (graph: GraphArtifact): UseRoutesResult => {
  const [routes, setRoutes] = useState<readonly Route[] | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [computedAt, setComputedAt] = useState<number | null>(null);

  const compute = useCallback(
    (fromNode: string, toNode: string, hourOfWeek: number) => {
      setIsComputing(true);
      requestAnimationFrame(() => {
        const result = computeRoutes(graph.nodes, graph.edges, fromNode, toNode, hourOfWeek);
        setRoutes(result);
        setComputedAt(hourOfWeek);
        setIsComputing(false);
      });
    },
    [graph],
  );

  const clear = useCallback(() => {
    setRoutes(null);
    setComputedAt(null);
  }, []);

  return { routes, isComputing, compute, clear, computedAt };
};
