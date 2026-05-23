import { useEffect, useMemo } from "react";
import { useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useStore } from "../state/store";
import { planWalk } from "../lib/api";
import type { Event, LngLat } from "../../../shared/types";

const FLINDERS: LngLat = [144.967, -37.8183];

// Day-of-week index for the slider time (0 = Mon, 6 = Sun).
// Slider hour-of-week 0-167; div by 24 → day-of-week starting Monday.
function sliderDayOfWeek(time: number): number {
  return Math.floor(time / 24);
}

// Day-of-week (0=Mon..6=Sun) for an ISO date string "YYYY-MM-DD".
function dateDayOfWeek(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // 0=Mon..6=Sun
}

function eventActiveAt(ev: Event, sliderDay: number): boolean {
  const start = dateDayOfWeek(ev.start_date);
  const end = dateDayOfWeek(ev.end_date);
  if (start <= end) return sliderDay >= start && sliderDay <= end;
  // wraps the week (rare, but possible for ISO date ranges spanning weeks)
  return sliderDay >= start || sliderDay <= end;
}

export function EventMarkers() {
  const graph = useStore((s) => s.graph);
  const time = useStore((s) => s.time);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const setSelectedEvent = useStore((s) => s.setSelectedEvent);
  const setHoveredEvent = useStore((s) => s.setHoveredEvent);
  const setRouteQuery = useStore((s) => s.setRouteQuery);
  const setRoutes = useStore((s) => s.setRoutes);

  const overlay = useControl(
    () => new MapboxOverlay({ interleaved: false }),
  ) as unknown as MapboxOverlay;

  const activeEvents = useMemo(() => {
    if (!graph?.events) return [];
    const sliderDay = sliderDayOfWeek(time);
    return graph.events.filter((ev) => eventActiveAt(ev, sliderDay));
  }, [graph, time]);

  const layers = useMemo(() => {
    if (activeEvents.length === 0) return [];
    return [
      new ScatterplotLayer<Event>({
        id: "event-rings",
        data: activeEvents.filter((ev) => ev.id === selectedEventId),
        getPosition: (ev: Event) => [ev.position[0], ev.position[1]],
        getRadius: 16,
        getFillColor: [251, 191, 36, 60],
        getLineColor: [251, 191, 36, 230],
        getLineWidth: 2,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: false,
      }),
      new ScatterplotLayer<Event>({
        id: "event-markers",
        data: activeEvents,
        getPosition: (ev: Event) => [ev.position[0], ev.position[1]],
        getRadius: 8,
        getFillColor: [251, 191, 36, 240],
        getLineColor: [11, 15, 20, 230],
        getLineWidth: 2,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: true,
        onClick: (info: any) => {
          const ev = info.object as Event | undefined;
          if (!ev) return;
          setSelectedEvent(ev.id);
          setRouteQuery({
            from: FLINDERS,
            to: ev.position,
            fromLabel: "Flinders St Station",
            toLabel: ev.name,
          });
          void planWalk(FLINDERS, ev.position, time).then((res) => {
            setRoutes(res.routes, res.computed_at_time);
          }).catch((err: unknown) => {
            console.error("event planWalk failed:", err);
          });
        },
        onHover: (info: any) => {
          const ev = info.object as Event | undefined;
          setHoveredEvent(ev ? ev.id : null);
        },
      }),
    ];
  }, [activeEvents, selectedEventId, setSelectedEvent, setRouteQuery, setRoutes, setHoveredEvent, time]);

  useEffect(() => {
    overlay.setProps({ layers });
  }, [overlay, layers]);

  return null;
}
