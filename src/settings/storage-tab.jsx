import { useState, useEffect, useCallback } from "react";
import { cn, Button, CardRoot } from "@heroui/react";
import { API } from "../context.jsx";
import { Check, DownloadSimple, HardDrives, ImageSquare, Microphone, MusicNote, Queue, VinylRecord } from "../icons.jsx";
import { Slider, Toggle, SettingRow, SettingsSectionLabel } from "../ui/settings-controls.jsx";

function fmtBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const MAX_CACHE_STEPS = [100, 250, 500, 1000, 2000, 5000, 0]; // 0 = unlimited

export function StorageTab({ t }) {
  return (
    <div>
      <div id="set-sec-storage-downloads" data-settings-section="storage-downloads" style={{ scrollMarginTop: 8 }}>
        <SettingsSectionLabel>{t("storageDownloads")}</SettingsSectionLabel>
        <DownloadsTab t={t} />
      </div>
      <div id="set-sec-storage-cache" data-settings-section="storage-cache" style={{ scrollMarginTop: 8 }}>
        <SettingsSectionLabel style={{ marginTop: 28 }}>{t("storageCache")}</SettingsSectionLabel>
        <CacheTab t={t} />
      </div>
    </div>
  );
}

function DownloadsTab({ t }) {
  const [mp3Dir, setMp3Dir] = useState(() => localStorage.getItem("kiyoshi-mp3-dir") || "");

  const handleChangePath = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: t("changePath"), defaultPath: mp3Dir || undefined });
      if (selected) {
        setMp3Dir(selected);
        localStorage.setItem("kiyoshi-mp3-dir", selected);
      }
    } catch {}
  };

  const handleResetPath = () => {
    setMp3Dir("");
    localStorage.removeItem("kiyoshi-mp3-dir");
  };

  return (
    <div>
      <SettingRow label={t("defaultSavePath")} icon={<DownloadSimple size={15} />}
        description={mp3Dir || t("noPathSet")}>
        <div className="flex gap-1.5">
          {mp3Dir && (
            <Button variant="ghost" size="sm" onPress={handleResetPath}>{t("resetPath")}</Button>
          )}
          <Button variant="primary" size="sm" onPress={handleChangePath}>{t("changePath")}</Button>
        </div>
      </SettingRow>
    </div>
  );
}

