import { useStore } from "../state/store";

type Mode = "walk" | "event";

const MODES: Array<{ label: string; mode: Mode | null; ghost: boolean }> = [
  { label: "Walk", mode: "walk", ghost: false },
  { label: "Run", mode: null, ghost: true },
  { label: "Cycle", mode: null, ghost: true },
  { label: "Event", mode: "event", ghost: false },
];

export function Ghosts() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const routes = useStore((s) => s.routes);
  const routeQuery = useStore((s) => s.routeQuery);
  const recommended = routes && routes[0];

  const mapsUrl = (() => {
    if (!recommended || !routeQuery) return null;
    const first = recommended.segments[0]?.geometry[0];
    const last =
      recommended.segments[recommended.segments.length - 1]?.geometry.slice(-1)[0];
    if (!first || !last) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${first[1]},${first[0]}&destination=${last[1]},${last[0]}&travelmode=walking`;
  })();

  return (
    <>
      <div className="modes">
        {MODES.map((m) => {
          const active = !m.ghost && m.mode === mode;
          const className = m.ghost
            ? "mode mode-ghost"
            : active
            ? "mode mode-active"
            : "mode mode-inactive";
          return (
            <button
              key={m.label}
              className={className}
              disabled={m.ghost}
              title={m.ghost ? "Coming soon" : ""}
              onClick={() => m.mode && setMode(m.mode)}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mapsUrl && (
        <a className="maps-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
          Open recommended route in Google Maps
        </a>
      )}
    </>
  );
}
