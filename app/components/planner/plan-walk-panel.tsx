import { useState, useCallback } from "react";

import { useGraph } from "~/hooks/use-graph";
import { ROUTE_COLORS } from "~/lib/colors";
import type { GraphEdge, Route } from "~/lib/types";

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
    for (let i = 0; i < wpCount; i++) {
      sampled.push(interior[Math.floor(i * step)]);
    }
  }
  const fmt = (p: [number, number]) => `${p[1]},${p[0]}`;
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(origin),
    destination: fmt(dest),
    travelmode: "walking",
  });
  if (sampled.length > 0) {
    params.set("waypoints", sampled.map(fmt).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

interface PlanWalkPanelProps {
  readonly routes: readonly Route[] | null;
  readonly isComputing: boolean;
  readonly onFindRoute: (fromNode: number, toNode: number) => void;
  readonly onClear: () => void;
  readonly onExplain: (routeId: number) => void;
}

export const PlanWalkPanel = ({
  routes,
  isComputing,
  onFindRoute,
  onClear,
  onExplain,
}: PlanWalkPanelProps) => {
  const graph = useGraph();

  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromNode, setFromNode] = useState<number | null>(null);
  const [toNode, setToNode] = useState<number | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<readonly GraphEdge[]>([]);
  const [toSuggestions, setToSuggestions] = useState<readonly GraphEdge[]>([]);
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

  const handleFromChange = (value: string) => {
    setFromText(value);
    setFromNode(null);
    setError(null);
    setFromSuggestions(searchStreets(value));
  };

  const handleToChange = (value: string) => {
    setToText(value);
    setToNode(null);
    setError(null);
    setToSuggestions(searchStreets(value));
  };

  const handleSubmit = () => {
    if (fromNode === null || toNode === null) {
      setError("Please select valid streets from the suggestions.");
      return;
    }
    onFindRoute(fromNode, toNode);
  };

  return (
    <div className="absolute left-4 top-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
      <h2 className="text-sm font-semibold text-white mb-3">Plan a Walk</h2>

      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="From street..."
            value={fromText}
            onChange={(e) => handleFromChange(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          {fromSuggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {fromSuggestions.map((edge) => (
                <li key={edge.id}>
                  <button
                    onClick={() => { setFromText(edge.name); setFromNode(edge.fromNodeId); setFromSuggestions([]); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700"
                  >
                    {edge.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="To street..."
            value={toText}
            onChange={(e) => handleToChange(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          {toSuggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {toSuggestions.map((edge) => (
                <li key={edge.id}>
                  <button
                    onClick={() => { setToText(edge.name); setToNode(edge.fromNodeId); setToSuggestions([]); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700"
                  >
                    {edge.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={isComputing}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isComputing ? "Computing..." : "Find route"}
        </button>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>

      {routes && routes.length > 0 && (
        <div className="mt-3 border-t border-gray-700 pt-3">
          <div className="space-y-2">
            {routes.map((route, i) => {
              const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
              return (
                <div key={route.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})` }}
                    >
                      {route.id}
                    </span>
                    <div className="text-xs text-white tabular-nums">
                      <span className="font-medium">{(route.score * 100).toFixed(0)}</span>
                      <span className="text-muted-foreground ml-1.5">{formatLength(route.length_m)}</span>
                    </div>
                    {route.id === 1 && (
                      <span className="text-xs text-primary">Recommended</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => onExplain(route.id)}
                      className="text-xs text-muted-foreground underline hover:text-white"
                    >
                      Explain
                    </button>
                    <a
                      href={googleMapsUrl(route)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in Google Maps (walking directions)"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
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
          </div>
          <button
            onClick={onClear}
            className="mt-2 text-xs text-muted-foreground underline hover:text-white"
          >
            Clear routes
          </button>
        </div>
      )}
    </div>
  );
};
