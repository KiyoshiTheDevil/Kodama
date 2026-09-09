/**
 * Presets as they appear in the store.
 *
 * A preset has no palette to show, so the preview is drawn from the values themselves: an
 * equaliser preset IS its ten gains, and a visualizer preset is mostly a density and a thickness.
 * Neither is the real renderer and neither pretends to be. The point is that two presets side by
 * side should look different in the way they actually differ.
 */
import { Button } from "@heroui/react";
import { BANDS, RANGE_DB } from "../equalizer/presets.js";
import { VIZ_DEFAULTS } from "../visualizer/defaults.js";

/**
 * The curve, as ten bars growing from a middle line.
 *
 * Read against the same scale the equaliser window uses, so a preset that looks like a gentle lift
 * there does not look like a cliff here. Bars below the line are drawn in the muted colour: a cut
 * and a boost of the same size are not the same statement.
 */
export function EqPreview({ config, height = 96 }) {
  const gains = Array.isArray(config?.gains) ? config.gains : [];
  const mid = height / 2;
  return (
    <div className="flex items-stretch justify-between gap-[3px] px-3" style={{ height }}>
      {BANDS.map((_, i) => {
        const g = Number(gains[i]) || 0;
        const h = Math.max(2, (Math.abs(g) / RANGE_DB) * (mid - 6));
        return (
          <div key={i} className="relative flex-1" style={{ minWidth: 3 }}>
            <div className="absolute left-0 right-0 rounded-[2px]"
              style={{
                height: h,
                bottom: g >= 0 ? mid : undefined,
                top: g < 0 ? mid : undefined,
                background: g >= 0 ? "var(--accent)" : "var(--text-muted)",
                opacity: g === 0 ? 0.25 : 1,
              }} />
            <div className="absolute left-0 right-0 h-px" style={{ top: mid, background: "var(--stroke)" }} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Bars at the preset's own count and thickness.
 *
 * The heights come from a fixed pattern rather than from audio, so the same preset always draws
 * the same picture and two presets can be compared. What is honest here is the density, the
 * thickness, the gap and the cap: those are the settings someone is actually choosing between.
 */
export function VizPreview({ config, height = 96 }) {
  const c = { ...VIZ_DEFAULTS, ...(config || {}) };
  const count = Math.max(6, Math.min(Number(c.barCount) || 56, 64));
  const thickness = Math.max(1, Math.min(Number(c.barThickness) || 3, 10));
  const gap = Math.max(0, Math.min(Number(c.gap) || 0, 12)) / 2;
  const round = c.barCap !== "square";
  // A shape that stays put: a slow swell with a couple of peaks, so density reads clearly.
  const at = (i) => {
    const x = i / (count - 1);
    return 0.25 + 0.55 * Math.abs(Math.sin(x * Math.PI * 2.4)) + 0.2 * Math.abs(Math.sin(x * Math.PI * 7));
  };
  return (
    <div className="flex items-end justify-center px-3" style={{ height, gap }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}
          style={{
            width: thickness,
            height: `${Math.min(at(i), 1) * (height - 20)}px`,
            borderRadius: round ? thickness : 1,
            background: "var(--accent)",
            opacity: c.mirror && i % 2 ? 0.55 : 1,
          }} />
      ))}
    </div>
  );
}

export const PresetPreview = ({ kind, config, height }) =>
  kind === "equalizer"
    ? <EqPreview config={config} height={height} />
    : <VizPreview config={config} height={height} />;

/** The same four-way state as a theme, in one place so the card and the page cannot disagree. */
export function PresetActions({ entry, t, onInstall, onRemove, size = "sm" }) {
  if (!entry.supported) {
    return <span className="text-[length:var(--t11)] text-muted">{t("themeNeedsNewer")}</span>;
  }
  if (!entry.installed) {
    return <Button size={size} variant="secondary" onPress={() => onInstall(entry)}>{t("themeInstall")}</Button>;
  }
  return (
    <>
      {entry.updatable && (
        <Button size={size} variant="secondary" onPress={() => onInstall(entry)}>{t("themeUpdate")}</Button>
      )}
      <Button size={size} variant="ghost" className="text-muted" onPress={() => onRemove(entry)}>
        {t("themeRemove")}
      </Button>
    </>
  );
}

export function PresetCard({ entry, t, onOpen, onInstall, onRemove }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface">
      <button onClick={() => onOpen(entry.id)} className="block cursor-default text-left">
        <div className="pt-3"><PresetPreview kind={entry.kind} config={entry.config} /></div>
        <div className="flex flex-col gap-1 border-t border-border p-3 pb-0">
          <span className="truncate text-[length:var(--t14)] font-medium text-primary">{entry.title}</span>
          {entry.description && (
            <div className="line-clamp-2 text-[length:var(--t11)] leading-snug text-muted">{entry.description}</div>
          )}
          <div className="mt-0.5 text-[length:var(--t11)] text-muted">
            {(entry.creators || []).join(", ")}{entry.version ? ` · ${entry.version}` : ""}
          </div>
        </div>
      </button>
      <div className="p-3 pt-2">
        <div className="flex items-center gap-1.5">
          <PresetActions entry={entry} t={t} onInstall={onInstall} onRemove={onRemove} />
        </div>
      </div>
    </div>
  );
}

export function PresetDetail({ entry, t, onBack, onInstall, onRemove, CaretLeft }) {
  const c = entry.config || {};
  const rows = entry.kind === "equalizer"
    // The bands, named. "+3 dB at 1 kHz" is the sentence someone can act on; "gains[5] = 3" is not.
    ? BANDS.map((hz, i) => [
        hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`,
        `${(Number(c.gains?.[i]) || 0) > 0 ? "+" : ""}${Number(c.gains?.[i]) || 0} dB`,
      ]).concat([[t("eqPreamp") || "Preamp", `${Number(c.preamp) || 0} dB`]])
    // Only what the preset CHANGES. Everything absent is Kodama's own default, and saying that is
    // what stops a three-line preset from looking unfinished.
    : Object.keys(c).map(k => [k, String(c[k])]);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5">
      <Button size="sm" variant="ghost" className="w-fit text-muted" onPress={onBack}>
        <CaretLeft size={12} /> <span className="ml-1.5">{t("storeBack")}</span>
      </Button>

      <div className="overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface py-4">
        <PresetPreview kind={entry.kind} config={c} height={150} />
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[length:var(--t20)] font-semibold text-primary">{entry.title}</h2>
          {entry.description && (
            <p className="mt-1 text-[length:var(--t13)] leading-relaxed text-muted">{entry.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          <PresetActions entry={entry} t={t} onInstall={onInstall} onRemove={onRemove} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-[var(--r-lg)] border border-border p-4 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[length:var(--t11)] text-muted">{t("storeAuthor")}</span>
          <span className="text-[length:var(--t12)] text-primary">{(entry.creators || []).join(", ") || "—"}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[length:var(--t11)] text-muted">{t("storeVersion")}</span>
          <span className="text-[length:var(--t12)] text-primary">{entry.version || "1.0.0"}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[length:var(--t11)] text-muted">{t("storeMinVersion")}</span>
          <span className="text-[length:var(--t12)] text-primary">{entry.minVersion || "—"}</span>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[length:var(--t13)] font-medium text-primary">{t("storeValues")}</div>
        {entry.kind !== "equalizer" && (
          <div className="mb-3 text-[length:var(--t11)] text-muted">{t("storeChanges", { n: rows.length })}</div>
        )}
        <div className="grid gap-x-6 gap-y-1 rounded-[var(--r-md)] border border-border p-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 font-mono text-[length:var(--t11)]">
              <span className="truncate text-muted">{k}</span>
              <span className="shrink-0 text-primary">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
