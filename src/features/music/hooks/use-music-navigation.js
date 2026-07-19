import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { API } from "@/shared/api/client.js";
import { itemId, profileKey } from "../lib/playlist-id.js";

/**
 * Music navigation domain (Step 12): owns the active view, the back-navigation history stack,
 * the collection (playlist/album) currently open, the open artist view, and recent-playlist
 * persistence. `appKey`/`viewRefreshKey` are view-remount mechanics that travel with navigation
 * rather than any single feature view, so they live here too.
 *
 * `setSearchQuery` is injected because `handleSearch` also drives the search view's query text,
 * which stays App-owned (a cross-cutting UI concern, not navigation data) — same injection
 * pattern used by useProfiles/useNetworkStatus for their app-wide reset sequences.
 */
export function useMusicNavigation({ setSearchQuery }) {
  const [view, setView] = useState("home");
  const [, setNavHistory] = useState([]); // navigation history stack for back button
  const [appKey, setAppKey] = useState(0); // increment to force full re-render
  const [viewRefreshKey, setViewRefreshKey] = useState(0); // increment to refresh current view
  const [collection, setCollection] = useState(null); // { title, thumbnail, tracks }
  const [artistView, setArtistView] = useState(null);

  // Always-fresh snapshot of current nav state — used by open* callbacks to push history.
  const navStateRef = useRef({ view: "home", collection: null, artistView: null });
  useLayoutEffect(() => {
    navStateRef.current = { view, collection, artistView };
  }, [view, collection, artistView]);

  const handleSearch = useCallback(
    (q) => {
      setSearchQuery(q);
      setView("search");
    },
    [setSearchQuery]
  );

  const addRecentPlaylist = useCallback((pl) => {
    const key = profileKey("kiyoshi-recent");
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    })();
    const id = itemId(pl);
    const next = [pl, ...stored.filter((p) => itemId(p) !== id)].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("kiyoshi-recent-updated"));
  }, []);

  const removeRecentPlaylist = useCallback((id) => {
    const key = profileKey("kiyoshi-recent");
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    })();
    const next = stored.filter((p) => (p.playlistId || p.browseId) !== id);
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("kiyoshi-recent-updated"));
  }, []);

  const openPlaylist = useCallback(
    (item, fromView, refresh = false) => {
      // forcedTitle: when the caller provides a custom title (e.g. "Dusqk – Top Songs"),
      // we keep it and don't let the stream header overwrite it.
      if (!refresh) setNavHistory((h) => [...h, navStateRef.current]);
      const forcedTitle = item.forcedTitle || null;
      setCollection({
        title: forcedTitle || item.title,
        thumbnail: item.thumbnail,
        tracks: [],
        total: null,
        loading: true,
        progress: 0,
        cached: false,
        fromView: fromView || "library",
        forcedTitle,
        playlistId: item.playlistId,
      });
      setView("collection");
      addRecentPlaylist({
        playlistId: item.playlistId,
        title: forcedTitle || item.title,
        thumbnail: item.thumbnail,
        ...(forcedTitle ? { forcedTitle } : {}),
      });

      // Animate progress bar while waiting (fake progress up to 85%)
      let fakeProgress = 0;
      const interval = setInterval(() => {
        fakeProgress = Math.min(85, fakeProgress + Math.random() * 4);
        setCollection((c) => (c?.loading ? { ...c, progress: Math.round(fakeProgress) } : c));
      }, 400);

      const url = `${API}/playlist/${item.playlistId}/stream${refresh ? "?refresh=1" : ""}`;
      const es = new EventSource(url);
      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "header") {
          setCollection((c) =>
            c
              ? {
                  ...c,
                  title: c.forcedTitle || msg.title,
                  thumbnail: msg.thumbnail || c.thumbnail,
                  total: msg.total,
                  cached: msg.cached || false,
                }
              : c
          );
        } else if (msg.type === "tracks") {
          setCollection((c) => (c ? { ...c, tracks: [...c.tracks, ...msg.tracks] } : c));
        } else if (msg.type === "done" || msg.type === "error") {
          clearInterval(interval);
          setCollection((c) => (c ? { ...c, progress: 100 } : c));
          setTimeout(() => setCollection((c) => (c ? { ...c, loading: false } : c)), 400);
          es.close();
        }
      };
      es.onerror = () => {
        clearInterval(interval);
        setCollection((c) => (c ? { ...c, loading: false } : c));
        es.close();
      };
    },
    [addRecentPlaylist]
  );

  const openAlbum = useCallback(
    async (item, fromView, refresh = false) => {
      if (!refresh) setNavHistory((h) => [...h, navStateRef.current]);
      setCollection({
        title: item.title,
        thumbnail: item.thumbnail,
        tracks: [],
        total: null,
        loading: false,
        progress: 0,
        cached: false,
        fromView: fromView || "library",
        isAlbum: true,
        browseId: item.browseId,
      });
      setView("collection");
      addRecentPlaylist({
        browseId: item.browseId,
        title: item.title,
        thumbnail: item.thumbnail,
        type: "album",
      });
      const url = `${API}/album/${item.browseId}${refresh ? "?refresh=1" : ""}`;
      const r = await fetch(url);
      const d = await r.json();
      setCollection((c) => ({
        ...c,
        title: d.title,
        thumbnail: d.thumbnail || c.thumbnail,
        tracks: d.tracks || [],
        total: d.tracks?.length || 0,
        albumArtists: d.artists,
        albumArtistBrowseId: d.artistBrowseId,
        year: d.year,
        cached: !refresh && !!d.cached,
      }));
    },
    [addRecentPlaylist]
  );

  const openArtist = useCallback(
    (item, fromView) => {
      setNavHistory((h) => [...h, navStateRef.current]);
      setArtistView({ browseId: item.browseId, fromView: fromView || view });
      setView("artist");
      if (item.browseId && item.title) {
        addRecentPlaylist({
          browseId: item.browseId,
          title: item.title,
          thumbnail: item.thumbnail || "",
          type: "artist",
        });
      }
    },
    [view, addRecentPlaylist]
  );

  // Navigate to a top-level section (sidebar links) — always clears history.
  const navigateTo = useCallback((v) => {
    setNavHistory([]);
    setView(v);
  }, []);

  // Go back one step in history; falls back to home if the stack is empty.
  const goBack = useCallback(() => {
    setNavHistory((h) => {
      if (h.length === 0) {
        setView("home");
        return h;
      }
      const prev = h[h.length - 1];
      setView(prev.view);
      // Always restore collection (null for non-collection views so loading guards don't crash)
      setCollection(prev.collection ?? null);
      setArtistView(prev.artistView ?? null);
      return h.slice(0, -1);
    });
  }, []);

  return {
    view,
    setView,
    appKey,
    setAppKey,
    viewRefreshKey,
    setViewRefreshKey,
    collection,
    setCollection,
    artistView,
    setArtistView,
    handleSearch,
    addRecentPlaylist,
    removeRecentPlaylist,
    openPlaylist,
    openAlbum,
    openArtist,
    navigateTo,
    goBack,
  };
}
