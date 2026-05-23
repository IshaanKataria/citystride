import type { Event } from "~/lib/types";

// Day-of-week index for the slider time (0 = Mon, 6 = Sun).
// Slider hour-of-week 0-167; div by 24 → day-of-week starting Monday.
export const sliderDayOfWeek = (time: number): number => {
  return Math.floor(time / 24);
};

// Day-of-week (0=Mon..6=Sun) for an ISO date string "YYYY-MM-DD".
export const dateDayOfWeek = (iso: string): number => {
  const d = new Date(iso + "T00:00:00Z");
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7;
};

export const eventActiveAt = (ev: Event, sliderDay: number): boolean => {
  const start = dateDayOfWeek(ev.start_date);
  const end = dateDayOfWeek(ev.end_date);
  if (start <= end) return sliderDay >= start && sliderDay <= end;
  // wraps the week
  return sliderDay >= start || sliderDay <= end;
};

export const activeEventsAt = (
  events: readonly Event[],
  time: number,
): readonly Event[] => {
  const day = sliderDayOfWeek(time);
  return events.filter((ev) => eventActiveAt(ev, day));
};
