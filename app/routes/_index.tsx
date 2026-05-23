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
    fetch("/graph.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setGraph(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load graph:", err);
        setLoading(false);
      });
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
