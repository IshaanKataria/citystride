import { create } from "zustand";
import type { GraphArtifact, Route, LngLat } from "../../../shared/types";

type RouteQuery = {
  from: LngLat;
  to: LngLat;
  fromLabel: string;
  toLabel: string;
};

type Store = {
  graph: GraphArtifact | null;
  time: number;
  routeQuery: RouteQuery | null;
  routes: Route[] | null;
  routeComputedAt: number | null;
  pinnedSegmentId: string | null;
  openExplanationRouteId: number | null;
  hoveredEdgeId: string | null;

  setGraph: (g: GraphArtifact) => void;
  setTime: (t: number) => void;
  setRouteQuery: (q: RouteQuery | null) => void;
  setRoutes: (r: Route[] | null, computedAt?: number) => void;
  setPinnedSegment: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setOpenExplanation: (id: number | null) => void;
  clearRoutes: () => void;
};

export const useStore = create<Store>((set) => ({
  graph: null,
  time: 94,
  routeQuery: null,
  routes: null,
  routeComputedAt: null,
  pinnedSegmentId: null,
  openExplanationRouteId: null,
  hoveredEdgeId: null,

  setGraph: (graph) => set({ graph }),
  setTime: (time) => set({ time }),
  setRouteQuery: (routeQuery) => set({ routeQuery }),
  setRoutes: (routes, computedAt) =>
    set({ routes, routeComputedAt: computedAt ?? null }),
  setPinnedSegment: (pinnedSegmentId) => set({ pinnedSegmentId }),
  setHovered: (hoveredEdgeId) => set({ hoveredEdgeId }),
  setOpenExplanation: (openExplanationRouteId) =>
    set({ openExplanationRouteId }),
  clearRoutes: () =>
    set({ routes: null, routeComputedAt: null, routeQuery: null }),
}));
