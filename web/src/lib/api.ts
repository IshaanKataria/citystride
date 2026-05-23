import type {
  GraphArtifact,
  PlanWalkResponse,
  DescribeSegmentResponse,
  Event,
  LngLat,
} from "../../../shared/types";
import { buildGraph, findThreeRoutes, describeSegment as describeLocal } from "./routing";

let graphReady = false;

async function fetchEvents(): Promise<Event[] | undefined> {
  try {
    const r = await fetch("/events.json");
    if (!r.ok) return undefined;
    return (await r.json()) as Event[];
  } catch {
    return undefined;
  }
}

export async function fetchGraph(): Promise<GraphArtifact> {
  // Try static-deployed graph first (works on Vercel + local), then fall back
  // to the runtime API if a local Express server is up.
  const candidates = ["/graph.json", "/api/graph"];
  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const artifact = (await r.json()) as GraphArtifact;
      if (!artifact.events) {
        const events = await fetchEvents();
        if (events) artifact.events = events;
      }
      buildGraph(artifact);
      graphReady = true;
      return artifact;
    } catch {
      continue;
    }
  }
  throw new Error("no graph source available");
}

export async function planWalk(
  from: LngLat,
  to: LngLat,
  time: number
): Promise<PlanWalkResponse> {
  if (!graphReady) throw new Error("graph not loaded");
  const routes = findThreeRoutes(from, to, time);
  return { routes, computed_at_time: time };
}

export async function describeSegment(
  id: string,
  time: number
): Promise<DescribeSegmentResponse> {
  if (!graphReady) throw new Error("graph not loaded");
  const result = describeLocal(id, time);
  if (!result) throw new Error("edge not found");
  return result as DescribeSegmentResponse;
}
