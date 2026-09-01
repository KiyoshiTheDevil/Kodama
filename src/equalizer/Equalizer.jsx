// The equaliser window: preset column on the left, preamp and ten bands on the right.
// Built from the Overlay Editor's vocabulary — 52px header, 30px controls, notched button
// groups, the same borderless chrome — because the two are the same kind of tool window.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Tooltip } from "../ui/tooltip.jsx";
import { HDR_ICON_BTN, HDR_NOTCH, hdrCorners, WindowControls } from "../ui/window-chrome.jsx";
import {
  ArrowClockwise, Check, EqualizerIcon, FileExport, FileImport, FloppyDisk, Plus, Power, Swatches, Trash, WarningCircle, X,
} from "../icons.jsx";
import {
  BANDS, BUILTIN, RANGE_DB, applyToCore, isBuiltin, loadState, normalizePreset, saveState,
} from "./presets.js";

const HDR_H = 52;
// From the concept: a tall, narrow track with a lozenge thumb, and the whole column reading as
// one instrument rather than eleven separate widgets.
const TRACK_H = 400;
const TRACK_W = 26;
const THUMB_H = 34;
const THUMB_W = 20;
// Where the dB grid lines sit. The concept draws a tick beside every fader at each of these,
// which is what makes a row of sliders readable as a curve.
const SCALE = [12, 8, 4, 0, -4, -8, -12];
// The preset list is the Overlay Editor's layer list: same row height, same three-part chip
// group, same moving radius. 15 is half the row height and has to be written as a literal —
// Tailwind only generates classes it can read in the source.
const ROW_H = 30;

const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Whether the player is set to Video Sync, which routes its audio through the video element
 * and so never passes the Rust core where the equaliser lives. Without saying so, the window
 * looks broken: the faders move, the meter follows, and nothing at all changes in the ears.
 *
 * Read straight out of localStorage because this is a separate window with no player of its
 * own. `storage` fires in *other* documents when one of them writes, which is what keeps this
 * current while the switch is flipped in the main window; the focus listener is the backstop,
 * since that event's behaviour across webview windows is not something to depend on, and
 * focusing this window is exactly when its answer starts to matter.
 */
function useVideoSyncEnabled() {
  const read = () => {
    try { return localStorage.getItem("kiyoshi-video-sync") === "true"; } catch { return false; }
  };
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return on;
}

/**
 * One vertical slider. Built from a plain div rather than <input type="range">: the design
 * wants a wide rounded track with a lozenge thumb, and the parts of a range input that decide
 * that are the ones browsers disagree about most.
 */
