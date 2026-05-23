// Red → Yellow → Green gradient
const LOW: readonly [number, number, number] = [220, 50, 50];    // red
const MID: readonly [number, number, number] = [250, 200, 50];   // yellow
const HIGH: readonly [number, number, number] = [50, 205, 100];  // green

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const scoreToColor = (score: number): [number, number, number, number] => {
  const t = clamp(score, 0, 1);
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const s = t * 2; // 0..1 within first half
    r = lerp(LOW[0], MID[0], s);
    g = lerp(LOW[1], MID[1], s);
    b = lerp(LOW[2], MID[2], s);
  } else {
    const s = (t - 0.5) * 2; // 0..1 within second half
    r = lerp(MID[0], HIGH[0], s);
    g = lerp(MID[1], HIGH[1], s);
    b = lerp(MID[2], HIGH[2], s);
  }
  return [Math.round(r), Math.round(g), Math.round(b), 230];
};

export const ROUTE_COLORS = [
  [59, 130, 246],
  [168, 85, 247],
  [249, 115, 22],
] as const;
