export const ScoreLegend = () => {
  return (
    <div className="absolute right-4 top-4 z-30 rounded-lg bg-gray-900/90 px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Lower score</span>
        <div
          className="h-3 w-32 rounded-sm"
          style={{
            background: "linear-gradient(to right, rgb(220,50,50), rgb(250,200,50), rgb(50,205,100))",
          }}
        />
        <span className="text-xs text-muted-foreground">Higher score</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground max-w-[280px]">
        Score reflects lighting, foot traffic, gradient, surface, transit and canopy at the selected time.
      </p>
      <p className="mt-1 text-xs text-muted-foreground/60">
        Data: City of Melbourne open data.
      </p>
    </div>
  );
};
