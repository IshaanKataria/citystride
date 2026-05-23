import { useEffect, useMemo } from "react";
import { useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, TextLayer } from "@deck.gl/layers";
import { useStore } from "../state/store";
import { composite, scoreToRgba } from "../lib/scoring";
import type { Edge } from "../../../shared/types";

const ROUTE_PALETTE: Array<[number, number, number]> = [
  [251, 146, 60],
  [96, 165, 250],
  [167, 139, 250],
];

export function MapLayers() {
  const graph = useStore((s) => s.graph);
  const time = useStore((s) => s.time);
  const routes = useStore((s) => s.routes);
  const setPinned = useStore((s) => s.setPinnedSegment);
  const setHovered = useStore((s) => s.setHovered);

  const overlay = useControl(
    () => new MapboxOverlay({ interleaved: false })
  ) as unknown as MapboxOverlay;

  const dim = routes !== null;

  const layers = useMemo(() => {
    if (!graph) return [];
    const list: any[] = [];

    list.push(
      new PathLayer<Edge>({
        id: "streets",
        data: graph.edges,
        getPath: (e: Edge) => e.geometry as any,
        getColor: (e: Edge) => {
          const [r, g, b, a] = scoreToRgba(composite(e, time));
          return [r, g, b, dim ? 90 : a];
        },
        getWidth: 6,
        widthMinPixels: 3,
        widthMaxPixels: 18,
        pickable: true,
        onClick: (info: any) => {
          if (info.object) setPinned(info.object.id);
        },
        onHover: (info: any) => {
          setHovered(info.object ? info.object.id : null);
        },
        updateTriggers: { getColor: [time, dim] },
      })
    );

    if (routes) {
      const badges: Array<{ position: [number, number]; label: string; color: [number, number, number] }> = [];
      routes.forEach((route, idx) => {
        const color = ROUTE_PALETTE[idx] ?? ROUTE_PALETTE[0];
        const path: number[][] = [];
        route.segments.forEach((seg, segIdx) => {
          const start = segIdx === 0 ? 0 : 1;
          for (let i = start; i < seg.geometry.length; i++) {
            path.push(seg.geometry[i]);
          }
        });
        list.push(
          new PathLayer({
            id: `route-${route.id}`,
            data: [{ path }],
            getPath: (d: any) => d.path,
            getColor: [...color, 230],
            getWidth: idx === 0 ? 10 : 7,
            widthMinPixels: 5,
            pickable: false,
          })
        );

        const midSegmentIdx = Math.floor(route.segments.length / 2);
        const midSegment = route.segments[midSegmentIdx];
        if (midSegment) {
          const midGeom = midSegment.geometry;
          const midPoint = midGeom[Math.floor(midGeom.length / 2)];
          badges.push({
            position: [midPoint[0], midPoint[1]],
            label: String(route.id),
            color,
          });
        }
      });

      if (badges.length > 0) {
        list.push(
          new TextLayer({
            id: "route-badges",
            data: badges,
            getPosition: (d: any) => d.position,
            getText: (d: any) => d.label,
            getSize: 22,
            getColor: [11, 15, 20, 255],
            background: true,
            getBackgroundColor: ((d: any) => [d.color[0], d.color[1], d.color[2], 255]) as any,
            backgroundPadding: [8, 4],
            fontWeight: 700,
            pickable: false,
            characterSet: "0123456789",
          })
        );
      }
    }

    return list;
  }, [graph, time, dim, routes, setPinned, setHovered]);

  useEffect(() => {
    overlay.setProps({ layers });
    if (typeof window !== "undefined") {
      (window as any).__citystrideOverlay = overlay;
      (window as any).__citystrideLayers = layers;
    }
  }, [overlay, layers]);

  return null;
}
