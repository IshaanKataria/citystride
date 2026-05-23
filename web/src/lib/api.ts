import type {
  GraphArtifact,
  PlanWalkResponse,
  DescribeSegmentResponse,
  LngLat,
} from "../../../shared/types";

export async function fetchGraph(): Promise<GraphArtifact> {
  const r = await fetch("/api/graph");
  if (!r.ok) throw new Error(`graph fetch ${r.status}`);
  return r.json();
}

export async function planWalk(
  from: LngLat,
  to: LngLat,
  time: number
): Promise<PlanWalkResponse> {
  const r = await fetch("/api/plan-walk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, time }),
  });
  if (!r.ok) throw new Error(`plan-walk ${r.status}`);
  return r.json();
}

export async function describeSegment(
  id: string,
  time: number
): Promise<DescribeSegmentResponse> {
  const r = await fetch(`/api/describe-segment/${id}?time=${time}`);
  if (!r.ok) throw new Error(`describe ${r.status}`);
  return r.json();
}
