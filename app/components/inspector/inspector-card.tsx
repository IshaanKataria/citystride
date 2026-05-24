import { computeScore, metricForTime } from "~/lib/scoring";
import type { GraphEdge } from "~/lib/types";

interface InspectorCardProps {
  readonly edge: GraphEdge;
  readonly time: number;
  readonly onClose: () => void;
}

interface MetricBarProps {
  readonly label: string;
  readonly value: number;
  readonly rawLabel: string;
}

const MetricBar = ({ label, value, rawLabel }: MetricBarProps) => (
  <div className="flex items-center gap-2">
    <span className="w-24 text-xs text-muted-foreground">{label}</span>
    <div className="flex-1 h-2 rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${(value * 100).toFixed(0)}%` }}
      />
    </div>
    <span className="w-20 text-xs text-right text-muted-foreground">{rawLabel}</span>
  </div>
);

export const InspectorCard = ({ edge, time, onClose }: InspectorCardProps) => {
  const score = computeScore(edge.metrics, time);
  const m = edge.metrics;

  return (
    <div className="absolute bottom-24 left-4 z-30 w-72 rounded-lg bg-card/95 p-4 shadow-lg backdrop-blur border border-border">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-card-foreground">{edge.name}</h3>
          <p className="text-sm text-primary">{(score * 100).toFixed(0)} / 100</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">
          &times;
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <MetricBar label="Lighting" value={m.lux} rawLabel={`${(m.lux * 100).toFixed(0)}%`} />
        <MetricBar
          label="Foot traffic"
          value={metricForTime(m.ped_vector, time)}
          rawLabel={`${(metricForTime(m.ped_vector, time) * 100).toFixed(0)}%`}
        />
        <MetricBar label="Steepness" value={m.steepness} rawLabel={`${(m.steepness * 100).toFixed(0)}%`} />
        <MetricBar label="Surface" value={m.surface} rawLabel={`${(m.surface * 100).toFixed(0)}%`} />
        <MetricBar label="Canopy" value={m.canopy} rawLabel={`${(m.canopy * 100).toFixed(0)}%`} />
        <MetricBar label="Transit" value={m.transit} rawLabel={`${(m.transit * 100).toFixed(0)}%`} />
        <MetricBar
          label="Venues"
          value={metricForTime(m.venues_vector, time)}
          rawLabel={`${(metricForTime(m.venues_vector, time) * 100).toFixed(0)}%`}
        />
      </div>

      {m.ped_confidence.nearest_sensor_m !== null && m.ped_confidence.nearest_sensor_m > 150 && (
        <p className="mt-2 text-xs text-muted-foreground/60">
          Estimated: {m.ped_confidence.nearest_sensor_m}m to nearest sensor
        </p>
      )}
    </div>
  );
};
