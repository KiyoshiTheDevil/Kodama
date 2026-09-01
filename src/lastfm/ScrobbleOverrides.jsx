// The scrobble rules, as a settings section: the primary-artist switch and the list of
// per-track corrections. Corrections are made from the player's own menu, where the track in
// question is at hand — this is where they are reviewed and removed.
import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Trash } from "../icons.jsx";
import { loadOverrides, removeOverride } from "./scrobble-rules.js";

export function ScrobbleOverrides({ t }) {
  const [items, setItems] = useState(() => loadOverrides());

  // The table is written from the player menu, which lives in a different part of the tree, so
  // the list follows the event rather than owning the data.
  useEffect(() => {
    const sync = () => setItems(loadOverrides());
    window.addEventListener("kodama-scrobble-overrides-changed", sync);
    return () => window.removeEventListener("kodama-scrobble-overrides-changed", sync);
  }, []);

  const entries = Object.entries(items).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));

  if (!entries.length) {
    return (
      <div className="text-muted px-1 py-2" style={{ fontSize: "var(--t12)" }}>
        {t("scrobbleOverridesEmpty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map(([videoId, ov]) => (
        <div key={videoId} className="group/ov flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-[var(--r-lg)] hover:bg-[var(--bg-hover)] transition-colors">
          <div className="flex-1 min-w-0">
            <div className="text-primary truncate" style={{ fontSize: "var(--t12)" }}>
              {ov.title || ov.label}
            </div>
            <div className="text-muted truncate" style={{ fontSize: "var(--t11)" }}>
              {ov.artist || t("scrobbleOverrideTitleOnly")}
            </div>
          </div>
          <Button variant="ghost" size="sm" isIconOnly
            className="shrink-0 h-7! w-7! min-w-0! text-[var(--status-danger)]! opacity-0 group-hover/ov:opacity-100"
            onPress={() => removeOverride(videoId)} aria-label={t("scrobbleOverrideRemove")}>
            <Trash size={13} />
          </Button>
        </div>
      ))}
    </div>
  );
}
