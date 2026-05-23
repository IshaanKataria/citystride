import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VENUE_ALIASES } from "./event-venue-aliases.ts";

type LngLat = readonly [number, number];

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENUES_PATH = join(__dirname, "..", "..", "data", "raw", "venues.json");

const CBD_BOUNDS = {
  lng_min: 144.93,
  lng_max: 145.0,
  lat_min: -37.83,
  lat_max: -37.79,
};

type Venue = {
  feature_name: string;
  co_ordinates: { lon: number; lat: number };
};

let venuesCache: Array<{ tokens: Set<string>; raw: Venue }> | null = null;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 1));
}

async function getVenues() {
  if (venuesCache) return venuesCache;
  const raw = JSON.parse(await readFile(VENUES_PATH, "utf-8")) as Venue[];
  venuesCache = raw
    .filter((v) => v.feature_name && v.co_ordinates)
    .map((v) => ({ tokens: tokenize(v.feature_name), raw: v }));
  return venuesCache;
}

function tokenSetSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

function inBounds(lng: number, lat: number): boolean {
  return (
    lng >= CBD_BOUNDS.lng_min &&
    lng <= CBD_BOUNDS.lng_max &&
    lat >= CBD_BOUNDS.lat_min &&
    lat <= CBD_BOUNDS.lat_max
  );
}

export type ResolveResult =
  | { position: LngLat; resolved_via: "venues_json" | "alias_then_venues_json" }
  | null;

export async function resolveVenue(venueName: string): Promise<ResolveResult> {
  const venues = await getVenues();
  const normalizedInput = normalize(venueName);
  const aliasHit = VENUE_ALIASES[normalizedInput];
  const queryName = aliasHit ?? venueName;
  const queryTokens = tokenize(queryName);

  let best: { sim: number; venue: Venue } | null = null;
  for (const v of venues) {
    const sim = tokenSetSimilarity(queryTokens, v.tokens);
    if (!best || sim > best.sim) best = { sim, venue: v.raw };
  }

  if (!best || best.sim < 0.5) return null;

  const lng = best.venue.co_ordinates.lon;
  const lat = best.venue.co_ordinates.lat;
  if (!inBounds(lng, lat)) return null;

  return {
    position: [lng, lat],
    resolved_via: aliasHit ? "alias_then_venues_json" : "venues_json",
  };
}
