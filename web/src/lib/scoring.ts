export { composite, edgeCost, WEIGHTS, ROUTING_ALPHA } from "../../../shared/scoring";

export function scoreToRgba(score: number): [number, number, number, number] {
  const s = Math.max(0, Math.min(1, score));
  const eased = Math.pow(s, 0.7);
  const r = Math.round(40 + (255 - 40) * eased);
  const g = Math.round(60 + (210 - 60) * Math.pow(eased, 1.2));
  const b = Math.round(95 + (160 - 95) * (1 - eased));
  return [r, g, b, 240];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatTime(t: number): string {
  const time = Math.max(0, Math.min(167, Math.floor(t)));
  const day = DAYS[Math.floor(time / 24)];
  const hour = String(time % 24).padStart(2, "0");
  return `${day} ${hour}:00`;
}
