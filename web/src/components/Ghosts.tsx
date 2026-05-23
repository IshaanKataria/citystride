import { useStore } from "../state/store";

const MODES = [
  { label: "Walk", active: true },
  { label: "Run", active: false },
  { label: "Cycle", active: false },
  { label: "Event", active: false },
];

export function Ghosts() {
  const routes = useStore((s) => s.routes);
  const routeQuery = useStore((s) => s.routeQuery);
  const recommended = routes && routes[0];

  const mapsUrl = (() => {
    if (!recommended || !routeQuery) return null;
    const first = recommended.segments[0]?.geometry[0];
    const last =
      recommended.segments[recommended.segments.length - 1]?.geometry.slice(
        -1
      )[0];
    if (!first || !last) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${first[1]},${first[0]}&destination=${last[1]},${last[0]}&travelmode=walking`;
  })();

  return (
    <>
      <div className="modes">
        {MODES.map((m) => (
          <button
            key={m.label}
            className={`mode ${m.active ? "mode-active" : "mode-ghost"}`}
            disabled={!m.active}
            title={m.active ? "" : "Coming soon"}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mapsUrl && (
        <a className="maps-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
          Open recommended route in Google Maps
        </a>
      )}
    </>
  );
}
