import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { describeSegment } from "../lib/api";
import type { DescribeSegmentResponse } from "../../../shared/types";

const METRIC_LABELS: Record<string, string> = {
  lux: "Lighting",
  gentle_gradient: "Gentle gradient",
  surface_quality: "Surface quality",
  canopy: "Canopy",
  bailout_proximity: "Transit nearby",
  ped_count: "Foot traffic",
  open_venues: "Open venues",
};

export function InspectorCard() {
  const pinnedSegmentId = useStore((s) => s.pinnedSegmentId);
  const time = useStore((s) => s.time);
  const setPinned = useStore((s) => s.setPinnedSegment);
  const [data, setData] = useState<DescribeSegmentResponse | null>(null);

  useEffect(() => {
    if (!pinnedSegmentId) {
      setData(null);
      return;
    }
    describeSegment(pinnedSegmentId, time).then(setData).catch(console.error);
  }, [pinnedSegmentId, time]);

  if (!pinnedSegmentId || !data) return null;

  return (
    <div className="panel inspector">
      <button className="close" onClick={() => setPinned(null)}>
        x
      </button>
      <div className="inspector-street">{data.street_name}</div>
      <div className="inspector-score-row">
        <span className="inspector-score">
          {(data.composite_score * 100).toFixed(0)}
        </span>
        <span className="inspector-score-label">streetscore</span>
      </div>

      <div className="metrics">
        {Object.entries(data.metrics).map(([key, val]) => (
          <div key={key} className="metric-row">
            <span className="metric-label">{METRIC_LABELS[key] ?? key}</span>
            <div className="metric-bar">
              <div
                className="metric-bar-fill"
                style={{ width: `${val * 100}%` }}
              />
            </div>
            <span className="metric-val">{(val * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>

      {data.confidence.ped_count.distance_to_sensor_m > 200 && (
        <div className="confidence">
          Foot traffic estimated from sensor{" "}
          {data.confidence.ped_count.distance_to_sensor_m}m away.
        </div>
      )}
    </div>
  );
}
