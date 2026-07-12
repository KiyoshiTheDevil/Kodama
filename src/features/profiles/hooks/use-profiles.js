import { useCallback, useEffect, useRef, useState } from "react";

import { API } from "../../../shared/api/client.js";
import { translate } from "../../../i18n.js";

/**
 * Profiles / auth / session domain. Owns the profile list + cached-fallback, the
 * auth bootstrap (validate → cache fallback → background poll), the "session
 * expired" warning, the hidden session-keeper WebView lifecycle, and the
 * account switch/add/reauth/remove/rename/avatar/logout commands.
 *
 * The switch/remove/logout commands must reset app-wide UI (view, playback, queue,
 * collection, overlays) as a single business sequence. Those state cells are still
 * owned by App for now, so their setters are injected; the *ordering* of the reset
 * stays here, in the profile domain, exactly as before. As navigation/player
 * contexts land in later steps these injected setters become context reads.
 */
export function useProfiles({
  addToast,
  setPinnedIds,
  setView,
  setSearchQuery,
  setAppKey,
  setCurrentTrack,
  setQueue,
  setCollection,
  setOverlayOpen,
  setQueueOpen,
}) {
  const [profiles, setProfiles] = useState([]);
  const [hasProfile, setHasProfile] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const sessionWarnedRef = useRef(null); // profile name we've already shown the "session expired" toast for
  const [showLangPicker, setShowLangPicker] = useState(() => !localStorage.getItem("kiyoshi-lang"));
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const [addingProfile, setAddingProfile] = useState(false);
  const [reauthName, setReauthName] = useState(null); // re-login an existing profile via OAuth under its own name
  const [currentProfile, setCurrentProfile] = useState(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const r = await fetch(`${API}/profiles`);
      const d = await r.json();
      // Persist for offline fallback
      try {
        localStorage.setItem(
          "kiyoshi-profiles-cache",
          JSON.stringify({ profiles: d.profiles || [], current: d.current || null })
        );
      } catch {}
      setProfiles(d.profiles || []);
      setCurrentProfile(d.current || null);
      setHasProfile((d.profiles || []).length > 0 && d.current);
      if (d.current) {
        window.__activeProfile = d.current;
        try {
          setPinnedIds(
            JSON.parse(localStorage.getItem(`kiyoshi-pinned-${d.current}`) || "[]").map(
              (p) => p.playlistId || p.browseId
            )
          );
        } catch {}
      }
      // Notify once when the active (real) account's session has expired, so the user knows to
      // refresh it. Reset when it's valid again so a later expiry warns anew.
      const active = (d.profiles || []).find((p) => p.name === d.current);
      if (active && active.type !== "local" && active.loggedOut) {
        if (sessionWarnedRef.current !== active.name) {
          sessionWarnedRef.current = active.name;
          setReauthName(active.name); // target the settings re-auth / login at this account
          const lang = localStorage.getItem("kiyoshi-lang") || "de";
          addToast(translate(lang, "sessionExpired"), "error");
        }
      } else if (active && !active.loggedOut) {
        sessionWarnedRef.current = null;
      }
    } catch {}
  }, [addToast, setPinnedIds]);

  // Keep the YT-Music session alive long-term: a hidden "session-keeper" WebView (a real
  // browser engine) rotates the *SIDTS timestamp cookies that plain HTTP requests cannot, and
  // pushes the fresh set to the backend. Only runs for real accounts — ensure_session_keeper
  // throws for local/offline profiles (no auth data dir), which cleanly skips it.
  useEffect(() => {
    if (!currentProfile) return;
    let interval = null,
      firstTimer = null,
      cancelled = false;
    (async () => {
      let invoke;
      try {
        ({ invoke } = await import("@tauri-apps/api/core"));
      } catch {
        return;
      }
      try {
        await invoke("ensure_session_keeper", { profileName: currentProfile });
      } catch {
        return;
      }
      if (cancelled) return;
      const rotate = () =>
        invoke("rotate_session_cookies", { profileName: currentProfile }).catch(() => {});
      firstTimer = setTimeout(() => {
        if (!cancelled) rotate();
      }, 25000);
      interval = setInterval(
        () => {
          if (!cancelled) rotate();
        },
        20 * 60 * 1000
      );
    })();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (firstTimer) clearTimeout(firstTimer);
      import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke("stop_session_keeper"))
        .catch(() => {});
    };
  }, [currentProfile]);

  // ── Account/profile actions — shared by the Sidebar quick-switcher dropdown
  //    and the Account settings tab. Single source of truth for the app-wide
  //    side effects (reset view/queue, show login, etc.). ──────────────────────
  const handleAccountSwitch = useCallback(
    async (name) => {
      await fetch(`${API}/profiles/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await fetchProfiles();
      setView("home");
      setCurrentTrack(null);
      setQueue([]);
      setCollection(null);
      setOverlayOpen(false);
      setQueueOpen(false);
      setSearchQuery("");
      setAppKey((k) => k + 1);
      window.__activeProfile = name;
      window.dispatchEvent(new CustomEvent("profile-switched"));
    },
    [
      fetchProfiles,
      setView,
      setCurrentTrack,
      setQueue,
      setCollection,
      setOverlayOpen,
      setQueueOpen,
      setSearchQuery,
      setAppKey,
    ]
  );

  const handleAccountAdd = useCallback(async () => {
    try {
      await fetch(`${API}/auth/begin-add`, { method: "POST" });
    } catch {}
    setAddingProfile(true);
    setShowLogin(true);
  }, []);

  const handleAccountReauth = useCallback((name) => {
    // Re-login an existing (expired/revoked) profile via OAuth, keeping its name & data.
    setReauthName(name);
    setAddingProfile(true);
    setShowLogin(true);
  }, []);

  const handleAccountRemove = useCallback(
    async (name) => {
      const wasActive = profiles.find((p) => p.name === name)?.active;
      await fetch(`${API}/profiles/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const remaining = profiles.filter((p) => p.name !== name);
      if (remaining.length === 0) {
        setView("home");
        setCurrentTrack(null);
        setQueue([]);
        setCollection(null);
        setOverlayOpen(false);
        setQueueOpen(false);
        setHasProfile(false);
        setShowLogin(true);
      } else if (wasActive) {
        const next = remaining[0];
        await fetch(`${API}/profiles/switch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: next.name }),
        });
        await fetchProfiles();
        setView("home");
        setCurrentTrack(null);
        setQueue([]);
        setCollection(null);
        setOverlayOpen(false);
        setQueueOpen(false);
        window.__activeProfile = next.name;
        window.dispatchEvent(new CustomEvent("profile-switched"));
        setAppKey((k) => k + 1);
      } else {
        await fetchProfiles();
      }
    },
    [
      profiles,
      fetchProfiles,
      setView,
      setCurrentTrack,
      setQueue,
      setCollection,
      setOverlayOpen,
      setQueueOpen,
      setAppKey,
    ]
  );

  const handleAccountRename = useCallback(
    async (name, displayName) => {
      const dn = (displayName || "").trim();
      if (!dn) return;
      await fetch(`${API}/profiles/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, displayName: dn }),
      });
      await fetchProfiles();
    },
    [fetchProfiles]
  );

  const handleAccountAvatarChange = useCallback(
    async (name, avatar) => {
      await fetch(`${API}/profiles/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, avatar: avatar || "" }),
      });
      await fetchProfiles();
    },
    [fetchProfiles]
  );

  const handleAccountLogout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: "POST" });
    } catch (e) {
      console.error("logout failed:", e);
    }
    await fetchProfiles();
    setCurrentTrack(null);
    setQueue([]);
    setCollection(null);
    setOverlayOpen(false);
    setQueueOpen(false);
    setHasProfile(false);
    setShowLogin(true);
  }, [fetchProfiles, setCurrentTrack, setQueue, setCollection, setOverlayOpen, setQueueOpen]);

  // Load cached profile data when backend is unreachable (offline / slow start)
  const loadCachedProfile = useCallback(() => {
    try {
      const raw = localStorage.getItem("kiyoshi-profiles-cache");
      if (!raw) return false;
      const { profiles: cp, current } = JSON.parse(raw);
      if (!cp?.length || !current) return false;
      setProfiles(cp);
      setCurrentProfile(current);
      setHasProfile(true);
      window.__activeProfile = current;
      try {
        setPinnedIds(
          JSON.parse(localStorage.getItem(`kiyoshi-pinned-${current}`) || "[]").map(
            (p) => p.playlistId || p.browseId
          )
        );
      } catch {}
      return true;
    } catch {
      return false;
    }
  }, [setPinnedIds]);

  // Auth bootstrap: show cached profile immediately, then validate against the backend
  // (with retries for slow startup); on failure keep a cached profile and poll in the
  // background until the backend responds.
  useEffect(() => {
    let bgIntervalId = null;

    // Show cached profile immediately so sidebar isn't empty during backend startup
    loadCachedProfile();

    // Check if we have a valid authenticated profile
    const checkAuth = async (retries = 15) => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000); // 3s timeout per attempt
        const r = await fetch(`${API}/auth/validate`, { signal: ctrl.signal });
        clearTimeout(tid);
        const d = await r.json();
        if (!d.valid && d.reason !== "adding_account") {
          // Auth invalid. If a real account existed (cached), its session expired — target the
          // login at it so it shows the "session expired" copy instead of the generic welcome.
          let expired = null;
          try {
            const c = JSON.parse(localStorage.getItem("kiyoshi-profiles-cache") || "{}");
            const cur = (c.profiles || []).find((p) => p.name === c.current);
            if (cur && cur.type !== "local") expired = cur;
          } catch {}
          try {
            localStorage.removeItem("kiyoshi-profiles-cache");
          } catch {}
          if (expired) setReauthName(expired.name);
          setShowLogin(true);
        } else {
          fetchProfiles();
          // Re-fetch after a short delay to pick up background avatar writes
          setTimeout(() => fetchProfiles(), 4000);
        }
      } catch {
        // Backend not ready yet - retry
        if (retries > 0) {
          setTimeout(() => checkAuth(retries - 1), 1500);
        } else {
          // All retries exhausted — cache already loaded above, show login only if no cache
          const raw = localStorage.getItem("kiyoshi-profiles-cache");
          let hasCache = false;
          try {
            const p = JSON.parse(raw || "{}");
            hasCache = p.profiles?.length > 0 && p.current;
          } catch {}
          if (!hasCache) setShowLogin(true);
          // Keep pinging in background; once backend responds, sync live data
          bgIntervalId = setInterval(async () => {
            try {
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 2000);
              const r = await fetch(`${API}/auth/validate`, { signal: ctrl.signal });
              clearTimeout(tid);
              const d = await r.json();
              if (bgIntervalId) {
                clearInterval(bgIntervalId);
                bgIntervalId = null;
              }
              if (d.valid || d.reason === "adding_account") {
                fetchProfiles();
              }
            } catch {}
          }, 3000);
        }
      }
    };
    // Give server time to start and load profiles (retries cover any remaining startup time)
    setTimeout(() => checkAuth(), 1000);

    return () => {
      if (bgIntervalId) {
        clearInterval(bgIntervalId);
        bgIntervalId = null;
      }
    };
  }, [fetchProfiles, loadCachedProfile]);

  return {
    profiles,
    showLogin,
    setShowLogin,
    showLangPicker,
    setShowLangPicker,
    showProfileSwitcher,
    setShowProfileSwitcher,
    addingProfile,
    setAddingProfile,
    reauthName,
    setReauthName,
    currentProfile,
    fetchProfiles,
    handleAccountSwitch,
    handleAccountAdd,
    handleAccountReauth,
    handleAccountRemove,
    handleAccountRename,
    handleAccountAvatarChange,
    handleAccountLogout,
  };
}
