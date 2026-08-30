import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn, Button, ListBox, ListBoxItem, Disclosure, DisclosureHeading, DisclosureTrigger, DisclosureContent, DisclosureBody, DisclosureIndicator, Dropdown, DropdownTrigger, DropdownPopover, DropdownItem, DropdownSection, DropdownSubmenuTrigger, DropdownSubmenuIndicator, SliderRoot, SliderTrack, SliderFill, SliderThumb, toast, ToastProvider, Spinner, ProgressBar, ProgressBarTrack, ProgressBarFill, SearchFieldRoot, SearchFieldGroup, SearchFieldSearchIcon, SearchFieldInput, SearchFieldClearButton, TextFieldRoot, InputRoot, SwitchRoot, SwitchControl, SwitchThumb, CardRoot, ScrollShadowRoot, Tab } from "@heroui/react";
import { DropdownMenu } from "./ui/zoomed-heroui.jsx";
import { ContextMenu, CtxItem, CTX_POPOVER_ANIM } from "./ui/context-menu.jsx";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
const appWindow = getCurrentWebviewWindow();
import { LANGUAGES, translate } from "./i18n.js";
import { normalizeOverlayDoc } from "./overlay/schema.js";
import { startAudioLevels } from "./audioLevels.js";
import { I18nProvider } from "@react-aria/i18n";
import { IconContext, Minus, X, Play, Pause, House, Books, Heart, CaretLineLeft, CaretLineRight, MagnifyingGlass, Gear, Microphone, VinylRecord, MusicNote, Playlist, Shuffle, SkipBack, SkipForward, Repeat, RepeatOnce, SpeakerX, SpeakerLow, SpeakerHigh, Queue, ChatText, CaretUp, CaretDown, ArrowsIn, ArrowsOut, ArrowLeft, ArrowClockwise, Check, DotsThreeVertical, PushPin, ClockCounterClockwise, CheckCircle, Plus, DownloadSimple, Trash, PencilSimple, ArrowCircleUp, Copy, Moon, Translate, UploadSimple, WifiX, Bug, Radio, ShareNodes, ScreencastSimple, ClapperboardPlay, HeadphonesSimple, UserCircle, Users, SignOut, Power, Bell, Megaphone, MiniPlayerEnter } from "./icons.jsx";

import { API, thumb, hiResThumb, LangContext, useLang, AnimationContext, useAnimations, ZoomContext, useZoom, FontScaleContext, TrackNumberContext } from "./context.jsx";
import { CreatePlaylistModal, RenamePlaylistModal, DeletePlaylistModal } from "./modals/playlist-modals.jsx";
import { NewsModal } from "./modals/news-modal.jsx";
import { BugReportModal } from "./modals/bug-report-modal.jsx";
import { ProfileSwitcherModal } from "./modals/profile-switcher-modal.jsx";
import { RemotePairModal } from "./ui/remote-control.jsx";
import { DEFAULT_LYRICS_PROVIDERS, mergeLyricsProviders } from "./lyrics/providers.js";
import { parseDurationToSeconds } from "./lyrics/parse.js";
import { useVideoSync, VideoSyncView } from "./video-sync.jsx";
import { ExplicitBadge, ArtistLinks } from "./ui/rows.jsx";
import { Tooltip } from "./ui/tooltip.jsx";
import { usePersistedState } from "./hooks/use-persisted-state.js";
import { APP_VERSION } from "./version.js";
// Side-effect import: installs the console interceptor whose ring buffer the Debug tab reads.
import "./debug/console-log.js";
import { DebugFloatingWindow } from "./settings/debug-tab.jsx";
import { SettingsSidebarContent } from "./settings/sidebar-nav.jsx";
import { lockSettingsSection, setSettingsSectionStore } from "./settings/section-store.js";
import { SettingsPanel } from "./settings/panel.jsx";
import { ZOOM_STEPS, FONT_STEPS, applyFontScale, readFontScale } from "./settings/scale.js";
import { DEFAULT_SHORTCUTS } from "./settings/shortcuts.js";
import { APP_ICON_DEFAULT } from "./settings/app-icons.js";
import { LyricsPrefsProvider, useLyricsPrefs, PlaybackPrefsProvider, usePlaybackPrefs } from "./preferences.jsx";
import { LyricsOverlay } from "./lyrics/overlay.jsx";
import { QueuePanel } from "./ui/queue-panel.jsx";
import { LibraryView } from "./views/library-view.jsx";
import { SearchView } from "./views/search-view.jsx";
import { HomeView } from "./views/home-view.jsx";
import { ArtistView } from "./views/artist-view.jsx";
import { CoverView } from "./views/cover-view.jsx";
import { VIZ_DEFAULTS } from "./visualizer/defaults.js";
import { SelActionBtn } from "./views/track-table.jsx";
import { CollectionView } from "./views/collection-view.jsx";
import { DownloadsView } from "./views/downloads-view.jsx";
import { HistoryView } from "./views/history-view.jsx";
import { AddToPlaylistModal } from "./modals/add-to-playlist-modal.jsx";
import { particleBurst, dissolve } from "./effects/particle-burst.js";
import { setNowPlaying as bpSetNowPlaying, registerPlayerCommands as bpRegisterCommands, registerAudio as bpRegisterAudio } from "./bigpicture/playerBridge.js";
import { emitNowPlaying, openMiniPlayer, EV_HELLO, EV_SHOW_MAIN } from "./miniplayer/bridge.js";





// Published news feed (edit + commit updates/news.json in the public Kodama repo).
const NEWS_URL = "https://raw.githubusercontent.com/KiyoshiTheDevil/Kodama/master/updates/news.json";

// ── Demo / screenshot mode (Ctrl+Shift+D) ────────────────────────────────────
// A hidden pose-for-screenshots mode: clean identity + no update/notification
// chrome, and it auto-plays a signature track (seeked to a nice lyric line) so
// the player + lyrics views look consistent. Not a user-facing feature.
const DEMO_TRACK_ID = "lrpAl2Eca70"; // mechanical corpse (feat. GUMI) — tommy.
const DEMO_SEEK_S   = 33;            // pose at ~0:33
const DEMO_NAME     = "Kodama";
const DEMO_PROFILE  = { name: "demo", displayName: DEMO_NAME, avatar: "" };

// Anonymous active-user heartbeat endpoint (Cloudflare Worker, see analytics/).
// Leave "" until the Worker is deployed — the heartbeat no-ops while empty.
// NOTE: when set, add this host to CSP connect-src in index.html + tauri.conf.json.
const STATS_URL = "https://kodama-stats.kiyoshidesign.workers.dev";

// Anonymous, opt-out active-user heartbeat. Fires at most once per UTC day per
// install. The raw install id never leaves the device — only a daily/monthly
// rotating SHA-256 token is sent, so the server can count unique actives without
// being able to reverse the token or link a device across days. See analytics/.
async function _sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sendHeartbeat() {
  try {
    if (!STATS_URL) return;                                        // not configured yet
    if (localStorage.getItem("kodama-anon-stats") === "false") return; // opted out
    const day = new Date().toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    if (localStorage.getItem("kodama-hb-day") === day) return;     // already pinged today
    let id = localStorage.getItem("kodama-install-id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("kodama-install-id", id); }
    const [d, m] = await Promise.all([_sha256Hex(`${id}:${day}`), _sha256Hex(`${id}:${month}`)]);
    // Three coarse buckets alongside the tokens. Each is a property of the install, not of
    // the person, and the server only ever adds them to daily totals — so this stays within
    // the same promise: how many, never who. Version answers how fast updates land, os how
    // much the macOS port is actually used, lang which translations are worth the effort.
    const ua = navigator.userAgent || "";
    const os = /Mac OS X|Macintosh/.test(ua) ? "macos" : /Linux/.test(ua) ? "linux" : "windows";
    await fetch(`${STATS_URL}/ping`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        d, m,
        v: APP_VERSION,
        os,
        l: localStorage.getItem("kiyoshi-lang") || "?",
      }),
    });
    localStorage.setItem("kodama-hb-day", day); // only mark sent on success
  } catch { /* analytics is best-effort — never disturb the app */ }
}

// Compare dotted version strings (e.g. "1.0.0" vs "0.9.40-beta"). Returns -1 / 0 / 1.
function cmpVersion(a, b) {
  const pa = String(a).split(/[.\-]/).map(x => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.\-]/).map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// macOS uses a native titled window (traffic lights + native drag), so the custom
// titlebar/drag-region is Windows-only. (Borderless windows swallow clicks on macOS.)
const IS_MAC = /Mac OS X|Macintosh/.test(navigator.userAgent || "");

// ─── Update Checker (GitHub Releases) ───────────────────────────────────────
const APP_TAG = "v1.0.0";
const GITHUB_RELEASES_API = "https://api.github.com/repos/KiyoshiTheDevil/Kodama/releases?per_page=1";

function isNewerVersion(latest, current) {
  const parse = v => v.replace(/^v/, "").split(".").map(n => parseInt(n) || 0);
  const l = parse(latest), c = parse(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

// Detect the best matching language from the browser/OS locale.
// Falls back to "en" for anything that isn't explicitly supported.
function detectSystemLang() {
  const supported = ["de", "en"]; // extend when more locales are added
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const loc of candidates) {
    const base = loc.split("-")[0].toLowerCase();
    if (supported.includes(base)) return base;
  }
  return "en";
}
// If no language has been saved yet, use the system locale.
function getInitialLang() {
  return localStorage.getItem("kiyoshi-lang") || detectSystemLang();
}

// API, thumb, and the language / animation / zoom / font-scale contexts now live in
// ./context.jsx (imported at the top) so extracted components can share them.

// ── Shortcut helpers ────────────────────────────────────────────────────────
/** Serialize a keydown event to a storable shortcut string, e.g. "Ctrl+Equal" or "Space" */
function serializeShortcut(e) {
  const mods = [];
  if (e.ctrlKey)  mods.push("Ctrl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey)   mods.push("Alt");
  return mods.length > 0 ? [...mods, e.code].join("+") : e.code;
}

/** Match a stored shortcut string against a keydown event.
 *  Single-key shortcuts (no "+") match by code only (backwards-compatible).
 *  Compound shortcuts ("Ctrl+Equal") match code + specified modifiers. */
function matchShortcut(stored, e) {
  if (!stored) return false;
  if (!stored.includes("+")) return e.code === stored;
  const parts = stored.split("+");
  const code  = parts[parts.length - 1];
  const mods  = new Set(parts.slice(0, -1));
  // Only check the modifiers that are explicitly listed; shiftKey not checked strictly
  // so that Ctrl+= (no shift) and Ctrl++ (shift) both match "Ctrl+Equal" on any layout.
  return e.code === code && e.ctrlKey === mods.has("Ctrl") && e.altKey === mods.has("Alt");
}



const CODE_DISPLAY_FALLBACK = {
  Space:"Space", ArrowRight:"→", ArrowLeft:"←", ArrowUp:"↑", ArrowDown:"↓",
  Escape:"Esc",
  KeyA:"A",KeyB:"B",KeyC:"C",KeyD:"D",KeyE:"E",KeyF:"F",KeyG:"G",KeyH:"H",
  KeyI:"I",KeyJ:"J",KeyK:"K",KeyL:"L",KeyM:"M",KeyN:"N",KeyO:"O",KeyP:"P",
  KeyQ:"Q",KeyR:"R",KeyS:"S",KeyT:"T",KeyU:"U",KeyV:"V",KeyW:"W",KeyX:"X",
  KeyY:"Y",KeyZ:"Z",
  Digit0:"0",Digit1:"1",Digit2:"2",Digit3:"3",Digit4:"4",
  Digit5:"5",Digit6:"6",Digit7:"7",Digit8:"8",Digit9:"9",
  Equal:"=",Minus:"-",BracketLeft:"[",BracketRight:"]",
  Semicolon:";",Quote:"'",Backquote:"`",Backslash:"\\",
  Comma:",",Period:".",Slash:"/",
  NumpadAdd:"Num+",NumpadSubtract:"Num-",NumpadMultiply:"Num*",
  NumpadDivide:"Num/",NumpadDecimal:"Num.",
  Numpad0:"Num0",Numpad1:"Num1",Numpad2:"Num2",Numpad3:"Num3",Numpad4:"Num4",
  Numpad5:"Num5",Numpad6:"Num6",Numpad7:"Num7",Numpad8:"Num8",Numpad9:"Num9",
  F1:"F1",F2:"F2",F3:"F3",F4:"F4",F5:"F5",F6:"F6",
  F7:"F7",F8:"F8",F9:"F9",F10:"F10",F11:"F11",F12:"F12",
  Backspace:"⌫",Tab:"Tab",Enter:"↵",
};

// Global keyframes injected once
const GLOBAL_KEYFRAMES = `
  @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
  @keyframes skipLeft {
    0%   { transform: translateX(0); }
    30%  { transform: translateX(-6px); }
    65%  { transform: translateX(3px); }
    100% { transform: translateX(0); }
  }
  @keyframes skipRight {
    0%   { transform: translateX(0); }
    30%  { transform: translateX(6px); }
    65%  { transform: translateX(-3px); }
    100% { transform: translateX(0); }
  }
  @keyframes heartPop {
    0%   { transform: scale(1); }
    25%  { transform: scale(1.5); }
    55%  { transform: scale(0.88); }
    80%  { transform: scale(1.15); }
    100% { transform: scale(1); }
  }
  @keyframes flashbangFade { 0%,50%{opacity:1} 100%{opacity:0} }
  @keyframes tetoSlideIn {
    from { transform: translateX(110%); }
    to   { transform: translateX(0); }
  }
  @keyframes tetoSlideOut {
    from { transform: translateX(0); }
    to   { transform: translateX(110%); }
  }
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateX(-18px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeSlideOut {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(-18px); }
  }
  @keyframes unfoldDown {
    from { opacity: 0; transform: scaleY(0.4); }
    to   { opacity: 1; transform: scaleY(1); }
  }
  @keyframes toastOut {
    from { opacity: 1; transform: translateX(0) scale(1); }
    to   { opacity: 0; transform: translateX(16px) scale(0.96); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes pinShake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-10px); }
    40%     { transform: translateX(10px); }
    60%     { transform: translateX(-8px); }
    80%     { transform: translateX(8px); }
  }
  @keyframes coverPop {
    0%   { transform: scale(0.96); }
    60%  { transform: scale(1.03); }
    100% { transform: scale(1); }
  }
  @keyframes eqBar1 { 0%,100%{height:4px} 50%{height:14px} }
  @keyframes eqBar2 { 0%,100%{height:10px} 35%{height:3px} 70%{height:14px} }
  @keyframes eqBar3 { 0%,100%{height:7px} 45%{height:14px} 80%{height:3px} }
  @keyframes navPop {
    0%   { transform: scale(1); }
    40%  { transform: scale(0.88); }
    100% { transform: scale(1); }
  }
  @keyframes splashLogoIn {
    from { opacity: 0; transform: scale(0.65); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes splashTextIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes splashFadeOut {
    from { opacity: 1; transform: scale(1); }
    to   { opacity: 0; transform: scale(1.04); }
  }
  @keyframes splashGlow {
    0%,100% { transform: scale(1);   opacity: 0.6; }
    50%     { transform: scale(1.25); opacity: 1; }
  }
  .icon-btn {
    background: transparent;
    border: none;
    cursor: default;
    padding: 0;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }
  .icon-btn:hover {
    background: var(--bg-hover);
  }
  .dbg-btn:hover {
    background: var(--bg-elevated) !important;
    color: var(--text-primary) !important;
  }
  @keyframes noteFloat {
    0%, 100% { transform: translateY(0px) scale(1); }
    50%       { transform: translateY(-14px) scale(1.08); }
  }
  .grid-card:hover .grid-card-footer {
    background: rgb(32,32,36) !important;
  }
  .view-tab-btn:not(.active):hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent) !important;
    color: var(--text-primary) !important;
  }
`;

const winCtrl = {
  minimize: () => appWindow.minimize(),
  maximize: () => appWindow.toggleMaximize(),
  close: () => appWindow.close(),
  startDrag: () => appWindow.startDragging(),
};

// Inject tooltip keyframes once
if (typeof document !== "undefined" && !document.getElementById("kiyoshi-tooltip-kf")) {
  const s = document.createElement("style");
  s.id = "kiyoshi-tooltip-kf";
  s.textContent = `
    @keyframes tooltipIn{from{opacity:0;transform:translate(-50%,calc(-100% + 4px))}to{opacity:1;transform:translate(-50%,-100%)}}
    @keyframes tooltipOut{from{opacity:1;transform:translate(-50%,-100%)}to{opacity:0;transform:translate(-50%,calc(-100% + 4px))}}
  `;
  document.head.appendChild(s);
}

// ── IpcAudio ─────────────────────────────────────────────────────────────────
// Drop-in replacement for `new Audio()` that routes playback through the Rust
// host process (kiyoshi-music.exe) instead of WebView2 / msedgewebview2.exe.
// This makes the audio session visible to OBS Application Audio Capture as
// "Kodama".  The API surface mirrors the parts of HTMLAudioElement that
// the Player component uses, so no other code changes are required.
class IpcAudio {
  constructor() {
    this._src = "";
    this._srcDirty = false;   // true when src was set but play() not called yet
    this._pendingSeekTo = 0;  // seek target to use on the next play() call
    this._currentTime = 0;
    this._duration = 0;
    this._buffered = null;    // 0..1 for network streams, null when there is nothing to show
    this._preparing = false;  // play() issued for a new source, nothing decoding yet
    this._paused = true;
    this._volume = 0.16;      // same default as Rust thread (0.4² quadratic)
    this._listeners = {};
    this._invoke = null;      // resolved lazily on first use

    // Fallback: if Rust commands don't exist (binary not recompiled),
    // _fallback is set to a plain HTMLAudioElement and all calls route there.
    this._fallback = null;       // null = not decided, false = Rust works, Audio = fallback
    this._probePromise = null;   // dedup the one-time probe

    // Resolve Tauri invoke/listen modules asynchronously on construction.
    import("@tauri-apps/api/core").then(({ invoke }) => {
      this._invoke = invoke;
      // Probe immediately: try a harmless command to see if Rust audio exists.
      this._probe(invoke);
    });
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("audio-progress", ({ payload }) => {
        if (this._fallback) return; // ignore Rust events when in fallback mode
        this._currentTime = payload.position;
        if (payload.duration > 0) this._duration = payload.duration;
        if (payload.paused !== this._paused) this._paused = payload.paused;
        // null for anything not streamed over the network (local files are already complete),
        // which is the signal for the seek bar to leave the buffer indicator off.
        this._buffered = typeof payload.buffered === "number" ? payload.buffered : null;
        this._fire("timeupdate");
      });
      listen("audio-ended", () => {
        if (this._fallback) return;
        this._paused = true;
        this._fire("ended");
      });
      listen("audio-loaded", ({ payload }) => {
        if (this._fallback) return;
        if (payload.duration > 0) this._duration = payload.duration;
        this._preparing = false;
        this._fire("loadedmetadata");
        this._fire("canplay");
      });
      listen("audio-error", ({ payload }) => {
        if (this._fallback) return;
        console.error("[IpcAudio] Rust decode error:", payload);
        this._preparing = false;
        this._fire("error");
      });
    });
  }

  // ── Fallback probe ──────────────────────────────────────────────────────────
  // Calls audio_set_volume (side-effect-free) to check if the Rust command
  // exists.  If it fails with "unknown command", switch to HTML5 Audio.
  _probe(invoke) {
    if (this._probePromise) return this._probePromise;
    // Use audio_pause as a harmless no-op probe — it does nothing when no song
    // is playing, and importantly does NOT touch volume state.
    this._probePromise = invoke("audio_pause")
      .then(() => {
        this._fallback = false;
        console.log("[IpcAudio] Rust audio commands available ✓");
        // Now sync the stored volume to Rust so it's ready for first play
        invoke("audio_set_volume", { volume: this._volume });
      })
      .catch(() => {
        console.warn("[IpcAudio] Rust audio commands not found — falling back to HTML5 Audio");
        this._fallback = this._createFallbackAudio();
        if (this._src) this._fallback.src = this._src;
        this._fallback.volume = this._volume;
      });
    return this._probePromise;
  }

  _createFallbackAudio() {
    const a = new Audio();
    // Wire native events → our listener system
    for (const evt of ["timeupdate", "ended", "loadedmetadata", "canplay", "error", "volumechange"]) {
      a.addEventListener(evt, () => this._fire(evt));
    }
    return a;
  }

  // ── Private helpers ────────────────────────────────────────────────────────
  _cmd(name, args) {
    if (this._fallback) return Promise.resolve(); // Rust path disabled
    console.log("[IpcAudio] →", name, args?.url ? args.url.substring(0, 80) + "…" : "");
    const go = (invoke) => invoke(name, args || {}).catch(e => console.error("[IpcAudio] ERROR", name, e));
    if (this._invoke) { go(this._invoke); }
    else { import("@tauri-apps/api/core").then(({ invoke }) => { this._invoke = invoke; go(invoke); }); }
    return Promise.resolve();
  }

  _fire(type) {
    (this._listeners[type] || []).forEach(h => { try { h({ type }); } catch (e) { console.error(e); } });
  }

  // ── HTMLAudioElement-compatible API ────────────────────────────────────────
  // _fb() returns the fallback Audio if active, or false/null.
  // null = probe still running (undecided), false = Rust is active, Audio = fallback
  get _fb() { return this._fallback; }

  get src() { return this._fb ? this._fb.src : this._src; }
  set src(url) {
    // Always store locally so we can replay onto fallback if probe hasn't finished
    this._src = url;
    this._srcDirty = true;
    this._pendingSeekTo = 0;
    // Reset position for the new track. The Rust path only updates _currentTime from incoming
    // audio-progress events, so without this it keeps the PREVIOUS track's position until the
    // first event of the new one arrives — during which the prev-button's "restart if >4s in"
    // check reads a stale-high value and restarts instead of going to the previous track. The
    // HTML5 fallback zeroes this natively on src change; mirror that for the Rust path.
    this._currentTime = 0;
    this._duration = 0;
    if (this._fb) { this._fb.src = url; }
    else if (this._fb === null && this._probePromise) {
      // Probe still running — queue replay
      this._probePromise.then(() => { if (this._fb) this._fb.src = url; });
    }
  }

  // Fraction of the track that has arrived, or null when there is nothing meaningful to show
  // (classic playback, local files, and the HTML5 fallback, which manages its own buffering).
  get bufferedFraction() { return this._fb ? null : this._buffered; }

  // True while a newly-started track is being resolved and probed, before any audio exists.
  get isPreparing() { return this._fb ? false : this._preparing; }

  get currentTime() { return this._fb ? this._fb.currentTime : this._currentTime; }
  set currentTime(t) {
    if (this._fb) { this._fb.currentTime = t; return; }
    this._currentTime = t;
    if (this._srcDirty) {
      this._pendingSeekTo = t;
    } else {
      this._cmd("audio_seek", { position: t });
    }
  }

  get duration() { return this._fb ? this._fb.duration : this._duration; }
  get paused()   { return this._fb ? this._fb.paused   : this._paused; }

  get volume() { return this._fb ? this._fb.volume : this._volume; }
  set volume(v) {
    this._volume = v; // always store for probe replay
    if (this._fb) { this._fb.volume = v; this._fire("volumechange"); return; }
    this._cmd("audio_set_volume", { volume: v });
    this._fire("volumechange");
  }

  play() {
    // If probe hasn't resolved yet, wait for it then play
    if (this._fallback === null && this._probePromise) {
      return this._probePromise.then(() => this.play());
    }
    if (this._fb) return this._fb.play();
    if (this._srcDirty && this._src) {
      this._srcDirty = false;
      const seekTo = this._pendingSeekTo;
      this._pendingSeekTo = 0;
      this._paused = false;
      // The gap between here and the first audio-loaded is the URL resolution (~2-4s of
      // yt-dlp extraction, no bytes moving) plus the probe. Nothing else in the UI marks it.
      this._preparing = true;
      this._fire("preparing");
      console.log("[IpcAudio] play() → audio_play (new src)");
      this._cmd("audio_play", { url: this._src, seekTo });
    } else {
      this._paused = false;
      console.log("[IpcAudio] play() → audio_resume");
      this._cmd("audio_resume");
    }
    return Promise.resolve();
  }

  pause() {
    if (this._fb) { this._fb.pause(); return; }
    this._paused = true;
    this._cmd("audio_pause");
  }

  addEventListener(type, handler) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(h => h !== handler);
  }
}

function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState(null);

  useEffect(() => {
    let cancel = false;
    const check = () => appWindow.isMaximized().then(v => { if (!cancel) setMaximized(v); });
    check();
    const unlisten = appWindow.onResized(() => check());
    return () => { cancel = true; unlisten.then(fn => fn()); };
  }, []);

  const btnBase = {
    background: "none", border: "none", cursor: "default",
    width: 36, height: 28, borderRadius: "var(--r-md)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "background 0.12s",
    color: "rgba(255,255,255,0.75)",
  };

  const buttons = [
    {
      id: "min",
      action: () => appWindow.minimize(),
      hover: "rgba(255,255,255,0.10)",
      icon: (
        <Minus size={10} />
      ),
    },
    {
      id: "max",
      action: () => appWindow.toggleMaximize(),
      hover: "rgba(255,255,255,0.10)",
      icon: maximized ? (
        // Restore icon — two overlapping squares
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="2" y="0" width="8" height="8" rx="0.5"/>
          <path d="M0 2v7a1 1 0 0 0 1 1h7" />
        </svg>
      ) : (
        // Maximize icon — single square
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="0.5" y="0.5" width="9" height="9" rx="0.5"/>
        </svg>
      ),
    },
    {
      id: "close",
      action: () => appWindow.close(),
      hover: "#c42b1c",
      icon: (
        <X size={10} />
      ),
    },
  ];

  return (
    <div style={{
      height: 32, display: "flex", alignItems: "center",
      justifyContent: "flex-end", padding: "0 8px",
      position: "fixed", top: 4, left: 0, right: 0, zIndex: 9998,
      pointerEvents: "none",
    }}>
      <div data-tauri-drag-region style={{
        position: "absolute", top: 0, left: 80, right: 80, bottom: 0,
        pointerEvents: "all",
      }} />
      <div style={{ display: "flex", gap: 2, position: "relative", pointerEvents: "all" }}>
        {buttons.map(btn => (
          <button
            key={btn.id}
            onClick={e => { e.stopPropagation(); btn.action(); }}
            onMouseEnter={() => setHoveredBtn(btn.id)}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              ...btnBase,
              background: hoveredBtn === btn.id ? btn.hover : "none",
              color: hoveredBtn === btn.id && btn.id === "close" ? "#fff" : "rgba(255,255,255,0.75)",
            }}
          >{btn.icon}</button>
        ))}
      </div>
    </div>
  );
}

/** Returns {left, top} clamped so the menu (w×h px) stays within the viewport. */
function clampMenu(x, y, w = 220, h = 320) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: x + w > vw ? Math.max(4, x - w) : x,
    top:  y + h > vh ? Math.max(4, y - h) : y,
  };
}

const SIDEBAR_EXPANDED = 288;   // default expanded width
// 56 left ~8px of slack after the 36px pinned-item icon and the outer padding — exactly enough
// to be eaten whole by the (already-slimmed, 8px) scrollbar the moment one appears, clipping the
// icon against the sidebar's own overflow:hidden. 64 leaves real breathing room.
const SIDEBAR_COLLAPSED = 64;
// Drag handles work in raw pointer coordinates, which do not know about layout direction.
// Read it off the document rather than the RTL preference, so the answer stays right no matter
// who set the direction (the experimental toggle today, a locale-driven default later).
const isRtl = () => document.documentElement.getAttribute("dir") === "rtl";

const SIDEBAR_MIN = 230;        // min when dragging
const SIDEBAR_MAX = 440;        // max when dragging
const SPLIT_MIN = 0.22;         // min/max cover-pane fraction in the fullscreen split view
const SPLIT_MAX = 0.78;
const QUEUE_DEFAULT = 360;      // default queue panel width
const QUEUE_MIN = 320;          // min when dragging
const QUEUE_MAX = 620;          // max when dragging

