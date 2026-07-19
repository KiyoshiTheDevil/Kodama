import { useCallback, useEffect, useState } from "react";

import { API } from "@/shared/api/client.js";
import { translate } from "@/shared/i18n/i18n.js";

const MAX_CONCURRENT_DOWNLOADS = 5;

/**
 * Download + local-cache manager. Owns the offline-cache/download/premium id sets,
 * the active-download queue poll, batch bookkeeping/cleanup, the pending-queue drain
 * (max 5 concurrent), and the per-song/batch download, cache-removal, and export
 * (save-dialog + status poll) operations. Downloads and the cache are global (not
 * profile-scoped), so this state is never reset on profile switch.
 *
 * `addToast` and `language` are injected for the export toasts; the hook returns
 * explicit state/actions so views, rows, the progress card, and context menus keep
 * their current props.
 */
export function useDownloadManager({ addToast, language }) {
  const [cachedSongIds, setCachedSongIds] = useState(new Set());
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const [premiumSongIds, setPremiumSongIds] = useState(new Set());
  const [downloadQueue, setDownloadQueue] = useState([]); // [{videoId, title, artists, thumbnail, status, progress}]
  const [downloadBatches, setDownloadBatches] = useState([]); // [{id, title, thumbnail, artists, videoIds[], completedCount, errorCount}]
  const [pendingDownloadQueue, setPendingDownloadQueue] = useState([]); // tracks waiting for a free slot
  const [downloadQueueMin, setDownloadQueueMin] = useState(false); // download queue card minimized

  // Global queue poll — runs whenever there are active downloads
  useEffect(() => {
    if (downloadingIds.size === 0) return;
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${API}/downloads/queue`);
        const d = await r.json();
        const queue = d.queue || [];
        setDownloadQueue(queue);
        const doneIds = queue.filter((i) => i.status === "done").map((i) => i.videoId);
        const errorIds = queue.filter((i) => i.status === "error").map((i) => i.videoId);
        const premiumIds = queue
          .filter((i) => i.status === "error" && i.error_type === "premium_only")
          .map((i) => i.videoId);
        const finishedIds = [...doneIds, ...errorIds];
        if (doneIds.length)
          setCachedSongIds((prev) => {
            const s = new Set(prev);
            doneIds.forEach((id) => s.add(id));
            return s;
          });
        if (premiumIds.length)
          setPremiumSongIds((prev) => {
            const s = new Set(prev);
            premiumIds.forEach((id) => s.add(id));
            return s;
          });
        if (finishedIds.length) {
          setDownloadingIds((prev) => {
            const s = new Set(prev);
            finishedIds.forEach((id) => s.delete(id));
            return s;
          });
          setDownloadBatches((prev) =>
            prev.map((b) => {
              const added = doneIds.filter((id) => b.videoIds.includes(id)).length;
              const addedErr = errorIds.filter((id) => b.videoIds.includes(id)).length;
              return added || addedErr
                ? {
                    ...b,
                    completedCount: b.completedCount + added,
                    errorCount: b.errorCount + addedErr,
                  }
                : b;
            })
          );
        }
      } catch {
        /* intentionally ignored */
      }
    }, 1500);
    return () => clearInterval(poll);
  }, [downloadingIds.size]);

  // Remove fully-finished batches after a short delay
  useEffect(() => {
    const done = downloadBatches.filter(
      (b) => b.completedCount + b.errorCount >= b.videoIds.length
    );
    if (!done.length) return;
    const t = setTimeout(() => {
      setDownloadBatches((prev) =>
        prev.filter((b) => b.completedCount + b.errorCount < b.videoIds.length)
      );
    }, 2500);
    return () => clearTimeout(t);
  }, [downloadBatches]);

  const handleDownloadSong = useCallback(
    async (track) => {
      if (!track?.videoId || downloadingIds.has(track.videoId) || cachedSongIds.has(track.videoId))
        return;
      setDownloadingIds((prev) => new Set(prev).add(track.videoId));
      try {
        await fetch(`${API}/song/download/${track.videoId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: track.title,
            artists: track.artists,
            album: track.album,
            duration: track.duration,
            thumbnail: track.thumbnail,
          }),
        });
      } catch {
        setDownloadingIds((prev) => {
          const s = new Set(prev);
          s.delete(track.videoId);
          return s;
        });
      }
    },
    [downloadingIds, cachedSongIds]
  );

  // Drain pending queue — start next tracks whenever a slot opens up (max 5 concurrent)
  useEffect(() => {
    if (pendingDownloadQueue.length === 0) return;
    const slots = MAX_CONCURRENT_DOWNLOADS - downloadingIds.size;
    if (slots <= 0) return;
    const toStart = pendingDownloadQueue.slice(0, slots);
    setPendingDownloadQueue((prev) => prev.slice(toStart.length));
    toStart.forEach((track) => handleDownloadSong(track));
  }, [pendingDownloadQueue.length, downloadingIds.size]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadAll = useCallback(
    (tracks, meta = {}) => {
      const eligible = tracks.filter(
        (t) => !cachedSongIds.has(t.videoId) && !downloadingIds.has(t.videoId)
      );
      if (!eligible.length) return;
      const batchId = Date.now().toString();
      setDownloadBatches((prev) => [
        ...prev,
        {
          id: batchId,
          title: meta.title || "",
          thumbnail: meta.thumbnail || "",
          artists: meta.artists || "",
          videoIds: eligible.map((t) => t.videoId),
          completedCount: 0,
          errorCount: 0,
        },
      ]);
      setPendingDownloadQueue((prev) => [...prev, ...eligible]);
    },
    [cachedSongIds, downloadingIds]
  );

  // Cancel a download batch: drop it from the UI + remove its not-yet-started tracks
  // from the pending queue. (In-flight server downloads can't be aborted backend-side.)
  const handleCancelBatch = useCallback((batchId) => {
    setDownloadBatches((prev) => {
      const batch = prev.find((b) => b.id === batchId);
      if (batch) {
        const ids = new Set(batch.videoIds);
        setPendingDownloadQueue((pq) => pq.filter((t) => !ids.has(t.videoId)));
        setDownloadingIds((di) => {
          const s = new Set(di);
          batch.videoIds.forEach((id) => s.delete(id));
          return s;
        });
      }
      return prev.filter((b) => b.id !== batchId);
    });
  }, []);

  const handleRemoveAllDownloads = useCallback(
    async (tracks) => {
      const videoIds = tracks.filter((t) => cachedSongIds.has(t.videoId)).map((t) => t.videoId);
      if (!videoIds.length) return;
      try {
        await fetch(`${API}/songs/cached/delete-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoIds }),
        });
        setCachedSongIds((prev) => {
          const s = new Set(prev);
          videoIds.forEach((id) => s.delete(id));
          return s;
        });
      } catch {
        /* intentionally ignored */
      }
    },
    [cachedSongIds]
  );

  // Remove a single cached/downloaded song from disk + local state.
  const removeCachedSong = useCallback(async (videoId) => {
    if (!videoId) return;
    try {
      await fetch(`${API}/song/cached/${videoId}`, { method: "DELETE" });
      setCachedSongIds((prev) => {
        const s = new Set(prev);
        s.delete(videoId);
        return s;
      });
    } catch {
      /* intentionally ignored */
    }
  }, []);

  // Mark a song as premium-only (surfaced when playback detects it can't be fetched).
  const markPremium = useCallback((videoId) => {
    setPremiumSongIds((prev) => new Set(prev).add(videoId));
  }, []);

  const handleExportSong = useCallback(
    async (track, format) => {
      if (!track?.videoId) return;
      try {
        if (format === "mp3") {
          const ffRes = await fetch(`${API}/song/export/ffmpeg-available`)
            .then((r) => r.json())
            .catch(() => ({ available: false }));
          if (!ffRes.available) {
            addToast(translate(language, "noFfmpeg"), "error");
            return;
          }
        }
        const { save } = await import("@tauri-apps/plugin-dialog");
        const artistStr = Array.isArray(track.artists)
          ? track.artists.map((a) => (typeof a === "string" ? a : a.name)).join(", ")
          : track.artists || "Unknown";
        const ext = format === "mp3" ? "mp3" : "opus";
        const defaultName = `${artistStr} - ${track.title || "Song"}.${ext}`;
        const defaultDir = localStorage.getItem("kiyoshi-mp3-dir") || undefined;
        const filePath = await save({
          title: translate(language, format === "mp3" ? "saveAsMp3" : "saveAsOpus"),
          defaultPath: defaultDir ? `${defaultDir}\\${defaultName}` : defaultName,
          filters:
            format === "mp3"
              ? [{ name: "MP3", extensions: ["mp3"] }]
              : [{ name: "OPUS", extensions: ["opus", "webm"] }],
        });
        if (!filePath) return;
        const dir = filePath.replace(/[\\/][^\\/]+$/, "");
        if (dir) localStorage.setItem("kiyoshi-mp3-dir", dir);
        const artistStr2 = Array.isArray(track.artists)
          ? track.artists.map((a) => (typeof a === "string" ? a : a.name)).join(", ")
          : track.artists || "";
        await fetch(`${API}/song/export/${track.videoId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            output_path: filePath,
            format,
            title: track.title || "",
            artists: artistStr2,
            album: track.album || "",
            year: track.year || "",
            albumBrowseId: track.albumBrowseId || "",
            thumbnail: track.thumbnail || "",
          }),
        });
        addToast(translate(language, "exportStarted"), "info");
        const poll = setInterval(async () => {
          try {
            const r = await fetch(`${API}/song/export/status/${track.videoId}`);
            const d = await r.json();
            if (d.status === "done") {
              clearInterval(poll);
              addToast(translate(language, "exportDone"), "success");
            } else if (d.status === "error") {
              clearInterval(poll);
              addToast(translate(language, "exportError"), "error");
            }
          } catch {
            clearInterval(poll);
          }
        }, 2000);
      } catch {
        /* intentionally ignored */
      }
    },
    [language, addToast]
  );

  // Load cached song IDs on mount (with retry for slow backend startup)
  useEffect(() => {
    let cancelled = false;
    const load = (attempt = 0) => {
      fetch(`${API}/song/cached/list`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setCachedSongIds(new Set((d.songs || []).map((s) => s.videoId)));
        })
        .catch(() => {
          if (!cancelled && attempt < 20) setTimeout(() => load(attempt + 1), 1500);
        });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    cachedSongIds,
    downloadingIds,
    premiumSongIds,
    downloadQueue,
    downloadBatches,
    downloadQueueMin,
    setDownloadQueueMin,
    handleDownloadSong,
    handleDownloadAll,
    handleCancelBatch,
    handleRemoveAllDownloads,
    handleExportSong,
    removeCachedSong,
    markPremium,
  };
}
