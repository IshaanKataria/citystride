import type { Event } from "~/lib/types";
import { activeEventsAt } from "~/lib/events";

interface EventListPanelProps {
  readonly events: readonly Event[];
  readonly time: number;
  readonly selectedEventId: string | null;
  readonly onEventSelect: (ev: Event) => void;
}

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

export const EventListPanel = ({
  events,
  time,
  selectedEventId,
  onEventSelect,
}: EventListPanelProps) => {
  const active = activeEventsAt(events, time);

  return (
    <div className="absolute left-4 top-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur max-h-[60vh] overflow-y-auto">
      <h2 className="text-sm font-semibold text-white mb-1">What's on</h2>
      <p className="text-xs text-gray-400 mb-3">
        {active.length} {active.length === 1 ? "event" : "events"} today
      </p>
      {active.length === 0 && (
        <p className="text-xs text-gray-500">No events scheduled for this day.</p>
      )}
      <ul className="space-y-2">
        {active.map((ev) => (
          <li key={ev.id}>
            <button
              onClick={() => onEventSelect(ev)}
              className={`w-full text-left rounded-md p-2 transition-colors ${
                ev.id === selectedEventId
                  ? "bg-amber-500/20 ring-1 ring-amber-500/50"
                  : "hover:bg-white/5"
              }`}
            >
              <div className="text-sm text-white font-medium leading-tight">{ev.name}</div>
              <div className="text-xs text-gray-400 mt-1">{ev.venue_name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {formatDateRange(ev.start_date, ev.end_date)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