function Sidebar({ view, activeNavId, setView, onSearch, collapsed, onToggleCollapse, onOpenSettings, onOpenAccountTab, onOpenUpdateTab, onOpenOverlaySettings, onCloseOverlay, onOpenPlaylist, onOpenAlbum, onOpenArtist, onAddRecent, onContextMenu, currentProfileData, onOpenProfileSwitcher, profiles, onSwitchProfile, onAddProfile, onDeleteProfile, onReauthProfile, onLogout, onCreatePlaylist, updateInfo, offlineMode, isActuallyOffline, onToggleOffline, onRefreshView, obsEnabled, onOpenNews, onOpenFeedback, newsUnread = 0, settingsOpen, hideUserHandle }) {
  const [query, setQuery] = useState("");
  // Search autocomplete: debounced suggestion fetch + a dropdown under the field.
  const [suggestions, setSuggestions] = useState([]);
  const [sugOpen, setSugOpen] = useState(false);
  const sugBlurRef = useRef(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const id = setTimeout(() => {
      fetch(`${API}/search/suggestions?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : []))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(id);
  }, [query]);
  const [tooltip, setTooltip] = useState(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [tetoVisible, setTetoVisible] = useState(false);
  const [tetoLeaving, setTetoLeaving] = useState(false);
  const tetoTimerRef = useRef(null);
  const profileTriggerRef = useRef(null);
  const [quitHolding, setQuitHolding] = useState(false);
  const quitHoldTimer = useRef(null);
  const t = useLang();

  // Quit App requires a 1-second press-and-hold to prevent accidental clicks.
  const startQuitHold = () => {
    setQuitHolding(true);
    quitHoldTimer.current = setTimeout(() => {
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("quit_app"));
    }, 1000);
  };
  const cancelQuitHold = () => {
    setQuitHolding(false);
    if (quitHoldTimer.current) { clearTimeout(quitHoldTimer.current); quitHoldTimer.current = null; }
  };
  const [pinnedPlaylists, setPinnedPlaylists] = useState([]);
  const [recentPlaylists, setRecentPlaylists] = useState([]);
  const anim = useAnimations();

  // Collapsed-sidebar-only: Pinned/Recently Opened start folded shut (just the section icon,
  // like Discord's server-folder icons) and expand in place on click — persisted per section so
  // it stays how you left it. The expanded sidebar keeps its own always-open behaviour untouched.
  const [collapsedGroupOpen, setCollapsedGroupOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kiyoshi-sidebar-collapsed-groups") || "{}"); } catch { return {}; }
  });
  const setCollapsedGroupExpanded = (titleKey, isExpanded) => {
    setCollapsedGroupOpen(prev => {
      const next = { ...prev, [titleKey]: isExpanded };
      localStorage.setItem("kiyoshi-sidebar-collapsed-groups", JSON.stringify(next));
      return next;
    });
  };

  const reloadFromStorage = useCallback((prof) => {
    const p = prof || window.__activeProfile || "default";
    try { setPinnedPlaylists(JSON.parse(localStorage.getItem(`kiyoshi-pinned-${p}`) || "[]")); } catch { setPinnedPlaylists([]); }
    try { setRecentPlaylists(JSON.parse(localStorage.getItem(`kiyoshi-recent-${p}`) || "[]")); } catch { setRecentPlaylists([]); }
  }, []);

  // Load once profile is known
  useEffect(() => {
    if (currentProfileData?.name) reloadFromStorage(currentProfileData.name);
  }, [currentProfileData?.name, reloadFromStorage]);

  // Re-sync when pins/recents change from outside (e.g. Library context menu, profile switch)
  useEffect(() => {
    const sync = () => reloadFromStorage();
    window.addEventListener("kiyoshi-pins-updated", sync);
    window.addEventListener("kiyoshi-recent-updated", sync);
    window.addEventListener("profile-switched", sync);
    return () => {
      window.removeEventListener("kiyoshi-pins-updated", sync);
      window.removeEventListener("kiyoshi-recent-updated", sync);
      window.removeEventListener("profile-switched", sync);
    };
  }, [reloadFromStorage]);

  const sidebarItemId = (pl) => pl.playlistId || pl.browseId;
  const isPinned = (pl) => pinnedPlaylists.some(p => sidebarItemId(p) === sidebarItemId(pl));
  const openItem = (pl) => { if (pl.type === "album") onOpenAlbum?.(pl); else if (pl.type === "artist") onOpenArtist?.(pl); else onOpenPlaylist(pl); };

  useEffect(() => {
    if (tetoVisible && !query.toLowerCase().includes("teto")) hideTeto();
  }, [query]);

  const hideTeto = () => {
    setTetoLeaving(true);
    clearTimeout(tetoTimerRef.current);
    tetoTimerRef.current = setTimeout(() => { setTetoVisible(false); setTetoLeaving(false); }, 450);
  };

  const handleSubmit = (value) => {
    const q = value.trim();
    if (!q) return;
    setSugOpen(false);
    // Paste a YouTube / YT Music playlist link (or a bare playlist id) -> open it
    // directly. Works for unlisted "link only" playlists, which never show in search.
    let plId = null;
    const urlM = q.match(/[?&]list=([A-Za-z0-9_-]+)/);
    if (urlM && /(?:music\.)?youtube\.com|youtu\.be/i.test(q)) plId = urlM[1];
    else if (/^(VL)?(PL|OLAK5uy_|RDCLAK|RDAMPL)[A-Za-z0-9_-]{10,}$/.test(q)) plId = q;
    if (plId) {
      onCloseOverlay?.();
      onOpenPlaylist?.({ playlistId: plId.replace(/^VL/, "") });
      setQuery("");
      return;
    }
    onSearch(q);
    setView("search");
    onCloseOverlay?.();
    if (q.toLowerCase().includes("teto")) {
      clearTimeout(tetoTimerRef.current);
      setTetoLeaving(false);
      setTetoVisible(true);
    } else if (tetoVisible) {
      hideTeto();
    }
  };

  const pickSuggestion = (s) => { setQuery(s); handleSubmit(s); };
  // Dropdown of live suggestions, positioned under the (relatively-positioned) field wrapper.
  const suggestionsBox = (sugOpen && query.trim().length >= 2 && suggestions.length > 0) ? (
    <div
      onMouseDown={e => e.preventDefault()} /* keep field focus so onClick fires before blur */
      style={{
        position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, marginTop: 4,
        background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)",
        boxShadow: "var(--elevation-3)", overflow: "hidden", padding: 4,
      }}
    >
      {suggestions.map((s, i) => (
        <div key={i} onClick={() => pickSuggestion(s)}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: "var(--r-md)",
            cursor: "default", fontSize: "var(--t13)", color: "var(--text-secondary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <MagnifyingGlass size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s}</span>
        </div>
      ))}
    </div>
  ) : null;
  const sugFocus = () => { clearTimeout(sugBlurRef.current); setSugOpen(true); };
  const sugBlur = () => { sugBlurRef.current = setTimeout(() => setSugOpen(false), 150); };

  const mainNavItems = [
    { id: "home",    label: t("home"),    iconEl: <House size={16} /> },
    { id: "library", label: t("library"), iconEl: <Books size={16} /> },
  ];

  const secondaryNavItems = [
    { id: "liked",     label: t("likedSongs"), iconEl: <Heart size={16} /> },
    { id: "history",   label: t("history"),    iconEl: <ClockCounterClockwise size={16} /> },
    { id: "downloads", label: t("downloads"),  iconEl: <DownloadSimple size={16} /> },
  ];

  // HeroUI ListBox-based navigation. Selected state is unstyled by HeroUI, so we
  // map it to our accent via data-[selected=true]. onAction handles navigation;
  // selectedKeys (controlled from `view`) drives the active highlight.
  const navList = (items) => (
    <ListBox
      aria-label="Navigation"
      selectionMode="none"
      onAction={(key) => {
        // Liked Songs is YT Music's own "LM" auto-playlist, so it goes through the normal
        // collection path rather than a view of its own. That way it inherits streaming,
        // caching, refresh and download-all instead of reimplementing a subset of them.
        // forcedTitle keeps our translated label — the backend hardcodes a German one for
        // local profiles.
        if (key === "liked") {
          onOpenPlaylist?.({ playlistId: "LM", title: t("likedSongs"), forcedTitle: t("likedSongs"), thumbnail: "" });
        } else {
          setView(key);
        }
        onCloseOverlay?.();
      }}
      className="w-full"
    >
      {items.map(item => (
        <ListBoxItem
          key={item.id}
          id={item.id}
          textValue={item.label}
          className={cn(
            "text-t13 min-h-10 rounded-xl",
            // activeNavId, not view: Liked Songs opens as a collection, so the entry has to
            // stay lit even though `view` says "collection".
            (activeNavId || view) === item.id && "bg-accent-dim text-accent",
            collapsed && "justify-center"
          )}
          onMouseEnter={e => {
            if (collapsed) {
              const r = e.currentTarget.getBoundingClientRect();
              setTooltip({ text: item.label, x: r.right + 10, y: r.top + r.height / 2 });
            }
          }}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className="shrink-0 w-[18px] flex items-center justify-center">{item.iconEl}</span>
          {!collapsed && item.label}
        </ListBoxItem>
      ))}
    </ListBox>
  );

  // Pinned/recent playlists as a HeroUI ListBox. Shows the actual album/playlist/
  // artist cover (round for artists, square otherwise) with an icon fallback.
  const playlistList = (items) => (
    <ListBox
      aria-label="Playlists"
      selectionMode="none"
      onAction={(key) => {
        const pl = items.find(p => sidebarItemId(p) === key);
        if (pl) { openItem(pl); onCloseOverlay?.(); }
      }}
      className="w-full"
    >
      {items.map(pl => (
        <ListBoxItem
          key={sidebarItemId(pl)}
          id={sidebarItemId(pl)}
          textValue={pl.title}
          className={cn("text-t12 rounded-xl", collapsed ? "justify-center px-0 min-h-12" : "min-h-14")}
          onContextMenu={e => onContextMenu?.(e, pl)}
          onMouseEnter={e => {
            if (collapsed) {
              const r = e.currentTarget.getBoundingClientRect();
              setTooltip({ text: pl.title, x: r.right + 10, y: r.top + r.height / 2 });
            }
          }}
          onMouseLeave={() => collapsed && setTooltip(null)}
        >
          <div className={cn(
            "shrink-0 overflow-hidden bg-elevated flex items-center justify-center",
            collapsed ? "w-9 h-9" : "w-10 h-10",
            pl.type === "artist" ? "rounded-full" : "rounded-md"
          )}>
            {pl.thumbnail
              ? <img src={thumb(pl.thumbnail)} alt="" className="w-full h-full object-cover" />
              : pl.type === "album"
              ? <VinylRecord size={18} className="text-muted" />
              : pl.type === "artist"
              ? <Microphone size={18} className="text-muted" />
              : <Playlist size={18} className="text-muted" />
            }
          </div>
          {!collapsed && <span className="truncate">{pl.title}</span>}
        </ListBoxItem>
      ))}
    </ListBox>
  );

  // A collapsible playlist section (Pinned / Recently Opened). In the expanded
  // sidebar it uses HeroUI's Disclosure (animated expand/collapse + rotating
  // chevron). In the collapsed sidebar there are no headers — just the covers.
  const playlistSection = (titleKey, items, Icon, iconWeight) => (
    // A subtle full-width translucent card behind the whole group (trigger + revealed items),
    // in both collapsed and expanded sidebar, so Pinned/Recently Opened read as two visually
    // distinct blocks instead of blurring into the surrounding list.
    <div className="bg-white/5 hover:bg-white/10 rounded-xl w-full mb-1.5 overflow-hidden transition-colors duration-150">
    <Disclosure
      isExpanded={collapsedGroupOpen[titleKey] ?? false}
      onExpandedChange={(v) => setCollapsedGroupExpanded(titleKey, v)}
    >
      <DisclosureHeading>
        <DisclosureTrigger
          className={cn(
            "flex items-center text-t10 font-semibold text-muted uppercase tracking-wider hover:text-secondary transition-colors duration-150",
            collapsed ? "w-full justify-center py-2" : "w-full gap-1.5 px-3 pt-1.5 pb-1"
          )}
          onMouseEnter={collapsed ? (e => {
            const r = e.currentTarget.getBoundingClientRect();
            setTooltip({ text: t(titleKey), x: r.right + 10, y: r.top + r.height / 2 });
          }) : undefined}
          onMouseLeave={collapsed ? (() => setTooltip(null)) : undefined}
        >
          <span className={cn("shrink-0 flex items-center justify-center", !collapsed && "w-3.5")}>
            <Icon size={collapsed ? 15 : 11} weight={iconWeight} />
          </span>
          {!collapsed && t(titleKey)}
          {!collapsed && <DisclosureIndicator />}
        </DisclosureTrigger>
      </DisclosureHeading>
      <DisclosureContent>
        <DisclosureBody className="!p-0">
          {playlistList(items)}
        </DisclosureBody>
      </DisclosureContent>
    </Disclosure>
    </div>
  );

  const handleAccountAction = (key) => {
    if (key === "profile") (onOpenAccountTab || onOpenSettings)?.();
    else if (key === "switch") onOpenProfileSwitcher?.();
    else if (key === "logout") onLogout?.();
    else if (key === "overlay") onOpenOverlaySettings?.();
    else if (key === "news") onOpenNews?.();
    else if (key === "feedback") onOpenFeedback?.();
    else if (key === "settings") onOpenSettings?.();
    // "quit" is handled by press-and-hold (startQuitHold), not onAction.
  };

  // Shared account-menu popover — used by both the expanded profile button and the
  // collapsed avatar trigger. min-w-56 keeps it readable when the trigger is tiny.
  const accountMenu = (
    <DropdownPopover placement="top start"
      className="data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-bottom-3 data-[entering]:duration-300 data-[entering]:ease-out data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:slide-out-to-bottom-3 data-[exiting]:duration-200 data-[exiting]:ease-in"
    >
      <DropdownMenu onAction={handleAccountAction} aria-label={t("account")} className="w-[var(--trigger-width)] min-w-56">
        <DropdownSection>
          <DropdownItem id="profile" textValue={t("account")}>
            <span className="w-4 flex justify-center shrink-0"><UserCircle size={16} /></span>
            {t("account")}
          </DropdownItem>
          {(profiles?.length > 1) ? (
            <DropdownItem id="switch" textValue={t("switchAccount")}>
              <span className="w-4 flex justify-center shrink-0"><Users size={16} /></span>
              {t("switchAccount")}
            </DropdownItem>
          ) : null}
          <DropdownItem id="logout" textValue={t("logOut")}>
            <span className="w-4 flex justify-center shrink-0"><SignOut size={16} /></span>
            {t("logOut")}
          </DropdownItem>
        </DropdownSection>
        <DropdownSection className="w-full border-t border-border mt-1 pt-1">
          {obsEnabled ? (
            <DropdownItem id="overlay" textValue={t("overlay")}>
              <span className="w-4 flex justify-center shrink-0"><ScreencastSimple size={16} /></span>
              {t("overlay")}
            </DropdownItem>
          ) : null}
          <DropdownItem id="news" textValue={t("news") || "Neuigkeiten"}>
            <span className="w-4 flex justify-center shrink-0"><Megaphone size={16} /></span>
            <span className="flex items-center gap-2">{t("news") || "Neuigkeiten"}
              {newsUnread > 0 && <span className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "#fff" }}>{newsUnread}</span>}
            </span>
          </DropdownItem>
          <DropdownItem id="feedback" textValue={t("reportBug") || "Fehler melden"}>
            <span className="w-4 flex justify-center shrink-0"><Bug size={16} /></span>
            {t("reportBug") || "Fehler melden"}
          </DropdownItem>
          <DropdownItem id="settings" textValue={t("settings")}>
            <span className="w-4 flex justify-center shrink-0"><Gear size={16} /></span>
            {t("settings")}
          </DropdownItem>
          <DropdownItem id="quit" textValue={t("quitApp")}
            className="relative overflow-hidden"
            onPointerDown={startQuitHold}
            onPointerUp={cancelQuitHold}
            onPointerLeave={cancelQuitHold}
            onPointerCancel={cancelQuitHold}
          >
            <span className="absolute inset-0 origin-left pointer-events-none"
              style={{ background: "var(--status-danger-line)", transform: quitHolding ? "scaleX(1)" : "scaleX(0)", transition: quitHolding ? "transform 1s linear" : "transform 0.15s ease" }} />
            <span className="w-4 flex justify-center shrink-0 relative z-[1]"><Power size={16} /></span>
            <span className="relative z-[1]">{t("quitApp")}</span>
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </DropdownPopover>
  );

  return (
    <div className="w-full h-full bg-transparent flex flex-col pt-4 shrink-0 rounded-xl overflow-hidden"
      style={{ visibility: settingsOpen ? "hidden" : "visible" }}>

      {/* Tooltip portal */}
      {tooltip && (
        <div className="fixed -translate-y-1/2 bg-elevated text-primary px-2.5 py-1 rounded text-t12 whitespace-nowrap border border-border pointer-events-none z-[9999] shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}

      {/* Header. macOS (variant D): the search field sits at the very top, flanked by the
          native traffic lights (left padding clears them); refresh + collapse move to the
          right. Windows/Linux keep the logo + title header with the search row below.
          On macOS the bar is a drag region (the empty traffic-light pad is the grab area;
          the search field + buttons stay interactive as children). */}
      <div
        {...(IS_MAC ? { "data-tauri-drag-region": true } : {})}
        className={cn(
          "flex items-center gap-2",
          (IS_MAC && !collapsed) ? "pb-3" : "pb-4",
          collapsed ? "justify-center px-3" : "justify-start",
          !collapsed && (IS_MAC ? "pl-[72px] pr-2.5" : "px-3"),
          collapsed && IS_MAC && "pt-8",
        )}
      >
        {/* Collapse toggle: leading on Windows/Linux and when collapsed; on macOS-expanded
            it moves to the trailing side (after the search). */}
        {(!IS_MAC || collapsed) && (
          <Button
            variant="ghost" size="sm" isIconOnly
            onPress={onToggleCollapse}
            className="shrink-0 relative z-[201] rounded-full"
            style={{ visibility: settingsOpen ? "hidden" : "visible", contain: "layout style" }}
            onMouseEnter={e => {
              if (collapsed) {
                const r = e.currentTarget.getBoundingClientRect();
                setTooltip({ text: t("expand"), x: r.right + 10, y: r.top + r.height / 2 });
              }
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {collapsed ? <CaretLineRight size={16} /> : <CaretLineLeft size={16} />}
          </Button>
        )}

        {!collapsed && (IS_MAC ? (
          <>
            <div className="flex-1 min-w-0" style={{ contain: "layout style", position: "relative", zIndex: sugOpen ? 70 : "auto" }}
              onFocus={sugFocus} onBlur={sugBlur}>
              <SearchFieldRoot value={query} onChange={setQuery} onSubmit={handleSubmit} className="w-full">
                <SearchFieldGroup>
                  <SearchFieldSearchIcon><MagnifyingGlass size={16} /></SearchFieldSearchIcon>
                  <SearchFieldInput placeholder={t("search")} />
                  <SearchFieldClearButton />
                </SearchFieldGroup>
              </SearchFieldRoot>
              {suggestionsBox}
            </div>
            <Button variant="ghost" size="sm" isIconOnly onPress={onRefreshView} className="shrink-0 rounded-full" title={t("refresh")} style={{ contain: "layout style" }}>
              <ArrowClockwise size={14} />
            </Button>
            <Button variant="ghost" size="sm" isIconOnly onPress={onToggleCollapse} className="shrink-0 rounded-full" title={t("collapse") || "Collapse"} style={{ contain: "layout style" }}>
              <CaretLineLeft size={16} />
            </Button>
          </>
        ) : (
          <>
            <img src="/Kodama%20Logo.png" alt="Kodama" width="20" height="20" className="shrink-0" />
            <span className="text-t15 font-medium whitespace-nowrap">Kodama</span>
            <div className="ml-auto flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost" size="sm" isIconOnly
                onPress={onRefreshView}
                className="shrink-0 rounded-full"
                title={t("refresh")}
                style={{ contain: "layout style" }}
              >
                <ArrowClockwise size={14} />
              </Button>
            </div>
          </>
        ))}
      </div>

      {/* Search row — Windows/Linux only (macOS shows the search inside the header above).
          contain:layout style isolates React Aria's data-attribute updates from app-wide
          style recalcs without the paint-clipping of contain:content. */}
      {!collapsed && !IS_MAC && (
        <div className="px-3 mb-3" style={{ contain: "layout style", position: "relative", zIndex: sugOpen ? 70 : "auto" }}
          onFocus={sugFocus} onBlur={sugBlur}>
          <SearchFieldRoot
            value={query}
            onChange={setQuery}
            onSubmit={handleSubmit}
            className="w-full"
          >
            <SearchFieldGroup>
              <SearchFieldSearchIcon>
                <MagnifyingGlass size={16} />
              </SearchFieldSearchIcon>
              <SearchFieldInput placeholder={t("search")} />
              <SearchFieldClearButton />
            </SearchFieldGroup>
          </SearchFieldRoot>
          {suggestionsBox}
        </div>
      )}

      {/* Main + secondary nav — HeroUI ListBox */}
      <div className="px-2">
        {navList(mainNavItems)}
        <hr className="my-1.5 mx-2 border-t border-border" />
        {navList(secondaryNavItems)}
      </div>

      {/* Pinned + recent playlists */}
      {(pinnedPlaylists.length > 0 || recentPlaylists.length > 0) && (
        // Collapsed: no visible scrollbar at all (still scrolls via wheel/trackpad) — same
        // approach as Discord's server rail. That sidesteps the squeeze entirely rather than
        // trying to keep a visible scrollbar's reserved width from disturbing the icon centering.
        <div className={cn("overflow-y-auto flex-1 min-h-0 my-1", collapsed ? "px-0 no-scrollbar" : "px-2")}>
          {pinnedPlaylists.length > 0 && playlistSection("pinned", pinnedPlaylists, PushPin, "fill")}
          {recentPlaylists.filter(pl => !isPinned(pl)).length > 0 && playlistSection("recentlyOpened", recentPlaylists.filter(pl => !isPinned(pl)), ClockCounterClockwise)}
        </div>
      )}

      {/* New Playlist button */}
      {!collapsed && (
        <div className="px-2 mb-1.5">
          <Button
            variant="ghost" fullWidth
            onPress={onCreatePlaylist}
            className="justify-start gap-2.5 px-3 rounded-xl text-t13 text-secondary"
          >
            <Plus size={16} weight="bold" />
            {t("newPlaylist")}
          </Button>
        </div>
      )}

      {/* User info + account menu — expanded */}
      {!collapsed && (
        <div className="mt-auto px-2 pb-2.5">
          <hr className="mb-2 mx-2 border-t border-border" />
          {updateInfo && (
            <div onClick={onOpenUpdateTab}
              className="flex items-center gap-2 py-1.5 px-3 mb-1 rounded-xl text-t12 font-medium text-accent transition-all duration-150"
              style={{ background: "rgba(224,64,251,0.08)" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(224,64,251,0.15)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(224,64,251,0.08)"}
            >
              <ArrowCircleUp size={15} />
              {t("updateAvailable")}
            </div>
          )}
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0">
              <Dropdown>
                <DropdownTrigger
                  className="w-full flex items-center gap-2 py-2 px-3 rounded-xl text-secondary hover:bg-hover hover:text-primary transition-colors duration-150"
                  style={{ contain: "layout style" }}
                >
                  <div className="w-7 h-7 shrink-0 rounded-full bg-accent flex items-center justify-center text-t11 font-medium overflow-hidden">
                    {currentProfileData?.avatar
                      ? <img src={thumb(currentProfileData.avatar)} alt="" className="w-full h-full object-cover" />
                      : (currentProfileData?.displayName || "?")[0].toUpperCase()}
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0 text-left">
                    <div className="text-t12 font-medium truncate">{currentProfileData?.displayName || t("noProfile")}</div>
                    {!(hideUserHandle && currentProfileData?.handle) && (
                      <div className="text-t11 text-muted truncate">{currentProfileData?.handle || t("switchProfile")}</div>
                    )}
                  </div>
                </DropdownTrigger>
                {accountMenu}
              </Dropdown>
            </div>
            {/* What's-new bell, beside the profile button */}
            <div className="relative shrink-0">
              <Button
                variant="ghost" size="sm" isIconOnly
                onPress={onOpenNews}
                className="shrink-0 rounded-full"
                title={t("news") || "Neuigkeiten"}
                style={{ contain: "layout style" }}
              >
                <Bell size={16} />
              </Button>
              {newsUnread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-[9px] font-bold leading-none pointer-events-none"
                  style={{ background: "var(--accent)", color: "#fff", boxShadow: "0 0 0 2px var(--bg-surface)" }}>{newsUnread > 9 ? "9+" : newsUnread}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User info + settings — collapsed */}
      {collapsed && (
        <div className="mt-auto">
          <hr className="my-1 mx-4 border-t border-border" />
          <div className="flex flex-col items-center gap-1 py-2">
            <Dropdown>
              <DropdownTrigger
                className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-t11 font-medium overflow-hidden shrink-0"
                style={{ contain: "layout style" }}
                onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ text: currentProfileData?.displayName || "Kiyoshi", x: r.right + 10, y: r.top + r.height / 2 }); }}
                onMouseLeave={() => setTooltip(null)}
              >
                {currentProfileData?.avatar
                  ? <img src={thumb(currentProfileData.avatar)} alt="" className="w-full h-full object-cover" />
                  : (currentProfileData?.displayName || "?")[0].toUpperCase()}
              </DropdownTrigger>
              {accountMenu}
            </Dropdown>
            {updateInfo && (
              <div
                className="w-9 h-9 rounded flex items-center justify-center text-accent"
                style={{ background: "rgba(224,64,251,0.08)" }}
                onClick={onOpenUpdateTab}
                onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ text: t("updateAvailable"), x: r.right + 10, y: r.top + r.height / 2 }); }}
                onMouseLeave={() => setTooltip(null)}
              >
                <ArrowCircleUp size={16} />
              </div>
            )}
            {(offlineMode || isActuallyOffline) && (
              <div
                className="w-9 h-9 rounded flex items-center justify-center transition-all duration-150"
                style={{
                  color: isActuallyOffline ? "var(--status-warning)" : "var(--text-muted)",
                  opacity: isActuallyOffline ? 1 : 0.45,
                }}
                onMouseEnter={e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTooltip({ text: isActuallyOffline ? t("offlineBanner") : t("offlineComingSoon"), x: r.right + 10, y: r.top + r.height / 2 });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <WifiX size={16} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🎵 Easter Egg: Kasane Teto */}
      {tetoVisible && createPortal(
        <img
          src="/Teto_Drinking_Boba.png"
          alt="Kasane Teto"
          className="fixed bottom-[72px] right-0 w-auto h-64 pointer-events-none z-[9500]"
          style={{
            animation: tetoLeaving
              ? "tetoSlideOut 0.45s cubic-bezier(0.4,0,0.2,1) forwards"
              : "tetoSlideIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards",
          }}
        />,
        document.body
      )}
    </div>
  );
}


// Universal share link → GitHub-Pages redirect page (tries kodama://, falls back to YT Music).
// Works for everyone regardless of whether they have Kodama installed. Title/artist/cover are
// encoded in the link so the landing page can show the song without any API call.
const KODAMA_SHARE_BASE = "https://kodama.kiyoshi.dev/s/";

// Targets for lyrics translation. The backend hands the code to Google Translate lowercased,
// so anything Google accepts works without a mapping — every entry below was checked against
// the live endpoint rather than taken from a list. Hebrew works as "he"; the legacy "iw" is
// not needed. Sorted by native name, because at this length the list is scanned, not read.
const TRANSLATION_LANGS = [
  { code: "AR",    name: "العربية" },
  { code: "BG",    name: "Български" },
  { code: "BN",    name: "বাংলা" },
  { code: "CA",    name: "Català" },
  { code: "CS",    name: "Čeština" },
  { code: "DA",    name: "Dansk" },
  { code: "DE",    name: "Deutsch" },
  { code: "EL",    name: "Ελληνικά" },
  { code: "EN",    name: "English" },
  { code: "ES",    name: "Español" },
  { code: "ET",    name: "Eesti" },
  { code: "FA",    name: "فارسی" },
  { code: "FI",    name: "Suomi" },
  { code: "FR",    name: "Français" },
  { code: "HE",    name: "עברית" },
  { code: "HI",    name: "हिन्दी" },
  { code: "HR",    name: "Hrvatski" },
  { code: "HU",    name: "Magyar" },
  { code: "ID",    name: "Bahasa Indonesia" },
  { code: "IT",    name: "Italiano" },
  { code: "JA",    name: "日本語" },
  { code: "KO",    name: "한국어" },
  { code: "LT",    name: "Lietuvių" },
  { code: "LV",    name: "Latviešu" },
  { code: "MS",    name: "Bahasa Melayu" },
  { code: "NB",    name: "Norsk bokmål" },
  { code: "NL",    name: "Nederlands" },
  { code: "PL",    name: "Polski" },
  { code: "PT",    name: "Português" },
  { code: "PT-BR", name: "Português (Brasil)" },
  { code: "RO",    name: "Română" },
  { code: "RU",    name: "Русский" },
  { code: "SK",    name: "Slovenčina" },
  { code: "SL",    name: "Slovenščina" },
  { code: "SR",    name: "Српски" },
  { code: "SV",    name: "Svenska" },
  { code: "SW",    name: "Kiswahili" },
  { code: "TH",    name: "ไทย" },
  { code: "TL",    name: "Tagalog" },
  { code: "TR",    name: "Türkçe" },
  { code: "UK",    name: "Українська" },
  { code: "VI",    name: "Tiếng Việt" },
  { code: "ZH",    name: "中文（简体）" },
  { code: "ZH-TW", name: "中文（繁體）" },
].sort((a, b) => a.name.localeCompare(b.name));
// Nothing but the id. Title, artist and a cover URL used to ride along as query parameters,
// which blew the link up to ~250 characters and made it look like it was carrying tracking
// data — enough to put people off sharing it. The share page resolves all of that from the
// id via YouTube's oEmbed endpoint, so the link stays at 55 characters and reveals nothing
// beyond which song it points to.
function buildShareLink(track) {
  return `${KODAMA_SHARE_BASE}?${track.videoId}`;
}

function hexToRgb(str) {
  if (!str) return null;
  str = str.trim();
  const m = str.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgb = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  return null;
}
// Handle of the running accent cross-fade, so a new track can cancel the previous one.
// It was missing entirely: modules are strict mode, so merely reading it threw a
// ReferenceError on the first line of setAccentSmooth below. The caller caught that and
// restored the fixed accent — which is why the dynamic accent derived a colour correctly
// and then never applied it.
let accentFadeRaf = 0;

function setAccentSmooth(toHex, duration = 380) {
  const root = document.documentElement;
  const a = hexToRgb(getComputedStyle(root).getPropertyValue("--accent"));
  const b = hexToRgb(toHex);
  if (!a || !b) { root.style.setProperty("--accent", toHex); return; }
  cancelAnimationFrame(accentFadeRaf);
  const t0 = performance.now();
  const hx = (v) => Math.round(v).toString(16).padStart(2, "0");
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
    root.style.setProperty("--accent", `#${hx(a[0] + (b[0] - a[0]) * e)}${hx(a[1] + (b[1] - a[1]) * e)}${hx(a[2] + (b[2] - a[2]) * e)}`);
    if (p < 1) accentFadeRaf = requestAnimationFrame(tick);
  };
  accentFadeRaf = requestAnimationFrame(tick);
}

// ── Dynamic accent: derive a vibrant, legible accent hex from a cover image ──
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
// Pick the most saturated×bright pixel, then normalise S/L into a legible accent band.
// `satMin` raises the saturation floor (vibrancy); `light` sets the target lightness centre.
function vibrantAccentFromImage(img, satMin = 0.5, light = 0.6) {
  const c = document.createElement("canvas"); c.width = 48; c.height = 48;
  const cx = c.getContext("2d"); cx.drawImage(img, 0, 0, 48, 48);
  const d = cx.getImageData(0, 0, 48, 48).data;
  let br = 0, bg = 0, bb = 0, best = -1;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const score = (mx === 0 ? 0 : (mx - mn) / mx) * (mx / 255); // saturation × brightness
    if (score > best) { best = score; br = r; bg = g; bb = b; }
  }
  const [h, s, l] = rgbToHsl(br, bg, bb);
  const L = Math.min(light + 0.08, Math.max(light - 0.08, l)); // keep near the chosen centre
  return hslToHex(h, Math.min(1, Math.max(satMin, s)), Math.min(0.92, Math.max(0.12, L)));
}

// Accent colour picker built from HeroUI colour components:
// ColorSwatch (preset grid + preview) + ColorArea (saturation/brightness) + ColorSlider (hue).
// Bridges between our hex-string accent value and react-aria Color objects.
function Player({ track, setTrack, queue, setQueue, audioRef, isPlaying, setIsPlaying, expanded, onExpandToggle, showLyrics, onToggleLyrics, videoAvailable = false, showVideoView = false, onSetVideoView, videoSync, queueOpen, onToggleQueue, fullscreen, onToggleFullscreen, onOpenAlbum, onOpenArtist, onExportSong, onDownloadSong, cachedSongIds, downloadingIds, onRefetchLyrics, isCustomLyrics = false, onImportLyrics, onRemoveCustomLyrics, onOpenLyricsBrowser, onPremiumDetected, onCreatePlaylist, onAddToPlaylist }) {
  // The lyrics translation toggle + target language live in the ⋮ menu; they are global
  // preferences, so they come from context rather than being threaded through App().
  const {
    showTranslation: showLyricsTranslation,
    translationLang: lyricsTranslationLang, setTranslationLang,
  } = useLyricsPrefs();
  // Read-only here: crossfade/crossfadeOverrides are mirrored into refs below, and the
  // timing-critical audio paths read those refs, not these values.
  const { crossfade, crossfadeOverrides, remoteEnabled, playbackProgressive } = usePlaybackPrefs();
  const [progress, setProgress] = useState(0);
  // 0..1 while streaming, null when there is nothing to indicate (classic playback / local file).
  const [buffered, setBuffered] = useState(null);
  const [preparing, setPreparing] = useState(false);
  // Stable ref so fetchUrl can read the current playback mode without re-subscribing.
  const playbackProgressiveRef = useRef(playbackProgressive);
  playbackProgressiveRef.current = playbackProgressive;
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem("kiyoshi-volume"));
    return isNaN(saved) ? 0.4 : Math.max(0, Math.min(1, saved));
  });
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likePulsing, setLikePulsing] = useState(false);
  const [prevBouncing, setPrevBouncing] = useState(false);
  const [nextBouncing, setNextBouncing] = useState(false);
  const [songStats, setSongStats] = useState(null);
  const [fetchedBrowseIds, setFetchedBrowseIds] = useState({});
  const zoom = useZoom();

  // ── Sleep Timer ────────────────────────────────────────────────────────────
  const [sleepTimerEnd, setSleepTimerEnd] = useState(null); // ms timestamp
  const [sleepRemaining, setSleepRemaining] = useState(null); // seconds
  useEffect(() => {
    if (!sleepTimerEnd) { setSleepRemaining(null); return; }
    const tick = () => {
      const r = Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000));
      setSleepRemaining(r);
      if (r <= 0) {
        audioRef.current?.pause();
        setIsPlaying(false);
        setSleepTimerEnd(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepTimerEnd]);


  const formatSleepRemaining = (s) => {
    if (s === null) return null;
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!track?.videoId) { setSongStats(null); return; }
    setSongStats(null);
    fetch(`${API}/song/stats/${track.videoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setSongStats(d); })
      .catch(() => {});
  }, [track?.videoId]);

  // Fetch missing album/artist browse IDs for the current track — called when the
  // More dropdown opens so "Go to album/artist" can navigate.
  const fetchMoreBrowseIds = useCallback(() => {
    if (!track?.videoId) return;
    if (track.albumBrowseId || track.artistBrowseId) return; // already have them
    if (fetchedBrowseIds[track.videoId]) return; // already fetched
    fetch(`${API}/song/info/${track.videoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && !d.error) {
          setFetchedBrowseIds(prev => {
            const next = { ...prev, [track.videoId]: d };
            const keys = Object.keys(next);
            if (keys.length > 100) keys.slice(0, keys.length - 100).forEach(k => delete next[k]);
            return next;
          });
        }
      })
      .catch(() => {});
  }, [track?.videoId, track?.albumBrowseId, track?.artistBrowseId, fetchedBrowseIds]);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("none");
  const t = useLang();

  // LRU cache: videoId -> url (max 50 entries, Map preserves insertion order)
  const URL_CACHE_MAX = 50;
  const urlCache = useRef(new Map());

  // The cached URL is only valid for the mode that produced it — progressive hands out the
  // streaming proxy, classic a local file path. Without this, switching modes kept serving the
  // old URLs for every song already touched, so a user whose progressive playback failed had to
  // restart the app before turning it off actually helped. (Reported: "I have to disable it and
  // then restart the application".)
  useEffect(() => { urlCache.current.clear(); }, [playbackProgressive]);

  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const queueRef = useRef(queue);
  const trackRef = useRef(track);
  const crossfadeRef = useRef(crossfade);
  const volumeRef = useRef(volume);
  const prevVolumeRef = useRef(volume > 0 ? volume : 0.4);
  // Quadratic volume curve — human hearing is logarithmic, so v² feels linear
  const volCurve = (v) => v * v;

  const crossfadeActiveRef = useRef(false);       // a crossfade is pending or in flight
  const crossfadePendingTrackRef = useRef(null);  // next track, set until Rust confirms "started"
  const crossfadeFailedTrackRef = useRef(null);   // videoId a crossfade failed for (don't retry it)
  const skipStreamResetRef = useRef(false);       // suppress audio_play after a crossfade advance
  const videoModeActiveRef = useRef(false);       // audioRef is currently playing the counterpart's own audio, not the song's
  const videoModeTrackIdRef = useRef(null);       // which track's video mode this is — guards against a race with a real track change
  const showVideoViewRef = useRef(showVideoView); showVideoViewRef.current = showVideoView;
  const _lastProgressTs = useRef(0); // throttle: last time setProgress was called
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { trackRef.current = track; }, [track]);
  useEffect(() => { crossfadeRef.current = crossfade; }, [crossfade]);
  const crossfadeOverridesRef = useRef(crossfadeOverrides);
  useEffect(() => { crossfadeOverridesRef.current = crossfadeOverrides; }, [crossfadeOverrides]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onVolumeChange = () => {
      const raw = audio.volume;
      const v = Math.sqrt(raw); // reverse the v² curve to get display value
      // Only update if the volume actually differs from current state to avoid
      // feedback loops (IpcAudio fires volumechange after every set volume).
      if (Math.abs(v - volumeRef.current) < 0.005) return;
      setVolume(v);
      if (v > 0) prevVolumeRef.current = v;
      localStorage.setItem("kiyoshi-volume", v);
    };
    audio.addEventListener("volumechange", onVolumeChange);
    return () => audio.removeEventListener("volumechange", onVolumeChange);
  }, []);

  const getAdjacentTrack = useCallback((dir) => {
    const q = queueRef.current;
    const t = trackRef.current;
    if (!q.length || !t) return null;
    const idx = q.findIndex(x => x.videoId === t.videoId);
    if (idx === -1) return null;
    if (dir === "next") {
      if (shuffleRef.current) return q[Math.floor(Math.random() * q.length)];
      return q[(idx + 1) % q.length];
    }
    return q[(idx - 1 + q.length) % q.length];
  }, []);

  // Advance/rewind by one track. Updates trackRef synchronously BEFORE setTrack so a burst of
  // rapid skips (fired faster than React can commit + run the trackRef effect) each reads the
  // freshly chosen track instead of the stale one — otherwise quick successive skips under-
  // advance and the displayed track info lags several songs behind until the effects catch up.
  const goAdjacent = useCallback((dir) => {
    const tk = getAdjacentTrack(dir);
    if (tk) { trackRef.current = tk; setTrack(tk); }
    return tk;
  }, [getAdjacentTrack, setTrack]);

  const urlCacheGet = (videoId) => {
    const c = urlCache.current;
    if (!c.has(videoId)) return null;
    // Move to end (most-recently-used)
    const val = c.get(videoId);
    c.delete(videoId);
    c.set(videoId, val);
    return val;
  };
  const urlCachePut = (videoId, url) => {
    const c = urlCache.current;
    c.delete(videoId); // remove old position if exists
    c.set(videoId, url);
    if (c.size > URL_CACHE_MAX) c.delete(c.keys().next().value); // evict oldest
  };

  const fetchUrl = useCallback(async (videoId) => {
    const cached = urlCacheGet(videoId);
    if (cached) return cached;
    // Prefer locally cached song (served via backend, works for both Rust & HTML5)
    try {
      const cr = await fetch(`${API}/song/cached/${videoId}`, { method: "HEAD" });
      if (cr.ok) {
        const cachedUrl = `${API}/song/cached/${videoId}`;
        urlCachePut(videoId, cachedUrl);
        return cachedUrl;
      }
    } catch {}
    const useRust = audioRef.current && audioRef.current._fallback === false;
    // Progressive (default): hand the Rust core the range-streaming proxy URL so it starts
    // playing as soon as the header is fetched, instead of waiting for a full yt-dlp download.
    if (useRust && playbackProgressiveRef.current) {
      const proxyUrl = `${API}/audio-stream/${videoId}`;
      urlCachePut(videoId, proxyUrl);
      return proxyUrl;
    }
    // Classic: download via yt-dlp to disk and return the file path (Rust reads from disk).
    if (useRust) {
      try {
        const r = await fetch(`${API}/stream-prepare/${videoId}`);
        const d = await r.json();
        if (d.premium_only) { onPremiumDetected?.(videoId); return null; }
        if (d.path) {
          // Prefix with file:// so Rust knows it's a local path
          const fileUrl = `file://${d.path.replace(/\\/g, "/")}`;
          urlCachePut(videoId, fileUrl);
          return fileUrl;
        }
      } catch (e) { console.error(`[stream-prepare] ${videoId}:`, e); }
    }
    // HTML5 fallback: fetch direct googlevideo URL (browser handles cookies)
    let lastStreamError = null;
    for (let i = 1; i <= 3; i++) {
      try {
        const r = await fetch(`${API}/stream/${videoId}`);
        const d = await r.json();
        if (d.premium_only) { onPremiumDetected?.(videoId); return null; }
        if (d.url) { urlCachePut(videoId, d.url); return d.url; }
        if (d.error) lastStreamError = d.error;
      } catch (e) { lastStreamError = String(e); }
      if (i < 3) await new Promise(res => setTimeout(res, 800));
    }
    if (lastStreamError) console.error(`[stream] ${videoId}: ${lastStreamError}`);
    return null;
  }, [onPremiumDetected]);
  // fetchUrl's own identity churns whenever the (inline, unmemoized) onPremiumDetected prop does
  // — i.e. most App re-renders. A ref keeps the video-sync effect below reacting to an actual
  // showVideoView change only, not to fetchUrl's incidental identity noise (which was causing it
  // to re-fire on unrelated renders, re-triggering the swap and landing back near position 0).
  const fetchUrlRef = useRef(fetchUrl);
  useEffect(() => { fetchUrlRef.current = fetchUrl; }, [fetchUrl]);

  // Loads a fresh src and lands at targetPos — used by the video-sync switch below. Rust only
  // actually honours a nonzero seekTo on Play for an already-buffered/local source; a just-opened
  // network stream silently starts at 0 regardless (unlike audio_seek on an already-playing track,
  // which the seekbar/remote "seek" command already prove works reliably). So instead of relying
  // on that, this does exactly what those DO prove work: load+play (always starts at 0), wait for
  // Rust to confirm the new source is actually ready (canplay), THEN issue a normal seek.
  const loadAndSeek = async (a, url, targetPos, wasPlaying) => {
    a.src = url;
    // play() is what actually sends audio_play to Rust (src alone only marks it dirty) — the
    // "canplay" wait below has to come AFTER, or it'd wait on an event nothing ever triggers.
    await a.play().catch(e => console.error("[VideoSync] play error:", e));
    await new Promise(resolve => {
      const onReady = () => { a.removeEventListener("canplay", onReady); resolve(); };
      a.addEventListener("canplay", onReady);
      setTimeout(resolve, 4000); // safety net in case the event never fires
    });
    a.currentTime = targetPos;
    if (!wasPlaying) a.pause();
  };

  // Video-sync mode: on the audio/video switch, swap the ACTUAL Rust audio source between the
  // song's own stream and the counterpart video's own audio stream (fetchUrl works for either —
  // it's just a videoId), landing at the offset-corrected position so playback continues at the
  // spot that actually corresponds across the two versions. Deliberately bypasses the main
  // `[track]`-keyed effect above (that would reset progress/crossfade state) since `track` itself
  // doesn't change here — this mirrors how the crossfade code below directly drives `a`.
  useEffect(() => {
    const a = audioRef.current;
    const curTrack = trackRef.current;
    if (!a || !curTrack) return;
    const trackId = curTrack.videoId;
    let cancelled = false;
    const wasPlaying = !a.paused;

    if (showVideoView) {
      if (!videoSync?.ready || !videoSync?.counterpartVideoId) return;
      // Self-video (the track IS the video): the audio already IS this video's audio, so there's
      // nothing to swap. Just mark video mode active (to hold off crossfade, which would desync
      // the video) and let the muted <video> ride the existing audio clock at offset 0.
      if (videoSync.selfVideo) {
        videoModeActiveRef.current = true;
        videoModeTrackIdRef.current = trackId;
        return;
      }
      const offset = videoSync.offsetSeconds || 0;
      (async () => {
        const targetPos = Math.max(0, a.currentTime + offset);
        const url = await fetchUrlRef.current(videoSync.counterpartVideoId);
        // Bail if the track changed, or video view was toggled back off, while resolving.
        if (cancelled || !url || trackRef.current?.videoId !== trackId || !showVideoViewRef.current) return;
        videoModeActiveRef.current = true;
        videoModeTrackIdRef.current = trackId;
        crossfadeActiveRef.current = false;
        crossfadePendingTrackRef.current = null;
        await loadAndSeek(a, url, targetPos, wasPlaying);
        if (wasPlaying) setIsPlaying(true);
      })();
    } else if (videoModeActiveRef.current && videoModeTrackIdRef.current === trackId) {
      // Self-video had no audio swap to undo — just clear the flag.
      if (videoSync?.selfVideo) { videoModeActiveRef.current = false; return; }
      const offset = videoSync?.offsetSeconds || 0;
      (async () => {
        const targetPos = Math.max(0, a.currentTime - offset);
        const url = await fetchUrlRef.current(trackId);
        if (cancelled || !url || trackRef.current?.videoId !== trackId) return;
        videoModeActiveRef.current = false;
        await loadAndSeek(a, url, targetPos, wasPlaying);
        if (wasPlaying) setIsPlaying(true);
      })();
    }
    return () => { cancelled = true; };
  }, [showVideoView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload upcoming tracks in the background so sequential listening (album/playlist/queue)
  // has near-instant transitions and "next". Warm the next TWO tracks (most listening is
  // in order) plus the previous one. Sequential (not concurrent) to avoid starving the
  // current song's own download of bandwidth. Shuffle's "next" is random/unpredictable, so
  // there we only warm the immediate in-order neighbour as a cheap best-effort.
  const preloadAdjacent = useCallback(async () => {
    await new Promise(res => setTimeout(res, 1500)); // let the current song's download get ahead
    const q = queueRef.current;
    const t = trackRef.current;
    if (!q.length || !t) return;
    const idx = q.findIndex(x => x.videoId === t.videoId);
    if (idx === -1) return;
    const targets = shuffleRef.current
      ? [q[(idx + 1) % q.length]]
      : [q[(idx + 1) % q.length], q[(idx + 2) % q.length], q[(idx - 1 + q.length) % q.length]];
    for (const tk of targets) {
      if (!tk || tk.videoId === t.videoId) continue;
      if (playbackProgressiveRef.current) {
        // Progressive: prewarm the URL resolution (the ~2-4s yt-dlp extraction) so the next
        // play is extraction-free. No bytes are downloaded — playback streams on demand.
        try { await fetch(`${API}/audio-stream/${tk.videoId}/warm`); } catch {}
      } else if (!urlCache.current.has(tk.videoId)) {
        // Classic: pre-download to disk.
        try { await fetchUrl(tk.videoId); } catch {}
      }
    }
  }, [fetchUrl]);

  useEffect(() => {
    if (!track) return;
    // Check if track is liked
    fetch(`${API}/liked/ids`)
      .then(r => r.json())
      .then(d => setIsLiked((d.ids || []).includes(track.videoId)))
      .catch(() => {});
  }, [track?.videoId]);

  useEffect(() => {
    if (!track) return;
    // A real track change ends any video-mode session (the audio is reloaded fresh below), so
    // clear the flag — otherwise it lingers true after leaving a video track and keeps crossfade
    // suppressed on later songs. (The video toggle itself doesn't re-run this effect: it swaps
    // a.src directly without touching `track`.)
    videoModeActiveRef.current = false;
    setLoading(true);
    setStreamUrl(null);
    let cancelled = false;

    fetchUrl(track.videoId).then(url => {
      if (cancelled) return;
      if (url) { setStreamUrl(url); }
      else { console.error("Stream fehlgeschlagen"); }
      setLoading(false);
    });

    preloadAdjacent();
    return () => { cancelled = true; };
  }, [track]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !streamUrl) return;

    // When a crossfade advanced the track (Rust signalled "started"), Rust is already
    // playing the incoming track on its second sink — skip audio_play, just sync UI.
    const skipSrcReset = skipStreamResetRef.current;
    skipStreamResetRef.current = false;

    if (skipSrcReset) {
      // Audio already playing from the Rust crossfade — just sync state.
      // Don't touch a.src — Rust is mid-blend; fall through to (re)attach listeners.
      // Leave crossfadeActiveRef set: it stays true until Rust emits "done".
      setIsPlaying(true);
      if (a.duration) setDuration(a.duration);
    } else {
      // A fresh/manual play cancels any pending crossfade (Rust's Play stops sink2).
      crossfadeActiveRef.current = false;
      crossfadePendingTrackRef.current = null;
      crossfadeFailedTrackRef.current = null;
      a.src = streamUrl;
      a.volume = volCurve(volume);
      volumeRef.current = volume;
      a.play().catch(e => console.error("[Player] play() error:", e));
      setIsPlaying(true);
      setProgress(0);
    }

    // IpcAudio may return 0 when Rust can't determine duration from metadata;
    // fall back to the track's formatted duration string in that case.
    const onDur = () => {
      const d = a.duration > 0 ? a.duration : (parseDurationToSeconds(track?.duration) || 0);
      setDuration(d);
    };

    const onEnd = () => {
      // If a crossfade has already started, Rust drives the transition — ignore the
      // outgoing track's end. (Once Rust promotes + emits "done", the guard clears
      // and a later natural end of the promoted track advances normally.)
      if (crossfadeActiveRef.current && !crossfadePendingTrackRef.current) return;
      // A crossfade that was still *pending* (build not started) is aborted here.
      crossfadeActiveRef.current = false;
      crossfadePendingTrackRef.current = null;
      if (repeatRef.current === "one") {
        a.currentTime = 0; a.play();
      } else {
        const next = getAdjacentTrack("next");
        if (next) setTrack(next);
        else if (repeatRef.current === "none") setIsPlaying(false);
      }
    };

    // Combined timeupdate handler: throttled progress + Rust-core crossfade trigger.
    const onTimeUpdate = () => {
      // Throttle setProgress to max 4× per second to avoid excessive re-renders.
      const now = performance.now();
      if (now - _lastProgressTs.current >= 250) {
        _lastProgressTs.current = now;
        setProgress(a.currentTime);
        // Rides along with the existing throttle rather than opening its own timer — an extra
        // periodic job in the player is exactly what caused the 15s stutter once before.
        setBuffered(a.bufferedFraction ?? null);
      }

      if (!a.duration) return;
      // Crossfade is a Rust-core feature (two sinks, OBS-capturable). If we fell
      // back to HTML5 audio (Rust binary missing), skip it entirely.
      if (audioRef.current?._fallback !== false) return;
      if (crossfadeActiveRef.current || repeatRef.current === "one") return;
      // While video-sync mode is playing the counterpart's own audio, its duration/position
      // don't correspond to the song's real timeline — skip the crossfade-into-next trigger
      // entirely rather than firing it against the wrong numbers.
      if (videoModeActiveRef.current) return;
      // Don't keep retrying a crossfade that already failed for this very track.
      if (crossfadeFailedTrackRef.current === trackRef.current?.videoId) return;

      const next = getAdjacentTrack("next");
      if (!next) return;

      // Per-transition override beats the global default; secs 0 = hard cut for this pair.
      const ov = crossfadeOverridesRef.current[`${trackRef.current?.videoId}__${next.videoId}`];
      const cfWin = ov ? ov.secs : crossfadeRef.current;
      if (!cfWin || cfWin <= 0) return;

      const remaining = a.duration - a.currentTime;
      if (remaining > cfWin || remaining <= 0.05) return;

      // Mark immediately so we trigger exactly once. The guard stays set until Rust
      // confirms the outcome via "started"/"done"/"failed" — never reset by re-renders,
      // which is what previously caused a re-trigger storm during the build window.
      crossfadeActiveRef.current = true;
      crossfadePendingTrackRef.current = next;
      const fromId = trackRef.current?.videoId;
      fetchUrl(next.videoId).then(url => {
        // Bail if the track changed underneath us (manual skip / natural end) while
        // the URL was resolving — otherwise we'd start a stale crossfade.
        if (!url || trackRef.current?.videoId !== fromId || crossfadePendingTrackRef.current !== next) {
          if (trackRef.current?.videoId === fromId) { crossfadeActiveRef.current = false; crossfadePendingTrackRef.current = null; }
          return;
        }
        // Rust runs both sinks simultaneously (outgoing down, incoming up) so the
        // blend is captured by OBS / the visualizer just like normal playback. The UI
        // advances only once Rust emits "audio-crossfade-started" (see listener below).
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("audio_crossfade", { url, seekTo: 0, duration: cfWin })
            .catch(e => console.error("[Player] audio_crossfade error:", e));
        });
      });
    };

    // The wait before a new track produces any audio. "error" has to clear it as well —
    // otherwise a stream that never opens leaves the seek bar animating for good.
    const onPreparing = () => setPreparing(true);
    const onReady = () => setPreparing(false);

    // Always register listeners — even after a crossfade advance.
    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("ended", onEnd);
    a.addEventListener("preparing", onPreparing);
    a.addEventListener("canplay", onReady);
    a.addEventListener("error", onReady);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("preparing", onPreparing);
      a.removeEventListener("canplay", onReady);
      a.removeEventListener("error", onReady);
    };
  }, [streamUrl]);

  // Rust crossfade lifecycle. The UI advances to the incoming track exactly when the
  // blend actually starts ("started"), and the guard clears only on a definitive
  // outcome ("done"/"failed") — never on a re-render. This is what prevents the
  // re-trigger storm that came from clearing the guard during the async build window.
  useEffect(() => {
    let unlistens = [];
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      const reg = (name, fn) =>
        listen(name, fn).then(u => { if (cancelled) u(); else unlistens.push(u); });

      reg("audio-crossfade-started", () => {
        const next = crossfadePendingTrackRef.current;
        crossfadePendingTrackRef.current = null;
        // Rust is now audibly playing `next` on its second sink — move the UI to it
        // and suppress the duplicate audio_play in the streamUrl effect.
        if (next) { skipStreamResetRef.current = true; setTrack(next); }
      });
      reg("audio-crossfade-done", () => { crossfadeActiveRef.current = false; });
      reg("audio-crossfade-failed", () => {
        // Mark this track so we don't immediately retry; outgoing keeps playing and
        // will hand off via the normal `ended` path once it finishes.
        crossfadeFailedTrackRef.current = trackRef.current?.videoId || null;
        crossfadeActiveRef.current = false;
        crossfadePendingTrackRef.current = null;
      });
    });
    return () => { cancelled = true; unlistens.forEach(u => u()); };
  }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) { a.pause(); setIsPlaying(false); }
    else { a.play(); setIsPlaying(true); }
  };

  // OS media controls (Windows SMTC / macOS Now Playing / Linux MPRIS + keyboard media keys)
  // emit a `media-control` event from Rust; drive the player from it. Subscribe once and read
  // the latest handlers through a ref so we don't re-bind the listener on every render.
  const mediaCtlRef = useRef({});
  mediaCtlRef.current = { togglePlay, getAdjacentTrack, goAdjacent, setTrack, setIsPlaying, queue };
  useEffect(() => {
    let unlisten;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("media-control", (e) => {
        const { action, position } = e.payload || {};
        const h = mediaCtlRef.current;
        const a = audioRef.current;
        switch (action) {
          case "play":     if (a && a.paused) { a.play(); h.setIsPlaying(true); } break;
          case "pause":    if (a && !a.paused) { a.pause(); h.setIsPlaying(false); } break;
          case "toggle":   h.togglePlay(); break;
          case "next":     h.goAdjacent("next"); break;
          case "previous": h.goAdjacent("prev"); break;
          case "stop":     if (a) { a.pause(); h.setIsPlaying(false); } break;
          case "seek":     if (a && typeof position === "number") a.currentTime = position; break;
          default: break;
        }
      }).then(fn => { unlisten = fn; });
    });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // LAN remote bridge: while enabled, push now-playing state to the backend and drain
  // commands the phone enqueued — executed through the same playback controls as media keys.
  // Commands are {action, ...payload} objects (seek/volume/queueJump carry extra fields);
  // plain playback toggles just carry {action}.
  const runPlaybackAction = (cmd) => {
    const h = mediaCtlRef.current;
    const action = typeof cmd === "string" ? cmd : cmd?.action;
    if (action === "playpause") h.togglePlay();
    else if (action === "next") h.goAdjacent("next");
    else if (action === "prev") h.goAdjacent("prev");
    else if (action === "shuffle") setShuffle(s => !s);
    else if (action === "repeat") cycleRepeat();
    else if (action === "like") h.toggleLike?.();
    else if (action === "seek" && typeof cmd.position === "number") {
      const a = audioRef.current;
      if (a) a.currentTime = Math.max(0, cmd.position);
    } else if (action === "volume" && typeof cmd.value === "number") {
      const v = Math.max(0, Math.min(1, cmd.value / 100));
      setVolume(v);
      if (audioRef.current) audioRef.current.volume = volCurve(v);
    } else if (action === "queueJump" && cmd.videoId) {
      const tk = (h.queue || []).find(q => q.videoId === cmd.videoId);
      if (tk) h.setTrack(tk);
    }
  };
  const remoteNpRef = useRef({});
  remoteNpRef.current = { track, isPlaying, progress, duration, shuffle, repeat, volume, isLiked, queue };
  useEffect(() => {
    if (!remoteEnabled) return;
    // One combined request per tick (push state + receive pending commands) instead of two
    // separate polling loops — keeps background activity (and its GC churn) low.
    // Small square thumbnail for queue-list rows — hiResThumb() asks for 800px, fine for
    // the one big cover but wasteful for up to 100 tiny list icons pushed every second.
    const queueThumb = (url) => {
      if (!url) return "";
      if (url.includes("googleusercontent.com") || url.includes("ggpht.com")) {
        return /=[ws]\d+/.test(url) ? url.replace(/=[ws]\d+[^/]*$/, "=w120-h120-l90-rj") : url + "=w120-h120-l90-rj";
      }
      return url;
    };
    const sync = () => {
      const { track: t, isPlaying: p, progress: pos, duration: dur, shuffle: sh, repeat: rp, volume: vol, isLiked: liked, queue: q } = remoteNpRef.current;
      const artists = Array.isArray(t?.artists)
        ? t.artists.map(a => (a && a.name) || a).filter(Boolean).join(", ")
        : (t?.artists || "");
      // "Up next" — from just after the currently playing track, same as the Queue panel's own
      // upNext derivation — not the raw array's first N, which stayed stuck on whatever was
      // upcoming when remote was first enabled and never advanced as tracks were skipped.
      const list = q || [];
      const curIdx = list.findIndex(qt => qt.videoId === t?.videoId);
      const upNext = curIdx >= 0 ? list.slice(curIdx + 1) : list;
      const queueSlice = upNext.slice(0, 100).map(qt => ({
        videoId: qt.videoId,
        title: qt.title || "",
        artists: Array.isArray(qt.artists) ? qt.artists.map(a => (a && a.name) || a).filter(Boolean).join(", ") : (qt.artists || ""),
        thumbnail: queueThumb(qt.thumbnail),
      }));
      fetch(`${API}/remote/_sync`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: {
            title: t?.title || "", artists, thumbnail: hiResThumb(t?.thumbnail, 800) || "",
            isPlaying: !!p, position: Math.floor(pos || 0), duration: Math.floor(dur || 0), hasTrack: !!t,
            shuffle: !!sh, repeat: rp || "none",
            volume: Math.round((vol ?? 1) * 100), isLiked: !!liked, queue: queueSlice,
          },
        }),
      }).then(r => r.json()).then(d => (d.commands || []).forEach(runPlaybackAction)).catch(() => {});
    };
    sync();
    const iv = setInterval(sync, 1000);
    return () => { clearInterval(iv); };
  }, [remoteEnabled]);

  // Big Picture bridge: expose playback commands (re-registered each render so they close over
  // current state) + push a formatted now-playing snapshot to the in-process store.
  useEffect(() => {
    bpRegisterCommands({
      action: runPlaybackAction,
      seek: (sec) => { const a = audioRef.current; if (a) a.currentTime = Math.max(0, sec); },
    });
    bpRegisterAudio(audioRef.current); // hand the IpcAudio clock to Big Picture's lyrics view
  });
  useEffect(() => {
    const tr = track;
    const artists = Array.isArray(tr?.artists)
      ? tr.artists.map(a => (a && a.name) || a).filter(Boolean).join(", ")
      : (tr?.artists || "");
    bpSetNowPlaying({
      title: tr?.title || "", artists, thumbnail: tr?.thumbnail || "",
      isPlaying: !!isPlaying, position: Math.floor(progress || 0), duration: Math.floor(duration || 0),
      hasTrack: !!tr, shuffle: !!shuffle, repeat: repeat || "none",
      track: tr || null, // raw track object so Big Picture's lyrics view can fetch for it
    });
  }, [track, isPlaying, progress, duration, shuffle, repeat]);

  // Mini player: same snapshot, but it lives in its own window, so it goes over Tauri's
  // event bus instead of the in-process store above. Position travels as a timestamped
  // anchor that the mini player interpolates, so this stays at ~1 message/s rather than
  // one per progress tick. miniStateRef keeps the latest payload around for the handshake.
  const miniStateRef = useRef(null);
  const miniSentRef = useRef({ sig: "", at: 0 });
  useEffect(() => {
    const tr = track;
    const artists = Array.isArray(tr?.artists)
      ? tr.artists.map(a => (a && a.name) || a).filter(Boolean).join(", ")
      : (tr?.artists || "");
    const payload = {
      title: tr?.title || "", artists, thumbnail: tr?.thumbnail || "",
      isPlaying: !!isPlaying, position: progress || 0, duration: Math.floor(duration || 0),
      at: Date.now(), hasTrack: !!tr,
    };
    miniStateRef.current = payload;
    // Send immediately when something the mini player renders statically changes; otherwise
    // throttle, since `progress` alone would fire this several times per second.
    const sig = `${tr?.videoId || ""}|${!!isPlaying}|${payload.duration}`;
    const now = Date.now();
    if (sig === miniSentRef.current.sig && now - miniSentRef.current.at < 1000) return;
    miniSentRef.current = { sig, at: now };
    emitNowPlaying(payload);
  }, [track, isPlaying, progress, duration]);
  useEffect(() => {
    let unlisten;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen(EV_HELLO, () => {
        // The mini player just mounted and has nothing yet — answer with the current state.
        if (!miniStateRef.current) return;
        const a = audioRef.current;
        emitNowPlaying({
          ...miniStateRef.current,
          position: typeof a?.currentTime === "number" ? a.currentTime : miniStateRef.current.position,
          at: Date.now(),
        });
      }).then(fn => { unlisten = fn; });
    });
    return () => { unlisten && unlisten(); };
  }, []);
  // Opening the mini player sends this window to the tray; this brings it back.
  useEffect(() => {
    let unlisten;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen(EV_SHOW_MAIN, async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const w = getCurrentWindow();
        try { await w.show(); await w.unminimize(); await w.setFocus(); } catch {}
      }).then(fn => { unlisten = fn; });
    });
    return () => { unlisten && unlisten(); };
  }, []);

  // Seek drag state for the HeroUI seek slider (seconds while dragging, else null).
  const [seekDrag, setSeekDrag] = useState(null);

  const toggleLike = async () => {
    if (!track) return;
    const newRating = isLiked ? "INDIFFERENT" : "LIKE";
    setIsLiked(!isLiked);
    if (!isLiked) {
      setLikePulsing(true);
      setTimeout(() => setLikePulsing(false), 450);
    }
    try {
      await fetch(`${API}/like/${track.videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: newRating,
          title: track.title || "",
          artists: track.artists || "",
          album: track.album || "",
          thumbnail: track.thumbnail || "",
          duration: track.duration || "",
        }),
      });
      // Last.fm Loved sync (backend no-ops if not connected)
      const lfArtist = (track.artists || "").replace(/\s*-\s*Topic$/i, "").trim();
      const lfTitle = (track.title || "").trim();
      if (lfArtist && lfTitle) {
        fetch(`${API}/lastfm/${newRating === "LIKE" ? "love" : "unlove"}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artist: lfArtist, track: lfTitle }),
        }).catch(() => {});
      }
    } catch {
      setIsLiked(isLiked); // revert on error
    }
  };
  mediaCtlRef.current.toggleLike = toggleLike; // added post-declaration, see mediaCtlRef above

  const cycleRepeat = () => {
    setRepeat(r => r === "none" ? "all" : r === "all" ? "one" : "none");
  };

  const fmt = s => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const anim = useAnimations();

  const ctrlBtn = (onClick, active, children, tooltip) => {
    const btn = (
      <Button
        variant="ghost" isIconOnly
        onPress={onClick}
        className={cn("rounded-full", active ? "text-accent" : "text-secondary hover:text-primary")}
        style={{ contain: "layout style" }}
      >
        {children}
      </Button>
    );
    return tooltip ? <Tooltip text={tooltip}>{btn}</Tooltip> : btn;
  };

  return (
    <div style={{ background: fullscreen ? "rgba(13,13,13,0.6)" : "transparent", backdropFilter: fullscreen ? "blur(20px)" : "none", flexShrink: 0, borderRadius: 0, position: "relative", zIndex: 50, display: "flex", flexDirection: "column", overflow: "visible" }}>
      {/* Seek slider — HeroUI Slider, sits between the content view and the player controls */}
      {/* Left-to-right regardless of layout direction: this is a time axis, and time runs the
          same way for everyone. Elapsed belongs on the left, remaining on the right. */}
      <div dir="ltr" className={cn("seek-band", fullscreen && "seek-fullscreen")} style={{ height: 10, display: "flex", alignItems: "center", padding: fullscreen ? "0" : "0 16px" }}>
        <SliderRoot
          aria-label="Seek"
          value={track ? (seekDrag !== null ? seekDrag : progress) : 0}
          minValue={0}
          maxValue={duration || 1}
          step={0.25}
          isDisabled={!track}
          onChange={(v) => setSeekDrag(v)}
          onChangeEnd={(v) => { const a = audioRef.current; if (a && duration) a.currentTime = v; setSeekDrag(null); }}
          className={cn("player-seek w-full", seekDrag !== null && "seeking")}
        >
          <SliderTrack>
            {/* Buffer fill, behind the played fill. Byte-based, so it maps onto the seconds axis
                only approximately — fine for an indicator, and the same approximation YouTube
                makes. Shown for the whole time a network stream is playing, including once it is
                fully buffered: on a fast line the download finishes before playback even starts,
                so hiding it at 100% meant it was never visible at all. Absent entirely for the
                classic path and local files, where there is genuinely nothing to report. */}
            {track && buffered !== null && !preparing && (
              <div
                className="seek-buffer"
                aria-hidden="true"
                style={{ width: `${Math.max(0, Math.min(1, buffered)) * 100}%` }}
              />
            )}
            {/* Indeterminate sweep for the stretch where there is nothing to measure: the URL is
                still being resolved, so no bytes have moved and no duration is known yet. */}
            {track && preparing && <div className="seek-preparing" aria-hidden="true" />}
            <SliderFill />
            <SliderThumb className="after:hidden! bg-transparent! shadow-none! w-0! min-w-0!" />
          </SliderTrack>
        </SliderRoot>
      </div>
      <div style={{ height: 88, display: "flex", alignItems: "center", padding: fullscreen ? "0 20px 0 16px" : "0 20px 0 0", gap: 16 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, width: 340, minWidth: 0 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "var(--r-xl)", flexShrink: 0, overflow: "hidden", background: "var(--bg-elevated)",
            animation: anim && track ? "coverPop 0.5s cubic-bezier(0.34,1.56,0.64,1)" : "none",
          }}>
            {track?.thumbnail
              ? <img src={thumb(hiResThumb(track.thumbnail, 800))} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", background: track ? "var(--placeholder-gradient)" : "transparent" }} />}
          </div>
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: "var(--t13)", fontWeight: 500, display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Spinner size="sm" />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{t("loading")}</span>
                </span>
              ) : (
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{track?.title}</span>
              )}
              {track?.isExplicit && <ExplicitBadge />}
            </div>
            <div style={{ fontSize: "var(--t11)", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <ArtistLinks
                track={track}
                onOpenArtist={onOpenArtist}
                onBeforeNavigate={() => { if (expanded) onExpandToggle(); }}
              />
            </div>
            <div style={{ fontSize: "var(--t10)", color: "var(--text-muted)", marginTop: 2 }}>
              {track ? `${fmt(progress)} / ${fmt(duration)}` : ""}
            </div>
          </div>
          {/* Like button */}
          <Tooltip text={isLiked ? t("unlike") : t("like")}>
            <Button variant="ghost" isIconOnly onPress={track ? toggleLike : undefined}
              className={cn(isLiked ? "text-accent" : "text-muted hover:text-secondary")}
              style={{ visibility: track ? "visible" : "hidden", contain: "layout style", borderRadius: "var(--r-full)", width: 36, height: 36, minWidth: 36, padding: 0 }}>
              <Heart size={16} weight={isLiked ? "fill" : "regular"}
                style={likePulsing ? { animation: "heartPop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards" } : undefined} />
            </Button>
          </Tooltip>
        </div>

        {/* Transport stays left-to-right even when the app is flipped. These controls refer to
            the timeline, not to the reading order: "previous" is earlier in the song, and every
            player the user knows puts earlier on the left. Mirroring them is a known way to
            make people press the wrong button. Same reasoning as the icon exclusions in
            index.css -- this covers the arrangement, which flexbox would otherwise reverse. */}
        <div dir="ltr" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          {ctrlBtn(() => setShuffle(s => !s), shuffle,
            <Shuffle size={16} />,
            t("shuffle")
          )}
          <Tooltip text={t("scPrev")}>
            <Button
              variant="ghost" isIconOnly isDisabled={!track}
              onPress={() => {
                if (anim) { setPrevBouncing(true); setTimeout(() => setPrevBouncing(false), 400); }
                const audio = audioRef.current;
                // Only "restart current track" when the current track is actually loaded and
                // playing. While a just-selected track is still loading (yt-dlp extraction can
                // take a few seconds, during which the OLD track keeps playing and reporting its
                // high position), currentTime is stale-high — without this guard prev would hit
                // the restart branch and appear to do nothing instead of going to the previous
                // track. During load we're conceptually at the start of the new track → go back.
                if (audio && !loading && audio.currentTime >= 4) {
                  audio.currentTime = 0;
                } else {
                  goAdjacent("prev");
                }
              }}
              className="rounded-xl text-accent shrink-0"
              style={{ contain: "layout style" }}
            >
              <SkipBack size={22} style={prevBouncing ? { animation: "skipLeft 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards" } : undefined} />
            </Button>
          </Tooltip>
          <Button
            variant="primary" isDisabled={!track}
            onPress={track ? togglePlay : undefined}
            className="w-16 h-10 rounded-full shrink-0"
            style={{ contain: "layout style" }}
          >
            {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
          </Button>
          <Tooltip text={t("scNext")}>
            <Button
              variant="ghost" isIconOnly isDisabled={!track}
              onPress={() => { if (anim) { setNextBouncing(true); setTimeout(() => setNextBouncing(false), 400); } goAdjacent("next"); }}
              className="rounded-xl text-accent shrink-0"
              style={{ contain: "layout style" }}
            >
              <SkipForward size={22} style={nextBouncing ? { animation: "skipRight 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards" } : undefined} />
            </Button>
          </Tooltip>
          {ctrlBtn(cycleRepeat, repeat !== "none",
            repeat === "one"
              ? <RepeatOnce size={16} />
              : <Repeat size={16} />,
            repeat === "one" ? t("repeatOne") : repeat === "all" ? t("repeatAll") : t("repeat")
          )}
        </div>

        {/* Right cluster. Width is fixed so the transport in the middle keeps its position
            instead of shifting whenever a control appears or hides. Budget at 36px per icon
            button: volume 112 (icon + slider), five toggles 180, video switch 68, expand +
            fullscreen 72, gaps 16 → ~448. Keep some slack here when adding another control,
            and mind that left (340) + this + transport (224) must stay under the window's
            minWidth in tauri.conf.json. */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, width: 460, justifyContent: "flex-end", lineHeight: 0 }}>
          {/* Volume icon + slider. Left-to-right as a unit: quiet on the left and loud on the
              right is a physical convention, and the speaker belongs beside the quiet end.
              The cluster around it still mirrors, so the whole group moves to the other side
              of the bar -- which is exactly what Spotify does in its Arabic layout. */}
          <div data-volume-area dir="ltr" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tooltip text={volume === 0 ? t("unmute") : t("mute")}>
            <Button variant="ghost" isIconOnly
              onPress={() => {
                const a = audioRef.current;
                if (!a) return;
                const newVol = volume > 0 ? 0 : prevVolumeRef.current;
                a.volume = volCurve(newVol);
              }}
              className={cn("rounded-full", volume === 0 ? "text-muted hover:text-primary" : "text-secondary hover:text-primary")}
              style={{ contain: "layout style" }}>
              {volume === 0
                ? <SpeakerX size={15} />
                : volume < 0.5
                ? <SpeakerLow size={15} />
                : <SpeakerHigh size={15} />
              }
            </Button>
          </Tooltip>
          {/* Volume slider */}
          <div className="vol-band" style={{ width: 70, height: 16, display: "flex", alignItems: "center", flexShrink: 0 }}>
            <SliderRoot
              aria-label="Volume"
              value={volume}
              minValue={0} maxValue={1} step={0.01}
              onChange={(v) => { setVolume(v); if (audioRef.current) audioRef.current.volume = volCurve(v); }}
              onChangeEnd={(v) => { localStorage.setItem("kiyoshi-volume", v); }}
              className="player-vol w-full"
            >
              <SliderTrack>
                <SliderFill />
                <SliderThumb className="after:hidden! bg-transparent! shadow-none! w-0! min-w-0!" />
              </SliderTrack>
            </SliderRoot>
          </div>
          </div>
          {/* Sleep Timer — HeroUI Dropdown */}
          <Dropdown>
            <DropdownTrigger
              title={sleepRemaining !== null ? `${t("sleepTimer")}: ${formatSleepRemaining(sleepRemaining)}` : t("sleepTimer")}
              className={cn("shrink-0 w-9 h-9 rounded-full flex items-center justify-center relative transition-colors duration-150 hover:bg-hover", sleepRemaining !== null ? "text-accent" : "text-secondary hover:text-primary")}
              style={{ contain: "layout style" }}
            >
              <Moon size={15} weight={sleepRemaining !== null ? "fill" : "regular"} />
              {sleepRemaining !== null && (
                <span style={{ position: "absolute", top: 0, right: -2, fontSize: 8, fontWeight: 700, lineHeight: 1, color: "var(--accent)", pointerEvents: "none" }}>●</span>
              )}
            </DropdownTrigger>
            <DropdownPopover placement="top end"
              className="data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-bottom-2 data-[entering]:duration-200 data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:duration-150"
            >
              <div className="px-3 pt-2.5 pb-1 text-t11 font-bold text-muted uppercase tracking-wider">
                {t("sleepTimer")}
              </div>
              <DropdownMenu
                aria-label={t("sleepTimer")}
                className="min-w-44"
                onAction={(key) => { if (key === "off") setSleepTimerEnd(null); else setSleepTimerEnd(Date.now() + Number(key) * 60 * 1000); }}
              >
                <DropdownSection>
                  {[5, 10, 15, 20, 30, 45, 60].map(min => (
                    <DropdownItem key={min} id={String(min)} textValue={`${min} ${t("minutes")}`}>
                      {min} {t("minutes")}
                      {sleepTimerEnd && Math.abs((sleepTimerEnd - Date.now()) / 60000 - min) < 1 && (
                        <Check size={12} className="ml-auto text-accent" />
                      )}
                    </DropdownItem>
                  ))}
                </DropdownSection>
                {sleepRemaining !== null ? (
                  <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                    <DropdownItem id="off" textValue={t("cancelSleepTimer")} className="text-[var(--status-danger)]">
                      <X size={13} />
                      {t("cancelSleepTimer")}
                      <span className="ml-auto text-t12 font-semibold text-accent">{formatSleepRemaining(sleepRemaining)}</span>
                    </DropdownItem>
                  </DropdownSection>
                ) : null}
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>

          {/* More Info dropdown — HeroUI Dropdown */}
          {track && (() => {
            const fetched = fetchedBrowseIds[track?.videoId] || {};
            const albumId = track.albumBrowseId || fetched.albumBrowseId;
            const artistId = track.artistBrowseId || fetched.artistBrowseId;
            const downloaded = cachedSongIds?.has(track.videoId);
            const downloading = downloadingIds?.has(track.videoId);
            return (
              <Dropdown onOpenChange={(open) => { if (open) fetchMoreBrowseIds(); }}>
                <DropdownTrigger
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-150 text-secondary hover:text-primary hover:bg-hover"
                  style={{ contain: "layout style" }}
                >
                  <DotsThreeVertical size={18} />
                </DropdownTrigger>
                <DropdownPopover placement="top end"
                  className="min-w-60 data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-bottom-2 data-[entering]:duration-200 data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:duration-150"
                >
                  <DropdownMenu aria-label="More">
                    {/* Add to Playlist (submenu) + Like */}
                    <DropdownSection>
                      <DropdownItem textValue={t("addToPlaylist")} onAction={() => onAddToPlaylist?.([track])}>
                        <Plus size={14} />
                        {t("addToPlaylist")}
                      </DropdownItem>
                      <DropdownItem textValue={isLiked ? t("unlike") : t("like")} onAction={() => toggleLike()}
                        className={isLiked ? "text-accent" : undefined}>
                        <Heart size={14} weight={isLiked ? "fill" : "regular"} />
                        {isLiked ? t("unlike") : t("like")}
                      </DropdownItem>
                    </DropdownSection>

                    {/* Navigation */}
                    {(albumId || artistId) ? (
                      <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                        {albumId && onOpenAlbum ? (
                          <DropdownItem textValue={t("goToAlbum")} onAction={() => { if (expanded) onExpandToggle(); onOpenAlbum({ browseId: albumId, title: track.album }); }}>
                            <VinylRecord size={14} />
                            {t("goToAlbum")}
                          </DropdownItem>
                        ) : null}
                        {artistId && onOpenArtist ? (
                          <DropdownItem textValue={t("goToArtist")} onAction={() => { if (expanded) onExpandToggle(); onOpenArtist({ browseId: artistId, artist: track.artists }); }}>
                            <Microphone size={14} />
                            {t("goToArtist")}
                          </DropdownItem>
                        ) : null}
                      </DropdownSection>
                    ) : null}

                    {/* Lyrics actions */}
                    <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                      <DropdownItem textValue={t("refetchLyrics")} onAction={() => onRefetchLyrics?.()}>
                        <ArrowClockwise size={14} />
                        {t("refetchLyrics")}
                      </DropdownItem>
                      <DropdownItem textValue={t("importLyrics")} onAction={() => onImportLyrics?.()}>
                        <UploadSimple size={14} />
                        {t("importLyrics")}
                      </DropdownItem>
                      {isCustomLyrics ? (
                        <DropdownItem textValue={t("removeCustomLyrics")} onAction={() => onRemoveCustomLyrics?.()} className="text-[var(--status-danger)]">
                          <Trash size={14} />
                          {t("removeCustomLyrics")}
                        </DropdownItem>
                      ) : null}
                      {/* The on/off toggle now lives on the lyrics view itself, next to the
                          source chip. The language stays here — it is a long list, and a
                          submenu suits it better than a control in the corner. */}
                      {showLyricsTranslation ? (
                        <DropdownSubmenuTrigger>
                          <DropdownItem textValue="Language">
                            <Translate size={14} />
                            {(TRANSLATION_LANGS.find(l => l.code === lyricsTranslationLang)?.name) || lyricsTranslationLang}
                            <DropdownSubmenuIndicator className="ml-auto" />
                          </DropdownItem>
                          {/* Inline height, not max-h-80: HeroUI sizes its popover from the
                              available viewport space, and that wins over the utility class —
                              with 44 entries the menu grew to the full window height. */}
                          <DropdownPopover className="min-w-40 overflow-y-auto scrollable" style={{ maxHeight: 320 }}>
                            <DropdownMenu aria-label="Language">
                              {TRANSLATION_LANGS.map(({ code, name }) => (
                                <DropdownItem key={code} textValue={name} onAction={() => setTranslationLang(code)}
                                  className={lyricsTranslationLang === code ? "text-primary" : "text-secondary"}>
                                  {name}
                                  {lyricsTranslationLang === code && <Check size={12} className="ml-auto text-accent" />}
                                </DropdownItem>
                              ))}
                            </DropdownMenu>
                          </DropdownPopover>
                        </DropdownSubmenuTrigger>
                      ) : null}
                    </DropdownSection>

                    {/* Lyrics Browser — replaces the old per-provider quick-switch list with
                        the dedicated two-pane browser/preview modal. */}
                    <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                      <DropdownItem textValue={t("browseLyrics")} onAction={() => onOpenLyricsBrowser?.()}>
                        <Microphone size={14} />
                        {t("browseLyrics")}
                      </DropdownItem>
                    </DropdownSection>

                    {/* Download / Export */}
                    <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                      {downloaded ? (
                        <DropdownItem textValue={t("downloaded")} isDisabled>
                          <DownloadSimple size={14} />
                          {t("downloaded")}
                        </DropdownItem>
                      ) : downloading ? (
                        <DropdownItem textValue={t("downloading")} isDisabled>
                          <DownloadSimple size={14} />
                          {t("downloading")}
                        </DropdownItem>
                      ) : (
                        <DropdownItem textValue={t("download")} onAction={() => onDownloadSong?.(track)}>
                          <DownloadSimple size={14} />
                          {t("download")}
                        </DropdownItem>
                      )}
                      <DropdownItem textValue={t("saveAsMp3")} onAction={() => onExportSong?.(track, "mp3")}>
                        <MusicNote size={14} />
                        {t("saveAsMp3")}
                      </DropdownItem>
                      <DropdownItem textValue={t("saveAsOpus")} onAction={() => onExportSong?.(track, "opus")}>
                        <MusicNote size={14} />
                        {t("saveAsOpus")}
                      </DropdownItem>
                    </DropdownSection>

                    <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                      <DropdownSubmenuTrigger>
                        <DropdownItem textValue={t("share")}>
                          <ShareNodes size={14} />
                          {t("share")}
                          <DropdownSubmenuIndicator className="ml-auto" />
                        </DropdownItem>
                        <DropdownPopover className="min-w-56">
                          <DropdownMenu aria-label={t("share")}>
                            <DropdownSection>
                              <DropdownItem textValue={t("copyShareLink")}
                                onAction={() => navigator.clipboard.writeText(buildShareLink(track)).then(() => toast.success(t("linkCopied"))).catch(() => {})}>
                                <ShareNodes size={14} />
                                {t("copyShareLink")}
                              </DropdownItem>
                              <DropdownItem textValue={t("copyYtMusicLink")}
                                onAction={() => navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${track.videoId}`).then(() => toast.success(t("linkCopied"))).catch(() => {})}>
                                <Copy size={14} />
                                {t("copyYtMusicLink")}
                              </DropdownItem>
                              <DropdownItem textValue={t("copyYoutubeLink")}
                                onAction={() => navigator.clipboard.writeText(`https://youtube.com/watch?v=${track.videoId}`).then(() => toast.success(t("linkCopied"))).catch(() => {})}>
                                <Copy size={14} />
                                {t("copyYoutubeLink")}
                              </DropdownItem>
                            </DropdownSection>
                          </DropdownMenu>
                        </DropdownPopover>
                      </DropdownSubmenuTrigger>
                    </DropdownSection>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            );
          })()}

          {/* Queue toggle */}
          <Tooltip text={t("queueTooltip")}>
            <Button variant="ghost" isIconOnly onPress={onToggleQueue}
              className={cn("rounded-full", queueOpen ? "text-accent" : "text-secondary hover:text-primary")}
              style={{ contain: "layout style" }}>
              <Queue size={16} />
            </Button>
          </Tooltip>
          {/* Mini player — opens the small always-on-top window */}
          <Tooltip text={t("miniPlayerTooltip")}>
            <Button variant="ghost" isIconOnly onPress={() => { openMiniPlayer().catch(() => {}); }}
              className="rounded-full text-secondary hover:text-primary"
              style={{ contain: "layout style" }}>
              <MiniPlayerEnter size={16} />
            </Button>
          </Tooltip>
          {/* Lyrics toggle */}
          <Tooltip text={t("lyricsTooltip")}>
            <Button variant="ghost" isIconOnly onPress={onToggleLyrics}
              className={cn("rounded-full", (expanded && showLyrics) ? "text-accent" : "text-secondary hover:text-primary")}
              style={{ contain: "layout style" }}>
              <ChatText size={16} />
            </Button>
          </Tooltip>
          {/* Audio/Video switch — a single icon-thumb toggle (own dedicated slot, not squeezed
              between the other icon buttons). Always shown; greyed out + disabled until a
              synced video is actually available for this track. */}
          <div style={{
            marginLeft: 4, marginRight: 4, opacity: videoAvailable ? 1 : 0.35, transition: "opacity 0.2s ease",
            width: 60, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Tooltip text={videoAvailable ? (showVideoView ? t("audioViewTooltip") : t("videoViewTooltip")) : t("videoViewUnavailableTooltip")}>
              {/* HeroUI's largest preset ("lg") still renders a fairly small thumb — scale the
                  whole switch up rather than hand-overriding its internal sizing, since the
                  thumb's checked-position offset is baked into size-specific CSS and would
                  otherwise stop lining up. Icon size is set pre-scale (13 × 1.25 ≈ 16px on screen,
                  matching the other toolbar buttons' 16px icons). */}
              <SwitchRoot
                size="lg"
                isSelected={showVideoView}
                isDisabled={!videoAvailable}
                onChange={(v) => onSetVideoView?.(v)}
                aria-label={t("videoViewTooltip")}
                style={{ transform: "scale(1.25)" }}
              >
                <SwitchControl>
                  <SwitchThumb>
                    {showVideoView ? <ClapperboardPlay size={13} weight="fill" /> : <HeadphonesSimple size={13} weight="fill" />}
                  </SwitchThumb>
                </SwitchControl>
              </SwitchRoot>
            </Tooltip>
          </div>
          {/* Expand toggle — hidden in fullscreen (overlay is always open there) */}
          {!fullscreen && (
            <Button variant="ghost" isIconOnly onPress={onExpandToggle}
              className={cn("rounded-full", expanded ? "text-accent" : "text-secondary hover:text-primary")}
              style={{ contain: "layout style" }}>
              <CaretUp size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)" }} />
            </Button>
          )}
          {/* Fullscreen toggle */}
          <Tooltip text={t("fullscreenTooltip")}>
            <Button variant="ghost" isIconOnly onPress={onToggleFullscreen}
              className={cn("rounded-full", fullscreen ? "text-accent" : "text-secondary hover:text-primary")}
              style={{ contain: "layout style" }}>
              {fullscreen ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
            </Button>
          </Tooltip>

        </div>

      </div>
    </div>
  );
}

function LoginLogo() {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
      <img src="/Kodama%20Logo.png" alt="Kodama" style={{ width: 56, height: 56 }} />
    </div>
  );
}
function LoginBtn({ onClick, children, secondary, disabled }) {
  return (
    <Button
      fullWidth
      variant={secondary ? "secondary" : "solid"}
      color={secondary ? "default" : "accent"}
      isDisabled={disabled}
      className="font-semibold"
      onPress={onClick}
    >
      {children}
    </Button>
  );
}

function LoginScreen({ onSuccess, onCancel, forcedProfileName }) {
  const [step, setStep] = useState("start"); // start | waiting | success | local-create
  const [localName, setLocalName] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const t = useLang();

  useEffect(() => {
    let unlistenComplete, unlistenCancelled;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("login-complete", () => {
        setStep("success");
        setTimeout(() => onSuccess(), 1000);
      }).then(fn => { unlistenComplete = fn; });
      listen("login-cancelled", () => {
        setStep("start");
      }).then(fn => { unlistenCancelled = fn; });
    });
    return () => {
      if (unlistenComplete) unlistenComplete();
      if (unlistenCancelled) unlistenCancelled();
    };
  }, []);

  const startLogin = async () => {
    const name = forcedProfileName || ("account_" + Date.now());
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_login_window", {
        profileName: name,
        confirmLabel: t("loginUseThisAccount"),
        switchHint: t("loginSwitchAccountHint"),
      });
      setStep("waiting");
    } catch (e) {
      console.error("open_login_window failed:", e);
    }
  };

  const cancelLogin = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_login_window");
    } catch {}
    setStep("start");
  };

  const createLocalProfile = async () => {
    const name = localName.trim();
    if (!name) return;
    setLocalLoading(true);
    try {
      const res = await fetch(`${API}/auth/local-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const data = await res.json();
      if (data.ok) {
        setStep("success");
        setTimeout(() => onSuccess(), 1000);
      }
    } catch (e) {
      console.error("local-create failed:", e);
    } finally {
      setLocalLoading(false);
    }
  };

  const Logo = LoginLogo;
  const Btn  = LoginBtn;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
    }}>
      <CardRoot variant="secondary" className="relative gap-0!"
        style={{ width: 420, maxWidth: "92vw", padding: 36, boxShadow: "var(--elevation-4)" }}>
        {onCancel && step !== "waiting" && (
          <Button isIconOnly size="sm" variant="ghost" className="absolute top-3.5 right-3.5 size-7 min-w-0 rounded-full text-muted hover:text-primary" onPress={onCancel}>
            <X size={16} />
          </Button>
        )}
        <Logo />

        {/* ── Start ── */}
        {step === "start" && (
          <>
            <div style={{ fontSize: "var(--t20)", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{forcedProfileName ? t("reauthTitle") : t("welcome")}</div>
            <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)", textAlign: "center", marginBottom: 28, lineHeight: 1.6 }}>
              {forcedProfileName ? t("reauthDesc") : t("loginDesc")}
            </div>
            <Btn onClick={startLogin}>
              {t("loginButton")}
            </Btn>
            {/* Hide "create local profile" for a cancelable re-auth (from settings — it has an X);
                keep it at startup as an escape hatch even when re-auth is targeted. */}
            {!(forcedProfileName && onCancel) && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: "var(--t11)", color: "var(--text-muted)" }}>{t("orSignInWithGoogle") ? t("orSignInWithGoogle").split(" ").slice(-2).join(" ") : "oder"}</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
                <Btn onClick={() => setStep("local-create")} secondary>
                  {t("createLocalProfile")}
                </Btn>
              </>
            )}
            <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
              {t("loginHint")}
            </div>
          </>
        )}

        {/* ── Lokales Profil erstellen ── */}
        {step === "local-create" && (
          <>
            <div style={{ fontSize: "var(--t18)", fontWeight: 700, textAlign: "center", marginBottom: 6 }}>{t("localProfile")}</div>
            <div style={{ fontSize: "var(--t12)", color: "var(--text-muted)", textAlign: "center", marginBottom: 20, lineHeight: 1.6 }}>
              {t("localProfileDesc")}
            </div>
            {/* Vorteile-Panel */}
            <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--r-xl)", padding: "12px 14px", marginBottom: 20, border: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: "var(--t11)", fontWeight: 600, color: "var(--accent)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM8 5.5a1 1 0 110-2 1 1 0 010 2z"/></svg>
                {t("googleBenefits")}
              </div>
              {[
                { icon: "☁️", key: "benefitLibrary" },
                { icon: "🎵", key: "benefitRecommendations" },
                { icon: "📋", key: "benefitPlaylists" },
                { icon: "🔄", key: "benefitSync" },
              ].map(({ icon, key }) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t12)", color: "var(--text-secondary)", marginBottom: 4 }}>
                  <span>{icon}</span> {t(key)}
                </div>
              ))}
            </div>
            <TextFieldRoot
              aria-label={t("profileName")}
              value={localName}
              onChange={setLocalName}
              className="w-full mb-3"
            >
              <InputRoot
                autoFocus
                placeholder={t("profileName")}
                onKeyDown={e => e.key === "Enter" && createLocalProfile()}
              />
            </TextFieldRoot>
            <Btn onClick={createLocalProfile} disabled={!localName.trim() || localLoading}>
              {localLoading ? "..." : t("createProfile")}
            </Btn>
            <div style={{ marginTop: 10 }}>
              <Btn onClick={() => setStep("start")} secondary>{t("cancel")}</Btn>
            </div>
          </>
        )}

        {/* ── Warten ── */}
        {step === "waiting" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div className="flex justify-center" style={{ marginBottom: 20 }}><Spinner size="lg" /></div>
            <div style={{ fontSize: "var(--t15)", fontWeight: 600, marginBottom: 8 }}>{t("loginWaiting")}</div>
            <div style={{ fontSize: "var(--t12)", color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 24 }}>
              {t("loginWaitingDesc")}
            </div>
            <Btn onClick={cancelLogin} secondary>{t("cancel")}</Btn>
          </div>
        )}

        {/* ── Erfolg ── */}
        {step === "success" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
              <CheckCircle size={52} weight="fill" style={{ color: "var(--accent)" }} />
            </div>
            <div style={{ fontSize: "var(--t16)", fontWeight: 600, marginBottom: 6 }}>{t("loginSuccess")}</div>
            <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)" }}>{t("loginSuccessHint")}</div>
          </div>
        )}

      </CardRoot>
    </div>
  );
}


function LanguagePickerScreen({ currentLanguage, onConfirm }) {
  const [selected, setSelected] = useState(currentLanguage);
  const subtitle = translate(selected, "selectLanguage");
  const continueLabel = selected === "de" ? "Weiter" : "Continue";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
      animation: "fadeIn 0.3s ease",
      overflowY: "auto", padding: "20px 0",
    }}>
      <CardRoot variant="secondary" className="flex flex-col gap-0! shrink-0"
        style={{ width: 420, maxWidth: "92vw", padding: 36, maxHeight: "calc(100vh - 40px)", boxShadow: "var(--elevation-4)" }}>
        {/* Logo + heading */}
        <img src="/Kodama%20Logo.png" alt="Kodama" style={{ width: 64, height: 64, alignSelf: "center", marginBottom: 14 }} />
        <div style={{ fontSize: "var(--t20)", fontWeight: 700, textAlign: "center", marginBottom: 6 }}>Kodama</div>
        <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)", textAlign: "center", marginBottom: 24 }}>{subtitle}</div>

        {/* Language rows */}
        <div className="scrollable" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22, overflowY: "auto", minHeight: 0 }}>
          {LANGUAGES.filter(lang => !lang.comingSoon).map(lang => {
            const active = selected === lang.code;
            return (
              <button key={lang.code} onClick={() => setSelected(lang.code)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
                  padding: "13px 14px", borderRadius: "var(--r-xl)", cursor: "default", fontFamily: "var(--font)", textAlign: "left",
                  border: `1.5px solid ${active ? "var(--accent)" : "transparent"}`,
                  background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--bg-elevated)",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "var(--bg-elevated)"; }}
              >
                <div style={{ width: 44, height: 28, borderRadius: "var(--r-md)", overflow: "hidden", flexShrink: 0 }}
                  dangerouslySetInnerHTML={{ __html: lang.flag }} />
                <span style={{ flex: 1, fontSize: "var(--t14)", fontWeight: 500, color: active ? "var(--accent)" : "var(--text-primary)" }}>{lang.label}</span>
                {active && <Check size={15} style={{ color: "var(--accent)" }} />}
              </button>
            );
          })}
        </div>

        <Button color="accent" variant="solid" fullWidth className="font-semibold shrink-0" onPress={() => onConfirm(selected)}>
          {continueLabel} →
        </Button>
      </CardRoot>
    </div>
  );
}

// ─── FFmpeg Setup Screen ──────────────────────────────────────────────────────
function FfmpegSetupScreen({ onDone }) {
  const t = useLang();
  const [phase, setPhase]       = useState("checking"); // checking | needed | downloading | done | error
  const [percent, setPercent]   = useState(0);
  const [mbDone, setMbDone]     = useState(0);
  const [mbTotal, setMbTotal]   = useState(0);
  const [speedKbps, setSpeedKbps] = useState(0);
  const [errMsg, setErrMsg]     = useState("");
  const [fadeOut, setFadeOut]   = useState(false);

  useEffect(() => {
    // Offline → no FFmpeg download possible anyway, skip immediately.
    if (!navigator.onLine) {
      setPhase("done");
      onDone();
      return;
    }

    const check = async (retries = 8) => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 1500); // 1.5s per attempt
        const r = await fetch(`${API}/ffmpeg/status`, { signal: ctrl.signal });
        clearTimeout(tid);
        const d = await r.json();
        if (d.available) {
          // Cache result so we skip this screen on future starts.
          localStorage.setItem("kiyoshi-ffmpeg-ok", "1");
          setFadeOut(true);
          setTimeout(() => { setPhase("done"); onDone(); }, 400);
        } else {
          setPhase("needed");
        }
      } catch {
        if (retries > 0) {
          setTimeout(() => check(retries - 1), 400);
        } else {
          // Backend not reachable after all retries → proceed anyway.
          setPhase("done");
          onDone();
        }
      }
    };
    check();
    // Run ONCE on mount. Depending on `onDone` (a new inline fn each App render) re-ran this
    // mid-download and reset the phase back to "needed" → a second Download click → two
    // parallel downloads. eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startedRef = useRef(false);
  const startDownload = () => {
    if (startedRef.current) return; // guard against a double-trigger → parallel downloads
    startedRef.current = true;
    setPhase("downloading");
    setPercent(0);

    const es = new EventSource(`${API}/ffmpeg/download`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === "progress") {
          setPercent(data.percent || 0);
          setMbDone(data.mb_done || 0);
          setMbTotal(data.mb_total || 0);
          setSpeedKbps(data.speed_kbps || 0);
        } else if (data.status === "done") {
          es.close();
          setPercent(100);
          setPhase("done");
          localStorage.setItem("kiyoshi-ffmpeg-ok", "1");
          // Neustart nach kurzer Pause
          setTimeout(() => {
            import("@tauri-apps/api/core")
              .then(({ invoke }) => invoke("relaunch_app"))
              .catch(() => { onDone(); }); // im Dev-Modus kein relaunch → einfach weiter
          }, 1200);
        } else if (data.status === "error") {
          es.close();
          setErrMsg(data.message || t("ffmpegUnknownError"));
          setPhase("error");
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      setErrMsg(t("ffmpegConnectionLost"));
      setPhase("error");
    };
  };

  if (phase === "done") return null;

  const fmtSpeed = (kbps) => kbps > 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps} KB/s`;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: phase === "checking" ? 9997 : 9998,
      background: "#0d0d0d",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      opacity: fadeOut ? 0 : 1, transition: "opacity 0.4s ease",
      fontFamily: "var(--font)",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", width: 320, height: 320, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(238,168,255,0.12) 0%, rgba(255,0,140,0.06) 55%, transparent 72%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: 360 }}>
        {/* Logo */}
        <img src="/Kodama%20Logo.png" alt="Kodama" width="56" height="56" style={{ filter: "drop-shadow(0 0 20px rgba(238,168,255,0.4))" }} />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            {phase === "checking"    && "Kodama"}
            {phase === "needed"      && t("ffmpegSetupTitle")}
            {phase === "downloading" && t("ffmpegDownloadingTitle")}
            {phase === "error"       && t("ffmpegErrorTitle")}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, maxWidth: 300 }}>
            {phase === "checking" && t("ffmpegLoading")}
            {phase === "needed" && t("ffmpegNeededDesc")}
            {phase === "downloading" && mbTotal > 0 && `${mbDone} / ${mbTotal} MB · ${fmtSpeed(speedKbps)}`}
            {phase === "error" && errMsg}
          </div>
        </div>

        {/* Progress bar */}
        {phase === "downloading" && (
          <ProgressBar aria-label="FFmpeg download" value={percent} className="w-full gap-0!">
            <ProgressBarTrack className="h-1!"><ProgressBarFill /></ProgressBarTrack>
          </ProgressBar>
        )}

        {/* Buttons */}
        {phase === "needed" && (
          <div style={{ display: "flex", gap: 12, width: "100%" }}>
            <Button
              variant="ghost"
              className="text-white/55 hover:text-white"
              style={{ flex: 1 }}
              onPress={() => { setFadeOut(true); setTimeout(() => { setPhase("done"); onDone(); }, 400); }}
            >{t("ffmpegSkip")}</Button>
            <Button
              color="accent"
              variant="solid"
              className="font-semibold"
              style={{ flex: 2 }}
              onPress={startDownload}
            >{t("ffmpegDownload")}</Button>
          </div>
        )}

        {phase === "error" && (
          <Button
            fullWidth
            variant="ghost"
            className="text-white/65 hover:text-white"
            onPress={() => { setFadeOut(true); setTimeout(() => { setPhase("done"); onDone(); }, 400); }}
          >{t("ffmpegStartAnyway")}</Button>
        )}
      </div>
    </div>
  );
}

