// Big Picture mode — full-screen lean-back UI driven by a controller (verified Standard Mapping)
// and keyboard, with a spatial-navigation focus ring (norigin v2). Toggle with F10.
//
// Phase 1: a Home grid + a real Now Playing screen (wired to the live player via playerBridge).
// Later phases add browsing/search/detail screens + a proper entry point (instead of F10).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  init,
  pause,
  resume,
  FocusContext,
  useFocusable,
} from "@noriginmedia/norigin-spatial-navigation";
import { useController } from "./useController.js";
import { NowPlaying } from "./NowPlaying.jsx";
import { Browse } from "./Browse.jsx";
import { Search } from "./Search.jsx";
import { Detail } from "./Detail.jsx";
import { Artist } from "./Artist.jsx";
import { Lyrics } from "./Lyrics.jsx";
import { Home } from "./Home.jsx";
import { getContextTarget, clearContextTarget } from "./bpContext.js";
import { initSounds, playNav, playSelect, playBack, playOpen } from "./bpSounds.js";
import { Keybar } from "./Keybar.jsx";
import { setInputMode } from "./bpInput.js";
import { TabChrome } from "./TabChrome.jsx";

// Top-level tabs (peer views switched by LB/RB). Each maps to its screen id.
const TAB_KEYS = ["home", "search", "playlists", "albums", "artists"];
const TAB_SCREEN = {
  home: "home",
  search: "search",
  playlists: "browse-playlists",
  albums: "browse-albums",
  artists: "browse-artists",
};
const tabOfScreen = (s) =>
  s === "home" || s === "search" ? s : s.startsWith("browse-") ? s.slice(7) : null;

// Init once. Keep it paused so norigin's global key handling never touches the desktop UI —
// we only resume() while Big Picture is open.
init({ debug: false, visualDebug: false });
pause();

