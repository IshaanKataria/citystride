export interface EdgeMetrics {
  readonly lux: number;
  readonly steepness: number;
  readonly surface: number;
  readonly transit: number;
  readonly canopy: number;
  readonly ped_vector: readonly number[];
  readonly venues_vector: readonly number[];
  readonly ped_confidence: {
    readonly nearest_sensor_m: number | null;
    readonly sensor_count: number;
    readonly is_interpolated: boolean;
  };
}

export interface GraphEdge {
  readonly id: string;
  readonly fromNodeId: number;
  readonly toNodeId: number;
  readonly wayId: number;
  readonly geometry: [number, number][];
  readonly length_m: number;
  readonly name: string;
  readonly highwayType: string;
  readonly metrics: EdgeMetrics;
}

export interface GraphNode {
  readonly id: number;
  readonly lng: number;
  readonly lat: number;
}

export interface GraphMeta {
  readonly baked_at: string;
  readonly edge_count: number;
  readonly node_count: number;
}

export interface GraphArtifact {
  readonly meta: GraphMeta;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export interface ScoredEdge {
  readonly edge: GraphEdge;
  readonly score: number;
}

export interface Route {
  readonly id: number;
  readonly edges: readonly GraphEdge[];
  readonly geometry: [number, number][];
  readonly score: number;
  readonly length_m: number;
}

export interface AppState {
  readonly viewport: { readonly lng: number; readonly lat: number; readonly zoom: number };
  readonly time: number;
  readonly routeQuery: {
    readonly fromNode: number;
    readonly toNode: number;
  } | null;
  readonly routes: readonly Route[] | null;
  readonly routeComputedAt: number | null;
  readonly pinnedSegmentId: string | null;
  readonly openExplanationRouteId: number | null;
}
