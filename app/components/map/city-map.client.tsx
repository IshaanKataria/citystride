import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
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

const CityMap = ({
  time,
  routes,
  pinnedSegmentId,
  onHoverSegment,
  onClickSegment,
}: CityMapProps) => {
  const graph = useGraph();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{
    edge: GraphEdge;
    x: number;
    y: number;
  } | null>(null);

  const getLayers = useCallback(() => {
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

    return layers;
  }, [graph, time, routes]);

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
      center: [144.963, -37.814],
      zoom: 15,
      minZoom: 13,
      maxBounds,
      antialias: true,
    });

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
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

    map.on("load", () => {
      map.addControl(overlay as unknown as maplibregl.IControl);
    });

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      overlay.finalize();
      map.remove();
    };
  }, [graph.nodes]);

  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers: getLayers() });
    }
  }, [getLayers]);

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

export default CityMap;