function CacheTab({ t }) {
  const [stats, setStats] = useState(null);
  const [clearing, setClearing] = useState({});
  const [cleared, setCleared] = useState({});
  const [fetchError, setFetchError] = useState(null);

  const load = useCallback(() => {
    fetch(`${API}/cache/stats`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`); return r.json(); })
      .then(data => { setStats(data); setFetchError(null); })
      .catch(e => setFetchError(e.message || String(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = (cat, val) => {
    setStats(s => s ? { ...s, [cat]: { ...s[cat], enabled: val } } : s);
    fetch(`${API}/cache/settings`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [cat]: val }),
    }).catch(() => {});
  };

  const clear = async (cat) => {
    setClearing(c => ({ ...c, [cat]: true }));
    await fetch(`${API}/cache/clear`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat }),
    }).catch(() => {});
    setClearing(c => ({ ...c, [cat]: false }));
    setCleared(c => ({ ...c, [cat]: true }));
    setTimeout(() => setCleared(c => ({ ...c, [cat]: false })), 1800);
    load();
  };

  const categories = [
    { key: "songs",     label: t("cacheSongs"),     icon: <MusicNote size={16} />,    color: "var(--accent)",  colorRaw: "180,80,180" },
    { key: "lyrics",    label: t("cacheLyrics"),    icon: <Microphone size={16} />,   color: "#7c6ff7",        colorRaw: "124,111,247" },
    { key: "playlists", label: t("cachePlaylists"), icon: <Queue size={16} />,        color: "#3a9fd6",        colorRaw: "58,159,214" },
    { key: "albums",    label: t("cacheAlbums"),    icon: <VinylRecord size={16} />,  color: "#c8860a",        colorRaw: "200,134,10" },
    { key: "images",    label: t("cacheImages"),    icon: <ImageSquare size={16} />,  color: "#2e9e5b",        colorRaw: "46,158,91" },
  ];

  const totalBytes = stats ? categories.reduce((sum, c) => sum + (stats[c.key]?.size ?? 0), 0) : 0;

  const [maxCacheMb, setMaxCacheMb] = useState(() => {
    const v = localStorage.getItem("kiyoshi-max-cache-mb");
    return v ? parseInt(v, 10) : 0;
  });
  const sliderIndex = MAX_CACHE_STEPS.indexOf(maxCacheMb);
  const handleSlider = (idx) => {
    const val = MAX_CACHE_STEPS[idx];
    setMaxCacheMb(val);
    if (val === 0) localStorage.removeItem("kiyoshi-max-cache-mb");
    else localStorage.setItem("kiyoshi-max-cache-mb", String(val));
  };
  const stepLabel = (v) => {
    if (v === 0) return t("unlimited");
    if (v >= 1000) return `${v / 1000} GB`;
    return `${v} MB`;
  };
  const overLimit = maxCacheMb > 0 && totalBytes > maxCacheMb * 1024 * 1024;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {fetchError && (
        <div style={{
          padding: "12px 16px", marginBottom: 6, borderRadius: "var(--r-lg)",
          background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 12,
        }}>
          {t("cacheStatsError")}: {fetchError}
        </div>
      )}

      {/* ── Summary card ── */}
      <CardRoot variant="secondary" className="px-[18px] py-4 gap-0! transition-colors"
        style={{ background: overLimit ? "color-mix(in srgb, #ff4444 8%, var(--surface-1))" : "var(--surface-1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>
            {t("totalCacheUsage")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {overLimit && (
              <div style={{ fontSize: 11, color: "var(--status-danger)", fontWeight: 600 }}>
                {t("cacheWarning")}
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 700, color: overLimit ? "var(--status-danger)" : "var(--t1)" }}>
              {stats ? fmtBytes(totalBytes) : "…"}
            </div>
          </div>
        </div>
        {/* Stacked bar */}
        <div style={{ height: 6, borderRadius: "var(--r-full)", overflow: "hidden", background: "var(--bg-base)", display: "flex" }}>
          {stats && totalBytes > 0 && categories.map(c => {
            const pct = (stats[c.key]?.size ?? 0) / totalBytes * 100;
            return pct > 0 ? (
              <div key={c.key} style={{ width: `${pct}%`, background: c.color, transition: "width 0.4s ease" }} />
            ) : null;
          })}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 10 }}>
          {categories.map(c => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t3)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "var(--r-full)", background: c.color, flexShrink: 0 }} />
              {c.label}
            </div>
          ))}
        </div>
      </CardRoot>

      {/* ── Category rows — one card each ── */}
      {categories.map(({ key, label, icon, color, colorRaw }) => {
        const s = stats?.[key];
        const isClearing = clearing[key];
        const wasCleared = cleared[key];

        return (
          <CardRoot key={key} variant="secondary"
            className={cn("bg-surface-1 flex flex-row items-center gap-3.5 px-[18px] py-3.5 transition-opacity", s?.enabled === false && "opacity-50")}>
            {/* Colored icon badge */}
            <div className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center"
              style={{ background: `rgba(${colorRaw},0.15)`, color }}>{icon}</div>

            {/* Label + stats */}
            <div className="flex-1 min-w-0">
              <div className="text-[length:var(--t13)] font-medium text-primary">{label}</div>
              <div className="text-[length:var(--t11)] text-muted mt-0.5">
                {s ? <span style={{ color, fontWeight: 600 }}>{fmtBytes(s.size)}</span> : "…"}
                {s?.count != null && <span> · {s.count} {key === "images" ? t("cacheFiles") : t("cacheEntries")}</span>}
              </div>
            </div>

            {/* Clear button */}
            <Button variant="ghost" size="sm" isDisabled={isClearing || wasCleared} onPress={() => clear(key)}
              className={cn("min-w-[72px]", wasCleared && "text-[var(--status-success)]!")}>
              {wasCleared
                ? <><Check size={11} />{t("cacheCleared")}</>
                : isClearing ? "…" : t("cacheClear")}
            </Button>

            {/* Toggle */}
            <Toggle value={s?.enabled ?? true} onChange={v => toggleEnabled(key, v)} />
          </CardRoot>
        );
      })}

      {/* ── Max cache size slider ── */}
      <CardRoot variant="secondary" className="bg-surface-1 px-[18px] py-3.5 gap-0!">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "var(--r-md)", flexShrink: 0,
            background: "transparent", color: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HardDrives size={15} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{t("maxCacheSize")}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>
              {stepLabel(maxCacheMb)}
            </div>
          </div>
        </div>
        <Slider
          min={0}
          max={MAX_CACHE_STEPS.length - 1}
          step={1}
          value={sliderIndex >= 0 ? sliderIndex : MAX_CACHE_STEPS.length - 1}
          onChange={handleSlider}
          width="100%"
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--t3)", marginTop: 8 }}>
          {MAX_CACHE_STEPS.map((v, i) => (
            <span key={i} style={{
              fontWeight: i === sliderIndex ? 600 : 400,
              color: i === sliderIndex ? "var(--accent)" : undefined,
            }}>{stepLabel(v)}</span>
          ))}
        </div>
      </CardRoot>

      {/* ── Clear all ── */}
      <Button variant="ghost" fullWidth onPress={() => categories.forEach(c => clear(c.key))}>
        {t("cacheClearAll")}
      </Button>
    </div>
  );
}
