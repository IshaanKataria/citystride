import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Deck } from "@deck.gl/core";
import { PathLayer } from "@deck.gl/layers";

import { useGraph } from "~/hooks/use-graph";
import { computeScore } from "~/lib/scoring";
import { scoreToColor, ROUTE_COLORS } from "~/lib/colors";
import type { GraphEdge, Route } from "~/lib/types";

import { MapTooltip } from "./map-tooltip";

interface CityMapProps {
  readonly time: number;
  readonly routes: readonly Route[] | null;
  readonly pinnedSegmentId: string | null;
  readonly onHoverSegment: (edge: GraphEdge | null) => void;
  readonly onClickSegment: (edge: GraphEdge | null) => void;
}

export const CityMap = ({
  time,
  routes,
  pinnedSegmentId,
  onHoverSegment,
  onClickSegment,
}: CityMapProps) => {
  const graph = useGraph();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{
    edge: GraphEdge;
    x: number;
    y: number;
  } | null>(null);

  const updateLayers = useCallback(() => {
    if (!deckRef.current) { return; }

    const hasRoutes = routes && routes.length > 0;

    const streetscoreLayer = new PathLayer<GraphEdge>({
      id: "streetscore",
      data: graph.edges as GraphEdge[],
      getPath: (d) => d.geometry,
      getColor: (d) => {
        const score = computeScore(d.metrics, time);
        const color = scoreToColor(score);
        if (hasRoutes) {
          return [color[0], color[1], color[2], 100] as [number, number, number, number];
        }
        return color;
      },
      getWidth: 3,
      widthMinPixels: 2,
      widthMaxPixels: 8,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 120],
      updateTriggers: {
        getColor: [time, hasRoutes],
      },
    });

    const layers: any[] = [streetscoreLayer];

    if (routes) {
      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
        layers.push(
          new PathLayer<Route>({
            id: `route-${route.id}`,
            data: [route],
            getPath: (d) => d.geometry,
            getColor: [...color, 220] as [number, number, number, number],
            getWidth: route.id === 1 ? 8 : 5,
            widthMinPixels: route.id === 1 ? 5 : 3,
            widthMaxPixels: 12,
            pickable: false,
          }),
        );
      }
    }

    deckRef.current.setProps({ layers });
  }, [graph, time, routes]);

  useEffect(() => {
    if (!containerRef.current) { return; }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [144.963, -37.814],
      zoom: 15,
      antialias: true,
    });

    const deck = new Deck({
      parent: containerRef.current,
      viewState: {
        longitude: 144.963,
        latitude: -37.814,
        zoom: 15,
      },
      controller: false,
      layers: [],
      getTooltip: () => null,
      onHover: (info) => {
        if (info.object) {
          setHoveredEdge({
            edge: info.object as GraphEdge,
            x: info.x,
            y: info.y,
          });
          onHoverSegment(info.object as GraphEdge);
        } else {
          setHoveredEdge(null);
          onHoverSegment(null);
        }
      },
      onClick: (info) => {
        if (info.object) {
          onClickSegment(info.object as GraphEdge);
        } else {
          onClickSegment(null);
        }
      },
    });

    map.on("move", () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      deck.setProps({
        viewState: {
          longitude: center.lng,
          latitude: center.lat,
          zoom,
          bearing,
          pitch,
        },
      });
    });

    mapRef.current = map;
    deckRef.current = deck;

    return () => {
      deck.finalize();
      map.remove();
    };
  }, []);

  useEffect(() => {
    updateLayers();
  }, [updateLayers]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {hoveredEdge && (
        <MapTooltip
          edge={hoveredEdge.edge}
          x={hoveredEdge.x}
          y={hoveredEdge.y}
          time={time}
        />
      )}
    </div>
  );
};
