import { computeScore } from "~/lib/scoring";
import type { GraphEdge } from "~/lib/types";

interface MapTooltipProps {
  readonly edge: GraphEdge;
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

export const MapTooltip = ({ edge, x, y, time }: MapTooltipProps) => {
  const score = computeScore(edge.metrics, time);

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg border border-border"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="font-medium">{edge.name}</div>
      <div className="text-muted-foreground">
        Score: {(score * 100).toFixed(0)}
      </div>
    </div>
  );
};
