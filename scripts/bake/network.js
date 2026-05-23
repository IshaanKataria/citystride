/**
 * Builds the routing graph from OSM data.
 * Nodes = OSM nodes. Edges = consecutive node pairs within each way.
 * Each edge is bidirectional (walking).
 */

const R_EARTH = 6371008.8;

function haversineM(lng1, lat1, lng2, lat2) {
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const lat1r = lat1 * (Math.PI / 180);
  const lat2r = lat2 * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLng / 2) ** 2;
  return R_EARTH * 2 * Math.asin(Math.sqrt(a));
}

export function buildNetwork(osmData) {
  const osmNodes = new Map();
  const ways = [];

  for (const el of osmData.elements) {
    if (el.type === 'node') {
      osmNodes.set(el.id, { id: el.id, lng: el.lon, lat: el.lat });
    } else if (el.type === 'way') {
      ways.push(el);
    }
  }

  const nodes = new Map(); // nodeId → { id, lng, lat }
  const edges = [];
  let edgeIdx = 0;

  for (const way of ways) {
    const nodeIds = way.nodes;
    const name = way.tags?.name ?? way.tags?.['addr:street'] ?? null;
    const surface = way.tags?.surface ?? null;
    const highwayType = way.tags?.highway ?? 'path';

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const fromId = nodeIds[i];
      const toId = nodeIds[i + 1];
      const fromOsm = osmNodes.get(fromId);
      const toOsm = osmNodes.get(toId);

      if (!fromOsm || !toOsm) continue;

      nodes.set(fromId, fromOsm);
      nodes.set(toId, toOsm);

      const geom = [[fromOsm.lng, fromOsm.lat], [toOsm.lng, toOsm.lat]];
      const length_m = haversineM(fromOsm.lng, fromOsm.lat, toOsm.lng, toOsm.lat);

      if (length_m < 1) continue; // skip degenerate segments

      edges.push({
        id: `e${edgeIdx++}`,
        fromNodeId: fromId,
        toNodeId: toId,
        wayId: way.id,
        geometry: geom,
        midpoint: [(fromOsm.lng + toOsm.lng) / 2, (fromOsm.lat + toOsm.lat) / 2],
        length_m: Math.round(length_m * 10) / 10,
        name,
        surface,
        highwayType,
        metrics: {},
      });
    }
  }

  console.log(`Network: ${nodes.size} nodes, ${edges.length} edges from ${ways.length} ways`);
  return { nodes, edges };
}
