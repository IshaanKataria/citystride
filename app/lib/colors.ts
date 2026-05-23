const DIM: readonly [number, number, number, number] = [80, 80, 80, 200];
const VIBRANT: readonly [number, number, number, number] = [0, 200, 120, 255];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const scoreToColor = (score: number): [number, number, number, number] => {
  const t = clamp(score, 0, 1);
  return [
    Math.round(lerp(DIM[0], VIBRANT[0], t)),
    Math.round(lerp(DIM[1], VIBRANT[1], t)),
    Math.round(lerp(DIM[2], VIBRANT[2], t)),
    Math.round(lerp(DIM[3], VIBRANT[3], t)),
  ];
};

export const ROUTE_COLORS = [
  [59, 130, 246],
  [168, 85, 247],
  [249, 115, 22],
] as const;
