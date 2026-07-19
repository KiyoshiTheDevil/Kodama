import { useEffect, useRef } from "react";

import { API } from "@/shared/api/client.js";

/**
 * Native and local now-playing bridges driven by the player controller.
 * Settings arrive through a ref because App declares the integration settings
 * after it creates the controller. App increments integrationRevision whenever
 * one changes so an already-playing track is reported immediately.
 */
export function usePlayerNativeBridges({
  audioRef,
  currentTrack,
  isPlaying,
  integrationsRef,
  integrationRevision,
}) {
  const overlaySnapshotRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    const send = async () => {
      if (cancelled) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        if (!currentTrack) {
          invoke("clear_discord_rpc").catch(() => {});
          invoke("media_clear").catch(() => {});
          return;
        }
        const audio = audioRef.current;
        const duration = audio?.duration;
        if (!duration || Number.isNaN(duration)) return;
        const artist = Array.isArray(currentTrack.artists)
          ? currentTrack.artists.map((entry) => entry?.name || entry).join(", ")
          : currentTrack.artists || "";
        const payload = {
          title: currentTrack.title || "",
          artist,
          album: currentTrack.album || "",
          thumbnail: currentTrack.thumbnail || "",
          duration,
          elapsed: audio?.currentTime || 0,
          paused: !isPlaying,
        };

        invoke("media_update", payload).catch(() => {});
        if (!integrationsRef.current.discordRpc) {
          invoke("clear_discord_rpc").catch(() => {});
          return;
        }
        invoke("update_discord_rpc", {
          ...payload,
          videoId: currentTrack.videoId || "",
          statusDisplay: integrationsRef.current.discordStatusDisplay || "song",
        }).catch(() => {});
      } catch {
        // Native bridges are optional when running outside Tauri.
      }
    };

    const debounce = setTimeout(send, 800);
    const interval = setInterval(send, 15000);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(interval);
    };
  }, [audioRef, currentTrack, isPlaying, integrationsRef, integrationRevision]);

  useEffect(() => {
    const report = () => {
      const audio = audioRef.current;
      const artist = Array.isArray(currentTrack?.artists)
        ? currentTrack.artists.map((entry) => entry?.name || entry).join(", ")
        : currentTrack?.artists || "";
      const payload = {
        title: currentTrack?.title || "",
        artist,
        album: currentTrack?.album || "",
        cover: currentTrack?.thumbnail
          ? `${API}/imgproxy?url=${encodeURIComponent(currentTrack.thumbnail)}`
          : "",
        progress: audio?.currentTime || 0,
        duration: audio?.duration || 0,
        isPlaying: isPlaying && !!currentTrack,
      };

      // The overlay is driven by SSE, but publishing unchanged state every second
      // needlessly wakes the backend (and produces an equally noisy request log).
      // Keep track and play/pause changes immediate, while advancing its progress
      // in five-second steps.
      const snapshot = JSON.stringify({
        ...payload,
        videoId: currentTrack?.videoId || "",
        progress: Math.floor(payload.progress / 5) * 5,
      });
      if (snapshot === overlaySnapshotRef.current) return;
      overlaySnapshotRef.current = snapshot;

      // The editor preview consumes this state even when the user has not enabled the OBS
      // server, so keep it fresh independently of the integration toggle.
      fetch(`${API}/overlay/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(500),
        body: JSON.stringify(payload),
      }).catch(() => {});
    };

    report();
    const interval = setInterval(report, 1000);
    return () => clearInterval(interval);
  }, [audioRef, currentTrack, isPlaying, integrationsRef, integrationRevision]);
}