function Fader({ value, onChange, onCommit, label }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);

  const valueFromY = (clientY) => {
    const r = trackRef.current.getBoundingClientRect();
    // The thumb's centre can reach the ends of the track, so the usable travel is shorter
    // than the track by exactly one thumb.
    const usable = r.height - THUMB_H;
    const y = Math.min(Math.max(clientY - r.top - THUMB_H / 2, 0), usable);
    const frac = 1 - y / usable;
    return Math.round((frac * 2 - 1) * RANGE_DB * 2) / 2;   // half-decibel steps
  };

  const start = (e) => {
    e.preventDefault();
    dragging.current = true;
    onChange(valueFromY(e.clientY));
    const move = (ev) => { if (dragging.current) onChange(valueFromY(ev.clientY)); };
    const up = () => {
      dragging.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const frac = (value / RANGE_DB + 1) / 2;                  // 0 at the bottom, 1 at the top
  const top = (1 - frac) * (TRACK_H - THUMB_H);

  // The fill runs from the zero line to the thumb, so the bar itself states how far the band
  // has been moved and in which direction. With this geometry the zero line is exactly the
  // middle of the track: the thumb's centre travels (TRACK_H - THUMB_H) and starts half a
  // thumb down, which puts 0 dB at TRACK_H / 2 whatever the two heights are.
  const zeroY = TRACK_H / 2;
  const thumbY = top + THUMB_H / 2;
  const fillTop = Math.min(zeroY, thumbY);
  const fillHeight = Math.abs(zeroY - thumbY);

  // A dash either side of the track at every scale step. Purely a reading aid, so it never
  // takes the pointer — a tick swallowing a click would make the fader feel broken near the
  // grid lines.
  const ticks = (
    <div className="absolute inset-y-0 -left-2 -right-2 pointer-events-none">
      {SCALE.map((db) => {
        const y = ((RANGE_DB - db) / (RANGE_DB * 2)) * (TRACK_H - THUMB_H) + THUMB_H / 2;
        return (
          <span key={db} className="absolute inset-x-0 flex justify-between items-center -translate-y-1/2" style={{ top: y }}>
            <i className="block w-1.5 h-px" style={{ background: "var(--stroke)" }} />
            <i className="block w-1.5 h-px" style={{ background: "var(--stroke)" }} />
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="relative flex flex-col items-center gap-3 select-none">
      {ticks}
      <div
        ref={trackRef}
        onPointerDown={start}
        onDoubleClick={() => { onChange(0); onCommit?.(); }}
        role="slider"
        aria-label={label}
        aria-valuemin={-RANGE_DB}
        aria-valuemax={RANGE_DB}
        aria-valuenow={value}
        aria-valuetext={`${value > 0 ? "+" : ""}${value} dB`}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1 : 0.5;
          if (e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(RANGE_DB, value + step)); onCommit?.(); }
          if (e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(-RANGE_DB, value - step)); onCommit?.(); }
          if (e.key === "Home" || e.key === "0") { e.preventDefault(); onChange(0); onCommit?.(); }
        }}
        className="relative rounded-[var(--r-full)] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{ height: TRACK_H, width: TRACK_W, background: "var(--surface-2)" }}
      >
        {/* Drawn before the thumb so the thumb sits on top of it. At exactly 0 dB the height
            is zero and nothing shows, which is the honest picture of "unchanged". */}
        {fillHeight > 0.5 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-[var(--r-full)] pointer-events-none"
            style={{ top: fillTop, height: fillHeight, width: THUMB_W, background: "var(--accent)" }}
          />
        )}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-[var(--r-full)] pointer-events-none shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
          style={{ top, width: THUMB_W, height: THUMB_H, background: "#fff" }}
        />
      </div>
      <span className="text-secondary tabular-nums" style={{ fontSize: "var(--t12)" }}>{label}</span>
    </div>
  );
}

