import { useState } from "react";
import Map from "react-map-gl/maplibre";

const MELBOURNE_CBD = {
  longitude: 144.9631,
  latitude: -37.8136,
  zoom: 14,
};

const TILE_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export default function App() {
  const [time, setTime] = useState(94);

  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Math.floor(time / 24)];
  const hour = String(time % 24).padStart(2, "0");

  return (
    <div className="app">
      <Map
        initialViewState={MELBOURNE_CBD}
        mapStyle={TILE_STYLE}
        style={{ width: "100vw", height: "100vh" }}
      />

      <div className="panel panel-top-left">
        <div className="brand">CityStride</div>
        <div className="subtitle">Pick your route by the city, not the distance.</div>
      </div>

      <div className="panel panel-top-right">
        <div className="legend-title">Streetscore</div>
        <div className="legend-gradient" />
        <div className="legend-labels">
          <span>Lower</span>
          <span>Higher</span>
        </div>
        <div className="legend-footnote">Data: City of Melbourne open data</div>
      </div>

      <div className="panel panel-bottom">
        <div className="time-readout">{day} {hour}:00</div>
        <input
          type="range"
          min={0}
          max={167}
          value={time}
          onChange={(e) => setTime(Number(e.target.value))}
          className="time-slider"
        />
      </div>
    </div>
  );
}
