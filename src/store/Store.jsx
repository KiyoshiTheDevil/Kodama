/**
 * The store: published themes, and the ones this installation has.
 *
 * Two categories, not five. An empty "Extensions" or "Visualizer presets" entry would teach a
 * first-time visitor that the shop is bare, which is worse than not offering the entry at all,
 * so a category appears here once it has something in it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn, Button } from "@heroui/react";
import { ArrowsClockwise, ArrowLeft, ArrowRight, Check, House, Palette, PuzzlePiece, WaveformLines, EqualizerIcon,
  GridTwo, Storefront, MagnifyingGlass } from "../icons.jsx";
import { fetchCatalogue, annotateThemes, annotatePresets } from "./catalogue.js";
import { PRESET_KINDS, installPresetEverywhere, uninstallPresetEverywhere, onPresetsChanged } from "./presets.js";
import { PresetCard, PresetDetail } from "./preset-views.jsx";
import { allExtensions, enableExtension, disableExtension, onExtensionsChanged } from "../extensions/registry.js";
import { ExtensionCard, ExtensionDetail } from "./extension-views.jsx";
import DetailPage from "./detail.jsx";
import { allThemes } from "../themes.js";
import { installThemeEverywhere, uninstallThemeEverywhere, onThemesChanged, THEME_SELECTED } from "./sync.js";
import { applyTheme, readTheme } from "../theme.js";
import { RESCUE_COMBO } from "../theme-rescue.js";
import { WindowControls, HDR_ICON_BTN, hdrCorners } from "../ui/window-chrome.jsx";
import { Tooltip } from "../ui/tooltip.jsx";

const BUILTIN_IDS = new Set(["dark", "oled", "light"]);
const ROW_H = 30;   // the equaliser preset row, so the two windows read as one application

// The whole shape of the shop, including the shelves that are still empty.
//
// An empty shelf is a promise, and a promise has to say what it is waiting for. Each category
// that carries nothing yet names what will live there and why it is not there, rather than
// showing a blank pane that reads as a broken page.
const CATEGORIES = [
  { id: "start",      icon: House,         label: "storeStart" },
  { id: "themes",     icon: Palette,       label: "storeThemes" },
  { id: "extensions", icon: PuzzlePiece,   label: "storeExtensions" },
  { id: "visualizer", icon: WaveformLines, label: "storeVisualizer", kind: "visualizer" },
  { id: "equalizer",  icon: EqualizerIcon, label: "storeEqualizer",  kind: "equalizer" },
  { id: "widgets",    icon: GridTwo,       label: "storeWidgets",    soon: "storeSoonWidgets" },
];

/** A shelf with nothing on it yet: what belongs here, and what it is waiting for. */
function ComingSoon({ icon: Icon, title, line }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon size={30} className="text-muted opacity-40" />
      <div className="text-[length:var(--t14)] font-medium text-primary">{title}</div>
      <div className="max-w-[380px] text-[length:var(--t12)] leading-relaxed text-muted">{line}</div>
    </div>
  );
}

/** A theme drawn as the app would draw it: ground, a panel, a line of text, three tiles. */
function ThemePreview({ tokens }) {
  const v = (n, fallback) => tokens?.[n] || fallback;
  return (
    <div style={{ background: v("--bg-base", "#0d0d0d"), padding: 14, height: 128 }}>
      <div style={{ background: v("--bg-surface", "#141414"), borderRadius: "var(--r-md)", padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ width: "62%", height: 6, borderRadius: "var(--r-xs)", background: v("--accent", "#e040fb"), marginBottom: 6 }} />
        <div style={{ width: "42%", height: 5, borderRadius: "var(--r-xs)", background: v("--t1", "#f0f0f0"), opacity: 0.3 }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1, background: v("--bg-elevated", "#1c1c1c"), borderRadius: "var(--r-sm)", height: 44 }} />
        <div style={{ flex: 1, background: v("--bg-elevated", "#1c1c1c"), borderRadius: "var(--r-sm)", height: 44 }} />
        <div style={{ flex: 1, background: v("--bg-elevated", "#1c1c1c"), borderRadius: "var(--r-sm)", height: 44 }} />
      </div>
    </div>
  );
}

/**
 * The same decision in both places: what can be done with this theme right now.
 *
 * Pulled out because the card and the detail page must never disagree about it. Two copies of a
 * four-way state (unsupported / not installed / installed / installed and out of date) is two
 * chances to get one of the four wrong.
 */
