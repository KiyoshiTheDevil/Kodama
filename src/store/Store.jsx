/**
 * The store: published themes, and the ones this installation has.
 *
 * Two categories, not five. An empty "Extensions" or "Visualizer presets" entry would teach a
 * first-time visitor that the shop is bare, which is worse than not offering the entry at all,
 * so a category appears here once it has something in it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn, Button } from "@heroui/react";
import { ArrowsClockwise, CaretLeft, Check, House, Palette, PuzzlePiece, WaveformLines, EqualizerIcon,
  GridTwo, DownloadSimple, MagnifyingGlass } from "../icons.jsx";
import { fetchCatalogue, annotateThemes, annotatePresets } from "./catalogue.js";
import { PRESET_KINDS, installPresetEverywhere, uninstallPresetEverywhere, onPresetsChanged } from "./presets.js";
import { PresetCard, PresetDetail } from "./preset-views.jsx";
import { allThemes } from "../themes.js";
import { installThemeEverywhere, uninstallThemeEverywhere, onThemesChanged, THEME_SELECTED } from "./sync.js";
import { applyTheme, readTheme } from "../theme.js";
import { RESCUE_COMBO } from "../theme-rescue.js";
import { WindowControls, HDR_H } from "../ui/window-chrome.jsx";

const BUILTIN_IDS = new Set(["dark", "oled", "light"]);

// The whole shape of the shop, including the shelves that are still empty.
//
// An empty shelf is a promise, and a promise has to say what it is waiting for. Each category
// that carries nothing yet names what will live there and why it is not there, rather than
// showing a blank pane that reads as a broken page.
const CATEGORIES = [
  { id: "start",      icon: House,         label: "storeStart" },
  { id: "themes",     icon: Palette,       label: "storeThemes" },
  { id: "extensions", icon: PuzzlePiece,   label: "storeExtensions", soon: "storeSoonExtensions" },
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
  // reference the theme does not define is left as text: it inherits from Kodama's ground, and
  // there is no honest swatch for it here.
  const resolve = (value, depth = 0) => {
    const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value || "");
    if (!m) return value;
    if (depth > 4) return null;                       // a cycle: no answer rather than a wrong one
    const next = tokens[m[1]];
    return next === undefined ? null : resolve(next, depth + 1);
  };
  const swatch = Object.fromEntries(names.map(n => [n, resolve(tokens[n])]));
  const colours = names.filter(n => swatch[n] && CSS.supports("color", swatch[n]));
  const others = names.filter(n => !colours.includes(n));

  const Meta = ({ label, children }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[length:var(--t11)] text-muted">{label}</span>
      <span className="text-[length:var(--t12)] text-primary">{children}</span>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5">
      <Button size="sm" variant="ghost" className="w-fit text-muted" onPress={onBack}>
        <CaretLeft size={12} /> <span className="ml-1.5">{t("storeBack")}</span>
      </Button>

      <ThemeStage tokens={tokens} />

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[length:var(--t20)] font-semibold text-primary">{entry.title}</h2>
            {active && <Check size={16} weight="bold" className="shrink-0 text-accent" />}
          </div>
          {entry.description && (
            <p className="mt-1 text-[length:var(--t13)] leading-relaxed text-muted">{entry.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          <ThemeActions entry={entry} active={active} t={t}
            onInstall={onInstall} onRemove={onRemove} onApply={onApply} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-[var(--r-lg)] border border-border p-4 sm:grid-cols-4">
        <Meta label={t("storeAuthor")}>{(entry.creators || []).join(", ") || "—"}</Meta>
        <Meta label={t("storeVersion")}>{entry.version || "1.0.0"}</Meta>
        <Meta label={t("storeMode")}>{entry.mode === "light" ? t("themeLight") : t("themeDark")}</Meta>
        <Meta label={t("storeMinVersion")}>{entry.minVersion || "—"}</Meta>
      </div>

      {/* Said where the risk is taken. The value check stops a theme from doing anything; it
          cannot stop one from being unreadable, and that is the moment this is worth knowing. */}
      <div className="rounded-[var(--r-md)] border border-border px-3 py-2 text-[length:var(--t11)] leading-relaxed text-muted">
        {t("themeRescueHint", { keys: RESCUE_COMBO })}
      </div>

      {entry.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map(tag => (
            <span key={tag} className="rounded-[var(--r-sm)] border border-border px-2 py-0.5 text-[length:var(--t11)] text-muted">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 text-[length:var(--t13)] font-medium text-primary">{t("storePalette")}</div>
        {/* A theme lists only what it CHANGES, so the count is the honest measure of how far it
            goes. Everything it leaves out is inherited, and saying so stops a short theme from
            looking unfinished. */}
        <div className="mb-3 text-[length:var(--t11)] text-muted">{t("storeChanges", { n: names.length })}</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {colours.map(n => (
            <div key={n} className="flex items-center gap-2.5 rounded-[var(--r-md)] border border-border p-2">
              <div className="h-7 w-7 shrink-0 rounded-[var(--r-sm)] border border-border"
                style={{ background: swatch[n] }} />
              <div className="min-w-0">
                <div className="truncate font-mono text-[length:var(--t11)] text-primary">{n}</div>
                <div className="truncate font-mono text-[length:var(--t11)] text-muted">{tokens[n]}</div>
              </div>
            </div>
          ))}
        </div>
        {others.length > 0 && (
          <div className="mt-3 flex flex-col gap-1 rounded-[var(--r-md)] border border-border p-3">
            {others.map(n => (
              <div key={n} className="flex gap-3 font-mono text-[length:var(--t11)]">
                <span className="shrink-0 text-primary">{n}</span>
                <span className="truncate text-muted">{tokens[n]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Store({ t }) {
  const [cat, setCat] = useState(null);        // null = not fetched yet
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState("themes");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState(() => readTheme());
  const [tick, setTick] = useState(0);         // forces a re-read of what is installed
  const [detailId, setDetailId] = useState(null);

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

  const published = cat?.themes || [];
  // Everything this installation has that did not ship with it. Read through allThemes() rather
  // than through the catalogue, so a theme stays listed here even when the catalogue is
  // unreachable, which is exactly the moment someone wants to remove one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mine = useMemo(() => allThemes().filter(th => !BUILTIN_IDS.has(th.id)), [tick]);

  const q = query.trim().toLowerCase();
  const match = (e) => !q || `${e.title} ${e.description || ""} ${(e.tags || []).join(" ")}`.toLowerCase().includes(q);

  const openSection = (id) => { setSection(id); setDetailId(null); };
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
  const groups = (() => {
    const themes = { key: "themes", label: t("storeThemes"), kind: "theme", items: [...(cat?.themes || []), ...orphanThemes] };
    const presets = PRESET_KINDS.map(k => ({
      key: k, label: t(k === "visualizer" ? "storeVisualizer" : "storeEqualizer"), kind: "preset", items: cat?.[k] || [],
    }));
    const all = [themes, ...presets];
    if (section === "start") return all;
    if (section === "mine") return all.map(g => ({ ...g, items: g.items.filter(i => i.installed) }));
    if (section === "themes") return [themes];
    return all.filter(g => g.key === section);
  })().map(g => ({ ...g, items: g.items.filter(match) })).filter(g => g.items.length > 0);

  const everything = groups.flatMap(g => g.items.map(i => ({ ...i, _group: g.kind })));
  const detail = detailId ? everything.find(e => e.id === detailId) : null;

  const RailItem = ({ id, icon: Icon, label, count }) => (
    <button onClick={() => openSection(id)}
      style={section === id ? { background: "var(--fill-mod)" } : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--r-md)] px-2.5 py-2 text-left text-[length:var(--t13)]",
        section === id ? "text-primary" : "text-muted hover:bg-hover"
      )}>
      <span className="flex w-4 shrink-0 justify-center"><Icon size={15} /></span>
      <span className="flex-1 truncate">{label}</span>
      {count > 0 && <span className="shrink-0 text-[length:var(--t11)] text-muted">{count}</span>}
    </button>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div data-tauri-drag-region
        className="flex shrink-0 items-center gap-2 border-b border-border bg-surface pl-3"
        style={{ height: 40 }}>
        <span data-tauri-drag-region className="text-[length:var(--t13)] font-medium text-primary">
          {t("store")}
        </span>
        {/* The shop opens at Beta, and says so. It is reachable earlier only in a dev build or
            with the debug tools unlocked, which is exactly when the label is worth having. */}
        <span data-tauri-drag-region
          className="rounded-[var(--r-sm)] px-1 py-px text-[9px] font-bold leading-[1.4] tracking-[0.04em] text-white"
          style={{ background: "var(--accent)" }}>BETA</span>
        <div data-tauri-drag-region className="flex-1" />
        <Button isIconOnly size="sm" variant="ghost" className="h-7! w-7! min-w-0!"
          onPress={load} aria-label={t("refresh")}>
          <ArrowsClockwise size={14} className={busy ? "animate-spin" : undefined} />
        </Button>
        <WindowControls height={HDR_H} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Rail ────────────────────────────────────────────────────────── */}
        <div className="flex w-[196px] shrink-0 flex-col gap-0.5 border-r border-border p-2">
          {CATEGORIES.map(c => <RailItem key={c.id} id={c.id} icon={c.icon} label={t(c.label)} />)}
          {/* What this installation has, rather than what is on offer. It is a different question
              from the ones above, so it sits apart from them. */}
          <div className="my-2 h-px shrink-0 bg-[var(--stroke-dim)]" />
          <RailItem id="mine" icon={DownloadSimple} label={t("storeInstalled")} count={mine.length} />
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="scrollable min-w-0 flex-1 overflow-y-auto p-5">
          {current?.soon ? (
            <ComingSoon icon={current.icon} title={t(current.label)} line={t(current.soon)} />
          ) : detail ? (detail._group === "theme" ? (
            <ThemeDetail entry={detail} active={theme === detail.id} t={t}
              onBack={() => setDetailId(null)}
              onInstall={install} onRemove={remove} onApply={apply} />
          ) : (
            <PresetDetail entry={detail} t={t} CaretLeft={CaretLeft}
              onBack={() => setDetailId(null)}
              onInstall={installP} onRemove={removeP} />
          )) : (
          <>
          <div className="mb-4 flex items-center gap-2">
            <div className="relative w-full max-w-[320px]">
              <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("search")}
                className="h-8 w-full rounded-[var(--r-md)] border border-border bg-surface pl-8 pr-2.5 text-[length:var(--t12)] text-primary outline-none placeholder:text-muted focus:border-accent" />
            </div>
          </div>

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
