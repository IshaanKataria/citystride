import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { composite } from "../lib/scoring";

function formatDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`;
}

export function HoverTooltip() {
  const hoveredEdgeId = useStore((s) => s.hoveredEdgeId);
  const hoveredEventId = useStore((s) => s.hoveredEventId);
  const graph = useStore((s) => s.graph);
  const time = useStore((s) => s.time);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const hovering = hoveredEdgeId || hoveredEventId;

  useEffect(() => {
    if (!hovering) {
      setPos(null);
      return;
    }
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [hovering]);

  if (!hovering || !graph || !pos) return null;

  // Event hover takes precedence (markers sit above edges in deck.gl picking order).
  if (hoveredEventId) {
    const event = graph.events?.find((e) => e.id === hoveredEventId);
    if (!event) return null;
    return (
      <div
        className="hover-tooltip"
        style={{ left: pos.x + 14, top: pos.y + 14 }}
      >
        <div className="hover-street">{event.name}</div>
        <div className="hover-score">
          {formatDateRange(event.start_date, event.end_date)}
        </div>
      </div>
    );
  }

  const edge = graph.edges.find((e) => e.id === hoveredEdgeId);
  if (!edge) return null;
  const score = composite(edge, time);

  return (
    <div
      className="hover-tooltip"
      style={{ left: pos.x + 14, top: pos.y + 14 }}
    >
      <div className="hover-street">{edge.street_name}</div>
      <div className="hover-score">{(score * 100).toFixed(0)} streetscore</div>
    </div>
  );
}
