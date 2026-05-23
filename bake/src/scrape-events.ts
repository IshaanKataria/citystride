import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVenue } from "./venue-resolver.ts";
import type { Event } from "../../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "..", "data");
const OUTPUT_FILE = join(OUTPUT_DIR, "events.json");

const BASE = "https://whatson.melbourne.vic.gov.au";
const LISTING_PAGES = [
  "/things-to-do",
  "/things-to-do/major-events",
  "/things-to-do/free",
  "/things-to-do/entertainment",
];
const CATEGORY_SLUGS = new Set([
  "free",
  "family-and-kids",
  "entertainment",
  "attractions-and-sights",
  "major-events",
  "food-and-drink",
  "shopping",
  "wellness",
  "outdoors",
  "tours-and-trails",
  "exhibitions",
  "music",
  "performance",
  "history-and-heritage",
  "community-events",
  "lgbtqia",
  "free-things-to-do",
]);
const UA = "CityStrideBot/0.1 (hackathon demo; +https://citystride.local)";
const FETCH_TIMEOUT_MS = 5000;
const REQUEST_DELAY_MS = 300;
const DESCRIPTION_MAX = 280;

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
};

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextRetry(url: string): Promise<string | null> {
  const first = await fetchText(url);
  if (first !== null) return first;
  await sleep(500);
  return fetchText(url);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractSlugs(html: string): string[] {
  const re = /\/things-to-do\/([a-z0-9][a-z0-9-]*)/g;
  const slugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (!CATEGORY_SLUGS.has(slug)) slugs.add(slug);
  }
  return [...slugs];
}

type LdEvent = {
  "@type": string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    "@type"?: string;
    name?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      postalCode?: string;
    };
  };
};

function extractJsonLd(html: string): LdEvent | null {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj && obj["@type"] === "Event") return obj as LdEvent;
    } catch {
      // try next block
    }
  }
  return null;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

async function discoverSlugs(): Promise<string[]> {
  const all = new Set<string>();
  for (const path of LISTING_PAGES) {
    const html = await fetchTextRetry(BASE + path);
    if (!html) {
      console.warn(`skip listing ${path}: fetch failed`);
      continue;
    }
    for (const slug of extractSlugs(html)) all.add(slug);
    await sleep(REQUEST_DELAY_MS);
  }
  return [...all];
}

async function scrapeOne(slug: string): Promise<Event | null> {
  const url = `${BASE}/things-to-do/${slug}`;
  const html = await fetchTextRetry(url);
  if (!html) {
    console.warn(`drop ${slug}: detail fetch failed`);
    return null;
  }
  const ld = extractJsonLd(html);
  if (!ld) {
    console.warn(`drop ${slug}: no JSON-LD Event block`);
    return null;
  }
  if (!ld.name || !ld.startDate || !ld.endDate || !ld.location?.name) {
    console.warn(`drop ${slug}: missing required fields`);
    return null;
  }

  const resolved = await resolveVenue(ld.location.name);
  if (!resolved) {
    console.warn(`drop ${slug}: venue '${ld.location.name}' not in venues.json`);
    return null;
  }

  return {
    id: slug,
    name: ld.name,
    description: truncate(ld.description ?? "", DESCRIPTION_MAX),
    url,
    start_date: ld.startDate,
    end_date: ld.endDate,
    venue_name: ld.location.name,
    address: ld.location.address?.streetAddress ?? null,
    position: resolved.position,
    resolved_via: resolved.resolved_via,
  };
}

async function main() {
  console.log("citystride event scraper starting...");
  const slugs = await discoverSlugs();
  console.log(`discovered ${slugs.length} candidate slugs`);

  const events: Event[] = [];
  const dropped: string[] = [];
  for (const slug of slugs) {
    const ev = await scrapeOne(slug);
    if (ev) events.push(ev);
    else dropped.push(slug);
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `Scraped ${slugs.length} candidates, kept ${events.length}, dropped ${dropped.length} (${dropped.join(", ")})`,
  );

  if (events.length === 0) {
    console.warn("WARNING: 0 events kept — skipping write to preserve existing data/events.json");
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(events, null, 2));
  console.log(`wrote ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
