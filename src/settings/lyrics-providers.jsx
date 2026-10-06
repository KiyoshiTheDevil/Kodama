import { useState, useRef } from "react";
import { cn } from "@heroui/react";
import { GripLines } from "../icons.jsx";
import { PROVIDER_SYNC, providerSyncLevels } from "../lyrics/providers.js";
import { Toggle } from "../ui/settings-controls.jsx";

export function LyricsProviderList({ providers, onChange }) {
  const [dragOver, setDragOver] = useState(null);
  const isDragging = useRef(false);
  const dragOverRef = useRef(null);
  const listRef = useRef(null);

  const handlePointerDown = (e, fromIdx) => {
    e.preventDefault();
    isDragging.current = false;
    dragOverRef.current = null;
    const startY = e.clientY;

    const onMove = (me) => {
      if (Math.abs(me.clientY - startY) > 4) isDragging.current = true;
      if (!isDragging.current || !listRef.current) return;
      const rows = listRef.current.querySelectorAll("[data-provider-idx]");
      let closest = null, closestDist = Infinity;
      rows.forEach(row => {
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const dist = Math.abs(me.clientY - mid);
        if (dist < closestDist) { closestDist = dist; closest = row; }
      });
      if (closest) {
        const idx = parseInt(closest.dataset.providerIdx);
        dragOverRef.current = idx;
        setDragOver(idx);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const target = dragOverRef.current;
      if (isDragging.current && target !== null && target !== fromIdx) {
        const next = [...providers];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(target, 0, moved);
        onChange(next);
      }
      isDragging.current = false;
      dragOverRef.current = null;
      setDragOver(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    // Rows of the settings' own kind (.setting-row), so the list fuses into one group with the
    // same rounding as every other group; separate cards had a radius of their own.
    <div ref={listRef} className="setting-rows flex flex-col">
      {providers.map((p, i) => (
        <div
          key={p.id}
          data-provider-idx={i}
          className="setting-row flex flex-row items-center gap-2.5 px-[18px] py-4 transition-shadow"
          style={{ boxShadow: dragOver === i ? "inset 0 0 0 2px var(--accent)" : "none" }}
        >
          {/* Drag handle */}
          <div
            onPointerDown={e => handlePointerDown(e, i)}
            className="cursor-grab text-muted flex items-center shrink-0 touch-none"
          >
            <GripLines size={16} style={{ pointerEvents: "none" }} />
          </div>
          {/* Label */}
          <span className={cn("text-[length:var(--t13)]", p.enabled ? "text-primary" : "text-muted")}>{p.label}</span>
          {/* Sync-type tag */}
          {/* Every level the source can deliver, not just its finest: a syllable-timed source
              can also give you words and lines, and only listing "Syllable" hid that. */}
          {providerSyncLevels(p.id).map((sync) => {
            return (
              <span key={sync.label} style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: "var(--t10)", whiteSpace: "nowrap", flexShrink: 0,
                padding: "2px 6px", borderRadius: "var(--r-sm)",
                background: p.enabled ? sync.bg : "rgba(255,255,255,0.05)",
                color: p.enabled ? sync.color : "var(--text-muted)",
                transition: "all 0.2s",
              }}>
                {sync.icon && <span style={{ display: "inline-block", width: 16, height: 16, flexShrink: 0, alignSelf: "center", backgroundColor: "currentColor", maskImage: `url(${sync.icon})`, WebkitMaskImage: `url(${sync.icon})`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />}
                {sync.label}
              </span>
            );
          })}
          <div className="flex-1" />
          {/* Enable toggle */}
          <Toggle value={p.enabled} onChange={v => onChange(providers.map((x, j) => j === i ? { ...x, enabled: v } : x))} />
        </div>
      ))}
    </div>
  );
}

// ─── Debug shared helpers ────────────────────────────────────────────────────
