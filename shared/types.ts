export type LngLat = [number, number];

export type Polyline = LngLat[];

export type EdgeMetrics = {
  lux: number;
  gentle_gradient: number;
  surface_quality: number;
  canopy: number;
  bailout_proximity: number;
};

export type EdgeTimeVarying = {
  ped_count: number[];
  open_venues: number[];
};

export type EdgeConfidence = {
  ped_count: { distance_to_sensor_m: number };
};

export type Edge = {
  id: string;
  from_node: string;
  to_node: string;
  geometry: Polyline;
  length_m: number;
  street_name: string;
} & EdgeMetrics & EdgeTimeVarying & {
  confidence: EdgeConfidence;
};

export type Node = {
  id: string;
  position: LngLat;
};

export type Event = {
  id: string;
  name: string;
  description: string;
  url: string;
  start_date: string;
  end_date: string;
  venue_name: string;
  address: string | null;
  position: LngLat;
  resolved_via: "venues_json" | "alias_then_venues_json";
};

export type GraphArtifact = {
  version: string;
  built_at: string;
  bbox: [number, number, number, number];
  nodes: Node[];
  edges: Edge[];
  events?: Event[];
};

export type RouteSegment = {
  edge_id: string;
  street_name: string;
  geometry: Polyline;
  length_m: number;
  score_at_time: number;
};

export type Route = {
  id: number;
  total_length_m: number;
  avg_score: number;
  segments: RouteSegment[];
};

export type PlanWalkRequest = {
  from: LngLat;
  to: LngLat;
  time: number;
};

export type PlanWalkResponse = {
  routes: Route[];
  computed_at_time: number;
};

export type DescribeSegmentResponse = {
  edge_id: string;
  street_name: string;
  composite_score: number;
  metrics: EdgeMetrics & { ped_count: number; open_venues: number };
  confidence: EdgeConfidence;
};

export const WEIGHTS = {
  lux: 0.2,
  gentle_gradient: 0.15,
  surface_quality: 0.15,
  canopy: 0.15,
  bailout_proximity: 0.1,
  ped_count: 0.15,
  open_venues: 0.1,
} as const;

export const ROUTING_ALPHA = 1.5;
