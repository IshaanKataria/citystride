import type { RawEdge } from "./network";

interface PointFeature {
  geometry: { coordinates: number[] };
  properties: Record<string, unknown>;
}

interface GeoJsonCollection {
  type: "FeatureCollection";
  features: PointFeature[];
}

export interface SensorHourlyCounts {
  sensorId: string;
  lng: number;
  lat: number;
  hourly: number[];
}

export interface EdgeWithMetrics extends RawEdge {
  metrics: {
    lux: number;
    gentle_gradient: number;
    surface_quality: number;
    canopy: number;
    bailout_proximity: number;
    ped_count: number[];
    open_venues: number[];
  };
  confidence: {
    ped_count: { distance_to_sensor_m: number };
  };
}

const edgeMidpoint = (geometry: [number, number][]): [number, number] => {
  const mid = Math.floor(geometry.length / 2);
  return geometry[mid];
};

const distToEdge = (
  point: [number, number],
  edgeMid: [number, number],
): number => {
  const dLng = (point[0] - edgeMid[0]) * 111320 * Math.cos((edgeMid[1] * Math.PI) / 180);
  const dLat = (point[1] - edgeMid[1]) * 110540;
  return Math.sqrt(dLng * dLng + dLat * dLat);
};

const countFeaturesNear = (
  features: readonly PointFeature[],
  edgeMid: [number, number],
  radiusM: number,
): number => {
  let count = 0;
  for (const f of features) {
    const pt: [number, number] = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
    if (distToEdge(pt, edgeMid) <= radiusM) {
      count++;
    }
  }
  return count;
};

const nearestFeatureDist = (
  features: readonly PointFeature[],
  edgeMid: [number, number],
): number => {
  let minDist = Infinity;
  for (const f of features) {
    const pt: [number, number] = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
    const d = distToEdge(pt, edgeMid);
    if (d < minDist) { minDist = d; }
  }
  return minDist;
};

export const parseSensorCounts = (
  sensorLocations: unknown,
  countsCsv: string,
): SensorHourlyCounts[] => {
  const sensorGeo = sensorLocations as GeoJsonCollection;
  const sensorMap = new Map<string, { lng: number; lat: number }>();

  for (const f of sensorGeo.features) {
    const id = String(f.properties.sensor_id ?? f.properties.id ?? "");
    if (id) {
      sensorMap.set(id, {
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      });
    }
  }

  const lines = countsCsv.split("\n");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const sensorIdIdx = header.findIndex((h) => h.includes("sensor_id"));
  const dayIdx = header.findIndex((h) => h.includes("day"));
  const timeIdx = header.findIndex((h) => h.includes("time") || h.includes("hour"));
  const countIdx = header.findIndex((h) => h.includes("count") || h.includes("hourly"));

  const hourlyBySensor = new Map<string, number[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < Math.max(sensorIdIdx, dayIdx, timeIdx, countIdx) + 1) { continue; }

    const sensorId = cols[sensorIdIdx]?.trim();
    const dayOfWeek = parseInt(cols[dayIdx], 10);
    const hour = parseInt(cols[timeIdx], 10);
    const count = parseInt(cols[countIdx], 10);

    if (!sensorId || isNaN(dayOfWeek) || isNaN(hour) || isNaN(count)) { continue; }

    if (!hourlyBySensor.has(sensorId)) {
      hourlyBySensor.set(sensorId, Array(168).fill(0));
    }
    const idx = dayOfWeek * 24 + hour;
    if (idx >= 0 && idx < 168) {
      const arr = hourlyBySensor.get(sensorId)!;
      arr[idx] = (arr[idx] + count) / 2;
    }
  }

  const result: SensorHourlyCounts[] = [];
  for (const [sensorId, hourly] of hourlyBySensor) {
    const loc = sensorMap.get(sensorId);
    if (loc) {
      result.push({ sensorId, lng: loc.lng, lat: loc.lat, hourly });
    }
  }

  console.log(`  Parsed ${result.length} sensors with hourly counts`);
  return result;
};

const idwInterpolate = (
  sensors: readonly SensorHourlyCounts[],
  edgeMid: [number, number],
  maxDistM: number = 500,
): { counts: number[]; nearestDist: number } => {
  const nearby: { sensor: SensorHourlyCounts; dist: number }[] = [];

  for (const sensor of sensors) {
    const d = distToEdge([sensor.lng, sensor.lat], edgeMid);
    if (d <= maxDistM) {
      nearby.push({ sensor, dist: Math.max(d, 1) });
    }
  }

  if (nearby.length === 0) {
    const nearest = sensors.reduce((best, s) => {
      const d = distToEdge([s.lng, s.lat], edgeMid);
      return d < best.dist ? { sensor: s, dist: d } : best;
    }, { sensor: sensors[0], dist: Infinity });
    return { counts: nearest.sensor.hourly, nearestDist: nearest.dist };
  }

  const counts = Array(168).fill(0);
  let totalWeight = 0;

  for (const { sensor, dist } of nearby) {
    const weight = 1 / (dist * dist);
    totalWeight += weight;
    for (let h = 0; h < 168; h++) {
      counts[h] += sensor.hourly[h] * weight;
    }
  }

  for (let h = 0; h < 168; h++) {
    counts[h] /= totalWeight;
  }

  return { counts, nearestDist: nearby[0].dist };
};

export const computeEdgeMetrics = (
  edges: readonly RawEdge[],
  streetLights: unknown,
  trees: unknown,
  footpathQuality: unknown,
  tramStops: unknown,
  sensors: readonly SensorHourlyCounts[],
): EdgeWithMetrics[] => {
  const lights = (streetLights as GeoJsonCollection).features;
  const treeFeatures = (trees as GeoJsonCollection).features;
  const footpaths = (footpathQuality as GeoJsonCollection).features;
  const trams = (tramStops as GeoJsonCollection).features;

  console.log(`  Computing metrics for ${edges.length} edges...`);

  return edges.map((edge, i) => {
    if (i % 1000 === 0 && i > 0) {
      console.log(`    ${i}/${edges.length}`);
    }

    const mid = edgeMidpoint(edge.geometry);

    const lightCount = countFeaturesNear(lights, mid, 50);
    const lux = Math.min(lightCount / 5, 1);

    const treeCount = countFeaturesNear(treeFeatures, mid, 30);
    const canopy = Math.min(treeCount / 8, 1);

    const nearestTram = nearestFeatureDist(trams, mid);
    const bailout_proximity = Math.max(0, 1 - nearestTram / 500);

    const nearFootpath = footpaths.filter(
      (f) => distToEdge([f.geometry.coordinates[0], f.geometry.coordinates[1]], mid) < 30,
    );
    const surface_quality =
      nearFootpath.length > 0
        ? nearFootpath.reduce((sum, f) => {
            const rating = Number(f.properties.condition_rating ?? f.properties.quality ?? 3);
            return sum + rating / 5;
          }, 0) / nearFootpath.length
        : 0.5;

    const { counts: ped_count, nearestDist } = idwInterpolate(sensors, mid);

    const gentle_gradient = 0.7;

    const open_venues = Array(168).fill(0.5);

    return {
      ...edge,
      metrics: {
        lux,
        gentle_gradient,
        surface_quality,
        canopy,
        bailout_proximity,
        ped_count,
        open_venues,
      },
      confidence: {
        ped_count: { distance_to_sensor_m: Math.round(nearestDist) },
      },
    };
  });
};
