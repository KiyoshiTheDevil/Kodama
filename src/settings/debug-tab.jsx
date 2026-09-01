import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button, CardRoot } from "@heroui/react";
import { API, useLang } from "../context.jsx";
import { ArrowClockwise, ArrowSquareOut, Bug, CaretDown, Check, Copy, Flask, WarningCircle, X } from "../icons.jsx";
import { APP_VERSION } from "../version.js";
import { frontendLogs as _frontendLogs } from "../debug/console-log.js";

const _debugLevelColor = (level) => {
  if (level === "ERROR") return "#ff6b6b";
  if (level === "WARN")  return "var(--status-warning)";
  if (level === "INFO")  return "#64b5f6";
  return "var(--text-muted)";
};
const _debugLevelBg = (level) => {
  if (level === "ERROR") return "var(--status-danger-soft)";
  if (level === "WARN")  return "var(--status-warning-soft)";
  if (level === "INFO")  return "rgba(100,181,246,0.08)";
  return "transparent";
};
const _debugFmtTs = (ts) => new Date(ts * 1000).toTimeString().slice(0, 8);

// Relative "Xm Ys ago" formatter for the cookie-refresh age (seconds, or null = never).
function _debugFmtAge(ageS) {
  if (ageS == null) return "—";
  if (ageS < 60) return `${ageS}s`;
  const m = Math.floor(ageS / 60), s = ageS % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Colored "authed" status node — shared by DebugTab + DebugFloatingWindow's sysinfo rows.
function _debugAuthedNode(authed, t) {
  if (authed === true) return <span style={{ color: "var(--status-success)", display: "flex", alignItems: "center", gap: 4 }}><Check size={11} weight="bold" />{t("debugAuthedYes")}</span>;
  if (authed === false) return <span style={{ color: "var(--status-danger)", display: "flex", alignItems: "center", gap: 4 }}><WarningCircle size={11} weight="fill" />{t("debugAuthedNo")}</span>;
  return <span style={{ color: "var(--t3)" }}>{t("debugAuthedUnknown")}</span>;
}

// Auth/session rows appended to the sysinfo grid — surfaces what used to be invisible
// (raw print() output + the separate /diag endpoint) directly in the Debug menu.
function _debugAuthRows(info, t) {
  const err = info.lastStreamError;
  return [
    [t("debugAuthStatus"), _debugAuthedNode(info.authed, t)],
    [t("debugCookieRefresh"), info.cookieRefreshAgeS == null ? t("debugCookieRefreshNever") : `${_debugFmtAge(info.cookieRefreshAgeS)} ago`],
    [t("debugLastStreamError"), err
      ? <span title={`${err.videoId}: ${err.error}`}>{err.videoId} — {err.error.slice(0, 60)}{err.error.length > 60 ? "…" : ""}</span>
      : t("debugLastStreamErrorNone")],
  ];
}

function _buildDebugReport(info, logs) {
  return [
    "=== Kodama Debug Report ===",
    info ? [
      `App:        ${APP_VERSION}`,
      `Python:     ${info.python}`,
      `yt-dlp:     ${info.ytdlp}`,
      `ytmusicapi: ${info.ytmusicapi}`,
      `Flask:      ${info.flask}`,
      `Node.js:    ${info.node || "—"}`,
      `Profil:     ${info.profile}`,
      `Plattform:  ${info.platform}`,
      `Uptime:     ${info.uptime}`,
      `Data dir:   ${info.data_dir}`,
      `\n--- Session/Auth ---`,
      `Authed:           ${info.authed === true ? "yes" : info.authed === false ? "no" : "unknown"}`,
      `Cookie-Refresh:   ${_debugFmtAge(info.cookieRefreshAgeS)} ago`,
      `Last stream err:  ${info.lastStreamError ? `${info.lastStreamError.videoId} — ${info.lastStreamError.error}` : "none"}`,
    ].join("\n") : "Backend nicht erreichbar",
    `\n=== Logs (${logs.length} Einträge) ===`,
    ...logs.map(l => `[${_debugFmtTs(l.ts)}] [${l.level}] [${l.source}] ${l.msg}`),
  ].join("\n");
}

// ─── Debug Floating Window ───────────────────────────────────────────────────
export function DebugFloatingWindow({ onClose }) {
  const t = useLang();
  const [info, setInfo]           = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [source, setSource]       = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeTab, setActiveTab] = useState("logs"); // "info" | "logs"
  const [copied, setCopied]       = useState(false);
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kiyoshi-debug-float-pos")) || { x: 80, y: 80 }; }
    catch { return { x: 80, y: 80 }; }
  });
  const logRef = useRef(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const fetchInfo = useCallback(() => {
    fetch(`${API}/debug/info`).then(r => r.json()).then(setInfo).catch(() => {});
  }, []);

  useEffect(() => {
    fetchInfo();
    const id = setInterval(fetchInfo, 3000);
    return () => clearInterval(id);
  }, [fetchInfo]);

  const allLogs = useMemo(() => {
    const backend = info?.logs || [];
    return [..._frontendLogs, ...backend].sort((a, b) => a.ts - b.ts);
  }, [info]);

  const visibleLogs = useMemo(() => allLogs.filter(l => {
    if (filter !== "ALL" && l.level !== filter) return false;
    if (source !== "ALL" && l.source !== source) return false;
    return true;
  }), [allLogs, filter, source]);

  useEffect(() => {
    if (autoScroll && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLogs.length, autoScroll]);

  const startDrag = useCallback((e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const ox = e.clientX - posRef.current.x;
    const oy = e.clientY - posRef.current.y;
    const onMove = (me) => {
      const np = { x: me.clientX - ox, y: me.clientY - oy };
      setPos(np);
      localStorage.setItem("kiyoshi-debug-float-pos", JSON.stringify(np));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(_buildDebugReport(info, visibleLogs))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };

  const sysRows = info ? [
    ["Python",     info.python],
    ["yt-dlp",     info.ytdlp],
    ["ytmusicapi", info.ytmusicapi],
    ["Flask",      info.flask],
    ["Node.js",    info.node ? info.node.split(/[/\\]/).pop() : "—"],
    ["Profil",     info.profile],
    ["Plattform",  info.platform],
    ["Uptime",     info.uptime],
    ..._debugAuthRows(info, t),
  ] : [];

  return createPortal(
    <div style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 9998,
      width: 660, height: 480, display: "flex", flexDirection: "column",
      background: "var(--bg-surface)", border: "0.5px solid var(--stroke)",
      borderRadius: "var(--r-xl)", boxShadow: "var(--elevation-4)",
      fontFamily: "var(--font)", overflow: "hidden",
      resize: "both", minWidth: 380, minHeight: 260,
    }}>
      {/* Title bar */}
      <div onMouseDown={startDrag} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", background: "var(--surface-1)",
        borderBottom: "0.5px solid var(--stroke)",
        cursor: "grab", userSelect: "none", flexShrink: 0,
      }}>
        <Bug size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span className="text-t12 font-semibold text-primary flex-1">Debug</span>
        <Button variant={activeTab === "info" ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setActiveTab("info")}>Sysinfo</Button>
        <Button variant={activeTab === "logs" ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setActiveTab("logs")}>Logs</Button>
        <Button variant="ghost" size="sm" className="text-t11 px-2.5!"
          onPress={() => window.dispatchEvent(new Event("kodama-open-diagnostics"))}>Live</Button>
        <div className="w-px h-3 bg-border mx-0.5" />
        <Button variant="ghost" size="sm" isIconOnly onPress={onClose} className="text-[var(--status-danger)]! rounded-full"><X size={12} weight="bold" /></Button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "10px 12px", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 200 }}>
        {activeTab === "info" && (
          <div style={{ overflowY: "auto" }}>
            {!info ? (
              <div className="text-t12 text-muted p-2">{t("loading")}…</div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {sysRows.map(([k, v]) => (
                  <CardRoot key={k} variant="secondary" className="bg-surface-1 flex flex-row items-center gap-2 px-3 py-2">
                    <span className="text-t11 text-muted min-w-[72px] shrink-0">{k}</span>
                    <span className="text-t11 text-primary font-mono overflow-hidden text-ellipsis whitespace-nowrap">{v}</span>
                  </CardRoot>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-1 mb-1.5 flex-wrap shrink-0">
              {["ALL","INFO","WARN","ERROR"].map(f => (
                <Button key={f} variant={filter === f ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setFilter(f)}>{f}</Button>
              ))}
              <div className="w-px h-3 bg-border mx-0.5" />
              {["ALL","frontend","backend"].map(s => (
                <Button key={s} variant={source === s ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setSource(s)}>{s === "ALL" ? "Alle" : s}</Button>
              ))}
              <div className="ml-auto flex gap-1">
                <Button variant={autoScroll ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setAutoScroll(a => !a)}>
                  <CaretDown size={10} /> Scroll
                </Button>
                <Button variant="ghost" size="sm" className="text-t11 px-2.5!" onPress={handleCopy}>
                  {copied ? <><Check size={10} weight="bold" /> {t("copied")}</> : <><Copy size={10} /> {t("copyAll")}</>}
                </Button>
              </div>
            </div>

            {/* Log list */}
            <div ref={logRef} className="scrollable" style={{
              flex: 1, overflowY: "auto", background: "var(--surface-1)",
              borderRadius: "var(--r-lg)",
              padding: "4px 2px", fontFamily: "monospace", fontSize: 10, minHeight: 0,
            }}
              onScroll={e => {
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight > 40 && autoScroll) setAutoScroll(false);
              }}
            >
              {visibleLogs.length === 0
                ? <div className="text-muted py-2.5 px-2 text-center">{t("debugNoLogs")}</div>
                : visibleLogs.map((entry, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 5, padding: "1px 5px",
                    borderRadius: "var(--r-xs)", marginBottom: 1, background: _debugLevelBg(entry.level),
                  }}>
                    <span style={{ color: "var(--t3)", flexShrink: 0, userSelect: "none" }}>{_debugFmtTs(entry.ts)}</span>
                    <span style={{ color: _debugLevelColor(entry.level), flexShrink: 0, minWidth: 36, fontWeight: 700, userSelect: "none" }}>{entry.level}</span>
                    <span style={{ color: entry.source === "frontend" ? "rgba(224,64,251,0.7)" : "rgba(100,181,246,0.6)", flexShrink: 0, minWidth: 50, userSelect: "none" }}>[{entry.source}]</span>
                    <span style={{ color: "var(--t2)", wordBreak: "break-all", lineHeight: 1.4 }}>{entry.msg}</span>
                  </div>
                ))
              }
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Debug Tab ───────────────────────────────────────────────────────────────
export function DebugTab({ t }) {
  const [info, setInfo]           = useState(null);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [source, setSource]       = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied]       = useState(false);
  const logRef = useRef(null);

  const fetchInfo = useCallback(() => {
    setError(null);
    fetch(`${API}/debug/info`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setInfo).catch(e => setError(e.message));
  }, []);
  useEffect(() => { fetchInfo(); }, [fetchInfo, refreshKey]);

  const allLogs = useMemo(() => {
    return [..._frontendLogs, ...(info?.logs || [])].sort((a, b) => a.ts - b.ts);
  }, [info]);
  const visibleLogs = useMemo(() =>
    allLogs.filter(l => (filter === "ALL" || l.level === filter) && (source === "ALL" || l.source === source)),
  [allLogs, filter, source]);
  useEffect(() => {
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLogs.length, autoScroll]);

  const handleCopy = () => {
    navigator.clipboard.writeText(_buildDebugReport(info, visibleLogs))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };
  const openFloat = () => window.dispatchEvent(new CustomEvent("kiyoshi-debug-float"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>

      {/* ── System Info ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{t("debugSysInfo")}</div>
          <Button variant="secondary" size="sm" onPress={openFloat}>
            <ArrowSquareOut size={12} />
            {t("debugOpenFloat")}
          </Button>
        </div>
        {error ? (
          <div style={{
            padding: "12px 16px", borderRadius: "var(--r-lg)",
            background: "var(--status-danger-soft)", color: "var(--status-danger)",
            fontSize: 12, display: "flex", alignItems: "center", gap: 8,
          }}>
            <WarningCircle size={14} weight="fill" style={{ flexShrink: 0 }} />
            {t("debugBackendUnreachable")}: {error}
          </div>
        ) : !info ? (
          <div style={{
            padding: "12px 16px", borderRadius: "var(--r-lg)",
            background: "var(--surface-1)", color: "var(--t3)", fontSize: 12,
          }}>{t("loading")}…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              ["Python",     info.python],
              ["yt-dlp",     info.ytdlp],
              ["ytmusicapi", info.ytmusicapi],
              ["Flask",      info.flask],
              ["Node.js",    info.node
                ? <span style={{ color: "var(--status-success)", display: "flex", alignItems: "center", gap: 4 }}><Check size={11} weight="bold" />{info.node.split(/[/\\]/).pop()}</span>
                : <span style={{ color: "var(--status-danger)" }}>—</span>],
              ["Profil",     info.profile],
              ["Plattform",  info.platform],
              ["Uptime",     info.uptime],
              ..._debugAuthRows(info, t),
            ].map(([k, v]) => (
              <CardRoot key={k} variant="secondary" className="bg-surface-1 flex flex-row items-center gap-2.5 px-3.5 py-2.5">
                <span className="text-t11 text-muted min-w-[76px] shrink-0">{k}</span>
                <span className="text-t12 text-primary font-mono overflow-hidden text-ellipsis whitespace-nowrap">{v}</span>
              </CardRoot>
            ))}
          </div>
        )}
      </div>

      {/* ── Log viewer ── */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <span className="text-t13 font-semibold text-primary mr-1.5">Logs</span>
          {["ALL","INFO","WARN","ERROR"].map(f => (
            <Button key={f} variant={filter === f ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setFilter(f)}>{f}</Button>
          ))}
          <div className="w-px h-3.5 bg-border mx-0.5" />
          {["ALL","frontend","backend"].map(s => (
            <Button key={s} variant={source === s ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setSource(s)}>{s === "ALL" ? "Alle" : s}</Button>
          ))}
          <div className="ml-auto flex gap-1">
            <Button variant={autoScroll ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setAutoScroll(a => !a)}>
              <CaretDown size={11} /> Auto-Scroll
            </Button>
            <Button variant="ghost" size="sm" className="text-t11 px-2.5!" onPress={() => setRefreshKey(k => k + 1)}>
              <ArrowClockwise size={11} /> {t("refresh")}
            </Button>
            <Button variant="ghost" size="sm" className="text-t11 px-2.5!" onPress={handleCopy}>
              {copied ? <><Check size={11} weight="bold" /> {t("copied")}</> : <><Copy size={11} /> {t("copyAll")}</>}
            </Button>
          </div>
        </div>

        {/* Log area */}
        <div ref={logRef} className="scrollable" style={{
          flex: 1, overflowY: "auto", background: "var(--surface-1)",
          borderRadius: "var(--r-lg)",
          padding: "6px 4px", fontFamily: "monospace", fontSize: 11, minHeight: 180,
        }}
          onScroll={e => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight > 40 && autoScroll) setAutoScroll(false); }}
        >
          {visibleLogs.length === 0
            ? <div style={{ color: "var(--t3)", padding: "12px 8px", textAlign: "center" }}>{t("debugNoLogs")}</div>
            : visibleLogs.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "2px 6px", borderRadius: "var(--r-xs)", marginBottom: 1, background: _debugLevelBg(entry.level) }}>
                <span style={{ color: "var(--t3)", flexShrink: 0, userSelect: "none" }}>{_debugFmtTs(entry.ts)}</span>
                <span style={{ color: _debugLevelColor(entry.level), flexShrink: 0, minWidth: 38, fontWeight: 700, userSelect: "none" }}>{entry.level}</span>
                <span style={{ color: entry.source === "frontend" ? "rgba(224,64,251,0.7)" : "rgba(100,181,246,0.6)", flexShrink: 0, minWidth: 52, userSelect: "none" }}>[{entry.source}]</span>
                <span style={{ color: "var(--t2)", wordBreak: "break-all", lineHeight: 1.45 }}>{entry.msg}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── Unison community identity (ECDSA key) ───────────────────────────────────
