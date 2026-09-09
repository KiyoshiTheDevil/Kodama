/**
 * The store: published themes, and the ones this installation has.
 *
 * Two categories, not five. An empty "Extensions" or "Visualizer presets" entry would teach a
 * first-time visitor that the shop is bare, which is worse than not offering the entry at all,
 * so a category appears here once it has something in it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn, Button } from "@heroui/react";
import { ArrowsClockwise, Check, Palette, DownloadSimple, MagnifyingGlass } from "../icons.jsx";
import { fetchThemeCatalogue, annotateThemes } from "../theme-catalogue.js";
import { allThemes } from "../themes.js";
import { installThemeEverywhere, uninstallThemeEverywhere, onThemesChanged, THEME_SELECTED } from "./sync.js";
import { applyTheme, readTheme } from "../theme.js";
import { WindowControls, HDR_H } from "../ui/window-chrome.jsx";

const BUILTIN_IDS = new Set(["dark", "oled", "light"]);

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

function ThemeCard({ entry, active, t, onInstall, onRemove, onApply }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface">
      <ThemePreview tokens={entry.tokens} />
      <div className="flex flex-col gap-1 border-t border-border p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[length:var(--t14)] font-medium text-primary">{entry.title}</span>
          {active && <Check size={14} weight="bold" className="shrink-0 text-accent" />}
        </div>
        {entry.description && (
          <div className="text-[length:var(--t11)] leading-snug text-muted">{entry.description}</div>
        )}
        <div className="mt-0.5 text-[length:var(--t11)] text-muted">
          {(entry.creators || []).join(", ")}{entry.version ? ` · ${entry.version}` : ""}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {!entry.supported ? (
            <span className="text-[length:var(--t11)] text-muted">{t("themeNeedsNewer")}</span>
          ) : entry.installed ? (
            <>
              {entry.updatable && (
                <Button size="sm" variant="secondary" onPress={() => onInstall(entry)}>{t("themeUpdate")}</Button>
              )}
              {!active && (
                <Button size="sm" variant="secondary" onPress={() => onApply(entry.id)}>{t("storeApply")}</Button>
              )}
              <Button size="sm" variant="ghost" className="text-muted" onPress={() => onRemove(entry)}>
                {t("themeRemove")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onPress={() => onInstall(entry)}>{t("themeInstall")}</Button>
          )}
        </div>
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

  const load = useCallback(() => {
    setBusy(true);
    fetchThemeCatalogue().then(setCat).finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);

  const refresh = useCallback(() => {
    setCat(c => (c ? { ...c, themes: annotateThemes(c.themes) } : c));
    setTick(n => n + 1);
  }, []);

  // The main window can install or remove one too, from the picker in Settings.
  useEffect(() => onThemesChanged(refresh), [refresh]);

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
    // Removing the theme that is on would leave every window pointing at something that no
    // longer exists. findTheme falls back to dark on the next apply anyway, so go there openly.
    if (readTheme() === e.id) apply("dark");
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

  const sections = [
    { id: "themes", label: t("storeThemes"), icon: <Palette size={16} /> },
    { id: "mine", label: t("storeInstalled"), icon: <DownloadSimple size={16} />, count: mine.length },
  ];

  const cards = section === "themes"
    ? published.filter(match)
    : published.filter(e => mine.some(m => m.id === e.id)).filter(match);

  // A theme installed from a catalogue that has since dropped it has no published entry to draw,
  // but it is still installed and still needs a way out.
  const orphans = section === "mine"
    ? mine
      .filter(m => !published.some(e => e.id === m.id))
      .map(m => ({
        id: m.id, title: m.label || m.id, tokens: m.tokens, version: m.version,
        creators: [], installed: true, supported: true, updatable: false,
      }))
      .filter(match)
    : [];

  const shown = [...cards, ...orphans];

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div data-tauri-drag-region
        className="flex shrink-0 items-center gap-2 border-b border-border bg-surface pl-3"
        style={{ height: 40 }}>
        <span data-tauri-drag-region className="text-[length:var(--t13)] font-medium text-primary">
          {t("store")}
        </span>
        <div data-tauri-drag-region className="flex-1" />
        <Button isIconOnly size="sm" variant="ghost" className="h-7! w-7! min-w-0!"
          onPress={load} aria-label={t("refresh")}>
          <ArrowsClockwise size={14} className={busy ? "animate-spin" : undefined} />
        </Button>
        <WindowControls height={HDR_H} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Rail ────────────────────────────────────────────────────────── */}
        <div className="flex w-[184px] shrink-0 flex-col gap-0.5 border-r border-border p-2">
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              style={section === s.id ? { background: "var(--fill-mod)" } : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--r-md)] px-2.5 py-2 text-left text-[length:var(--t13)]",
                section === s.id ? "text-primary" : "text-muted hover:bg-hover"
              )}>
              <span className="shrink-0">{s.icon}</span>
              <span className="flex-1 truncate">{s.label}</span>
              {s.count > 0 && <span className="shrink-0 text-[length:var(--t11)] text-muted">{s.count}</span>}
            </button>
          ))}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="scrollable min-w-0 flex-1 overflow-y-auto p-5">
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
          {cat && cat.ok && !shown.length && (
            <div className="text-[length:var(--t12)] text-muted">
              {q ? t("storeNoMatches") : t("storeNothingInstalled")}
            </div>
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {shown.map(e => (
              <ThemeCard key={e.id} entry={e} active={theme === e.id} t={t}
                onInstall={install} onRemove={remove} onApply={apply} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
