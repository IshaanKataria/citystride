import { create } from "zustand";
import type { GraphArtifact, Route, LngLat } from "../../../shared/types";

type RouteQuery = {
  from: LngLat;
  to: LngLat;
  fromLabel: string;
  toLabel: string;
};

type Mode = "walk" | "event";

type Store = {
  graph: GraphArtifact | null;
  time: number;
  mode: Mode;
  selectedEventId: string | null;
  routeQuery: RouteQuery | null;
  routes: Route[] | null;
  routeComputedAt: number | null;
  pinnedSegmentId: string | null;
  openExplanationRouteId: number | null;
  hoveredEdgeId: string | null;
  hoveredEventId: string | null;

  setGraph: (g: GraphArtifact) => void;
  setTime: (t: number) => void;
  setMode: (m: Mode) => void;
  setSelectedEvent: (id: string | null) => void;
  setRouteQuery: (q: RouteQuery | null) => void;
  setRoutes: (r: Route[] | null, computedAt?: number) => void;
  setPinnedSegment: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setHoveredEvent: (id: string | null) => void;
  setOpenExplanation: (id: number | null) => void;
  clearRoutes: () => void;
};

export const useStore = create<Store>((set) => ({
  graph: null,
  time: 94,
  mode: "walk",
  selectedEventId: null,
  routeQuery: null,
  routes: null,
  routeComputedAt: null,
  pinnedSegmentId: null,
  openExplanationRouteId: null,
  hoveredEdgeId: null,
  hoveredEventId: null,

  setGraph: (graph) => set({ graph }),
  setTime: (time) => set({ time }),
  setMode: (mode) => set({ mode }),
  setSelectedEvent: (selectedEventId) => set({ selectedEventId }),
  setRouteQuery: (routeQuery) => set({ routeQuery }),
  setRoutes: (routes, computedAt) =>
    set({ routes, routeComputedAt: computedAt ?? null }),
  setPinnedSegment: (pinnedSegmentId) => set({ pinnedSegmentId }),
  setHovered: (hoveredEdgeId) => set({ hoveredEdgeId }),
  setHoveredEvent: (hoveredEventId) => set({ hoveredEventId }),
  setOpenExplanation: (openExplanationRouteId) =>
    set({ openExplanationRouteId }),
  clearRoutes: () =>
    set({
      routes: null,
      routeComputedAt: null,
      routeQuery: null,
      selectedEventId: null,
    }),
}));
