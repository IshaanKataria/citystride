export interface EdgeMetrics {
  readonly lux: number;
  readonly gentle_gradient: number;
  readonly surface_quality: number;
  readonly canopy: number;
  readonly bailout_proximity: number;
  readonly ped_count: readonly number[];
  readonly open_venues: readonly number[];
}

export interface GraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly geometry: readonly [number, number][];
  readonly length_m: number;
  readonly street_name: string;
  readonly metrics: EdgeMetrics;
  readonly confidence: {
    readonly ped_count: { readonly distance_to_sensor_m: number };
  };
}

export interface GraphNode {
  readonly id: string;
  readonly lng: number;
  readonly lat: number;
}

export interface GraphArtifact {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly addresses: readonly AddressRecord[];
  readonly bounds: {
    readonly minLng: number;
    readonly maxLng: number;
    readonly minLat: number;
    readonly maxLat: number;
  };
}

export interface AddressRecord {
  readonly address: string;
  readonly lng: number;
  readonly lat: number;
  readonly nearestNodeId: string;
}

export interface ScoredEdge {
  readonly edge: GraphEdge;
  readonly score: number;
}

export interface Route {
  readonly id: number;
  readonly edges: readonly GraphEdge[];
  readonly geometry: readonly [number, number][];
  readonly score: number;
  readonly length_m: number;
}

export interface AppState {
  readonly viewport: { readonly lng: number; readonly lat: number; readonly zoom: number };
  readonly time: number;
  readonly routeQuery: {
    readonly from: string;
    readonly to: string;
    readonly fromNode: string;
    readonly toNode: string;
  } | null;
  readonly routes: readonly Route[] | null;
  readonly routeComputedAt: number | null;
  readonly pinnedSegmentId: string | null;
  readonly openExplanationRouteId: number | null;
}