export function BigPicture() {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState("home"); // "home" | "nowplaying" | "search" | "browse-{type}" | "detail"
  const [detailItem, setDetailItem] = useState(null); // { type, item } for the detail screen
  const [artistItem, setArtistItem] = useState(null); // { browseId, artist } for the artist screen
  const [menu, setMenu] = useState(null); // context menu: { title, actions:[{label,run}] } | null
  const [menuIndex, setMenuIndex] = useState(0);
  const { ref, focusKey, focusSelf } = useFocusable();
  const screenRef = useRef(screen);
  const histRef = useRef([]); // back stack of previous screen names
  const menuRef = useRef(menu);
  const menuIndexRef = useRef(menuIndex);
  const openRef = useRef(open);
  useLayoutEffect(() => {
    screenRef.current = screen;
    menuRef.current = menu;
    menuIndexRef.current = menuIndex;
    openRef.current = open;
  }, [screen, menu, menuIndex, open]);

  const closeBigPicture = useCallback(() => {
    setScreen("home");
    histRef.current = [];
    setMenu(null);
    setOpen(false);
  }, []);

  const openMenu = useCallback(() => {
    const target = getContextTarget();
    if (target && target.actions && target.actions.length) {
      setMenuIndex(0);
      setMenu(target);
      playOpen();
    }
  }, []);

  // Switch the top-level tab (home/search/playlists/albums/artists) and reset the back trail —
  // tabs are the root level, so B from a tab closes Big Picture rather than popping between tabs.
  const switchTab = useCallback((key) => {
    histRef.current = [];
    setScreen(TAB_SCREEN[key]);
  }, []);
  const cycleTab = useCallback(
    (dir) => {
      const cur = tabOfScreen(screenRef.current);
      if (!cur) return; // only cycle while on a tab (not on a pushed overlay)
      const i = TAB_KEYS.indexOf(cur);
      playNav();
      switchTab(TAB_KEYS[(i + dir + TAB_KEYS.length) % TAB_KEYS.length]);
    },
    [switchTab]
  );

  // F10 toggles the whole mode; while open, Menu/"m"/ContextMenu opens the context menu.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F10") {
        e.preventDefault();
        if (openRef.current) closeBigPicture();
        else {
          initSounds();
          setOpen(true);
        }
        return;
      }
      if (!openRef.current || menuRef.current) return;
      if (e.key === "ContextMenu" || e.key.toLowerCase() === "m") {
        e.preventDefault();
        openMenu();
      } else if (e.key.toLowerCase() === "q") cycleTab(-1);
      else if (e.key.toLowerCase() === "e") cycleTab(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu, cycleTab, closeBigPicture]);

  // UI sounds for main-screen navigation. This single listener catches BOTH real keyboard keys
  // and the synthetic key events the controller path dispatches, so one sound fires per input
  // (never both). The menu drives its own sounds, so skip while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (menuRef.current) return;
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      )
        playNav();
      else if (e.key === "Enter") playSelect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // While open (and no menu): resume spatial nav. Pause it while the menu is up (we drive the menu
  // directly, so norigin must not move focus behind it) and while closed; reset on close.
  useEffect(() => {
    if (open && !menu) {
      resume();
      return;
    }
    pause();
  }, [open, menu]);

  // Drop any stale context-menu target when the screen changes.
  useEffect(() => {
    clearContextTarget();
  }, [screen]);

  // Keyboard control of the context menu (norigin is paused while it's open).
  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        playNav();
        setMenuIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        playNav();
        setMenuIndex((i) => Math.min(menu.actions.length - 1, i + 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        playSelect();
        const a = menu.actions[menuIndexRef.current];
        setMenu(null);
        a && a.run();
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        playBack();
        setMenu(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu]);

  // Track the active input device for the keybind bar: seed from whether a pad is connected when
  // BP opens, then flip to "key" on any real (non-synthetic) keydown. Controller callbacks set "pad".
  useEffect(() => {
    if (!open) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    setInputMode([...pads].some((p) => p) ? "pad" : "key");
    const onKey = (e) => {
      if (!e.bpSynthetic) setInputMode("key");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Set focus into the current screen whenever it (re)appears (but not while the menu is up;
  // re-focus the screen when the menu closes).
  useEffect(() => {
    if (!open || menu) return;
    const t = setTimeout(() => focusSelf(), 0);
    return () => clearTimeout(t);
  }, [open, screen, menu, focusSelf]);

  // Route gamepad through norigin's own keyboard path (synthetic arrow/enter events) so the
  // focused element's onArrowPress/onEnterPress fire first (e.g. the seek bar seeks on left/right
  // instead of just moving focus). Same path for controller and keyboard.
  // Dispatch a synthetic key event tagged so the input-mode + sound listeners can tell it came
  // from the controller (not a real keypress).
  const synthKey = (key, keyCode) => {
    const ev = new KeyboardEvent("keydown", { key, keyCode, which: keyCode, bubbles: true });
    ev.bpSynthetic = true;
    window.dispatchEvent(ev);
  };
  const onDirection = useCallback((d) => {
    setInputMode("pad");
    // While the context menu is open we drive it directly instead of moving spatial focus.
    if (menuRef.current) {
      if (d === "up") {
        playNav();
        setMenuIndex((i) => Math.max(0, i - 1));
      } else if (d === "down") {
        playNav();
        setMenuIndex((i) => Math.min(menuRef.current.actions.length - 1, i + 1));
      }
      return;
    }
    const map = {
      up: ["ArrowUp", 38],
      down: ["ArrowDown", 40],
      left: ["ArrowLeft", 37],
      right: ["ArrowRight", 39],
    };
    const [key, keyCode] = map[d];
    synthKey(key, keyCode);
  }, []);
  const onEnter = useCallback(() => {
    setInputMode("pad");
    if (menuRef.current) {
      playSelect();
      const a = menuRef.current.actions[menuIndexRef.current];
      setMenu(null);
      a && a.run();
      return;
    }
    synthKey("Enter", 13);
  }, []);
  // Navigate forward, remembering where we came from so B pops back through the trail.
  const go = useCallback((next) => {
    histRef.current.push(screenRef.current);
    setScreen(next);
  }, []);
  const onBack = useCallback(() => {
    setInputMode("pad");
    playBack();
    if (menuRef.current) {
      setMenu(null);
      return;
    } // B first dismisses the menu
    const prev = histRef.current.pop();
    if (prev != null) setScreen(prev);
    else closeBigPicture();
  }, [closeBigPicture]);
  // LB/RB → switch tabs; L3 (left stick press) → search caps toggle; Menu → context menu.
  const onButton = useCallback(
    (b) => {
      setInputMode("pad");
      if (b === "lb") cycleTab(-1);
      else if (b === "rb") cycleTab(1);
      else if (b === "l3") window.dispatchEvent(new CustomEvent("bp-shift"));
      else if (b === "menu") openMenu();
    },
    [openMenu, cycleTab]
  );
  useController({ active: open, onDirection, onEnter, onBack, onButton });

  // A playlist/album card opens its detail screen; an artist card opens the artist screen.
  const openDetail = useCallback(
    (type, item) => {
      if (type === "playlists" || type === "albums") {
        setDetailItem({ type, item });
        go("detail");
      } else if (type === "artists") {
        setArtistItem(item);
        go("artist");
      }
    },
    [go]
  );
  // From the artist screen, opening one of its albums reuses the album detail screen.
  const openAlbumFromArtist = useCallback(
    (album) => {
      setDetailItem({ type: "albums", item: album });
      go("detail");
    },
    [go]
  );

  if (!open) return null;

  // Shared top chrome (icon tabs + now-playing card) for the tab-level screens only.
  const activeTab = tabOfScreen(screen);
  const chrome = activeTab ? (
    <TabChrome
      active={activeTab}
      onSelectTab={switchTab}
      onOpenNowPlaying={() => go("nowplaying")}
    />
  ) : null;

  let content;
  if (screen === "home") content = <Home chrome={chrome} onOpenCard={openDetail} />;
  else if (screen === "search") content = <Search chrome={chrome} />;
  else if (screen === "nowplaying") content = <NowPlaying onOpenLyrics={() => go("lyrics")} />;
  else if (screen === "lyrics") content = <Lyrics />;
  else if (screen === "detail" && detailItem)
    content = (
      <Detail type={detailItem.type} item={detailItem.item} onPlayed={() => go("nowplaying")} />
    );
  else if (screen === "artist" && artistItem)
    content = (
      <Artist
        item={artistItem}
        onOpenAlbum={openAlbumFromArtist}
        onPlayed={() => go("nowplaying")}
      />
    );
  else if (screen.startsWith("browse-"))
    content = (
      <Browse
        type={screen.slice(7)}
        chrome={chrome}
        onSelect={(it) => openDetail(screen.slice(7), it)}
      />
    );

  // Context-relevant keybind hints for the bottom bar.
  let hints;
  if (menu) {
    hints = [
      { kind: "select", label: "Auswählen" },
      { kind: "back", label: "Schließen", right: true },
    ];
  } else {
    hints = [
      { kind: "nav", label: "Bewegen" },
      { kind: "select", label: "Auswählen" },
    ];
    if (activeTab) hints.push({ kind: "tabs", label: "Tabs" });
    if (!(screen === "nowplaying" || screen === "lyrics"))
      hints.push({ kind: "menu", label: "Optionen" });
    hints.push({ kind: "back", label: activeTab ? "Schließen" : "Zurück", right: true });
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={ref}
        data-bigpicture
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483000,
          overflow: "auto",
          scrollPadding: "16vh 0 10vh",
        }}
      >
        {content}
      </div>
      <Keybar hints={hints} />
      {menu && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <div
            style={{
              width: 460,
              maxWidth: "80vw",
              background: "#15101c",
              borderRadius: 18,
              padding: 10,
              boxShadow: "0 30px 80px rgba(0,0,0,.6)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {menu.title ? (
              <div
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "12px 16px 12px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {menu.title}
              </div>
            ) : null}
            {menu.actions.map((a, i) => (
              <div
                key={i}
                onClick={() => {
                  setMenu(null);
                  a.run && a.run();
                }}
                style={{
                  padding: "15px 16px",
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: "default",
                  color: i === menuIndex ? "#0a0a0f" : "#fff",
                  background: i === menuIndex ? "var(--accent)" : "transparent",
                  transition: "background .1s, color .1s",
                }}
              >
                {a.label}
              </div>
            ))}
            <div
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: 13,
                textAlign: "center",
                padding: "10px 0 6px",
              }}
            >
              A wählt · B / Esc schließt
            </div>
          </div>
        </div>
      )}
    </FocusContext.Provider>
  );
}
