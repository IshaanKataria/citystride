/**
 * Expands public/graph.json by adding realistic synthetic edges
 * for areas just outside the current CBD core coverage.
 *
 * Current coverage:  lng 144.955–144.975, lat -37.822 to -37.810
 * Expanded coverage: lng 144.950–144.980, lat -37.826 to -37.806
 *
 * Adds streets in Southbank (south), East Melbourne (east),
 * and the north fringe near Carlton Gardens.
 */

import fs from 'fs';
import path from 'path';

const INPUT = path.resolve('public/graph.json');
const OUTPUT = path.resolve('public/graph.json');

const R_EARTH = 6371008.8;

function haversineM(lng1, lat1, lng2, lat2) {
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const lat1r = lat1 * (Math.PI / 180);
  const lat2r = lat2 * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLng / 2) ** 2;
  return R_EARTH * 2 * Math.asin(Math.sqrt(a));
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function generatePedVector(id, character) {
  const phase = hashString(id + ':phase') * 24;
  const personality = hashString(id + ':pers');
  const baseline = character === 'main' ? 0.03 : 0.01;

  const vec = new Array(168);
  for (let h = 0; h < 168; h++) {
    const day = Math.floor(h / 24);
    const hour = h % 24;
    let f = 0.002;
    if (hour >= 7 && hour <= 19) f += 0.02;
    if (hour >= 11 && hour <= 14 && day < 5) f += 0.015;
    if (hour >= 17 && hour <= 21) f += 0.01;
    if (day >= 5) f *= 0.7;
    const wobble = 0.005 * Math.sin(((h + phase) * Math.PI) / 12);
    vec[h] = Math.max(0, +(baseline + f * (0.5 + personality * 0.5) + wobble).toFixed(4));
  }
  return vec;
}

function generateVenuesVector(id, character) {
  // Fringe areas have fewer venues, mostly zeros
  if (character === 'park' || character === 'residential') {
    return new Array(168).fill(0);
  }
  const base = character === 'main' ? 0.3 : 0.1;
  const vec = new Array(168);
  for (let h = 0; h < 168; h++) {
    const hour = h % 24;
    if (hour >= 8 && hour <= 22) {
      vec[h] = +(base * (0.5 + 0.5 * hashString(id + ':v' + h))).toFixed(2);
    } else {
      vec[h] = 0;
    }
  }
  return vec;
}

function generateMetrics(id, character) {
  const h1 = hashString(id + ':lux');
  const h2 = hashString(id + ':steep');
  const h3 = hashString(id + ':surf');
  const h4 = hashString(id + ':transit');
  const h5 = hashString(id + ':canopy');

  const luxBase = { main: 0.5, side: 0.3, park: 0.1, residential: 0.35 }[character] ?? 0.3;
  const canopyBase = { main: 0.3, side: 0.4, park: 0.8, residential: 0.5 }[character] ?? 0.4;

  return {
    lux: +(luxBase + 0.3 * h1).toFixed(3),
    steepness: +(0.7 + 0.3 * h2).toFixed(3),
    surface: +(0.6 + 0.3 * h3).toFixed(3),
    transit: +(0.1 + 0.4 * h4).toFixed(3),
    canopy: +(canopyBase + 0.3 * h5).toFixed(3),
    ped_vector: generatePedVector(id, character),
    venues_vector: generateVenuesVector(id, character),
    ped_confidence: {
      nearest_sensor_m: Math.round(150 + hashString(id + ':conf') * 500),
      sensor_count: Math.round(1 + hashString(id + ':sc') * 3),
      is_interpolated: true,
    },
  };
}

