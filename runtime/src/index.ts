import express from "express";
import cors from "cors";
import { getArtifact, getEdgeById, nearestNodeTo } from "./graph-loader.ts";
import { findRoute, findThreeRoutes } from "./routing.ts";
import { composite } from "./scoring.ts";
import { streamExplanation } from "./explain.ts";
import type { PlanWalkRequest, PlanWalkResponse, DescribeSegmentResponse } from "../../shared/types.ts";

const app = express();
const PORT = Number(process.env.PORT ?? 4001);

app.use(cors());
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "citystride-runtime", time: new Date().toISOString() });
});

app.get("/api/graph", async (_req, res) => {
  try {
    const artifact = await getArtifact();
    res.json(artifact);
  } catch (err) {
    console.error("graph load failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/plan-walk", async (req, res) => {
  try {
    const body = req.body as PlanWalkRequest & { single?: boolean };
    const { from, to, time } = body;
    if (!from || !to || typeof time !== "number") {
      return res.status(400).json({ error: "missing from/to/time" });
    }
    const fromNode = await nearestNodeTo(from[0], from[1]);
    const toNode = await nearestNodeTo(to[0], to[1]);

    const routes = body.single
      ? await (async () => {
          const r = await findRoute(fromNode.id, toNode.id, time);
          return r ? [r] : [];
        })()
      : await findThreeRoutes(fromNode.id, toNode.id, time);

    const response: PlanWalkResponse = { routes, computed_at_time: time };
    res.json(response);
  } catch (err) {
    console.error("plan-walk failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/describe-segment/:id", async (req, res) => {
  try {
    const time = Number(req.query.time ?? 94);
    const edge = await getEdgeById(req.params.id);
    if (!edge) return res.status(404).json({ error: "edge not found" });
    const h = Math.max(0, Math.min(167, Math.floor(time)));
    const response: DescribeSegmentResponse = {
      edge_id: edge.id,
      street_name: edge.street_name,
      composite_score: composite(edge, h),
      metrics: {
        lux: edge.lux,
        gentle_gradient: edge.gentle_gradient,
        surface_quality: edge.surface_quality,
        canopy: edge.canopy,
        bailout_proximity: edge.bailout_proximity,
        ped_count: edge.ped_count[h],
        open_venues: edge.open_venues[h],
      },
      confidence: edge.confidence,
    };
    res.json(response);
  } catch (err) {
    console.error("describe-segment failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/explain-route", async (req, res) => {
  const { route, time, destinationLabel } = req.body ?? {};
  if (!route || typeof time !== "number") {
    res.status(400).json({ error: "missing route or time" });
    return;
  }
  await streamExplanation(route, time, res, destinationLabel);
});

app.listen(PORT, () => {
  console.log(`citystride-runtime listening on http://localhost:${PORT}`);
});
