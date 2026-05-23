import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "citystride-runtime", time: new Date().toISOString() });
});

app.post("/api/plan-walk", async (_req, res) => {
  // TODO: load graph, run A* 3 times with edge penalties, return Route[]
  res.json({ routes: [], computed_at_time: 0 });
});

app.get("/api/describe-segment/:id", async (_req, res) => {
  // TODO: lookup edge, compute composite score at current time, return metrics
  res.json({ edge_id: _req.params.id, composite_score: 0, metrics: {}, confidence: {} });
});

app.post("/api/explain-route", async (_req, res) => {
  // TODO: call Claude API with route segments + metrics, stream response back
  res.status(501).json({ error: "not implemented" });
});

app.listen(PORT, () => {
  console.log(`citystride-runtime listening on http://localhost:${PORT}`);
});
