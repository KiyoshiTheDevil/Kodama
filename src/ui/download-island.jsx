// Downloads on a phone: while any run, the title bar's logo turns into a pill with a ring and a
// count (DownloadIsland), and a tap opens a sheet from the bottom with each batch in detail
// (DownloadSheet): its progress, what is done, what failed, and the songs loading right now.
// The desktop keeps its card in the corner (App.jsx); on a phone that card sat over the list.
import { thumb, useLang } from "../context.jsx";
import { ActionSheet } from "./action-sheet.jsx";
import { CheckCircle, WifiX, X } from "../icons.jsx";

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

function BatchCard({ batch, queue, onCancel }) {
  const t = useLang();
  const total = batch.videoIds.length;
  const finished = batch.completedCount + batch.errorCount >= total;
  const fraction = batchFraction(batch, queue);
  const remaining = Math.max(0, total - batch.completedCount - batch.errorCount);
  const now = queue.filter((q) => q.status === "downloading" && batch.videoIds.includes(q.videoId));
  return (
    <div style={{ padding: "10px 10px 12px", margin: "0 4px 8px", borderRadius: 16, background: "var(--bg-hover-overlay)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {batch.thumbnail
          ? <img src={thumb(batch.thumbnail)} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
          : <div style={{ width: 48, height: 48, borderRadius: 10, background: "var(--fill-strong)", flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--t14)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{batch.title || t("downloadQueue")}</div>
          {batch.artists && <div style={{ fontSize: "var(--t12)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{batch.artists}</div>}
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
      <Bar fraction={fraction} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t12)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        <span>{t("downloadsCount", { d: batch.completedCount + batch.errorCount, n: total })}</span>
        <span>{Math.floor(fraction * 100)} %</span>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: "var(--t12)", fontVariantNumeric: "tabular-nums", flexWrap: "wrap" }}>
        <span style={{ color: "var(--status-success)" }}>{t("downloadsDone", { n: batch.completedCount })}</span>
        {batch.errorCount > 0 && <span style={{ color: "var(--status-danger)" }}>{t("downloadsFailed", { n: batch.errorCount })}</span>}
        {remaining > 0 && <span style={{ color: "var(--text-muted)" }}>{t("downloadsLeft", { n: remaining })}</span>}
      </div>
      {now.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 2 }}>
          <div style={{ fontSize: "var(--t11)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{t("downloadsNow")}</div>
          {now.map((q) => (
            <div key={q.videoId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {q.thumbnail
                ? <img src={thumb(q.thumbnail)} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ width: 30, height: 30, borderRadius: 6, background: "var(--fill-strong)", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, fontSize: "var(--t12)" }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.title}</span>
                  <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{Math.floor((q.progress || 0) * 100)} %</span>
                </div>
                <Bar fraction={Math.max(0, Math.min(1, q.progress || 0))} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DownloadSheet({ open, onClose, batches, queue, onCancel }) {
  const t = useLang();
  const items = batches.map((b) => ({ id: b.id, custom: <BatchCard batch={b} queue={queue} onCancel={onCancel} /> }));
  return <ActionSheet open={open} onClose={onClose} title={t("downloadQueue")} items={items} />;
}
