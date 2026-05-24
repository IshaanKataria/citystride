import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";

import { computeScore, metricForTime } from "~/lib/scoring";
import { scoreToColor, ROUTE_COLORS } from "~/lib/colors";
import { formatHourOfWeek, INITIAL_HOUR_OF_WEEK } from "~/lib/time";
import type { WorkerMessage, WorkerResponse } from "~/lib/routing.worker";
import type { GraphArtifact, GraphEdge, Route, RouteKind } from "~/lib/types";

const KIND_LABEL: Record<import("~/lib/types").RouteKind, string> = {
  lively:     "Lively",
  accessible: "Accessible",
  shortest:   "Shortest",
};

// ─── MapTooltip ─────────────────────────────────────────────────
const MapTooltip = ({ edge, x, y, time }: { edge: GraphEdge; x: number; y: number; time: number }) => {
  const score = computeScore(edge.metrics, time);
  return (
    <div
      className="pointer-events-none absolute z-50 rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg border border-border"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="font-medium">{edge.name}</div>
      <div className="text-muted-foreground">Score: {(score * 100).toFixed(0)}</div>
    </div>
  );
};

// ─── InspectorCard ──────────────────────────────────────────────
const MetricBar = ({ label, value, rawLabel }: { label: string; value: number; rawLabel: string }) => (
  <div className="flex items-center gap-2">
    <span className="w-24 text-xs text-muted-foreground">{label}</span>
    <div className="flex-1 h-2 rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${(value * 100).toFixed(0)}%` }} />
    </div>
    <span className="w-16 text-xs text-right text-muted-foreground">{rawLabel}</span>
  </div>
);

const CARD_W = 288; // w-72
const CARD_H = 260; // approximate height
const OFFSET = 12;  // px gap from cursor

const InspectorCard = ({ edge, x, y, time, onClose }: { edge: GraphEdge; x: number; y: number; time: number; onClose: () => void }) => {
  const score = computeScore(edge.metrics, time);
  const m = edge.metrics;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = x + OFFSET + CARD_W > vw ? x - CARD_W - OFFSET : x + OFFSET;
  const top = y + OFFSET + CARD_H > vh ? y - CARD_H - OFFSET : y + OFFSET;
  return (
    <div className="absolute z-30 w-72 rounded-lg bg-card/95 p-4 shadow-lg backdrop-blur border border-border" style={{ left, top }}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-card-foreground">{edge.name}</h3>
          <p className="text-sm text-primary">{(score * 100).toFixed(0)} / 100</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
      </div>
      <div className="mt-3 space-y-2">
        <MetricBar label="Lighting" value={m.lux} rawLabel={`${(m.lux * 100).toFixed(0)}%`} />
        <MetricBar label="Foot traffic" value={metricForTime(m.ped_vector, time)} rawLabel={`${(metricForTime(m.ped_vector, time) * 100).toFixed(0)}%`} />
        <MetricBar label="Steepness" value={m.steepness} rawLabel={`${(m.steepness * 100).toFixed(0)}%`} />
        <MetricBar label="Surface" value={m.surface} rawLabel={`${(m.surface * 100).toFixed(0)}%`} />
        <MetricBar label="Canopy" value={m.canopy} rawLabel={`${(m.canopy * 100).toFixed(0)}%`} />
        <MetricBar label="Transit" value={m.transit} rawLabel={`${(m.transit * 100).toFixed(0)}%`} />
        <MetricBar label="Venues" value={metricForTime(m.venues_vector, time)} rawLabel={`${(metricForTime(m.venues_vector, time) * 100).toFixed(0)}%`} />
      </div>
      {m.ped_confidence.nearest_sensor_m !== null && m.ped_confidence.nearest_sensor_m > 150 && (
        <p className="mt-2 text-xs text-muted-foreground/60">
          Estimated: {m.ped_confidence.nearest_sensor_m}m to nearest sensor
        </p>
      )}
    </div>
  );
};

