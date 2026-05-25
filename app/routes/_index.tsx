import { useState, useEffect } from "react";
import type { GraphArtifact } from "~/lib/types";
import { MapApp } from "~/components/map-app";

const NoDataView = () => (
  <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
    <h1 className="text-3xl font-bold">CityStride</h1>
    <p className="text-muted-foreground text-center max-w-md">
      No graph data found. Run <code className="bg-muted px-2 py-0.5 rounded text-sm">npm run ingest</code> to
      fetch City of Melbourne data and build the graph artifact.
    </p>
  </div>
);

const IndexRoute = () => {
  const [graph, setGraph] = useState<GraphArtifact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGraph() {
      try {
        // The full-city graph (~139MB) is pre-gzipped to ~13MB so it fits
        // Vercel's 100MB static-file limit. Decompress in the browser.
        const res = await fetch("/graph.json.gz");
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
        const data = (await new Response(stream).json()) as GraphArtifact;
        setGraph(data);
      } catch (err) {
        console.error("Failed to load graph:", err);
        // Fallback: try the uncompressed artifact if it happens to be present.
        try {
          const res = await fetch("/graph.json");
          if (res.ok) setGraph((await res.json()) as GraphArtifact);
        } catch (fallbackErr) {
          console.error("Fallback graph load failed:", fallbackErr);
        }
      } finally {
        setLoading(false);
      }
    }
    loadGraph();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading CityStride...</p>
      </div>
    );
  }

  if (!graph) {
    return <NoDataView />;
  }

  return <MapApp graph={graph} />;
};

export default IndexRoute;
