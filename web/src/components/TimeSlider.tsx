import { useStore } from "../state/store";
import { formatTime } from "../lib/scoring";

export function TimeSlider() {
  const time = useStore((s) => s.time);
  const setTime = useStore((s) => s.setTime);

  return (
    <div className="panel panel-bottom">
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
