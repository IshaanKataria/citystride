import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "data", "raw");

const COM_DATASETS = {
  pedestrianNetwork: {
    name: "Pedestrian Network",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/pedestrian-network?method=export&type=GeoJSON",
  },
  pedestrianCounting: {
    name: "Pedestrian Counting Sensors",
    url: "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-sensor-locations/exports/geojson",
  },
  pedestrianCounts: {
    name: "Pedestrian Counts (Monthly)",
    url: "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-monthly-counts-per-hour/exports/csv?limit=-1&timezone=Australia%2FMelbourne",
  },
  streetLights: {
    name: "Street Lights",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/street-lights?method=export&type=GeoJSON",
  },
  trees: {
    name: "Trees with Canopy",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/trees-with-canopy-cover?method=export&type=GeoJSON",
  },
  footpathQuality: {
    name: "Footpath Quality",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/footpath-quality?method=export&type=GeoJSON",
  },
  tramStops: {
    name: "Tram Stops",
    url: "https://data.melbourne.vic.gov.au/api/geospatial/tram-stops?method=export&type=GeoJSON",
  },
  streetAddresses: {
    name: "Street Addresses",
    url: "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/street-addresses/exports/csv?limit=-1&timezone=Australia%2FMelbourne",
  },
} as const;

type DatasetKey = keyof typeof COM_DATASETS;

const fetchDataset = async (key: DatasetKey): Promise<string> => {
  const dataset = COM_DATASETS[key];
  const ext = dataset.url.includes("GeoJSON") || dataset.url.includes("geojson") ? "geojson" : "csv";
  const cachePath = join(CACHE_DIR, `${key}.${ext}`);

  if (existsSync(cachePath)) {
    console.log(`  [cached] ${dataset.name}`);
    return readFile(cachePath, "utf-8");
  }

  console.log(`  [fetch] ${dataset.name}...`);
  const response = await fetch(dataset.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${dataset.name}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  await writeFile(cachePath, text, "utf-8");
  return text;
};

export interface RawDatasets {
  readonly pedestrianNetwork: unknown;
  readonly pedestrianCounting: unknown;
  readonly pedestrianCounts: string;
  readonly streetLights: unknown;
  readonly trees: unknown;
  readonly footpathQuality: unknown;
  readonly tramStops: unknown;
  readonly streetAddresses: string;
}

export const fetchAllDatasets = async (): Promise<RawDatasets> => {
  console.log("Fetching CoM datasets...");
  await mkdir(CACHE_DIR, { recursive: true });

  const [
    pedestrianNetwork,
    pedestrianCounting,
    pedestrianCounts,
    streetLights,
    trees,
    footpathQuality,
    tramStops,
    streetAddresses,
  ] = await Promise.all([
    fetchDataset("pedestrianNetwork").then((t) => JSON.parse(t)),
    fetchDataset("pedestrianCounting").then((t) => JSON.parse(t)),
    fetchDataset("pedestrianCounts"),
    fetchDataset("streetLights").then((t) => JSON.parse(t)),
    fetchDataset("trees").then((t) => JSON.parse(t)),
    fetchDataset("footpathQuality").then((t) => JSON.parse(t)),
    fetchDataset("tramStops").then((t) => JSON.parse(t)),
    fetchDataset("streetAddresses"),
  ]);

  console.log("All datasets fetched.");
  return {
    pedestrianNetwork,
    pedestrianCounting,
    pedestrianCounts,
    streetLights,
    trees,
    footpathQuality,
    tramStops,
    streetAddresses,
  };
};