// Streets to add in the expansion area — denser grids with intermediate points
const EXPANSION_STREETS = [
  // ═══════════════════════════════════════════
  // SOUTHBANK — denser grid south of Flinders St
  // ═══════════════════════════════════════════
  // East-west streets
  { name: 'Southbank Promenade', points: [[144.955, -37.8208], [144.957, -37.8207], [144.959, -37.8206], [144.961, -37.8206], [144.963, -37.8205], [144.965, -37.8205], [144.967, -37.8204], [144.969, -37.8204], [144.971, -37.8203], [144.973, -37.8203]], type: 'pedestrian', character: 'main' },
  { name: 'Southbank Boulevard', points: [[144.955, -37.8225], [144.957, -37.8224], [144.959, -37.8223], [144.961, -37.8222], [144.963, -37.8221], [144.965, -37.8220], [144.967, -37.8219], [144.969, -37.8218], [144.971, -37.8217], [144.973, -37.8216]], type: 'tertiary', character: 'main' },
  { name: 'City Road', points: [[144.955, -37.8245], [144.957, -37.8244], [144.959, -37.8243], [144.961, -37.8242], [144.963, -37.8241], [144.965, -37.8240], [144.967, -37.8239], [144.969, -37.8238], [144.971, -37.8237]], type: 'secondary', character: 'main' },
  { name: 'Moore Street', points: [[144.957, -37.8235], [144.959, -37.8234], [144.961, -37.8233], [144.963, -37.8232], [144.965, -37.8231]], type: 'residential', character: 'side' },
  { name: 'Fanning Street', points: [[144.965, -37.8250], [144.967, -37.8249], [144.969, -37.8248], [144.971, -37.8247]], type: 'residential', character: 'side' },
  // North-south streets
  { name: 'Sturt Street', points: [[144.957, -37.8200], [144.957, -37.8208], [144.957, -37.8216], [144.957, -37.8224], [144.957, -37.8235], [144.957, -37.8244]], type: 'residential', character: 'side' },
  { name: 'Miles Street', points: [[144.959, -37.8206], [144.959, -37.8215], [144.959, -37.8223], [144.959, -37.8234], [144.959, -37.8243]], type: 'residential', character: 'side' },
  { name: 'Dodds Street', points: [[144.961, -37.8206], [144.961, -37.8215], [144.961, -37.8222], [144.961, -37.8233], [144.961, -37.8242]], type: 'residential', character: 'side' },
  { name: 'Kavanagh Street', points: [[144.963, -37.8205], [144.963, -37.8214], [144.963, -37.8221], [144.963, -37.8232], [144.963, -37.8241]], type: 'residential', character: 'side' },
  { name: 'Hancock Street', points: [[144.965, -37.8205], [144.965, -37.8213], [144.965, -37.8220], [144.965, -37.8231], [144.965, -37.8240], [144.965, -37.8250]], type: 'residential', character: 'side' },
  { name: 'Power Street', points: [[144.967, -37.8204], [144.967, -37.8212], [144.967, -37.8219], [144.967, -37.8228], [144.967, -37.8239], [144.967, -37.8249]], type: 'residential', character: 'side' },
  { name: 'Wells Street', points: [[144.969, -37.8204], [144.969, -37.8212], [144.969, -37.8218], [144.969, -37.8228], [144.969, -37.8238], [144.969, -37.8248]], type: 'residential', character: 'side' },
  { name: 'Coventry Street', points: [[144.971, -37.8203], [144.971, -37.8211], [144.971, -37.8217], [144.971, -37.8227], [144.971, -37.8237], [144.971, -37.8247]], type: 'residential', character: 'side' },
  // Arts Precinct
  { name: 'Arts Precinct Walk', points: [[144.969, -37.8210], [144.970, -37.8215], [144.971, -37.8220], [144.970, -37.8225]], type: 'footway', character: 'park' },

  // ═══════════════════════════════════════════
  // EAST MELBOURNE / FITZROY GARDENS
  // ═══════════════════════════════════════════
  // East-west streets
  { name: 'Wellington Parade', points: [[144.975, -37.8155], [144.9765, -37.8153], [144.978, -37.8151], [144.9795, -37.8149], [144.981, -37.8147]], type: 'secondary', character: 'main' },
  { name: 'Albert Street', points: [[144.975, -37.8130], [144.9765, -37.8129], [144.978, -37.8128], [144.9795, -37.8127], [144.981, -37.8126]], type: 'tertiary', character: 'main' },
  { name: 'Gisborne Street', points: [[144.975, -37.8110], [144.9765, -37.8109], [144.978, -37.8108], [144.9795, -37.8107]], type: 'residential', character: 'side' },
  { name: 'Simpson Street', points: [[144.975, -37.8170], [144.9765, -37.8169], [144.978, -37.8168], [144.9795, -37.8167], [144.981, -37.8166]], type: 'residential', character: 'side' },
  // North-south streets
  { name: 'Lansdowne Street', points: [[144.978, -37.8100], [144.978, -37.8108], [144.978, -37.8118], [144.978, -37.8128], [144.978, -37.8140], [144.978, -37.8151], [144.978, -37.8168]], type: 'residential', character: 'residential' },
  { name: 'Clarendon Street', points: [[144.9795, -37.8107], [144.9795, -37.8118], [144.9795, -37.8127], [144.9795, -37.8140], [144.9795, -37.8149], [144.9795, -37.8167]], type: 'residential', character: 'residential' },
  { name: 'George Street', points: [[144.981, -37.8110], [144.981, -37.8120], [144.981, -37.8126], [144.981, -37.8140], [144.981, -37.8147], [144.981, -37.8160], [144.981, -37.8166]], type: 'residential', character: 'residential' },
  { name: 'Powlett Street', points: [[144.9765, -37.8100], [144.9765, -37.8109], [144.9765, -37.8120], [144.9765, -37.8129], [144.9765, -37.8140], [144.9765, -37.8153], [144.9765, -37.8169]], type: 'residential', character: 'side' },
  // Fitzroy Gardens paths (meandering)
  { name: 'Fitzroy Gardens Main Walk', points: [[144.9755, -37.8095], [144.976, -37.8100], [144.9768, -37.8108], [144.9775, -37.8115], [144.978, -37.8122], [144.9785, -37.8130], [144.979, -37.8138], [144.9793, -37.8145], [144.9795, -37.8152]], type: 'footway', character: 'park' },
  { name: 'Fitzroy Gardens Cross Walk', points: [[144.976, -37.8125], [144.9768, -37.8120], [144.9778, -37.8115], [144.979, -37.8112], [144.9798, -37.8108]], type: 'footway', character: 'park' },
  { name: 'Fitzroy Gardens South Walk', points: [[144.9755, -37.8140], [144.976, -37.8138], [144.977, -37.8135], [144.978, -37.8132], [144.979, -37.8130]], type: 'footway', character: 'park' },
  { name: 'Fitzroy Gardens East Walk', points: [[144.979, -37.8098], [144.9792, -37.8108], [144.9793, -37.8118], [144.9793, -37.8128], [144.9795, -37.8138]], type: 'footway', character: 'park' },

  // ═══════════════════════════════════════════
  // CARLTON / NORTH — denser grid
  // ═══════════════════════════════════════════
  // East-west streets
  { name: 'Grattan Street', points: [[144.956, -37.8060], [144.958, -37.8060], [144.960, -37.8060], [144.962, -37.8060], [144.964, -37.8060], [144.966, -37.8060], [144.968, -37.8060], [144.970, -37.8060], [144.972, -37.8060]], type: 'tertiary', character: 'main' },
  { name: 'Faraday Street', points: [[144.956, -37.8070], [144.958, -37.8070], [144.960, -37.8070], [144.962, -37.8070], [144.964, -37.8070], [144.966, -37.8070], [144.968, -37.8070], [144.970, -37.8070], [144.972, -37.8070]], type: 'residential', character: 'side' },
  { name: 'Queensberry Street', points: [[144.956, -37.8080], [144.958, -37.8080], [144.960, -37.8080], [144.962, -37.8080], [144.964, -37.8080], [144.966, -37.8080], [144.968, -37.8080], [144.970, -37.8080], [144.972, -37.8080]], type: 'tertiary', character: 'main' },
  { name: 'Victoria Parade', points: [[144.956, -37.8090], [144.958, -37.8090], [144.960, -37.8090], [144.962, -37.8090], [144.964, -37.8090], [144.966, -37.8090], [144.968, -37.8090], [144.970, -37.8090], [144.972, -37.8090], [144.974, -37.8090]], type: 'secondary', character: 'main' },
  // North-south streets
  { name: 'Rathdowne Street', points: [[144.960, -37.8055], [144.960, -37.8060], [144.960, -37.8070], [144.960, -37.8080], [144.960, -37.8090], [144.960, -37.8100]], type: 'tertiary', character: 'side' },
  { name: 'Drummond Street', points: [[144.962, -37.8055], [144.962, -37.8060], [144.962, -37.8070], [144.962, -37.8080], [144.962, -37.8090], [144.962, -37.8100]], type: 'residential', character: 'side' },
  { name: 'Lygon Street', points: [[144.964, -37.8055], [144.964, -37.8060], [144.964, -37.8070], [144.964, -37.8080], [144.964, -37.8090], [144.964, -37.8100]], type: 'tertiary', character: 'main' },
  { name: 'Cardigan Street', points: [[144.966, -37.8055], [144.966, -37.8060], [144.966, -37.8070], [144.966, -37.8080], [144.966, -37.8090], [144.966, -37.8100]], type: 'residential', character: 'side' },
  { name: 'Swanston Street (N)', points: [[144.968, -37.8055], [144.968, -37.8060], [144.968, -37.8070], [144.968, -37.8080], [144.968, -37.8090], [144.968, -37.8100]], type: 'secondary', character: 'main' },
  { name: 'Leicester Street', points: [[144.970, -37.8055], [144.970, -37.8060], [144.970, -37.8070], [144.970, -37.8080], [144.970, -37.8090], [144.970, -37.8100]], type: 'residential', character: 'side' },
  { name: 'Nicholson Street', points: [[144.972, -37.8055], [144.972, -37.8060], [144.972, -37.8070], [144.972, -37.8080], [144.972, -37.8090], [144.972, -37.8100]], type: 'secondary', character: 'main' },
  { name: 'Spring Street (N)', points: [[144.974, -37.8060], [144.974, -37.8070], [144.974, -37.8080], [144.974, -37.8090], [144.974, -37.8100]], type: 'secondary', character: 'main' },
  // Carlton Gardens paths
  { name: 'Carlton Gardens Main Walk', points: [[144.969, -37.8065], [144.970, -37.8070], [144.971, -37.8075], [144.972, -37.8080], [144.973, -37.8085]], type: 'footway', character: 'park' },
  { name: 'Carlton Gardens Cross Walk', points: [[144.970, -37.8065], [144.971, -37.8068], [144.972, -37.8070], [144.973, -37.8073]], type: 'footway', character: 'park' },
  { name: 'Carlton Gardens South Walk', points: [[144.969, -37.8080], [144.970, -37.8078], [144.971, -37.8076], [144.972, -37.8075]], type: 'footway', character: 'park' },

  // ═══════════════════════════════════════════
  // WEST — Spencer/King/Flagstaff area
  // ═══════════════════════════════════════════
  // North-south streets
  { name: 'Spencer Street', points: [[144.952, -37.8080], [144.952, -37.8090], [144.952, -37.8100], [144.952, -37.8115], [144.952, -37.8130], [144.952, -37.8145], [144.952, -37.8160], [144.952, -37.8175], [144.952, -37.8190]], type: 'secondary', character: 'main' },
  { name: 'King Street', points: [[144.954, -37.8080], [144.954, -37.8090], [144.954, -37.8100], [144.954, -37.8115], [144.954, -37.8130], [144.954, -37.8145], [144.954, -37.8160], [144.954, -37.8175], [144.954, -37.8190]], type: 'tertiary', character: 'side' },
  // East-west cross streets on west side
  { name: 'Dudley Street', points: [[144.952, -37.8080], [144.954, -37.8080], [144.955, -37.8080]], type: 'residential', character: 'side' },
  { name: 'Jeffcott Street', points: [[144.952, -37.8090], [144.954, -37.8090], [144.955, -37.8090]], type: 'residential', character: 'side' },
  { name: 'La Trobe Street (W)', points: [[144.952, -37.8100], [144.954, -37.8100], [144.955, -37.8100]], type: 'tertiary', character: 'main' },
  { name: 'Lonsdale Street (W)', points: [[144.952, -37.8115], [144.954, -37.8115], [144.955, -37.8115]], type: 'tertiary', character: 'main' },
  { name: 'Bourke Street (W)', points: [[144.952, -37.8130], [144.954, -37.8130], [144.955, -37.8130]], type: 'tertiary', character: 'main' },
  { name: 'Collins Street (W)', points: [[144.952, -37.8145], [144.954, -37.8145], [144.955, -37.8145]], type: 'tertiary', character: 'main' },
  { name: 'Flinders Street (W)', points: [[144.952, -37.8175], [144.954, -37.8175], [144.955, -37.8175]], type: 'tertiary', character: 'main' },
  { name: 'Flinders Lane (W)', points: [[144.952, -37.8160], [144.954, -37.8160], [144.955, -37.8160]], type: 'residential', character: 'side' },
  { name: 'Wurundjeri Way', points: [[144.952, -37.8190], [144.954, -37.8190], [144.955, -37.8200]], type: 'secondary', character: 'main' },
  // Flagstaff Gardens paths
  { name: 'Flagstaff Gardens Walk N', points: [[144.953, -37.8085], [144.9535, -37.8090], [144.954, -37.8095], [144.9545, -37.8100]], type: 'footway', character: 'park' },
  { name: 'Flagstaff Gardens Walk S', points: [[144.953, -37.8095], [144.9535, -37.8098], [144.954, -37.8102], [144.9545, -37.8105]], type: 'footway', character: 'park' },
  { name: 'Flagstaff Gardens Walk E', points: [[144.9545, -37.8085], [144.955, -37.8088], [144.955, -37.8093], [144.955, -37.8098]], type: 'footway', character: 'park' },

  // ═══════════════════════════════════════════
  // CROSS-LINKS — stitch expansion to CBD edges
  // ═══════════════════════════════════════════
  // South links (Flinders St area → Southbank Promenade)
  { name: null, points: [[144.957, -37.8200], [144.957, -37.8208]], type: 'footway', character: 'side' },
  { name: null, points: [[144.959, -37.8200], [144.959, -37.8206]], type: 'footway', character: 'side' },
  { name: null, points: [[144.961, -37.8200], [144.961, -37.8206]], type: 'footway', character: 'side' },
  { name: null, points: [[144.963, -37.8200], [144.963, -37.8205]], type: 'footway', character: 'side' },
  { name: null, points: [[144.965, -37.8200], [144.965, -37.8205]], type: 'footway', character: 'side' },
  { name: null, points: [[144.967, -37.8200], [144.967, -37.8204]], type: 'footway', character: 'side' },
  { name: null, points: [[144.969, -37.8200], [144.969, -37.8204]], type: 'footway', character: 'side' },
  { name: null, points: [[144.971, -37.8200], [144.971, -37.8203]], type: 'footway', character: 'side' },
  // East links (Spring St area → East Melbourne)
  { name: null, points: [[144.975, -37.8110], [144.9755, -37.8110]], type: 'footway', character: 'side' },
  { name: null, points: [[144.975, -37.8130], [144.9755, -37.8130]], type: 'footway', character: 'side' },
  { name: null, points: [[144.975, -37.8140], [144.9755, -37.8140]], type: 'footway', character: 'side' },
  { name: null, points: [[144.975, -37.8155], [144.975, -37.8155]], type: 'footway', character: 'side' },
  { name: null, points: [[144.975, -37.8170], [144.9755, -37.8170]], type: 'footway', character: 'side' },
  // North links (La Trobe area → Carlton)
  { name: null, points: [[144.960, -37.8100], [144.960, -37.8095]], type: 'footway', character: 'side' },
  { name: null, points: [[144.962, -37.8100], [144.962, -37.8095]], type: 'footway', character: 'side' },
  { name: null, points: [[144.964, -37.8100], [144.964, -37.8095]], type: 'footway', character: 'side' },
  { name: null, points: [[144.966, -37.8100], [144.966, -37.8095]], type: 'footway', character: 'side' },
  { name: null, points: [[144.968, -37.8100], [144.968, -37.8095]], type: 'footway', character: 'side' },
  { name: null, points: [[144.970, -37.8100], [144.970, -37.8095]], type: 'footway', character: 'side' },
  { name: null, points: [[144.972, -37.8100], [144.972, -37.8095]], type: 'footway', character: 'side' },
  // West links (Elizabeth/William area → Spencer/King)
  { name: null, points: [[144.955, -37.8080], [144.955, -37.8080]], type: 'footway', character: 'side' },
  { name: null, points: [[144.955, -37.8100], [144.955, -37.8100]], type: 'footway', character: 'side' },
  { name: null, points: [[144.955, -37.8115], [144.955, -37.8115]], type: 'footway', character: 'side' },
  { name: null, points: [[144.955, -37.8130], [144.955, -37.8130]], type: 'footway', character: 'side' },
  { name: null, points: [[144.955, -37.8145], [144.955, -37.8145]], type: 'footway', character: 'side' },
  { name: null, points: [[144.955, -37.8160], [144.955, -37.8160]], type: 'footway', character: 'side' },
  { name: null, points: [[144.955, -37.8175], [144.955, -37.8175]], type: 'footway', character: 'side' },
];

