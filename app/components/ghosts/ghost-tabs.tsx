import { useState } from "react";

const GHOST_TABS = [
  { label: "Walk", active: true },
  { label: "Run", active: false },
  { label: "Cycle", active: false },
  { label: "Events", active: false },
] as const;

export const GhostTabs = () => {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  return (
    <div className="absolute top-4 left-1/2 z-30 -translate-x-1/2 flex rounded-lg bg-card/95 p-1 shadow-lg backdrop-blur border border-border">
      {GHOST_TABS.map((tab) => (
        <div
          key={tab.label}
          className="relative"
          onMouseEnter={() => !tab.active && setHoveredTab(tab.label)}
          onMouseLeave={() => setHoveredTab(null)}
        >
          <button
            disabled={!tab.active}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab.active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground cursor-not-allowed"
            }`}
          >
            {tab.label}
          </button>
          {hoveredTab === tab.label && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-muted-foreground shadow border border-border">
              Coming soon
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
