import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("api/graph", "routes/api.graph.ts"),
  route("api/explain", "routes/api.explain.ts"),
] satisfies RouteConfig;
