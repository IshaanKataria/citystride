import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { composite } from "../lib/scoring";

export function HoverTooltip() {
  const hoveredEdgeId = useStore((s) => s.hoveredEdgeId);
  const graph = useStore((s) => s.graph);
  const time = useStore((s) => s.time);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hoveredEdgeId) {
      setPos(null);
      return;
    }
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [hoveredEdgeId]);

  if (!hoveredEdgeId || !graph || !pos) return null;

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
