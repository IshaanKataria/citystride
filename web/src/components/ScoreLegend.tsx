export function ScoreLegend() {
  return (
    <div className="panel panel-top-right">
      <div className="legend-title">Streetscore</div>
      <div className="legend-gradient" style={{ background: "linear-gradient(90deg, rgb(40,60,95) 0%, rgb(135,135,135) 50%, rgb(255,210,80) 100%)" }} />
      <div className="legend-labels">
        <span>Lower</span>
        <span>Higher</span>
      </div>
      <div className="legend-footnote">
        Reflects lighting, foot traffic, gradient, surface, transit and canopy at
        the selected time. Data: City of Melbourne open data.
      </div>
    </div>
  );
}
