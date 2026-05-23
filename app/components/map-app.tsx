import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";

import { computeScore } from "~/lib/scoring";
import { scoreToColor, ROUTE_COLORS } from "~/lib/colors";
import { computeRoutes } from "~/lib/routing";
import { formatHourOfWeek, INITIAL_HOUR_OF_WEEK } from "~/lib/time";
import type { GraphArtifact, GraphEdge, Route, Event } from "~/lib/types";
import { useAppState } from "~/hooks/use-app-state";
import { findNearestNode } from "~/lib/graph-search";
import { activeEventsAt } from "~/lib/events";
import { EventListPanel } from "~/components/events/event-list-panel";

// ─── MapTooltip ─────────────────────────────────────────────────
const MapTooltip = ({ edge, x, y, time }: { edge: GraphEdge; x: number; y: number; time: number }) => {
  const score = computeScore(edge.metrics, time);
  return (
    <div
      className="pointer-events-none absolute z-50 rounded-md bg-gray-900 px-3 py-2 text-sm text-white shadow-lg"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="font-medium">{edge.name}</div>
      <div className="text-gray-400">Score: {(score * 100).toFixed(0)}</div>
    </div>
  );
};

// ─── EventDetailCard ────────────────────────────────────────────
function formatEventDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`;
}

const EventDetailCard = ({ event, onClose }: { event: import("~/lib/types").Event; onClose: () => void }) => (
  <div className="absolute bottom-24 left-4 z-30 w-80 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="font-medium text-white leading-tight">{event.name}</h3>
        <p className="text-xs text-amber-400 mt-1">
          {formatEventDateRange(event.start_date, event.end_date)}
        </p>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none flex-shrink-0">&times;</button>
    </div>
    <p className="mt-2 text-xs text-gray-400">
      {event.venue_name}{event.address ? ` · ${event.address}` : ""}
    </p>
    <p className="mt-3 text-xs text-gray-300 leading-relaxed">{event.description}</p>
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-block text-xs text-blue-400 underline hover:text-blue-300"
    >
      Open page →
    </a>
  </div>
);

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
          <h3 className="font-medium text-white">{edge.name}</h3>
          <p className="text-sm text-blue-400">{(score * 100).toFixed(0)} / 100</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>
      <div className="mt-3 space-y-2">
        <MetricBar label="Lighting" value={m.lux} rawLabel={`${(m.lux * 100).toFixed(0)}%`} />
        <MetricBar label="Foot traffic" value={m.ped_vector[time]} rawLabel={`${(m.ped_vector[time] * 100).toFixed(0)}%`} />
        <MetricBar label="Steepness" value={m.steepness} rawLabel={`${(m.steepness * 100).toFixed(0)}%`} />
        <MetricBar label="Surface" value={m.surface} rawLabel={`${(m.surface * 100).toFixed(0)}%`} />
        <MetricBar label="Canopy" value={m.canopy} rawLabel={`${(m.canopy * 100).toFixed(0)}%`} />
        <MetricBar label="Transit" value={m.transit} rawLabel={`${(m.transit * 100).toFixed(0)}%`} />
        <MetricBar label="Venues" value={m.venues_vector[time]} rawLabel={`${(m.venues_vector[time] * 100).toFixed(0)}%`} />
      </div>
      {m.ped_confidence.nearest_sensor_m !== null && m.ped_confidence.nearest_sensor_m > 150 && (
        <p className="mt-2 text-xs text-gray-500">
          Estimated: {m.ped_confidence.nearest_sensor_m}m to nearest sensor
        </p>
      )}
    </div>
  );
};

// ─── GhostTabs ──────────────────────────────────────────────────
type GhostTabsProps = {
  mode: import("~/lib/types").Mode;
  onModeChange: (m: import("~/lib/types").Mode) => void;
};

const GhostTabs = ({ mode, onModeChange }: GhostTabsProps) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const tabs: { label: string; value: "walk" | "event" | null; active: boolean }[] = [
    { label: "Walk", value: "walk", active: true },
    { label: "Run", value: null, active: false },
    { label: "Cycle", value: null, active: false },
    { label: "Events", value: "event", active: true },
  ];
  return (
    <div className="absolute top-4 left-1/2 z-30 -translate-x-1/2 flex rounded-lg bg-gray-900/90 p-1 shadow-lg backdrop-blur">
      {tabs.map((tab) => {
        const selected = tab.value !== null && tab.value === mode;
        return (
          <div
            key={tab.label}
            className="relative"
            onMouseEnter={() => !tab.active && setHovered(tab.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              disabled={!tab.active}
              onClick={() => { if (tab.active && tab.value) onModeChange(tab.value); }}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-blue-600 text-white"
                  : tab.active
                    ? "text-gray-300 hover:text-white"
                    : "text-gray-400 cursor-not-allowed"
              }`}
            >
              {tab.label}
            </button>
            {hovered === tab.label && !tab.active && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 shadow">Coming soon</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── ScoreLegend ────────────────────────────────────────────────
const ScoreLegend = () => (
  <div className="absolute right-4 top-4 z-30 rounded-lg bg-gray-900/90 px-4 py-3 shadow-lg backdrop-blur">
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400">Lower score</span>
      <div className="h-3 w-32 rounded-sm" style={{ background: "linear-gradient(to right, rgb(220,50,50), rgb(250,200,50), rgb(50,205,100))" }} />
      <span className="text-xs text-gray-400">Higher score</span>
    </div>
    <p className="mt-1 text-xs text-gray-400 max-w-[280px]">Score reflects lighting, foot traffic, steepness, surface, transit and canopy at the selected time.</p>
    <p className="mt-1 text-xs text-gray-500">Data: City of Melbourne open data.</p>
  </div>
);

// ─── TimeSlider ─────────────────────────────────────────────────
const TimeSlider = ({
  time, onTimeChange, isStale, routeComputedAt, onRecompute, eventsTodayCount,
}: {
  time: number;
  onTimeChange: (t: number) => void;
  isStale: boolean;
  routeComputedAt: number | null;
  onRecompute: () => void;
  eventsTodayCount?: number | null;
}) => (
  <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 flex flex-col items-center gap-1">
    {eventsTodayCount !== null && eventsTodayCount !== undefined && eventsTodayCount > 0 && (
      <div className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-300 ring-1 ring-amber-500/40">
        {eventsTodayCount} {eventsTodayCount === 1 ? "event" : "events"} today
      </div>
    )}
    <div className="rounded-lg bg-gray-900/90 px-6 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-white min-w-[80px]">{formatHourOfWeek(time)}</span>
        <input
          type="range" min={0} max={167} value={time}
          onChange={(e) => onTimeChange(parseInt(e.target.value, 10))}
          className="w-64 accent-blue-500"
        />
      </div>
      {isStale && routeComputedAt !== null && (
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
          <span>Routes computed for {formatHourOfWeek(routeComputedAt)}</span>
          <button onClick={onRecompute} className="text-blue-400 underline hover:text-blue-300">Recompute</button>
        </div>
      )}
    </div>
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

const PlanWalkPanel = ({ graph, routes, isComputing, onFindRoute, onClear, onExplain }: {
  graph: GraphArtifact; routes: readonly Route[] | null; isComputing: boolean;
  onFindRoute: (from: number, to: number) => void; onClear: () => void; onExplain: (id: number) => void;
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
    <div className="absolute left-4 top-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
      <h2 className="text-sm font-semibold text-white mb-3">Plan a Walk</h2>
      <div className="space-y-2">
        <div className="relative">
          <input type="text" placeholder="From street..." value={fromText}
            onChange={(e) => { setFromText(e.target.value); setFromNode(null); setError(null); setFromSugg(searchStreets(e.target.value)); }}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none" />
          {fromSugg.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {fromSugg.map((e) => <li key={e.id}><button onClick={() => { setFromText(e.name); setFromNode(e.fromNodeId); setFromSugg([]); }} className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700">{e.name}</button></li>)}
            </ul>
          )}
        </div>
        <div className="relative">
          <input type="text" placeholder="To street..." value={toText}
            onChange={(e) => { setToText(e.target.value); setToNode(null); setError(null); setToSugg(searchStreets(e.target.value)); }}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none" />
          {toSugg.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {toSugg.map((e) => <li key={e.id}><button onClick={() => { setToText(e.name); setToNode(e.fromNodeId); setToSugg([]); }} className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700">{e.name}</button></li>)}
            </ul>
          )}
        </div>
        <button onClick={() => { if (fromNode === null || toNode === null) { setError("Please select valid streets."); return; } onFindRoute(fromNode, toNode); }}
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
              <div key={route.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}>{route.id}</span>
                  <span className="text-xs text-white font-medium tabular-nums">{(route.score * 100).toFixed(0)}</span>
                  <span className="text-xs text-gray-400 tabular-nums">{formatLength(route.length_m)}</span>
                  {route.id === 1 && <span className="text-xs text-blue-400">Recommended</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => onExplain(route.id)} className="text-xs text-gray-400 underline hover:text-white">Explain</button>
                  <a
                    href={googleMapsUrl(route)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Google Maps (walking directions)"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
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
          <button onClick={onClear} className="text-xs text-gray-400 underline hover:text-white">Clear routes</button>
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
  destinationLabel,
  onClose,
}: {
  route: Route;
  allRoutes: Route[] | null;
  time: number;
  destinationLabel?: string;
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
        body: JSON.stringify({ route, allRoutes, time, destinationLabel }),
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
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-[92vw] bg-gradient-to-b from-gray-950 to-gray-900 border-l border-white/10 shadow-2xl overflow-y-auto">
        <div className="p-7 space-y-6">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-gray-950"
                style={{ backgroundColor: accent }}
              >
                {route.id}
              </span>
              <span className="text-xs uppercase tracking-[0.18em] text-gray-400">Why this route?</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
          </header>

          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-7 w-3/4 rounded bg-white/5" />
              <div className="h-4 w-5/6 rounded bg-white/5" />
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-xl bg-white/5" />
                ))}
              </div>
              <p className="text-xs text-gray-500 pt-2">Claude is comparing the three routes…</p>
            </div>
          )}

          {error && !loading && (
            <div className="space-y-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <p className="text-sm text-red-300">Couldn't generate the pitch.</p>
              <p className="text-xs text-red-300/60">{error}</p>
              <button
                onClick={doFetch}
                className="rounded-md bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs text-white"
              >
                Retry
              </button>
            </div>
          )}

          {data && !loading && (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-white leading-tight" style={{ color: accent }}>
                  {data.headline}
                </h2>
                <p className="mt-2 text-sm text-gray-300 leading-relaxed">{data.verdict}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {data.highlights.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl">{ICON_MAP[h.icon] ?? "✦"}</span>
                      <span className="text-[10px] uppercase tracking-wider text-gray-500">{h.label}</span>
                    </div>
                    <div className="text-xl font-semibold text-white tabular-nums">{h.value}</div>
                    <div className="mt-1 text-[11px] text-gray-400">{h.compare}</div>
                  </div>
                ))}
              </div>

              {data.street_picks.length > 0 && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-3">
                    Streets you'll enjoy
                  </h3>
                  <div className="space-y-2">
                    {data.street_picks.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg bg-white/[0.02] border border-white/5 p-3"
                      >
                        <div
                          className="mt-1 h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: accent }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white">{s.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{s.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 text-[10px] text-gray-500 uppercase tracking-wider">
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

  const {
    state,
    setTime,
    setRoutes: setRoutesInState,
    clearRoutes: clearRoutesInState,
    setMode,
    setSelectedEvent,
    isStale,
  } = useAppState();

  const FLINDERS_LNG = 144.967;
  const FLINDERS_LAT = -37.8183;

  const flindersNodeId = useMemo(
    () => findNearestNode(graph.nodes, FLINDERS_LNG, FLINDERS_LAT).id,
    [graph.nodes],
  );

  // time/routes/etc. live in state; keep transient UI state local.
  const time = state.time;
  const routes = (state.routes as Route[] | null);
  const routeComputedAt = state.routeComputedAt;
  const mode = state.mode;
  const selectedEventId = state.selectedEventId;
  const [pinnedEdge, setPinnedEdge] = useState<GraphEdge | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [explainRoute, setExplainRoute] = useState<Route | null>(null);

  const eventsTodayCount = useMemo(() => {
    if (mode !== "event" || !graph.events) return null;
    return activeEventsAt(graph.events, time).length;
  }, [mode, graph.events, time]);

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
    if (mode === "event" && graph.events && graph.events.length > 0) {
      const active = activeEventsAt(graph.events, time);

      if (selectedEventId) {
        const selected = active.filter((ev) => ev.id === selectedEventId);
        layers.push(
          new ScatterplotLayer<Event>({
            id: "event-rings",
            data: selected as Event[],
            getPosition: (ev) => [ev.position[0], ev.position[1]],
            getRadius: 16,
            getFillColor: [251, 191, 36, 60],
            getLineColor: [251, 191, 36, 230],
            getLineWidth: 2,
            radiusUnits: "pixels",
            lineWidthUnits: "pixels",
            stroked: true,
            pickable: false,
          }),
        );
      }

      layers.push(
        new ScatterplotLayer<Event>({
          id: "event-markers",
          data: active as Event[],
          getPosition: (ev) => [ev.position[0], ev.position[1]],
          getRadius: 8,
          getFillColor: [251, 191, 36, 240],
          getLineColor: [11, 15, 20, 230],
          getLineWidth: 2,
          radiusUnits: "pixels",
          lineWidthUnits: "pixels",
          stroked: true,
          pickable: true,
        }),
      );
    }

    return layers;
  }, [graph, time, routes, mode, selectedEventId]);

  // ── Init MapLibre + Deck.gl overlay ──
  useEffect(() => {
    if (!containerRef.current) { return; }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [144.965, -37.816],
      zoom: 15,
    });

    map.on("error", (e) => {
      console.error("MapLibre error:", e);
    });

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onHover: (info) => {
        if (info.object && (info.object as any).metrics !== undefined) {
          setHoveredEdge({ edge: info.object as GraphEdge, x: info.x, y: info.y });
        } else {
          setHoveredEdge(null);
        }
      },
      onClick: (info) => {
        if (info.object && (info.object as any).resolved_via !== undefined) {
          handleEventClickRef.current(info.object as Event);
          return;
        }
        if (info.object) {
          setPinnedEdge(info.object as GraphEdge);
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

  // ── Update layers when time/routes change ──
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers: getLayers() });
    }
  }, [getLayers]);

  // ── Route computation ──
  const handleFindRoute = useCallback((fromNode: number, toNode: number) => {
    setIsComputing(true);
    requestAnimationFrame(() => {
      const result = computeRoutes(graph.nodes, graph.edges, fromNode, toNode, time);
      setRoutesInState(result, time);
      setIsComputing(false);
    });
  }, [graph, time, setRoutesInState]);

  const handleEventClick = useCallback((ev: Event) => {
    const toNode = findNearestNode(graph.nodes, ev.position[0], ev.position[1]).id;
    setSelectedEvent(ev.id);
    setIsComputing(true);
    requestAnimationFrame(() => {
      const result = computeRoutes(graph.nodes, graph.edges, flindersNodeId, toNode, time);
      setRoutesInState(result, time);
      setIsComputing(false);
    });
  }, [graph, time, flindersNodeId, setSelectedEvent, setRoutesInState]);

  const handleEventClickRef = useRef(handleEventClick);
  useEffect(() => { handleEventClickRef.current = handleEventClick; }, [handleEventClick]);

  const handleRecompute = useCallback(() => {
    if (routes && routes.length > 0) {
      // Re-run with same endpoints — we don't store the query, so just clear
      // In practice you'd store fromNode/toNode in state
    }
  }, [routes]);

  const handleClear = useCallback(() => {
    clearRoutesInState();
  }, [clearRoutesInState]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950">
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0 z-0" style={{ width: "100%", height: "100%" }} />

      {/* Hover tooltip */}
      {hoveredEdge && <MapTooltip edge={hoveredEdge.edge} x={hoveredEdge.x} y={hoveredEdge.y} time={time} />}

      {/* UI overlays */}
      <GhostTabs mode={mode} onModeChange={setMode} />
      <ScoreLegend />

      {mode === "walk" ? (
        <PlanWalkPanel
          graph={graph}
          routes={routes}
          isComputing={isComputing}
          onFindRoute={handleFindRoute}
          onClear={handleClear}
          onExplain={(id) => { const r = routes?.find((rt) => rt.id === id); if (r) { setExplainRoute(r); } }}
        />
      ) : (
        <EventListPanel
          events={graph.events ?? []}
          time={time}
          selectedEventId={selectedEventId}
          onEventSelect={handleEventClick}
        />
      )}

      <TimeSlider
        time={time}
        onTimeChange={setTime}
        isStale={isStale}
        routeComputedAt={routeComputedAt}
        onRecompute={handleRecompute}
        eventsTodayCount={eventsTodayCount}
      />

      {selectedEventId && graph.events && (() => {
        const ev = graph.events.find((e) => e.id === selectedEventId);
        if (!ev) return null;
        return <EventDetailCard event={ev} onClose={() => { setSelectedEvent(null); clearRoutesInState(); }} />;
      })()}

      {!selectedEventId && pinnedEdge && (
        <InspectorCard edge={pinnedEdge} time={time} onClose={() => setPinnedEdge(null)} />
      )}
      {explainRoute && (
        <ExplainSlideOut
          route={explainRoute}
          allRoutes={routes}
          time={time}
          destinationLabel={
            selectedEventId && graph.events
              ? graph.events.find((e) => e.id === selectedEventId)?.name
              : undefined
          }
          onClose={() => setExplainRoute(null)}
        />
      )}
    </div>
  );
};
