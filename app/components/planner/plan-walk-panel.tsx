import { useState, useRef } from "react";

import { useGraph } from "~/hooks/use-graph";
import { createGeocoder } from "~/lib/geocoder";
import { ROUTE_COLORS } from "~/lib/colors";
import type { AddressRecord, Route } from "~/lib/types";

interface PlanWalkPanelProps {
  readonly routes: readonly Route[] | null;
  readonly isComputing: boolean;
  readonly onFindRoute: (fromNode: string, toNode: string) => void;
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
  const geocoderRef = useRef(createGeocoder(graph.addresses));

  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromMatch, setFromMatch] = useState<AddressRecord | null>(null);
  const [toMatch, setToMatch] = useState<AddressRecord | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<readonly AddressRecord[]>([]);
  const [toSuggestions, setToSuggestions] = useState<readonly AddressRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFromChange = (value: string) => {
    setFromText(value);
    setFromMatch(null);
    setError(null);
    setFromSuggestions(value.length >= 2 ? geocoderRef.current.search(value) : []);
  };

  const handleToChange = (value: string) => {
    setToText(value);
    setToMatch(null);
    setError(null);
    setToSuggestions(value.length >= 2 ? geocoderRef.current.search(value) : []);
  };

  const selectFrom = (addr: AddressRecord) => {
    setFromText(addr.address);
    setFromMatch(addr);
    setFromSuggestions([]);
  };

  const selectTo = (addr: AddressRecord) => {
    setToText(addr.address);
    setToMatch(addr);
    setToSuggestions([]);
  };

  const handleSubmit = () => {
    if (!fromMatch || !toMatch) {
      setError("Please select valid addresses from the suggestions.");
      return;
    }
    onFindRoute(fromMatch.nearestNodeId, toMatch.nearestNodeId);
  };

  return (
    <div className="absolute left-4 top-4 z-30 w-72 rounded-lg bg-gray-900/95 p-4 shadow-lg backdrop-blur">
      <h2 className="text-sm font-semibold text-white mb-3">Plan a Walk</h2>

      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="From address..."
            value={fromText}
            onChange={(e) => handleFromChange(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          {fromSuggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {fromSuggestions.map((addr) => (
                <li key={addr.address}>
                  <button
                    onClick={() => selectFrom(addr)}
                    className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700"
                  >
                    {addr.address}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="To address..."
            value={toText}
            onChange={(e) => handleToChange(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          {toSuggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-gray-800 border border-gray-700 shadow-lg">
              {toSuggestions.map((addr) => (
                <li key={addr.address}>
                  <button
                    onClick={() => selectTo(addr)}
                    className="w-full px-3 py-1.5 text-left text-xs text-white hover:bg-gray-700"
                  >
                    {addr.address}
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
                <div key={route.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})` }}
                    >
                      {route.id}
                    </span>
                    <div className="text-xs text-white">
                      <span className="font-medium">{(route.score * 100).toFixed(0)}</span>
                      <span className="text-muted-foreground ml-1">{route.length_m}m</span>
                    </div>
                    {route.id === 1 && (
                      <span className="text-xs text-primary">Recommended</span>
                    )}
                  </div>
                  <button
                    onClick={() => onExplain(route.id)}
                    className="text-xs text-muted-foreground underline hover:text-white"
                  >
                    Explain
                  </button>
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