// ─── GhostTabs ──────────────────────────────────────────────────
const GhostTabs = () => {
  const [hovered, setHovered] = useState<string | null>(null);
  const tabs = [
    { label: "Walk", active: true },
    { label: "Run", active: false },
    { label: "Cycle", active: false },
    { label: "Events", active: false },
  ];
  return (
    <div className="absolute top-4 left-1/2 z-30 -translate-x-1/2 flex rounded-lg bg-card/95 p-1 shadow-lg backdrop-blur border border-border">
      {tabs.map((tab) => (
        <div key={tab.label} className="relative" onMouseEnter={() => !tab.active && setHovered(tab.label)} onMouseLeave={() => setHovered(null)}>
          <button disabled={!tab.active} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab.active ? "bg-primary text-primary-foreground" : "text-muted-foreground cursor-not-allowed"}`}>
            {tab.label}
          </button>
          {hovered === tab.label && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-muted-foreground shadow border border-border">Coming soon</div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── ScoreLegend ────────────────────────────────────────────────
const ScoreLegend = () => (
  <div className="absolute right-4 top-4 z-30 rounded-lg bg-card/95 px-4 py-3 shadow-lg backdrop-blur border border-border">
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Lower score</span>
      <div className="h-3 w-32 rounded-sm" style={{ background: "linear-gradient(to right, rgb(220,50,50), rgb(250,200,50), rgb(50,205,100))" }} />
      <span className="text-xs text-muted-foreground">Higher score</span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground max-w-[280px]">Score reflects lighting, foot traffic, steepness, surface, transit and canopy at the selected time.</p>
    <p className="mt-1 text-xs text-muted-foreground/60">Data: City of Melbourne open data.</p>
  </div>
);

// ─── TimeSlider ─────────────────────────────────────────────────
const TimeSlider = ({ time, onTimeChange, isStale, routeComputedAt, onRecompute }: {
  time: number; onTimeChange: (t: number) => void; isStale: boolean; routeComputedAt: number | null; onRecompute: () => void;
}) => (
  <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-card/95 px-6 py-3 shadow-lg backdrop-blur border border-border">
    <div className="flex items-center gap-4">
      <span className="text-sm font-medium text-foreground min-w-[80px]">{formatHourOfWeek(time)}</span>
      <input type="range" min={0} max={167} value={time} onChange={(e) => onTimeChange(parseInt(e.target.value, 10))} className="w-64 accent-primary" />
    </div>
    {isStale && routeComputedAt !== null && (
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Routes computed for {formatHourOfWeek(routeComputedAt)}</span>
        <button onClick={onRecompute} className="text-primary underline hover:text-primary/80">Recompute</button>
      </div>
    )}
  </div>
);

// ─── PlanWalkPanel ──────────────────────────────────────────────
function formatLength(m: number): string {
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function googleMapsUrl(route: Route): string {
  const pts = route.geometry;
  if (!pts || pts.length < 2) return "";
  const origin = pts[0];
  const dest = pts[pts.length - 1];
  const interior = pts.slice(1, -1);
  const wpCount = Math.min(8, interior.length);
  const sampled: [number, number][] = [];
  if (wpCount > 0 && interior.length > 0) {
    const step = interior.length / wpCount;
    for (let i = 0; i < wpCount; i++) sampled.push(interior[Math.floor(i * step)]);
  }
  const fmt = (p: [number, number]) => `${p[1]},${p[0]}`;
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(origin),
    destination: fmt(dest),
    travelmode: "walking",
  });
  if (sampled.length > 0) params.set("waypoints", sampled.map(fmt).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

const PlanWalkPanel = ({ graph, routes, isComputing, onFindRoute, onClear, onExplain, selectedKind, onSelectKind }: {
  graph: GraphArtifact; routes: readonly Route[] | null; isComputing: boolean;
  onFindRoute: (from: number, to: number) => void; onClear: () => void; onExplain: (id: number) => void;
  selectedKind: RouteKind; onSelectKind: (kind: RouteKind) => void;
}) => {
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromNode, setFromNode] = useState<number | null>(null);
  const [toNode, setToNode] = useState<number | null>(null);
  const [fromSugg, setFromSugg] = useState<readonly GraphEdge[]>([]);
  const [toSugg, setToSugg] = useState<readonly GraphEdge[]>([]);
  const [error, setError] = useState<string | null>(null);

  const searchStreets = useCallback((query: string): readonly GraphEdge[] => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    const seen = new Set<string>();
    const results: GraphEdge[] = [];
    for (const edge of graph.edges) {
      if (!edge.name || seen.has(edge.name)) continue;
      if (edge.name.toLowerCase().includes(q)) {
        seen.add(edge.name);
        results.push(edge);
        if (results.length >= 5) break;
      }
    }
    return results;
  }, [graph.edges]);

  return (
    <div className="absolute left-4 top-4 z-30 w-72 rounded-lg bg-card/95 p-4 shadow-lg backdrop-blur border border-border">
      <h2 className="text-sm font-semibold text-card-foreground mb-3">Plan a Walk</h2>
      <div className="space-y-2">
        <div className="relative">
          <input type="text" placeholder="From street..." value={fromText}
            onChange={(e) => { setFromText(e.target.value); setFromNode(null); setError(null); setFromSugg(searchStreets(e.target.value)); }}
            onBlur={() => setTimeout(() => setFromSugg([]), 150)}
            className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          {fromSugg.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-popover border border-border shadow-lg">
              {fromSugg.map((e) => <li key={e.id}><button onClick={() => { setFromText(e.name); setFromNode(e.fromNodeId); setFromSugg([]); }} className="w-full px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent">{e.name}</button></li>)}
            </ul>
          )}
        </div>
        <div className="relative">
          <input type="text" placeholder="To street..." value={toText}
            onChange={(e) => { setToText(e.target.value); setToNode(null); setError(null); setToSugg(searchStreets(e.target.value)); }}
            onBlur={() => setTimeout(() => setToSugg([]), 150)}
            className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          {toSugg.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-popover border border-border shadow-lg">
              {toSugg.map((e) => <li key={e.id}><button onClick={() => { setToText(e.name); setToNode(e.fromNodeId); setToSugg([]); }} className="w-full px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent">{e.name}</button></li>)}
            </ul>
          )}
        </div>
        <button onClick={() => { if (fromNode === null || toNode === null) { setError("Please select valid streets."); return; } onFindRoute(fromNode, toNode); }}
          disabled={isComputing} className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {isComputing ? "Computing..." : "Find route"}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      {routes && routes.length > 0 && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          {routes.map((route, i) => {
            const c = ROUTE_COLORS[i % ROUTE_COLORS.length];
            return (
              <div key={route.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}>{route.id}</span>
                  <span className="text-xs text-card-foreground font-medium">{KIND_LABEL[route.kind]}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatLength(route.length_m)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => onExplain(route.id)} className="text-xs text-muted-foreground underline hover:text-foreground">Explain</button>
                  <a
                    href={googleMapsUrl(route)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Google Maps (walking directions)"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    aria-label="Open route in Google Maps"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </a>
                </div>
              </div>
            );
          })}
          <button onClick={onClear} className="text-xs text-muted-foreground underline hover:text-foreground">Clear routes</button>
        </div>
      )}
    </div>
  );
};

// ─── ExplainSlideOut ────────────────────────────────────────────

type Highlight = {
  icon: "tree" | "lightbulb" | "users" | "ruler" | "train" | "footprints";
  label: string;
  value: string;
  compare: string;
};

type StreetPick = { name: string; detail: string };

type Explanation = {
  headline: string;
  verdict: string;
  highlights: Highlight[];
  street_picks: StreetPick[];
};

const ICON_MAP: Record<Highlight["icon"], string> = {
  tree: "🌳",
  lightbulb: "💡",
  users: "👥",
  ruler: "📏",
  train: "🚊",
  footprints: "👣",
};

const ExplainSlideOut = ({
  route,
  allRoutes,
  time,
  onClose,
}: {
  route: Route;
  allRoutes: Route[] | null;
  time: number;
  onClose: () => void;
}) => {
  const [data, setData] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(Date.now());

  const doFetch = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    start.current = Date.now();
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route, allRoutes, time }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = (await res.json()) as Explanation | { error: string };
      if ("error" in json) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      setElapsed((Date.now() - start.current) / 1000);
    }
  };

  useEffect(() => {
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const c = ROUTE_COLORS[(route.id - 1) % ROUTE_COLORS.length];
  const accent = `rgb(${c[0]},${c[1]},${c[2]})`;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-[92vw] bg-gradient-to-b from-card to-card border-l border-border shadow-2xl overflow-y-auto">
        <div className="p-7 space-y-6">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-card"
                style={{ backgroundColor: accent }}
              >
                {route.id}
              </span>
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {KIND_LABEL[route.kind]} — Why this route?
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-2xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
          </header>

          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-7 w-3/4 rounded bg-muted" />
              <div className="h-4 w-5/6 rounded bg-muted" />
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-xl bg-muted" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 pt-2">Claude is comparing the three routes…</p>
            </div>
          )}

          {error && !loading && (
            <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">Couldn't generate the pitch.</p>
              <p className="text-xs text-destructive/60">{error}</p>
              <button
                onClick={doFetch}
                className="rounded-md bg-muted hover:bg-accent px-3 py-1.5 text-xs text-foreground"
              >
                Retry
              </button>
            </div>
          )}

          {data && !loading && (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-card-foreground leading-tight" style={{ color: accent }}>
                  {data.headline}
                </h2>
                <p className="mt-2 text-sm text-foreground leading-relaxed">{data.verdict}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {data.highlights.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border bg-muted/30 p-4 hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl">{ICON_MAP[h.icon] ?? "✦"}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{h.label}</span>
                    </div>
                    <div className="text-xl font-semibold text-card-foreground tabular-nums">{h.value}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{h.compare}</div>
                  </div>
                ))}
              </div>

              {data.street_picks.length > 0 && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
                    Streets you'll enjoy
                  </h3>
                  <div className="space-y-2">
                    {data.street_picks.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg bg-muted/20 border border-border p-3"
                      >
                        <div
                          className="mt-1 h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: accent }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-card-foreground">{s.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{s.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                Explained by Claude &middot; {elapsed.toFixed(1)}s
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

// ─── MapApp (main orchestrator) ─────────────────────────────────
export const MapApp = ({ graph }: { graph: GraphArtifact }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const requestIdRef = useRef(0);

  const [time, setTime] = useState(INITIAL_HOUR_OF_WEEK);
  const timeRef = useRef(INITIAL_HOUR_OF_WEEK);
  const [pinnedEdge, setPinnedEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [routeComputedAt, setRouteComputedAt] = useState<number | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [selectedKind, setSelectedKind] = useState<RouteKind>("lively");
  const [explainRoute, setExplainRoute] = useState<Route | null>(null);

  const isStale = routes !== null && routeComputedAt !== null && routeComputedAt !== time;

  // ── Build Deck.gl layers ──
  const getLayers = useCallback(() => {
    const hasRoutes = routes && routes.length > 0;

    const streetscoreLayer = new PathLayer<GraphEdge>({
      id: "streetscore",
      data: graph.edges as GraphEdge[],
      getPath: (d) => d.geometry,
      getColor: (d) => {
        const score = computeScore(d.metrics, time);
        const color = scoreToColor(score);
        return hasRoutes ? [color[0], color[1], color[2], 100] as [number, number, number, number] : color;
      },
      getWidth: 3,
      widthMinPixels: 2,
      widthMaxPixels: 8,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 120],
      updateTriggers: { getColor: [time, hasRoutes] },
    });

    const layers: any[] = [streetscoreLayer];

    if (routes) {
      const selected = routes.find(r => r.kind === selectedKind);
      if (selected) {
        const c = ROUTE_COLORS[(selected.id - 1) % ROUTE_COLORS.length];
        layers.push(new PathLayer<Route>({
          id: `route-${selected.id}`,
          data: [selected],
          getPath: (d) => d.geometry,
          getColor: [...c, 220] as [number, number, number, number],
          getWidth: 8,
          widthMinPixels: 5,
          widthMaxPixels: 12,
          pickable: false,
        }));
      }
    }
    return layers;
  }, [graph, time, routes, selectedKind]);

  // ── Init MapLibre + Deck.gl overlay ──
  useEffect(() => {
    if (!containerRef.current) { return; }

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const node of graph.nodes) {
      if (node.lng < minLng) minLng = node.lng;
      if (node.lng > maxLng) maxLng = node.lng;
      if (node.lat < minLat) minLat = node.lat;
      if (node.lat > maxLat) maxLat = node.lat;
    }
    const maxBounds: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [144.965, -37.816],
      zoom: 15,
      maxBounds,
    });

    map.on("error", (e) => {
      console.error("MapLibre error:", e);
    });

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onHover: (info) => {
        if (info.object) {
          setHoveredEdge({ edge: info.object as GraphEdge, x: info.x, y: info.y });
        } else {
          setHoveredEdge(null);
        }
      },
      onClick: (info) => {
        if (info.object) {
          setPinnedEdge({ edge: info.object as GraphEdge, x: info.x, y: info.y });
        } else {
          setPinnedEdge(null);
        }
      },
    });

    map.on("load", () => {
      map.addControl(overlay as unknown as maplibregl.IControl);
      overlay.setProps({ layers: getLayers() });
    });

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => { overlay.finalize(); map.remove(); };
  }, []);

  // ── Routing worker lifecycle ──
  useEffect(() => {
    const worker = new Worker(new URL("../lib/routing.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    workerReadyRef.current = false;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        workerReadyRef.current = true;
      } else if (msg.type === "result") {
        if (msg.requestId === requestIdRef.current) {
          setRoutes(msg.routes);
          setRouteComputedAt(timeRef.current);
          setIsComputing(false);

          if (msg.routes.length > 0 && mapRef.current) {
            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
            for (const route of msg.routes) {
              for (const [lng, lat] of route.geometry) {
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
              }
            }
            mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, duration: 800 });
          }
        }
      }
    };

    worker.onerror = () => setIsComputing(false);

    const initMsg: WorkerMessage = { type: "init", nodes: graph.nodes, edges: graph.edges };
    worker.postMessage(initMsg);

    return () => { worker.terminate(); };
  }, [graph]);

  // ── Update layers when time/routes change ──
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers: getLayers() });
    }
  }, [getLayers]);

  // ── Route computation ──
  const handleFindRoute = useCallback((fromNode: number, toNode: number) => {
    if (!workerRef.current || !workerReadyRef.current) return;
    setIsComputing(true);
    const requestId = ++requestIdRef.current;
    const msg: WorkerMessage = { type: "compute", fromId: fromNode, toId: toNode, hourOfWeek: timeRef.current, requestId };
    workerRef.current.postMessage(msg);
  }, []);

  const handleRecompute = useCallback(() => {
    if (routes && routes.length > 0) {
      // Re-run with same endpoints — we don't store the query, so just clear
      // In practice you'd store fromNode/toNode in state
    }
  }, [routes]);

  const handleClear = useCallback(() => {
    setRoutes(null);
    setRouteComputedAt(null);
    setSelectedKind("lively");
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0 z-0" style={{ width: "100%", height: "100%" }} />

      {/* Hover tooltip */}
      {hoveredEdge && <MapTooltip edge={hoveredEdge.edge} x={hoveredEdge.x} y={hoveredEdge.y} time={time} />}

      {/* UI overlays */}
      <GhostTabs />
      <ScoreLegend />

      <PlanWalkPanel
        graph={graph}
        routes={routes}
        isComputing={isComputing}
        onFindRoute={handleFindRoute}
        onClear={handleClear}
        onExplain={(id) => { const r = routes?.find((rt) => rt.id === id); if (r) { setExplainRoute(r); } }}
        selectedKind={selectedKind}
        onSelectKind={setSelectedKind}
      />

      <TimeSlider
        time={time}
        onTimeChange={(t) => { setTime(t); timeRef.current = t; }}
        isStale={isStale}
        routeComputedAt={routeComputedAt}
        onRecompute={handleRecompute}
      />

      {pinnedEdge && <InspectorCard edge={pinnedEdge.edge} x={pinnedEdge.x} y={pinnedEdge.y} time={time} onClose={() => setPinnedEdge(null)} />}
      {explainRoute && (
        <ExplainSlideOut
          route={explainRoute}
          allRoutes={routes}
          time={time}
          onClose={() => setExplainRoute(null)}
        />
      )}
    </div>
  );
};
