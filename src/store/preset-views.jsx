/**
 * Presets as they appear in the store.
 *
 * A preset has no palette to show, so the preview is drawn from the values themselves: an
 * equaliser preset IS its ten gains, and a visualizer preset is drawn by the visualizer itself.
 * The point is that two presets side by side should look different in the way they actually differ.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import DetailPage, { CardRating } from "./detail.jsx";
import { BANDS, RANGE_DB } from "../equalizer/presets.js";
import { VIZ_DEFAULTS } from "../visualizer/defaults.js";
import { drawSpectrum } from "../visualizer/draw.js";

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
 * The preset drawn by the visualizer's own drawing code (src/visualizer/draw.js), with a fixed
 * pattern in place of audio, so the same preset always shows the same picture and two can be
 * compared. It used to be a separate row of bars that knew no shapes: a ring showed as a straight
 * line, and a frame drawn as a curve showed as neither.
 *
 * Drawn at the real sizes (cover, bar length, gap) and scaled down to fit, so the proportions are
 * the ones the listener will see. A line is never thinner than one screen pixel, or a hairline
 * preset would vanish from its own preview.
 */
const PREVIEW_COVER = 200;

// Deterministic "music": a slow swell with a couple of peaks, and a lower second layer.
function previewValues(n, ring) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = ring ? i / n : i / Math.max(1, n - 1);
    out[i] = Math.min(1, 0.22 + 0.5 * Math.abs(Math.sin(x * Math.PI * (ring ? 3 : 2.4))) + 0.2 * Math.abs(Math.sin(x * Math.PI * 9)));
  }
  return out;
}

export function VizPreview({ config, height = 96 }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !width) return;
    const c = { ...VIZ_DEFAULTS, ...(config || {}) };
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);

    const reach = (Number(c.gap) || 0) + 4 + (Number(c.barLength) || 0) + 8;
    const linear = c.shape === "linear";
    const centred = linear && (c.linearPos || "bottom") === "center";
    // The room the drawing needs, in real units, and the scale that fits it into the card.
    const needH = linear
      ? (centred ? Math.max(PREVIEW_COVER, 2 * reach) + 16 : reach + 48)
      : PREVIEW_COVER + 2 * reach;
    const needW = linear ? 0 : PREVIEW_COVER + 2 * reach;
    const scale = Math.min(height / needH, needW ? width / needW : Infinity);
    const w = width / scale, h = height / scale;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

    const box = { x: (w - PREVIEW_COVER) / 2, y: (h - PREVIEW_COVER) / 2, w: PREVIEW_COVER, h: PREVIEW_COVER };
    // Where the cover would be. A linear spectrum at the bottom sits under the player, not the
    // cover, so it gets none.
    if (!linear || centred) {
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      if (c.coverShape === "circle") ctx.arc(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, 0, Math.PI * 2);
      else if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 14); else ctx.rect(box.x, box.y, box.w, box.h);
      ctx.fill();
    }

    const n = Math.max(8, Math.round(Number(c.barCount) || 48));
    // The same shaping the live visualizer applies (cover-view.jsx): floor and ceiling, then the
    // smoothing across neighbouring bands, which is most of what a calm preset like Soft Curve is.
    const fl = Number(c.floor) || 0, ce = c.ceiling != null ? Number(c.ceiling) : 1, rng = Math.max(0.02, ce - fl);
    const raw = previewValues(n, c.shape === "ring").map(v => Math.max(0, Math.min(1, (v - fl) / rng)));
    const sbr = Math.round((Number(c.smoothBands) || 0) * 8);
    const vals = sbr > 0 ? raw.map((_, i) => {
      let sum = 0, wsum = 0;
      for (let k = -sbr; k <= sbr; k++) {
        const j = i + k;
        if (j < 0 || j >= n) continue;
        const wk = 1 - Math.abs(k) / (sbr + 1);
        sum += raw[j] * wk; wsum += wk;
      }
      return sum / wsum;
    }) : raw;
    const peaks = c.peakHold ? vals.map(v => Math.min(1, v + 0.12)) : null;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e040fb";
    const baseCol = c.color === "custom" ? (c.customColor || accent) : accent;
    drawSpectrum(ctx, { w, h, box, cfg: c, n, vals, peaks, baseCol, minWidth: 1 / scale });
  }, [config, width, height]);

  return <canvas ref={ref} style={{ display: "block", width: "100%", height }} />;
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
            <CardRating entry={entry} />
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

export function PresetDetail({ entry, t, onBack, onInstall, onRemove }) {
  const c = entry.config || {};
  const values = entry.kind === "equalizer"
    // The bands, named. "+3 dB at 1 kHz" is the sentence someone can act on; "gains[5] = 3" is not.
    ? BANDS.map((hz, i) => [
        hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`,
        `${(Number(c.gains?.[i]) || 0) > 0 ? "+" : ""}${Number(c.gains?.[i]) || 0} dB`,
      ]).concat([["Preamp", `${Number(c.preamp) || 0} dB`]])
    // Only what the preset CHANGES. Everything absent is Kodama's own default, and saying so is
    // what stops a three-line preset from looking unfinished.
    : Object.keys(c).map(k => [k, String(c[k])]);

  return (
    <DetailPage entry={entry} t={t} onBack={onBack}
      icon={<div className="flex h-full w-full items-center justify-center" style={{ background: "var(--bg-elevated)" }}>
        <PresetPreview kind={entry.kind} config={c} height={64} />
      </div>}
      stages={[
        <div key="a" className="flex h-full w-full items-center" style={{ background: "var(--bg-surface)" }}>
          <PresetPreview kind={entry.kind} config={c} height={140} />
        </div>,
      ]}
      values={values}
      valuesLabel={entry.kind === "equalizer"
        ? t("storeValues")
        : `${t("storeValues")} · ${t("storeChanges", { n: values.length })}`}
      actions={<PresetActions entry={entry} t={t} onInstall={onInstall} onRemove={onRemove} />}
    />
  );
}
