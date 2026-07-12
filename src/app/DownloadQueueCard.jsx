import {
  Button,
  Spinner,
  ProgressBar,
  ProgressBarTrack,
  ProgressBarFill,
} from "@heroui/react";

import { CheckCircle, CaretUp, CaretDown, X } from "../icons.jsx";
import { thumb } from "../shared/api/thumbnails.js";
import { translate } from "../i18n.js";

// Floating download-progress card: overall progress header (with minimize toggle) plus a
// per-batch row (thumbnail, title, cancel, progress bar). Behaviour and props preserved
// from the former inline App render; download state/actions come from useDownloadManager.
export function DownloadQueueCard({ batches, minimized, onToggleMinimize, onCancelBatch, language }) {
  const overallDone = batches.reduce((s, b) => s + b.completedCount + b.errorCount, 0);
  const overallTotal = batches.reduce((s, b) => s + b.videoIds.length, 0);
  const allFinished = overallDone >= overallTotal;
  return (
    <div
      className="fixed right-4 z-[100000] w-[320px] max-h-80 overflow-y-auto flex flex-col gap-3 p-3 rounded-2xl bg-elevated border border-border shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      style={{ bottom: 120, animation: "ctxMenuIn 0.18s ease-out" }}
    >
      <div className="flex items-center gap-2">
        {minimized &&
          (allFinished ? (
            <CheckCircle size={14} weight="fill" className="text-[#4caf50] shrink-0" />
          ) : (
            <Spinner size="sm" className="shrink-0" />
          ))}
        <span className="text-t10 font-bold uppercase tracking-wider text-muted px-0.5">
          {translate(language, "downloadQueue")}
        </span>
        {minimized && (
          <span className="text-t10 font-bold text-muted tabular-nums">
            {overallDone} / {overallTotal}
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          onPress={onToggleMinimize}
          aria-label={minimized ? "Expand" : "Minimize"}
        >
          {minimized ? <CaretUp size={13} /> : <CaretDown size={13} />}
        </Button>
      </div>
      {!minimized &&
        batches.map((batch) => {
          const total = batch.videoIds.length;
          const done = batch.completedCount + batch.errorCount;
          const isFinished = done >= total;
          const pct = total ? Math.round((batch.completedCount / total) * 100) : 0;
          return (
            <div key={batch.id} className="flex items-center gap-3">
              {batch.thumbnail ? (
                <img
                  src={thumb(batch.thumbnail)}
                  alt=""
                  className="w-11 h-11 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-hover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {isFinished ? (
                    <CheckCircle size={15} weight="fill" className="text-[#4caf50] shrink-0" />
                  ) : (
                    <Spinner size="sm" className="shrink-0" />
                  )}
                  <div className="text-t12 font-semibold truncate flex-1">{batch.title}</div>
                  {!isFinished && (
                    <Button
                      variant="ghost"
                      size="sm"
                      isIconOnly
                      className="shrink-0 -mr-1"
                      onPress={() => onCancelBatch(batch.id)}
                      aria-label={translate(language, "cancel")}
                      title={translate(language, "cancel")}
                    >
                      <X size={12} />
                    </Button>
                  )}
                </div>
                {batch.artists && (
                  <div className="text-t11 text-muted truncate">{batch.artists}</div>
                )}
                <div className="mt-1.5">
                  <ProgressBar aria-label="Download progress" value={pct} className="w-full">
                    <ProgressBarTrack className="h-1.5!">
                      <ProgressBarFill />
                    </ProgressBarTrack>
                  </ProgressBar>
                </div>
                <div className="flex items-center justify-between text-t11 text-muted mt-1">
                  <span>
                    {done} / {total}
                  </span>
                  <span>{pct}%</span>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
