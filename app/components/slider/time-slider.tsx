import { formatHourOfWeek } from "~/lib/time";

interface TimeSliderProps {
  readonly time: number;
  readonly onTimeChange: (time: number) => void;
  readonly isStale: boolean;
  readonly routeComputedAt: number | null;
  readonly onRecompute: () => void;
}

export const TimeSlider = ({
  time,
  onTimeChange,
  isStale,
  routeComputedAt,
  onRecompute,
}: TimeSliderProps) => {
  return (
    <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-gray-900/90 px-6 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-white min-w-[80px]">
          {formatHourOfWeek(time)}
        </span>
        <input
          type="range"
          min={0}
          max={167}
          value={time}
          onChange={(e) => onTimeChange(parseInt(e.target.value, 10))}
          className="w-64 accent-primary"
        />
      </div>
      {isStale && routeComputedAt !== null && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Routes computed for {formatHourOfWeek(routeComputedAt)}</span>
          <button
            onClick={onRecompute}
            className="text-primary underline hover:text-primary/80"
          >
            Recompute
          </button>
        </div>
      )}
    </div>
  );
};
