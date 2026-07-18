import { useCallback, useEffect, useMemo, useRef } from "react";

import { parseDurationToSeconds } from "../../lyrics/parse.js";
import { API } from "../../shared/api/client.js";

/**
 * Shared Last.fm connection and request boundary.  It deliberately exposes the
 * connection ref as well as post(): liking a song lives outside the player but
 * must observe the very same connection status as playback scrobbling.
 */
export function useLastfmClient() {
  const connectedRef = useRef(false);

  const post = useCallback((path, body) => {
    if (!connectedRef.current) return;
    fetch(`${API}/lastfm/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    fetch(`${API}/lastfm/status`)
      .then((response) => response.json())
      .then((data) => {
        connectedRef.current = !!data.connected;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("lastfm-changed", refresh);
    window.addEventListener("profile-switched", refresh);
    return () => {
      window.removeEventListener("lastfm-changed", refresh);
      window.removeEventListener("profile-switched", refresh);
    };
  }, [refresh]);

  return useMemo(() => ({ connectedRef, post }), [post]);
}

function metadata(track) {
  return {
    artist: (track?.artists || "").replace(/\s*-\s*Topic$/i, "").trim(),
    track: (track?.title || "").trim(),
    album: track?.album || "",
    duration: parseDurationToSeconds(track?.duration) || 0,
  };
}

/** Keeps Last.fm now-playing and scrobble timing beside playback without owning the Last.fm client. */
export function useLastfmScrobbling({ currentTrack, isPlaying, lastfm }) {
  const scrobbleRef = useRef({ videoId: null, played: 0, scrobbled: false, startTs: 0 });

  useEffect(() => {
    const videoId = currentTrack?.videoId;
    if (!videoId) {
      scrobbleRef.current = { videoId: null, played: 0, scrobbled: false, startTs: 0 };
      return;
    }

    scrobbleRef.current = {
      videoId,
      played: 0,
      scrobbled: false,
      startTs: Math.floor(Date.now() / 1000),
    };
    const track = metadata(currentTrack);
    if (track.artist && track.track) lastfm.post("now-playing", track);
  }, [currentTrack?.videoId, lastfm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const state = scrobbleRef.current;
      if (!state.videoId || state.scrobbled) return;
      state.played += 1;
      const track = metadata(currentTrack);
      if (track.duration < 30) return;
      const threshold = Math.min(track.duration / 2, 240);
      if (state.played >= threshold && track.artist && track.track) {
        state.scrobbled = true;
        lastfm.post("scrobble", { ...track, timestamp: state.startTs });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack?.videoId, lastfm]); // eslint-disable-line react-hooks/exhaustive-deps
}
