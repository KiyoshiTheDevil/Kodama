// Correcting what Last.fm records for one track.
//
// The fields open filled with what would actually be sent right now, rules already applied,
// rather than with the raw metadata: the point of a correction is to change the outcome, and a
// dialog that shows something other than the outcome makes you guess at what you are changing.
import { useState } from "react";
import { Button } from "@heroui/react";
import { Check, X } from "../icons.jsx";
import { loadOverrides, loadPrimaryArtistOnly, removeOverride, resolveScrobbleMeta, setOverride } from "./scrobble-rules.js";

export function ScrobbleEditModal({ track, t, onClose }) {
  const resolved = resolveScrobbleMeta(track, {
    primaryOnly: loadPrimaryArtistOnly(),
    overrides: loadOverrides(),
  });
  const hasOverride = !!loadOverrides()[track?.videoId];
  const [artist, setArtist] = useState(resolved.artist);
  const [title, setTitle] = useState(resolved.track);

  const save = () => {
    setOverride(track?.videoId, { artist, title, label: track?.title });
    onClose();
  };
  const reset = () => {
    removeOverride(track?.videoId);
    onClose();
  };

  const field = "w-full h-9 px-3 rounded-[var(--r-lg)] bg-[var(--surface-2)] text-primary border border-transparent focus:border-accent outline-none";

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[420px] max-w-[92vw] rounded-2xl border border-border shadow-2xl p-4 flex flex-col gap-3"
        style={{ background: "var(--bg-elevated)" }}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter") save(); }}>
        <div>
          <div className="font-semibold text-primary" style={{ fontSize: "var(--t14)" }}>{t("scrobbleEdit")}</div>
          <div className="text-muted mt-0.5" style={{ fontSize: "var(--t11)" }}>{t("scrobbleEditDesc")}</div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-muted" style={{ fontSize: "var(--t11)" }}>{t("scrobbleArtist")}</span>
          <input autoFocus value={artist} onChange={(e) => setArtist(e.target.value)}
            className={field} style={{ fontSize: "var(--t13)" }} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted" style={{ fontSize: "var(--t11)" }}>{t("scrobbleTitle")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className={field} style={{ fontSize: "var(--t13)" }} />
        </label>

        <div className="flex items-center gap-2 pt-1">
          {/* Only offered when there is something to undo, so it never promises to reverse a
              correction that was never made. */}
          {hasOverride && (
            <Button variant="ghost" size="sm" className="text-t12!" onPress={reset}>{t("scrobbleReset")}</Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" isIconOnly className="h-8! w-8! min-w-0!" onPress={onClose} aria-label={t("cancel")}>
            <X size={13} />
          </Button>
          <Button variant="flat" color="primary" size="sm" className="text-t12!"
            isDisabled={!artist.trim() && !title.trim()} onPress={save}>
            <Check size={13} /> {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