export default function Equalizer({ t }) {
  const [state, setState] = useState(loadState);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const importRef = useRef(null);
  const videoSyncOn = useVideoSyncEnabled();
  // The eleven faders need a floor of their own, so the column's ceiling is whichever is
  // smaller: a flat 400, or what the window can spare. Without the second the panel could be
  // dragged wide on a large window and then stay wide when the window was made small again,
  // squeezing the faders into a scrolling sliver.
  const FADERS_MIN_W = 620;
  const maxLeftW = () => Math.max(180, Math.min(400, window.innerWidth - FADERS_MIN_W));
  const [leftW, setLeftW] = useState(() =>
    Math.min(Number(localStorage.getItem("eq-left-w")) || 248, maxLeftW()));
  useEffect(() => { localStorage.setItem("eq-left-w", String(leftW)); }, [leftW]);
  // Only ever pulls the column in. Growing it back on its own would undo a width the user set
  // deliberately, so a narrowed panel stays narrow.
  useEffect(() => {
    const onResize = () => setLeftW((w) => Math.min(w, maxLeftW()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const startPanelResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftW;
    const move = (ev) => setLeftW(Math.max(180, Math.min(maxLeftW(), startW + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const presets = [...BUILTIN, ...state.custom];
  const current = presets.find((p) => p.id === state.presetId) || null;
  // "Modified" is worth showing: the sliders keep whatever you dragged them to, and without it
  // a preset name would sit there claiming something untrue.
  const dirty = !!current && (!eq(current.gains, state.gains) || current.preamp !== state.preamp);

  // The core and localStorage both follow the state, so nothing has to remember to call them.
  useEffect(() => { saveState(state); applyToCore(state); }, [state]);

  // Every change that is worth undoing goes through here.
  const commit = useCallback((next) => {
    setState((prev) => {
      setPast((p) => [...p.slice(-40), prev]);
      setFuture([]);
      return typeof next === "function" ? next(prev) : { ...prev, ...next };
    });
  }, []);

  // Dragging a slider produces a stream of values; only the state before the drag belongs in
  // the history, so the live moves bypass it and the pointer release records one step.
  const dragBase = useRef(null);
  const live = (patch) => setState((prev) => {
    if (!dragBase.current) dragBase.current = prev;
    return { ...prev, ...patch };
  });
  const endDrag = () => {
    if (!dragBase.current) return;
    const base = dragBase.current;
    dragBase.current = null;
    setPast((p) => [...p.slice(-40), base]);
    setFuture([]);
  };

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [state, ...f].slice(0, 40));
      setState(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, [state]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, state]);
      setState(f[0]);
      return f.slice(1);
    });
  }, [state]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const setBand = (i, v) => live({ gains: state.gains.map((g, j) => (j === i ? v : g)) });

  const selectPreset = (p) => commit({ presetId: p.id, preamp: p.preamp, gains: [...p.gains] });

  // Opening the dialog pre-fills with the current preset's name, but only when that preset is
  // one of the user's own: offering to overwrite "Rock" would promise something the built-in
  // list does not allow.
  const openSave = () => {
    setSaveName(current && !isBuiltin(current.id) ? current.name : "");
    setSaveOpen(true);
  };

  const savePreset = () => {
    const clean = saveName.trim();
    if (!clean) return;
    setSaveOpen(false);
    setSaveName("");
    const existing = state.custom.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    const preset = normalizePreset(
      { id: existing?.id, name: clean, preamp: state.preamp, gains: state.gains },
      clean,
    );
    commit((prev) => ({
      ...prev,
      presetId: preset.id,
      custom: existing
        ? prev.custom.map((p) => (p.id === existing.id ? preset : p))
        : [...prev.custom, preset],
    }));
  };

  const deletePreset = (p) => {
    commit((prev) => ({
      ...prev,
      custom: prev.custom.filter((x) => x.id !== p.id),
      // Deleting what is selected leaves nothing selected; the curve itself stays where it is,
      // because throwing away a name should not silently change the sound.
      presetId: prev.presetId === p.id ? "" : prev.presetId,
    }));
  };

  const exportPresets = () => {
    const payload = { kind: "kodama-eq", version: 1, bands: BANDS, presets: state.custom };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kodama-eq-presets.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importPresets = async (file) => {
    try {
      const raw = JSON.parse(await file.text());
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.presets) ? raw.presets : [];
      if (!list.length) return;
      // Fresh ids on import: two files exported from different machines would otherwise
      // collide and overwrite each other's presets.
      const added = list.map((p) => normalizePreset({ ...p, id: undefined }, t("eqPresetImported")));
      commit((prev) => ({ ...prev, custom: [...prev.custom, ...added] }));
    } catch { /* not a preset file */ }
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden select-none">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 pl-[22px] pr-3" style={{ height: HDR_H }}
        data-tauri-drag-region>
        <div className="flex items-baseline gap-1.5 shrink-0 pointer-events-none">
          <EqualizerIcon size={16} className="text-primary self-center" />
          <span className="font-semibold text-primary ml-1" style={{ fontSize: "var(--t15)" }}>{t("eqTitle")}</span>
          <span className="font-bold text-accent" style={{ fontSize: "var(--t10)" }}>BETA</span>
        </div>

        {/* Power. The one control that is green rather than accent-coloured: it says whether
            the whole thing is in the signal path, which is a different kind of statement from
            "this is selected". */}
        <Tooltip text={state.enabled ? t("eqDisable") : t("eqEnable")}>
          <button type="button" aria-pressed={state.enabled} aria-label={t("eqEnable")}
            onClick={() => commit({ enabled: !state.enabled })}
            className="ml-4 w-[46px] h-[30px] rounded-[var(--r-full)] flex items-center justify-center border-0 cursor-pointer transition-colors"
            style={{
              background: state.enabled ? "rgba(62,199,154,0.16)" : "var(--surface-2)",
              color: state.enabled ? "#3ec79a" : "var(--text-muted)",
            }}>
            <Power size={15} weight="bold" />
          </button>
        </Tooltip>

        <div className="flex-1" data-tauri-drag-region />

        <div className="flex items-center" style={{ gap: HDR_NOTCH }}>
          <input ref={importRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importPresets(f); }} />
          <Tooltip text={t("eqImport")}>
            <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN}
              style={{ borderRadius: hdrCorners(false, true) }}
              onPress={() => importRef.current?.click()} aria-label={t("eqImport")}><FileImport size={15} weight="fill" /></Button>
          </Tooltip>
          <Tooltip text={t("eqExport")}>
            <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN}
              style={{ borderRadius: hdrCorners(true, true) }}
              onPress={exportPresets} aria-label={t("eqExport")}><FileExport size={15} weight="fill" /></Button>
          </Tooltip>
          <Tooltip text={t("eqSave")}>
            <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN}
              style={{ borderRadius: hdrCorners(true, false) }}
              onPress={openSave} aria-label={t("eqSave")}><FloppyDisk size={15} weight="fill" /></Button>
          </Tooltip>
        </div>

        <div className="flex items-center ml-1.5" style={{ gap: HDR_NOTCH }}>
          <Tooltip text={t("ovlMenuUndo")}>
            <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN} isDisabled={!past.length}
              style={{ borderRadius: hdrCorners(false, true) }}
              onPress={undo} aria-label={t("ovlMenuUndo")}>
              <span style={{ transform: "scaleX(-1)", display: "inline-flex" }}><ArrowClockwise size={15} /></span>
            </Button>
          </Tooltip>
          <Tooltip text={t("ovlMenuRedo")}>
            <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN} isDisabled={!future.length}
              style={{ borderRadius: hdrCorners(true, false) }}
              onPress={redo} aria-label={t("ovlMenuRedo")}><ArrowClockwise size={15} /></Button>
          </Tooltip>
        </div>

        <Tooltip text={t("eqBrowseSoon")}>
          <span className="ml-1.5 inline-flex items-center gap-2 h-[30px] px-4 rounded-[var(--r-full)] select-none cursor-default"
            aria-disabled="true"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
            <Swatches size={14} weight="fill" />
            <span style={{ fontSize: "var(--t13)" }}>{t("eqBrowsePresets")}</span>
          </span>
        </Tooltip>

        <WindowControls />
      </div>

      {/* A limitation, not a fault, so it states the reason rather than offering a remedy:
          there is nothing to fix here and nothing this window could do about it. Only shown
          while Video Sync is actually switched on — as a permanent footnote it would be noise
          for everyone who never uses it. */}
      {videoSyncOn && (
        <div className="shrink-0 mx-2.5 mb-2.5 flex items-center gap-2 px-3.5 py-2 rounded-[12px]"
          style={{
            background: "var(--status-warning-soft)",
            border: "1px solid var(--status-warning-line)",
          }}>
          <WarningCircle size={14} weight="fill" className="shrink-0" style={{ color: "var(--status-warning)" }} />
          <span className="text-secondary" style={{ fontSize: "var(--t12)" }}>{t("eqVideoSyncHint")}</span>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* ── Presets ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex flex-col relative min-h-0" style={{ width: leftW }}>
          <div onPointerDown={startPanelResize}
            className="absolute top-0 right-0 h-full w-1.5 translate-x-1/2 z-20 cursor-col-resize hover:bg-[var(--accent)]/40" />

          {/* Same head as the editor's: one bright heading at 52px, then a divider inset from
              both edges. Run to the panel's borders it would read as a structural rule down
              the whole column rather than a line under a title. */}
          <div className="flex items-center justify-between pl-[26px] pr-1.5 h-[52px] shrink-0">
            <span style={{ fontSize: "var(--t18)" }} className="font-semibold text-primary">{t("eqPresets")}</span>
            <Tooltip text={t("eqSave")}>
              <button type="button" onClick={openSave} aria-label={t("eqSave")}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-[var(--r-md)] border-0 bg-transparent text-secondary hover:text-primary hover:bg-[var(--surface-2)] cursor-default transition-colors">
                <Plus size={14} weight="bold" />
              </button>
            </Tooltip>
          </div>
          <div className="mx-[26px] h-px bg-border shrink-0" />

          <div className="flex flex-col gap-0.5 px-[10px] py-1.5 overflow-y-auto min-h-0">
            {presets.map((p) => {
              const active = p.id === state.presetId;
              // Built-in presets can never be deleted, so no chip ever appears beside them and
              // their pill keeps its full radius. Only the user's own get the notch on hover.
              const removable = !isBuiltin(p.id);
              return (
                <div key={p.id} className="group flex items-center relative">
                  <div
                    onClick={() => selectPreset(p)}
                    className={[
                      "flex-1 min-w-0 flex items-center gap-2 px-4 cursor-default select-none",
                      "transition-[background-color,border-radius] duration-150",
                      "rounded-s-[15px]",
                      removable ? "rounded-e-[15px] group-hover:rounded-e-[6px]" : "rounded-e-[15px]",
                      active ? "bg-accent text-white" : "text-primary hover:bg-[var(--bg-hover)]",
                    ].join(" ")}
                    style={{ height: ROW_H }}>
                    <EqualizerIcon size={14} className="shrink-0" />
                    <span style={{ fontSize: "var(--t13)" }} className="flex-1 truncate">{p.name}</span>
                    {active && dirty && (
                      <span className={`shrink-0 ${active ? "text-white/70" : "text-muted"}`}
                        style={{ fontSize: "var(--t10)" }}>{t("eqModified")}</span>
                    )}
                  </div>
                  {/* The chip collapses to nothing, its leading gap included, so an unhovered
                      row shows no trace of it. Reserving the space left a gap beside the
                      selected row; shrinking the pill on hover made the list twitch. */}
                  {removable && (
                    <span className="shrink-0 overflow-hidden transition-[width] duration-150 w-0 group-hover:w-[36px]">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); deletePreset(p); }}
                        aria-label={t("eqDeletePreset")}
                        className="ml-1.5 flex items-center justify-center border-0 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--status-danger)] transition-colors duration-150 rounded-s-[6px] rounded-e-[15px] cursor-default"
                        style={{ width: ROW_H, height: ROW_H }}>
                        <Trash size={13} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Faders ──────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 mr-2.5 mb-2.5 rounded-[18px] overflow-auto"
          style={{ background: "var(--bg-elevated)" }}>
          <div className="min-w-max h-full flex items-center justify-center gap-6 px-12 py-10"
            style={{ opacity: state.enabled ? 1 : 0.4, transition: "opacity .18s" }}>
            {/* The dB scale is written once, between the preamp and the bands, because every
                fader shares it — repeating it at each one would be eleven copies of the same
                seven numbers. The label column is bottom-padded by the caption row's height so
                its zero line meets the faders' zero line. */}
            <div className="relative shrink-0 mb-[34px]" style={{ height: TRACK_H, width: 54 }}>
              {SCALE.map((db) => (
                <span key={db}
                  className="absolute right-0 text-muted tabular-nums -translate-y-1/2"
                  style={{ fontSize: "var(--t12)", top: ((RANGE_DB - db) / (RANGE_DB * 2)) * (TRACK_H - THUMB_H) + THUMB_H / 2 }}>
                  {db > 0 ? "+" : ""}{db} dB
                </span>
              ))}
            </div>

            <Fader label={t("eqPreamp")} value={state.preamp}
              onChange={(v) => live({ preamp: v })} onCommit={endDrag} />

            {/* A gap rather than a rule: the preamp is a different kind of control from the
                bands, and the concept separates them by distance alone. */}
            <div className="w-6 shrink-0" />

            {BANDS.map((f, i) => (
              <Fader key={f} label={f >= 1000 ? `${f / 1000}k` : String(f)}
                value={state.gains[i]}
                onChange={(v) => setBand(i, v)} onCommit={endDrag} />
            ))}
          </div>
        </div>
      </div>

      {/* Kodama's own dialog rather than window.prompt: that one draws WebView2's native box,
          headed "localhost:1421 says", which announces the app as a web page. */}
      {saveOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSaveOpen(false)} />
          <div className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 w-72 rounded-xl shadow-xl border border-border p-3 flex flex-col gap-2"
            style={{ background: "var(--bg-elevated)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") savePreset();
              if (e.key === "Escape") setSaveOpen(false);
            }}>
            <span className="font-semibold text-primary" style={{ fontSize: "var(--t12)" }}>{t("eqSave")}</span>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={t("eqPresetName")}
              aria-label={t("eqPresetName")}
              className="h-[30px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] text-primary border border-transparent focus:border-accent outline-none placeholder:text-muted"
              style={{ fontSize: "var(--t13)" }}
            />
            <div className="flex gap-1.5">
              <Button variant="flat" color="primary" size="sm" className="flex-1 text-t12!"
                isDisabled={!saveName.trim()} onPress={savePreset}>
                <Check size={13} /> {t("eqSave")}
              </Button>
              <Button variant="ghost" size="sm" isIconOnly className="h-8! w-8! min-w-0!"
                onPress={() => { setSaveOpen(false); setSaveName(""); }} aria-label={t("cancel")}>
                <X size={13} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
