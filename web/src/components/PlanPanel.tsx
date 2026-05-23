import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { planWalk } from "../lib/api";
import { formatTime } from "../lib/scoring";
import type { LngLat } from "../../../shared/types";
import { ExplainPane } from "./ExplainPane";

const FLINDERS: LngLat = [144.967, -37.8183];
const CARLTON: LngLat = [144.9712, -37.8054];

export function PlanPanel() {
  const time = useStore((s) => s.time);
  const mode = useStore((s) => s.mode);
  const routes = useStore((s) => s.routes);
  const routeComputedAt = useStore((s) => s.routeComputedAt);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const setSelectedEvent = useStore((s) => s.setSelectedEvent);
  const setRoutes = useStore((s) => s.setRoutes);
  const setRouteQuery = useStore((s) => s.setRouteQuery);
  const clearRoutes = useStore((s) => s.clearRoutes);
  const graph = useStore((s) => s.graph);

  const [fromLabel, setFromLabel] = useState("Flinders St Station");
  const [toLabel, setToLabel] = useState("Carlton Gardens");
  const [loading, setLoading] = useState(false);

  const selectedEvent =
    selectedEventId && graph?.events
      ? graph.events.find((e) => e.id === selectedEventId)
      : undefined;

  useEffect(() => {
    if (selectedEvent) setToLabel(selectedEvent.name);
  }, [selectedEvent]);

  const compute = async () => {
    setLoading(true);
    try {
      setRouteQuery({ from: FLINDERS, to: CARLTON, fromLabel, toLabel });
      const res = await planWalk(FLINDERS, CARLTON, time);
      setRoutes(res.routes, res.computed_at_time);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const recomputeAtCurrentTime = async () => {
    if (selectedEvent) {
      setLoading(true);
      try {
        const res = await planWalk(FLINDERS, selectedEvent.position, time);
        setRoutes(res.routes, res.computed_at_time);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      compute();
    }
  };

  const clearEventSelection = () => {
    setSelectedEvent(null);
    setToLabel("Carlton Gardens");
    clearRoutes();
  };

  const isStale =
    routes !== null && routeComputedAt !== null && routeComputedAt !== time;

  return (
    <div className="panel panel-top-left">
      <div className="brand">CityStride</div>
      <div className="subtitle">Walk by what's lit, lively, and gentle.</div>

      <div className="addr-group">
        <input
          className="addr"
          value={fromLabel}
          onChange={(e) => setFromLabel(e.target.value)}
          placeholder="From"
        />
        {selectedEvent ? (
          <div className="addr addr-locked">
            <span>{selectedEvent.name}</span>
            <button
              className="addr-clear"
              title="Clear event"
              onClick={clearEventSelection}
            >
              ×
            </button>
          </div>
        ) : (
          <input
            className="addr"
            value={toLabel}
            onChange={(e) => setToLabel(e.target.value)}
            placeholder="To"
          />
        )}
      </div>

      {mode === "walk" && (
        <button className="primary" onClick={compute} disabled={loading}>
          {loading ? "Finding..." : "Find route"}
        </button>
      )}

      {mode === "event" && !selectedEvent && (
        <div className="event-hint">Click an event marker on the map.</div>
      )}

      {routes && routes.length > 0 && (
        <div className="routes">
          {routes.map((r, idx) => (
            <div key={r.id} className={`route-row route-${idx + 1}`}>
              <span className="route-badge">{r.id}</span>
              <span className="route-meta">
                {r.id === 1 ? "Recommended  " : ""}
                {(r.avg_score * 100).toFixed(0)} score
                {"  ·  "}
                {(r.total_length_m / 1000).toFixed(2)} km
              </span>
              <button
                className="link explain-link"
                onClick={() => useStore.getState().setOpenExplanation(r.id)}
              >
                Explain
              </button>
            </div>
          ))}

          {isStale && (
            <div className="stale">
              <span>Routes computed for {formatTime(routeComputedAt ?? 0)}</span>
              <button onClick={recomputeAtCurrentTime} className="link">
                Recompute
              </button>
            </div>
          )}

          <button onClick={clearRoutes} className="link clear">
            Clear routes
          </button>
        </div>
      )}
      <ExplainPane />
    </div>
  );
}
