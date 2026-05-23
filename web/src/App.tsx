import { useEffect } from "react";
import Map from "react-map-gl/maplibre";
import { useStore } from "./state/store";
import { fetchGraph } from "./lib/api";
import { MapLayers } from "./components/MapLayers";
import { PlanPanel } from "./components/PlanPanel";
import { InspectorCard } from "./components/InspectorCard";
import { ScoreLegend } from "./components/ScoreLegend";
import { TimeSlider } from "./components/TimeSlider";

const MELBOURNE_CBD = {
  longitude: 144.9694,
  latitude: -37.8119,
  zoom: 14.5,
};

const TILE_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export default function App() {
  const graph = useStore((s) => s.graph);
  const setGraph = useStore((s) => s.setGraph);

  useEffect(() => {
    fetchGraph().then(setGraph).catch((err) => {
      console.error("graph load failed:", err);
    });
  }, [setGraph]);

  return (
    <div className="app">
      <Map
        initialViewState={MELBOURNE_CBD}
        mapStyle={TILE_STYLE}
        style={{ width: "100vw", height: "100vh" }}
      >
        <MapLayers />
      </Map>

      <PlanPanel />
      <InspectorCard />
      <ScoreLegend />
      <TimeSlider />

      {!graph && <div className="loading">Loading map data...</div>}
    </div>
  );
}
