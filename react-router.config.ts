import type { Config } from "@react-router/dev/config";

const presets = process.env.VERCEL
  ? [(await import("@vercel/react-router/vite")).vercelPreset()]
  : [];

export default {
  ssr: true,
  presets,
} satisfies Config;
