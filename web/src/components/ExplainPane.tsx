import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

const ROUTE_COLORS: Record<number, string> = {
  1: "#fb923c",
  2: "#60a5fa",
  3: "#a78bfa",
};

type Status = "idle" | "streaming" | "done" | "error";

export function ExplainPane() {
  const openId = useStore((s) => s.openExplanationRouteId);
  const routes = useStore((s) => s.routes);
  const time = useStore((s) => s.time);
  const setOpenExplanation = useStore((s) => s.setOpenExplanation);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const route = routes?.find((r) => r.id === openId) ?? null;

  const close = () => {
    abortRef.current?.abort();
    setOpenExplanation(null);
  };

  const fetchExplanation = async () => {
    if (!route) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setText("");
    setStatus("streaming");
    startRef.current = Date.now();
    setElapsed(0);

    try {
      const res = await fetch("/api/explain-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route, time }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setStatus("error");
        setText("Failed to connect to the server.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice("data:".length).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              setStatus("error");
              setText(parsed.error);
              setElapsed(Math.round((Date.now() - startRef.current) / 1000));
              return;
            }
            if (parsed.done) {
              setStatus("done");
              setElapsed(Math.round((Date.now() - startRef.current) / 1000));
              return;
            }
            if (typeof parsed.delta === "string") {
              setText((prev) => prev + parsed.delta);
            }
          } catch {
            // skip malformed SSE chunk
          }
        }
      }

      setStatus("done");
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setStatus("error");
      setText("Connection error — please retry.");
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }
  };

  useEffect(() => {
    if (openId === null) {
      abortRef.current?.abort();
      setText("");
      setStatus("idle");
      setElapsed(0);
      return;
    }
    fetchExplanation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, time]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (openId === null || !route) return null;

  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  const color = ROUTE_COLORS[route.id] ?? "#a8e6ff";

  return (
    <>
      <div className="explain-backdrop" onClick={close} />
      <div className="explain-pane">
        <div className="explain-header">
          <span className="explain-title">Why this route?</span>
          <span className="explain-badge" style={{ background: color }}>
            {route.id}
          </span>
          <button className="close explain-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className="explain-body">
          {status === "streaming" && paragraphs.length === 0 && (
            <div className="explain-pulse" />
          )}
          {paragraphs.map((p, i) => (
            <p key={i} className="explain-p">
              {p}
              {i === paragraphs.length - 1 && status === "streaming" && (
                <span className="explain-cursor" />
              )}
            </p>
          ))}
          {status === "error" && (
            <p className="explain-error-text">{text || "Something went wrong."}</p>
          )}
        </div>

        <div className="explain-footer">
          {status === "error" ? (
            <button className="explain-retry" onClick={fetchExplanation}>
              Retry
            </button>
          ) : (
            <span>
              Explained by Claude
              {status === "done" && elapsed > 0 ? ` · ${elapsed}s` : ""}
              {status === "streaming" ? " · …" : ""}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
