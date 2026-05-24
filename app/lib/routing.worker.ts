import { computeRoutes } from "./routing";
import type { GraphEdge, GraphNode } from "./types";

let nodes: readonly GraphNode[] = [];
let edges: readonly GraphEdge[] = [];

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as WorkerMessage;

  if (msg.type === "init") {
    nodes = msg.nodes;
    edges = msg.edges;
    self.postMessage({ type: "ready" } satisfies WorkerResponse);
  } else if (msg.type === "compute") {
    const routes = computeRoutes(nodes, edges, msg.fromId, msg.toId, msg.hourOfWeek);
    self.postMessage({ type: "result", routes, requestId: msg.requestId } satisfies WorkerResponse);
  }
};

export type WorkerMessage =
  | { type: "init"; nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }
  | { type: "compute"; fromId: number; toId: number; hourOfWeek: number; requestId: number };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; routes: import("./types").Route[]; requestId: number };
