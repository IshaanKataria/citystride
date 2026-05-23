interface GeoJsonFeature {
  type: "Feature";
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: number[][] | number[][][];
  };
  properties: Record<string, unknown>;
}

interface GeoJsonCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

export interface RawNode {
  id: string;
  lng: number;
  lat: number;
}

export interface RawEdge {
  id: string;
  from: string;
  to: string;
  geometry: [number, number][];
  length_m: number;
  street_name: string;
}

const coordKey = (lng: number, lat: number): string =>
  `${lng.toFixed(7)},${lat.toFixed(7)}`;

const haversineDistance = (
  lng1: number, lat1: number, lng2: number, lat2: number,
): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const buildNetwork = (
  geojson: unknown,
): { nodes: RawNode[]; edges: RawEdge[] } => {
  const fc = geojson as GeoJsonCollection;
  const nodeMap = new Map<string, RawNode>();
  const edges: RawEdge[] = [];
  let edgeCounter = 0;

  const getOrCreateNode = (lng: number, lat: number): string => {
    const key = coordKey(lng, lat);
    if (!nodeMap.has(key)) {
      nodeMap.set(key, { id: `n_${nodeMap.size}`, lng, lat });
    }
    return nodeMap.get(key)!.id;
  };

  for (const feature of fc.features) {
    const lines: number[][][] =
      feature.geometry.type === "MultiLineString"
        ? (feature.geometry.coordinates as number[][][])
        : [feature.geometry.coordinates as number[][]];

    const streetName =
      (feature.properties.street_name as string) ??
      (feature.properties.name as string) ??
      "Unknown";

    for (const coords of lines) {
      if (coords.length < 2) { continue; }

      const fromCoord = coords[0];
      const toCoord = coords[coords.length - 1];
      const fromId = getOrCreateNode(fromCoord[0], fromCoord[1]);
      const toId = getOrCreateNode(toCoord[0], toCoord[1]);

      let length = 0;
      for (let i = 1; i < coords.length; i++) {
        length += haversineDistance(
          coords[i - 1][0], coords[i - 1][1],
          coords[i][0], coords[i][1],
        );
      }

      edges.push({
        id: `e_${edgeCounter++}`,
        from: fromId,
        to: toId,
        geometry: coords.map((c) => [c[0], c[1]] as [number, number]),
        length_m: Math.round(length),
        street_name: streetName,
      });
    }
  }

  console.log(`  Network: ${nodeMap.size} nodes, ${edges.length} edges`);
  return { nodes: Array.from(nodeMap.values()), edges };
};
