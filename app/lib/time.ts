const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const hourOfWeekFromDayHour = (day: number, hour: number): number => {
  return day * 24 + hour;
};

export const dayHourFromHourOfWeek = (hourOfWeek: number): { day: number; hour: number } => {
  const day = Math.floor(hourOfWeek / 24);
  const hour = hourOfWeek % 24;
  return { day, hour };
};

export const formatHourOfWeek = (hourOfWeek: number): string => {
  const { day, hour } = dayHourFromHourOfWeek(hourOfWeek);
  const dayName = DAY_NAMES[day];
  const hourStr = hour.toString().padStart(2, "0");
  return `${dayName} ${hourStr}:00`;
};

export const INITIAL_HOUR_OF_WEEK = hourOfWeekFromDayHour(4, 22);
