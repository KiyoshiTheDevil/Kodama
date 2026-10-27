// Downloads on a phone: while any run, the title bar's logo turns into a pill with a ring and a
// count (DownloadIsland), and a tap opens a sheet from the bottom with each batch in detail
// (DownloadSheet): its progress, what is done, what failed, and the songs loading right now.
// The desktop keeps its card in the corner (App.jsx); on a phone that card sat over the list.
import { thumb, useLang } from "../context.jsx";
import { ActionSheet } from "./action-sheet.jsx";
import { Spinner } from "@heroui/react";
import { CheckCircle, Clock, WarningCircle, WifiX, X } from "../icons.jsx";

// How far along a batch is: finished songs plus the part of the ones loading now, so the bar
// moves during a long song instead of jumping once it is done.
export function batchFraction(batch, queue) {
  const total = batch.videoIds.length || 1;
  let partial = 0;
  for (const q of queue) {
    if (q.status === "downloading" && batch.videoIds.includes(q.videoId)) partial += Math.max(0, Math.min(1, q.progress || 0));
  }
  return Math.min(1, (batch.completedCount + batch.errorCount + partial) / total);
}

// The ring is a conic fill under a disc, which needs no SVG and follows the accent.
function Ring({ fraction, done, size = 20 }) {
  if (done) return <CheckCircle size={size - 2} style={{ color: "var(--status-success)" }} />;
  const deg = Math.round(Math.max(0.02, fraction) * 360);
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: `conic-gradient(var(--accent) ${deg}deg, var(--fill-strong) ${deg}deg)`,
      transition: "background 0.3s",
    }}>
      <span style={{ width: size - 6, height: size - 6, borderRadius: "50%", background: "var(--bg-elevated)" }} />
    </span>
  );
}

export function DownloadIsland({ done, total, fraction, finished, onOpen }) {
  const t = useLang();
  return (
    <button type="button" onClick={onOpen} aria-label={t("downloadQueue")}
      style={{
        pointerEvents: "all", display: "inline-flex", alignItems: "center", gap: 8, height: 32,
        padding: "0 12px 0 6px", border: 0, borderRadius: 999, cursor: "default",
        background: "var(--bg-elevated)", color: "var(--text-primary)",
        fontFamily: "var(--font)", fontSize: "var(--t13)", fontWeight: 600, fontVariantNumeric: "tabular-nums",
        animation: "pillRiseIn 0.26s cubic-bezier(0.22,1,0.36,1)",
      }}>
      <Ring fraction={fraction} done={finished} />
      {finished ? t("downloadsFinished") : `${done} / ${total}`}
    </button>
  );
}

// Offline: the same place, saying so, and leading to what still plays.
export function OfflinePill({ onOpen }) {
  const t = useLang();
  return (
    <button type="button" onClick={onOpen} aria-label={t("offlineToDownloads")}
      style={{
        pointerEvents: "all", display: "inline-flex", alignItems: "center", gap: 8, height: 32,
        padding: "0 14px 0 12px", border: 0, borderRadius: 999, cursor: "default",
        background: "var(--bg-elevated)", color: "var(--status-warning)",
        fontFamily: "var(--font)", fontSize: "var(--t13)", fontWeight: 600,
        animation: "pillRiseIn 0.26s cubic-bezier(0.22,1,0.36,1)",
      }}>
      <WifiX size={14} />
      {t("offlinePill")}
    </button>
  );
}

function Bar({ fraction }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--fill-strong)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.round(fraction * 1000) / 10}%`, background: "var(--accent)", borderRadius: 3, transition: "width 0.4s ease" }} />
    </div>
  );
}

const ROW_H = 40;

// One song of a batch: done, failed (with why), loading (how far), or waiting. In the batch's
// own order, so a row never moves; only its icon and number change.
function SongRow({ title, state, progress }) {
  const t = useLang();
  const icon = state === "done" ? <CheckCircle size={15} style={{ color: "var(--status-success)" }} />
    : state === "premium" || state === "error" ? <WarningCircle size={15} style={{ color: "var(--status-danger)" }} />
    : state === "loading" ? <Spinner size="sm" />
    : <Clock size={15} style={{ color: "var(--text-muted)" }} />;
  const note = state === "premium" ? t("downloadsPremium") : state === "error" ? t("downloadsError")
    : state === "loading" ? `${Math.floor((progress || 0) * 100)} %` : "";
  return (
    <div style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", opacity: state === "waiting" ? 0.55 : 1 }}>
      <span style={{ width: 16, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--t13)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      {note && <span style={{ fontSize: "var(--t12)", color: state === "loading" ? "var(--text-muted)" : "var(--status-danger)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{note}</span>}
    </div>
  );
}

function Batch({ batch, queue, onCancel, first }) {
  const t = useLang();
  const total = batch.videoIds.length;
  const finished = batch.completedCount + batch.errorCount >= total;
  const fraction = batchFraction(batch, queue);
  const remaining = Math.max(0, total - batch.completedCount - batch.errorCount);
  const live = new Map(queue.filter((q) => q.status === "downloading").map((q) => [q.videoId, q.progress]));
  const results = batch.results || {};
  // A fixed height for the list: up to six rows, scrolling beyond. It no longer grows and
  // shrinks with the number of songs loading at the moment.
  const listH = Math.min(total, 6) * ROW_H;
  const stats = [
    t("downloadsDone", { n: batch.completedCount }),
    batch.errorCount > 0 ? t("downloadsFailed", { n: batch.errorCount }) : null,
    remaining > 0 ? t("downloadsLeft", { n: remaining }) : null,
  ].filter(Boolean).join(" · ");
  return (
    <div style={{ borderTop: first ? 0 : "1px solid var(--border)", paddingTop: first ? 0 : 12, marginTop: first ? 0 : 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px" }}>
        {batch.thumbnail
          ? <img src={thumb(batch.thumbnail)} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
          : <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--fill-strong)", flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--t14)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{batch.title || t("downloadQueue")}</div>
          <div style={{ fontSize: "var(--t12)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{stats}</div>
        </div>
        {finished
          ? <CheckCircle size={18} style={{ color: "var(--status-success)", flexShrink: 0 }} />
          : (
            <button type="button" onClick={() => onCancel(batch.id)} aria-label={t("cancel")}
              style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: "var(--fill-strong)", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "default", flexShrink: 0 }}>
              <X size={13} />
            </button>
          )}
      </div>
      <div style={{ padding: "12px 20px 6px" }}><Bar fraction={fraction} /></div>
      <div className="scrollable" style={{ height: listH, overflowY: "auto" }}>
        {batch.videoIds.map((id) => {
          const state = results[id] || (live.has(id) ? "loading" : "waiting");
          return <SongRow key={id} title={batch.titles?.[id] || id} state={state} progress={live.get(id)} />;
        })}
      </div>
    </div>
  );
}

export function DownloadSheet({ open, onClose, batches, queue, onCancel }) {
  const t = useLang();
  const items = batches.map((b, i) => ({ id: b.id, custom: <Batch batch={b} queue={queue} onCancel={onCancel} first={i === 0} />, flush: true }));
  return <ActionSheet open={open} onClose={onClose} title={t("downloadQueue")} items={items} />;
}