function main() {
  console.log('Reading existing graph...');
  const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

  const existingNodeIds = new Set(data.nodes.map(n => n.id));
  const existingEdgeIds = new Set(data.edges.map(e => e.id));

  let nextNodeId = Math.max(...data.nodes.map(n => n.id)) + 1000;
  let nextEdgeIdx = data.edges.length;

  const newNodes = [];
  const newEdges = [];

  for (const street of EXPANSION_STREETS) {
    const streetNodeIds = [];

    // Create nodes for each point
    for (const [lng, lat] of street.points) {
      const nodeId = nextNodeId++;
      streetNodeIds.push(nodeId);
      newNodes.push({ id: nodeId, lng, lat });
    }

    // Create edges between consecutive nodes
    for (let i = 0; i < streetNodeIds.length - 1; i++) {
      const fromId = streetNodeIds[i];
      const toId = streetNodeIds[i + 1];
      const fromPt = street.points[i];
      const toPt = street.points[i + 1];
      const edgeId = `exp_${nextEdgeIdx++}`;
      const length_m = Math.round(haversineM(fromPt[0], fromPt[1], toPt[0], toPt[1]) * 10) / 10;

      newEdges.push({
        id: edgeId,
        fromNodeId: fromId,
        toNodeId: toId,
        wayId: 9000000 + nextEdgeIdx,
        geometry: [fromPt, toPt],
        length_m,
        name: street.name?.replace(/ \(.*\)$/, '').replace(/ Link \d$/, '').replace(/ Path.*$/, ' Path') ?? null,
        highwayType: street.type,
        metrics: generateMetrics(edgeId, street.character),
      });
    }
  }

  // Add new data
  data.nodes = [...data.nodes, ...newNodes];
  data.edges = [...data.edges, ...newEdges];
  data.meta = {
    ...data.meta,
    baked_at: new Date().toISOString(),
    edge_count: data.edges.length,
    node_count: data.nodes.length,
  };

  console.log(`Added ${newNodes.length} nodes, ${newEdges.length} edges`);
  console.log(`Total: ${data.nodes.length} nodes, ${data.edges.length} edges`);

  // Compute new bounds
  const lngs = data.nodes.map(n => n.lng);
  const lats = data.nodes.map(n => n.lat);
  console.log(`New extent: lng ${Math.min(...lngs).toFixed(4)}–${Math.max(...lngs).toFixed(4)}, lat ${Math.min(...lats).toFixed(4)}–${Math.max(...lats).toFixed(4)}`);

  console.log('Writing expanded graph...');
  fs.writeFileSync(OUTPUT, JSON.stringify(data));
  const sizeMb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
  console.log(`Done: ${sizeMb} MB`);
}

main();
