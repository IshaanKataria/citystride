import { useMemo } from "react";
import { useStore } from "../state/store";
import { formatTime } from "../lib/scoring";

function sliderDayOfWeek(time: number): number {
  return Math.floor(time / 24);
}

function dateDayOfWeek(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  return (d.getUTCDay() + 6) % 7;
}

function eventActiveAt(start: string, end: string, sliderDay: number): boolean {
  const s = dateDayOfWeek(start);
  const e = dateDayOfWeek(end);
  if (s <= e) return sliderDay >= s && sliderDay <= e;
  return sliderDay >= s || sliderDay <= e;
}

export function TimeSlider() {
  const time = useStore((s) => s.time);
  const setTime = useStore((s) => s.setTime);
  const mode = useStore((s) => s.mode);
  const graph = useStore((s) => s.graph);

  const activeEventCount = useMemo(() => {
    if (mode !== "event" || !graph?.events) return 0;
    const day = sliderDayOfWeek(time);
    return graph.events.filter((e) =>
      eventActiveAt(e.start_date, e.end_date, day),
    ).length;
  }, [mode, graph, time]);

  return (
    <div className="panel panel-bottom">
      {mode === "event" && (
        <div className="time-filter-pill">
          {activeEventCount === 0
            ? "No events at this time — try another moment."
            : `${activeEventCount} event${activeEventCount === 1 ? "" : "s"} at ${formatTime(time)}`}
        </div>
      )}
      <div className="time-readout">{formatTime(time)}</div>
      <input
        type="range"
        min={0}
        max={167}
        value={time}
        onChange={(e) => setTime(Number(e.target.value))}
        className="time-slider"
      />
    </div>
  );
}