// Inline FFmpeg version + update control for the Update settings tab. Checks gyan.dev on mount
// and lets the user update in place (same force-download as the banner).
function FfmpegUpdateBanner({ installed, latest, onClose }) {
  const t = useLang();
  const [phase, setPhase] = useState("offer"); // offer | downloading | done | error

  const [percent, setPercent] = useState(0);

  const dismiss = () => {
    try { localStorage.setItem("kiyoshi-ffmpeg-update-dismissed", latest || ""); } catch {}
    onClose();
  };

  const startUpdate = () => {
    setPhase("downloading");
    setPercent(0);
    const es = new EventSource(`${API}/ffmpeg/download?force=1`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === "progress") setPercent(data.percent || 0);
        else if (data.status === "done") {
          es.close(); setPercent(100); setPhase("done");
          try { localStorage.setItem("kiyoshi-ffmpeg-update-dismissed", latest || ""); } catch {}
          setTimeout(onClose, 2400);
        } else if (data.status === "error") { es.close(); setPhase("error"); }
      } catch {}
    };
    es.onerror = () => { es.close(); setPhase("error"); };
  };

  return createPortal(
    <div style={{ position: "fixed", left: "50%", bottom: 124, transform: "translateX(-50%)", zIndex: 9990 }}
      className="animate-[pillRiseIn_0.3s_cubic-bezier(0.22,1,0.36,1)]">
      <div className="flex items-center gap-3 pl-4 pr-2.5 py-2.5 rounded-2xl bg-elevated border-[0.5px] border-border shadow-[0_10px_40px_rgba(0,0,0,0.55)] w-[400px] max-w-[calc(100vw-32px)]">
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${phase === "error" ? "bg-[rgba(255,112,112,0.16)] text-[var(--status-danger)]" : "bg-accent-dim text-accent"}`}>
          {phase === "done" ? <CheckCircle size={18} weight="fill" /> : <ArrowClockwise size={16} weight="bold" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-t13 font-semibold text-primary">
            {phase === "done" ? t("ffmpegUpdated") : phase === "error" ? t("ffmpegUpdateFailed") : t("ffmpegUpdateAvailable")}
          </div>
          {phase === "downloading"
            ? <ProgressBar aria-label="FFmpeg update" value={percent} className="mt-1.5 gap-0!"><ProgressBarTrack className="h-[3px]!"><ProgressBarFill /></ProgressBarTrack></ProgressBar>
            : <div className="text-t11 text-secondary truncate">{phase === "error" ? t("ffmpegConnectionLost") : installed ? `${installed} → ${latest}` : latest}</div>}
        </div>
        {phase === "offer" && (<>
          <Button color="accent" variant="solid" size="sm" className="shrink-0" onPress={startUpdate}>{t("ffmpegUpdate")}</Button>
          <Button variant="ghost" size="sm" isIconOnly className="shrink-0 rounded-full text-muted" onPress={dismiss}><X size={14} weight="bold" /></Button>
        </>)}
        {phase === "error" && (
          <Button variant="ghost" size="sm" isIconOnly className="shrink-0 rounded-full text-muted" onPress={onClose}><X size={14} weight="bold" /></Button>
        )}
      </div>
    </div>,
    document.body
  );
}

function SplashScreen({ fading }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0d0d0d",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: fading ? "splashFadeOut 0.45s ease forwards" : "none",
      pointerEvents: "none",
    }}>
      <style>{`@keyframes kodamaPulse{0%,100%{transform:scale(0.92);opacity:.7}50%{transform:scale(1.06);opacity:1}}`}</style>
      <img src="/Kodama%20Logo.png" alt="Kodama" width="96" height="96"
        style={{ animation: "kodamaPulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

// Ambient app-wide backdrop: the playing track's heavily-blurred cover. New covers are
// preloaded, then stacked on top and faded in (crossfade); once a layer has fully faded in
// the layers beneath it are pruned. Passing thumbnail={null} clears it with no flash.
function AmbientBackdrop({ thumbnail }) {
  const [layers, setLayers] = useState([]);
  const idRef = useRef(0);
  const curUrlRef = useRef(null);

  useEffect(() => {
    const url = thumbnail ? thumb(thumbnail) : null;
    if (url === curUrlRef.current) return;
    curUrlRef.current = url;
    if (!url) { setLayers([]); return; }
    const key = ++idRef.current;
    const img = new Image();
    img.onload = () => setLayers(prev => [...prev, { key, url }].slice(-3));
    img.src = url;
  }, [thumbnail]);

  if (layers.length === 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      {layers.map((layer) => (
        <div
          key={layer.key}
          onAnimationEnd={() => setLayers(prev => {
            const idx = prev.findIndex(l => l.key === layer.key);
            return idx <= 0 ? prev : prev.slice(idx);
          })}
          style={{ position: "absolute", inset: 0, animation: "ambientFade 0.9s ease-out forwards" }}
        >
          <div style={{
            position: "absolute", inset: "-10%",
            backgroundImage: `url(${layer.url})`,
            backgroundSize: "cover", backgroundPosition: "center",
            filter: "blur(70px) saturate(1.5) brightness(0.9)", transform: "scale(1.2)",
          }} />
          <div style={{ position: "absolute", inset: 0, background: "var(--bg-base)", opacity: 0.45 }} />
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  // Skip FFmpeg screen if we already confirmed it available in a previous run.
  const [ffmpegSetupDone, setFfmpegSetupDone] = useState(
    () => localStorage.getItem("kiyoshi-ffmpeg-ok") === "1"
  );
  // Background check: offer an FFmpeg update when gyan.dev has a newer release than installed.
  const [ffmpegUpdate, setFfmpegUpdate] = useState(null); // null | { installed, latest }
  useEffect(() => {
    if (!ffmpegSetupDone || !navigator.onLine) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const d = await fetch(`${API}/ffmpeg/check-update`).then(r => r.json());
        if (cancelled || !d.updateAvailable) return;
        if (localStorage.getItem("kiyoshi-ffmpeg-update-dismissed") === d.latest) return;
        setFfmpegUpdate({ installed: d.installed, latest: d.latest });
      } catch {}
    }, 6000); // defer so it never competes with startup work
    return () => { cancelled = true; clearTimeout(tid); };
  }, [ffmpegSetupDone]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 1700);
    const hideTimer = setTimeout(() => setShowSplash(false), 2150);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  const [view, setView] = useState("home");
  const [navHistory, setNavHistory] = useState([]); // navigation history stack for back button
  const [appKey, setAppKey] = useState(0); // increment to force full re-render
  const [switchingTo, setSwitchingTo] = useState(null); // profile being switched to → loading overlay
  const [viewRefreshKey, setViewRefreshKey] = useState(0); // increment to refresh current view
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem("kiyoshi-sidebar-width"), 10);
    return Number.isFinite(saved) ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, saved)) : SIDEBAR_EXPANDED;
  });
  const [sidebarResizing, setSidebarResizing] = useState(false);

  // Drag-to-resize the expanded sidebar. Width is clamped and persisted.
  const startSidebarResize = useCallback((e) => {
    e.preventDefault();
    setSidebarResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      // Sidebar hugs the inline start, which is the window's left edge in LTR and its right
      // edge in RTL. Measure from that edge rather than from x=0, or the drag runs backwards
      // once the layout is flipped.
      const x = isRtl() ? window.innerWidth - ev.clientX : ev.clientX;
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, x - 4));
      setSidebarWidth(w);
    };
    const onUp = () => {
      setSidebarResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setSidebarWidth(w => { localStorage.setItem("kiyoshi-sidebar-width", String(w)); return w; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // Drag-to-resize the queue panel (docked right; handle sits on its left edge).
  const [queueWidth, setQueueWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem("kiyoshi-queue-width"), 10);
    return Number.isFinite(saved) ? Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, saved)) : QUEUE_DEFAULT;
  });
  const [queueResizing, setQueueResizing] = useState(false);
  const startQueueResize = useCallback((e) => {
    e.preventDefault();
    setQueueResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      // Panel is docked at the inline end, 8px in from that edge; width is the distance from
      // the edge to the cursor. Which edge that is depends on the layout direction.
      const fromEnd = isRtl() ? ev.clientX : window.innerWidth - ev.clientX;
      const w = Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, fromEnd - 8));
      setQueueWidth(w);
    };
    const onUp = () => {
      setQueueResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setQueueWidth(w => { localStorage.setItem("kiyoshi-queue-width", String(w)); return w; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  const [globalContextMenu, setGlobalContextMenu] = useState(null); // { x, y, playlist }
  const [pinnedIds, setPinnedIds] = useState([]);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [createPlaylistForSelection, setCreatePlaylistForSelection] = useState(false);
  const [createPlaylistTracks, setCreatePlaylistTracks] = useState(null); // tracks to add to the freshly created playlist (from "Add to playlist ▸ New playlist")
  const [selectedTracks, setSelectedTracks] = useState(new Map()); // videoId → track
  const [selectionPlaylistOpen, setSelectionPlaylistOpen] = useState(false);

  const toggleTrackSelection = useCallback((track) => {
    setSelectedTracks(prev => {
      const next = new Map(prev);
      if (next.has(track.videoId)) next.delete(track.videoId);
      else next.set(track.videoId, track);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedTracks(new Map()), []);
  const selectAllTracks = useCallback((tracks, allSelected) => {
    if (allSelected) {
      setSelectedTracks(new Map());
    } else {
      setSelectedTracks(new Map(tracks.map(tr => [tr.videoId, tr])));
    }
  }, []);
  const [trackContextMenu, setTrackContextMenu] = useState(null); // { x, y, track, playlistId? }
  const [addToPlaylistFor, setAddToPlaylistFor] = useState(null); // { tracks: [...] } — opens the add-to-playlist modal
  const [renameDialog, setRenameDialog] = useState(null); // { playlistId, title }
  const [deleteDialog, setDeleteDialog] = useState(null); // { playlistId, title }
  const [cachedSongIds, setCachedSongIds] = useState(new Set());
  const [likedIds, setLikedIds] = useState(new Set());
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const [premiumSongIds, setPremiumSongIds] = useState(new Set());
  const [offlineMode, setOfflineMode] = usePersistedState("kiyoshi-offline", false);
  const [isActuallyOffline, setIsActuallyOffline] = useState(() => !navigator.onLine);
  const [debugFloat, setDebugFloat] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState([]); // [{videoId, title, artists, thumbnail, status, progress}]
  const [downloadBatches, setDownloadBatches] = useState([]); // [{id, title, thumbnail, artists, videoIds[], completedCount, errorCount}]
  const [pendingDownloadQueue, setPendingDownloadQueue] = useState([]); // tracks waiting for a free slot
  const [downloadQueueMin, setDownloadQueueMin] = useState(false); // download queue card minimized
  const [updateInfo, setUpdateInfo] = useState(null);     // { version, changelog, releasedAt, _update }
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const updateDownloadAbortRef = useRef(null);
  const mutePrevVolumeRef = useRef(0.5);

  // ─── Toast Notifications (HeroUI toast system) ───────────────────────────────
  // Thin wrapper so all existing addToast(message, type) call sites keep working.
  const addToast = useCallback((message, type = "info") => {
    if (type === "error") toast.danger(message, { timeout: 6000 });
    else if (type === "success") toast.success(message, { timeout: 3500 });
    else toast(message, { timeout: 3500 });
  }, []);

  // ─── Update Check (Tauri plugin-updater) ────────────────────────────────────
  // showFeedback=true: show toasts on "up to date" and on error (manual check)
  // showFeedback=false (default): silent — only sets updateInfo if update is found (startup)
  const checkForUpdates = useCallback(async (showFeedback = false) => {
    const lang = localStorage.getItem("kiyoshi-lang") || "de";
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        setUpdateInfo({
          version: update.version,
          changelog: update.body || "",
          releasedAt: update.date || null,
          _update: update,
        });
      } else {
        setUpdateInfo(null);
        if (showFeedback) addToast(translate(lang, "upToDate"), "info");
      }
    } catch (e) {
      console.error("[Updater] check failed:", e);
      if (showFeedback) addToast(translate(lang, "updateCheckFailed"), "error");
    }
  }, [addToast]);

  const downloadUpdate = useCallback(async () => {
    if (!updateInfo?._update) return;
    setUpdateDownloading(true);
    setUpdateDownloadProgress(0);
    setUpdateDownloaded(false);
    try {
      let downloaded = 0;
      let total = 0;
      await updateInfo._update.download(event => {
        if (event.event === "Started")  total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength ?? 0;
          setUpdateDownloadProgress(total > 0 ? Math.round((downloaded / total) * 100) : null);
        }
        if (event.event === "Finished") setUpdateDownloadProgress(100);
      });
      setUpdateDownloaded(true);
    } catch (e) {
      // Surface the real error — a generic toast made the macOS "download ok, then fails"
      // reports impossible to diagnose. Full error to the console, message text to the user.
      console.error("[Updater] download failed:", e);
      const lang = getInitialLang();
      addToast(`${translate(lang, "downloadFailed")}: ${e?.message || e}`, "error");
      setUpdateDownloadProgress(null);
    } finally {
      setUpdateDownloading(false);
    }
  }, [updateInfo, addToast]);

  const installUpdate = useCallback(async () => {
    if (!updateInfo?._update) return;
    try {
      // Stop the Python backend before the installer runs, otherwise it holds file
      // locks (Windows) and the installation fails.
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_server_cmd").catch(() => {});
      await updateInfo._update.install();
      // Restart via our own Rust command (app.restart()), NOT plugin-process relaunch():
      // that plugin needs a process:* capability permission which isn't granted, so it threw
      // right after a successful install. On Windows the passive NSIS installer self-restarts
      // and hid this; on macOS relaunch() is the only restart path, so the update "failed"
      // despite installing. This is the same command the FFmpeg setup flow already uses.
      await invoke("relaunch_app");
    } catch (e) {
      // install() is a distinct failure stage from download() — label it as such and show the
      // real error, so a macOS install failure (e.g. bundle-replace / translocation) is visible
      // instead of masquerading as a download failure.
      console.error("[Updater] install failed:", e);
      const lang = getInitialLang();
      addToast(`${translate(lang, "updateInstallFailed") || "Update installation failed"}: ${e?.message || e}`, "error");
    }
  }, [updateInfo, addToast]);

  const cancelUpdateDownload = useCallback(() => {
    // plugin-updater hat keinen Abort — State zurücksetzen reicht
    setUpdateDownloading(false);
    setUpdateDownloadProgress(null);
    setUpdateDownloaded(false);
  }, []);

  useEffect(() => {
    checkForUpdates();
    startAudioLevels();
  }, []);

  // Unified item ID — playlists use playlistId, albums use browseId
  const itemId = (item) => item?.playlistId || item?.browseId || null;
  const profileKey = (base) => `${base}-${window.__activeProfile || "default"}`;

  const togglePin = useCallback((pl) => {
    const stored = (() => { try { return JSON.parse(localStorage.getItem(profileKey("kiyoshi-pinned")) || "[]"); } catch { return []; } })();
    const id = itemId(pl);
    const already = stored.find(p => itemId(p) === id);
    const next = already ? stored.filter(p => itemId(p) !== id) : [pl, ...stored];
    localStorage.setItem(profileKey("kiyoshi-pinned"), JSON.stringify(next));
    setPinnedIds(next.map(p => itemId(p)));
    window.dispatchEvent(new Event("kiyoshi-pins-updated"));
  }, []);

  const openContextMenu = useCallback((e, pl) => {
    e.preventDefault();
    setGlobalContextMenu({ x: e.clientX, y: e.clientY, playlist: pl });
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);

  // ── News feed + bug report ──────────────────────────────────────────────────
  const [newsItems, setNewsItems] = useState([]);
  const [newsSeenIds, setNewsSeenIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("kiyoshi-news-seen") || "[]")); }
    catch { return new Set(); }
  });
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsUnreadSnapshot, setNewsUnreadSnapshot] = useState(() => new Set());
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackShot, setFeedbackShot] = useState(null);
  // Capture the app window first (so the screenshot shows the app, not the report form),
  // then open the dialog. Small delay lets the dropdown menu close before the capture.
  const openFeedback = useCallback(async () => {
    let shot = null;
    try {
      await new Promise(r => setTimeout(r, 180));
      const { invoke } = await import("@tauri-apps/api/core");
      shot = await invoke("capture_screenshot");
    } catch { shot = null; }
    setFeedbackShot(shot);
    setFeedbackOpen(true);
  }, []);
  const lastNewsLoadRef = useRef(0);
  const loadNews = useCallback(async () => {
    lastNewsLoadRef.current = Date.now();
    // Prefer the remote feed (live publishing); fall back to the backend's bundled copy
    // (dev/offline) so news still shows when the remote isn't reachable.
    let items = null;
    try { const r = await fetch(NEWS_URL, { cache: "no-cache" }); if (r.ok) items = await r.json(); } catch {}
    if (!Array.isArray(items) || items.length === 0) {
      try { const r2 = await fetch(`${API}/news`); if (r2.ok) items = await r2.json(); } catch {}
    }
    if (!Array.isArray(items)) return;
    // Keep only entries whose version range covers this build (min_version / max_version).
    setNewsItems(items.filter(n => n && n.id
      && (!n.min_version || cmpVersion(APP_VERSION, n.min_version) >= 0)
      && (!n.max_version || cmpVersion(APP_VERSION, n.max_version) <= 0)));
  }, []);
  useEffect(() => {
    loadNews();
    sendHeartbeat(); // anonymous, opt-out, at most once/day — see analytics/
    // Re-check periodically + when the window regains focus, so newly published news shows up
    // without restarting the app (the raw GitHub feed is CDN-cached ~5 min anyway).
    const interval = setInterval(loadNews, 15 * 60 * 1000);
    const onFocus = () => { if (Date.now() - lastNewsLoadRef.current > 5 * 60 * 1000) loadNews(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [loadNews]);
  const newsUnreadCount = newsItems.reduce((n, it) => n + (newsSeenIds.has(it.id) ? 0 : 1), 0);
  // Auto-open once on startup if there's an unread entry flagged important.
  const newsAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (newsAutoOpenedRef.current || !newsItems.length) return;
    const importantUnread = newsItems.some(it => it.important && !newsSeenIds.has(it.id));
    if (importantUnread) { newsAutoOpenedRef.current = true; openNews(); }
  }, [newsItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const openNews = useCallback(() => {
    setNewsUnreadSnapshot(new Set(newsItems.filter(it => !newsSeenIds.has(it.id)).map(it => it.id)));
    setNewsOpen(true);
    const allIds = newsItems.map(it => it.id);
    setNewsSeenIds(new Set(allIds));
    localStorage.setItem("kiyoshi-news-seen", JSON.stringify(allIds));
  }, [newsItems, newsSeenIds]);
  const [settingsTab, setSettingsTab] = useState("darstellung");
  // Scroll-spy for the settings sub-nav lives in an external store (see setSettingsSectionStore)
  // so it never re-renders App. Clicking a sub-entry just scrolls; the content observer updates
  // the store, and only the sidebar subscribes.
  const selectSettingsSection = useCallback((id) => {
    lockSettingsSection();
    setSettingsSectionStore(id);
    document.getElementById("set-sec-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const [settingsInitialTab, setSettingsInitialTab] = useState(null);
  const closeSettings = useCallback(() => {
    setSettingsClosing(true);
    setTimeout(() => { setSettingsOpen(false); setSettingsClosing(false); }, 240);
  }, []);
  const [accent, setAccent] = useState(() => {
    const saved = localStorage.getItem("kiyoshi-accent");
    if (saved) document.documentElement.style.setProperty("--accent", saved);
    return saved || "#e040fb";
  });
  const [theme, setTheme] = usePersistedState("kiyoshi-theme", "dark");
  const [highContrast, setHighContrast] = useState(() => {
    const hc = localStorage.getItem("kiyoshi-high-contrast") === "true";
    if (hc) document.documentElement.setAttribute("data-highcontrast", "true");
    return hc;
  });
  // Right-to-left layout, experimental. Kodama has never been laid out for it: roughly 190
  // places in src/ fix a side outright (81 absolutely positioned left/right, 75 Tailwind
  // ml-/mr-/pl-/pr-, the rest inline styles). Setting dir on the root is what makes those
  // show themselves, so this switch is the measuring instrument for the work, not the work.
  const [rtlLayout, setRtlLayout] = useState(() => {
    const on = localStorage.getItem("kiyoshi-rtl-layout") === "true";
    if (on) document.documentElement.setAttribute("dir", "rtl");
    return on;
  });
  const handleRtlLayoutChange = useCallback((on) => {
    setRtlLayout(on);
    localStorage.setItem("kiyoshi-rtl-layout", String(on));
    // Explicit ltr rather than removing the attribute: some of the app sets dir on subtrees
    // (lyrics lines pick their own direction), and an inherited value is easier to reason
    // about than an absent one.
    document.documentElement.setAttribute("dir", on ? "rtl" : "ltr");
  }, []);

  const [appFont, setAppFont] = useState(() => {
    const saved = localStorage.getItem("kiyoshi-app-font") || "default";
    if (saved === "dyslexic") document.documentElement.style.setProperty("--font", "'OpenDyslexic', system-ui, sans-serif");
    return saved;
  });
  const handleAppFontChange = useCallback((id) => {
    setAppFont(id);
    localStorage.setItem("kiyoshi-app-font", id);
    if (id === "dyslexic") {
      document.documentElement.style.setProperty("--font", "'OpenDyslexic', system-ui, sans-serif");
    } else {
      document.documentElement.style.setProperty("--font", "'MiSans Latin', system-ui, sans-serif");
    }
  }, []);
  const [ambientVisualizer, setAmbientVisualizer] = usePersistedState("kiyoshi-ambient-visualizer", true);
  const [instrumentalViz, setInstrumentalViz] = usePersistedState("kiyoshi-instrumental-viz", true);
  const instrumentalVizRef = useRef(instrumentalViz); instrumentalVizRef.current = instrumentalViz;
  const [vizConfig, setVizConfig] = useState(() => {
    try { return { ...VIZ_DEFAULTS, ...JSON.parse(localStorage.getItem("kiyoshi-visualizer-config") || "{}") }; }
    catch { return { ...VIZ_DEFAULTS }; }
  });
  const updateViz = useCallback((patch) => setVizConfig((c) => {
    const next = { ...c, ...patch };
    localStorage.setItem("kiyoshi-visualizer-config", JSON.stringify(next));
    return next;
  }), []);
  const [ambientBackground, setAmbientBackground] = usePersistedState("kiyoshi-ambient-bg", false);
  const [flashbang, setFlashbang] = useState(false);
  const lightClickRef = useRef({ count: 0, lastTime: 0 });

  const [accentDynamic, setAccentDynamic] = usePersistedState("kiyoshi-accent-dynamic", false);
  const [accentSat, setAccentSat] = usePersistedState("kiyoshi-accent-sat", 0.5);
  const [accentLight, setAccentLight] = usePersistedState("kiyoshi-accent-light", 0.6);

  const handleAccentChange = useCallback((color) => {
    setAccent(color);
    if (!accentDynamic) document.documentElement.style.setProperty("--accent", color);
    localStorage.setItem("kiyoshi-accent", color);
  }, [accentDynamic]);

  const handleThemeChange = useCallback((t) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    if (t === "light") {
      const now = Date.now();
      if (now - lightClickRef.current.lastTime < 700) {
        lightClickRef.current.count++;
        if (lightClickRef.current.count >= 4) {
          lightClickRef.current.count = 0;
          setFlashbang(true);
        }
      } else {
        lightClickRef.current.count = 1;
      }
      lightClickRef.current.lastTime = now;
    } else {
      lightClickRef.current.count = 0;
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [discordRpc, setDiscordRpc] = usePersistedState("kiyoshi-discord-rpc", true);
  // Which field drives Discord's compact member-list status line (like PreMiD's "Pick Status
  // Display"): "song" (title) / "artist" / "app" (the fixed "Kodama" app name).
  const [discordStatusDisplay, setDiscordStatusDisplay] = usePersistedState("kiyoshi-discord-status-display", "song");
  // Opt-in (default off): register plays in the account's actual YT Music watch history
  // (via ytmusicapi's playbackTracking ping) so they count toward YT Music's own Recap/stats
  // — separate from Kodama's own local History list, which always works regardless of this.
  const [ytmusicHistorySync, setYtmusicHistorySync] = usePersistedState("kiyoshi-ytmusic-history-sync", false);

  // Dynamic accent: when enabled, derive --accent live from the current cover; otherwise
  // fall back to the fixed accent. Re-runs whenever the track or the mode changes.
  useEffect(() => {
    if (!accentDynamic) { document.documentElement.style.setProperty("--accent", accent); return; }
    const url = currentTrack?.thumbnail ? thumb(currentTrack.thumbnail) : null;
    if (!url) { document.documentElement.style.setProperty("--accent", accent); return; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      // Both failure paths used to fall back in silence, so a broken dynamic accent looked
      // exactly like a disabled one — which is how the missing accentFadeRaf stayed hidden.
      // They log now; the console ring feeds the Debug tab.
      try {
        setAccentSmooth(vibrantAccentFromImage(img, accentSat, accentLight));
      } catch (e) {
        console.warn("[accent] deriving from cover failed, keeping the fixed accent:", e?.message || e);
        document.documentElement.style.setProperty("--accent", accent);
      }
    };
    img.onerror = () => {
      if (cancelled) return;
      console.warn("[accent] cover failed to load for accent extraction:", url);
      document.documentElement.style.setProperty("--accent", accent);
    };
    img.src = url;
    return () => { cancelled = true; };
  }, [accentDynamic, currentTrack?.thumbnail, accent, accentSat, accentLight]);

  // ─── Usage stats: total app usage time + total song playtime (persisted, global) ───
  const usageSecRef = useRef(Number(localStorage.getItem("kiyoshi-total-usage") || 0));
  const playtimeSecRef = useRef(Number(localStorage.getItem("kiyoshi-total-playtime") || 0));
  // App usage: count seconds while the window is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        usageSecRef.current += 1;
        if (usageSecRef.current % 30 === 0) localStorage.setItem("kiyoshi-total-usage", String(usageSecRef.current));
      }
    }, 1000);
    const flush = () => localStorage.setItem("kiyoshi-total-usage", String(usageSecRef.current));
    window.addEventListener("beforeunload", flush);
    return () => { flush(); clearInterval(id); window.removeEventListener("beforeunload", flush); };
  }, []);
  // Song playtime: count seconds while actually playing.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      playtimeSecRef.current += 1;
      if (playtimeSecRef.current % 15 === 0) localStorage.setItem("kiyoshi-total-playtime", String(playtimeSecRef.current));
    }, 1000);
    return () => { localStorage.setItem("kiyoshi-total-playtime", String(playtimeSecRef.current)); clearInterval(id); };
  }, [isPlaying]);

  // ─── Last.fm scrobbling ──────────────────────────────────────────────────────
  const lastfmConnectedRef = useRef(false);
  const scrobbleRef = useRef({ videoId: null, played: 0, scrobbled: false, startTs: 0 });
  const lfmMeta = (tr) => ({
    artist: (tr?.artists || "").replace(/\s*-\s*Topic$/i, "").trim(),
    track: (tr?.title || "").trim(),
    album: tr?.album || "",
    duration: parseDurationToSeconds(tr?.duration) || 0,
  });
  const lfmPost = (path, body) => {
    if (!lastfmConnectedRef.current) return;
    fetch(`${API}/lastfm/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  };
  const refreshLastfm = useCallback(() => {
    fetch(`${API}/lastfm/status`).then(r => r.json()).then(d => { lastfmConnectedRef.current = !!d.connected; }).catch(() => {});
  }, []);
  useEffect(() => {
    refreshLastfm();
    const h = () => refreshLastfm();
    window.addEventListener("lastfm-changed", h);
    window.addEventListener("profile-switched", h);
    return () => { window.removeEventListener("lastfm-changed", h); window.removeEventListener("profile-switched", h); };
  }, [refreshLastfm]);
  // On track change → reset scrobble state + send Now Playing.
  useEffect(() => {
    const vid = currentTrack?.videoId;
    if (!vid) { scrobbleRef.current = { videoId: null, played: 0, scrobbled: false, startTs: 0 }; return; }
    scrobbleRef.current = { videoId: vid, played: 0, scrobbled: false, startTs: Math.floor(Date.now() / 1000) };
    const m = lfmMeta(currentTrack);
    if (m.artist && m.track) lfmPost("now-playing", m);
  }, [currentTrack?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Accumulate listening seconds while playing; scrobble once past the threshold.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const st = scrobbleRef.current;
      if (!st.videoId || st.scrobbled) return;
      st.played += 1;
      const m = lfmMeta(currentTrack);
      if (m.duration < 30) return; // Last.fm: don't scrobble tracks under 30s
      const threshold = Math.min(m.duration / 2, 240); // >50% or >4min
      if (st.played >= threshold && m.artist && m.track) {
        st.scrobbled = true;
        lfmPost("scrobble", { ...m, timestamp: st.startTs });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, currentTrack?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── YT Music history sync (opt-in) ──────────────────────────────────────────
  // Registers the play in the account's real YT Music watch history (backend pings the
  // playbackTracking URL from ytmusicapi's get_song), so it counts toward YT Music's own
  // Recap/stats — separate from, and independent of, Kodama's own local History list.
  // Same accumulate-then-fire-once threshold as Last.fm scrobbling above, reusing the same
  // "counts as played" definition rather than inventing a second one.
  const ytHistoryRef = useRef({ videoId: null, played: 0, sent: false });
  useEffect(() => {
    ytHistoryRef.current = { videoId: currentTrack?.videoId || null, played: 0, sent: false };
  }, [currentTrack?.videoId]);
  useEffect(() => {
    if (!ytmusicHistorySync || !isPlaying) return;
    const id = setInterval(() => {
      const st = ytHistoryRef.current;
      if (!st.videoId || st.sent) return;
      st.played += 1;
      const duration = parseDurationToSeconds(currentTrack?.duration) || 0;
      if (duration < 30) return;
      const threshold = Math.min(duration / 2, 240); // >50% or >4min
      if (st.played >= threshold) {
        st.sent = true;
        fetch(`${API}/ytmusic/history`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: st.videoId }),
        }).catch(() => {});
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ytmusicHistorySync, isPlaying, currentTrack?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [closeTray, setCloseTray] = usePersistedState("kiyoshi-close-tray", true);
  useEffect(() => {
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_close_to_tray", { enabled: closeTray }).catch(() => {}));
  }, []);

  const [obsEnabled,   setObsEnabled]   = usePersistedState("kiyoshi-obs-enabled", false);
  const [obsPort,      setObsPort]      = useState(() => parseInt(localStorage.getItem("kiyoshi-obs-port") || "9848", 10));
  const [obsPortInput, setObsPortInput] = useState(() => localStorage.getItem("kiyoshi-obs-port") || "9848");


  // Sync the active overlay document (v2) to the backend on mount, so OBS shows
  // the right thing after an app/server restart even before the editor is opened.
  // Prefers the editor's saved v2 doc; falls back to migrating the legacy v1 config.
  useEffect(() => {
    let doc = null;
    try {
      const v2 = JSON.parse(localStorage.getItem("kiyoshi-overlay-doc"));
      if (v2 && v2.version === 2 && Array.isArray(v2.layers)) doc = v2;
    } catch {}
    if (!doc) {
      try { doc = normalizeOverlayDoc(JSON.parse(localStorage.getItem("kiyoshi-obs-config"))); }
      catch { doc = normalizeOverlayDoc(null); }
    }
    fetch(`${API}/overlay/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleObs = async (enabled) => {
    setObsEnabled(enabled);
    if (enabled) {
      await fetch(`${API}/overlay/server/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port: obsPort }) }).catch(() => {});
    } else {
      await fetch(`${API}/overlay/server/stop`, { method: "POST" }).catch(() => {});
    }
  };
  const [queue, setQueue] = useState([]);
  const queueRef = useRef([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [lyricsRefetchKey, setLyricsRefetchKey] = useState(0);
  const [forcedLyricsProvider, setForcedLyricsProvider] = useState(null);
  const [currentLyricsSource, setCurrentLyricsSource] = useState("");
  const [failedLyricsProviders, setFailedLyricsProviders] = useState(new Set());
  const [showLyricsTranslation, setShowLyricsTranslation] = usePersistedState("kiyoshi-lyrics-translation", false);
  const [lyricsTranslationLang, setLyricsTranslationLang] = usePersistedState("kiyoshi-lyrics-translation-lang", "DE");
  const [showRomaji, setShowRomaji] = usePersistedState("kiyoshi-lyrics-romaji", false);
  const [syllableZoom, setSyllableZoom] = usePersistedState("kiyoshi-lyrics-syllable-zoom", false);
  const [fluidLyrics, setFluidLyrics] = usePersistedState("kiyoshi-lyrics-fluid", true);
  const [videoSyncEnabled, setVideoSyncEnabled] = usePersistedState("kiyoshi-video-sync", false);
  // "auto" = best available; otherwise a max-height cap (string, matches <select>/ToggleButton
  // values) for users on a weaker/metered connection.
  const [videoSyncQuality, setVideoSyncQuality] = usePersistedState("kiyoshi-video-sync-quality", "auto");
  const videoSync = useVideoSync(currentTrack?.videoId, videoSyncEnabled, videoSyncQuality === "auto" ? null : Number(videoSyncQuality));
  // How lyrics are shown alongside the video (when the user has them toggled on via the normal
  // Lyrics button) — "split" (video+lyrics side by side) or "captions" (bottom-strip overlay,
  // video stays full-size).
  const [videoLyricsStyle, setVideoLyricsStyle] = usePersistedState("kiyoshi-video-lyrics-style", "split");
  const [showVideoView, setShowVideoView] = useState(false);
  // The audio/video switch only exists while a synced video is available for THIS track — drop
  // back to the normal cover/lyrics view the moment that stops being true (track change, or the
  // fetch simply came back unavailable) so there's never a dead end with no way back.
  useEffect(() => {
    if (!videoSync.ready) setShowVideoView(false);
  }, [videoSync.ready, currentTrack?.videoId]);
  const [isCustomLyrics, setIsCustomLyrics] = useState(false);
  const [showAgentTags, setShowAgentTags] = usePersistedState("kiyoshi-lyrics-agent-tags", true);
  const importLyricsRef = useRef(null);
  const removeCustomLyricsRef = useRef(null);
  const openLyricsBrowserRef = useRef(null);

  // Reset lyrics state on every track change (incl. auto-advance / prev-next)
  useEffect(() => {
    setFailedLyricsProviders(new Set());
    setForcedLyricsProvider(null);
    setCurrentLyricsSource("");
  }, [currentTrack?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showLyrics, setShowLyrics] = useState(true);
  const showLyricsRef = useRef(showLyrics); showLyricsRef.current = showLyrics;
  // Combined split view (fullscreen only): cover/visualizer left, lyrics right.
  const [splitView, setSplitView] = useState(false);
  const splitViewRef = useRef(splitView); splitViewRef.current = splitView;
  // Drag-to-resize the split — fraction of width given to the cover/left pane. Persisted.
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = parseFloat(localStorage.getItem("kiyoshi-split-ratio"));
    return Number.isFinite(saved) ? Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, saved)) : 0.5;
  });
  const [splitResizing, setSplitResizing] = useState(false);
  const startSplitResize = useCallback((e) => {
    e.preventDefault();
    setSplitResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      // Split spans the full window in fullscreen, so the ratio is the cursor's distance from
      // the inline start over the window width -- measured from the right edge in RTL.
      const x = isRtl() ? window.innerWidth - ev.clientX : ev.clientX;
      const r = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, x / window.innerWidth));
      setSplitRatio(r);
    };
    const onUp = () => {
      setSplitResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setSplitRatio(r => { localStorage.setItem("kiyoshi-split-ratio", String(r)); return r; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  // Auto-switch to the cover view during instrumental segments, then back to lyrics. The ref
  // remembers whether *we* made the switch, so a manual toggle isn't overridden afterwards.
  const autoCoverRef = useRef(false);
  const lastInstSwitchRef = useRef(0); // cooldown so the auto-switch can't rapidly flip
  const setShowLyricsManual = useCallback((v) => { autoCoverRef.current = false; setShowLyrics(v); }, []);
  // Instrumental segment toggles the cover view in/out (only if the feature is on and we
  // aren't overriding a manual choice). Reuses the existing 0.35s showLyrics crossfade.
  // A short cooldown guards against any rapid back-and-forth flicker.
  const handleInstrumentalChange = useCallback((inst) => {
    if (!instrumentalVizRef.current || splitViewRef.current) return;
    const now = performance.now();
    if (now - lastInstSwitchRef.current < 1500) return;
    if (inst) {
      if (showLyricsRef.current) { autoCoverRef.current = true; lastInstSwitchRef.current = now; setShowLyrics(false); }
    } else if (autoCoverRef.current) {
      autoCoverRef.current = false; lastInstSwitchRef.current = now; setShowLyrics(true);
    }
  }, []);
  const [queueOpen, setQueueOpen] = useState(false);
  // True only once the queue panel has finished sliding in — used to defer the expensive
  // ambient backdrop-blur until the slide settles, so the animation stays on the compositor.
  const [queueSettled, setQueueSettled] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [playerVisible, setPlayerVisible] = useState(true);
  const [cursorVisible, setCursorVisible] = useState(true);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    if (!fullscreen) {
      setPlayerVisible(true);
      setCursorVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }
    // Hiding the player bar shifts layout under a stationary cursor (translateY sliding it
    // off-screen). Some WebViews fire a synthetic mousemove when the element under an unmoved
    // cursor changes (confirmed reproducible on macOS/WKWebView for this bug report, not on
    // Windows/WebView2 here). That synthetic event then re-showed the bar, which hid again
    // after 3s, shifting layout again — a self-triggering loop. Only treat it as real activity
    // if the pointer's coordinates actually changed.
    let lastX = null, lastY = null;
    const onMove = (e) => {
      if (e.clientX === lastX && e.clientY === lastY) return;
      lastX = e.clientX; lastY = e.clientY;
      setPlayerVisible(true);
      setCursorVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setPlayerVisible(false);
        setCursorVisible(false);
      }, 3000);
    };
    // Start timer immediately when entering fullscreen
    hideTimerRef.current = setTimeout(() => {
      setPlayerVisible(false);
      setCursorVisible(false);
    }, 3000);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [fullscreen]);

  const [collection, setCollection] = useState(null); // { title, thumbnail, tracks }
  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new IpcAudio();

  // Pause Kodama's own playback when the Composer window opens, so the user isn't
  // hearing the main player and the Composer's editor audio at the same time.
  // openComposer() (module-level) fires this event; we pause here to keep React state in sync.
  useEffect(() => {
    const onPause = () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener("kodama-pause-playback", onPause);
    return () => window.removeEventListener("kodama-pause-playback", onPause);
  }, []);

  // Update native window title (= taskbar) whenever the playing track or state changes.
  // When paused for >30 s, revert to "Kodama".
  useEffect(() => {
    const setWinTitle = (t) => {
      document.title = t;
      import("@tauri-apps/api/webviewWindow")
        .then(({ getCurrentWebviewWindow }) => getCurrentWebviewWindow().setTitle(t))
        .catch(() => {});
    };

    if (!currentTrack) {
      setWinTitle("Kodama");
      return;
    }

    const trackTitle = `${currentTrack.title} – ${currentTrack.artists}`;

    if (isPlaying) {
      setWinTitle(trackTitle);
    } else {
      // Paused: keep the track title but reset after 30 s of inactivity
      const timer = setTimeout(() => setWinTitle("Kodama"), 30_000);
      return () => clearTimeout(timer);
    }
  }, [currentTrack, isPlaying]);

  // Discord Rich Presence — show current track in Discord profile.
  // Debounced (800ms) to avoid flickering on rapid track changes.
  // Periodic refresh every 15s keeps elapsed time accurate after seeks.
  const discordUpdateRef = useRef(null);
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
        const a = audioRef.current;
        const dur = a?.duration;
        // Skip update if audio metadata hasn't loaded yet
        if (!dur || isNaN(dur)) return;
        const artistStr = Array.isArray(currentTrack.artists)
          ? currentTrack.artists.map(a => a?.name || a).join(", ")
          : (currentTrack.artists || "");

        // OS media controls (SMTC / Now Playing / MPRIS) — always on, independent of Discord.
        invoke("media_update", {
          title: currentTrack.title || "",
          artist: artistStr,
          album: currentTrack.album || "",
          thumbnail: currentTrack.thumbnail || "",
          duration: dur,
          elapsed: a?.currentTime || 0,
          paused: !isPlaying,
        }).catch(() => {});

        // Discord Rich Presence — opt-in via setting.
        if (!discordRpc) {
          invoke("clear_discord_rpc").catch(() => {});
          return;
        }
        invoke("update_discord_rpc", {
          title: currentTrack.title || "",
          artist: artistStr,
          album: currentTrack.album || "",
          thumbnail: currentTrack.thumbnail || "",
          duration: dur,
          elapsed: a?.currentTime || 0,
          videoId: currentTrack.videoId || "",
          paused: !isPlaying,
          statusDisplay: discordStatusDisplay,
        }).catch(() => {});
      } catch {}
    };

    // Debounce: wait 800ms before sending to let rapid state changes settle
    const debounce = setTimeout(send, 800);
    // Periodic refresh for elapsed time accuracy
    const interval = setInterval(send, 15000);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(interval);
    };
  }, [currentTrack, isPlaying, discordRpc, discordStatusDisplay]);

  // Kimuco Bridge — report now-playing to the OBS overlay app (external, port 8888).
  // Also pushes to the built-in overlay server when enabled.
  useEffect(() => {
    const report = () => {
      const a = audioRef.current;
      const coverUrl = currentTrack?.thumbnail
        ? `${API}/imgproxy?url=${encodeURIComponent(currentTrack.thumbnail)}`
        : "";
      const artistStr = Array.isArray(currentTrack?.artists)
        ? currentTrack.artists.map(x => x?.name || x).join(", ")
        : (currentTrack?.artists || "");
      const payload = {
        title:     currentTrack?.title || "",
        artist:    artistStr,
        album:     currentTrack?.album || "",
        cover:     coverUrl,
        progress:  a?.currentTime || 0,
        duration:  a?.duration    || 0,
        isPlaying: isPlaying && !!currentTrack,
      };
      // External Kimuco v1
      fetch("http://127.0.0.1:8888/api/source/kiyoshi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(500), body: JSON.stringify(payload),
      }).catch(() => {});
      // Built-in overlay backend state. Pushed unconditionally (cheap localhost POST, 1/s):
      // it feeds the overlay-editor live preview and the OBS overlay page, both of which read
      // the backend's _ov_state. Gating this on obsEnabled meant the editor preview showed
      // "No Music" whenever the OBS server toggle happened to be off (incl. when it was only
      // enabled in the separate editor window, which has its own obsEnabled state).
      fetch(`${API}/overlay/push`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(500), body: JSON.stringify(payload),
      }).catch(() => {});
    };

    report();
    const id = setInterval(report, 1000);
    return () => clearInterval(id);
  }, [currentTrack, isPlaying]);

  const handlePlay = useCallback((track, trackList) => {
    setCurrentTrack(track);
    setForcedLyricsProvider(null);
    setCurrentLyricsSource("");
    setFailedLyricsProviders(new Set());
    if (trackList) {
      const seen = new Set();
      const deduped = trackList.filter(t => {
        if (!t.videoId || seen.has(t.videoId)) return false;
        seen.add(t.videoId);
        return true;
      });
      setQueue(deduped);
    }
    // Save to play history
    if (track?.videoId) {
      try {
        const key = `kiyoshi-history-${window.__activeProfile || "default"}`;
        const stored = JSON.parse(localStorage.getItem(key) || "[]");
        const entry = { ...track, playedAt: Date.now() };
        // Don't add duplicate of the very last played track
        const filtered = stored.filter((t, i) => !(i === 0 && t.videoId === track.videoId));
        localStorage.setItem(key, JSON.stringify([entry, ...filtered].slice(0, 200)));
        window.dispatchEvent(new Event("kiyoshi-history-updated"));
      } catch {}
    }
  }, []);

  // Enqueue a track for Big Picture's context menu: "next" inserts it right after the current
  // track, "end" appends it. The queue is the source of truth for next/prev (getAdjacentTrack),
  // so a plain splice is enough. With nothing playing yet, just start it.
  const enqueue = useCallback((track, mode) => {
    if (!track?.videoId) return;
    if (!currentTrack) { handlePlay(track, [track]); return; }
    if (track.videoId === currentTrack.videoId) return;
    setQueue(q => {
      const n = q.filter(x => x.videoId !== track.videoId); // move if already queued
      const i = n.findIndex(x => x.videoId === currentTrack.videoId);
      const at = mode === "next" ? (i < 0 ? n.length : i + 1) : n.length;
      n.splice(at, 0, track);
      return n;
    });
  }, [currentTrack, handlePlay]);

  // Big Picture bridge: expose "play this track" + enqueue (the Player already owns transport/seek).
  useEffect(() => { bpRegisterCommands({ play: handlePlay, enqueue }); }, [handlePlay, enqueue]);

  // Start an autoplay radio/mix seeded from a single track. Reads the language from localStorage
  // (not the `language` state, which is declared further down → would be a TDZ ref here).
  const startSongRadio = useCallback(async (track) => {
    if (!track?.videoId) return;
    const fail = () => addToast(translate(localStorage.getItem("kiyoshi-lang") || "de", "radioFailed"), "error");
    try {
      const r = await fetch(`${API}/radio/_?videoId=${encodeURIComponent(track.videoId)}`);
      const d = await r.json();
      if (d.tracks?.length) handlePlay(d.tracks[0], d.tracks);
      else fail();
    } catch {
      fail();
    }
  }, [handlePlay, addToast]);

  // Play a song from just a videoId (shared kodama://song/<id> deep link): fetch minimal
  // metadata so the player has a title/cover, then play. Falls back to a bare track.
  const playByVideoId = useCallback(async (videoId) => {
    try {
      const d = await fetch(`${API}/song/meta/${videoId}`).then(r => r.json());
      if (d && d.videoId && !d.error) handlePlay(d);
      else handlePlay({ videoId, title: videoId, artists: "" });
    } catch {
      handlePlay({ videoId, title: videoId, artists: "" });
    }
  }, [handlePlay]);

  // ── Demo / screenshot mode (Ctrl+Shift+D) ─────────────────────────────────
  const [demoMode, setDemoMode] = useState(false);
  const demoSeekRef = useRef(false);
  // Once the signature track has loaded, seek it to the posed timestamp (once).
  useEffect(() => {
    if (!demoMode) { demoSeekRef.current = false; return; }
    const iv = setInterval(() => {
      const a = audioRef.current;
      if (!demoSeekRef.current && currentTrack?.videoId === DEMO_TRACK_ID && a && (a.duration || 0) >= DEMO_SEEK_S + 1) {
        a.currentTime = DEMO_SEEK_S; demoSeekRef.current = true; clearInterval(iv);
      }
    }, 300);
    return () => clearInterval(iv);
  }, [demoMode, currentTrack, audioRef]);

  // Deep links: kodama://song/<videoId>. Handles both cold start (getCurrent) and while
  // the app is already running (onOpenUrl, routed via the single-instance plugin).
  useEffect(() => {
    let unlisten;
    const handle = (url) => {
      const m = String(url || "").match(/^kodama:\/\/song\/([A-Za-z0-9_-]{6,})/i);
      if (m) playByVideoId(m[1]);
    };
    (async () => {
      try {
        const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
        const start = await getCurrent();
        if (start && start.length) start.forEach(handle);
        unlisten = await onOpenUrl((urls) => urls.forEach(handle));
      } catch (e) { console.error("[DeepLink]", e); }
    })();
    return () => { if (unlisten) unlisten(); };
  }, [playByVideoId]);

  // Global queue poll — runs whenever there are active downloads
  useEffect(() => {
    if (downloadingIds.size === 0) return;
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${API}/downloads/queue`);
        const d = await r.json();
        const queue = d.queue || [];
        setDownloadQueue(queue);
        const doneIds = queue.filter(i => i.status === "done").map(i => i.videoId);
        const errorIds = queue.filter(i => i.status === "error").map(i => i.videoId);
        const premiumIds = queue.filter(i => i.status === "error" && i.error_type === "premium_only").map(i => i.videoId);
        const finishedIds = [...doneIds, ...errorIds];
        if (doneIds.length) setCachedSongIds(prev => { const s = new Set(prev); doneIds.forEach(id => s.add(id)); return s; });
        if (premiumIds.length) setPremiumSongIds(prev => { const s = new Set(prev); premiumIds.forEach(id => s.add(id)); return s; });
        if (finishedIds.length) {
          setDownloadingIds(prev => { const s = new Set(prev); finishedIds.forEach(id => s.delete(id)); return s; });
          setDownloadBatches(prev => prev.map(b => {
            const added = doneIds.filter(id => b.videoIds.includes(id)).length;
            const addedErr = errorIds.filter(id => b.videoIds.includes(id)).length;
            return (added || addedErr) ? { ...b, completedCount: b.completedCount + added, errorCount: b.errorCount + addedErr } : b;
          }));
        }
      } catch {}
    }, 1500);
    return () => clearInterval(poll);
  }, [downloadingIds.size]);

  // Remove fully-finished batches after a short delay
  useEffect(() => {
    const done = downloadBatches.filter(b => b.completedCount + b.errorCount >= b.videoIds.length);
    if (!done.length) return;
    const t = setTimeout(() => {
      setDownloadBatches(prev => prev.filter(b => b.completedCount + b.errorCount < b.videoIds.length));
    }, 2500);
    return () => clearTimeout(t);
  }, [downloadBatches]);

  // Drain pending queue — start next tracks whenever a slot opens up (max 5 concurrent)
  const MAX_CONCURRENT_DOWNLOADS = 5;
  useEffect(() => {
    if (pendingDownloadQueue.length === 0) return;
    const slots = MAX_CONCURRENT_DOWNLOADS - downloadingIds.size;
    if (slots <= 0) return;
    const toStart = pendingDownloadQueue.slice(0, slots);
    setPendingDownloadQueue(prev => prev.slice(toStart.length));
    toStart.forEach(track => handleDownloadSong(track));
  }, [pendingDownloadQueue.length, downloadingIds.size]);

  const handleDownloadSong = useCallback(async (track) => {
    if (!track?.videoId || downloadingIds.has(track.videoId) || cachedSongIds.has(track.videoId)) return;
    setDownloadingIds(prev => new Set(prev).add(track.videoId));
    try {
      await fetch(`${API}/song/download/${track.videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: track.title, artists: track.artists, album: track.album, duration: track.duration, thumbnail: track.thumbnail }),
      });
    } catch {
      setDownloadingIds(prev => { const s = new Set(prev); s.delete(track.videoId); return s; });
    }
  }, [downloadingIds, cachedSongIds]);

  const handleDownloadAll = useCallback((tracks, meta = {}) => {
    const eligible = tracks.filter(t => !cachedSongIds.has(t.videoId) && !downloadingIds.has(t.videoId));
    if (!eligible.length) return;
    const batchId = Date.now().toString();
    setDownloadBatches(prev => [...prev, {
      id: batchId,
      title: meta.title || "",
      thumbnail: meta.thumbnail || "",
      artists: meta.artists || "",
      videoIds: eligible.map(t => t.videoId),
      completedCount: 0,
      errorCount: 0,
    }]);
    setPendingDownloadQueue(prev => [...prev, ...eligible]);
  }, [cachedSongIds, downloadingIds]);

  // Cancel a download batch: drop it from the UI + remove its not-yet-started tracks
  // from the pending queue. (In-flight server downloads can't be aborted backend-side.)
  const handleCancelBatch = useCallback((batchId) => {
    setDownloadBatches(prev => {
      const batch = prev.find(b => b.id === batchId);
      if (batch) {
        const ids = new Set(batch.videoIds);
        setPendingDownloadQueue(pq => pq.filter(t => !ids.has(t.videoId)));
        setDownloadingIds(di => { const s = new Set(di); batch.videoIds.forEach(id => s.delete(id)); return s; });
      }
      return prev.filter(b => b.id !== batchId);
    });
  }, []);

  const handleRemoveAllDownloads = useCallback(async (tracks) => {
    const videoIds = tracks.filter(t => cachedSongIds.has(t.videoId)).map(t => t.videoId);
    if (!videoIds.length) return;
    try {
      await fetch(`${API}/songs/cached/delete-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds }),
      });
      setCachedSongIds(prev => {
        const s = new Set(prev);
        videoIds.forEach(id => s.delete(id));
        return s;
      });
    } catch {}
  }, [cachedSongIds]);

  const [language, setLanguage] = useState(() => getInitialLang());

  const handleExportSong = useCallback(async (track, format) => {
    if (!track?.videoId) return;
    try {
      if (format === "mp3") {
        const ffRes = await fetch(`${API}/song/export/ffmpeg-available`).then(r => r.json()).catch(() => ({ available: false }));
        if (!ffRes.available) { addToast(translate(language, "noFfmpeg"), "error"); return; }
      }
      const { save } = await import("@tauri-apps/plugin-dialog");
      const artistStr = Array.isArray(track.artists)
        ? track.artists.map(a => typeof a === "string" ? a : a.name).join(", ")
        : (track.artists || "Unknown");
      const ext = format === "mp3" ? "mp3" : "opus";
      const defaultName = `${artistStr} - ${track.title || "Song"}.${ext}`;
      const defaultDir = localStorage.getItem("kiyoshi-mp3-dir") || undefined;
      const filePath = await save({
        title: translate(language, format === "mp3" ? "saveAsMp3" : "saveAsOpus"),
        defaultPath: defaultDir ? `${defaultDir}\\${defaultName}` : defaultName,
        filters: format === "mp3"
          ? [{ name: "MP3", extensions: ["mp3"] }]
          : [{ name: "OPUS", extensions: ["opus", "webm"] }],
      });
      if (!filePath) return;
      const dir = filePath.replace(/[\\/][^\\/]+$/, "");
      if (dir) localStorage.setItem("kiyoshi-mp3-dir", dir);
      const artistStr2 = Array.isArray(track.artists) ? track.artists.map(a => typeof a === "string" ? a : a.name).join(", ") : (track.artists || "");
      await fetch(`${API}/song/export/${track.videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ output_path: filePath, format, title: track.title || "", artists: artistStr2, album: track.album || "", year: track.year || "", albumBrowseId: track.albumBrowseId || "", thumbnail: track.thumbnail || "" }),
      });
      addToast(translate(language, "exportStarted"), "info");
      const poll = setInterval(async () => {
        try {
          const r = await fetch(`${API}/song/export/status/${track.videoId}`);
          const d = await r.json();
          if (d.status === "done") { clearInterval(poll); addToast(translate(language, "exportDone"), "success"); }
          else if (d.status === "error") { clearInterval(poll); addToast(translate(language, "exportError"), "error"); }
        } catch { clearInterval(poll); }
      }, 2000);
    } catch {}
  }, [language, addToast]);

  const handleSearch = useCallback(q => {
    setSearchQuery(q);
    setView("search");
  }, []);

  const addRecentPlaylist = useCallback((pl) => {
    const key = profileKey("kiyoshi-recent");
    const stored = (() => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } })();
    const id = itemId(pl);
    const next = [pl, ...stored.filter(p => itemId(p) !== id)].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("kiyoshi-recent-updated"));
  }, []);

  // A playlist opened from a pasted link arrives as a bare id: no title, no thumbnail. The
  // sidebar entry was written from that and stayed an empty placeholder. Once the stream's
  // header lands we know both, so the stored entries are filled in.
  const fillInSidebarEntry = useCallback((id, title, thumbnail) => {
    let touched = false;
    for (const prefix of ["kiyoshi-recent", "kiyoshi-pinned"]) {
      const key = profileKey(prefix);
      let stored;
      try { stored = JSON.parse(localStorage.getItem(key) || "[]"); } catch { continue; }
      let changed = false;
      const next = stored.map(p => {
        if (itemId(p) !== id || p.forcedTitle) return p;
        if (p.title && p.thumbnail) return p;
        changed = true;
        return { ...p, title: p.title || title || "", thumbnail: p.thumbnail || thumbnail || "" };
      });
      if (changed) { localStorage.setItem(key, JSON.stringify(next)); touched = true; }
    }
    if (touched) window.dispatchEvent(new Event("kiyoshi-recent-updated"));
  }, []);

  const removeRecentPlaylist = useCallback((id) => {
    const key = profileKey("kiyoshi-recent");
    const stored = (() => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } })();
    const next = stored.filter(p => (p.playlistId || p.browseId) !== id);
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("kiyoshi-recent-updated"));
  }, []);

  const openPlaylist = useCallback((item, fromView, refresh = false) => {
    // forcedTitle: when the caller provides a custom title (e.g. "Dusqk – Top Songs"),
    // we keep it and don't let the stream header overwrite it.
    if (!refresh) setNavHistory(h => [...h, navStateRef.current]);
    const forcedTitle = item.forcedTitle || null;
    setCollection({ title: forcedTitle || item.title, thumbnail: item.thumbnail, tracks: [], total: null, loading: true, progress: 0, cached: false, fromView: fromView || "library", forcedTitle, playlistId: item.playlistId });
    setView("collection");
    addRecentPlaylist({ playlistId: item.playlistId, title: forcedTitle || item.title, thumbnail: item.thumbnail, ...(forcedTitle ? { forcedTitle } : {}) });

    // Animate progress bar while waiting (fake progress up to 85%)
    let fakeProgress = 0;
    const interval = setInterval(() => {
      fakeProgress = Math.min(85, fakeProgress + Math.random() * 4);
      setCollection(c => c?.loading ? { ...c, progress: Math.round(fakeProgress) } : c);
    }, 400);

    const url = `${API}/playlist/${item.playlistId}/stream${refresh ? "?refresh=1" : ""}`;
    const es = new EventSource(url);
    es.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === "header") {
        fillInSidebarEntry(item.playlistId, msg.title, msg.thumbnail);
        setCollection(c => c ? { ...c, title: c.forcedTitle || msg.title, description: msg.description || "", thumbnail: msg.thumbnail || c.thumbnail, total: msg.total, cached: msg.cached || false } : c);
      } else if (msg.type === "tracks") {
        setCollection(c => c ? { ...c, tracks: [...c.tracks, ...msg.tracks] } : c);
      } else if (msg.type === "done" || msg.type === "error") {
        clearInterval(interval);
        setCollection(c => c ? { ...c, progress: 100 } : c);
        setTimeout(() => setCollection(c => c ? { ...c, loading: false } : c), 400);
        es.close();
      }
    };
    es.onerror = () => { clearInterval(interval); setCollection(c => c ? { ...c, loading: false } : c); es.close(); };
  }, []);

  const openAlbum = useCallback(async (item, fromView, refresh = false) => {
    if (!refresh) setNavHistory(h => [...h, navStateRef.current]);
    setCollection({ title: item.title, thumbnail: item.thumbnail, tracks: [], total: null, loading: false, progress: 0, cached: false, fromView: fromView || "library", isAlbum: true, browseId: item.browseId });
    setView("collection");
    addRecentPlaylist({ browseId: item.browseId, title: item.title, thumbnail: item.thumbnail, type: "album" });
    const url = `${API}/album/${item.browseId}${refresh ? "?refresh=1" : ""}`;
    const r = await fetch(url);
    const d = await r.json();
    setCollection(c => ({ ...c, title: d.title, thumbnail: d.thumbnail || c.thumbnail, tracks: d.tracks || [], total: d.tracks?.length || 0, albumArtists: d.artists, albumArtistBrowseId: d.artistBrowseId, year: d.year, cached: !refresh && !!d.cached }));
  }, [addRecentPlaylist]);

  const [animations, setAnimations] = usePersistedState("kiyoshi-animations", true);
  // Defer the queue panel's ambient blur until the slide-in transition has settled.
  useEffect(() => {
    if (!queueOpen) { setQueueSettled(false); return; }
    const id = setTimeout(() => setQueueSettled(true), animations ? 320 : 0);
    return () => clearTimeout(id);
  }, [queueOpen, animations]);
  const [lyricsFontSize, setLyricsFontSize] = usePersistedState("kiyoshi-lyrics-font-size", 32);
  const [lyricsTranslationFontSize, setLyricsTranslationFontSize] = usePersistedState("kiyoshi-lyrics-translation-font-size", 20);
  const [lyricsRomajiFontSize, setLyricsRomajiFontSize] = usePersistedState("kiyoshi-lyrics-romaji-font-size", 18);
  const [hideExplicit, setHideExplicit] = usePersistedState("kiyoshi-hide-explicit", false);
  const [showTrackNumbers, setShowTrackNumbers] = usePersistedState("kodama-track-numbers", false);
  // Anonymous active-user stats: default ON, one-click opt-out. See analytics/.
  const [anonStats, setAnonStats] = usePersistedState("kodama-anon-stats", true);
  const [hideUserHandle, setHideUserHandle] = usePersistedState("kiyoshi-hide-handle", false);
  const [uiZoom, setUiZoom] = useState(() => {
    const saved = parseFloat(localStorage.getItem("kiyoshi-ui-zoom"));
    return ZOOM_STEPS.includes(saved) ? saved : 1.0;
  });

  const [customShortcuts, setCustomShortcuts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("kiyoshi-shortcuts") || "{}");
      return { ...DEFAULT_SHORTCUTS, ...saved };
    } catch { return { ...DEFAULT_SHORTCUTS }; }
  });
  const [shortcutLabels, setShortcutLabels] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kiyoshi-shortcut-labels") || "{}"); }
    catch { return {}; }
  });
  const [recordingShortcut, setRecordingShortcut] = useState(null);
  const customShortcutsRef = useRef(customShortcuts);
  const recordingShortcutRef = useRef(null);
  useEffect(() => { customShortcutsRef.current = customShortcuts; }, [customShortcuts]);
  useEffect(() => { recordingShortcutRef.current = recordingShortcut; }, [recordingShortcut]);

  const getShortcutLabel = useCallback((stored) => {
    if (!stored) return "—";
    if (!stored.includes("+")) {
      const label = shortcutLabels[stored] || CODE_DISPLAY_FALLBACK[stored] || stored;
      return label.length === 1 ? label.toUpperCase() : label;
    }
    // Compound: "Ctrl+Equal" → "Ctrl+="
    const parts    = stored.split("+");
    const code     = parts[parts.length - 1];
    const mods     = parts.slice(0, -1);
    const keyLabel = shortcutLabels[code] || CODE_DISPLAY_FALLBACK[code] || code;
    const displayKey = keyLabel.length === 1 ? keyLabel.toUpperCase() : keyLabel;
    return [...mods, displayKey].join("+");
  }, [shortcutLabels]);

  const resetShortcut = useCallback((id) => {
    setCustomShortcuts(prev => {
      const next = { ...prev, [id]: DEFAULT_SHORTCUTS[id] };
      localStorage.setItem("kiyoshi-shortcuts", JSON.stringify(next));
      return next;
    });
  }, []);

  // The settings panel had been calling setCustomShortcuts directly, which it never received —
  // "reset all" threw instead of resetting. Kept here beside resetShortcut so the persisted
  // copy is written in one place rather than two.
  const resetAllShortcuts = useCallback(() => {
    setCustomShortcuts({ ...DEFAULT_SHORTCUTS });
    localStorage.setItem("kiyoshi-shortcuts", "{}");
  }, []);

  // Applied synchronously here as well as in the effect, so there is no flash of unstyled text.
  const [appFontScale, setAppFontScale] = useState(() => applyFontScale(readFontScale()));
  useEffect(() => { applyFontScale(appFontScale); }, [appFontScale]);

  // uiZoom wird direkt im App-Container angewendet (kein document.documentElement),
  // damit position:fixed / 100vh-Werte korrekt bleiben.
  const [lyricsProviders, setLyricsProviders] = useState(() => {
    try {
      const saved = localStorage.getItem("kiyoshi-lyrics-providers");
      if (saved) return mergeLyricsProviders(JSON.parse(saved));
    } catch {}
    return DEFAULT_LYRICS_PROVIDERS;
  });
  // Migration: add newly introduced providers, drop obsolete ones, refresh renamed labels.
  useEffect(() => {
    setLyricsProviders(current => {
      const merged = mergeLyricsProviders(current);
      if (JSON.stringify(merged) === JSON.stringify(current)) return current;
      localStorage.setItem("kiyoshi-lyrics-providers", JSON.stringify(merged));
      return merged;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [autoplay, setAutoplay] = usePersistedState("kiyoshi-autoplay", true);
  const [crossfade, setCrossfade] = usePersistedState("kiyoshi-crossfade", 0);
  // Progressive playback (default): stream the song for a fast start. Off = classic full
  // download first (more stable on weak devices). Both stay in the Rust audio core.
  const [playbackProgressive, setPlaybackProgressive] = useState(
    () => localStorage.getItem("kodama-playback-mode") !== "classic"
  );

  // ── LAN remote control ──
  // Default off; enabling starts the token-gated phone endpoints on the (already 0.0.0.0)
  // backend. The Player pushes now-playing state + drains commands while enabled.
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteInfo, setRemoteInfo] = useState(null);     // { token, ips, port }
  const [remoteDevices, setRemoteDevices] = useState([]);
  // Remembered devices persist across app restarts. The backend state is in-memory, so the
  // desktop keeps the stable token + trusted device list in localStorage and re-supplies both
  // on enable — remembered phones then auto-approve without re-pairing after a restart.
  const [remoteTrusted, setRemoteTrusted] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kodama-remote-trusted") || "[]"); } catch { return []; }
  });
  const remoteTrustedIds = useMemo(() => new Set(remoteTrusted.map(x => x.id)), [remoteTrusted]);
  const toggleRemote = useCallback(async (on) => {
    try {
      let trusted = [];
      try { trusted = JSON.parse(localStorage.getItem("kodama-remote-trusted") || "[]"); } catch {}
      const savedToken = localStorage.getItem("kodama-remote-token") || "";
      const d = await fetch(`${API}/remote/_enable`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: on, token: on ? savedToken : "", trusted: on ? trusted : [] }),
      }).then(r => r.json());
      setRemoteEnabled(!!d.enabled);
      setRemoteInfo(d.enabled ? { token: d.token, ips: d.ips || [], port: d.port } : null);
      if (d.enabled && d.token) { try { localStorage.setItem("kodama-remote-token", d.token); } catch {} }
      if (!d.enabled) setRemoteDevices([]);
    } catch (e) { console.error("[Remote] toggle failed:", e); }
  }, []);
  const remoteDeviceAction = useCallback((id, action) => {
    fetch(`${API}/remote/_device`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).catch(() => {});
    // Forget a removed/denied device so it doesn't get re-seeded as approved next restart.
    if (action === "remove" || action === "deny") {
      setRemoteTrusted(prev => {
        const next = prev.filter(x => x.id !== id);
        try { localStorage.setItem("kodama-remote-trusted", JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, []);
  const remoteRememberDevice = useCallback((id, name, on) => {
    setRemoteTrusted(prev => {
      const next = on ? [...prev.filter(x => x.id !== id), { id, name }] : prev.filter(x => x.id !== id);
      try { localStorage.setItem("kodama-remote-trusted", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  // Pairing modal open state — declared before the device poll so the poll can speed up
  // while it's open (for snappy scan detection) and stay slow otherwise (for performance).
  const [pairModalOpen, setPairModalOpen] = useState(false);
  // While enabled, poll the device list (for the desktop approval UI). Adaptive rate:
  // fast (2s) while pairing so a scan is detected quickly, slow (5s) when idle.
  useEffect(() => {
    if (!remoteEnabled) return;
    let stop = false;
    // Only update state when the device list actually changed — a fresh array reference
    // every poll would re-render the whole app even when nothing changed.
    const sig = (arr) => (arr || []).map(x => `${x.id}:${x.status}:${x.online}`).join("|");
    const tick = () => fetch(`${API}/remote/_status`).then(r => r.json())
      .then(d => {
        if (stop || !d || !d.devices) return;
        setRemoteDevices(prev => (sig(prev) === sig(d.devices) ? prev : d.devices));
      }).catch(() => {});
    tick();
    const iv = setInterval(tick, pairModalOpen ? 2000 : 5000);
    return () => { stop = true; clearInterval(iv); };
  }, [remoteEnabled, pairModalOpen]);

  useEffect(() => { if (!remoteEnabled) setPairModalOpen(false); }, [remoteEnabled]);
  const hasPending = remoteDevices.some(d => d.status === "pending");
  useEffect(() => { if (hasPending) setPairModalOpen(true); }, [hasPending]);

  // App-icon personalization. Applies live to taskbar/window/tray (+ macOS Dock & bundle)
  // via the Rust `set_app_icon` command. The static pinned-shortcut icon stays as installed.
  const [appIcon, setAppIcon] = usePersistedState("kodama-app-icon", APP_ICON_DEFAULT);
  const applyAppIcon = useCallback(async (file) => {
    try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_app_icon", { file }); }
    catch (e) { console.error("[AppIcon] set failed:", e); }
  }, []);
  const handleAppIconChange = useCallback((file) => {
    setAppIcon(file);
    applyAppIcon(file);
  }, [applyAppIcon, setAppIcon]);
  // Re-apply the user's chosen icon on each launch (only if they customized it).
  useEffect(() => {
    const stored = localStorage.getItem("kodama-app-icon");
    if (stored && stored !== APP_ICON_DEFAULT) applyAppIcon(stored);
  }, [applyAppIcon]);

  // Per-transition crossfade overrides: { "fromId__toId": { secs, fromTitle, toTitle } }.
  // A pair override beats the global default; secs 0 = hard cut for that one transition.
  const [crossfadeOverrides, setCrossfadeOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kodama-crossfade-overrides")) || {}; }
    catch { return {}; }
  });
  const setCrossfadeOverride = useCallback((fromId, toId, secs, fromTitle, toTitle) => {
    if (!fromId || !toId) return;
    setCrossfadeOverrides(prev => {
      const next = { ...prev, [`${fromId}__${toId}`]: { secs, fromTitle, toTitle } };
      localStorage.setItem("kodama-crossfade-overrides", JSON.stringify(next));
      return next;
    });
  }, []);
  const removeCrossfadeOverride = useCallback((key) => {
    setCrossfadeOverrides(prev => {
      const next = { ...prev }; delete next[key];
      localStorage.setItem("kodama-crossfade-overrides", JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Profile / Auth ──
  const [profiles, setProfiles] = useState([]);
  const profilesRef = useRef(profiles);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);
  const [hasProfile, setHasProfile] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const sessionWarnedRef = useRef(null); // profile name we've already shown the "session expired" toast for
  // Views that come up empty because of it can say so instead of showing a blank page.
  const [sessionExpired, setSessionExpired] = useState(false);
  const sessionExpiredToastKeyRef = useRef(null); // key of the currently-shown toast, so it can be closed once the session recovers on its own
  const [showLangPicker, setShowLangPicker] = useState(() => !localStorage.getItem("kiyoshi-lang"));
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const [addingProfile, setAddingProfile] = useState(false);
  const [reauthName, setReauthName] = useState(null); // re-login an existing profile via OAuth under its own name
  const [currentProfile, setCurrentProfile] = useState(null);

  // ── fetchProfiles + loadCachedProfile must be declared before any effect that uses them ──

  const fetchProfiles = useCallback(async () => {
    try {
      const r = await fetch(`${API}/profiles`);
      const d = await r.json();
      // Persist for offline fallback
      try { localStorage.setItem("kiyoshi-profiles-cache", JSON.stringify({ profiles: d.profiles || [], current: d.current || null })); } catch {}
      setProfiles(d.profiles || []);
      setCurrentProfile(d.current || null);
      setHasProfile((d.profiles || []).length > 0 && d.current);
      if (d.current) {
        window.__activeProfile = d.current;
        try { setPinnedIds(JSON.parse(localStorage.getItem(`kiyoshi-pinned-${d.current}`) || "[]").map(p => p.playlistId || p.browseId)); } catch {}
      }
      // Notify once when the active (real) account's session has expired, so the user knows to
      // refresh it. Reset when it's valid again so a later expiry warns anew.
      const active = (d.profiles || []).find(p => p.name === d.current);
      // loggedOut covers a deliberate sign-out; sessionExpired covers cookies Google has
      // stopped accepting, which is the case this warning was built for and the only one it
      // used to miss entirely. Both need the same thing from the user: sign in again.
      setSessionExpired(!!(active && active.type !== "local" && active.sessionExpired));
      if (active && active.type !== "local" && (active.loggedOut || active.sessionExpired)) {
        if (sessionWarnedRef.current !== active.name) {
          sessionWarnedRef.current = active.name;
          setReauthName(active.name); // target the settings re-auth / login at this account
          const lang = localStorage.getItem("kiyoshi-lang") || "de";
          // Persistent (timeout: 0) — a fresh app start is busy (splash/language picker/loading),
          // so a short-lived toast is easy to miss entirely. Closed automatically below if the
          // backend's own PSIDTS refresh loop (every 5 min) quietly fixes the session on its own.
          sessionExpiredToastKeyRef.current = toast.warning(translate(lang, "sessionExpiredHint"), {
            timeout: 0,
            actionProps: {
              children: translate(lang, "reauthSession"),
              onPress: () => { setAddingProfile(true); setShowLogin(true); },
            },
          });
        }
        // Both conditions have to clear, or the next poll would close the toast again right
        // after showing it: sessionExpired leaves loggedOut false.
      } else if (active && !active.loggedOut && !active.sessionExpired) {
        sessionWarnedRef.current = null;
        if (sessionExpiredToastKeyRef.current) {
          toast.close(sessionExpiredToastKeyRef.current);
          sessionExpiredToastKeyRef.current = null;
        }
      }
    } catch {}
  }, []);

  // Keep the YT-Music session alive long-term: a hidden "session-keeper" WebView (a real
  // browser engine) rotates the *SIDTS timestamp cookies that plain HTTP requests cannot, and
  // pushes the fresh set to the backend. Only runs for real accounts — ensure_session_keeper
  // throws for local/offline profiles (no auth data dir), which cleanly skips it.
  useEffect(() => {
    if (!currentProfile) return;
    let interval = null, firstTimer = null, cancelled = false;
    (async () => {
      let invoke;
      try { ({ invoke } = await import("@tauri-apps/api/core")); } catch { return; }
      try { await invoke("ensure_session_keeper", { profileName: currentProfile }); }
      catch { return; }
      if (cancelled) return;
      const rotate = () => invoke("rotate_session_cookies", { profileName: currentProfile }).catch(() => {});
      // If the account is already showing as logged-out right now, don't sit through the normal
      // startup delay — fire the (heavier, real-browser) rotation immediately. Otherwise keep the
      // usual 25s grace period, since most of the time nothing's wrong and there's no rush.
      const alreadyLoggedOut = !!profilesRef.current.find(p => p.name === currentProfile)?.loggedOut;
      firstTimer = setTimeout(() => { if (!cancelled) rotate(); }, alreadyLoggedOut ? 0 : 25000);
      interval = setInterval(() => { if (!cancelled) rotate(); }, 20 * 60 * 1000);
    })();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (firstTimer) clearTimeout(firstTimer);
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("stop_session_keeper")).catch(() => {});
    };
  }, [currentProfile]);

  // ── Account/profile actions — shared by the Sidebar quick-switcher dropdown
  //    and the Account settings tab. Single source of truth for the app-wide
  //    side effects (reset view/queue, show login, etc.). ──────────────────────
  const handleAccountSwitch = useCallback(async (name) => {
    setSwitchingTo(profiles.find(p => p.name === name) || { name });
    const started = Date.now();
    try {
      await fetch(`${API}/profiles/switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      await fetchProfiles();
      setView("home"); setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false); setSearchQuery(""); setAppKey(k => k + 1);
      window.__activeProfile = name; window.dispatchEvent(new CustomEvent("profile-switched"));
    } finally {
      // Keep the overlay up for a moment even on a fast switch so it doesn't just flash.
      const rest = 450 - (Date.now() - started);
      if (rest > 0) await new Promise(r => setTimeout(r, rest));
      setSwitchingTo(null);
    }
  }, [fetchProfiles, profiles]);

  const handleAccountAdd = useCallback(async () => {
    try { await fetch(`${API}/auth/begin-add`, { method: "POST" }); } catch {}
    setAddingProfile(true); setShowLogin(true);
  }, []);

  const handleAccountReauth = useCallback((name) => {
    // Re-login an existing (expired/revoked) profile via OAuth, keeping its name & data.
    setReauthName(name); setAddingProfile(true); setShowLogin(true);
  }, []);

  const handleAccountRemove = useCallback(async (name) => {
    const wasActive = profiles.find(p => p.name === name)?.active;
    await fetch(`${API}/profiles/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const remaining = profiles.filter(p => p.name !== name);
    if (remaining.length === 0) { setView("home"); setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false); setHasProfile(false); setShowLogin(true); }
    else if (wasActive) {
      const next = remaining[0];
      await fetch(`${API}/profiles/switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next.name }) });
      await fetchProfiles(); setView("home"); setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false);
      window.__activeProfile = next.name; window.dispatchEvent(new CustomEvent("profile-switched")); setAppKey(k => k + 1);
    } else { await fetchProfiles(); }
  }, [profiles, fetchProfiles]);

  const handleAccountRename = useCallback(async (name, displayName) => {
    const dn = (displayName || "").trim();
    if (!dn) return;
    await fetch(`${API}/profiles/rename`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, displayName: dn }) });
    await fetchProfiles();
  }, [fetchProfiles]);

  const handleAccountAvatarChange = useCallback(async (name, avatar) => {
    await fetch(`${API}/profiles/avatar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, avatar: avatar || "" }) });
    await fetchProfiles();
  }, [fetchProfiles]);

  const handleAccountLogout = useCallback(async () => {
    try { await fetch(`${API}/auth/logout`, { method: "POST" }); } catch (e) { console.error("logout failed:", e); }
    await fetchProfiles();
    setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false);
    setHasProfile(false); setShowLogin(true);
  }, [fetchProfiles]);

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
      try { setPinnedIds(JSON.parse(localStorage.getItem(`kiyoshi-pinned-${current}`) || "[]").map(p => p.playlistId || p.browseId)); } catch {}
      return true;
    } catch { return false; }
  }, []);

  // Keepalive ping to prevent server connection timeout
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${API}/status`).catch(() => {});
    }, 30000); // ping every 30s
    return () => clearInterval(interval);
  }, []);

  // Load cached song IDs on mount (with retry for slow backend startup)
  useEffect(() => {
    let cancelled = false;
    const load = (attempt = 0) => {
      fetch(`${API}/song/cached/list`)
        .then(r => r.json())
        .then(d => { if (!cancelled) setCachedSongIds(new Set((d.songs || []).map(s => s.videoId))); })
        .catch(() => { if (!cancelled && attempt < 20) setTimeout(() => load(attempt + 1), 1500); });
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load liked song IDs on mount
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/liked/ids`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setLikedIds(new Set(d.ids || [])); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Auto-start OBS overlay server on mount if it was enabled in last session
  useEffect(() => {
    if (!obsEnabled) return;
    let cancelled = false;
    const start = (attempt = 0) => {
      fetch(`${API}/overlay/server/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: obsPort }),
      }).catch(() => {
        if (!cancelled && attempt < 15) setTimeout(() => start(attempt + 1), 1500);
      });
    };
    start();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle like for a track from playlist rows
  const handleToggleLike = useCallback(async (track) => {
    if (!track?.videoId) return;
    const wasLiked = likedIds.has(track.videoId);
    const newRating = wasLiked ? "INDIFFERENT" : "LIKE";
    setLikedIds(prev => {
      const s = new Set(prev);
      if (wasLiked) s.delete(track.videoId); else s.add(track.videoId);
      return s;
    });
    // Un-liking while the Liked Songs collection is open: drop the row right away instead of
    // leaving a track sitting in a list it no longer belongs to. Same dissolve the other
    // removals use, and the same "targeted event, no refetch" approach — a reload would
    // flash the whole list for one row.
    if (wasLiked && view === "collection" && collection?.playlistId === "LM") {
      const drop = () => setCollection(c => (c?.playlistId === "LM" ? {
        ...c,
        tracks: c.tracks.filter(x => x.videoId !== track.videoId),
        total: typeof c.total === "number" ? Math.max(0, c.total - 1) : c.total,
      } : c));
      const el = document.querySelector(`[data-track-id="${CSS.escape(track.videoId)}"]`);
      if (animations && el) dissolve(el, drop); else drop();
    }
    try {
      await fetch(`${API}/like/${track.videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: newRating,
          title: track.title || "",
          artists: track.artists || "",
          album: track.album || "",
          thumbnail: track.thumbnail || "",
          duration: track.duration || "",
        }),
      });
      // Last.fm Loved sync
      if (lastfmConnectedRef.current) {
        const lfArtist = (track.artists || "").replace(/\s*-\s*Topic$/i, "").trim();
        const lfTitle = (track.title || "").trim();
        if (lfArtist && lfTitle) {
          fetch(`${API}/lastfm/${newRating === "LIKE" ? "love" : "unlove"}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ artist: lfArtist, track: lfTitle }),
          }).catch(() => {});
        }
      }
    } catch {
      // revert on error
      setLikedIds(prev => {
        const s = new Set(prev);
        if (wasLiked) s.add(track.videoId); else s.delete(track.videoId);
        return s;
      });
    }
    // collection?.playlistId rather than the whole object: it's a string, so this doesn't
    // rebuild the callback on every chunk that streams into an open collection.
  }, [likedIds, view, collection?.playlistId, animations]);

  // Detect real network connectivity changes
  useEffect(() => {
    const onOnline  = () => {
      setIsActuallyOffline(false);
      // Refresh profiles + force all views to re-fetch after coming back online
      fetchProfiles();
      setAppKey(k => k + 1);
    };
    const onOffline = () => setIsActuallyOffline(true);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [fetchProfiles]);

  // Debug float window toggle
  useEffect(() => {
    const handler = () => setDebugFloat(true);
    window.addEventListener("kiyoshi-debug-float", handler);
    return () => window.removeEventListener("kiyoshi-debug-float", handler);
  }, []);

  const isOffline = offlineMode || isActuallyOffline;

  const handleToggleOffline = useCallback(() => {
    setOfflineMode(prev => {
      const next = !prev;
      if (next) setView("downloads");
      return next;
    });
  }, [setOfflineMode]);

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
          try { const c = JSON.parse(localStorage.getItem("kiyoshi-profiles-cache") || "{}"); const cur = (c.profiles || []).find(p => p.name === c.current); if (cur && cur.type !== "local") expired = cur; } catch {}
          try { localStorage.removeItem("kiyoshi-profiles-cache"); } catch {}
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
          try { const p = JSON.parse(raw || "{}"); hasCache = p.profiles?.length > 0 && p.current; } catch {}
          if (!hasCache) setShowLogin(true);
          // Keep pinging in background; once backend responds, sync live data
          bgIntervalId = setInterval(async () => {
            try {
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 2000);
              const r = await fetch(`${API}/auth/validate`, { signal: ctrl.signal });
              clearTimeout(tid);
              const d = await r.json();
              if (bgIntervalId) { clearInterval(bgIntervalId); bgIntervalId = null; }
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

    return () => { if (bgIntervalId) { clearInterval(bgIntervalId); bgIntervalId = null; } };
  }, [fetchProfiles, loadCachedProfile]);

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    localStorage.setItem("kiyoshi-lang", lang);
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("update_tray_labels", {
        showLabel: translate(lang, "trayShow"),
        quitLabel: translate(lang, "trayQuit"),
      }).catch(() => {});
    });
  };

  // Sync tray labels with current language on startup
  useEffect(() => {
    // Use getInitialLang() (localStorage → system locale), the SAME source the app UI uses.
    // A hardcoded "de" fallback here meant users with no saved language but a non-German system
    // locale got an English/other UI but a German tray.
    const lang = getInitialLang();
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("update_tray_labels", {
        showLabel: translate(lang, "trayShow"),
        quitLabel: translate(lang, "trayQuit"),
      }).catch(() => {});
    });
  }, []);


  // Mouse wheel volume control — only on player bar area
  useEffect(() => {
    const onWheel = (e) => {
      const audio = audioRef.current;
      if (!audio) return;
      // Only adjust volume when hovering over the volume area
      const playerBar = e.target.closest?.('[data-volume-area]');
      if (!playerBar) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.02 : -0.02;
      const dv = Math.min(1, Math.max(0, Math.sqrt(audio.volume) + delta));
      audio.volume = dv * dv;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [audioRef]);

  const [artistView, setArtistView] = useState(null);

  // Always-fresh snapshot of current nav state — used by open* callbacks to push history.
  // Updated synchronously on every render so callbacks always read the latest values.
  const navStateRef = useRef({ view: "home", collection: null, artistView: null });
  navStateRef.current = { view, collection, artistView };

  const openArtist = useCallback((item, fromView) => {
    setNavHistory(h => [...h, navStateRef.current]);
    setArtistView({ browseId: item.browseId, fromView: fromView || view });
    setView("artist");
    if (item.browseId && item.title) {
      addRecentPlaylist({ browseId: item.browseId, title: item.title, thumbnail: item.thumbnail || "", type: "artist" });
    }
  }, [view]);

  // ── Navigation history ──────────────────────────────────────────────────────
  // Snapshot the current view state onto the history stack before navigating away.
  const pushNav = useCallback((currentView, currentCollection, currentArtistView) => {
    setNavHistory(h => [...h, {
      view: currentView,
      collection: currentView === "collection" ? currentCollection : undefined,
      artistView: currentView === "artist" ? currentArtistView : undefined,
    }]);
  }, []);

  // Navigate to a top-level section (sidebar links) — always clears history.
  const navigateTo = useCallback((v) => {
    setNavHistory([]);
    setView(v);
  }, []);

  // Go back one step in history; falls back to home if the stack is empty.
  const goBack = useCallback(() => {
    setNavHistory(h => {
      if (h.length === 0) { setView("home"); return h; }
      const prev = h[h.length - 1];
      setView(prev.view);
      // Always restore collection (null for non-collection views so loading guards don't crash)
      setCollection(prev.collection ?? null);
      setArtistView(prev.artistView ?? null);
      return h.slice(0, -1);
    });
  }, []);

  // ── Clear track selection when view changes ─────────────────────────────────
  useEffect(() => { clearSelection(); }, [view]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tgt = e.target;
      // Never hijack keystrokes meant for text entry or for an open menu/dialog
      // (e.g. the search field inside the "Add to playlist" submenu). The menu
      // popover holds DOM focus (role="menu") while its search field is typed in,
      // so a plain tagName check isn't enough — also bail when focus is inside one.
      if (
        tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable ||
        (tgt.closest && tgt.closest('[role="menu"],[role="dialog"],[role="menuitem"]'))
      ) return;
      const isModifier = ["Control","Shift","Alt","Meta"].includes(e.key);

      // Recording mode — capture next non-modifier key (with any active modifiers)
      if (recordingShortcutRef.current) {
        if (!isModifier) {
          e.preventDefault();
          if (e.code !== "Escape") {
            const actionId = recordingShortcutRef.current;
            const shortcut = serializeShortcut(e);
            setCustomShortcuts(prev => {
              const next = { ...prev, [actionId]: shortcut };
              localStorage.setItem("kiyoshi-shortcuts", JSON.stringify(next));
              return next;
            });
            setShortcutLabels(prev => {
              if (prev[e.code] === e.key) return prev;
              const next = { ...prev, [e.code]: e.key };
              localStorage.setItem("kiyoshi-shortcut-labels", JSON.stringify(next));
              return next;
            });
          }
          setRecordingShortcut(null);
        }
        return;
      }

      // Capture layout-aware display labels on every keypress
      if (!isModifier && e.code) {
        setShortcutLabels(prev => {
          if (prev[e.code] === e.key) return prev;
          const next = { ...prev, [e.code]: e.key };
          localStorage.setItem("kiyoshi-shortcut-labels", JSON.stringify(next));
          return next;
        });
      }

      // While the overlay editor is open, playback shortcuts must not fire —
      // arrow keys nudge the selected layer, Space/etc. belong to the editor.
      if (document.querySelector("[data-overlay-editor]")) return;

      // Same for Big Picture mode: its own navigation (arrows/enter) owns the keyboard while open,
      // so the desktop shortcuts (arrow = prev/next track, etc.) must stay out of the way.
      if (document.querySelector("[data-bigpicture]")) return;

      const sc = customShortcutsRef.current;

      if (matchShortcut(sc.playPause, e)) {
        e.preventDefault();
        if (audioRef.current) {
          if (audioRef.current.paused) { audioRef.current.play(); setIsPlaying(true); }
          else { audioRef.current.pause(); setIsPlaying(false); }
        }
      } else if (matchShortcut(sc.nextTrack, e)) {
        e.preventDefault();
        const q = queueRef.current;
        setCurrentTrack(t => {
          if (!t) return t;
          const idx = q.findIndex(x => x.videoId === t.videoId);
          return idx < q.length - 1 ? q[idx + 1] : t;
        });
      } else if (matchShortcut(sc.prevTrack, e)) {
        e.preventDefault();
        const q = queueRef.current;
        setCurrentTrack(t => {
          if (!t) return t;
          const idx = q.findIndex(x => x.videoId === t.videoId);
          return idx > 0 ? q[idx - 1] : t;
        });
      } else if (matchShortcut(sc.volUp, e)) {
        e.preventDefault();
        if (audioRef.current) { const dv = Math.min(1, Math.sqrt(audioRef.current.volume) + 0.02); audioRef.current.volume = dv * dv; }
      } else if (matchShortcut(sc.volDown, e)) {
        e.preventDefault();
        if (audioRef.current) { const dv = Math.max(0, Math.sqrt(audioRef.current.volume) - 0.02); audioRef.current.volume = dv * dv; }
      } else if (matchShortcut(sc.fullscreen, e)) {
        setFullscreen(f => {
          const next = !f;
          import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_fullscreen', { fullscreen: next }).catch(() => {}));
          if (next) setOverlayOpen(true);
          return next;
        });
      } else if (e.code === "Escape") {
        setOverlayOpen(false);
        setQueueOpen(false);
      } else if (e.code === "F8") {
        e.preventDefault();
        openFeedback();
      } else if (matchShortcut(sc.mute, e)) {
        e.preventDefault();
        if (audioRef.current) {
          if (audioRef.current.volume > 0) {
            mutePrevVolumeRef.current = audioRef.current.volume;
            audioRef.current.volume = 0;
          } else {
            audioRef.current.volume = mutePrevVolumeRef.current || 0.5;
          }
        }
      } else if (matchShortcut(sc.lyrics, e)) {
        e.preventDefault();
        if (!currentTrack) return;
        if (overlayOpen) {
          if (splitView) { setSplitView(false); setShowLyricsManual(true); }
          else setShowLyricsManual(l => !l);
        }
        else { setOverlayOpen(true); }
      } else if (matchShortcut(sc.seekBack, e)) {
        e.preventDefault();
        if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
      } else if (matchShortcut(sc.seekForward, e)) {
        e.preventDefault();
        if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 5);
      } else if (matchShortcut(sc.zoomIn, e) || (e.ctrlKey && e.code === "NumpadAdd")) {
        e.preventDefault();
        setUiZoom(z => { const idx = ZOOM_STEPS.indexOf(z); const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx >= 0 ? idx + 1 : 2)]; localStorage.setItem("kiyoshi-ui-zoom", next); return next; });
      } else if (matchShortcut(sc.zoomOut, e) || (e.ctrlKey && e.code === "NumpadSubtract")) {
        e.preventDefault();
        setUiZoom(z => { const idx = ZOOM_STEPS.indexOf(z); const next = ZOOM_STEPS[Math.max(0, idx >= 0 ? idx - 1 : 2)]; localStorage.setItem("kiyoshi-ui-zoom", next); return next; });
      } else if (e.ctrlKey && e.shiftKey && e.code === "KeyD") {
        // Toggle demo / screenshot mode; on enable, pose the signature track.
        e.preventDefault();
        setDemoMode(d => {
          const next = !d;
          if (next) { demoSeekRef.current = false; playByVideoId(DEMO_TRACK_ID); }
          return next;
        });
      }
    };
    // capture:true so we intercept before the WebView can handle Ctrl+= etc.
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [isPlaying, audioRef, overlayOpen, currentTrack, setUiZoom, splitView, openFeedback, playByVideoId]);

  // Animated view wrapper.
  // "backwards" rather than "both": filling forwards keeps the animation applied for good, and
  // an element with an applied transform animation stays promoted to its own compositing layer
  // even at the identity matrix — on a wrapper that spans a whole playlist view that is a very
  // large layer. Measured against the memory problem it made no difference, so this is hygiene
  // rather than a fix; the end state is the natural one anyway, so nothing needs holding.
  const AnimatedView = useCallback(({ children }) => (
    <div key={view} style={{
      animation: animations ? "fadeSlideIn 0.28s cubic-bezier(0.22,1,0.36,1) backwards" : "none",
    }}>
      {children}
    </div>
  ), [view, animations]);

  // Memoised so the identity only changes when a preference actually changes — App() re-renders
  // often, and an inline object would re-render every consumer each time.
  const lyricsPrefs = useMemo(() => ({
    showTranslation: showLyricsTranslation,
    setShowTranslation: setShowLyricsTranslation,
    translationLang: lyricsTranslationLang,
    setTranslationLang: setLyricsTranslationLang,
    translationFontSize: lyricsTranslationFontSize,
    showRomaji,
    setShowRomaji,
    romajiFontSize: lyricsRomajiFontSize,
    showAgentTags,
    syllableZoom,
    fluidLyrics,
    ambientVisualizer,
    ambientBackground,
  }), [showLyricsTranslation, setShowLyricsTranslation, lyricsTranslationLang, setLyricsTranslationLang,
       lyricsTranslationFontSize, showRomaji, setShowRomaji, lyricsRomajiFontSize, showAgentTags, syllableZoom,
       fluidLyrics, ambientVisualizer, ambientBackground]);

  const playbackPrefs = useMemo(() => ({
    crossfade,
    setCrossfade,
    crossfadeOverrides,
    setCrossfadeOverride,
    removeCrossfadeOverride,
    remoteEnabled,
    playbackProgressive,
  }), [crossfade, setCrossfade, crossfadeOverrides, setCrossfadeOverride, removeCrossfadeOverride,
       remoteEnabled, playbackProgressive]);

  return (
    // HeroUI's overlays sit on react-aria, which takes the writing direction from the
    // LOCALE, not from the dir attribute -- so tooltips, dropdowns and popovers stayed
    // left-to-right while everything else flipped. There was no provider at all, so it
    // fell back to the browser language. Handing it an RTL locale while the experiment
    // is on lines the two up; otherwise we pass the browser language, which is what it
    // was using anyway, so nothing changes for anyone not testing this.
    <I18nProvider locale={rtlLayout ? "he-IL" : (navigator.language || "en-US")}>
    <IconContext.Provider value={{ weight: "bold" }}>
    <LangContext.Provider value={language}>
    <TrackNumberContext.Provider value={showTrackNumbers}>
    <AnimationContext.Provider value={animations}>
    <FontScaleContext.Provider value={appFontScale}>
    <ZoomContext.Provider value={uiZoom}>
    <LyricsPrefsProvider value={lyricsPrefs}>
    <PlaybackPrefsProvider value={playbackPrefs}>
      <style>{GLOBAL_KEYFRAMES}</style>
      {!animations && (
        <style>{`*, *::before, *::after { transition: none !important; animation: none !important; }`}</style>
      )}
      {showSplash && <SplashScreen fading={splashFading} />}
      {/* Language picker first on very first launch, before FFmpeg setup */}
      {showLangPicker && !showLogin && (
        <LanguagePickerScreen
          currentLanguage={language}
          onConfirm={(lang) => {
            localStorage.setItem("kiyoshi-lang", lang);
            setLanguage(lang);
            setShowLangPicker(false);
          }}
        />
      )}
      {!ffmpegSetupDone && !showLangPicker && <FfmpegSetupScreen onDone={() => setFfmpegSetupDone(true)} />}
      {ffmpegUpdate && <FfmpegUpdateBanner installed={ffmpegUpdate.installed} latest={ffmpegUpdate.latest} onClose={() => setFfmpegUpdate(null)} />}

      {/* Toast Notifications */}
      <ToastProvider placement="bottom end" className="bottom-[120px]! z-[100000]!" />


      {flashbang && (
        <div onAnimationEnd={() => setFlashbang(false)} style={{ position: "fixed", inset: 0, zIndex: 999999, pointerEvents: "none", background: "white", animation: "flashbangFade 3s ease-out forwards" }} />
      )}
      <div data-ambient={ambientBackground && currentTrack?.thumbnail ? "true" : undefined} style={{ display: "flex", height: `${100 / uiZoom}vh`, background: "var(--bg-base)", position: "relative", isolation: "isolate", cursor: fullscreen && !cursorVisible ? "none" : "default", zoom: uiZoom }}>
        {/* Experimental: the playing track's cover as a heavily-blurred, theme-tinted ambient
            backdrop for the WHOLE app (z-index:-1 → paints over bg-base but under all content,
            so it shows through the transparent sidebar/canvas while cards keep their own bg). */}
        <AmbientBackdrop thumbnail={ambientBackground ? currentTrack?.thumbnail : null} />
        {!fullscreen && !IS_MAC && <TitleBar />}
        <div style={{
          width: fullscreen ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth),
          minWidth: fullscreen ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth),
          flexShrink: 0, overflow: "hidden",
          transition: sidebarResizing ? "none" : "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)",
          padding: fullscreen ? 0 : "8px 4px 8px 8px",
          position: "relative",
        }}>
          <Sidebar view={view} activeNavId={view === "collection" && collection?.playlistId === "LM" ? "liked" : view} setView={navigateTo} onSearch={handleSearch} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} onOpenSettings={() => setSettingsOpen(true)} onOpenAccountTab={() => { setSettingsTab("account"); setSettingsOpen(true); }} onOpenUpdateTab={() => { setSettingsTab("update"); setSettingsOpen(true); }} onCloseOverlay={() => setOverlayOpen(false)} onOpenPlaylist={(pl) => openPlaylist(pl, view)} onOpenAlbum={(item) => openAlbum(item, view)} onOpenArtist={(item) => openArtist(item, view)} onAddRecent={addRecentPlaylist} onContextMenu={openContextMenu} currentProfileData={demoMode ? DEMO_PROFILE : profiles.find(p => p.active)} onOpenProfileSwitcher={() => setShowProfileSwitcher(true)} profiles={profiles}
            onSwitchProfile={handleAccountSwitch}
            onAddProfile={async () => {
              try { await fetch(`${API}/auth/begin-add`, { method: "POST" }); } catch {}
              setAddingProfile(true); setShowLogin(true);
            }}
            onReauthProfile={(name) => { setReauthName(name); setAddingProfile(true); setShowLogin(true); }}
            onDeleteProfile={async (name) => {
              const wasActive = profiles.find(p => p.name === name)?.active;
              await fetch(`${API}/profiles/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
              const remaining = profiles.filter(p => p.name !== name);
              if (remaining.length === 0) { setView("home"); setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false); setHasProfile(false); setShowLogin(true); }
              else if (wasActive) {
                const next = remaining[0];
                await fetch(`${API}/profiles/switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next.name }) });
                await fetchProfiles(); setView("home"); setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false);
                window.__activeProfile = next.name; window.dispatchEvent(new CustomEvent("profile-switched")); setAppKey(k => k + 1);
              } else { await fetchProfiles(); }
            }}
            onLogout={async () => {
              try { await fetch(`${API}/auth/logout`, { method: "POST" }); } catch (e) { console.error("logout failed:", e); }
              await fetchProfiles();
              setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false);
              setHasProfile(false); setShowLogin(true);
            }}
            onCreatePlaylist={() => setCreatePlaylistOpen(true)}
            updateInfo={demoMode ? null : updateInfo}
            offlineMode={offlineMode}
            isActuallyOffline={isActuallyOffline}
            onToggleOffline={handleToggleOffline}
            onRefreshView={() => setViewRefreshKey(k => k + 1)}
            obsEnabled={obsEnabled}
            onOpenOverlaySettings={() => { setSettingsTab("overlay"); setSettingsOpen(true); }}
            onOpenNews={openNews}
            onOpenFeedback={openFeedback}
            newsUnread={demoMode ? 0 : newsUnreadCount}
            settingsOpen={settingsOpen}
            hideUserHandle={demoMode ? true : hideUserHandle}
          />
          {(settingsOpen || settingsClosing) && !fullscreen && (
            <SettingsSidebarContent
              tab={settingsTab}
              setTab={setSettingsTab}
              onSectionSelect={selectSettingsSection}
              updateInfo={updateInfo}
              onClose={closeSettings}
              collapsed={sidebarCollapsed}
              closing={settingsClosing}
            />
          )}
          {/* Drag handle to resize the expanded sidebar */}
          {!fullscreen && !sidebarCollapsed && (
            <div
              onMouseDown={startSidebarResize}
              style={{ position: "absolute", top: 0, insetInlineEnd: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 50 }}
              onMouseEnter={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = "1"; }}
              onMouseLeave={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = sidebarResizing ? "1" : "0"; }}
            >
              <div style={{
                position: "absolute", top: "50%", insetInlineEnd: 1, transform: "translateY(-50%)",
                width: 3, height: 44, borderRadius: "var(--r-full)", background: "var(--accent)",
                opacity: sidebarResizing ? 1 : 0, transition: "opacity 0.15s", pointerEvents: "none",
              }} />
            </div>
          )}
        </div>
        <div
          {...(IS_MAC ? { "data-tauri-drag-region": true } : {})}
          style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {/* macOS: the gap above the content card (this column's exposed top margin) is a
              drag region, so the window can be moved from the top of the main area too — the
              card and everything inside it stay clickable (they're children, not the region). */}
          <div style={{
            flex: 1, minHeight: 0, overflow: "hidden",
            borderRadius: "var(--r-xl)",
            margin: queueOpen ? `${IS_MAC ? 16 : 8}px ${queueWidth + 16}px 4px 4px` : `${IS_MAC ? 16 : 8}px 8px 4px 4px`,
            transition: queueResizing ? "none" : (animations ? "margin 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease" : "none"),
            opacity: (overlayOpen || settingsOpen || settingsClosing) ? 0 : 1,
            pointerEvents: (overlayOpen || settingsOpen || settingsClosing) ? "none" : "auto",
          }}>
          <ScrollShadowRoot key={appKey} size={28} className="scrollable overflow-y-auto" style={{ height: "100%" }}>
            {view === "home" && <AnimatedView key={`home-${viewRefreshKey}`}><HomeView displayName={demoMode ? DEMO_NAME : profiles.find(p => p.active)?.displayName} onPlay={handlePlay} onOpenPlaylist={(item) => openPlaylist(item, "home")} onOpenAlbum={(item) => openAlbum(item, "home")} onOpenArtist={(item) => openArtist(item, "home")} onContextMenu={openContextMenu} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track })} hideExplicit={hideExplicit} /></AnimatedView>}
            {view === "search" && <AnimatedView key={`search-${viewRefreshKey}`}><SearchView query={searchQuery} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenArtist={openArtist} onOpenAlbum={(item) => openAlbum(item, "search")} onOpenPlaylist={(item) => openPlaylist(item, "search")} onContextMenu={openContextMenu} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track })} hideExplicit={hideExplicit} /></AnimatedView>}
            {view === "history" && <AnimatedView key={`history-${viewRefreshKey}`}><HistoryView contextMenuTrackId={trackContextMenu?.track?.videoId || null} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenArtist={openArtist} onOpenAlbum={(item) => openAlbum(item, "history")} onTrackContextMenu={(e, track, extra) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track, ...extra })} cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} onDownloadSong={handleDownloadSong} hideExplicit={hideExplicit} onBack={goBack} /></AnimatedView>}
            {view === "library" && <AnimatedView key={`library-${viewRefreshKey}`}><LibraryView onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenPlaylist={openPlaylist} onOpenAlbum={openAlbum} onOpenArtist={openArtist} onContextMenu={openContextMenu} sessionExpired={sessionExpired} onReauth={() => { setAddingProfile(true); setShowLogin(true); }} /></AnimatedView>}
            {view === "collection" && collection && <AnimatedView key={`collection-${viewRefreshKey}`}><CollectionView contextMenuTrackId={trackContextMenu?.track?.videoId || null} title={collection.title} description={collection.description} thumbnail={collection.thumbnail} tracks={collection.tracks} total={collection.total} loading={collection.loading} progress={collection.progress || 0} cached={collection.cached} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onBack={goBack} onOpenArtist={openArtist} onOpenAlbum={(item) => openAlbum(item, "collection")} isLiked={collection.playlistId === "LM"} isAlbum={collection.isAlbum} albumArtists={collection.albumArtists} albumArtistBrowseId={collection.albumArtistBrowseId} year={collection.year} onRefresh={() => { if (collection.isAlbum) openAlbum({ browseId: collection.browseId, title: collection.title, thumbnail: collection.thumbnail }, collection.fromView, true); else openPlaylist({ playlistId: collection.playlistId, title: collection.title, thumbnail: collection.thumbnail, forcedTitle: collection.forcedTitle }, collection.fromView, true); }} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track, playlistId: (collection.isAlbum || collection.playlistId === "LM") ? null : collection.playlistId })} cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} premiumSongIds={premiumSongIds} onDownloadSong={handleDownloadSong} onDownloadAll={(tracks) => handleDownloadAll(tracks, { title: collection.title, thumbnail: collection.thumbnail, artists: collection.albumArtists || "" })} onRemoveAll={handleRemoveAllDownloads} hideExplicit={hideExplicit} onToggleLike={handleToggleLike} likedIds={likedIds} selectedTracks={selectedTracks} onToggleSelect={toggleTrackSelection} onSelectAll={selectAllTracks} /></AnimatedView>}
            {view === "artist" && artistView && <AnimatedView key={`artist-${viewRefreshKey}`}><ArtistView browseId={artistView.browseId} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenAlbum={(item) => openAlbum(item, "artist")} onOpenPlaylist={(item) => openPlaylist(item, "artist")} onOpenArtist={(item) => openArtist(item, "artist")} onBack={goBack} onContextMenu={openContextMenu} onTogglePin={togglePin} isPinned={pinnedIds.includes(artistView.browseId)} hideExplicit={hideExplicit} onStartRadio={handlePlay} /></AnimatedView>}
            {view === "downloads" && <AnimatedView key={`downloads-${viewRefreshKey}`}><DownloadsView contextMenuTrackId={trackContextMenu?.track?.videoId || null} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} premiumSongIds={premiumSongIds} onDownloadSong={handleDownloadSong} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track })} hideExplicit={hideExplicit} onOpenAlbum={(item) => openAlbum(item, "downloads")} onOpenArtist={openArtist} onToggleLike={handleToggleLike} likedIds={likedIds} /></AnimatedView>}
            {isOffline && view !== "downloads" && (
              <div style={{
                position: "sticky", bottom: 0, left: 0, right: 0,
                background: "var(--status-warning-soft)", borderTop: "1px solid var(--status-warning-line)",
                color: "var(--status-warning)", display: "flex", alignItems: "center", gap: 8,
                padding: "6px 16px", fontSize: 13, zIndex: 10,
              }}>
                <WifiX size={15} weight="bold" />
                {translate(language, "offlineBanner")}
              </div>
            )}
            {/* Spacer so content scrolls clear of the floating player bar */}
            <div style={{ height: 97, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
          </ScrollShadowRoot>
          </div>{/* end clip container */}
          {/* Player + floating action bar wrapper — position:relative so the bar can float above the player without affecting layout */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {/* Multi-track selection action bar — position:absolute so it floats above the player without pushing the list up */}
            {selectedTracks.size > 0 && (
              <div style={{
                position: "absolute", bottom: "100%", left: 0, right: 0,
                display: "flex", justifyContent: "center",
                padding: "0 0 6px",
                pointerEvents: "none",
              }}>
                <CardRoot variant="secondary" className="gap-0! p-0! items-stretch"
                  style={{
                    pointerEvents: "auto",
                    border: "0.5px solid var(--border)",
                    borderRadius: "var(--r-2xl)",
                    boxShadow: "var(--elevation-4)",
                    animation: "ctxMenuIn 0.2s ease-out",
                  }}>
                  {/* Title */}
                  <div style={{
                    fontSize: "var(--t12)", color: "var(--text-muted)", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.07em",
                    padding: "9px 24px 8px", textAlign: "center",
                  }}>
                    {selectedTracks.size} {translate(language, selectedTracks.size === 1 ? "songSelected" : "songsSelected")}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 8px" }}>
                    {/* Like all */}
                    <SelActionBtn
                      icon={<Heart size={17} />}
                      label={translate(language, "likeAll")}
                      iconOnly
                      onClick={async () => { for (const track of selectedTracks.values()) await handleToggleLike(track); clearSelection(); }}
                    />
                    <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
                    {/* Add to playlist — opens the shared modal with the selected tracks */}
                    <SelActionBtn
                      icon={<Plus size={17} />}
                      label={translate(language, "addToPlaylist")}
                      horizontal
                      onClick={() => setAddToPlaylistFor({ tracks: Array.from(selectedTracks.values()), fromSelection: true })}
                    />
                    {/* Remove from playlist — only when in playlist context */}
                    {view === "collection" && collection?.playlistId && collection.playlistId !== "LM" && (
                      <>
                      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
                      <SelActionBtn
                        icon={<Trash size={17} />}
                        label={translate(language, "removeSelected")}
                        iconOnly danger
                        onClick={async () => {
                          const tracks = Array.from(selectedTracks.values());
                          for (const track of tracks) {
                            if (!track.setVideoId) continue;
                            try {
                              await fetch(`${API}/playlist/${collection.playlistId}/remove`, {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ videos: [{ videoId: track.videoId, setVideoId: track.setVideoId }] }),
                              });
                              setCollection(c => c ? { ...c, tracks: c.tracks.filter(t => !(t.videoId === track.videoId && t.setVideoId === track.setVideoId)) } : c);
                            } catch {}
                          }
                          clearSelection();
                        }}
                      />
                      </>
                    )}
                    <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
                    {/* Close */}
                    <SelActionBtn icon={<X size={17} />} label={translate(language, "cancel")} iconOnly onClick={clearSelection} />
                  </div>
                </CardRoot>
              </div>
            )}
          <div style={{
            // Fullscreen: slide the bar down off-screen when hidden. Settings: plain fade.
            opacity: settingsOpen ? 0 : 1,
            transform: (fullscreen && !playerVisible) ? "translateY(120%)" : "translateY(0)",
            visibility: (settingsOpen || (fullscreen && !playerVisible)) ? "hidden" : "visible",
            transition: "opacity 0.35s ease, transform 0.42s cubic-bezier(0.4,0,0.2,1), visibility 0.42s ease",
            pointerEvents: settingsOpen ? "none" : (!fullscreen || playerVisible ? "auto" : "none"),
            position: "relative",
            zIndex: fullscreen ? 105 : "auto",
            padding: fullscreen ? 0 : "0 8px 8px 4px",
          }}>
          <Player
            track={currentTrack}
            setTrack={setCurrentTrack}
            queue={queue}
            setQueue={setQueue}
            audioRef={audioRef}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            expanded={overlayOpen}
            onExpandToggle={() => setOverlayOpen(e => !e)}
            showLyrics={showLyrics}
            onToggleLyrics={() => {
              if (!overlayOpen) {
                setOverlayOpen(true);
                setSplitView(false);
                setShowLyricsManual(true);
              } else if (showVideoView) {
                // Video mode: no cover/split cycle to run — just show/hide lyrics alongside
                // the video (as a split, for now — more styles land once captions exist).
                setShowLyricsManual(l => !l);
              } else if (fullscreen) {
                // Cycle: lyrics → cover → split → lyrics
                autoCoverRef.current = false;
                if (splitView) { setSplitView(false); setShowLyrics(true); }
                else if (showLyrics) { setShowLyrics(false); }
                else { setSplitView(true); }
              } else {
                setShowLyricsManual(l => !l);
              }
            }}
            videoAvailable={videoSync.ready}
            showVideoView={showVideoView}
            onSetVideoView={(v) => { if (v && !overlayOpen) setOverlayOpen(true); setShowVideoView(v); }}
            videoSync={videoSync}
            queueOpen={queueOpen}
            onToggleQueue={() => setQueueOpen(q => !q)}
            fullscreen={fullscreen}
            onToggleFullscreen={async () => {
              const { invoke } = await import('@tauri-apps/api/core');
              const next = !fullscreen;
              try { await invoke('set_fullscreen', { fullscreen: next }); } catch(e) { console.error(e); }
              setFullscreen(next);
              if (next) setOverlayOpen(true);
              else if (splitView) { setSplitView(false); setShowLyrics(true); }
            }}
            onOpenAlbum={openAlbum}
            onOpenArtist={openArtist}
            onExportSong={handleExportSong}
            onDownloadSong={handleDownloadSong}
            cachedSongIds={cachedSongIds}
            downloadingIds={downloadingIds}
            onRefetchLyrics={() => { setForcedLyricsProvider(null); setLyricsRefetchKey(k => k + 1); }}
            isCustomLyrics={isCustomLyrics}
            onImportLyrics={() => importLyricsRef.current?.()}
            onOpenLyricsBrowser={() => openLyricsBrowserRef.current?.()}
            onRemoveCustomLyrics={() => removeCustomLyricsRef.current?.()}
            onPremiumDetected={(videoId) => setPremiumSongIds(prev => new Set(prev).add(videoId))}
            onCreatePlaylist={() => setCreatePlaylistOpen(true)}
            onAddToPlaylist={(tracks) => setAddToPlaylistFor({ tracks })}
          />
          </div>
          </div>
          </div>
        <div style={{
          position: "absolute",
          top: overlayOpen ? (fullscreen ? 0 : 8) : "100%",
          // Logical, not physical: this reserves the sidebar's space, and the sidebar sits at
          // the inline start -- which is the right-hand side once the layout is flipped. With
          // plain left/right the overlay left an empty band on one side and ran underneath the
          // sidebar on the other. Same for the queue panel, which is docked at the inline end.
          insetInlineStart: fullscreen ? 0 : ((sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4),
          insetInlineEnd: fullscreen ? 0 : (queueOpen ? queueWidth + 16 : 8),
          bottom: fullscreen ? 0 : 112,
          zIndex: fullscreen ? 102 : 100,
          overflow: "hidden",
          borderRadius: fullscreen ? 0 : "var(--r-xl)",
          transition: queueResizing ? "top 0.42s cubic-bezier(0.4,0,0.2,1), left 0.3s ease" : (animations ? "top 0.42s cubic-bezier(0.4,0,0.2,1), right 0.3s ease, left 0.3s ease" : "top 0.1s ease"),
          pointerEvents: overlayOpen ? "all" : "none",
        }}>
          {/* Shared static background — stays fixed during crossfade */}
          {currentTrack && !ambientBackground && (<>
            <div style={{ position: "absolute", inset: 0, background: "#0d0d0d", pointerEvents: "none" }} />
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              backgroundImage: currentTrack.thumbnail ? `url(${hiResThumb(currentTrack.thumbnail, 800)})` : "none",
              backgroundSize: "cover", backgroundPosition: "center",
              filter: "blur(24px) brightness(0.5)",
              transform: "scale(1.08)",
            }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
          </>)}
          {currentTrack && (() => {
            // Split: cover/visualizer OR video left, lyrics right. Both sides of whichever split
            // is active stay mounted — only width/opacity animate, so there's no remount/refetch
            // when switching modes. Cover-split is fullscreen-only (existing behaviour); video's
            // lyrics-alongside-video works in the normal expanded view too, driven by the same
            // showLyrics the Lyrics button already toggles (no separate on/off setting).
            const coverSplitActive = fullscreen && splitView && !showVideoView;
            const videoLyricsOn = showVideoView && showLyrics;
            const videoSplitActive = videoLyricsOn && videoLyricsStyle === "split";
            const videoCaptionsActive = videoLyricsOn && videoLyricsStyle === "captions";
            const anySplitActive = coverSplitActive || videoSplitActive;
            const coverPct = `${(splitRatio * 100).toFixed(2)}%`;
            const lyricsPct = `${((1 - splitRatio) * 100).toFixed(2)}%`;
            // No width animation while dragging (snappy), otherwise the smooth mode transition.
            const widthTransition = splitResizing ? "none" : "width 0.4s cubic-bezier(0.4,0,0.2,1)";
            const paneTransition = `opacity 0.35s ease, ${widthTransition}`;
            // Whether the lyrics are actually on screen. The pane stays mounted when the
            // overlay is closed — it is only slid out of view — so without this its rAF
            // loop keeps running for a listener who cannot see it.
            const lyricsOnScreen = overlayOpen && (showVideoView ? videoSplitActive : (coverSplitActive || showLyrics));
            // Same for the cover pane: it holds the spectrum visualizer, which asks Rust to run
            // an FFT and stream 30 payloads a second. Mounted is not the same as visible.
            const coverOnScreen = overlayOpen && !showVideoView && (coverSplitActive || !showLyrics);
            return (<>
              <div style={{
                position: "absolute", top: 0, bottom: 0, right: 0,
                width: anySplitActive ? lyricsPct : "100%",
                opacity: showVideoView ? (videoSplitActive ? 1 : 0) : (coverSplitActive ? 1 : (showLyrics ? 1 : 0)),
                transition: paneTransition,
                pointerEvents: showVideoView ? (videoSplitActive ? "all" : "none") : ((coverSplitActive || showLyrics) ? "all" : "none"),
              }}>
                <LyricsOverlay track={currentTrack} audioRef={audioRef} onClose={() => setOverlayOpen(false)} fontSize={lyricsFontSize} providers={lyricsProviders} refetchKey={lyricsRefetchKey} onAddToast={addToast} language={language} forcedProvider={forcedLyricsProvider} onSourceChange={setCurrentLyricsSource} onProviderFailed={(id) => setFailedLyricsProviders(s => new Set([...s, id]))} onCustomLyricsStatusChange={setIsCustomLyrics} importLyricsRef={importLyricsRef} removeCustomLyricsRef={removeCustomLyricsRef} openLyricsBrowserRef={openLyricsBrowserRef} fullscreen={fullscreen} playerBarVisible={playerVisible} onInstrumentalChange={handleInstrumentalChange} active={lyricsOnScreen} />
              </div>
              <div style={{
                // insetInlineStart so the pane starts at the same edge the split ratio is
                // measured from, and borderInlineEnd so the divider lands between the panes
                // rather than jumping to the far side when the layout flips.
                position: "absolute", top: 0, bottom: 0, insetInlineStart: 0,
                width: coverSplitActive ? coverPct : "100%",
                opacity: showVideoView ? 0 : (coverSplitActive ? 1 : (showLyrics ? 0 : 1)),
                transition: paneTransition,
                pointerEvents: showVideoView ? "none" : ((coverSplitActive || !showLyrics) ? "all" : "none"),
                borderInlineEnd: coverSplitActive ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}>
                <CoverView active={coverOnScreen} track={currentTrack} isPlaying={isPlaying} onClose={() => setOverlayOpen(false)} ambientVisualizer={ambientVisualizer} ambientBackground={ambientBackground} vizConfig={vizConfig} narrow={coverSplitActive} />
              </div>
              {/* Video pane — full-bleed normally, or shares the screen with lyrics (left half)
                  when the video-split setting is on. Replaces the cover pane while active. */}
              <div style={{
                position: "absolute", top: 0, bottom: 0, insetInlineStart: 0,
                width: videoSplitActive ? coverPct : "100%",
                opacity: showVideoView ? 1 : 0,
                transition: paneTransition,
                pointerEvents: showVideoView ? "all" : "none",
              }}>
                {showVideoView && <VideoSyncView videoSync={videoSync} audioRef={audioRef} isPlaying={isPlaying} fullscreen={fullscreen} track={currentTrack} showCaptions={videoCaptionsActive} fluidCaptions={fluidLyrics} captionsTranslation={showLyricsTranslation} captionsTranslationLang={lyricsTranslationLang} captionsRomaji={showRomaji} captionsSyllableZoom={syllableZoom} language={language} />}
              </div>
              {/* Drag handle between the two panes (mirrors the sidebar/queue handles) */}
              {anySplitActive && (
                <div
                  onMouseDown={startSplitResize}
                  style={{ position: "absolute", top: 0, bottom: 0, insetInlineStart: coverPct, width: 12, marginInlineStart: -6, cursor: "ew-resize", zIndex: 6 }}
                  onMouseEnter={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = "1"; }}
                  onMouseLeave={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = splitResizing ? "1" : "0"; }}
                >
                  <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                    width: 3, height: 44, borderRadius: "var(--r-full)", background: "var(--accent)",
                    opacity: splitResizing ? 1 : 0, transition: "opacity 0.15s", pointerEvents: "none",
                  }} />
                </div>
              )}
            </>);
          })()}
        </div>

        {/* Queue panel */}
        <div style={{
          position: "absolute",
          top: fullscreen ? 0 : 8,
          right: fullscreen ? 0 : 8,
          width: fullscreen ? 360 : queueWidth, bottom: fullscreen ? 0 : 112, zIndex: fullscreen ? 104 : 101,
          // Slide via transform (compositor-only) instead of `right` (per-frame layout).
          // Once settled, drop the transform/will-change entirely — an ancestor transform
          // otherwise neutralises backdrop-filter on descendants (e.g. the scroll-to-top pill).
          transform: queueOpen ? (queueSettled ? "none" : "translateX(0)") : "translateX(calc(100% + 16px))",
          willChange: (queueOpen && queueSettled) ? "auto" : "transform",
          // Keep the panel near-opaque while moving; only switch to the costly ambient
          // backdrop-blur once it has settled, so the slide never repaints the blur.
          background: ambientBackground ? (queueSettled ? "rgba(18,18,18,0.5)" : "rgba(18,18,18,0.92)") : "var(--bg-surface)",
          backdropFilter: ambientBackground && queueSettled ? "blur(32px) saturate(1.4)" : "none",
          WebkitBackdropFilter: ambientBackground && queueSettled ? "blur(32px) saturate(1.4)" : "none",
          border: ambientBackground ? "0.5px solid rgba(255,255,255,0.08)" : "none",
          borderRadius: fullscreen ? 0 : "var(--r-xl)",
          overflow: "hidden",
          transition: queueResizing ? "none" : (animations ? "transform 0.3s cubic-bezier(0.4,0,0.2,1), background 0.25s ease" : "transform 0.1s ease"),
          display: "flex", flexDirection: "column",
          pointerEvents: queueOpen ? "all" : "none",
        }}>
          {/* Drag handle to resize the panel (mirrors the sidebar handle) */}
          {!fullscreen && queueOpen && (
            <div
              onMouseDown={startQueueResize}
              style={{ position: "absolute", top: 0, insetInlineStart: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 50 }}
              onMouseEnter={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = "1"; }}
              onMouseLeave={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = queueResizing ? "1" : "0"; }}
            >
              <div style={{
                position: "absolute", top: "50%", insetInlineStart: 1, transform: "translateY(-50%)",
                width: 3, height: 44, borderRadius: "var(--r-full)", background: "var(--accent)",
                opacity: queueResizing ? 1 : 0, transition: "opacity 0.15s", pointerEvents: "none",
              }} />
            </div>
          )}
          <QueuePanel
            queue={queue}
            setQueue={setQueue}
            currentTrack={currentTrack}
            setTrack={setCurrentTrack}
            onClose={() => setQueueOpen(false)}
            likedIds={likedIds}
            onToggleLike={handleToggleLike}
            visible={queueOpen}
          />
        </div>
        {/* Login Screen - shown when no profile exists */}
      {showLogin && (
        <LoginScreen
          forcedProfileName={reauthName}
          onSuccess={() => { fetchProfiles(); setShowLogin(false); setAddingProfile(false); setReauthName(null); }}
          onCancel={addingProfile ? () => { setShowLogin(false); setAddingProfile(false); setReauthName(null); } : undefined}
        />
      )}

      {/* LAN remote pairing / approval — top-level so it can pop up even with Settings closed. */}
      {remoteEnabled && (
        <RemotePairModal
          isOpen={pairModalOpen}
          onClose={() => setPairModalOpen(false)}
          info={remoteInfo}
          devices={remoteDevices}
          onDevice={remoteDeviceAction}
          onRemember={remoteRememberDevice}
        />
      )}

      {(settingsOpen || settingsClosing) && (
        <div style={{
          position: "absolute",
          top: fullscreen ? 0 : 8,
          // Logical for the same reason as the lyrics overlay above: the reserved sidebar
          // space has to follow the sidebar to the other side when the layout flips.
          insetInlineStart: fullscreen ? 0 : ((sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4),
          insetInlineEnd: fullscreen ? 0 : 8,
          bottom: fullscreen ? 0 : 8,
          zIndex: 150,
          borderRadius: fullscreen ? 0 : "var(--r-xl)",
          overflow: "hidden",
          animation: animations ? (settingsClosing ? "fadeSlideOut 0.22s cubic-bezier(0.4,0,0.2,1) forwards" : "fadeSlideIn 0.28s cubic-bezier(0.4,0,0.2,1)") : undefined,
        }}>
          <SettingsPanel
            onClose={closeSettings}
            onSectionChange={setSettingsSectionStore}
            accounts={profiles} activeAccount={profiles.find(p => p.active)}
            onAccountSwitch={handleAccountSwitch} onAccountAdd={handleAccountAdd}
            onAccountReauth={handleAccountReauth} onAccountRemove={handleAccountRemove}
            onAccountRename={handleAccountRename} onAccountLogout={handleAccountLogout} onAccountAvatarChange={handleAccountAvatarChange}
            accent={accent}
            onAccentChange={handleAccentChange}
            accentDynamic={accentDynamic}
            onAccentDynamicChange={setAccentDynamic}
            accentSat={accentSat}
            onAccentSatChange={setAccentSat}
            accentLight={accentLight}
            onAccentLightChange={setAccentLight}
            theme={theme}
            onThemeChange={handleThemeChange}
            animations={animations}
            onAnimationsChange={setAnimations}
            lyricsFontSize={lyricsFontSize}
            onLyricsFontSizeChange={setLyricsFontSize}
            lyricsTranslationFontSize={lyricsTranslationFontSize}
            onLyricsTranslationFontSizeChange={setLyricsTranslationFontSize}
            lyricsRomajiFontSize={lyricsRomajiFontSize}
            onLyricsRomajiFontSizeChange={setLyricsRomajiFontSize}
            lyricsProviders={lyricsProviders}
            onLyricsProvidersChange={v => { setLyricsProviders(v); localStorage.setItem("kiyoshi-lyrics-providers", JSON.stringify(v)); }}
            autoplay={autoplay}
            onAutoplayChange={setAutoplay}
            appIcon={appIcon}
            onAppIconChange={handleAppIconChange}
            remoteEnabled={remoteEnabled}
            remoteDevices={remoteDevices}
            remoteTrustedIds={remoteTrustedIds}
            onToggleRemote={toggleRemote}
            onRemoteDevice={remoteDeviceAction}
            onRememberDevice={remoteRememberDevice}
            onPairDevice={() => setPairModalOpen(true)}
            crossfade={crossfade}
            onCrossfadeChange={setCrossfade}
            crossfadeOverrides={crossfadeOverrides}
            onRemoveCrossfadeOverride={removeCrossfadeOverride}
            playbackProgressive={playbackProgressive}
            onPlaybackProgressiveChange={v => { setPlaybackProgressive(v); localStorage.setItem("kodama-playback-mode", v ? "progressive" : "classic"); }}
            closeTray={closeTray}
            onCloseTrayChange={v => { setCloseTray(v); import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_close_to_tray", { enabled: v }).catch(() => {})); }}
            discordRpc={discordRpc}
            onDiscordRpcChange={(v) => { setDiscordRpc(v); if (!v) import("@tauri-apps/api/core").then(({ invoke }) => invoke("clear_discord_rpc").catch(() => {})); }}
            discordStatusDisplay={discordStatusDisplay}
            onDiscordStatusDisplayChange={setDiscordStatusDisplay}
            ytmusicHistorySync={ytmusicHistorySync}
            onYtmusicHistorySyncChange={setYtmusicHistorySync}
            language={language}
            onLanguageChange={handleLanguageChange}
            updateInfo={updateInfo}
            onCheckUpdate={checkForUpdates}
            updateDownloading={updateDownloading}
            updateDownloadProgress={updateDownloadProgress}
            updateDownloaded={updateDownloaded}
            onDownloadUpdate={downloadUpdate}
            onInstallUpdate={installUpdate}
            onCancelDownload={cancelUpdateDownload}
            tab={settingsTab}
            setTab={setSettingsTab}
            hideExplicit={hideExplicit}
            onHideExplicitChange={setHideExplicit}
            showTrackNumbers={showTrackNumbers}
            onTrackNumbersChange={setShowTrackNumbers}
            anonStats={anonStats}
            onAnonStatsChange={setAnonStats}
            hideUserHandle={hideUserHandle}
            onToggleHideUserHandle={setHideUserHandle}
            uiZoom={uiZoom}
            onUiZoomChange={v => { setUiZoom(v); localStorage.setItem("kiyoshi-ui-zoom", v); }}
            appFontScale={appFontScale}
            onFontScaleChange={v => { setAppFontScale(v); localStorage.setItem("kiyoshi-font-scale", v); }}
            showRomaji={showRomaji}
            onToggleRomaji={() => setShowRomaji(v => !v)}
            showAgentTags={showAgentTags}
            onToggleAgentTags={() => setShowAgentTags(v => !v)}
            syllableZoom={syllableZoom}
            onToggleSyllableZoom={() => setSyllableZoom(v => !v)}
            fluidLyrics={fluidLyrics}
            onToggleFluidLyrics={() => setFluidLyrics(v => !v)}
            videoSyncEnabled={videoSyncEnabled}
            onToggleVideoSync={() => setVideoSyncEnabled(v => !v)}
            videoSyncQuality={videoSyncQuality}
            onVideoSyncQualityChange={setVideoSyncQuality}
            videoLyricsStyle={videoLyricsStyle}
            onVideoLyricsStyleChange={setVideoLyricsStyle}
            highContrast={highContrast}
            onToggleHighContrast={() => {
              const next = !highContrast;
              setHighContrast(next);
              document.documentElement.setAttribute("data-highcontrast", String(next));
              localStorage.setItem("kiyoshi-high-contrast", String(next));
            }}
            rtlLayout={rtlLayout}
            onToggleRtlLayout={() => handleRtlLayoutChange(!rtlLayout)}
            appFont={appFont}
            onAppFontChange={handleAppFontChange}
            ambientVisualizer={ambientVisualizer}
            onToggleAmbientVisualizer={() => setAmbientVisualizer(v => !v)}
            vizConfig={vizConfig}
            onUpdateViz={updateViz}
            instrumentalViz={instrumentalViz}
            onToggleInstrumentalViz={v => { setInstrumentalViz(v); if (!v && autoCoverRef.current) { autoCoverRef.current = false; setShowLyrics(true); } }}
            vizPreviewTrack={currentTrack}
            vizPreviewPlaying={isPlaying}
            ambientBackground={ambientBackground}
            onToggleAmbientBackground={() => setAmbientBackground(v => !v)}
            obsEnabled={obsEnabled}
            obsPort={obsPort}
            obsPortInput={obsPortInput}
            setObsPortInput={setObsPortInput}
            toggleObs={toggleObs}
            onObsPortSave={(val) => {
              const p = parseInt(val, 10);
              if (p > 1024 && p < 65535) {
                setObsPort(p);
                localStorage.setItem("kiyoshi-obs-port", p);
                if (obsEnabled) {
                  fetch(`${API}/overlay/server/stop`, { method: "POST" }).then(() =>
                    fetch(`${API}/overlay/server/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port: p }) })
                  ).catch(() => {});
                }
              }
            }}
            customShortcuts={customShortcuts}
            shortcutLabels={shortcutLabels}
            recordingShortcut={recordingShortcut}
            setRecordingShortcut={setRecordingShortcut}
            getShortcutLabel={getShortcutLabel}
            resetShortcut={resetShortcut}
            resetAllShortcuts={resetAllShortcuts}
          />
        </div>
        )}

        {/* Debug Floating Window */}
        {debugFloat && <DebugFloatingWindow onClose={() => setDebugFloat(false)} />}

        {/* Create Playlist Modal */}
        <ProfileSwitcherModal
          isOpen={showProfileSwitcher}
          onOpenChange={setShowProfileSwitcher}
          accounts={profiles}
          onSwitch={handleAccountSwitch}
          onAdd={handleAccountAdd}
        />
        {/* Account-switch loading overlay — sits outside the appKey-remounted content so it
            survives the forced re-render while the new profile loads. */}
        {switchingTo && (
          <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center gap-4"
            style={{ background: "rgba(13,13,13,0.72)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", animation: "fadeIn 0.15s ease" }}>
            <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-accent text-white font-semibold text-xl shadow-lg">
              {switchingTo.avatar
                ? <img src={thumb(switchingTo.avatar)} alt="" className="w-full h-full object-cover" />
                : (switchingTo.displayName || switchingTo.name || "?")[0].toUpperCase()}
            </div>
            <Spinner size="lg" />
            <div className="text-t14 text-secondary">
              {translate(language, "switchingTo", { name: switchingTo.displayName || switchingTo.name })}
            </div>
          </div>
        )}
        {newsOpen && (
          <NewsModal
            news={newsItems}
            unreadIds={newsUnreadSnapshot}
            onRefresh={loadNews}
            onClose={() => setNewsOpen(false)}
            t={(key) => translate(language, key)}
          />
        )}

        {feedbackOpen && (
          <BugReportModal
            screenshot={feedbackShot}
            onClose={() => setFeedbackOpen(false)}
            t={(key) => translate(language, key)}
            version={APP_VERSION}
            currentTrack={currentTrack ? { videoId: currentTrack.videoId, title: currentTrack.title } : null}
          />
        )}

        {(
          <CreatePlaylistModal
            isOpen={createPlaylistOpen}
            t={(key) => translate(language, key)}
            onClose={() => { setCreatePlaylistOpen(false); setCreatePlaylistForSelection(false); setCreatePlaylistTracks(null); }}
            onCreated={async (id, title) => {
              // If the create flow started from "Add to playlist ▸ New playlist", push the
              // pending tracks into the new playlist (works for both a single context-menu
              // track and a multi-selection — the tracks were captured when the modal opened).
              const pending = createPlaylistTracks;
              if (pending && pending.length > 0) {
                try {
                  await fetch(`${API}/playlist/${id}/add`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ videoIds: pending.map(t => t.videoId), tracks: pending }),
                  });
                } catch {}
                if (createPlaylistForSelection) clearSelection();
              }
              setCreatePlaylistTracks(null);
              setCreatePlaylistForSelection(false);
              openPlaylist({ playlistId: id, title, thumbnail: "" }, view);
            }}
          />
        )}

        {/* Add to playlist — dedicated modal (search + rich playlist rows) */}
        {addToPlaylistFor && (
          <AddToPlaylistModal
            tracks={addToPlaylistFor.tracks}
            onClose={() => setAddToPlaylistFor(null)}
            onNewPlaylist={() => { setCreatePlaylistTracks(addToPlaylistFor.tracks || null); if (addToPlaylistFor.fromSelection) setCreatePlaylistForSelection(true); setCreatePlaylistOpen(true); }}
            onAdded={addToPlaylistFor.fromSelection ? clearSelection : undefined}
          />
        )}

        {/* Download Queue — HeroUI toast-styled card with Spinner + ProgressBar */}
        {downloadBatches.length > 0 && (() => {
          const overallDone = downloadBatches.reduce((s, b) => s + b.completedCount + b.errorCount, 0);
          const overallTotal = downloadBatches.reduce((s, b) => s + b.videoIds.length, 0);
          const allFinished = overallDone >= overallTotal;
          return (
          <div
            className="fixed right-4 z-[100000] w-[320px] max-h-80 overflow-y-auto flex flex-col gap-3 p-3 rounded-2xl bg-elevated border border-border shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            style={{ bottom: 120, animation: "ctxMenuIn 0.18s ease-out" }}
          >
            <div className="flex items-center gap-2">
              {downloadQueueMin && (allFinished
                ? <CheckCircle size={14} weight="fill" className="text-[var(--status-success)] shrink-0" />
                : <Spinner size="sm" className="shrink-0" />)}
              <span className="text-t10 font-bold uppercase tracking-wider text-muted px-0.5">
                {translate(language, "downloadQueue")}
              </span>
              {downloadQueueMin && (
                <span className="text-t10 font-bold text-muted tabular-nums">{overallDone} / {overallTotal}</span>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="sm" isIconOnly onPress={() => setDownloadQueueMin(m => !m)} aria-label={downloadQueueMin ? "Expand" : "Minimize"}>
                {downloadQueueMin ? <CaretUp size={13} /> : <CaretDown size={13} />}
              </Button>
            </div>
            {!downloadQueueMin && downloadBatches.map(batch => {
              const total = batch.videoIds.length;
              const done = batch.completedCount + batch.errorCount;
              const isFinished = done >= total;
              const pct = total ? Math.round((batch.completedCount / total) * 100) : 0;
              return (
                <div key={batch.id} className="flex items-center gap-3">
                  {batch.thumbnail
                    ? <img src={thumb(batch.thumbnail)} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                    : <div className="w-11 h-11 rounded-lg bg-hover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isFinished
                        ? <CheckCircle size={15} weight="fill" className="text-[var(--status-success)] shrink-0" />
                        : <Spinner size="sm" className="shrink-0" />}
                      <div className="text-t12 font-semibold truncate flex-1">{batch.title}</div>
                      {!isFinished && (
                        <Button variant="ghost" size="sm" isIconOnly className="shrink-0 -mr-1" onPress={() => handleCancelBatch(batch.id)} aria-label={translate(language, "cancel")} title={translate(language, "cancel")}>
                          <X size={12} />
                        </Button>
                      )}
                    </div>
                    {batch.artists && <div className="text-t11 text-muted truncate">{batch.artists}</div>}
                    <div className="mt-1.5">
                      <ProgressBar aria-label="Download progress" value={pct} className="w-full">
                        <ProgressBarTrack className="h-1.5!">
                          <ProgressBarFill />
                        </ProgressBarTrack>
                      </ProgressBar>
                    </div>
                    <div className="flex items-center justify-between text-t11 text-muted mt-1">
                      <span>{done} / {total}</span>
                      <span>{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}

        {/* Track context menu */}
        {trackContextMenu && (() => {
          const track = trackContextMenu.track;
          const ctxLiked = likedIds.has(track.videoId);
          const showRemovePl = trackContextMenu.playlistId && track.setVideoId;
          const showRemoveHist = !!trackContextMenu.removeFromHistory;
          const artistList = Array.isArray(track.artists)
            ? track.artists.filter(a => a?.browseId || a?.id)
            : [];
          const showAlbumNav = !!track.albumBrowseId;
          const showArtistNav = artistList.length > 0 || !!track.artistBrowseId;
          const isCached = cachedSongIds.has(track.videoId);

          const copyShare = (url) => {
            navigator.clipboard.writeText(url)
              .then(() => toast.success(translate(language, "linkCopied")))
              .catch(() => {});
          };
          const copyLyrics = () => {
            fetch(`${API}/lyrics/${track.videoId}`).then(r => r.json()).then(d => {
              if (!d.lyrics) return;
              const text = d.lyrics.map(l => {
                const main = l.wordSync ? (l.words||[]).map(w=>w.text).join("") : (l.text||"");
                const bg = (l.bgWords||[]).map(w=>w.text).join("") || (l.bgText||"");
                return bg ? `${main} ${bg}` : main;
              }).join("\n");
              navigator.clipboard.writeText(text).catch(() => {});
            }).catch(() => {});
          };
          const saveLrc = async () => {
            try {
              const d = await fetch(`${API}/lyrics/${track.videoId}`).then(r => r.json());
              if (!d.lyrics) return;
              const lyrics = d.lyrics;
              const isSync = lyrics.some(l => l.time >= 0);
              const lrcLineText = (l) => {
                const main = l.wordSync ? (l.words||[]).map(w=>w.text).join("") : (l.text||"");
                const bg = (l.bgWords||[]).map(w=>w.text).join("") || (l.bgText||"");
                return bg ? `${main} ${bg}` : main;
              };
              const lrcText = isSync
                ? lyrics.map(l => {
                    const lineText = lrcLineText(l);
                    if (l.time < 0) return lineText;
                    const mm = String(Math.floor(l.time / 60)).padStart(2, "0");
                    const ss = String(Math.floor(l.time % 60)).padStart(2, "0");
                    const cs = String(Math.floor((l.time % 1) * 100)).padStart(2, "0");
                    return `[${mm}:${ss}.${cs}] ${lineText}`;
                  }).join("\n")
                : lyrics.map(lrcLineText).join("\n");
              const { save } = await import("@tauri-apps/plugin-dialog");
              const { writeTextFile } = await import("@tauri-apps/plugin-fs");
              const safeTitle = (track?.title || "lyrics").replace(/[<>:"/\\|?*]/g, "_");
              const filePath = await save({
                title: translate(language, "saveLrc"),
                defaultPath: `${safeTitle}.lrc`,
                filters: [{ name: "LRC", extensions: ["lrc"] }, { name: "Text", extensions: ["txt"] }],
              });
              if (!filePath) return;
              await writeTextFile(filePath, lrcText);
            } catch (e) { console.error(e); }
          };
          const removeFromPlaylist = async () => {
            // Optimistic: burst the row + drop it (and decrement total so the virtualized list
            // doesn't render a phantom SkeletonRow for the now-missing slot), then tell the server.
            if (animations) { try { particleBurst(document.querySelector(`[data-track-id="${CSS.escape(track.videoId)}"]`)); } catch {} }
            setCollection(c => c ? { ...c, tracks: c.tracks.filter(t => t.videoId !== track.videoId || t.setVideoId !== track.setVideoId), total: Math.max(0, (c.total ?? c.tracks.length) - 1) } : c);
            try {
              await fetch(`${API}/playlist/${trackContextMenu.playlistId}/remove`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videos: [{ videoId: track.videoId, setVideoId: track.setVideoId }] }),
              });
            } catch {}
          };
          const removeDownload = async () => {
            try {
              await fetch(`${API}/song/cached/${track.videoId}`, { method: "DELETE" });
              setCachedSongIds(prev => { const s = new Set(prev); s.delete(track.videoId); return s; });
            } catch {}
          };

          return (
            <ContextMenu x={trackContextMenu.x} y={trackContextMenu.y} zoom={uiZoom}
              onClose={() => setTrackContextMenu(null)} ariaLabel={track.title || "Track"} minWidth={210}>
              <DropdownSection>
                {/* Add to playlist — opens a dedicated modal with search + rich rows */}
                <CtxItem icon={<Plus size={15} />} label={translate(language, "addToPlaylist")}
                  onSelect={() => setAddToPlaylistFor({ tracks: [track] })} />

                <CtxItem icon={<Queue size={15} />} label={translate(language, "playNext")}
                  onSelect={() => { enqueue(track, "next"); addToast(translate(language, "addedNext") || "Als Nächstes eingereiht", "success"); }} />
                <CtxItem icon={<Queue size={15} />} label={translate(language, "addToQueue")}
                  onSelect={() => { enqueue(track, "end"); addToast(translate(language, "addedQueue") || "Zur Warteschlange hinzugefügt", "success"); }} />
                <CtxItem icon={<Radio size={15} />} label={translate(language, "startRadio")}
                  onSelect={() => startSongRadio(track)} />

                <DropdownItem textValue={ctxLiked ? translate(language, "unlike") : translate(language, "like")}
                  onAction={() => handleToggleLike(track)}
                  className={ctxLiked ? "text-accent! data-[focused]:text-accent! data-[hovered]:text-accent!" : undefined}>
                  <span className="w-4 flex justify-center shrink-0"><Heart size={15} weight={ctxLiked ? "fill" : "regular"} /></span>
                  {ctxLiked ? translate(language, "unlike") : translate(language, "like")}
                </DropdownItem>

                {showRemovePl ? (
                  <CtxItem icon={<X size={15} />} danger label={translate(language, "removeFromPlaylist")}
                    onSelect={removeFromPlaylist} />
                ) : null}
                {showRemoveHist ? (
                  <CtxItem icon={<X size={15} />} danger label={translate(language, "removeFromHistory")}
                    onSelect={() => trackContextMenu.removeFromHistory()} />
                ) : null}
              </DropdownSection>

              {showAlbumNav || showArtistNav ? (
                <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                  {showAlbumNav ? (
                    <CtxItem icon={<VinylRecord size={15} />} label={translate(language, "goToAlbum")}
                      onSelect={() => openAlbum({ browseId: track.albumBrowseId, title: track.album }, view)} />
                  ) : null}
                  {artistList.length > 0
                    ? artistList.map((a, i) => {
                        const browseId = a.browseId || a.id;
                        const name = a.name || "";
                        return (
                          <CtxItem key={browseId || i} id={`artist-${browseId || i}`}
                            icon={<Microphone size={15} />}
                            label={`${translate(language, "goToArtist")}${name ? `: ${name}` : ""}`}
                            textValue={`${translate(language, "goToArtist")} ${name}`}
                            onSelect={() => openArtist({ browseId, artist: name }, view)} />
                        );
                      })
                    : (track.artistBrowseId ? (
                        <CtxItem icon={<Microphone size={15} />} label={translate(language, "goToArtist")}
                          onSelect={() => openArtist({ browseId: track.artistBrowseId }, view)} />
                      ) : null)
                  }
                </DropdownSection>
              ) : null}

              <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                <DropdownSubmenuTrigger>
                  <DropdownItem textValue={translate(language, "share")}>
                    <span className="w-4 flex justify-center shrink-0"><ShareNodes size={15} /></span>
                    {translate(language, "share")}
                    <DropdownSubmenuIndicator className="ml-auto" />
                  </DropdownItem>
                  <DropdownPopover className="min-w-56">
                    <DropdownMenu aria-label={translate(language, "share")}>
                      <DropdownSection>
                        <CtxItem icon={<ShareNodes size={15} />} label={translate(language, "copyShareLink")}
                          onSelect={() => copyShare(buildShareLink(track))} />
                        <CtxItem icon={<Copy size={15} />} label={translate(language, "copyYtMusicLink")}
                          onSelect={() => copyShare(`https://music.youtube.com/watch?v=${track.videoId}`)} />
                        <CtxItem icon={<Copy size={15} />} label={translate(language, "copyYoutubeLink")}
                          onSelect={() => copyShare(`https://youtube.com/watch?v=${track.videoId}`)} />
                      </DropdownSection>
                    </DropdownMenu>
                  </DropdownPopover>
                </DropdownSubmenuTrigger>
              </DropdownSection>

              <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                {isCached ? (
                  <CtxItem icon={<Trash size={15} />} danger label={translate(language, "removeDownload")}
                    onSelect={removeDownload} />
                ) : (!downloadingIds.has(track.videoId) ? (
                  <CtxItem icon={<DownloadSimple size={15} />} label={translate(language, "download")}
                    onSelect={() => handleDownloadSong(track)} />
                ) : null)}
                <CtxItem icon={<MusicNote size={15} />} label={translate(language, "saveAsMp3")}
                  onSelect={() => handleExportSong(track, "mp3")} />
                <CtxItem icon={<MusicNote size={15} />} label={translate(language, "saveAsOpus")}
                  onSelect={() => handleExportSong(track, "opus")} />
              </DropdownSection>

              <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                <CtxItem icon={<Copy size={15} />} label={translate(language, "copyLyrics")}
                  onSelect={copyLyrics} />
                <CtxItem icon={<DownloadSimple size={15} />} label={translate(language, "saveLrc")}
                  onSelect={saveLrc} />
              </DropdownSection>
            </ContextMenu>
          );
        })()}

        {/* Global playlist context menu */}
        {globalContextMenu && (() => {
          const pl = globalContextMenu.playlist;
          const isPinned = pinnedIds.includes(itemId(pl));
          const showAlbumNav = pl?.browseId && pl?.type !== "artist";
          const showArtistNav = !!pl?.artistBrowseId;
          const isUserPlaylist = pl?.playlistId && pl?.type !== "album" && pl?.owned !== false;
          // Playlists are shareable (not albums/artists). The raw list id is the
          // playlistId, or the search browseId with its "VL" prefix stripped.
          const isPlaylistShare = pl && pl.type !== "album" && pl.type !== "artist" && (pl.playlistId || pl.browseId);
          const plShareId = (pl?.playlistId || pl?.browseId || "").replace(/^VL/, "");
          return (
            <ContextMenu x={globalContextMenu.x} y={globalContextMenu.y} zoom={uiZoom}
              onClose={() => setGlobalContextMenu(null)} ariaLabel="Playlist" minWidth={190}>
              <DropdownSection>
                <CtxItem icon={<PushPin size={15} />}
                  label={isPinned ? translate(language, "unpin") : translate(language, "pin")}
                  onSelect={() => togglePin(pl)} />
                <CtxItem icon={<DotsThreeVertical size={16} />} label={translate(language, "open")}
                  onSelect={() => {
                    if (pl?.type === "album") openAlbum(pl, view);
                    else if (pl?.type === "artist") openArtist(pl, view);
                    else openPlaylist(pl, view);
                  }} />
              </DropdownSection>
              {isPlaylistShare && plShareId ? (
                <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                  <CtxItem icon={<ShareNodes size={15} />} label={translate(language, "copyYtMusicLink")}
                    onSelect={() => navigator.clipboard.writeText(`https://music.youtube.com/playlist?list=${plShareId}`).then(() => toast.success(translate(language, "linkCopied"))).catch(() => {})} />
                  <CtxItem icon={<Copy size={15} />} label={translate(language, "copyYoutubeLink")}
                    onSelect={() => navigator.clipboard.writeText(`https://youtube.com/playlist?list=${plShareId}`).then(() => toast.success(translate(language, "linkCopied"))).catch(() => {})} />
                </DropdownSection>
              ) : null}
              {(showAlbumNav || showArtistNav) ? (
                <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                  {showAlbumNav ? (
                    <CtxItem icon={<VinylRecord size={15} />} label={translate(language, "goToAlbum")}
                      onSelect={() => openAlbum(pl, view)} />
                  ) : null}
                  {showArtistNav ? (
                    <CtxItem icon={<Microphone size={15} />} label={translate(language, "goToArtist")}
                      onSelect={() => openArtist({ browseId: pl.artistBrowseId }, view)} />
                  ) : null}
                </DropdownSection>
              ) : null}
              {(isUserPlaylist || !isPinned) ? (
                <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                  {isUserPlaylist ? (
                    <CtxItem icon={<PencilSimple size={15} />} label={translate(language, "renamePlaylist")}
                      onSelect={() => setRenameDialog({ playlistId: pl.playlistId, title: pl.title })} />
                  ) : null}
                  {isUserPlaylist ? (
                    <CtxItem icon={<Trash size={15} />} danger label={translate(language, "deletePlaylist")}
                      onSelect={() => setDeleteDialog({ playlistId: pl.playlistId, title: pl.title })} />
                  ) : null}
                  {!isPinned ? (
                    <CtxItem icon={<X size={16} />} danger label={translate(language, "removeFromRecent")}
                      onSelect={() => removeRecentPlaylist(itemId(pl))} />
                  ) : null}
                </DropdownSection>
              ) : null}
            </ContextMenu>
          );
        })()}

        {/* Rename Playlist Dialog */}
        {renameDialog && (
          <RenamePlaylistModal
            dialog={renameDialog}
            onClose={() => setRenameDialog(null)}
            t={(key) => translate(language, key)}
          />
        )}

        {/* Delete Playlist Confirm Dialog */}
        {deleteDialog && (
          <DeletePlaylistModal
            dialog={deleteDialog}
            onClose={() => setDeleteDialog(null)}
            t={(key) => translate(language, key)}
            onConfirm={async () => {
              const pid = deleteDialog.playlistId;
              const fromCollection = view === "collection" && collection?.playlistId === pid;
              setDeleteDialog(null);
              removeRecentPlaylist(pid);
              if (!fromCollection) {
                // Library grid: dissolve the card (burst + fade), then remove just that one card
                // locally — no full library refetch, so the grid never flashes empty.
                const remove = () => window.dispatchEvent(new CustomEvent("kiyoshi-playlist-removed", { detail: pid }));
                requestAnimationFrame(() => {
                  const el = document.querySelector(`[data-card-id="${CSS.escape(pid)}"]`);
                  if (animations && el) dissolve(el, remove); else remove();
                });
                fetch(`${API}/playlist/${pid}`, { method: "DELETE" }).catch(() => {});
              } else {
                // Deleting the currently open playlist: delete first, then go back to a fresh library.
                try { await fetch(`${API}/playlist/${pid}`, { method: "DELETE" }); } catch {}
                window.dispatchEvent(new Event("kiyoshi-library-updated"));
                setView("library");
              }
            }}
          />
        )}
      </div>
    </PlaybackPrefsProvider>
    </LyricsPrefsProvider>
    </ZoomContext.Provider>
    </FontScaleContext.Provider>
    </AnimationContext.Provider>
    </TrackNumberContext.Provider>
    </LangContext.Provider>
    </IconContext.Provider>
    </I18nProvider>
  );
}