function ThemeActions({ entry, active, t, onInstall, onRemove, onApply, size = "sm" }) {
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
      {!active && (
        <Button size={size} variant="secondary" onPress={() => onApply(entry.id)}>{t("storeApply")}</Button>
      )}
      <Button size={size} variant="ghost" className="text-muted" onPress={() => onRemove(entry)}>
        {t("themeRemove")}
      </Button>
    </>
  );
}

/**
 * The app in miniature, painted in one theme's values.
 *
 * A theme is judged by how its parts sit together, not by four swatches in a row, so this draws
 * the shapes that actually carry it: a rail, a header, rows, and the accent on the one control
 * that uses it. Values that the theme does not set fall back to Kodama's dark ground, which is
 * exactly what the running app would show for it.
 */
function ThemeStage({ tokens }) {
  const v = (n, fallback) => tokens?.[n] || fallback;
  const base = v("--bg-base", "#0d0d0d");
  const surface = v("--bg-surface", "#141414");
  const elevated = v("--bg-elevated", "#1c1c1c");
  const stroke = v("--stroke", "rgba(255,255,255,0.08)");
  const text = v("--t1", "rgba(255,255,255,0.886)");
  const accent = v("--accent", "#e040fb");
  const bar = (w, o = 1, h = 6, c = text) => (
    <div style={{ width: w, height: h, borderRadius: 3, background: c, opacity: o }} />
  );
  return (
    <div style={{ background: base, borderRadius: "var(--r-lg)", border: `1px solid ${stroke}`, overflow: "hidden" }}>
      <div style={{ display: "flex", height: 210 }}>
        {/* Rail */}
        <div style={{ width: 92, background: surface, borderRight: `1px solid ${stroke}`, padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
          {bar("70%", 0.85)}
          <div style={{ height: 4 }} />
          {bar("85%", 0.45, 5)}
          {bar("62%", 0.45, 5)}
          {bar("74%", 0.45, 5)}
          <div style={{ height: 6 }} />
          {bar("50%", 0.25, 5)}
          {bar("66%", 0.25, 5)}
        </div>
        {/* Content */}
        <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: elevated }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bar(96, 0.9, 7)}
              {bar(62, 0.4, 5)}
            </div>
          </div>
          {[0.9, 0.55, 0.55].map((o, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: i === 0 ? elevated : "transparent", borderRadius: "var(--r-sm)", padding: "7px 8px" }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: i === 0 ? accent : text, opacity: i === 0 ? 1 : 0.3 }} />
              {bar(i === 0 ? 118 : 96, o * 0.7, 5)}
            </div>
          ))}
        </div>
      </div>
      {/* Player bar: the one place the accent is unmistakable */}
      <div style={{ background: surface, borderTop: `1px solid ${stroke}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 999, background: accent }} />
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: v("--slider-track", elevated), position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, width: "38%", borderRadius: 2, background: accent }} />
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ entry, active, t, onOpen, onInstall, onRemove, onApply }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface">
      {/* Everything above the buttons opens the theme. The action row is deliberately outside it:
          a button inside a clickable card fires both, and "Remove" that also navigates is worse
          than a card with a slightly smaller hit area. */}
      <button onClick={() => onOpen(entry.id)} className="block cursor-default text-left">
        <ThemePreview tokens={entry.tokens} />
        <div className="flex flex-col gap-1 border-t border-border p-3 pb-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[length:var(--t14)] font-medium text-primary">{entry.title}</span>
            {active && <Check size={14} weight="bold" className="shrink-0 text-accent" />}
          </div>
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
          <ThemeActions entry={entry} active={active} t={t}
            onInstall={onInstall} onRemove={onRemove} onApply={onApply} />
        </div>
      </div>
    </div>
  );
}

/**
 * One theme, in full.
 *
 * A theme's own substance is its values, so this shows all of them rather than a chosen four.
 * Whether a value is a colour is asked of the browser (CSS.supports) instead of guessed from the
 * string: a theme may carry shadows and lengths too, and a swatch painted from "0 2px 8px rgba(...)"
 * would silently come out transparent and read as a colour that happens to be invisible.
 */
function ThemeDetail({ entry, active, t, onBack, onInstall, onRemove, onApply }) {
  const tokens = entry.tokens || {};
  const names = Object.keys(tokens);

  // A value may point at another of the theme's own tokens: "--border": "var(--stroke)". Painting
  // that string straight into a swatch would resolve it against THIS window's :root and quietly
  // show the currently active theme's colour instead of the one being looked at, which is a wrong
  // answer that looks like a right one. So var() is followed inside the theme's own map, and a
  // reference the theme does not define gets no swatch: it inherits from Kodama's ground, and
  // there is no honest colour to show for it here.
  const resolve = (value, depth = 0) => {
    const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value || "");
    if (!m) return value;
    if (depth > 4) return null;                       // a cycle: no answer rather than a wrong one
    const next = tokens[m[1]];
    return next === undefined ? null : resolve(next, depth + 1);
  };
  const values = names.map(n => {
    const r = resolve(tokens[n]);
    return [n, tokens[n], r && CSS.supports("color", r) ? r : null];
  });

  return (
    <>
      <DetailPage entry={entry} t={t} onBack={onBack}
        icon={<div className="h-full w-full" style={{ background: tokens["--bg-base"] || "#0d0d0d" }}>
          <div className="h-full w-full" style={{
            background: `linear-gradient(135deg, ${tokens["--bg-surface"] || "#141414"} 0%, ${tokens["--accent"] || "#e040fb"} 220%)`,
          }} />
        </div>}
        // Three views rather than one picture: the same theme carrying a window, a light surface
        // and its accent. What a screenshot would show, except it cannot fall out of date.
        stages={[
          <ThemeStage key="app" tokens={tokens} />,
          <div key="panel" className="h-full w-full p-4" style={{ background: tokens["--bg-base"] || "#0d0d0d" }}>
            <ThemePreview tokens={tokens} />
          </div>,
        ]}
        values={values} valuesLabel={`${t("storePalette")} · ${t("storeChanges", { n: names.length })}`}
        actions={<ThemeActions entry={entry} active={active} t={t}
          onInstall={onInstall} onRemove={onRemove} onApply={onApply} />}
      />
      {/* Said where the risk is taken. The value check stops a theme from doing anything; it
          cannot stop one from being unreadable, and that is the moment this is worth knowing. */}
      <div className="mt-6 rounded-[var(--r-md)] border border-border px-3 py-2 text-[length:var(--t11)] leading-relaxed text-muted">
        {t("themeRescueHint", { keys: RESCUE_COMBO })}
      </div>
    </>
  );
}

export default function Store({ t }) {
  const [cat, setCat] = useState(null);        // null = not fetched yet
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState(() => readTheme());
  const [tick, setTick] = useState(0);         // forces a re-read of what is installed
  // Where the shop has been. A shop is a place you walk through, and the two arrows in the header
  // promise that; without a stack they would be decoration. One entry is a shelf plus whichever
  // page was open on it, because those are the two things that make a view.
  const [hist, setHist] = useState([{ section: "start", detailId: null }]);
  const [at, setAt] = useState(0);
  const here = hist[at];
  const section = here.section;
  const detailId = here.detailId;
  const go = (next) => {
    // Everything ahead of the current point is dropped, the way a browser does it: walking back
    // and then somewhere else makes a new path rather than branching into two.
    setHist(h => [...h.slice(0, at + 1), { ...here, ...next }]);
    setAt(n => n + 1);
  };
  const setDetailId = (id) => go({ detailId: id });
  const canBack = at > 0;
  const canFwd = at < hist.length - 1;

  const load = useCallback(() => {
    setBusy(true);
    fetchCatalogue().then(setCat).finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);

  const refresh = useCallback(() => {
    setCat(c => {
      if (!c) return c;
      const next = { ...c, themes: annotateThemes(c.themes) };
      for (const k of PRESET_KINDS) next[k] = annotatePresets(k, c[k] || []);
      return next;
    });
    setTick(n => n + 1);
  }, []);

  // Another window can install or remove one too: Settings for a theme, the equaliser for a preset.
  useEffect(() => onThemesChanged(refresh), [refresh]);
  useEffect(() => onPresetsChanged(refresh), [refresh]);
  useEffect(() => onExtensionsChanged(refresh), [refresh]);

  const apply = (id) => {
    localStorage.setItem("kiyoshi-theme", id);
    applyTheme(id);
    setTheme(id);
    // The main window keeps the selection in React state, so it is told rather than left to
    // notice: writing localStorage alone changes nothing that is already rendered.
    import("@tauri-apps/api/event").then(({ emit }) => emit(THEME_SELECTED, id)).catch(() => {});
  };

  const install = async (e) => { await installThemeEverywhere(e); refresh(); };
  const remove = async (e) => {
    await uninstallThemeEverywhere(e.id);
    // Under "Installed" the entry it was opened from is about to disappear from the list.
    if (section === "mine" && detailId === e.id) setDetailId(null);
    // Removing the theme that is on would leave every window pointing at something that no
    // longer exists. findTheme falls back to dark on the next apply anyway, so go there openly.
    if (readTheme() === e.id) apply("dark");
    refresh();
  };

  const installP = async (e) => { await installPresetEverywhere(e.kind, e); refresh(); };
  const removeP = async (e) => {
    await uninstallPresetEverywhere(e.kind, e.id);
    if (section === "mine" && detailId === e.id) setDetailId(null);
    refresh();
  };

  const enableExt = async (e) => { await enableExtension(e.id); refresh(); };
  const disableExt = async (e) => {
    await disableExtension(e.id);
    if (section === "mine" && detailId === e.id) setDetailId(null);
    refresh();
  };

  const published = cat?.themes || [];
  // Everything this installation has that did not ship with it. Read through allThemes() rather
  // than through the catalogue, so a theme stays listed here even when the catalogue is
  // unreachable, which is exactly the moment someone wants to remove one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mine = useMemo(() => allThemes().filter(th => !BUILTIN_IDS.has(th.id)), [tick]);

  const q = query.trim().toLowerCase();
  const match = (e) => !q || `${e.title} ${e.description || ""} ${(e.tags || []).join(" ")}`.toLowerCase().includes(q);

  const openSection = (id) => go({ section: id, detailId: null });
  const current = CATEGORIES.find(c => c.id === section);

  // A theme installed from a catalogue that has since dropped it has no published entry to draw,
  // but it is still installed and still needs a way out.
  const orphanThemes = mine
    .filter(m => !(cat?.themes || []).some(e => e.id === m.id))
    .map(m => ({
      id: m.id, title: m.label || m.id, tokens: m.tokens, version: m.version,
      creators: [], installed: true, supported: true, updatable: false,
    }));

  /**
   * What this shelf holds, as one or more groups.
   *
   * Written as groups rather than as one list because Start and Installed carry more than one
   * kind, and a heap of themes and presets with no heading between them is a worse answer than
   * either shelf on its own. A shelf with a single group draws no heading: the rail already
   * named it.
   */
  // Kodama's own extensions. They ship in the build because their permissions reach past the
  // sandbox and only a trusted source may hold those, but nothing is on until it is asked for.
  // Installing one is therefore a flag rather than a download, which is honest for an app whose
  // bytes live on the web either way.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const extensions = useMemo(() => allExtensions().map(e => ({
    ...e, kind: "extension", title: e.name, installed: e.enabled,
    supported: true, updatable: false, creators: e.authors,
  })), [tick]);

  const groups = (() => {
    const themes = { key: "themes", label: t("storeThemes"), kind: "theme", items: [...(cat?.themes || []), ...orphanThemes] };
    const presets = PRESET_KINDS.map(k => ({
      key: k, label: t(k === "visualizer" ? "storeVisualizer" : "storeEqualizer"), kind: "preset", items: cat?.[k] || [],
    }));
    const exts = { key: "extensions", label: t("storeExtensions"), kind: "extension", items: extensions };
    const all = [themes, ...presets, exts];
    if (section === "start") return all;
    if (section === "mine") return all.map(g => ({ ...g, items: g.items.filter(i => i.installed) }));
    if (section === "updates") return all.map(g => ({ ...g, items: g.items.filter(i => i.updatable) }));
    if (section === "themes") return [themes];
    if (section === "extensions") return [exts];
    return all.filter(g => g.key === section);
  })().map(g => ({ ...g, items: g.items.filter(match) })).filter(g => g.items.length > 0);

  const everything = groups.flatMap(g => g.items.map(i => ({ ...i, _group: g.kind })));

  // Counted across every shelf, not just the one being looked at, because the number on the button
  // is a claim about the whole shop. Read from the catalogue rather than from `groups`, which is
  // filtered by the current shelf and by whatever is typed in the search box.
  const pending = [
    ...(cat?.themes || []).filter(e => e.updatable).map(e => ({ ...e, _group: "theme" })),
    ...PRESET_KINDS.flatMap(k => (cat?.[k] || []).filter(e => e.updatable).map(e => ({ ...e, _group: "preset" }))),
  ];
  const updateAll = async () => {
    for (const e of pending) {
      if (e._group === "theme") await installThemeEverywhere(e);
      else await installPresetEverywhere(e.kind, e);
    }
    refresh();
  };
  const detail = detailId ? everything.find(e => e.id === detailId) : null;

  // The equaliser's preset rows, to the pixel: 30px tall, a 14px glyph, --t13, and the selected
  // one filled with the accent. These are the same kind of window and they were reading as two
  // different applications.
  const RailItem = ({ id, icon: Icon, label, count }) => {
    const on = section === id;
    return (
      <div onClick={() => openSection(id)} style={{ height: ROW_H }}
        className={cn(
          "flex cursor-default select-none items-center gap-2 rounded-[var(--r-full)] px-4",
          "transition-colors duration-150",
          on ? "bg-accent text-white" : "text-primary hover:bg-[var(--bg-hover)]"
        )}>
        <Icon size={14} className="shrink-0" />
        <span className="flex-1 truncate" style={{ fontSize: "var(--t13)" }}>{label}</span>
        {count > 0 && (
          <span className={cn("shrink-0", on ? "text-white/70" : "text-muted")} style={{ fontSize: "var(--t10)" }}>{count}</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* ── Header ───────────────────────────────────────────────
          Same grammar as the equaliser and the overlay editor: a 52px bar, the title with its
          badge on the baseline, and every control a 46x30 surface rather than a bare glyph. */}
      <div className="flex shrink-0 items-center gap-1 pl-[22px] pr-3" style={{ height: 52 }}
        data-tauri-drag-region>
        <div className="pointer-events-none flex shrink-0 items-baseline gap-1.5">
          <Storefront size={16} className="self-center text-primary" />
          <span className="ml-1 font-semibold text-primary" style={{ fontSize: "var(--t15)" }}>{t("store")}</span>
          {/* Opens at Beta, and says so. Reachable earlier only in a dev build or with the debug
              tools unlocked, which is exactly when the label is worth having. */}
          <span className="font-bold text-accent" style={{ fontSize: "var(--t10)" }}>BETA</span>
        </div>

        {/* Two arrows are a promise that this is somewhere you walk through. A group, so the free
            ends keep the pill and the touching ends notch, like every other pair in the app. */}
        <div className="ml-4 flex shrink-0 items-center">
          <Tooltip text={t("storeBack")}>
            <Button isIconOnly size="sm" variant="ghost" className={HDR_ICON_BTN} style={{ borderRadius: hdrCorners(false, true) }}
              isDisabled={!canBack} onPress={() => setAt(n => n - 1)} aria-label={t("storeBack")}>
              <ArrowLeft size={14} weight="bold" />
            </Button>
          </Tooltip>
          <Tooltip text={t("storeForward")}>
            <Button isIconOnly size="sm" variant="ghost" className={HDR_ICON_BTN} style={{ borderRadius: hdrCorners(true, false) }}
              isDisabled={!canFwd} onPress={() => setAt(n => n + 1)} aria-label={t("storeForward")}>
              <ArrowRight size={14} weight="bold" />
            </Button>
          </Tooltip>
        </div>

        <div className="flex-1" data-tauri-drag-region />

        {/* The number is the point: without it this is a button that asks you to go and look. */}
        <Tooltip text={t("storeUpdates")}>
          <Button isIconOnly size="sm" variant="ghost" className={cn(HDR_ICON_BTN, "relative")}
            style={{ borderRadius: hdrCorners(false, true) }} onPress={() => openSection("updates")} aria-label={t("storeUpdates")}>
            <ArrowsClockwise size={14} className={busy ? "animate-spin" : undefined} />
            {pending.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-[var(--r-full)] px-1 font-bold text-white"
                style={{ background: "var(--accent)", fontSize: 9 }}>{pending.length}</span>
            )}
          </Button>
        </Tooltip>
        {/* What this installation has, rather than what is on offer: a different question from the
            shelves, so a different control rather than one more of them. */}
        <Button size="sm" variant="ghost"
          className={cn(HDR_ICON_BTN, "w-auto! px-3!", section === "mine" && "bg-accent! text-white!")}
          style={{ borderRadius: hdrCorners(true, false) }} onPress={() => openSection("mine")}>
          <GridTwo size={13} /> <span className="ml-1.5" style={{ fontSize: "var(--t12)" }}>{t("storeLibrary")}</span>
        </Button>

        <div className="ml-2"><WindowControls /></div>
      </div>

      <div className="flex min-h-0 flex-1 gap-0 pb-3 pl-2 pr-3">
        {/* ── Rail ────────────────────────────────────────── */}
        <div className="flex w-[196px] shrink-0 flex-col gap-0.5 px-2">
          <div className="relative mb-2">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("search")}
              className="h-[30px] w-full rounded-[var(--r-full)] bg-[var(--surface-2)] pl-3.5 pr-8 text-primary outline-none placeholder:text-muted"
              style={{ fontSize: "var(--t13)" }} />
            <MagnifyingGlass size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
          {CATEGORIES.map(c => <RailItem key={c.id} id={c.id} icon={c.icon} label={t(c.label)} />)}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="scrollable min-w-0 flex-1 overflow-y-auto rounded-[var(--r-xl)] p-7"
          style={{ background: "var(--bg-surface)" }}>
          {section === "updates" ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-[length:var(--t18)] font-semibold text-primary">{t("storeUpdates")}</div>
                  <div className="mt-0.5 text-[length:var(--t12)] text-muted">
                    {pending.length ? t("storeUpdatesCount", { n: pending.length }) : t("storeUpToDate")}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onPress={load} isDisabled={busy}>{t("storeCheck")}</Button>
                {pending.length > 0 && (
                  <Button size="sm" variant="primary" onPress={updateAll}>{t("storeUpdateAll")}</Button>
                )}
              </div>
              {pending.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Check size={30} weight="bold" className="text-muted opacity-40" />
                  <div className="text-[length:var(--t12)] text-muted">{t("storeUpToDate")}</div>
                </div>
              )}
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                {pending.map(e => (e._group === "theme" ? (
                  <ThemeCard key={e.id} entry={e} active={theme === e.id} t={t}
                    onOpen={setDetailId} onInstall={install} onRemove={remove} onApply={apply} />
                ) : (
                  <PresetCard key={e.id} entry={e} t={t}
                    onOpen={setDetailId} onInstall={installP} onRemove={removeP} />
                )))}
              </div>
            </div>
          ) : current?.soon ? (
            <ComingSoon icon={current.icon} title={t(current.label)} line={t(current.soon)} />
          ) : detail ? (detail._group === "extension" ? (
            <ExtensionDetail entry={detail} t={t}
              onBack={() => setDetailId(null)}
              onEnable={enableExt} onDisable={disableExt} />
          ) : detail._group === "theme" ? (
            <ThemeDetail entry={detail} active={theme === detail.id} t={t}
              onBack={() => setDetailId(null)}
              onInstall={install} onRemove={remove} onApply={apply} />
          ) : (
            <PresetDetail entry={detail} t={t}
              onBack={() => setDetailId(null)}
              onInstall={installP} onRemove={removeP} />
          )) : (
          <>
          {cat === null && busy && (
            <div className="text-[length:var(--t12)] text-muted">{t("themeStoreLoading")}</div>
          )}
          {cat && !cat.ok && (
            <div className="flex flex-col items-start gap-2">
              <div className="text-[length:var(--t12)] text-muted">{t("themeStoreFailed")}</div>
              <Button size="sm" variant="secondary" onPress={load}>{t("retry")}</Button>
            </div>
          )}
          {cat && cat.ok && !everything.length && (
            <div className="text-[length:var(--t12)] text-muted">
              {q ? t("storeNoMatches") : t("storeNothingInstalled")}
            </div>
          )}

          {/* A heading only where there is more than one kind on the shelf. On Themes the rail
              already says it, and repeating it would be a heading for the whole page. */}
          {groups.map(g => (
            <div key={g.key} className="mb-6 last:mb-0">
              {groups.length > 1 && (
                <div className="mb-2 text-[length:var(--t13)] font-medium text-primary">{g.label}</div>
              )}
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                {g.items.map(e => (g.kind === "theme" ? (
                  <ThemeCard key={e.id} entry={e} active={theme === e.id} t={t}
                    onOpen={setDetailId}
                    onInstall={install} onRemove={remove} onApply={apply} />
                ) : g.kind === "extension" ? (
                  <ExtensionCard key={e.id} entry={e} t={t}
                    onOpen={setDetailId} onEnable={enableExt} onDisable={disableExt} />
                ) : (
                  <PresetCard key={e.id} entry={e} t={t}
                    onOpen={setDetailId} onInstall={installP} onRemove={removeP} />
                )))}
              </div>
            </div>
          ))}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
