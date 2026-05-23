import { useState, useEffect, useRef } from "react";

import type { Route } from "~/lib/types";
import { ROUTE_COLORS } from "~/lib/colors";

interface ExplainSlideOutProps {
  readonly route: Route;
  readonly time: number;
  readonly onClose: () => void;
}

const ExplainSlideOut = ({ route, time, onClose }: ExplainSlideOutProps) => {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());

  const fetchExplanation = async () => {
    setIsStreaming(true);
    setError(null);
    setText("");
    startTime.current = Date.now();

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route, time }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) { throw new Error("No response body"); }

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          setText((prev) => prev + decoder.decode(value));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get explanation");
    } finally {
      setIsStreaming(false);
      setElapsed(((Date.now() - startTime.current) / 1000));
    }
  };

  useEffect(() => {
    fetchExplanation();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const color = ROUTE_COLORS[(route.id - 1) % ROUTE_COLORS.length];

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[30%] min-w-[320px] bg-gray-900 shadow-2xl overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Why this route?</span>
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})` }}
              >
                {route.id}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-white text-lg"
            >
              &times;
            </button>
          </div>

          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchExplanation}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {text}
              {isStreaming && <span className="animate-pulse">|</span>}
            </div>
          )}

          {!isStreaming && !error && (
            <div className="mt-6 text-xs text-muted-foreground/60">
              Explained by Claude &middot; {elapsed.toFixed(1)}s
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ExplainSlideOut;
