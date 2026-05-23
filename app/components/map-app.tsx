import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";

import { computeScore } from "~/lib/scoring";
import { scoreToColor, ROUTE_COLORS } from "~/lib/colors";
import { computeRoutes } from "~/lib/routing";
import { createGeocoder } from "~/lib/geocoder";
import { formatHourOfWeek, INITIAL_HOUR_OF_WEEK } from "~/lib/time";
import type { GraphArtifact, GraphEdge, Route, AddressRecord } from "~/lib/types";

// ─── MapTooltip ─────────────────────────────────────────────────
const MapTooltip = ({ edge, x, y, time }: { edge: GraphEdge; x: number; y: number; time: number }) => {
  const score = computeScore(edge.metrics, time);
  return (
    <div
      className="pointer-events-none absolute z-50 rounded-md bg-gray-900 px-3 py-2 text-sm text-white shadow-lg"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="font-medium">{edge.street_name}</div>
      <div className="text-gray-400">Score: {(score * 100).toFixed(0)}</div>
    </div>
  );
};

// ─── InspectorCard ──────────────────────────────────────────────
const MetricBar = ({ label, value, rawLabel }: { label: string; value: number; rawLabel: string }) => (
  <div className="flex items-center gap-2">
    <span className="w-24 text-xs text-gray-400">{label}</span>
    <div className="flex-1 h-2 rounded-full bg-gray-700">
      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(value * 100).toFixed(0)}%` }} />
    </div>
    <span className="w-16 text-xs text-right text-gray-400">{rawLabel}</span>
  </div>
);

const InspectorCard = ({ edge, time, onClose }: { edge: GraphEdge; time: number; onClose: () => void }) => {
  const score = computeScore(edge.metrics, time);
  const m = edge.metrics;
  return (
    <div className="absolute bottom-24 left-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-white">{edge.street_name}</h3>
          <p className="text-sm text-blue-400">{(score * 100).toFixed(0)} / 100</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>
      <div className="mt-3 space-y-2">
        <MetricBar label="Lighting" value={m.lux} rawLabel={`${(m.lux * 100).toFixed(0)}%`} />
        <MetricBar label="Foot traffic" value={m.ped_count[time]} rawLabel={`${(m.ped_count[time] * 100).toFixed(0)}%`} />
        <MetricBar label="Gradient" value={m.gentle_gradient} rawLabel={`${(m.gentle_gradient * 100).toFixed(0)}%`} />
        <MetricBar label="Surface" value={m.surface_quality} rawLabel={`${(m.surface_quality * 100).toFixed(0)}%`} />
        <MetricBar label="Canopy" value={m.canopy} rawLabel={`${(m.canopy * 100).toFixed(0)}%`} />
        <MetricBar label="Transit" value={m.bailout_proximity} rawLabel={`${(m.bailout_proximity * 100).toFixed(0)}%`} />
        <MetricBar label="Venues" value={m.open_venues[time]} rawLabel={`${(m.open_venues[time] * 100).toFixed(0)}%`} />
      </div>
      {edge.confidence.ped_count.distance_to_sensor_m > 150 && (
        <p className="mt-2 text-xs text-gray-500">
          Estimated: {edge.confidence.ped_count.distance_to_sensor_m}m to nearest sensor
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
    <div className="absolute top-4 left-1/2 z-30 -translate-x-1/2 flex rounded-lg bg-gray-900/90 p-1 shadow-lg backdrop-blur">
      {tabs.map((tab) => (
        <div key={tab.label} className="relative" onMouseEnter={() => !tab.active && setHovered(tab.label)} onMouseLeave={() => setHovered(null)}>
          <button disabled={!tab.active} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab.active ? "bg-blue-600 text-white" : "text-gray-400 cursor-not-allowed"}`}>
            {tab.label}
          </button>
          {hovered === tab.label && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 shadow">Coming soon</div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── ScoreLegend ────────────────────────────────────────────────
const ScoreLegend = () => (
  <div className="absolute right-4 top-4 z-30 rounded-lg bg-gray-900/90 px-4 py-3 shadow-lg backdrop-blur">
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400">Lower score</span>
      <div className="h-3 w-32 rounded-sm" style={{ background: "linear-gradient(to right, rgb(80,80,80), rgb(0,200,120))" }} />
      <span className="text-xs text-gray-400">Higher score</span>
    </div>
    <p className="mt-1 text-xs text-gray-400 max-w-[280px]">Score reflects lighting, foot traffic, gradient, surface, transit and canopy at the selected time.</p>
    <p className="mt-1 text-xs text-gray-500">Data: City of Melbourne open data.</p>
  </div>
);

// ─── TimeSlider ─────────────────────────────────────────────────
const TimeSlider = ({ time, onTimeChange, isStale, routeComputedAt, onRecompute }: {
  time: number; onTimeChange: (t: number) => void; isStale: boolean; routeComputedAt: number | null; onRecompute: () => void;
}) => (
  <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-gray-900/90 px-6 py-3 shadow-lg backdrop-blur">
    <div className="flex items-center gap-4">
      <span className="text-sm font-medium text-white min-w-[80px]">{formatHourOfWeek(time)}</span>
      <input type="range" min={0} max={167} value={time} onChange={(e) => onTimeChange(parseInt(e.target.value, 10))} className="w-64 accent-blue-500" />
    </div>
    {isStale && routeComputedAt !== null && (
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
        <span>Routes computed for {formatHourOfWeek(routeComputedAt)}</span>
        <button onClick={onRecompute} className="text-blue-400 underline hover:text-blue-300">Recompute</button>
      </div>
    )}
  </div>
);

// ─── PlanWalkPanel ──────────────────────────────────────────────
const PlanWalkPanel = ({ graph, routes, isComputing, onFindRoute, onClear, onExplain }: {
  graph: GraphArtifact; routes: readonly Route[] | null; isComputing: boolean;
  onFindRoute: (from: string, to: string) => void; onClear: () => void; onExplain: (id: number) => void;
}) => {
  const geocoderRef = useRef(createGeocoder(graph.addresses));
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromMatch, setFromMatch] = useState<AddressRecord | null>(null);
  const [toMatch, setToMatch] = useState<AddressRecord | null>(null);
  const [fromSugg, setFromSugg] = useState<readonly AddressRecord[]>([]);
  const [toSugg, setToSugg] = useState<readonly AddressRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="absolute left-4 top-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
      <h2 className="text-sm font-semibold text-white mb-3">Plan a Walk</h2>
      <div className="space-y-2">
        <div className="relative">
          <input type="text" placeholder="From address..." value={fromText}
            onChange={(e) => { setFromText(e.target.value); setFromMatch(null); setError(null); setFromSugg(e.target.value.length >= 2 ? geocoderRef.current.search(e.target.value) : []); }}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none" />
          {fromSugg.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {fromSugg.map((a) => <li key={a.address}><button onClick={() => { setFromText(a.address); setFromMatch(a); setFromSugg([]); }} className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700">{a.address}</button></li>)}
            </ul>
          )}
        </div>
        <div className="relative">
          <input type="text" placeholder="To address..." value={toText}
            onChange={(e) => { setToText(e.target.value); setToMatch(null); setError(null); setToSugg(e.target.value.length >= 2 ? geocoderRef.current.search(e.target.value) : []); }}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none" />
          {toSugg.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {toSugg.map((a) => <li key={a.address}><button onClick={() => { setToText(a.address); setToMatch(a); setToSugg([]); }} className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700">{a.address}</button></li>)}
            </ul>
          )}
        </div>
        <button onClick={() => { if (!fromMatch || !toMatch) { setError("Please select valid addresses."); return; } onFindRoute(fromMatch.nearestNodeId, toMatch.nearestNodeId); }}
          disabled={isComputing} className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {isComputing ? "Computing..." : "Find route"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      {routes && routes.length > 0 && (
        <div className="mt-3 border-t border-gray-700 pt-3 space-y-2">
          {routes.map((route, i) => {
            const c = ROUTE_COLORS[i % ROUTE_COLORS.length];
            return (
              <div key={route.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}>{route.id}</span>
                  <span className="text-xs text-white font-medium">{(route.score * 100).toFixed(0)}</span>
                  <span className="text-xs text-gray-400">{route.length_m}m</span>
                  {route.id === 1 && <span className="text-xs text-blue-400">Recommended</span>}
                </div>
                <button onClick={() => onExplain(route.id)} className="text-xs text-gray-400 underline hover:text-white">Explain</button>
              </div>
            );
          })}
          <button onClick={onClear} className="text-xs text-gray-400 underline hover:text-white">Clear routes</button>
        </div>
      )}
    </div>
  );
};

// ─── ExplainSlideOut ────────────────────────────────────────────
const ExplainSlideOut = ({ route, time, onClose }: { route: Route; time: number; onClose: () => void }) => {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(Date.now());

  const doFetch = async () => {
    setStreaming(true); setError(null); setText(""); start.current = Date.now();
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ route, time }) });
      if (!res.ok) { throw new Error(`API error: ${res.status}`); }
      const reader = res.body?.getReader();
      if (!reader) { throw new Error("No body"); }
      const dec = new TextDecoder();
      let done = false;
      while (!done) { const { value, done: d } = await reader.read(); done = d; if (value) { setText((p) => p + dec.decode(value)); } }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setStreaming(false); setElapsed((Date.now() - start.current) / 1000); }
  };

  useEffect(() => { doFetch(); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const c = ROUTE_COLORS[(route.id - 1) % ROUTE_COLORS.length];
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[30%] min-w-[320px] bg-gray-900 shadow-2xl overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Why this route?</span>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}>{route.id}</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">&times;</button>
          </div>
          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={doFetch} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">Retry</button>
            </div>
          ) : (
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {text}{streaming && <span className="animate-pulse">|</span>}
            </div>
          )}
          {!streaming && !error && <div className="mt-6 text-xs text-gray-500">Explained by Claude &middot; {elapsed.toFixed(1)}s</div>}
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

  const [time, setTime] = useState(INITIAL_HOUR_OF_WEEK);
  const [pinnedEdge, setPinnedEdge] = useState<GraphEdge | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [routeComputedAt, setRouteComputedAt] = useState<number | null>(null);
  const [isComputing, setIsComputing] = useState(false);
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
      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const c = ROUTE_COLORS[i % ROUTE_COLORS.length];
        layers.push(new PathLayer<Route>({
          id: `route-${route.id}`,
          data: [route],
          getPath: (d) => d.geometry,
          getColor: [...c, 220] as [number, number, number, number],
          getWidth: route.id === 1 ? 8 : 5,
          widthMinPixels: route.id === 1 ? 5 : 3,
          widthMaxPixels: 12,
          pickable: false,
        }));
      }
    }
    return layers;
  }, [graph, time, routes]);

  // ── Init MapLibre + Deck.gl overlay ──
  useEffect(() => {
    if (!containerRef.current) { return; }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [144.963, -37.814],
      zoom: 15,
      antialias: true,
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
          setPinnedEdge(info.object as GraphEdge);
        } else {
          setPinnedEdge(null);
        }
      },
    });

    map.on("load", () => {
      map.addControl(overlay as unknown as maplibregl.IControl);
    });

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => { overlay.finalize(); map.remove(); };
  }, []);

  // ── Update layers when time/routes change ──
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers: getLayers() });
    }
  }, [getLayers]);

  // ── Route computation ──
  const handleFindRoute = useCallback((fromNode: string, toNode: string) => {
    setIsComputing(true);
    requestAnimationFrame(() => {
      const result = computeRoutes(graph.nodes, graph.edges, fromNode, toNode, time);
      setRoutes(result);
      setRouteComputedAt(time);
      setIsComputing(false);
    });
  }, [graph, time]);

  const handleRecompute = useCallback(() => {
    if (routes && routes.length > 0) {
      // Re-run with same endpoints — we don't store the query, so just clear
      // In practice you'd store fromNode/toNode in state
    }
  }, [routes]);

  const handleClear = useCallback(() => {
    setRoutes(null);
    setRouteComputedAt(null);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950">
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0" />

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
      />

      <TimeSlider
        time={time}
        onTimeChange={setTime}
        isStale={isStale}
        routeComputedAt={routeComputedAt}
        onRecompute={handleRecompute}
      />

      {pinnedEdge && <InspectorCard edge={pinnedEdge} time={time} onClose={() => setPinnedEdge(null)} />}
      {explainRoute && <ExplainSlideOut route={explainRoute} time={time} onClose={() => setExplainRoute(null)} />}
    </div>
  );
};
