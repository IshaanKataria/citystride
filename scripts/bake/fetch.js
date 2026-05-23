/**
 * Downloads and caches all source datasets to data/raw/.
 * Re-uses cached files if they exist — delete them to force re-fetch.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '..', '..', 'data', 'raw');

// Melbourne LGA bounding box: south,west,north,east
const BBOX = [-37.875, 144.885, -37.750, 145.030];
const COM_BASE = 'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets';
const OVERPASS_URL = 'https://overpass.kumi.systems/api/interpreter';

function ensureDir() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

function cachePath(name) {
  return path.join(RAW_DIR, `${name}.json`);
}

function isCached(name) {
  return fs.existsSync(cachePath(name));
}

function readCache(name) {
  return JSON.parse(fs.readFileSync(cachePath(name), 'utf8'));
}

function writeCache(name, data) {
  fs.writeFileSync(cachePath(name), JSON.stringify(data));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchComExport(datasetId, params = {}) {
  const url = new URL(`${COM_BASE}/${datasetId}/exports/json`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('use_labels', 'false');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${datasetId}`);
  return res.json();
}

async function fetchOsm() {
  if (isCached('osm')) { console.log('  osm: cached'); return readCache('osm'); }
  console.log('  osm: downloading pedestrian ways from Overpass...');

  const [south, west, north, east] = BBOX;
  const query = `[out:json][timeout:120];
(
  way["highway"~"footway|pedestrian|path|steps|living_street"]
    (${south},${west},${north},${east});
  way["highway"~"primary|secondary|tertiary|residential|unclassified|service"]
    ["foot"!="no"]["access"!="private"]
    (${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;

  const OVERPASS_MIRRORS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length * 2; attempt++) {
    const mirror = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      if (attempt > 0) {
        const wait = attempt <= OVERPASS_MIRRORS.length ? 30000 : 60000;
        console.log(`  osm: waiting ${wait / 1000}s before retry...`);
        await sleep(wait);
      }
      console.log(`  osm: trying ${mirror} (attempt ${attempt + 1})...`);
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.status === 429 || res.status === 503 || res.status === 406 || res.status === 403) {
        console.log(`  osm: ${res.status} from ${mirror}, trying next...`);
        continue;
      }
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const data = await res.json();
      if (!data.elements) throw new Error('Overpass returned no elements');
      writeCache('osm', data);
      console.log(`  osm: ${data.elements.filter(e => e.type === 'way').length} ways, ${data.elements.filter(e => e.type === 'node').length} nodes`);
      return data;
    } catch (err) {
      if (attempt === OVERPASS_MIRRORS.length * 2 - 1) throw err;
      console.log(`  osm: failed (${err.message}), trying next mirror...`);
    }
  }
  throw new Error('All Overpass mirrors exhausted');
}

async function fetchStreetLights() {
  if (isCached('streetlights')) { console.log('  streetlights: cached'); return readCache('streetlights'); }
  console.log('  streetlights: downloading...');
  const data = await fetchComExport('street-lights-with-emitted-lux-level-council-owned-lights-only', {
    select: 'geo_point_2d,asset_subt,label',
  });
  writeCache('streetlights', data);
  console.log(`  streetlights: ${data.length} lights`);
  return data;
}

async function fetchPedCounts() {
  if (isCached('pedcounts')) { console.log('  pedcounts: cached'); return readCache('pedcounts'); }
  console.log('  pedcounts: downloading 2024 hourly counts (~450k records, may take 30s)...');
  const data = await fetchComExport('pedestrian-counting-system-monthly-counts-per-hour', {
    select: 'location_id,sensor_name,location,sensing_date,hourday,pedestriancount',
    where: 'year(sensing_date)=2024',
  });
  writeCache('pedcounts', data);
  console.log(`  pedcounts: ${data.length} records`);
  return data;
}

async function fetchTrees() {
  if (isCached('trees')) { console.log('  trees: cached'); return readCache('trees'); }
  console.log('  trees: downloading...');
  const data = await fetchComExport('trees-with-species-and-dimensions-urban-forest', {
    select: 'geolocation,useful_life_expectency_value',
  });
  writeCache('trees', data);
  console.log(`  trees: ${data.length} trees`);
  return data;
}

async function fetchRoadSurface() {
  if (isCached('roadsurface')) { console.log('  roadsurface: cached'); return readCache('roadsurface'); }
  console.log('  roadsurface: downloading...');
  const data = await fetchComExport('road-segments-with-surface-type', {
    select: 'geo_point_2d,material,condition,type',
    where: 'type="Footway"',
  });
  writeCache('roadsurface', data);
  console.log(`  roadsurface: ${data.length} segments`);
  return data;
}

async function fetchTransitStops() {
  if (isCached('transitstops')) { console.log('  transitstops: cached'); return readCache('transitstops'); }
  console.log('  transitstops: downloading...');

  const [tramStops, busStops] = await Promise.all([
    fetchComExport('city-circle-tram-stops', { select: 'geo_point_2d,name' }),
    fetchComExport('bus-stops', { select: 'geo_point_2d,descriptio' }),
  ]);

  const data = [
    ...tramStops.map(s => ({ ...s, type: 'tram' })),
    ...busStops.map(s => ({ ...s, type: 'bus' })),
  ];
  writeCache('transitstops', data);
  console.log(`  transitstops: ${data.length} stops (${tramStops.length} tram, ${busStops.length} bus)`);
  return data;
}

async function fetchVenues() {
  if (isCached('venues')) { console.log('  venues: cached'); return readCache('venues'); }
  console.log('  venues: downloading...');
  const data = await fetchComExport('landmarks-and-places-of-interest-including-schools-theatres-health-services-spor', {
    select: 'co_ordinates,feature_name,theme,sub_theme',
  });
  writeCache('venues', data);
  console.log(`  venues: ${data.length} venues`);
  return data;
}

export async function fetchAll() {
  ensureDir();
  console.log('Fetching datasets...');
  // OSM first (external rate-limit risk), then CoM in parallel
  const osm = await fetchOsm();
  const [streetlights, pedcounts, trees, roadsurface, transitstops, venues] = await Promise.all([
    fetchStreetLights(),
    fetchPedCounts(),
    fetchTrees(),
    fetchRoadSurface(),
    fetchTransitStops(),
    fetchVenues(),
  ]);
  console.log('All datasets ready.');
  return { osm, streetlights, pedcounts, trees, roadsurface, transitstops, venues };
}

// Allow running directly: node bake/fetch.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchAll().catch(err => { console.error(err); process.exit(1); });
}
