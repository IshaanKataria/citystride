import { useState, useCallback } from "react";

import { INITIAL_HOUR_OF_WEEK } from "~/lib/time";
import type { AppState, Mode, Route } from "~/lib/types";

const INITIAL_STATE: AppState = {
  viewport: { lng: 144.963, lat: -37.814, zoom: 15 },
  time: INITIAL_HOUR_OF_WEEK,
  routeQuery: null,
  routes: null,
  routeComputedAt: null,
  pinnedSegmentId: null,
  openExplanationRouteId: null,
  mode: "walk",
  selectedEventId: null,
};

export const useAppState = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);

  const setTime = useCallback((time: number) => {
    setState((prev) => ({ ...prev, time }));
  }, []);

  const setPinnedSegment = useCallback((pinnedSegmentId: string | null) => {
    setState((prev) => ({ ...prev, pinnedSegmentId }));
  }, []);

  const setRoutes = useCallback((routes: readonly Route[], computedAt: number) => {
    setState((prev) => ({
      ...prev,
      routes,
      routeComputedAt: computedAt,
    }));
  }, []);

  const clearRoutes = useCallback(() => {
    setState((prev) => ({
      ...prev,
      routes: null,
      routeQuery: null,
      routeComputedAt: null,
      selectedEventId: null,
    }));
  }, []);

  const setRouteQuery = useCallback(
    (query: AppState["routeQuery"]) => {
      setState((prev) => ({ ...prev, routeQuery: query }));
    },
    [],
  );

  const setOpenExplanation = useCallback((routeId: number | null) => {
    setState((prev) => ({ ...prev, openExplanationRouteId: routeId }));
  }, []);

  const setMode = useCallback((mode: Mode) => {
    setState((prev) => ({
      ...prev,
      mode,
      routes: null,
      routeQuery: null,
      routeComputedAt: null,
      selectedEventId: null,
      openExplanationRouteId: null,
      pinnedSegmentId: null,
    }));
  }, []);

  const setSelectedEvent = useCallback((selectedEventId: string | null) => {
    setState((prev) => ({ ...prev, selectedEventId }));
  }, []);

  const isStale =
    state.routes !== null &&
    state.routeComputedAt !== null &&
    state.routeComputedAt !== state.time;

  return {
    state,
    setTime,
    setPinnedSegment,
    setRoutes,
    clearRoutes,
    setRouteQuery,
    setOpenExplanation,
    setMode,
    setSelectedEvent,
    isStale,
  };
};
