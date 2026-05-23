import { lazy, Suspense, useState, useEffect } from "react";
import { useLoaderData } from "react-router";

import { InspectorCard } from "~/components/inspector/inspector-card";
import { ScoreLegend } from "~/components/legend/score-legend";
import { PlanWalkPanel } from "~/components/planner/plan-walk-panel";
import { TimeSlider } from "~/components/slider/time-slider";
import { GhostTabs } from "~/components/ghosts/ghost-tabs";
import { GraphProvider } from "~/hooks/use-graph";
import { useAppState } from "~/hooks/use-app-state";
import { useRouteComputation } from "~/hooks/use-routes";
import { loadGraphArtifact } from "~/lib/graph";
import type { GraphArtifact, GraphEdge } from "~/lib/types";

const LazyCityMap = lazy(() =>
  import("~/components/map/city-map").then((m) => ({ default: m.CityMap }))
);
const LazyExplainSlideOut = lazy(() =>
  import("~/components/explain/explain-slide-out").then((m) => ({ default: m.ExplainSlideOut }))
);

const useIsClient = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);
  return isClient;
};

export const loader = async () => {
  try {
    const graph = await loadGraphArtifact("data/graph.json");
    return { graph };
  } catch {
    return { graph: null };
  }
};

const NoDataView = () => (
  <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-950 text-white gap-4">
    <h1 className="text-3xl font-bold">CityStride</h1>
    <p className="text-muted-foreground text-center max-w-md">
      No graph data found. Run <code className="bg-gray-800 px-2 py-0.5 rounded text-sm">npm run ingest</code> to
      fetch City of Melbourne data and build the graph artifact.
    </p>
  </div>
);

const MapWithData = ({ graph }: { graph: GraphArtifact }) => {
  const {
    state,
    setTime,
    setPinnedSegment,
    setOpenExplanation,
    isStale,
  } = useAppState();
  const { routes, isComputing, compute, clear, computedAt } = useRouteComputation(graph);

  const pinnedEdge = state.pinnedSegmentId
    ? (graph.edges.find((e) => e.id === state.pinnedSegmentId) ?? null)
    : null;

  const handleClickSegment = (edge: GraphEdge | null) => {
    setPinnedSegment(edge?.id ?? null);
  };

  const handleFindRoute = (fromNode: string, toNode: string) => {
    compute(fromNode, toNode, state.time);
  };

  const handleRecompute = () => {
    if (state.routeQuery) {
      compute(state.routeQuery.fromNode, state.routeQuery.toNode, state.time);
    }
  };

  const openExplanationRoute = state.openExplanationRouteId !== null && routes
    ? (routes.find((r) => r.id === state.openExplanationRouteId) ?? null)
    : null;

  const isClient = useIsClient();

  return (
    <GraphProvider value={graph}>
      <div className="relative h-screen w-screen overflow-hidden bg-gray-950">
        {isClient ? (
          <Suspense fallback={<div className="absolute inset-0 bg-gray-950" />}>
            <LazyCityMap
              time={state.time}
              routes={routes}
              pinnedSegmentId={state.pinnedSegmentId}
              onHoverSegment={() => {}}
              onClickSegment={handleClickSegment}
            />
          </Suspense>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
            <p className="text-muted-foreground">Loading map...</p>
          </div>
        )}

        <GhostTabs />
        <ScoreLegend />

        <PlanWalkPanel
          routes={routes}
          isComputing={isComputing}
          onFindRoute={handleFindRoute}
          onClear={clear}
          onExplain={(routeId) => setOpenExplanation(routeId)}
        />

        <TimeSlider
          time={state.time}
          onTimeChange={setTime}
          isStale={isStale}
          routeComputedAt={computedAt}
          onRecompute={handleRecompute}
        />

        {pinnedEdge && (
          <InspectorCard
            edge={pinnedEdge}
            time={state.time}
            onClose={() => setPinnedSegment(null)}
          />
        )}

        {isClient && openExplanationRoute && (
          <Suspense fallback={null}>
            <LazyExplainSlideOut
              route={openExplanationRoute}
              time={state.time}
              onClose={() => setOpenExplanation(null)}
            />
          </Suspense>
        )}
      </div>
    </GraphProvider>
  );
};

const IndexRoute = () => {
  const { graph } = useLoaderData<{ graph: GraphArtifact | null }>();

  if (!graph) {
    return <NoDataView />;
  }

  return <MapWithData graph={graph} />;
};

export default IndexRoute;
