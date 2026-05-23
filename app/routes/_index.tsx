import { useState, useEffect } from "react";
import type { GraphArtifact } from "~/lib/types";

export const loader = async () => {
  // Server loader returns null — data is loaded client-side
  return { graph: null };
};

const NoDataView = () => (
  <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-950 text-white gap-4">
    <h1 className="text-3xl font-bold">CityStride</h1>
    <p className="text-muted-foreground text-center max-w-md">
      No graph data found. Run <code className="bg-gray-800 px-2 py-0.5 rounded text-sm">npm run ingest</code> to
      fetch City of Melbourne data and build the graph artifact.
    </p>
  </div>
);

const IndexRoute = () => {
  const [graph, setGraph] = useState<GraphArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [MapModule, setMapModule] = useState<any>(null);

  useEffect(() => {
    // Load graph data
    fetch("/api/graph")
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

    // Dynamically import the map app (browser-only)
    import("~/components/map-app").then((mod) => {
      setMapModule(() => mod.MapApp);
    });
  }, []);

  if (loading || !MapModule) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-950">
        <p className="text-muted-foreground">Loading CityStride...</p>
      </div>
    );
  }

  if (!graph) {
    return <NoDataView />;
  }

  return <MapModule graph={graph} />;
};

export default IndexRoute;
