import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import { cn, Button, ListBox, ListBoxItem, Disclosure, DisclosureHeading, DisclosureTrigger, DisclosureContent, DisclosureBody, DisclosureIndicator, Dropdown, DropdownTrigger, DropdownPopover, DropdownMenu, DropdownItem, DropdownSection, DropdownSubmenuTrigger, DropdownSubmenuIndicator, ModalRoot, ModalBackdrop, ModalContainer, ModalDialog, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalFooter, ModalCloseTrigger, SliderRoot, SliderTrack, SliderFill, SliderThumb, toast, ToastProvider, Spinner, ProgressBar, ProgressBarTrack, ProgressBarFill, SearchFieldRoot, SearchFieldGroup, SearchFieldSearchIcon, SearchFieldInput, SearchFieldClearButton, TextFieldRoot, InputRoot, TextArea, SwitchRoot, SwitchControl, SwitchThumb, CardRoot,
 ColorAreaRoot, ColorAreaThumb, ColorSliderRoot, ColorSliderTrack, ColorSliderThumb, ColorSwatchRoot, KbdRoot, KbdContent,
 Skeleton, ToggleButton, ToggleButtonGroupRoot, ScrollShadowRoot, ChipRoot, ChipLabel } from "@heroui/react";
import { parseColor } from "react-aria-components";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
const appWindow = getCurrentWebviewWindow();
import { openUrl } from "@tauri-apps/plugin-opener";
import { LANGUAGES, translate, translationProgress } from "./i18n.js";
import { normalizeOverlayDoc } from "./overlay/schema.js";
import OverlayEditor from "./overlay/OverlayEditor.jsx";
import { audioLevels, startAudioLevels } from "./audioLevels.js";
import { generateIdentity, importIdentityFile, exportIdentityFile, buildSignedRequest } from "./unison/identity.js";
import {
  IconContext,
  Minus, X, Play, Pause,
  House, Books, Heart,
  CaretLineLeft, CaretLineRight,
  CaretLeft, CaretRight,
  MagnifyingGlass, Gear, Palette, PlayCircle, Microphone,
  VinylRecord, MusicNote, Playlist, ImageSquare,
  DotsSixVertical,
  GripLines,
  Shuffle, SkipBack, SkipForward, Repeat, RepeatOnce,
  SpeakerX, SpeakerLow, SpeakerHigh,
  Queue, ChatText,
  CaretUp, CaretDown, Flag,
  ArrowsIn, ArrowsOut,
  ArrowLeft,
  ArrowClockwise,
  Check,
  DotsThreeVertical,
  PushPin,
  ClockCounterClockwise,
  Clock,
  CaretLineUp,
  CheckCircle,
  Plus,
  DownloadSimple,
  Trash,
  PencilSimple,
  ArrowCircleUp,
  Copy,
  ArrowSquareOut,
  SunHorizon,
  Sun,
  CloudSun,
  Moon,
  MoonStars,
  Translate,
  Link,
  UploadSimple,
  PersonArmsSpread,
  Keyboard,
  PaintBrushBroad,
  HardDrives,
  ArrowsClockwise,
  Crown,
  UserPlus,
  UserCheck,
  WifiHigh,
  WifiX,
  Bug,
  TextSize,
  Sliders,
  Eye,
  EyeSlash,
  Tag,
  CircleHalf,
  WaveformLines,
  Radio,
  Sparkles,
  ShareNodes,
  Globe,
  Lock,
  LockOpen,
  Key,
  ScreencastSimple,
  CircleFill,
  Robot,
  Headphones,
  PodcastIcon,
  Eyedropper,
  Info,
  WarningCircle,
  Star,
  BrandTwitch,
  BrandYoutube,
  BrandLastfm,
  BrandBluesky,
  BrandTiktok,
  UserCircle,
  Users,
  SignOut,
  Power,
  Bell,
  Megaphone,
  PaperPlaneTilt,
} from "./icons.jsx";

const API = "http://localhost:9847";


async function openOverlayEditor() {
  const existing = await WebviewWindow.getByLabel("overlay-editor");
  if (existing) { await existing.setFocus(); return; }
  new WebviewWindow("overlay-editor", {
    url: "/?overlayEditor=1",
    title: "Overlay Editor — Kodama",
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    resizable: true,
    center: true,
    decorations: false,
  });
}

// Open Boidu's Composer (community-lyrics editor) in its own Kodama window, pre-filled
// with the current track and pre-configured to use Kodama as its audio bridge. Window
// creation + the settings-seeding init script run in Rust (open_composer_window).
async function openComposer(videoId) {
  const { invoke } = await import("@tauri-apps/api/core");
  // Pause Kodama's own playback so the main player and the Composer's editor audio
  // don't play simultaneously (the App player component listens for this).
  try { window.dispatchEvent(new Event("kodama-pause-playback")); } catch {}
  // Theme the composer with Kodama's current colours (applied as CSS-variable overrides).
  const overrides = {};
  try {
    const cs = getComputedStyle(document.documentElement);
    const read = (n) => cs.getPropertyValue(n).trim();
    const valid = (x) => x && /^[#0-9a-zA-Z(),.%\s-]{1,60}$/.test(x);
    const put = (composerVar, val) => { if (valid(val)) overrides[composerVar] = val; };
    const accent = read("--accent");
    put("--color-composer-accent", accent);
    put("--color-composer-accent-dark", accent);
    put("--color-composer-accent-darker", accent);
    put("--color-composer-accent-text", accent);
    put("--color-composer-link", accent);
    // The composer is dark-only — only theme its surfaces/text when Kodama is on a dark theme.
    if (document.documentElement.getAttribute("data-theme") !== "light") {
      put("--color-composer-bg", read("--bg-base"));
      put("--color-composer-bg-dark", read("--bg-base"));
      put("--color-composer-bg-elevated", read("--bg-elevated"));
      put("--color-composer-border", read("--border"));
      put("--color-composer-border-hover", read("--bg-hover"));
      put("--color-composer-button", read("--bg-elevated"));
      put("--color-composer-button-hover", read("--bg-hover"));
      put("--color-composer-input", read("--bg-elevated"));
      put("--color-composer-text", read("--text-primary"));
      put("--color-composer-text-secondary", read("--text-secondary"));
      put("--color-composer-text-muted", read("--text-muted"));
      put("--color-composer-text-tertiary", read("--text-muted"));
    }
  } catch {}
  return invoke("open_composer_window", { videoId: videoId || null, overrides });
}

// SHA-256 hash of a PIN string (hex). Used for PIN protection storage — never stores plain text.
async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Debug Console Interceptor ───────────────────────────────────────────────
// Captures all console.log/warn/error/info calls into a ring buffer so the
// Debug tab in Settings can display them even if DevTools is not open.
const _frontendLogs = [];
const _MAX_FRONTEND_LOGS = 500;
(function _setupDebugInterceptor() {
  const _orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  ["log", "warn", "error", "info"].forEach(level => {
    console[level] = (...args) => {
      _orig[level](...args);
      const msg = args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === "object" && a !== null) { try { return JSON.stringify(a); } catch { return String(a); } }
        return String(a);
      }).join(" ");
      _frontendLogs.push({ ts: Date.now() / 1000, level: level.toUpperCase(), msg, source: "frontend" });
      if (_frontendLogs.length > _MAX_FRONTEND_LOGS) _frontendLogs.shift();
    };
  });
})();

// ─── App Version ─────────────────────────────────────────────────────────────
const APP_VERSION = "1.0.0-alpha.25";

// Published news feed (edit + commit updates/news.json in the public Kodama repo).
const NEWS_URL = "https://raw.githubusercontent.com/KiyoshiTheDevil/Kodama/master/updates/news.json";

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

// Short, human-readable OS string for bug-report diagnostics.
const OS_INFO = (() => {
  const ua = navigator.userAgent || "";
  let os = navigator.platform || "Unknown";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux|X11/.test(ua)) os = "Linux";
  const arch = /x64|Win64|WOW64|x86_64/.test(ua) ? "x64" : (/arm64|aarch64/i.test(ua) ? "arm64" : "");
  return arch ? `${os} · ${arch}` : os;
})();

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

const LangContext = createContext("de");
const useLang = () => {
  const lang = useContext(LangContext);
  return (key, vars) => translate(lang, key, vars);
};

// Proxy YouTube thumbnails through local server to avoid CORS issues
const thumb = (url) => url ? `${API}/imgproxy?url=${encodeURIComponent(url)}` : "";

// ─── Animation Context ──────────────────────────────────────────────────────
const AnimationContext = createContext(true);
const useAnimations = () => useContext(AnimationContext);

// ─── Zoom Context ─────────────────────────────────────────────────────────────
const ZoomContext = createContext(1);
const useZoom = () => useContext(ZoomContext);

// ─── Font Scale Context ───────────────────────────────────────────────────────
const FontScaleContext = createContext(1);
const useFontScale = () => useContext(FontScaleContext);

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

// Stepped values for the zoom and font-size sliders
const ZOOM_STEPS      = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
const ZOOM_LABELS     = ["80%", "90%", "100%", "110%", "120%", "130%", "140%", "150%"];
const FONT_STEPS      = [0.85, 0.93, 1.0, 1.10, 1.20, 1.35, 1.50];
const FONT_LABELS     = FONT_STEPS.map(s => `${Math.round(13 * s)}px`);

const DEFAULT_SHORTCUTS = {
  playPause:   "Space",
  nextTrack:   "ArrowRight",
  prevTrack:   "ArrowLeft",
  volUp:       "ArrowUp",
  volDown:     "ArrowDown",
  fullscreen:  "KeyF",
  mute:        "KeyM",
  lyrics:      "KeyL",
  seekBack:    "Comma",
  seekForward: "Period",
  zoomIn:      "Ctrl+Equal",
  zoomOut:     "Ctrl+Minus",
};

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

// Spring physics: returns a CSS transition string
function spring(prop, opts = {}) {
  const { stiffness = "0.4s", fn = "cubic-bezier(0.34,1.56,0.64,1)" } = opts;
  return `${prop} ${stiffness} ${fn}`;
}

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

function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  if (!text) return children;

  const hide = () => {
    clearTimeout(showTimer.current);
    if (visible) {
      setLeaving(true);
      hideTimer.current = setTimeout(() => { setVisible(false); setLeaving(false); }, 120);
    }
  };

  return (
    <span style={{ display: "contents" }}
      onMouseEnter={e => {
        clearTimeout(hideTimer.current);
        setLeaving(false);
        const el = e.currentTarget.firstElementChild || e.target;
        const r = el.getBoundingClientRect();
        setPos({ x: r.left + r.width / 2, y: r.top });
        clearTimeout(showTimer.current);
        showTimer.current = setTimeout(() => setVisible(true), 350);
      }}
      onMouseLeave={hide}
    >
      {children}
      {visible && createPortal(
        <div style={{
          position: "fixed", left: pos.x, top: pos.y - 6,
          transform: "translate(-50%, -100%)",
          background: "var(--bg-elevated)", color: "var(--text-primary)",
          padding: "5px 9px", borderRadius: 6,
          fontSize: "var(--t11)", fontWeight: 500,
          pointerEvents: "none", zIndex: 99999,
          border: "0.5px solid var(--border)",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          animation: `${leaving ? "tooltipOut" : "tooltipIn"} 0.12s ease forwards`,
        }}>{text}</div>,
        document.body
      )}
    </span>
  );
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
        this._fire("loadedmetadata");
        this._fire("canplay");
      });
      listen("audio-error", ({ payload }) => {
        if (this._fallback) return;
        console.error("[IpcAudio] Rust decode error:", payload);
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
    if (this._fb) { this._fb.src = url; }
    else if (this._fb === null && this._probePromise) {
      // Probe still running — queue replay
      this._probePromise.then(() => { if (this._fb) this._fb.src = url; });
    }
  }

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

function ExplicitBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "var(--text-muted)", color: "var(--bg-primary)",
      borderRadius: 3, fontSize: 9, fontWeight: 700, padding: "1px 4px",
      letterSpacing: "0.05em", flexShrink: 0, lineHeight: 1.2, userSelect: "none",
    }}>E</span>
  );
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
    width: 36, height: 28, borderRadius: 5,
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

function formatDuration(str) {
  if (!str) return "";
  return str;
}

/**
 * Renders artist names as individual clickable spans (supports arrays of artist objects).
 * Falls back to a single span using track.artistBrowseId when artists is a plain string.
 */
function ArtistLinks({ track, onOpenArtist, onBeforeNavigate, style }) {
  const base = { cursor: "default", transition: "color 0.15s", ...style };
  const hover   = e => { e.currentTarget.style.color = "var(--accent)"; };
  const unhover = e => { e.currentTarget.style.color = ""; };

  // Prefer artistLinks from backend (has individual browseIds per artist)
  const links = track?.artistLinks;
  if (Array.isArray(links) && links.length > 0) {
    return links.map((a, i) => (
      <React.Fragment key={i}>
        {i > 0 && ", "}
        {a.browseId && onOpenArtist
          ? <span
              onClick={e => { e.stopPropagation(); onBeforeNavigate?.(); onOpenArtist({ browseId: a.browseId, artist: a.name }); }}
              style={base} onMouseEnter={hover} onMouseLeave={unhover}
            >{a.name}</span>
          : a.name}
      </React.Fragment>
    ));
  }

  // Fallback: single artistBrowseId (old data / SQLite cache)
  const artists = track?.artists;
  if (track?.artistBrowseId && onOpenArtist) {
    return (
      <span
        onClick={e => { e.stopPropagation(); onBeforeNavigate?.(); onOpenArtist({ browseId: track.artistBrowseId, artist: artists }); }}
        style={base} onMouseEnter={hover} onMouseLeave={unhover}
      >{artists}</span>
    );
  }
  return artists ?? null;
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

// Shared enter/exit animation for HeroUI dropdown popovers (context menus, account menu).
const CTX_POPOVER_ANIM =
  "data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-top-1 data-[entering]:duration-150 data-[entering]:ease-out " +
  "data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:slide-out-to-top-1 data-[exiting]:duration-100 data-[exiting]:ease-in";

// Reusable cursor-anchored HeroUI context menu. Renders a hidden, zero-size trigger
// at the cursor position (in pre-zoom coordinates) and opens a real HeroUI Dropdown
// popover anchored to it. react-aria handles viewport clamping, Esc / outside-click
// (→ onClose), keyboard navigation and typeahead. Pass real HeroUI <DropdownItem>s
// (and <DropdownSection>s / submenus) as children via a render function that receives
// `close` for items that must dismiss the menu after an async action.
function ContextMenu({ x, y, zoom = 1, onClose, ariaLabel, minWidth = 200, children }) {
  const anchorRef = useRef(null);
  return (
    <Dropdown isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <DropdownTrigger
        ref={anchorRef}
        aria-hidden="true"
        tabIndex={-1}
        className="fixed w-0 h-0 min-w-0 p-0 m-0 opacity-0 pointer-events-none border-0"
        style={{ left: x / zoom, top: y / zoom }}
      />
      <DropdownPopover triggerRef={anchorRef} placement="bottom start" className={CTX_POPOVER_ANIM}>
        {/* Scale the menu content with the app zoom — the popover itself is portalled to
            <body> (outside the zoomed app container), so without this it would render at
            100% while the rest of the UI is zoomed. Zooming the content (not the
            positioned popover) keeps react-aria's anchor placement correct. */}
        <DropdownMenu aria-label={ariaLabel} style={{ minWidth, zoom }}>
          {children}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}

// Convenience wrapper for a HeroUI dropdown item with a leading icon. `danger` tints
// the row red (incl. focus state). `onSelect` runs on activation.
function CtxItem({ icon: Icon, label, onSelect, danger, id, textValue }) {
  return (
    <DropdownItem
      id={id}
      textValue={textValue || (typeof label === "string" ? label : undefined)}
      onAction={onSelect}
      className={danger ? "text-[#e05252]! data-[focused]:text-[#e05252]! data-[hovered]:text-[#e05252]!" : undefined}
    >
      {Icon ? <span className="w-4 flex justify-center shrink-0">{Icon}</span> : null}
      {label}
    </DropdownItem>
  );
}

// "Add to playlist" modal. A dedicated dialog (own focus scope) instead of a nested
// menu — so the search field works without fighting a parent menu's focus management,
// and each playlist row has room for a cover, title and track count. `tracks` is the
// list of tracks to add (one from the context menu, many from a multi-selection).
function AddToPlaylistModal({ tracks, onClose, onNewPlaylist, onAdded }) {
  const t = useLang();
  const [playlists, setPlaylists] = useState(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/library/playlists`).then(r => r.json())
      .then(d => { if (!cancelled) setPlaylists(d.playlists || []); })
      .catch(() => { if (!cancelled) setPlaylists([]); });
    return () => { cancelled = true; };
  }, []);

  const query = q.trim().toLowerCase();
  const filtered = (playlists || []).filter(pl => (pl.title || "").toLowerCase().includes(query));

  const countLabel = (c) => {
    if (!c) return null;
    const s = String(c);
    return /^\d+$/.test(s) ? `${s} ${t("songs")}` : s;
  };

  const add = async (pl) => {
    if (busyId) return;
    setBusyId(pl.playlistId);
    try {
      await fetch(`${API}/playlist/${pl.playlistId}/add`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: tracks.map(tr => tr.videoId), tracks }),
      });
      toast.success(t("addedToPlaylist", { title: pl.title }), { timeout: 3000 });
      onAdded?.();
    } catch {}
    setBusyId(null);
    onClose();
  };

  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="sm" className="w-[440px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Playlist size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("addToPlaylist")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-3">
                <SearchFieldRoot aria-label={t("search")} value={q} onChange={setQ} className="w-full">
                  <SearchFieldGroup>
                    <SearchFieldSearchIcon><MagnifyingGlass size={16} /></SearchFieldSearchIcon>
                    <SearchFieldInput autoFocus placeholder={t("search")} />
                    <SearchFieldClearButton />
                  </SearchFieldGroup>
                </SearchFieldRoot>

                <Button variant="ghost" fullWidth className="justify-start gap-2.5 px-3 rounded-xl text-accent"
                  onPress={() => { onClose(); onNewPlaylist(); }}>
                  <Plus size={16} weight="bold" />
                  {t("newPlaylist")}
                </Button>

                <div className="h-[46vh] overflow-y-auto -mx-1 px-1">
                  {playlists === null ? (
                    <div className="h-full flex items-center justify-center"><Spinner size="sm" /></div>
                  ) : filtered.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted text-t12">{t("noPlaylists")}</div>
                  ) : (
                  <div className="flex flex-col gap-1">
                  {filtered.map((pl, i) => (
                    <button key={pl.playlistId || i}
                      onClick={() => add(pl)}
                      disabled={!!busyId}
                      className="flex items-center gap-3 p-2 rounded-xl text-left transition-colors duration-150 border-none bg-transparent w-full hover:bg-hover disabled:opacity-60"
                    >
                      <div className="w-11 h-11 rounded-lg bg-elevated shrink-0 overflow-hidden flex items-center justify-center text-muted">
                        {pl.thumbnail
                          ? <img src={thumb(pl.thumbnail)} alt="" className="w-full h-full object-cover" />
                          : <Playlist size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-t13 font-medium truncate">{pl.title}</div>
                        {countLabel(pl.count) ? <div className="text-t11 text-muted truncate">{countLabel(pl.count)}</div> : null}
                      </div>
                      {busyId === pl.playlistId
                        ? <Spinner size="sm" className="shrink-0" />
                        : <Plus size={16} className="text-muted shrink-0" />}
                    </button>
                  ))}
                  </div>
                  )}
                </div>
              </div>
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

function TrackRow({ track, isPlaying, onPlay, onOpenArtist, onContextMenu }) {
  const anim = useAnimations();
  return (
    <div
      onClick={() => onPlay(track)}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(e, track); } : undefined}
      className={`flex items-center gap-3 px-4 py-2 rounded-[var(--radius)] cursor-default transition-colors ${
        isPlaying ? "bg-accent-dim" : "hover:bg-hover"
      }`}
    >
      <div className="relative w-11 h-11 shrink-0 overflow-hidden rounded-md bg-elevated">
        {track.thumbnail
          ? <img src={thumb(track.thumbnail)} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-[linear-gradient(135deg,#2a1535,#1a0a25)]" />}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/50">
            {anim
              ? [1, 2, 3].map(b => (
                  <div
                    key={b}
                    className="w-[3px] rounded-[2px] bg-accent"
                    style={{ animation: `eqBar${b} ${0.6 + b * 0.15}s ease-in-out infinite`, animationDelay: `${b * 0.1}s` }}
                  />
                ))
              : <Pause size={15} className="text-accent" />}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <div className={`flex items-center gap-1 overflow-hidden text-t13 font-medium transition-colors ${isPlaying ? "text-accent" : "text-primary"}`}>
          <span className="truncate min-w-0">{track.title}</span>
          {track.isExplicit && <ExplicitBadge />}
        </div>
        <div className="text-t12 text-secondary truncate">
          <ArtistLinks track={track} onOpenArtist={onOpenArtist} />
          {track.album ? ` · ${track.album}` : ""}
        </div>
      </div>
      <div className="text-t12 text-muted shrink-0">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
}

const SIDEBAR_EXPANDED = 288;   // default expanded width
const SIDEBAR_COLLAPSED = 56;
const SIDEBAR_MIN = 230;        // min when dragging
const SIDEBAR_MAX = 440;        // max when dragging
const SPLIT_MIN = 0.22;         // min/max cover-pane fraction in the fullscreen split view
const SPLIT_MAX = 0.78;
const QUEUE_DEFAULT = 360;      // default queue panel width
const QUEUE_MIN = 320;          // min when dragging
const QUEUE_MAX = 620;          // max when dragging

function Sidebar({ view, setView, onSearch, collapsed, onToggleCollapse, onOpenSettings, onOpenAccountTab, onOpenUpdateTab, onOpenOverlaySettings, onCloseOverlay, onOpenPlaylist, onOpenAlbum, onOpenArtist, onAddRecent, onContextMenu, currentProfileData, onOpenProfileSwitcher, profiles, onSwitchProfile, onAddProfile, onDeleteProfile, onReauthProfile, onLogout, onCreatePlaylist, updateInfo, offlineMode, isActuallyOffline, onToggleOffline, onRefreshView, obsEnabled, onOpenNews, onOpenFeedback, newsUnread = 0, settingsOpen, hideUserHandle }) {
  const [query, setQuery] = useState("");
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
      onAction={(key) => { setView(key); onCloseOverlay?.(); }}
      className="w-full"
    >
      {items.map(item => (
        <ListBoxItem
          key={item.id}
          id={item.id}
          textValue={item.label}
          className={cn(
            "text-t13 min-h-10 rounded-xl",
            view === item.id && "bg-accent-dim text-accent",
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
    <Disclosure defaultExpanded>
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
              style={{ background: "rgba(244,67,54,0.28)", transform: quitHolding ? "scaleX(1)" : "scaleX(0)", transition: quitHolding ? "transform 1s linear" : "transform 0.15s ease" }} />
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
            <div className="flex-1 min-w-0" style={{ contain: "layout style" }}>
              <SearchFieldRoot value={query} onChange={setQuery} onSubmit={handleSubmit} className="w-full">
                <SearchFieldGroup>
                  <SearchFieldSearchIcon><MagnifyingGlass size={16} /></SearchFieldSearchIcon>
                  <SearchFieldInput placeholder={t("search")} />
                  <SearchFieldClearButton />
                </SearchFieldGroup>
              </SearchFieldRoot>
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
        <div className="px-3 mb-3" style={{ contain: "layout style" }}>
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
        <div className={cn("overflow-y-auto flex-1 min-h-0 my-1", collapsed ? "px-0" : "px-2")}>
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
                  color: isActuallyOffline ? "#f0b429" : "var(--text-muted)",
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

// Alternate app icons for personalization (live: taskbar/window/tray + macOS Dock & bundle).
// `file` matches the PNGs in public/App-Icons/ (also bundled as a Tauri resource for Rust).
const APP_ICON_DEFAULT = "Kodama App Icon - Standard Pink.png";

// Universal share link → GitHub-Pages redirect page (tries kodama://, falls back to YT Music).
// Works for everyone regardless of whether they have Kodama installed.
const KODAMA_SHARE_BASE = "https://kiyoshithedevil.github.io/Kodama/s/";
const APP_ICON_GROUPS = [
  { id: "default", labelKey: "appIconDefault", icons: [
    { label: "Standard Pink",  file: "Kodama App Icon - Standard Pink.png" },
    { label: "Standard White", file: "Kodama App Icon - Standard White.png" },
    { label: "3D Pink",        file: "Kodama App Icon - 3D Pink.png" },
  ]},
  { id: "pride", labelKey: "appIconPride", icons: [
    { label: "Pride",     file: "Kodama App Icon - Pride.png" },
    { label: "Progress",  file: "Kodama App Icon - Progress.png" },
    { label: "Trans",     file: "Kodama App Icon - Trans.png" },
    { label: "Nonbinary", file: "Kodama App Icon - Nonbinary.png" },
    { label: "Asexual",   file: "Kodama App Icon - Asexual.png" },
    { label: "Bisexual",  file: "Kodama App Icon - Bisexual.png" },
    { label: "Lesbian",   file: "Kodama App Icon - Lesbian.png" },
    { label: "Pansexual", file: "Kodama App Icon - Pansexual.png" },
    { label: "Polyamory", file: "Kodama App Icon - Polyamory.png" },
  ]},
];

const ACCENT_PRESETS = [
  // Row 1 — saturated
  { label: "Red",            value: "#e53935" },
  { label: "Orange",         value: "#f4511e" },
  { label: "Amber",          value: "#fb8c00" },
  { label: "Lime",           value: "#7cb342" },
  { label: "Teal",           value: "#00897b" },
  { label: "Cyan",           value: "#0097a7" },
  { label: "Blue",           value: "#1e88e5" },
  { label: "Purple",         value: "#8e24aa" },
  { label: "Pink",           value: "#e91e8c" },
  // Row 2 — medium
  { label: "Salmon",         value: "#ef7070" },
  { label: "Coral",          value: "#f48060" },
  { label: "Gold",           value: "#fba840" },
  { label: "Yellow-Green",   value: "#a0c464" },
  { label: "Medium Teal",    value: "#3aab9f" },
  { label: "Medium Cyan",    value: "#3ab4c4" },
  { label: "Cornflower",     value: "#5ca8ec" },
  { label: "Orchid",         value: "#aa5cc4" },
  { label: "Hot Pink",       value: "#ee60a8" },
  // Row 3 — light
  { label: "Light Red",      value: "#f4a0a0" },
  { label: "Peach",          value: "#f4a890" },
  { label: "Light Amber",    value: "#fcc880" },
  { label: "Light Lime",     value: "#bcd888" },
  { label: "Mint",           value: "#7cccc4" },
  { label: "Light Cyan",     value: "#7cd0dc" },
  { label: "Light Blue",     value: "#94c4f4" },
  { label: "Lavender",       value: "#c494dc" },
  { label: "Light Pink",     value: "#f4a0c8" },
  // Row 4 — pastel
  { label: "Pastel Red",     value: "#f9cece" },
  { label: "Pastel Peach",   value: "#f8ccb8" },
  { label: "Pastel Yellow",  value: "#fde4b8" },
  { label: "Pastel Green",   value: "#d8ecb8" },
  { label: "Pastel Mint",    value: "#b0e0dc" },
  { label: "Pastel Cyan",    value: "#b0e4ec" },
  { label: "Pastel Blue",    value: "#c4dcf8" },
  { label: "Pastel Purple",  value: "#dcbcec" },
  { label: "Pastel Pink",    value: "#f8cce0" },
];

// ── Smoothly fade the global --accent from its current value to a target hex ──
let accentFadeRaf = 0;
function hexToRgb(str) {
  if (!str) return null;
  str = str.trim();
  const m = str.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgb = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  return null;
}
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
function AccentColorPicker({ value, onChange }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#e040fb";
  const [color, setColor] = useState(() => parseColor(safe).toFormat("hsb"));
  useEffect(() => {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      try { setColor(parseColor(value).toFormat("hsb")); } catch {}
    }
  }, [value]);
  const apply = (c) => { const hsb = c.toFormat("hsb"); setColor(hsb); onChange(hsb.toString("hex")); };
  const hex = color.toString("hex");
  return (
    <div className="flex gap-3 items-start mb-3.5">
      {/* Left: preset swatches — HeroUI ColorSwatch filling a full-width grid,
          fixed height + 4 equal rows so it lines up with the picker column. */}
      <div className="grid grid-cols-9 grid-rows-4 gap-1.5 flex-1 min-w-0 h-[210px]">
        {ACCENT_PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            title={p.label}
            className="w-full h-full rounded-md cursor-default transition-transform hover:scale-105 leading-[0]"
            style={value === p.value ? { outline: `2.5px solid ${p.value}`, outlineOffset: 2, borderRadius: 6 } : undefined}
          >
            <ColorSwatchRoot color={p.value} shape="square" className="w-full! h-full!" />
          </button>
        ))}
      </div>

      {/* Divider between presets and the custom picker */}
      <div className="w-px h-[210px] bg-border shrink-0" />

      {/* Vertical hue slider */}
      <ColorSliderRoot aria-label="Hue" value={color} onChange={apply} channel="hue" colorSpace="hsb" orientation="vertical" className="w-7! h-[210px] shrink-0">
        <ColorSliderTrack>
          <ColorSliderThumb />
        </ColorSliderTrack>
      </ColorSliderRoot>

      {/* Color area (saturation / brightness) + preview row */}
      <div className="flex flex-col gap-2">
        <ColorAreaRoot
          aria-label="Saturation and brightness"
          value={color}
          onChange={apply}
          colorSpace="hsb"
          xChannel="saturation"
          yChannel="brightness"
          className="w-[210px] h-[210px] shrink-0 rounded-lg overflow-hidden"
        >
          <ColorAreaThumb />
        </ColorAreaRoot>
        <div className="flex items-center gap-1.5">
          <ColorSwatchRoot color={color} shape="square" size="sm" className="shrink-0" />
          <span className="text-t11 text-muted font-mono uppercase flex-1 truncate">{hex}</span>
          {window.EyeDropper && (
            <Button variant="ghost" size="sm" isIconOnly title="Pipette" onPress={async () => {
              try { const { sRGBHex } = await new window.EyeDropper().open(); if (/^#[0-9a-fA-F]{6}$/.test(sRGBHex)) onChange(sRGBHex); } catch {}
            }}>
              <Eyedropper size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Slider({ min, max, step = 1, value, onChange, onChangeCommit, width = 120 }) {
  // Thin wrapper around HeroUI Slider so existing {min,max,step,value,onChange,onChangeCommit,width} callers stay unchanged.
  return (
    <SliderRoot
      aria-label="slider"
      value={value}
      minValue={min}
      maxValue={max}
      step={step}
      onChange={onChange}
      onChangeEnd={onChangeCommit}
      className="shrink-0"
      style={{ width }}
    >
      <SliderTrack>
        <SliderFill />
        <SliderThumb />
      </SliderTrack>
    </SliderRoot>
  );
}

function Toggle({ value, onChange }) {
  // Thin wrapper around HeroUI Switch so all existing Toggle({value,onChange}) call sites stay unchanged.
  return (
    <SwitchRoot isSelected={!!value} onChange={onChange} aria-label="toggle">
      <SwitchControl>
        <SwitchThumb />
      </SwitchControl>
    </SwitchRoot>
  );
}

function SettingRow({ label, description, icon, children }) {
  return (
    <CardRoot variant="secondary" className="bg-surface-1 flex flex-row items-center justify-between gap-4 px-[18px] py-4 mb-1.5">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-[30px] h-[30px] rounded-md shrink-0 flex items-center justify-center text-accent">
            {React.cloneElement(icon, { size: 15 })}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-t13 font-medium text-primary">{label}</div>
          {description && <div className="text-t11 text-muted mt-0.5 leading-snug">{description}</div>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </CardRoot>
  );
}

// Last.fm connect/disconnect row. Uses the desktop auth flow: connect → open browser
// → user authorizes → "I've authorized" exchanges the token for a session key.
function LastfmRow() {
  const t = useLang();
  const [status, setStatus] = useState({ enabled: true, connected: false, username: "" });
  const [phase, setPhase] = useState("idle"); // idle | awaiting | working
  const tokenRef = useRef(null);

  const loadStatus = useCallback(() => {
    fetch(`${API}/lastfm/status`).then(r => r.json()).then(setStatus).catch(() => {});
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const startConnect = async () => {
    setPhase("working");
    try {
      const d = await fetch(`${API}/lastfm/connect`).then(r => r.json());
      if (d.error || !d.token) { toast.danger(t("lastfmError")); setPhase("idle"); return; }
      tokenRef.current = d.token;
      await openUrl(d.authUrl).catch(() => {});
      setPhase("awaiting");
    } catch { toast.danger(t("lastfmError")); setPhase("idle"); }
  };

  const finishConnect = async () => {
    setPhase("working");
    try {
      const d = await fetch(`${API}/lastfm/session`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current }),
      }).then(r => r.json());
      if (d.connected) { setStatus(s => ({ ...s, connected: true, username: d.username })); window.dispatchEvent(new Event("lastfm-changed")); toast.success(t("lastfmConnected")); }
      else toast.danger(t("lastfmAuthFailed"));
    } catch { toast.danger(t("lastfmError")); }
    setPhase("idle");
  };

  const disconnect = async () => {
    try { await fetch(`${API}/lastfm/disconnect`, { method: "POST" }); } catch {}
    setStatus(s => ({ ...s, connected: false, username: "" }));
    window.dispatchEvent(new Event("lastfm-changed"));
    toast.success(t("lastfmDisconnected"));
  };

  let control;
  if (!status.enabled) {
    control = <span className="text-t11 text-muted">{t("lastfmNotConfigured")}</span>;
  } else if (status.connected) {
    control = (
      <div className="flex items-center gap-2">
        <span className="text-t12 text-muted truncate max-w-[160px]">@{status.username}</span>
        <Button variant="danger-soft" size="sm" onPress={disconnect}>{t("disconnect")}</Button>
      </div>
    );
  } else if (phase === "awaiting") {
    control = (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onPress={() => setPhase("idle")}>{t("cancel")}</Button>
        <Button variant="primary" size="sm" onPress={finishConnect}>{t("lastfmIveAuthorized")}</Button>
      </div>
    );
  } else {
    control = (
      <Button variant="primary" size="sm" isDisabled={phase === "working"} onPress={startConnect}>
        {phase === "working" ? <Spinner size="sm" /> : t("connect")}
      </Button>
    );
  }

  return (
    <SettingRow
      label="Last.fm"
      description={status.connected ? t("lastfmConnectedDesc") : (phase === "awaiting" ? t("lastfmAwaitingDesc") : t("lastfmDesc"))}
      icon={<BrandLastfm />}
    >
      {control}
    </SettingRow>
  );
}

function fmtDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function fmtBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const MAX_CACHE_STEPS = [100, 250, 500, 1000, 2000, 5000, 0]; // 0 = unlimited

function StorageTab({ t }) {
  return (
    <div>
      <SettingsSectionLabel>{t("storageDownloads")}</SettingsSectionLabel>
      <DownloadsTab t={t} />
      <SettingsSectionLabel style={{ marginTop: 28 }}>{t("storageCache")}</SettingsSectionLabel>
      <CacheTab t={t} />
    </div>
  );
}

function DownloadsTab({ t }) {
  const [mp3Dir, setMp3Dir] = useState(() => localStorage.getItem("kiyoshi-mp3-dir") || "");

  const handleChangePath = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: t("changePath"), defaultPath: mp3Dir || undefined });
      if (selected) {
        setMp3Dir(selected);
        localStorage.setItem("kiyoshi-mp3-dir", selected);
      }
    } catch {}
  };

  const handleResetPath = () => {
    setMp3Dir("");
    localStorage.removeItem("kiyoshi-mp3-dir");
  };

  return (
    <div>
      <SettingRow label={t("defaultSavePath")} icon={<DownloadSimple size={15} />}
        description={mp3Dir || t("noPathSet")}>
        <div className="flex gap-1.5">
          {mp3Dir && (
            <Button variant="ghost" size="sm" onPress={handleResetPath}>{t("resetPath")}</Button>
          )}
          <Button variant="primary" size="sm" onPress={handleChangePath}>{t("changePath")}</Button>
        </div>
      </SettingRow>
    </div>
  );
}

function CacheTab({ t }) {
  const [stats, setStats] = useState(null);
  const [clearing, setClearing] = useState({});
  const [cleared, setCleared] = useState({});
  const [fetchError, setFetchError] = useState(null);

  const load = useCallback(() => {
    fetch(`${API}/cache/stats`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`); return r.json(); })
      .then(data => { setStats(data); setFetchError(null); })
      .catch(e => setFetchError(e.message || String(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = (cat, val) => {
    setStats(s => s ? { ...s, [cat]: { ...s[cat], enabled: val } } : s);
    fetch(`${API}/cache/settings`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [cat]: val }),
    }).catch(() => {});
  };

  const clear = async (cat) => {
    setClearing(c => ({ ...c, [cat]: true }));
    await fetch(`${API}/cache/clear`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat }),
    }).catch(() => {});
    setClearing(c => ({ ...c, [cat]: false }));
    setCleared(c => ({ ...c, [cat]: true }));
    setTimeout(() => setCleared(c => ({ ...c, [cat]: false })), 1800);
    load();
  };

  const categories = [
    { key: "songs",     label: t("cacheSongs"),     icon: <MusicNote size={16} />,    color: "var(--accent)",  colorRaw: "180,80,180" },
    { key: "lyrics",    label: t("cacheLyrics"),    icon: <Microphone size={16} />,   color: "#7c6ff7",        colorRaw: "124,111,247" },
    { key: "playlists", label: t("cachePlaylists"), icon: <Queue size={16} />,        color: "#3a9fd6",        colorRaw: "58,159,214" },
    { key: "albums",    label: t("cacheAlbums"),    icon: <VinylRecord size={16} />,  color: "#c8860a",        colorRaw: "200,134,10" },
    { key: "images",    label: t("cacheImages"),    icon: <ImageSquare size={16} />,  color: "#2e9e5b",        colorRaw: "46,158,91" },
  ];

  const totalBytes = stats ? categories.reduce((sum, c) => sum + (stats[c.key]?.size ?? 0), 0) : 0;

  const [maxCacheMb, setMaxCacheMb] = useState(() => {
    const v = localStorage.getItem("kiyoshi-max-cache-mb");
    return v ? parseInt(v, 10) : 0;
  });
  const sliderIndex = MAX_CACHE_STEPS.indexOf(maxCacheMb);
  const handleSlider = (idx) => {
    const val = MAX_CACHE_STEPS[idx];
    setMaxCacheMb(val);
    if (val === 0) localStorage.removeItem("kiyoshi-max-cache-mb");
    else localStorage.setItem("kiyoshi-max-cache-mb", String(val));
  };
  const stepLabel = (v) => {
    if (v === 0) return t("unlimited");
    if (v >= 1000) return `${v / 1000} GB`;
    return `${v} MB`;
  };
  const overLimit = maxCacheMb > 0 && totalBytes > maxCacheMb * 1024 * 1024;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {fetchError && (
        <div style={{
          padding: "12px 16px", marginBottom: 6, borderRadius: "var(--r-lg)",
          background: "rgba(255,60,60,0.12)", color: "#ff7070", fontSize: 12,
        }}>
          {t("cacheStatsError")}: {fetchError}
        </div>
      )}

      {/* ── Summary card ── */}
      <CardRoot variant="secondary" className="px-[18px] py-4 gap-0! transition-colors"
        style={{ background: overLimit ? "color-mix(in srgb, #ff4444 8%, var(--surface-1))" : "var(--surface-1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>
            {t("totalCacheUsage")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {overLimit && (
              <div style={{ fontSize: 11, color: "#ff7070", fontWeight: 600 }}>
                {t("cacheWarning")}
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 700, color: overLimit ? "#ff7070" : "var(--t1)" }}>
              {stats ? fmtBytes(totalBytes) : "…"}
            </div>
          </div>
        </div>
        {/* Stacked bar */}
        <div style={{ height: 6, borderRadius: 99, overflow: "hidden", background: "var(--bg-base)", display: "flex" }}>
          {stats && totalBytes > 0 && categories.map(c => {
            const pct = (stats[c.key]?.size ?? 0) / totalBytes * 100;
            return pct > 0 ? (
              <div key={c.key} style={{ width: `${pct}%`, background: c.color, transition: "width 0.4s ease" }} />
            ) : null;
          })}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 10 }}>
          {categories.map(c => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t3)" }}>
              <div style={{ width: 8, height: 8, borderRadius: 99, background: c.color, flexShrink: 0 }} />
              {c.label}
            </div>
          ))}
        </div>
      </CardRoot>

      {/* ── Category rows — one card each ── */}
      {categories.map(({ key, label, icon, color, colorRaw }) => {
        const s = stats?.[key];
        const isClearing = clearing[key];
        const wasCleared = cleared[key];

        return (
          <CardRoot key={key} variant="secondary"
            className={cn("bg-surface-1 flex flex-row items-center gap-3.5 px-[18px] py-3.5 transition-opacity", s?.enabled === false && "opacity-50")}>
            {/* Colored icon badge */}
            <div className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center"
              style={{ background: `rgba(${colorRaw},0.15)`, color }}>{icon}</div>

            {/* Label + stats */}
            <div className="flex-1 min-w-0">
              <div className="text-t13 font-medium text-primary">{label}</div>
              <div className="text-t11 text-muted mt-0.5">
                {s ? <span style={{ color, fontWeight: 600 }}>{fmtBytes(s.size)}</span> : "…"}
                {s?.count != null && <span> · {s.count} {key === "images" ? t("cacheFiles") : t("cacheEntries")}</span>}
              </div>
            </div>

            {/* Clear button */}
            <Button variant="ghost" size="sm" isDisabled={isClearing || wasCleared} onPress={() => clear(key)}
              className={cn("min-w-[72px]", wasCleared && "text-[#6bdf96]!")}>
              {wasCleared
                ? <><Check size={11} />{t("cacheCleared")}</>
                : isClearing ? "…" : t("cacheClear")}
            </Button>

            {/* Toggle */}
            <Toggle value={s?.enabled ?? true} onChange={v => toggleEnabled(key, v)} />
          </CardRoot>
        );
      })}

      {/* ── Max cache size slider ── */}
      <CardRoot variant="secondary" className="bg-surface-1 px-[18px] py-3.5 gap-0!">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "var(--r-md)", flexShrink: 0,
            background: "transparent", color: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HardDrives size={15} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{t("maxCacheSize")}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>
              {stepLabel(maxCacheMb)}
            </div>
          </div>
        </div>
        <Slider
          min={0}
          max={MAX_CACHE_STEPS.length - 1}
          step={1}
          value={sliderIndex >= 0 ? sliderIndex : MAX_CACHE_STEPS.length - 1}
          onChange={handleSlider}
          width="100%"
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--t3)", marginTop: 8 }}>
          {MAX_CACHE_STEPS.map((v, i) => (
            <span key={i} style={{
              fontWeight: i === sliderIndex ? 600 : 400,
              color: i === sliderIndex ? "var(--accent)" : undefined,
            }}>{stepLabel(v)}</span>
          ))}
        </div>
      </CardRoot>

      {/* ── Clear all ── */}
      <Button variant="ghost" fullWidth onPress={() => categories.forEach(c => clear(c.key))}>
        {t("cacheClearAll")}
      </Button>
    </div>
  );
}

// Quick account switcher — opened from the sidebar account dropdown ("Switch account").
// Built on HeroUI's Modal (genuine backdrop/animations/styling). Click an account to
// switch and close, or add a new one. Full management lives in the Account settings tab.
function ProfileSwitcherModal({ isOpen, onOpenChange, accounts, onSwitch, onAdd }) {
  const t = useLang();
  const list = accounts || [];

  const Avatar = ({ a }) => (
    <div className={cn("w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-semibold text-t12",
      a.type === "local" ? "bg-elevated text-secondary border border-border" : "bg-accent text-white")}>
      {a.avatar
        ? <img src={thumb(a.avatar)} alt="" className="w-full h-full object-cover" />
        : (a.displayName || a.name || "?")[0].toUpperCase()}
    </div>
  );

  return (
    <ModalRoot isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="sm" className="w-[380px] max-w-[92vw]">
          <ModalDialog className="overflow-x-hidden">
            <ModalHeader>
              <ModalIcon><Users size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("switchProfileTitle")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-1">
                {list.map(a => (
                  <button key={a.name}
                    onClick={() => { if (!a.active) onSwitch(a.name); onOpenChange(false); }}
                    className={cn("flex items-center gap-3 p-2 rounded-xl text-left transition-colors duration-150 border-none bg-transparent w-full",
                      a.active ? "bg-accent-dim" : "hover:bg-hover")}
                  >
                    <Avatar a={a} />
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-t13 font-medium truncate", a.active && "text-accent")}>{a.displayName || a.name}</div>
                      <div className="text-t11 text-muted truncate">
                        {a.type === "local" ? t("localAccount") : a.loggedOut ? t("logOut") : a.handle}
                      </div>
                    </div>
                    {a.active && <Check size={16} className="text-accent shrink-0" />}
                  </button>
                ))}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" fullWidth className="justify-start gap-2.5 px-3 rounded-xl text-secondary"
                onPress={() => { onOpenChange(false); onAdd(); }}>
                <UserPlus size={16} />
                {t("addAccount")}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

function CreatePlaylistModal({ onClose, onCreated, t }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState("PRIVATE");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/playlist/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description, privacyStatus: privacy }),
      });
      const data = await r.json();
      if (data.ok) {
        window.dispatchEvent(new Event("kiyoshi-library-updated"));
        onCreated?.(data.playlistId, title.trim());
        onClose();
      }
    } catch {}
    setCreating(false);
  };

  const fieldLabel = "text-t10 font-bold uppercase tracking-[0.08em] text-muted";
  const privacyOpts = [
    ["PRIVATE",  t("privacyPrivate"),  <Lock size={14} />],
    ["UNLISTED", t("privacyUnlisted"), <EyeSlash size={14} />],
    ["PUBLIC",   t("privacyPublic"),   <Globe size={14} />],
  ];

  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="lg" className="w-[640px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Playlist size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("createPlaylist")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex gap-5">
                {/* Left: title + description */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>{t("playlistTitle")}</label>
                    <TextFieldRoot aria-label={t("playlistTitle")} value={title} onChange={setTitle} className="w-full">
                      <InputRoot autoFocus onKeyDown={e => { if (e.key === "Enter") handleCreate(); }} />
                    </TextFieldRoot>
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <label className={fieldLabel}>{t("playlistDescription")}</label>
                    <TextFieldRoot aria-label={t("playlistDescription")} value={description} onChange={setDescription} className="w-full flex-1">
                      <TextArea className="min-h-[110px] resize-none" />
                    </TextFieldRoot>
                  </div>
                </div>

                {/* Right: visibility */}
                <div className="w-[180px] shrink-0 flex flex-col gap-2 border-l border-border pl-5">
                  <label className={fieldLabel}>{t("playlistPrivacy")}</label>
                  <div className="flex flex-col gap-1.5">
                    {privacyOpts.map(([val, label, icon]) => {
                      const active = privacy === val;
                      return (
                        <button key={val} onClick={() => setPrivacy(val)}
                          className={cn("flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left text-t13 border-none w-full transition-colors duration-150",
                            active ? "bg-accent-dim text-accent font-semibold" : "bg-transparent text-secondary hover:bg-hover")}>
                          <span className={cn("flex w-4 justify-center shrink-0", !active && "opacity-55")}>{icon}</span>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={onClose}>{t("cancel")}</Button>
              <Button color="accent" variant="solid" isDisabled={!title.trim() || creating} onPress={handleCreate}>
                {creating ? <Spinner size="sm" /> : t("create")}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// Rename an existing playlist. HeroUI modal with a single text field.
function RenamePlaylistModal({ dialog, onClose, t }) {
  const [name, setName] = useState(dialog.title || "");
  const submit = async () => {
    const newTitle = name.trim();
    if (!newTitle) return;
    try {
      await fetch(`${API}/playlist/${dialog.playlistId}/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      window.dispatchEvent(new Event("kiyoshi-library-updated"));
    } catch {}
    onClose();
  };
  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="sm" className="w-[380px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><PencilSimple size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("renamePlaylist")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <TextFieldRoot aria-label={t("renamePlaylist")} value={name} onChange={setName} className="w-full">
                <InputRoot autoFocus onKeyDown={e => { if (e.key === "Enter") submit(); }} />
              </TextFieldRoot>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={onClose}>{t("cancel")}</Button>
              <Button color="accent" variant="solid" isDisabled={!name.trim()} onPress={submit}>{t("save")}</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// Confirm deleting a playlist.
function DeletePlaylistModal({ dialog, onConfirm, onClose, t }) {
  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="sm" className="w-[400px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Trash size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("deletePlaylist")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="text-t13 text-secondary leading-relaxed">
                {t("deletePlaylistConfirm")}<br /><strong className="text-primary">{dialog.title}</strong>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={onClose}>{t("cancel")}</Button>
              <Button variant="danger" onPress={onConfirm}>{t("removeAccountConfirm")}</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// News / announcements modal. Items come from a remote news.json (published by editing
// that file). Unread state is tracked by the parent; `unreadIds` marks which were new on open.
// Tiny inline markdown: **bold**, *italic*, `code`, [text](url). Links open externally.
function renderInline(text, kp) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={`${kp}-${i}`}>{m[2]}</strong>);
    else if (m[3] != null) out.push(<em key={`${kp}-${i}`}>{m[3]}</em>);
    else if (m[4] != null) out.push(<code key={`${kp}-${i}`} className="px-1 py-0.5 rounded bg-elevated" style={{ fontSize: "0.92em" }}>{m[4]}</code>);
    else if (m[5] != null) { const url = m[6]; out.push(<span key={`${kp}-${i}`} onClick={() => openUrl(url).catch(() => {})} className="text-accent cursor-pointer hover:underline">{m[5]}</span>); }
    last = m.index + m[0].length; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Lightweight block markdown for news bodies: ## headings, - bullet lists, paragraphs.
function renderNewsBody(body) {
  if (!body) return null;
  const blocks = [];
  let list = null;
  const flush = () => { if (list) { blocks.push(<ul key={`ul-${blocks.length}`} className="list-disc pl-5 my-1 flex flex-col gap-0.5">{list}</ul>); list = null; } };
  body.split("\n").forEach((line, idx) => {
    const s = line.trim();
    if (!s) { flush(); return; }
    if (s.startsWith("## ")) { flush(); blocks.push(<div key={idx} className="text-t13 font-semibold mt-2 mb-0.5 text-primary">{renderInline(s.slice(3), `h${idx}`)}</div>); return; }
    if (s.startsWith("- ")) { if (!list) list = []; list.push(<li key={idx}>{renderInline(s.slice(2), `li${idx}`)}</li>); return; }
    flush();
    blocks.push(<p key={idx} className="my-1">{renderInline(s, `p${idx}`)}</p>);
  });
  flush();
  return blocks;
}

function NewsModal({ news, unreadIds, onRefresh, onClose, t }) {
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await onRefresh?.(); } finally { setRefreshing(false); }
  };
  const badgeFor = (type) => {
    if (type === "beta")   return { label: t("newsBeta")   || "Closed Beta", bg: "color-mix(in srgb, #f4a020 20%, transparent)", fg: "#f4b840" };
    if (type === "note")   return { label: t("newsNote")   || "Hinweis",     bg: "rgba(255,255,255,0.08)",                       fg: "var(--text-secondary)" };
    if (type === "fix")    return { label: t("newsFix")    || "Fix",         bg: "color-mix(in srgb, #1d9e75 22%, transparent)", fg: "#3ec79a" };
    return { label: t("newsUpdate") || "Update", bg: "color-mix(in srgb, var(--accent) 20%, transparent)", fg: "var(--accent)" };
  };
  const list = news || [];
  const [selectedId, setSelectedId] = useState(() => list[0]?.id || null);
  const selected = list.find(n => n.id === selectedId) || list[0] || null;
  const sb = selected ? badgeFor(selected.type) : null;

  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="xl" className="w-[880px] max-w-[94vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Megaphone size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("news") || "Neuigkeiten"}</ModalHeading>
            </ModalHeader>
            <ModalBody className="p-0! overflow-hidden">
              {list.length === 0 ? (
                <div className="text-t13 text-muted text-center py-12">{t("newsEmpty") || "Keine Neuigkeiten."}</div>
              ) : (
                <div className="flex" style={{ height: "62vh" }}>
                  {/* Left: entry list */}
                  <div className="w-[268px] shrink-0 border-r border-border overflow-y-auto overflow-x-hidden">
                    {list.map((n) => {
                      const b = badgeFor(n.type);
                      const unread = unreadIds?.has(n.id);
                      const active = n.id === (selected?.id);
                      return (
                        <button key={n.id} onClick={() => setSelectedId(n.id)}
                          className={cn("w-full text-left flex gap-2.5 px-3 py-2.5 border-b border-border transition-colors duration-100",
                            active ? "bg-accent-dim" : "hover:bg-hover")}>
                          {n.image
                            ? <img src={n.image} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                            : <div className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center" style={{ background: b.bg }}><Megaphone size={16} style={{ color: b.fg }} /></div>}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: b.bg, color: b.fg }}>{b.label}</span>
                              {n.important && <Star size={10} weight="fill" className="text-accent shrink-0" />}
                              {unread && <span className="w-1.5 h-1.5 rounded-full ml-auto shrink-0" style={{ background: "var(--accent)" }} />}
                            </div>
                            <div className="text-t13 font-semibold truncate" style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>{n.title || "—"}</div>
                            <div className="text-t10 text-muted truncate">{n.date}{n.min_version ? ` · ab ${n.min_version}` : ""}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Right: full entry */}
                  <div className="flex-1 min-w-0 overflow-y-auto">
                    {selected && (
                      <>
                        {selected.image && <img src={selected.image} alt="" className="w-full block" style={{ maxHeight: 220, objectFit: "cover" }} />}
                        <div className="px-6 py-5">
                          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                            <span className="text-t10 font-bold px-2 py-0.5 rounded-md" style={{ background: sb.bg, color: sb.fg }}>{sb.label}</span>
                            {selected.important && <Star size={13} weight="fill" className="text-accent" />}
                            {selected.date && <span className="text-t12 text-muted">{selected.date}</span>}
                            {selected.min_version && <span className="text-t11 text-muted">· ab {selected.min_version}{selected.max_version ? ` – ${selected.max_version}` : ""}</span>}
                          </div>
                          <div className="text-t20 font-bold mb-3 leading-snug">{selected.title || "—"}</div>
                          {selected.body && <div className="text-t14 text-secondary leading-relaxed">{renderNewsBody(selected.body)}</div>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" className="mr-auto" isDisabled={refreshing} onPress={doRefresh}>
                <span className="flex items-center gap-1.5">
                  <ArrowClockwise size={14} style={refreshing ? { animation: "spin2 0.8s linear infinite" } : undefined} />
                  {t("refresh") || "Aktualisieren"}
                </span>
              </Button>
              <Button color="accent" variant="solid" onPress={onClose}>{t("close") || "Schließen"}</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// Bug-report / feedback modal. Submits to the local backend, which forwards to a Discord
// webhook. Version + OS (and optionally recent backend logs) are attached automatically.
function BugReportModal({ onClose, screenshot, t }) {
  const CATS = [
    { value: "Bug", label: t("catBug") || "Bug" },
    { value: "Absturz", label: t("catCrash") || "Crash" },
    { value: "UI / Design", label: t("catUI") || "UI / Design" },
    { value: "Vorschlag", label: t("catSuggestion") || "Suggestion" },
  ];
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Bug");
  const [description, setDescription] = useState("");
  const [includeDiag, setIncludeDiag] = useState(true);
  const [includeShot, setIncludeShot] = useState(!!screenshot);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // null | "ok" | "error" | "unconfigured"

  const submit = async () => {
    if ((!title.trim() && !description.trim()) || sending) return;
    setSending(true); setStatus(null);
    try {
      const r = await fetch(`${API}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), category, description: description.trim(),
          version: APP_VERSION, os: OS_INFO, includeLogs: includeDiag,
          screenshot: (includeShot && screenshot) ? screenshot : undefined,
        }),
      });
      if (r.ok) { setStatus("ok"); setTimeout(onClose, 1500); }
      else if (r.status === 503) setStatus("unconfigured");
      else setStatus("error");
    } catch { setStatus("error"); }
    setSending(false);
  };

  const fieldLabel = "text-t10 font-bold uppercase tracking-[0.08em] text-muted";
  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="lg" className="w-[560px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Bug size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("reportBug") || "Fehler melden"}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              {status === "ok" ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <CheckCircle size={44} weight="fill" className="text-accent" />
                  <div className="text-t14 font-semibold">{t("reportSent") || "Danke! Dein Report wurde gesendet."}</div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>{t("reportTitle") || "Titel"}</label>
                    <TextFieldRoot aria-label={t("reportTitle") || "Titel"} value={title} onChange={setTitle} className="w-full">
                      <InputRoot autoFocus placeholder={t("reportTitlePlaceholder") || "Kurz: was ist passiert?"} />
                    </TextFieldRoot>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>{t("reportCategory") || "Kategorie"}</label>
                    <div className="flex flex-wrap gap-2">
                      {CATS.map((c) => (
                        <button key={c.value} onClick={() => setCategory(c.value)}
                          className={cn("px-3.5 py-2 rounded-xl text-t13 border-none transition-colors duration-150",
                            category === c.value ? "bg-accent-dim text-accent font-semibold" : "bg-transparent text-secondary hover:bg-hover border border-border")}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>{t("reportDescription") || "Beschreibung & Schritte"}</label>
                    <TextFieldRoot aria-label={t("reportDescription") || "Beschreibung"} value={description} onChange={setDescription} className="w-full">
                      <TextArea className="min-h-[110px] resize-none" placeholder={t("reportDescPlaceholder") || "Was hast du erwartet, was ist stattdessen passiert? Schritte zum Nachstellen?"} />
                    </TextFieldRoot>
                  </div>
                  <div className="rounded-xl bg-elevated px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Info size={15} className="text-muted shrink-0" />
                        <span className="text-t13 font-medium">{t("reportDiagnostics") || "Diagnose anhängen"}</span>
                      </div>
                      <Toggle value={includeDiag} onChange={setIncludeDiag} />
                    </div>
                    {includeDiag && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {[`v${APP_VERSION}`, OS_INFO, t("reportLogs") || "letzte Log-Zeilen"].map((chip, i) => (
                          <span key={i} className="text-t11 font-mono px-2 py-0.5 rounded-md bg-surface border border-border text-secondary">{chip}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {screenshot && (
                    <div className="rounded-xl bg-elevated px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <ImageSquare size={15} className="text-muted shrink-0" />
                          <span className="text-t13 font-medium">{t("reportScreenshot") || "Attach screenshot"}</span>
                        </div>
                        <Toggle value={includeShot} onChange={setIncludeShot} />
                      </div>
                      {includeShot && (
                        <img src={`data:image/png;base64,${screenshot}`} alt=""
                          className="mt-2.5 w-full rounded-lg border border-border" style={{ maxHeight: 150, objectFit: "cover", objectPosition: "top" }} />
                      )}
                    </div>
                  )}
                  {status === "error" && <div className="text-t12 text-red-400">{t("reportError") || "Senden fehlgeschlagen. Bitte später erneut versuchen."}</div>}
                  {status === "unconfigured" && <div className="text-t12 text-amber-400">{t("reportUnconfigured") || "Feedback ist in diesem Build noch nicht konfiguriert."}</div>}
                </div>
              )}
            </ModalBody>
            {status !== "ok" && (
              <ModalFooter>
                <span className="text-t11 text-muted mr-auto">{t("reportAnon") || "Anonym · keine Account-Daten"}</span>
                <Button variant="ghost" onPress={onClose}>{t("cancel")}</Button>
                <Button color="accent" variant="solid" isDisabled={(!title.trim() && !description.trim()) || sending} onPress={submit}>
                  {sending ? <Spinner size="sm" /> : <span className="flex items-center gap-1.5"><PaperPlaneTilt size={15} />{t("reportSend") || "Senden"}</span>}
                </Button>
              </ModalFooter>
            )}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

function LyricsProviderList({ providers, onChange }) {
  const [dragOver, setDragOver] = useState(null);
  const isDragging = useRef(false);
  const dragOverRef = useRef(null);
  const listRef = useRef(null);

  const handlePointerDown = (e, fromIdx) => {
    e.preventDefault();
    isDragging.current = false;
    dragOverRef.current = null;
    const startY = e.clientY;

    const onMove = (me) => {
      if (Math.abs(me.clientY - startY) > 4) isDragging.current = true;
      if (!isDragging.current || !listRef.current) return;
      const rows = listRef.current.querySelectorAll("[data-provider-idx]");
      let closest = null, closestDist = Infinity;
      rows.forEach(row => {
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const dist = Math.abs(me.clientY - mid);
        if (dist < closestDist) { closestDist = dist; closest = row; }
      });
      if (closest) {
        const idx = parseInt(closest.dataset.providerIdx);
        dragOverRef.current = idx;
        setDragOver(idx);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const target = dragOverRef.current;
      if (isDragging.current && target !== null && target !== fromIdx) {
        const next = [...providers];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(target, 0, moved);
        onChange(next);
      }
      isDragging.current = false;
      dragOverRef.current = null;
      setDragOver(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={listRef} className="flex flex-col gap-1.5">
      {providers.map((p, i) => (
        <CardRoot
          key={p.id}
          variant="secondary"
          data-provider-idx={i}
          className={cn(
            "bg-surface-1 flex flex-row items-center gap-2.5 px-[18px] py-4 border-2 transition-colors",
            dragOver === i ? "border-accent" : "border-transparent"
          )}
        >
          {/* Drag handle */}
          <div
            onPointerDown={e => handlePointerDown(e, i)}
            className="cursor-grab text-muted flex items-center shrink-0 touch-none"
          >
            <GripLines size={16} style={{ pointerEvents: "none" }} />
          </div>
          {/* Label */}
          <span className={cn("text-t13", p.enabled ? "text-primary" : "text-muted")}>{p.label}</span>
          {/* Sync-type tag */}
          {PROVIDER_SYNC[p.id] && (() => {
            const sync = PROVIDER_SYNC[p.id];
            return (
              <span style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: "var(--t10)", whiteSpace: "nowrap", flexShrink: 0,
                padding: "2px 6px", borderRadius: 4,
                background: p.enabled ? sync.bg : "rgba(255,255,255,0.05)",
                color: p.enabled ? sync.color : "var(--text-muted)",
                transition: "all 0.2s",
              }}>
                {sync.icon && <span style={{ display: "inline-block", width: 16, height: 16, flexShrink: 0, alignSelf: "center", backgroundColor: "currentColor", maskImage: `url(${sync.icon})`, WebkitMaskImage: `url(${sync.icon})`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />}
                {sync.label}
              </span>
            );
          })()}
          <div className="flex-1" />
          {/* Enable toggle */}
          <Toggle value={p.enabled} onChange={v => onChange(providers.map((x, j) => j === i ? { ...x, enabled: v } : x))} />
        </CardRoot>
      ))}
    </div>
  );
}

// ─── Debug shared helpers ────────────────────────────────────────────────────
const _debugLevelColor = (level) => {
  if (level === "ERROR") return "#ff6b6b";
  if (level === "WARN")  return "#f0b429";
  if (level === "INFO")  return "#64b5f6";
  return "var(--text-muted)";
};
const _debugLevelBg = (level) => {
  if (level === "ERROR") return "rgba(255,107,107,0.12)";
  if (level === "WARN")  return "rgba(240,180,41,0.10)";
  if (level === "INFO")  return "rgba(100,181,246,0.08)";
  return "transparent";
};
const _debugFmtTs = (ts) => new Date(ts * 1000).toTimeString().slice(0, 8);

function _buildDebugReport(info, logs) {
  return [
    "=== Kodama Debug Report ===",
    info ? [
      `App:        ${APP_VERSION}`,
      `Python:     ${info.python}`,
      `yt-dlp:     ${info.ytdlp}`,
      `ytmusicapi: ${info.ytmusicapi}`,
      `Flask:      ${info.flask}`,
      `Node.js:    ${info.node || "—"}`,
      `Profil:     ${info.profile}`,
      `Plattform:  ${info.platform}`,
      `Uptime:     ${info.uptime}`,
      `Data dir:   ${info.data_dir}`,
    ].join("\n") : "Backend nicht erreichbar",
    `\n=== Logs (${logs.length} Einträge) ===`,
    ...logs.map(l => `[${_debugFmtTs(l.ts)}] [${l.level}] [${l.source}] ${l.msg}`),
  ].join("\n");
}

// ─── Debug Floating Window ───────────────────────────────────────────────────
function DebugFloatingWindow({ onClose }) {
  const t = useLang();
  const [info, setInfo]           = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [source, setSource]       = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeTab, setActiveTab] = useState("logs"); // "info" | "logs"
  const [copied, setCopied]       = useState(false);
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kiyoshi-debug-float-pos")) || { x: 80, y: 80 }; }
    catch { return { x: 80, y: 80 }; }
  });
  const logRef = useRef(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const fetchInfo = useCallback(() => {
    fetch(`${API}/debug/info`).then(r => r.json()).then(setInfo).catch(() => {});
  }, []);

  useEffect(() => {
    fetchInfo();
    const id = setInterval(fetchInfo, 3000);
    return () => clearInterval(id);
  }, [fetchInfo]);

  const allLogs = useMemo(() => {
    const backend = info?.logs || [];
    return [..._frontendLogs, ...backend].sort((a, b) => a.ts - b.ts);
  }, [info]);

  const visibleLogs = useMemo(() => allLogs.filter(l => {
    if (filter !== "ALL" && l.level !== filter) return false;
    if (source !== "ALL" && l.source !== source) return false;
    return true;
  }), [allLogs, filter, source]);

  useEffect(() => {
    if (autoScroll && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLogs.length, autoScroll]);

  const startDrag = useCallback((e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const ox = e.clientX - posRef.current.x;
    const oy = e.clientY - posRef.current.y;
    const onMove = (me) => {
      const np = { x: me.clientX - ox, y: me.clientY - oy };
      setPos(np);
      localStorage.setItem("kiyoshi-debug-float-pos", JSON.stringify(np));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(_buildDebugReport(info, visibleLogs))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };

  const sysRows = info ? [
    ["Python",     info.python],
    ["yt-dlp",     info.ytdlp],
    ["ytmusicapi", info.ytmusicapi],
    ["Flask",      info.flask],
    ["Node.js",    info.node ? info.node.split(/[/\\]/).pop() : "—"],
    ["Profil",     info.profile],
    ["Plattform",  info.platform],
    ["Uptime",     info.uptime],
  ] : [];

  return createPortal(
    <div style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 9998,
      width: 660, height: 480, display: "flex", flexDirection: "column",
      background: "var(--bg-surface)", border: "0.5px solid var(--stroke)",
      borderRadius: "var(--r-xl)", boxShadow: "0 20px 60px rgba(0,0,0,0.75)",
      fontFamily: "var(--font)", overflow: "hidden",
      resize: "both", minWidth: 380, minHeight: 260,
    }}>
      {/* Title bar */}
      <div onMouseDown={startDrag} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", background: "var(--surface-1)",
        borderBottom: "0.5px solid var(--stroke)",
        cursor: "grab", userSelect: "none", flexShrink: 0,
      }}>
        <Bug size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span className="text-t12 font-semibold text-primary flex-1">Debug</span>
        <Button variant={activeTab === "info" ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setActiveTab("info")}>Sysinfo</Button>
        <Button variant={activeTab === "logs" ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setActiveTab("logs")}>Logs</Button>
        <div className="w-px h-3 bg-border mx-0.5" />
        <Button variant="ghost" size="sm" isIconOnly onPress={onClose} className="text-[#ff7070]! rounded-full"><X size={12} weight="bold" /></Button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "10px 12px", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 200 }}>
        {activeTab === "info" && (
          <div style={{ overflowY: "auto" }}>
            {!info ? (
              <div className="text-t12 text-muted p-2">{t("loading")}…</div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {sysRows.map(([k, v]) => (
                  <CardRoot key={k} variant="secondary" className="bg-surface-1 flex flex-row items-center gap-2 px-3 py-2">
                    <span className="text-t11 text-muted min-w-[72px] shrink-0">{k}</span>
                    <span className="text-t11 text-primary font-mono overflow-hidden text-ellipsis whitespace-nowrap">{v}</span>
                  </CardRoot>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-1 mb-1.5 flex-wrap shrink-0">
              {["ALL","INFO","WARN","ERROR"].map(f => (
                <Button key={f} variant={filter === f ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setFilter(f)}>{f}</Button>
              ))}
              <div className="w-px h-3 bg-border mx-0.5" />
              {["ALL","frontend","backend"].map(s => (
                <Button key={s} variant={source === s ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setSource(s)}>{s === "ALL" ? "Alle" : s}</Button>
              ))}
              <div className="ml-auto flex gap-1">
                <Button variant={autoScroll ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setAutoScroll(a => !a)}>
                  <CaretDown size={10} /> Scroll
                </Button>
                <Button variant="ghost" size="sm" className="text-t11 px-2.5!" onPress={handleCopy}>
                  {copied ? <><Check size={10} weight="bold" /> {t("copied")}</> : <><Copy size={10} /> {t("copyAll")}</>}
                </Button>
              </div>
            </div>

            {/* Log list */}
            <div ref={logRef} className="scrollable" style={{
              flex: 1, overflowY: "auto", background: "var(--surface-1)",
              borderRadius: "var(--r-lg)",
              padding: "4px 2px", fontFamily: "monospace", fontSize: 10, minHeight: 0,
            }}
              onScroll={e => {
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight > 40 && autoScroll) setAutoScroll(false);
              }}
            >
              {visibleLogs.length === 0
                ? <div className="text-muted py-2.5 px-2 text-center">{t("debugNoLogs")}</div>
                : visibleLogs.map((entry, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 5, padding: "1px 5px",
                    borderRadius: "var(--r-xs)", marginBottom: 1, background: _debugLevelBg(entry.level),
                  }}>
                    <span style={{ color: "var(--t3)", flexShrink: 0, userSelect: "none" }}>{_debugFmtTs(entry.ts)}</span>
                    <span style={{ color: _debugLevelColor(entry.level), flexShrink: 0, minWidth: 36, fontWeight: 700, userSelect: "none" }}>{entry.level}</span>
                    <span style={{ color: entry.source === "frontend" ? "rgba(224,64,251,0.7)" : "rgba(100,181,246,0.6)", flexShrink: 0, minWidth: 50, userSelect: "none" }}>[{entry.source}]</span>
                    <span style={{ color: "var(--t2)", wordBreak: "break-all", lineHeight: 1.4 }}>{entry.msg}</span>
                  </div>
                ))
              }
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Debug Tab ───────────────────────────────────────────────────────────────
function DebugTab({ t }) {
  const [info, setInfo]           = useState(null);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [source, setSource]       = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied]       = useState(false);
  const logRef = useRef(null);

  const fetchInfo = useCallback(() => {
    setError(null);
    fetch(`${API}/debug/info`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setInfo).catch(e => setError(e.message));
  }, []);
  useEffect(() => { fetchInfo(); }, [fetchInfo, refreshKey]);

  const allLogs = useMemo(() => {
    return [..._frontendLogs, ...(info?.logs || [])].sort((a, b) => a.ts - b.ts);
  }, [info]);
  const visibleLogs = useMemo(() =>
    allLogs.filter(l => (filter === "ALL" || l.level === filter) && (source === "ALL" || l.source === source)),
  [allLogs, filter, source]);
  useEffect(() => {
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLogs.length, autoScroll]);

  const handleCopy = () => {
    navigator.clipboard.writeText(_buildDebugReport(info, visibleLogs))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };
  const openFloat = () => window.dispatchEvent(new CustomEvent("kiyoshi-debug-float"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>

      {/* ── System Info ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{t("debugSysInfo")}</div>
          <Button variant="secondary" size="sm" onPress={openFloat}>
            <ArrowSquareOut size={12} />
            {t("debugOpenFloat")}
          </Button>
        </div>
        {error ? (
          <div style={{
            padding: "12px 16px", borderRadius: "var(--r-lg)",
            background: "rgba(255,60,60,0.12)", color: "#ff7070",
            fontSize: 12, display: "flex", alignItems: "center", gap: 8,
          }}>
            <WarningCircle size={14} weight="fill" style={{ flexShrink: 0 }} />
            {t("debugBackendUnreachable")}: {error}
          </div>
        ) : !info ? (
          <div style={{
            padding: "12px 16px", borderRadius: "var(--r-lg)",
            background: "var(--surface-1)", color: "var(--t3)", fontSize: 12,
          }}>{t("loading")}…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              ["Python",     info.python],
              ["yt-dlp",     info.ytdlp],
              ["ytmusicapi", info.ytmusicapi],
              ["Flask",      info.flask],
              ["Node.js",    info.node
                ? <span style={{ color: "#6bdf96", display: "flex", alignItems: "center", gap: 4 }}><Check size={11} weight="bold" />{info.node.split(/[/\\]/).pop()}</span>
                : <span style={{ color: "#ff7070" }}>—</span>],
              ["Profil",     info.profile],
              ["Plattform",  info.platform],
              ["Uptime",     info.uptime],
            ].map(([k, v]) => (
              <CardRoot key={k} variant="secondary" className="bg-surface-1 flex flex-row items-center gap-2.5 px-3.5 py-2.5">
                <span className="text-t11 text-muted min-w-[76px] shrink-0">{k}</span>
                <span className="text-t12 text-primary font-mono overflow-hidden text-ellipsis whitespace-nowrap">{v}</span>
              </CardRoot>
            ))}
          </div>
        )}
      </div>

      {/* ── Log viewer ── */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <span className="text-t13 font-semibold text-primary mr-1.5">Logs</span>
          {["ALL","INFO","WARN","ERROR"].map(f => (
            <Button key={f} variant={filter === f ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setFilter(f)}>{f}</Button>
          ))}
          <div className="w-px h-3.5 bg-border mx-0.5" />
          {["ALL","frontend","backend"].map(s => (
            <Button key={s} variant={source === s ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setSource(s)}>{s === "ALL" ? "Alle" : s}</Button>
          ))}
          <div className="ml-auto flex gap-1">
            <Button variant={autoScroll ? "secondary" : "ghost"} size="sm" className="text-t11 px-2.5!" onPress={() => setAutoScroll(a => !a)}>
              <CaretDown size={11} /> Auto-Scroll
            </Button>
            <Button variant="ghost" size="sm" className="text-t11 px-2.5!" onPress={() => setRefreshKey(k => k + 1)}>
              <ArrowClockwise size={11} /> {t("refresh")}
            </Button>
            <Button variant="ghost" size="sm" className="text-t11 px-2.5!" onPress={handleCopy}>
              {copied ? <><Check size={11} weight="bold" /> {t("copied")}</> : <><Copy size={11} /> {t("copyAll")}</>}
            </Button>
          </div>
        </div>

        {/* Log area */}
        <div ref={logRef} className="scrollable" style={{
          flex: 1, overflowY: "auto", background: "var(--surface-1)",
          borderRadius: "var(--r-lg)",
          padding: "6px 4px", fontFamily: "monospace", fontSize: 11, minHeight: 180,
        }}
          onScroll={e => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight > 40 && autoScroll) setAutoScroll(false); }}
        >
          {visibleLogs.length === 0
            ? <div style={{ color: "var(--t3)", padding: "12px 8px", textAlign: "center" }}>{t("debugNoLogs")}</div>
            : visibleLogs.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "2px 6px", borderRadius: "var(--r-xs)", marginBottom: 1, background: _debugLevelBg(entry.level) }}>
                <span style={{ color: "var(--t3)", flexShrink: 0, userSelect: "none" }}>{_debugFmtTs(entry.ts)}</span>
                <span style={{ color: _debugLevelColor(entry.level), flexShrink: 0, minWidth: 38, fontWeight: 700, userSelect: "none" }}>{entry.level}</span>
                <span style={{ color: entry.source === "frontend" ? "rgba(224,64,251,0.7)" : "rgba(100,181,246,0.6)", flexShrink: 0, minWidth: 52, userSelect: "none" }}>[{entry.source}]</span>
                <span style={{ color: "var(--t2)", wordBreak: "break-all", lineHeight: 1.45 }}>{entry.msg}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// Extracted outside SettingsPanel to avoid remount on every parent render
function SettingsSectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 13,
      fontWeight: 600,
      color: "var(--t1)",
      margin: "24px 0 10px 2px",
      ...style,
    }}>{children}</div>
  );
}

// Explanatory text shown under a section header. Same size as the header (13px),
// muted, for a consistent look across all settings sections.
function SettingsSectionDesc({ children, style }) {
  return (
    <div style={{
      fontSize: 13,
      color: "var(--text-muted)",
      lineHeight: 1.5,
      margin: "-4px 0 12px 2px",
      ...style,
    }}>{children}</div>
  );
}

// ─── Unison community identity (ECDSA key) ───────────────────────────────────
function UnisonIdentitySection() {
  const t = useLang();
  const [identity, setIdentity] = useState(() => {
    try { const raw = localStorage.getItem("kodama-unison-identity"); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [serverName, setServerName] = useState(null);   // resolved nickname or pet name from server
  const [nickDraft, setNickDraft] = useState("");
  const [nickBusy, setNickBusy] = useState(false);
  const [nickErr, setNickErr] = useState("");

  const NICK_RE = /^[A-Za-z0-9_]{3,20}$/;

  const persist = (id) => {
    try { localStorage.setItem("kodama-unison-identity", JSON.stringify(id)); } catch {}
    setIdentity(id);
  };

  // Resolve the current display name from the server (custom nickname, or derived pet name).
  useEffect(() => {
    let alive = true;
    setServerName(null); setNickDraft(""); setNickErr("");
    if (!identity?.keyId) return;
    (async () => {
      const name = await unisonFetchDisplayName(identity.keyId);
      if (!alive) return;
      const resolved = name || identity.displayName || "";
      setServerName(resolved);
      // Pre-fill draft only if the server name looks like a custom nickname (not the derived pet name).
      setNickDraft(resolved && resolved !== identity.displayName ? resolved : "");
    })();
    return () => { alive = false; };
  }, [identity?.keyId]);

  const hasCustomNick = !!serverName && serverName !== identity?.displayName;

  const saveNick = async () => {
    const v = nickDraft.trim();
    if (!NICK_RE.test(v)) { setNickErr(t("unisonNicknameInvalid")); return; }
    setNickBusy(true); setNickErr("");
    try {
      await unisonSetNickname(v);
      setServerName(v);
    } catch (e) {
      setNickErr(String(e?.message) === "nickname_taken" ? t("unisonNicknameTaken") : t("unisonNicknameError"));
    }
    setNickBusy(false);
  };

  const resetNick = async () => {
    setNickBusy(true); setNickErr("");
    try {
      await unisonResetNickname();
      setServerName(identity.displayName || "");
      setNickDraft("");
    } catch { setNickErr(t("unisonNicknameError")); }
    setNickBusy(false);
  };

  const create = async () => {
    setBusy(true); setErr("");
    try { persist(await generateIdentity()); }
    catch { setErr(t("unisonGenericError")); }
    setBusy(false);
  };

  const importFile = async () => {
    setErr("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ title: t("unisonImportKey"), filters: [{ name: "Key", extensions: ["json", "key"] }] });
      if (!path) return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const id = await importIdentityFile(await readTextFile(path));
      persist(id);
    } catch { setErr(t("unisonImportError")); }
  };

  const exportFile = async () => {
    if (!identity) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const base = (identity.displayName || identity.keyId.slice(0, 10)).replace(/[^\w-]/g, "_");
      const path = await save({ defaultPath: `unison-identity-${base}.json`, filters: [{ name: "Key", extensions: ["json"] }] });
      if (!path) return;
      await writeTextFile(path, JSON.stringify(exportIdentityFile(identity), null, 2));
    } catch {}
  };

  const remove = () => { try { localStorage.removeItem("kodama-unison-identity"); } catch {} setIdentity(null); };

  return (
    <>
      <SettingsSectionLabel>{t("unisonIdentity")}</SettingsSectionLabel>
      <SettingsSectionDesc>{t("unisonIdentityDesc")}</SettingsSectionDesc>
      <CardRoot variant="secondary" className="p-4 flex flex-col gap-3">
        {!identity ? (
          <>
            <div className="text-t12 text-muted leading-relaxed">{t("unisonNoIdentity")}</div>
            <div className="flex items-center gap-2">
              <Button color="accent" variant="solid" className="flex-1 justify-center" isDisabled={busy} onPress={create}>
                {busy ? <Spinner size="sm" /> : t("unisonCreate")}
              </Button>
              <Button variant="secondary" className="flex-1 justify-center gap-2" onPress={importFile}>
                <DownloadSimple size={15} className="rotate-180" />{t("unisonImportKey")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent-dim text-accent flex items-center justify-center shrink-0"><UserCircle size={20} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-t13 font-semibold truncate">{serverName || identity.displayName || t("unisonAnonymous")}</div>
                <button onClick={() => navigator.clipboard.writeText(identity.keyId).catch(() => {})} title={t("copy")}
                  className="text-t10 text-muted font-mono truncate hover:text-primary bg-transparent border-0 p-0 cursor-default block max-w-full">
                  {identity.keyId.slice(0, 10)}…{identity.keyId.slice(-6)}
                </button>
              </div>
            </div>

            {/* Custom nickname editor */}
            <div className="flex flex-col gap-1.5">
              <div className="text-t11 font-semibold text-secondary">{t("unisonNickname")}</div>
              <div className="text-t10 text-muted leading-relaxed">{t("unisonNicknameDesc")}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <TextFieldRoot aria-label={t("unisonNickname")} className="flex-1" value={nickDraft} onChange={setNickDraft}>
                  <InputRoot placeholder={identity.displayName || ""} maxLength={20}
                    onKeyDown={(e) => { if (e.key === "Enter") saveNick(); }} />
                </TextFieldRoot>
                <Button color="accent" variant="solid" className="justify-center shrink-0" isDisabled={nickBusy || !NICK_RE.test(nickDraft.trim()) || nickDraft.trim() === serverName} onPress={saveNick}>
                  {nickBusy ? <Spinner size="sm" /> : t("save")}
                </Button>
                {hasCustomNick ? (
                  <Button variant="secondary" className="justify-center shrink-0" isDisabled={nickBusy} onPress={resetNick}>
                    {t("reset")}
                  </Button>
                ) : null}
              </div>
              {nickErr ? <div className="text-t10 text-[#e05252]">{nickErr}</div>
                : <div className="text-t10 text-muted">{t("unisonNameDerived")}</div>}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" className="flex-1 justify-center gap-2" onPress={exportFile}>
                <DownloadSimple size={15} />{t("unisonExportKey")}
              </Button>
              <Button variant="secondary" className="flex-1 justify-center gap-2" onPress={importFile}>
                <DownloadSimple size={15} className="rotate-180" />{t("unisonImportKey")}
              </Button>
            </div>
            <Button variant="ghost" className="justify-center text-[#e05252]!" onPress={remove}>{t("unisonRemove")}</Button>
          </>
        )}
        {err ? <div className="text-t11 text-[#e05252]">{err}</div> : null}
      </CardRoot>
    </>
  );
}

// Composer-related settings (backend-backed, since the composer talks to Kodama's bridge).
function ComposerSettingsSection() {
  const t = useLang();
  const [autocache, setAutocache] = useState(true);
  useEffect(() => {
    fetch(`${API}/composer-bridge/autocache`).then(r => r.json())
      .then(d => setAutocache(d.enabled !== false)).catch(() => {});
  }, []);
  const toggle = (v) => {
    setAutocache(v);
    fetch(`${API}/composer-bridge/autocache`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: v }),
    }).catch(() => {});
  };
  return (
    <>
      <SettingsSectionLabel>{t("composer")}</SettingsSectionLabel>
      <SettingRow label={t("composerAutocache")} description={t("composerAutocacheDesc")} icon={<DownloadSimple />}>
        <Toggle value={autocache} onChange={toggle} />
      </SettingRow>
    </>
  );
}

// ─── Color Picker (HSV gradient + hue slider + hex input) ────────────────────
function _hexToHsv(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return { h: 0, s: 0, v: 0 };
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, v };
}

function _hsvToHex(h, s, v) {
  h = h / 360;
  let r, g, b;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: r = g = b = 0;
  }
  return "#" + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function ColorPicker({ value, onChange }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => _hexToHsv(safe));
  const [hexInput, setHexInput] = useState(safe);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const gradientRef = useRef(null);
  const hueRef = useRef(null);
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });

  // Sync if parent changes value externally
  useEffect(() => {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      setHsv(_hexToHsv(value));
      setHexInput(value);
    }
  }, [value]);

  const openPicker = () => {
    const r = triggerRef.current.getBoundingClientRect();
    setPopPos({ top: r.bottom + 8, left: Math.max(8, r.right - 244) });
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const applyHsv = (newHsv) => {
    setHsv(newHsv);
    const hex = _hsvToHex(newHsv.h, newHsv.s, newHsv.v);
    setHexInput(hex);
    onChange(hex);
  };

  const makeDragger = (ref, onDrag) => (e) => {
    e.preventDefault();
    const move = (ev) => {
      const rect = ref.current.getBoundingClientRect();
      onDrag(ev.clientX, ev.clientY, rect);
    };
    move(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => {
      window.removeEventListener("pointermove", move);
    }, { once: true });
  };

  const onGradientDrag = makeDragger(gradientRef, (cx, cy, rect) => {
    const s = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (cy - rect.top) / rect.height));
    applyHsv({ ...hsv, s, v });
  });

  const onHueDrag = makeDragger(hueRef, (cx, _cy, rect) => {
    const h = Math.max(0, Math.min(360, ((cx - rect.left) / rect.width) * 360));
    applyHsv({ ...hsv, h });
  });

  const hueColor = `hsl(${hsv.h},100%,50%)`;
  const currentHex = _hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <>
      <div ref={triggerRef} onClick={openPicker} style={{
        width: 32, height: 32, borderRadius: 8,
        background: safe, border: "0.5px solid var(--border)",
        cursor: "default", flexShrink: 0,
      }} />

      {open && createPortal(
        <div ref={popoverRef} style={{
          position: "fixed", top: popPos.top, left: popPos.left, zIndex: 9999,
          width: 244, padding: 12, borderRadius: 14,
          background: "#1c1c1c", border: "0.5px solid rgba(255,255,255,0.12)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          userSelect: "none",
        }}>
          {/* Gradient square */}
          <div ref={gradientRef} onPointerDown={onGradientDrag}
            style={{
              width: "100%", height: 160, borderRadius: 10,
              background: `linear-gradient(to right, #fff, ${hueColor})`,
              position: "relative", cursor: "crosshair", marginBottom: 10, overflow: "hidden",
            }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent, #000)", borderRadius: 10 }} />
            {/* Cursor */}
            <div style={{
              position: "absolute",
              left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`,
              transform: "translate(-50%, -50%)",
              width: 14, height: 14, borderRadius: "50%",
              border: "2px solid #fff",
              boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
              background: currentHex,
              pointerEvents: "none",
            }} />
          </div>

          {/* Hue slider */}
          <div ref={hueRef} onPointerDown={onHueDrag}
            style={{
              width: "100%", height: 14, borderRadius: 7,
              background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
              position: "relative", cursor: "default", marginBottom: 12,
            }}>
            <div style={{
              position: "absolute",
              left: `${(hsv.h / 360) * 100}%`, top: "50%",
              transform: "translate(-50%, -50%)",
              width: 18, height: 18, borderRadius: "50%",
              border: "2.5px solid #fff",
              boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
              background: hueColor,
              pointerEvents: "none",
            }} />
          </div>

          {/* Swatch + hex input + eyedropper */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: currentHex, border: "0.5px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
            <div style={{ flex: 1, position: "relative" }}>
              <input
                value={hexInput}
                onChange={e => {
                  setHexInput(e.target.value);
                  if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                    setHsv(_hexToHsv(e.target.value));
                    onChange(e.target.value);
                  }
                }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setOpen(false); }}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: window.EyeDropper ? "7px 32px 7px 10px" : "7px 10px",
                  borderRadius: 8,
                  background: "var(--bg-elevated)", border: "0.5px solid rgba(255,255,255,0.12)",
                  color: "var(--text-primary)", fontSize: "var(--t13)", fontFamily: "monospace",
                  outline: "none", letterSpacing: "0.04em",
                }}
              />
              {window.EyeDropper && (
                <button
                  title="Farbpipette"
                  onClick={async () => {
                    try {
                      setOpen(false);
                      await new Promise(r => setTimeout(r, 80));
                      const dropper = new window.EyeDropper();
                      const { sRGBHex } = await dropper.open();
                      setHsv(_hexToHsv(sRGBHex));
                      setHexInput(sRGBHex);
                      onChange(sRGBHex);
                    } catch {}
                  }}
                  style={{
                    position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", padding: 2,
                    color: "var(--text-muted)", cursor: "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Eyedropper size={15} />
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── OBS Overlay Settings Tab ─────────────────────────────────────────────────
const OVERLAY_FONTS = [
  // ── App ─────────────────────────────────────────────────────────────────────
  { label: "MiSans Latin",     value: "'MiSans Latin', system-ui, sans-serif", group: "App Default" },
  { label: "System UI",        value: "system-ui, sans-serif",                 group: "App Default" },
  // ── Clean / Modern ──────────────────────────────────────────────────────────
  { label: "Inter",            value: "Inter, sans-serif",                     group: "Clean" },
  { label: "DM Sans",          value: "'DM Sans', sans-serif",                 group: "Clean" },
  { label: "Figtree",          value: "Figtree, sans-serif",                   group: "Clean" },
  { label: "Plus Jakarta Sans",value: "'Plus Jakarta Sans', sans-serif",        group: "Clean" },
  { label: "Lexend",           value: "Lexend, sans-serif",                    group: "Clean" },
  // ── Geometric / Round ────────────────────────────────────────────────────────
  { label: "Outfit",           value: "Outfit, sans-serif",                    group: "Round" },
  { label: "Poppins",          value: "Poppins, sans-serif",                   group: "Round" },
  { label: "Nunito",           value: "Nunito, sans-serif",                    group: "Round" },
  { label: "Sora",             value: "Sora, sans-serif",                      group: "Round" },
  // ── Classic ─────────────────────────────────────────────────────────────────
  { label: "Roboto",           value: "Roboto, sans-serif",                    group: "Classic" },
  { label: "Montserrat",       value: "Montserrat, sans-serif",                group: "Classic" },
  { label: "Raleway",          value: "Raleway, sans-serif",                   group: "Classic" },
  { label: "Ubuntu",           value: "Ubuntu, sans-serif",                    group: "Classic" },
  { label: "Barlow",           value: "Barlow, sans-serif",                    group: "Classic" },
  // ── Techy / Futuristic ───────────────────────────────────────────────────────
  { label: "Exo 2",            value: "'Exo 2', sans-serif",                   group: "Techy" },
  { label: "Space Grotesk",    value: "'Space Grotesk', sans-serif",            group: "Techy" },
  { label: "Kanit",            value: "Kanit, sans-serif",                     group: "Techy" },
  { label: "Oxanium",          value: "Oxanium, sans-serif",                   group: "Techy" },
  { label: "Chakra Petch",     value: "'Chakra Petch', sans-serif",             group: "Techy" },
];

// ── Figma-style 2×2 corner grid ──────────────────────────────────────────────
// Font Awesome icon (fa-solid) — FA Pro CSS loaded via /css/all.min.css
function FaIcon({ name, size = 14 }) {
  return <i className={`fa-solid fa-${name}`} style={{ fontSize: size, width: size, textAlign: "center", flexShrink: 0, lineHeight: 1 }} />;
}
// Public folder SVG via CSS mask-image (inherits currentColor)
function PubIcon({ file, size = 15 }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size, flexShrink: 0,
      backgroundColor: "currentColor",
      maskImage: `url('/${file}')`, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center",
      WebkitMaskImage: `url('/${file}')`, WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat", WebkitMaskPosition: "center",
    }} />
  );
}

// Builds raw SVG path data for a rounded/beveled rectangle.
// ox/oy = offset (for embedding inner path in parent coord space).
// each corner: { t: 'r'|'b', s: number }
function buildCornerPathData(W, H, corners, ox = 0, oy = 0) {
  const { tl, tr, br, bl } = corners;
  let d = `M ${ox + tl.s} ${oy} `;
  if (tr.t === 'r') d += `L ${ox + W - tr.s} ${oy} Q ${ox + W} ${oy} ${ox + W} ${oy + tr.s} `;
  else              d += `L ${ox + W - tr.s} ${oy} L ${ox + W} ${oy + tr.s} `;
  if (br.t === 'r') d += `L ${ox + W} ${oy + H - br.s} Q ${ox + W} ${oy + H} ${ox + W - br.s} ${oy + H} `;
  else              d += `L ${ox + W} ${oy + H - br.s} L ${ox + W - br.s} ${oy + H} `;
  if (bl.t === 'r') d += `L ${ox + bl.s} ${oy + H} Q ${ox} ${oy + H} ${ox} ${oy + H - bl.s} `;
  else              d += `L ${ox + bl.s} ${oy + H} L ${ox} ${oy + H - bl.s} `;
  if (tl.t === 'r') d += `L ${ox} ${oy + tl.s} Q ${ox} ${oy} ${ox + tl.s} ${oy} Z`;
  else              d += `L ${ox} ${oy + tl.s} L ${ox + tl.s} ${oy} Z`;
  return d.trim();
}
// Full clip-path string for a single shape.
function buildCornerPath(W, H, corners) {
  return `path('${buildCornerPathData(W, H, corners)}')`;
}
// Donut clip: outer shape minus inner area (evenodd fill-rule).
// Lets transparent widget backgrounds show through properly — only the border strip is painted.
function buildDonutClipPath(outerW, outerH, outerCorners, innerW, innerH, innerCorners, bw) {
  const outer = buildCornerPathData(outerW, outerH, outerCorners);
  const inner = buildCornerPathData(innerW, innerH, innerCorners, bw, bw);
  return `path(evenodd, '${outer} ${inner}')`;
}

function CornerIcon({ corner }) {
  const r = { tl: "5px 0 0 0", tr: "0 5px 0 0", br: "0 0 5px 0", bl: "0 0 0 5px" }[corner];
  return <div style={{ width: 12, height: 12, border: "1.5px solid currentColor", borderRadius: r, flexShrink: 0, opacity: 0.55 }} />;
}
function CornerInput({ corner, value, onChange, min, max }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  useEffect(() => { setDraft(String(value ?? 0)); }, [value]);
  const commit = (raw) => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? (value ?? 0) : Math.max(min, Math.min(max, n));
    onChange(corner, clamped);
    setDraft(String(clamped));
  };
  const adjust = (d) => {
    const n = Math.max(min, Math.min(max, (parseInt(draft, 10) || 0) + d));
    setDraft(String(n)); onChange(corner, n);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--surface-1)", borderRadius: "var(--r-lg)", padding: "9px 10px" }}>
      <CornerIcon corner={corner} />
      <input type="number" min={min} max={max} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "ArrowUp") { e.preventDefault(); adjust(1); }
          if (e.key === "ArrowDown") { e.preventDefault(); adjust(-1); }
        }}
        style={{ flex: 1, minWidth: 0, width: 0, background: "none", border: "none", outline: "none", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)" }}
      />
      <span style={{ fontSize: 11, color: "var(--t3)", flexShrink: 0 }}>px</span>
    </div>
  );
}
function CornerGrid({ tl, tr, bl, br, onChange, min = 0, max = 60 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "10px 0 4px" }}>
      <CornerInput corner="tl" value={tl} onChange={onChange} min={min} max={max} />
      <CornerInput corner="tr" value={tr} onChange={onChange} min={min} max={max} />
      <CornerInput corner="bl" value={bl} onChange={onChange} min={min} max={max} />
      <CornerInput corner="br" value={br} onChange={onChange} min={min} max={max} />
    </div>
  );
}

const _CORNER_DEG = { tl: 0, tr: 90, br: 180, bl: 270 };
function CornerMaskIcon({ file, corner, size = 14 }) {
  const deg = _CORNER_DEG[corner];
  return (
    <span style={{
      display: "inline-block", width: size, height: size, flexShrink: 0,
      backgroundColor: "currentColor",
      maskImage: `url('/${file}')`, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center",
      WebkitMaskImage: `url('/${file}')`, WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat", WebkitMaskPosition: "center",
      transform: deg ? `rotate(${deg}deg)` : undefined,
    }} />
  );
}
function RoundCornerIcon({ corner, size = 14 }) {
  return <CornerMaskIcon file="corner-round.svg" corner={corner} size={size} />;
}
function BevelCornerIcon({ corner, size = 14 }) {
  return <CornerMaskIcon file="corner-bevel.svg" corner={corner} size={size} />;
}
// Mixed-type corner cell: two icon buttons (round / bevel) + size input in a single row
function CornerInputMixed({ corner, type, value, onChangeType, onChangeValue, min = 0, max = 60 }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  useEffect(() => { setDraft(String(value ?? 0)); }, [value]);
  const commit = (raw) => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? (value ?? 0) : Math.max(min, Math.min(max, n));
    onChangeValue(corner, clamped);
    setDraft(String(clamped));
  };
  const adjust = (d) => {
    const n = Math.max(min, Math.min(max, (parseInt(draft, 10) || 0) + d));
    setDraft(String(n)); onChangeValue(corner, n);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface-1)", borderRadius: "var(--r-lg)", padding: "7px 10px" }}>
      {/* Round button */}
      <button onClick={() => onChangeType(corner, "r")}
        onMouseEnter={e => { if (type !== "r") e.currentTarget.style.background = "var(--surface-2)"; }}
        onMouseLeave={e => { if (type !== "r") e.currentTarget.style.background = "transparent"; }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 22, borderRadius: "var(--r-sm)", border: "none", cursor: "default", flexShrink: 0,
          background: type === "r" ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "transparent",
          color: type === "r" ? "var(--accent)" : "var(--t3)",
          transition: "background 0.12s, color 0.12s",
        }}>
        <RoundCornerIcon corner={corner} />
      </button>
      {/* Bevel button */}
      <button onClick={() => onChangeType(corner, "b")}
        onMouseEnter={e => { if (type !== "b") e.currentTarget.style.background = "var(--surface-2)"; }}
        onMouseLeave={e => { if (type !== "b") e.currentTarget.style.background = "transparent"; }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 22, borderRadius: "var(--r-sm)", border: "none", cursor: "default", flexShrink: 0,
          background: type === "b" ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "transparent",
          color: type === "b" ? "var(--accent)" : "var(--t3)",
          transition: "background 0.12s, color 0.12s",
        }}>
        <BevelCornerIcon corner={corner} />
      </button>
      <input type="number" min={min} max={max} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "ArrowUp") { e.preventDefault(); adjust(1); }
          if (e.key === "ArrowDown") { e.preventDefault(); adjust(-1); }
        }}
        style={{ flex: 1, minWidth: 0, width: 0, background: "none", border: "none", outline: "none", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)" }}
      />
      <span style={{ fontSize: 11, color: "var(--t3)", flexShrink: 0 }}>px</span>
    </div>
  );
}
function CornerGridMixed({ tl, tr, bl, br, onChangeType, onChangeValue, min = 0, max = 60 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "10px 0 4px" }}>
      <CornerInputMixed corner="tl" type={tl.type} value={tl.value} onChangeType={onChangeType} onChangeValue={onChangeValue} min={min} max={max} />
      <CornerInputMixed corner="tr" type={tr.type} value={tr.value} onChangeType={onChangeType} onChangeValue={onChangeValue} min={min} max={max} />
      <CornerInputMixed corner="bl" type={bl.type} value={bl.value} onChangeType={onChangeType} onChangeValue={onChangeValue} min={min} max={max} />
      <CornerInputMixed corner="br" type={br.type} value={br.value} onChangeType={onChangeType} onChangeValue={onChangeValue} min={min} max={max} />
    </div>
  );
}


function SettingsSidebarContent({ tab, setTab, updateInfo, onClose, collapsed, closing }) {
  const t = useLang();
  const anim = useAnimations();
  const [debugUnlocked, setDebugUnlocked] = useState(() => localStorage.getItem("kiyoshi-debug-unlocked") === "true");
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [debugToast, setDebugToast] = useState(null);
  const debugTapTimer = useRef(null);
  const chromiumVersion = window.navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? "—";
  useEffect(() => {
    const handler = (e) => setDebugUnlocked(e.detail.unlocked);
    window.addEventListener("kiyoshi-debug-change", handler);
    return () => window.removeEventListener("kiyoshi-debug-change", handler);
  }, []);
  const handleTauriVersionTap = () => {
    if (debugUnlocked) { setDebugToast("already"); clearTimeout(debugTapTimer.current); debugTapTimer.current = setTimeout(() => setDebugToast(null), 1800); return; }
    setDebugTapCount(n => {
      const next = n + 1;
      clearTimeout(debugTapTimer.current);
      if (next >= 5) {
        localStorage.setItem("kiyoshi-debug-unlocked", "true");
        setDebugUnlocked(true);
        window.dispatchEvent(new CustomEvent("kiyoshi-debug-change", { detail: { unlocked: true } }));
        setDebugToast("unlocked");
        debugTapTimer.current = setTimeout(() => setDebugToast(null), 2500);
        return 0;
      }
      debugTapTimer.current = setTimeout(() => setDebugTapCount(0), 2000);
      return next;
    });
  };

  const navItems = [
    { id: "account",       label: t("account"),       iconEl: <UserCircle size={18} /> },
    { id: "darstellung",   label: t("appearance"),    iconEl: <PaintBrushBroad size={18} /> },
    { id: "visualizer",    label: t("visualizer"),    iconEl: <WaveformLines size={18} /> },
    { id: "wiedergabe",    label: t("playback"),      iconEl: <Play size={18} /> },
    { id: "lyrics",        label: t("lyrics"),        iconEl: <ChatText size={18} /> },
    { id: "accessibility", label: t("accessibility"), iconEl: <PersonArmsSpread size={18} /> },
    { id: "shortcuts",     label: t("shortcuts"),     iconEl: <Keyboard size={18} /> },
    { id: "language",      label: t("language"),      iconEl: <Translate size={18} /> },
    { id: "storage",       label: t("storage"),       iconEl: <HardDrives size={18} /> },
    { id: "sicherheit",    label: t("security"),      iconEl: <Lock size={18} /> },
    { id: "overlay",       label: t("overlay"),       iconEl: <ScreencastSimple size={18} />, badge: "Beta" },
    { id: "update",        label: t("update"),        iconEl: <ArrowsClockwise size={18} /> },
    { id: "about",         label: t("about"),         iconEl: <Info size={18} /> },
    ...(debugUnlocked ? [{ id: "debug", label: t("debug"), iconEl: <Bug size={18} /> }] : []),
  ];

  return (
    <div style={{
      position: "absolute", top: 8, right: 4, bottom: 8, left: 8, zIndex: 300,
      background: "transparent",
      borderRadius: "var(--r-xl)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      animation: anim ? (closing ? "fadeSlideOut 0.22s cubic-bezier(0.4,0,0.2,1) forwards" : "fadeSlideIn 0.25s cubic-bezier(0.4,0,0.2,1)") : undefined,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 8,
        padding: collapsed ? "16px 0 8px" : "16px 12px 8px",
        justifyContent: collapsed ? "center" : "flex-start",
        flexShrink: 0,
      }}>
        <Button variant="ghost" size="sm" isIconOnly onPress={onClose} title={t("back") || "Back"} className="rounded-full shrink-0">
          <ArrowLeft size={16} weight="bold" />
        </Button>
        {!collapsed && (
          <span style={{ fontSize: "var(--t13)", fontWeight: 600, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t("appSettings")}
          </span>
        )}
      </div>

      <div style={{ height: 1, background: "var(--stroke)", margin: collapsed ? "0 8px 8px" : "0 12px 8px", flexShrink: 0 }} />

      {/* Nav items */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: collapsed ? "0 4px 8px" : "0 8px 8px" }}>
        <ListBox
          aria-label={t("appSettings")}
          selectionMode="none"
          onAction={(key) => setTab(key)}
          className="w-full"
        >
          {navItems.map(item => (
            <ListBoxItem
              key={item.id}
              id={item.id}
              textValue={item.label}
              title={collapsed ? item.label : undefined}
              className={cn(
                "text-t13 min-h-10 rounded-xl",
                tab === item.id && "bg-accent-dim text-accent",
                collapsed && "justify-center"
              )}
            >
              <span className="shrink-0 w-5 flex items-center justify-center">{item.iconEl}</span>
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="ml-auto shrink-0 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-accent text-white uppercase">{item.badge}</span>
              )}
              {!collapsed && item.id === "update" && updateInfo && !item.badge && (
                <span className="ml-auto shrink-0 w-[7px] h-[7px] rounded-full bg-accent" />
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </div>

      {/* Footer — version info + debug tap + quit */}
      <div style={{ borderTop: "0.5px solid var(--stroke)", paddingTop: 8, flexShrink: 0, position: "relative", margin: "0 8px 8px" }}>
        {debugToast && (
          <div
            className={[
              "absolute left-0 right-0 bottom-[calc(100%+6px)] rounded-lg px-2.5 py-1.5 text-t11 font-medium text-center pointer-events-none z-10 border",
              debugToast === "unlocked" ? "border-transparent" : "bg-surface-1 text-secondary border-border",
            ].join(" ")}
            style={{
              animation: "fadeIn 0.2s ease",
              ...(debugToast === "unlocked"
                ? {
                    background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                    color: "var(--accent)",
                    borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
                  }
                : {}),
            }}
          >
            {debugToast === "unlocked" ? t("debugUnlocked") : t("debugAlreadyActive")}
          </div>
        )}
        {!collapsed && (
          <div style={{ padding: "4px 2px 6px" }}>
            <div style={{ fontSize: "var(--t11)", fontWeight: 600, color: "var(--t1)", marginBottom: 2 }}>{APP_VERSION}</div>
            <div style={{ fontSize: "var(--t10)", color: "var(--t3)", lineHeight: 1.7 }}>
              <span onClick={handleTauriVersionTap} style={{ cursor: "default", userSelect: "none" }}>Tauri 2.10.3</span><br />
              Chromium {chromiumVersion}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountSettingsTab({ accounts, activeAccount, onSwitch, onAdd, onReauth, onRemove, onRename, onLogout, onAvatarChange, hideUserHandle, onToggleHideUserHandle }) {
  const t = useLang();
  const list = accounts || [];
  const active = activeAccount || list.find(a => a.active) || null;
  const [nameDraft, setNameDraft] = useState(active?.displayName || "");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  useEffect(() => { setNameDraft(active?.displayName || ""); }, [active?.name]);

  const nameChanged = !!active && !!nameDraft.trim() && nameDraft.trim() !== (active.displayName || "");

  // ─── Usage statistics ────────────────────────────────────────────────────────
  const [stats, setStats] = useState({ usage: 0, playtime: 0, liked: null, playlists: null, history: 0 });
  useEffect(() => {
    let history = 0;
    try {
      const hk = `kiyoshi-history-${window.__activeProfile || "default"}`;
      history = (JSON.parse(localStorage.getItem(hk) || "[]") || []).length;
    } catch {}
    setStats(s => ({
      ...s,
      usage: Number(localStorage.getItem("kiyoshi-total-usage") || 0),
      playtime: Number(localStorage.getItem("kiyoshi-total-playtime") || 0),
      history,
    }));
    let cancelled = false;
    fetch(`${API}/liked/ids`).then(r => r.json()).then(d => { if (!cancelled) setStats(s => ({ ...s, liked: (d.ids || []).length })); }).catch(() => {});
    fetch(`${API}/library/playlists`).then(r => r.json()).then(d => { if (!cancelled) setStats(s => ({ ...s, playlists: (d.playlists || []).length })); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const Avatar = ({ a, size }) => (
    <div
      className={cn("rounded-full overflow-hidden shrink-0 flex items-center justify-center font-semibold",
        a.type === "local" ? "bg-elevated text-secondary border border-border" : "bg-accent text-white")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {a.avatar
        ? <img src={thumb(a.avatar)} alt="" className="w-full h-full object-cover" />
        : (a.displayName || a.name || "?")[0].toUpperCase()}
    </div>
  );

  const pickAvatar = async () => {
    if (!active) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ multiple: false, filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
      if (!path) return;
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const bytes = await readFile(path);
      if (bytes.length > 2 * 1024 * 1024) { toast.danger(t("avatarTooLarge")); return; }
      const ext = String(path).split(".").pop().toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const dataUri = `data:${mime};base64,${btoa(binary)}`;
      await onAvatarChange?.(active.name, dataUri);
      toast.success(t("avatarUpdated"));
    } catch (e) { console.error("avatar pick failed:", e); }
  };

  const clearPlaybackHistory = () => {
    try {
      localStorage.removeItem(`kiyoshi-history-${window.__activeProfile || "default"}`);
      window.dispatchEvent(new Event("kiyoshi-history-updated"));
    } catch {}
    setStats(s => ({ ...s, history: 0 }));
    setConfirmClearHistory(false);
    toast.success(t("historyCleared"));
  };

  const StatTile = ({ icon, label, value }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-elevated">
      <div className="w-9 h-9 rounded-lg bg-accent-dim text-accent flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-t16 font-semibold truncate tabular-nums">{value}</div>
        <div className="text-t11 text-muted truncate">{label}</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 text-primary max-w-[560px]">
      {/* Active account card */}
      {active && (
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-elevated">
          {active.type === "local" ? (
            <button onClick={pickAvatar} title={t("changeAvatar")} className="relative group shrink-0 rounded-full cursor-default">
              <Avatar a={active} size={56} />
              <span className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <ImageSquare size={18} />
              </span>
            </button>
          ) : (
            <Avatar a={active} size={56} />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-t18 font-semibold truncate">{active.displayName || active.name}</div>
            {active.handle && <div className="text-t13 text-muted truncate">{active.handle}</div>}
            <div className="text-t11 text-muted mt-0.5">{active.type === "local" ? t("localAccount") : "Google"}</div>
          </div>
        </div>
      )}

      {/* Rename active account */}
      {active && (
        <div className="flex flex-col gap-2">
          <label className="text-t12 text-muted">{t("displayName")}</label>
          <div className="flex items-center gap-2">
            <TextFieldRoot
              aria-label={t("displayName")}
              value={nameDraft}
              onChange={setNameDraft}
              className="flex-1"
            >
              <InputRoot
                onKeyDown={e => { if (e.key === "Enter" && nameChanged) onRename(active.name, nameDraft); }}
              />
            </TextFieldRoot>
            <Button variant="primary" isDisabled={!nameChanged} onPress={() => onRename(active.name, nameDraft)}>
              {t("save")}
            </Button>
          </div>
        </div>
      )}

      {/* Sidebar display preference */}
      <SettingRow label={t("hideUserHandle")} description={t("hideUserHandleDesc")} icon={<EyeSlash />}>
        <Toggle value={hideUserHandle} onChange={onToggleHideUserHandle} />
      </SettingRow>

      {/* Accounts list */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-t12 font-semibold text-muted uppercase tracking-wider">{t("manageAccounts")}</span>
          <Button variant="ghost" size="sm" onPress={onAdd}>
            <UserPlus size={15} />
            {t("addAccount")}
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          {list.map(a => (
            <div key={a.name}
              className={cn("flex items-center gap-3 p-2 rounded-xl transition-colors duration-150", a.active ? "bg-accent-dim" : "hover:bg-hover")}
            >
              <Avatar a={a} size={36} />
              <div className="flex-1 min-w-0" onClick={() => { if (!a.active) onSwitch(a.name); }}>
                <div className={cn("text-t13 font-medium truncate", a.active && "text-accent")}>{a.displayName || a.name}</div>
                <div className="text-t11 text-muted truncate">
                  {a.type === "local" ? t("localAccount") : a.loggedOut ? t("logOut") : a.handle}
                </div>
              </div>
              {a.type !== "local" && (
                <Button variant="ghost" size="sm" isIconOnly onPress={() => onReauth(a.name)} title={t("reauthSession")}>
                  <ArrowClockwise size={14} />
                </Button>
              )}
              <Button variant="ghost" size="sm" isIconOnly onPress={() => setConfirmRemove(a.name)} title={t("removeAccountTitle")}
                className="text-muted hover:text-[#f44336]">
                <Trash size={14} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Log out current account */}
      {active && active.type !== "local" && (
        <div>
          <Button variant="danger-soft" onPress={onLogout}>
            <SignOut size={15} />
            {t("logOut")}
          </Button>
        </div>
      )}

      {/* External links — Google accounts only */}
      {active && active.type !== "local" && (
        <div className="flex flex-col gap-2">
          <span className="text-t12 font-semibold text-muted uppercase tracking-wider">{t("links")}</span>
          <div className="flex flex-col gap-1.5">
            <Button variant="ghost" fullWidth className="justify-start gap-2.5 rounded-xl" onPress={() => openUrl("https://music.youtube.com/").catch(console.error)}>
              <BrandYoutube size={16} />
              {t("openYouTubeMusic")}
              <ArrowSquareOut size={13} className="ml-auto text-muted" />
            </Button>
            <Button variant="ghost" fullWidth className="justify-start gap-2.5 rounded-xl" onPress={() => openUrl("https://myaccount.google.com/").catch(console.error)}>
              <UserCircle size={16} />
              {t("manageGoogleAccount")}
              <ArrowSquareOut size={13} className="ml-auto text-muted" />
            </Button>
          </div>
        </div>
      )}

      {/* Usage statistics */}
      <div className="flex flex-col gap-2">
        <span className="text-t12 font-semibold text-muted uppercase tracking-wider">{t("statistics")}</span>
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile icon={<Clock size={16} />} label={t("totalUsageTime")} value={fmtDuration(stats.usage)} />
          <StatTile icon={<MusicNote size={16} />} label={t("totalPlaytime")} value={fmtDuration(stats.playtime)} />
          <StatTile icon={<Heart size={16} />} label={t("likedSongs")} value={stats.liked == null ? "…" : stats.liked} />
          <StatTile icon={<Playlist size={16} />} label={t("playlists")} value={stats.playlists == null ? "…" : stats.playlists} />
          <StatTile icon={<ClockCounterClockwise size={16} />} label={t("history")} value={stats.history} />
        </div>
      </div>

      {/* Data management */}
      <div className="flex flex-col gap-2">
        <span className="text-t12 font-semibold text-muted uppercase tracking-wider">{t("dataManagement")}</span>
        <div>
          <Button variant="danger-soft" isDisabled={!stats.history} onPress={() => setConfirmClearHistory(true)}>
            <Trash size={15} />
            {t("clearPlaybackHistory")}
          </Button>
        </div>
      </div>

      {/* Clear history confirmation */}
      <ModalRoot isOpen={confirmClearHistory} onOpenChange={(open) => { if (!open) setConfirmClearHistory(false); }}>
        <ModalBackdrop className="z-[300]!">
          <ModalContainer placement="center" size="sm" className="w-[360px] max-w-[92vw]">
            <ModalDialog>
              <ModalHeader>
                <ModalIcon><ClockCounterClockwise size={18} /></ModalIcon>
                <ModalCloseTrigger />
                <ModalHeading>{t("clearPlaybackHistory")}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <div className="text-t12 text-muted leading-relaxed">{t("clearPlaybackHistoryDesc")}</div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onPress={() => setConfirmClearHistory(false)}>{t("cancel")}</Button>
                <Button variant="danger" onPress={clearPlaybackHistory}>{t("clearPlaybackHistoryConfirm")}</Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>

      {/* Remove confirmation */}
      <ModalRoot isOpen={!!confirmRemove} onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}>
        <ModalBackdrop className="z-[300]!">
          <ModalContainer placement="center" size="sm" className="w-[360px] max-w-[92vw]">
            <ModalDialog>
              <ModalHeader>
                <ModalIcon><Trash size={18} /></ModalIcon>
                <ModalCloseTrigger />
                <ModalHeading>{t("removeAccountTitle")}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <div className="text-t12 text-muted leading-relaxed">{t("removeAccountDesc")}</div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onPress={() => setConfirmRemove(null)}>{t("cancel")}</Button>
                <Button variant="danger" onPress={() => { const name = confirmRemove; setConfirmRemove(null); onRemove(name); }}>
                  {t("removeAccountConfirm")}
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>
    </div>
  );
}

function SettingsPanel({ onClose, accent, onAccentChange, accentDynamic, onAccentDynamicChange, accentSat, onAccentSatChange, accentLight, onAccentLightChange, appIcon = APP_ICON_DEFAULT, onAppIconChange, theme, onThemeChange, animations, onAnimationsChange, lyricsFontSize, onLyricsFontSizeChange, lyricsTranslationFontSize, onLyricsTranslationFontSizeChange, lyricsRomajiFontSize, onLyricsRomajiFontSizeChange, lyricsProviders, onLyricsProvidersChange, autoplay, onAutoplayChange, crossfade, onCrossfadeChange, crossfadeOverrides = {}, onRemoveCrossfadeOverride, playbackProgressive, onPlaybackProgressiveChange, closeTray, onCloseTrayChange, discordRpc, onDiscordRpcChange, language, onLanguageChange, updateInfo, onCheckUpdate, updateDownloading, updateDownloadProgress, updateDownloaded, onDownloadUpdate, onInstallUpdate, onCancelDownload, hideExplicit, onHideExplicitChange, hideUserHandle, onToggleHideUserHandle, uiZoom, onUiZoomChange, appFontScale, onFontScaleChange, showRomaji, onToggleRomaji, showAgentTags, onToggleAgentTags, syllableZoom, onToggleSyllableZoom, fluidLyrics, onToggleFluidLyrics, highContrast, onToggleHighContrast, appFont, onAppFontChange, ambientVisualizer, onToggleAmbientVisualizer, instrumentalViz, onToggleInstrumentalViz, vizConfig, onUpdateViz, vizPreviewTrack, vizPreviewPlaying, ambientBackground, onToggleAmbientBackground,
  obsEnabled, obsPort, obsPortInput, setObsPortInput, toggleObs, onObsPortSave,
  customShortcuts, shortcutLabels, recordingShortcut, setRecordingShortcut, getShortcutLabel, resetShortcut,
  accounts, activeAccount, onAccountSwitch, onAccountAdd, onAccountReauth, onAccountRemove, onAccountRename, onAccountLogout, onAccountAvatarChange,
  tab, setTab }) {
  const anim = useAnimations();
  const t = useLang();
  // Visualizer preview scales with the window height (live on resize) so on short windows it
  // shrinks — both the box AND the cover — leaving room to reach the options below.
  const [winH, setWinH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setWinH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const vizPreviewH = Math.round(Math.max(260, Math.min(620, winH * 0.48)));
  const vizCoverSize = Math.round(Math.max(130, Math.min(260, vizPreviewH * 0.42)));
  const [vizPreviewOpen, setVizPreviewOpen] = useState(() => localStorage.getItem("kodama-viz-preview") !== "collapsed");
  const toggleVizPreview = () => setVizPreviewOpen(o => { const n = !o; localStorage.setItem("kodama-viz-preview", n ? "open" : "collapsed"); return n; });
  const [debugUnlocked, setDebugUnlocked] = useState(() => localStorage.getItem("kiyoshi-debug-unlocked") === "true");
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [debugToast, setDebugToast] = useState(null); // "unlocked" | "already" | null
  const debugTapTimer = useRef(null);
  const handleTauriVersionTap = () => {
    if (debugUnlocked) { setDebugToast("already"); clearTimeout(debugTapTimer.current); debugTapTimer.current = setTimeout(() => setDebugToast(null), 1800); return; }
    setDebugTapCount(n => {
      const next = n + 1;
      clearTimeout(debugTapTimer.current);
      if (next >= 5) {
        localStorage.setItem("kiyoshi-debug-unlocked", "true");
        setDebugUnlocked(true);
        setDebugToast("unlocked");
        debugTapTimer.current = setTimeout(() => setDebugToast(null), 2500);
        return 0;
      }
      debugTapTimer.current = setTimeout(() => setDebugTapCount(0), 2000);
      return next;
    });
  };
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [overlayPreviewOpen, setOverlayPreviewOpen] = useState(false);
  const colorPickerTriggerRef = useRef(null);
  const chromiumVersion = window.navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? "—";

  // ── PIN protection state ──────────────────────────────────────────────────
  const [pinEnabled, setPinEnabled] = useState(() => localStorage.getItem("kiyoshi-pin-enabled") === "true");
  const [pinVerified, setPinVerified] = useState(() => localStorage.getItem("kiyoshi-pin-enabled") !== "true");
  const [pinDigits, setPinDigits] = useState([]);
  const [pinError, setPinError] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  // Setup / change dialog
  const [pinSetup, setPinSetup] = useState(null); // null | { mode:"enable"|"change"|"disable", step:"current"|"new"|"confirm", first:string|null }
  const [pinSetupDigits, setPinSetupDigits] = useState([]);
  const [pinSetupError, setPinSetupError] = useState("");
  // PIN type: "pin" (keypad) or "password" (text input)
  const [pinType, setPinType] = useState(() => localStorage.getItem("kiyoshi-pin-type") || "pin");
  // PIN length: 4 or 6 digits (only relevant when pinType === "pin")
  const [pinLength, setPinLength] = useState(() => parseInt(localStorage.getItem("kiyoshi-pin-length") || "4", 10));
  const [pinPasswordInput, setPinPasswordInput] = useState("");
  const [pinSetupPasswordInput, setPinSetupPasswordInput] = useState("");
  const [showPinPassword, setShowPinPassword] = useState(false);
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [pinEmergencyConfirm, setPinEmergencyConfirm] = useState(false);
  const [pinLockTaps, setPinLockTaps] = useState(0);
  const pinLockTapTimer = useRef(null);
  const PIN_EMERGENCY_TAPS = 7;

  const PIN_LEN = pinLength;

  const submitPinEntry = async (input) => {
    const stored = localStorage.getItem("kiyoshi-pin-hash");
    const hash   = await hashPin(input);
    if (hash === stored) {
      setPinVerified(true);
      setPinDigits([]);
      setPinPasswordInput("");
    } else {
      setPinShake(true);
      setPinError(true);
      setPinDigits([]);
      setPinPasswordInput("");
      setTimeout(() => { setPinShake(false); setPinError(false); }, 700);
    }
  };

  const handlePinKey = (key) => {
    if (pinError) return;
    if (key === "del") { setPinDigits(d => d.slice(0, -1)); return; }
    setPinDigits(prev => {
      if (prev.length >= PIN_LEN) return prev;
      const next = [...prev, key];
      if (next.length === PIN_LEN) setTimeout(() => submitPinEntry(next.join("")), 80);
      return next;
    });
  };

  const handleSetupKey = async (key) => {
    if (key === "del") { setPinSetupDigits(d => d.slice(0, -1)); setPinSetupError(""); return; }
    setPinSetupDigits(prev => {
      if (prev.length >= PIN_LEN) return prev;
      const next = [...prev, key];
      if (next.length === PIN_LEN) {
        setTimeout(() => advanceSetup(next.join("")), 80);
      }
      return next;
    });
  };

  const advanceSetup = async (input) => {
    const { mode, step, first } = pinSetup;
    const resetSetupInputs = () => { setPinSetupDigits([]); setPinSetupPasswordInput(""); };
    if (step === "current") {
      const hash = await hashPin(input);
      if (hash !== localStorage.getItem("kiyoshi-pin-hash")) {
        setPinSetupError(t("pinWrong"));
        resetSetupInputs();
        return;
      }
      setPinSetup(s => ({ ...s, step: mode === "disable" ? "done" : "new" }));
      if (mode === "disable") {
        localStorage.removeItem("kiyoshi-pin-hash");
        localStorage.removeItem("kiyoshi-pin-enabled");
        localStorage.removeItem("kiyoshi-pin-type");
        localStorage.removeItem("kiyoshi-pin-length");
        setPinEnabled(false);
        setPinSetup(null);
        resetSetupInputs();
        return;
      }
      resetSetupInputs();
      setPinSetupError("");
      return;
    }
    if (step === "new") {
      setPinSetup(s => ({ ...s, step: "confirm", first: input }));
      resetSetupInputs();
      setPinSetupError("");
      return;
    }
    if (step === "confirm") {
      if (input !== first) {
        setPinSetupError(t("pinMismatch"));
        resetSetupInputs();
        setPinSetup(s => ({ ...s, step: "new", first: null }));
        return;
      }
      const hash = await hashPin(input);
      localStorage.setItem("kiyoshi-pin-hash", hash);
      localStorage.setItem("kiyoshi-pin-enabled", "true");
      localStorage.setItem("kiyoshi-pin-type", pinType);
      if (pinType === "pin") localStorage.setItem("kiyoshi-pin-length", String(pinLength));
      setPinEnabled(true);
      setPinVerified(true);
      setPinSetup(null);
      resetSetupInputs();
      setPinSetupError("");
    }
  };

  const PinDots = ({ count, filled }) => (
    <div className="flex gap-3.5 justify-center">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("w-3.5 h-3.5 rounded-full border-2 transition-colors",
          i < filled ? "bg-primary border-primary" : "border-secondary")} />
      ))}
    </div>
  );

  const PinKeypad = ({ onKey }) => (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(3, 68px)" }}>
      {[1,2,3,4,5,6,7,8,9,"del",0,null].map((k, i) => {
        if (k === null) return <div key={i} />;
        return (
          <Button key={i} variant={k === "del" ? "ghost" : "secondary"}
            onPress={() => onKey(k === "del" ? "del" : k)}
            className="h-[58px] w-full rounded-xl text-t20 font-semibold">
            {k === "del" ? "⌫" : k}
          </Button>
        );
      })}
    </div>
  );

  // ── Keyboard support for PIN entry / setup ───────────────────────────────
  useEffect(() => {
    if (pinType !== "pin") return; // password mode uses native <input>
    const isEntryActive = pinEnabled && !pinVerified && !pinSetup;
    const isSetupActive = !!pinSetup;
    if (!isEntryActive && !isSetupActive) return;

    const onKey = (e) => {
      if (e.repeat) return;
      const digit = parseInt(e.key, 10);
      if (!isNaN(digit) && e.key.length === 1) {
        if (isEntryActive) handlePinKey(digit);
        else handleSetupKey(digit);
      } else if (e.key === "Backspace") {
        if (isEntryActive) handlePinKey("del");
        else handleSetupKey("del");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinType, pinEnabled, pinVerified, pinSetup, pinError]);

  const PasswordEntryInput = ({ value, onChange, onSubmit, show, onToggleShow, error, autoFocus }) => (
    <div className="flex flex-col items-center gap-3.5">
      <div className="relative w-[260px]">
        <TextFieldRoot aria-label="PIN" value={value} onChange={onChange} className="w-full">
          <InputRoot
            type={show ? "text" : "password"}
            placeholder="••••••••"
            autoFocus={autoFocus}
            onKeyDown={e => { if (e.key === "Enter" && value.length > 0) onSubmit(value); }}
            className={cn("pr-11", error && "border-[#f44336]!")}
          />
        </TextFieldRoot>
        <button
          onClick={onToggleShow}
          tabIndex={-1}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 flex items-center text-muted hover:text-primary"
        >
          {show ? <EyeSlash size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <div className="text-t12 font-medium" style={{ color: "#f44336" }}>{error}</div>}
      <Button variant="primary" isDisabled={value.length === 0} onPress={() => value.length > 0 && onSubmit(value)}>
        {t("pinSubmit")}
      </Button>
    </div>
  );

  const navItems = [
    { id: "account",        label: t("account"),       iconEl: <UserCircle size={18} /> },
    { id: "darstellung",    label: t("appearance"),    iconEl: <PaintBrushBroad size={18} /> },
    { id: "visualizer",     label: t("visualizer"),    iconEl: <WaveformLines size={18} /> },
    { id: "wiedergabe",     label: t("playback"),      iconEl: <Play size={18} /> },
    { id: "lyrics",         label: t("lyrics"),        iconEl: <ChatText size={18} /> },
    { id: "accessibility",  label: t("accessibility"), iconEl: <PersonArmsSpread size={18} /> },
    { id: "shortcuts",   label: t("shortcuts"),   iconEl: <Keyboard size={18} /> },
    { id: "language",    label: t("language"),    iconEl: <Translate size={18} /> },
    { id: "storage",    label: t("storage"),     iconEl: <HardDrives size={18} /> },
    { id: "sicherheit", label: t("security"),   iconEl: <Lock size={18} /> },
    { id: "overlay",    label: t("overlay"),     iconEl: <ScreencastSimple size={18} />, badge: "Beta" },
    { id: "update",     label: t("update"),      iconEl: <ArrowsClockwise size={18} /> },
    { id: "about",      label: t("about"),       iconEl: <Info size={18} /> },
    ...(debugUnlocked ? [{ id: "debug", label: t("debug"), iconEl: <Bug size={18} /> }] : []),
  ];


  const SectionLabel = SettingsSectionLabel;
  const SectionDesc = SettingsSectionDesc;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", overflow: "hidden", background: "var(--bg-base)" }}>
        {/* ── PIN entry overlay ─────────────────────────────────────────────── */}
        {pinEnabled && !pinVerified && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20, borderRadius: 12,
            background: "var(--bg-base)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 24,
            animation: anim ? "fadeIn 0.18s ease" : undefined,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div
                onClick={() => {
                  const next = pinLockTaps + 1;
                  setPinLockTaps(next);
                  clearTimeout(pinLockTapTimer.current);
                  if (next >= PIN_EMERGENCY_TAPS) {
                    setPinLockTaps(0);
                    setPinEmergencyConfirm(true);
                  } else {
                    pinLockTapTimer.current = setTimeout(() => setPinLockTaps(0), 2000);
                  }
                }}
                style={{ cursor: "default", userSelect: "none" }}
              >
                <Lock size={36} style={{ color: "var(--accent)" }} />
              </div>
              <div style={{ fontSize: "var(--t18)", fontWeight: 700, color: "var(--text-primary)" }}>Kodama</div>
              <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)" }}>{t("pinEnterPrompt")}</div>

            </div>

            <div style={{
              animation: pinShake ? "pinShake 0.5s ease" : undefined,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
            }}>
              {pinType === "pin" ? (
                <>
                  <PinDots count={PIN_LEN} filled={pinDigits.length} />
                  {pinError && (
                    <div style={{ fontSize: "var(--t12)", color: "#f44336", fontWeight: 500 }}>
                      {t("pinWrong")}
                    </div>
                  )}
                </>
              ) : (
                <PasswordEntryInput
                  value={pinPasswordInput}
                  onChange={v => { if (!pinError) setPinPasswordInput(v); }}
                  onSubmit={async (val) => { setPinPasswordInput(""); await submitPinEntry(val); }}
                  show={showPinPassword}
                  onToggleShow={() => setShowPinPassword(v => !v)}
                  error={pinError ? t("pinWrong") : ""}
                  autoFocus
                />
              )}
            </div>

            {pinType === "pin" && <PinKeypad onKey={handlePinKey} />}

            {/* ── Emergency reset — only visible after 7 secret taps on the lock icon ── */}
            {pinEmergencyConfirm && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                background: "rgba(244,67,54,0.08)", border: "0.5px solid rgba(244,67,54,0.3)",
                borderRadius: 12, padding: "16px 24px", marginTop: 8,
              }}>
                <div style={{ fontSize: "var(--t12)", color: "#f44336", fontWeight: 600, textAlign: "center", maxWidth: 280 }}>
                  {t("pinEmergencyConfirmText")}
                </div>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm"
                    onPress={() => {
                      localStorage.removeItem("kiyoshi-pin-hash");
                      localStorage.removeItem("kiyoshi-pin-enabled");
                      localStorage.removeItem("kiyoshi-pin-type");
                      localStorage.removeItem("kiyoshi-pin-length");
                      setPinEnabled(false);
                      setPinVerified(true);
                      setPinDigits([]);
                      setPinPasswordInput("");
                      setPinSetup(null);
                      setPinSetupDigits([]);
                      setPinSetupPasswordInput("");
                      setPinSetupError("");
                      setPinEmergencyConfirm(false);
                    }}>
                    {t("pinEmergencyConfirm")}
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => setPinEmergencyConfirm(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PIN setup / change dialog ─────────────────────────────────────── */}
        {pinSetup && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 30, borderRadius: 12,
            background: "color-mix(in srgb, var(--bg-base) 92%, transparent)", backdropFilter: "blur(8px)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 24, animation: anim ? "fadeIn 0.18s ease" : undefined,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: "var(--t16)", fontWeight: 700, color: "var(--text-primary)" }}>
                {pinSetup.step === "current" ? t("pinEnterCurrent")
                  : pinSetup.step === "new"  ? t("pinEnterNew")
                  : t("pinConfirmNew")}
              </div>
            </div>

            {/* current step: use stored pinType; new/confirm: use selected pinType */}
            {(pinSetup.step === "current" ? pinType : pinType) === "pin" ? (
              <>
                <PinDots count={PIN_LEN} filled={pinSetupDigits.length} />
                {pinSetupError && (
                  <div style={{ fontSize: "var(--t12)", color: "#f44336", fontWeight: 500 }}>{pinSetupError}</div>
                )}
                <PinKeypad onKey={handleSetupKey} />
              </>
            ) : (
              <PasswordEntryInput
                value={pinSetupPasswordInput}
                onChange={v => { setPinSetupPasswordInput(v); setPinSetupError(""); }}
                onSubmit={async (val) => { setPinSetupPasswordInput(""); await advanceSetup(val); }}
                show={showSetupPassword}
                onToggleShow={() => setShowSetupPassword(v => !v)}
                error={pinSetupError}
                autoFocus
              />
            )}

            <Button variant="ghost" size="sm" onPress={() => { setPinSetup(null); setPinSetupDigits([]); setPinSetupError(""); }}>
              {t("cancel")}
            </Button>
          </div>
        )}


        {/* Right Content */}
        <div style={{ flex: 1, background: "var(--bg-base)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "24px 32px 0", flexShrink: 0 }}>
            <div style={{ fontSize: "var(--t20)", fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
              {navItems.find(i => i.id === tab)?.label}
              {navItems.find(i => i.id === tab)?.badge && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  padding: "3px 8px", borderRadius: 5,
                  background: "var(--accent)", color: "#fff",
                  textTransform: "uppercase",
                }}>{navItems.find(i => i.id === tab)?.badge}</span>
              )}
            </div>
            <div style={{ height: 1, background: "var(--border)", marginTop: 20 }} />
          </div>

          <div key={tab} className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "8px 32px 32px", animation: anim ? "fadeSlideIn 0.22s cubic-bezier(0.4,0,0.2,1)" : "none" }}>

            {tab === "account" && (
              <AccountSettingsTab
                accounts={accounts} activeAccount={activeAccount}
                onSwitch={onAccountSwitch} onAdd={onAccountAdd} onReauth={onAccountReauth}
                onRemove={onAccountRemove} onRename={onAccountRename} onLogout={onAccountLogout} onAvatarChange={onAccountAvatarChange}
                hideUserHandle={hideUserHandle} onToggleHideUserHandle={onToggleHideUserHandle}
              />
            )}
            {tab === "visualizer" && (
              <>
                {/* Live preview — reflects the current track + config in real time.
                    Collapsible so the options below are always reachable on short windows. */}
                {vizPreviewOpen ? (
                  <div className="mb-4 rounded-xl overflow-hidden border border-border sticky z-10 shrink-0" style={{ height: vizPreviewH, top: -8, background: "var(--bg-base)" }}>
                    {vizPreviewTrack?.thumbnail && (<>
                      <div style={{ position: "absolute", inset: "-10%", backgroundImage: `url(${thumb(vizPreviewTrack.thumbnail)})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(56px) saturate(1.4) brightness(0.7)", transform: "scale(1.2)" }} />
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.42)" }} />
                    </>)}
                    <div style={{ position: "absolute", inset: 0 }}>
                      {vizPreviewTrack
                        ? <CoverView track={vizPreviewTrack} isPlaying={vizPreviewPlaying} onClose={() => {}} ambientVisualizer vizConfig={vizConfig} coverSize={vizCoverSize} />
                        : <div className="flex items-center justify-center h-full text-t13 text-muted">{t("visualizerPreviewHint") || "Play a song to preview the visualizer"}</div>}
                    </div>
                    <button onClick={toggleVizPreview} title={t("hidePreview") || "Vorschau einklappen"}
                      className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-full px-2.5 py-1 text-t12 text-white"
                      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
                      <EyeSlash size={14} /><CaretUp size={12} />
                    </button>
                  </div>
                ) : (
                  <button onClick={toggleVizPreview}
                    className="mb-4 w-full flex items-center justify-center gap-2 rounded-xl border border-border text-t13 text-secondary hover:bg-hover transition-colors"
                    style={{ height: 44 }}>
                    <Eye size={16} />{t("showPreview") || "Vorschau anzeigen"}<CaretDown size={13} />
                  </button>
                )}
                <SettingRow label={t("visualizer")} description={t("visualizerDesc")} icon={<WaveformLines />}>
                  <Toggle value={ambientVisualizer} onChange={onToggleAmbientVisualizer} />
                </SettingRow>
                <SettingRow label={t("instrumentalViz") || "Instrumental cover"} description={t("instrumentalVizDesc") || "Show the cover + visualizer during instrumental passages in the lyrics view"} icon={<MusicNote />}>
                  <Toggle value={instrumentalViz} onChange={onToggleInstrumentalViz} />
                </SettingRow>
                <SettingRow label={t("visualizerShape") || "Shape"} icon={<WaveformLines />}>
                  <div className="flex gap-1.5">
                    <Button variant={vizConfig.shape === "frame" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ shape: "frame" })}>{t("visualizerFrame") || "Frame"}</Button>
                    <Button variant={vizConfig.shape === "ring" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ shape: "ring" })}>{t("visualizerRing") || "Ring"}</Button>
                    <Button variant={vizConfig.shape === "linear" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ shape: "linear" })}>{t("visualizerLinear") || "Linear"}</Button>
                  </div>
                </SettingRow>
                {vizConfig.shape === "linear" && (
                  <SettingRow label={t("visualizerPlacement") || "Placement"} icon={<WaveformLines />}>
                    <div className="flex gap-1.5">
                      <Button variant={(vizConfig.linearPos || "bottom") === "bottom" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ linearPos: "bottom" })}>{t("visualizerPosBottom") || "Bottom"}</Button>
                      <Button variant={vizConfig.linearPos === "center" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ linearPos: "center" })}>{t("visualizerPosCenter") || "Behind cover"}</Button>
                    </div>
                  </SettingRow>
                )}
                <SettingRow label={t("visualizerMirror") || "Mirror"} icon={<WaveformLines />}>
                  <Toggle value={!!vizConfig.mirror} onChange={(v) => onUpdateViz({ mirror: v })} />
                </SettingRow>
                <SettingRow label={t("visualizerBars") || "Bars"} icon={<WaveformLines />}>
                  <Slider min={8} max={160} step={2} value={vizConfig.barCount} onChange={(v) => onUpdateViz({ barCount: v })} width={200} />
                </SettingRow>
                <SettingRow label={t("visualizerLength") || "Bar length"} icon={<WaveformLines />}>
                  <Slider min={8} max={260} step={4} value={vizConfig.barLength} onChange={(v) => onUpdateViz({ barLength: v })} width={200} />
                </SettingRow>
                <SettingRow label={t("visualizerThickness") || "Bar thickness"} icon={<WaveformLines />}>
                  <Slider min={1} max={16} step={1} value={vizConfig.barThickness} onChange={(v) => onUpdateViz({ barThickness: v })} width={200} />
                </SettingRow>
                <SettingRow label={vizConfig.shape === "linear" ? (t("visualizerGapBottom") || "Gap from bottom") : (t("visualizerGap") || "Gap")} icon={<WaveformLines />}>
                  <Slider min={0} max={80} step={2} value={vizConfig.gap} onChange={(v) => onUpdateViz({ gap: v })} width={200} />
                </SettingRow>
                <SettingRow label={t("visualizerResponse") || "Responsiveness"} icon={<WaveformLines />}>
                  <Slider min={0} max={100} step={5} value={Math.round((vizConfig.responsiveness ?? 0.75) * 100)} onChange={(v) => onUpdateViz({ responsiveness: v / 100 })} width={200} />
                </SettingRow>
                <SettingRow label={t("visualizerFloor") || "Floor"} description={t("visualizerFloorDesc")} icon={<WaveformLines />}>
                  <Slider min={0} max={90} step={2} value={Math.round((vizConfig.floor ?? 0) * 100)} onChange={(v) => onUpdateViz({ floor: v / 100 })} width={200} />
                </SettingRow>
                <SettingRow label={t("visualizerCeiling") || "Ceiling"} icon={<WaveformLines />}>
                  <Slider min={10} max={100} step={2} value={Math.round((vizConfig.ceiling ?? 1) * 100)} onChange={(v) => onUpdateViz({ ceiling: v / 100 })} width={200} />
                </SettingRow>
                <SettingRow label={t("visualizerTilt") || "Tilt (boost highs)"} icon={<WaveformLines />}>
                  <Slider min={0} max={100} step={5} value={Math.round((vizConfig.tilt ?? 0) * 100)} onChange={(v) => onUpdateViz({ tilt: v / 100 })} width={200} />
                </SettingRow>
                <SettingRow label={t("visualizerBandSmooth") || "Band smoothing"} icon={<WaveformLines />}>
                  <Slider min={0} max={100} step={5} value={Math.round((vizConfig.smoothBands ?? 0) * 100)} onChange={(v) => onUpdateViz({ smoothBands: v / 100 })} width={200} />
                </SettingRow>
                <SettingRow label={t("visualizerRender") || "Render mode"} icon={<WaveformLines />}>
                  <div className="flex gap-1.5">
                    <Button variant={(vizConfig.render || "bars") === "bars" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ render: "bars" })}>{t("visualizerBarsMode") || "Bars"}</Button>
                    <Button variant={vizConfig.render === "curve" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ render: "curve" })}>{t("visualizerCurve") || "Curve"}</Button>
                  </div>
                </SettingRow>
                <SettingRow label={t("visualizerPeakHold") || "Peak hold"} icon={<WaveformLines />}>
                  <Toggle value={!!vizConfig.peakHold} onChange={(v) => onUpdateViz({ peakHold: v })} />
                </SettingRow>
                <SettingRow label={t("visualizerColor") || "Color"} icon={<PaintBrushBroad />}>
                  <div className="flex items-center gap-1.5">
                    <Button variant={vizConfig.color === "accent" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ color: "accent" })}>{t("accent") || "Accent"}</Button>
                    <Button variant={vizConfig.color === "cover" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ color: "cover" })}>{t("visualizerCover") || "Cover"}</Button>
                    <Button variant={vizConfig.color === "custom" ? "secondary" : "ghost"} size="sm" onPress={() => onUpdateViz({ color: "custom" })}>{t("custom") || "Custom"}</Button>
                    {vizConfig.color === "custom" && (
                      <input type="color" value={vizConfig.customColor || "#e040fb"} onChange={(e) => onUpdateViz({ customColor: e.target.value })}
                        className="w-7 h-7 rounded-md cursor-pointer border border-border bg-transparent p-0.5 shrink-0" />
                    )}
                  </div>
                </SettingRow>
                <SettingRow label={t("visualizerGradient") || "Gradient"} description={t("visualizerGradientDesc")} icon={<PaintBrushBroad />}>
                  <div className="flex items-center gap-2">
                    {vizConfig.gradient && (
                      <input type="color" value={vizConfig.gradColor || "#ffffff"} onChange={(e) => onUpdateViz({ gradColor: e.target.value })}
                        className="w-7 h-7 rounded-md cursor-pointer border border-border bg-transparent p-0.5 shrink-0" />
                    )}
                    <Toggle value={!!vizConfig.gradient} onChange={(v) => onUpdateViz({ gradient: v })} />
                  </div>
                </SettingRow>
                <SettingRow label={t("coverPulse") || "Cover pulse"} icon={<Sparkles />}>
                  <Toggle value={vizConfig.coverPulse !== false} onChange={(v) => onUpdateViz({ coverPulse: v })} />
                </SettingRow>
                {vizConfig.coverPulse !== false && (
                  <SettingRow label={t("coverPulseStrength") || "Pulse strength"} icon={<Sparkles />}>
                    <Slider min={0} max={100} step={5} value={Math.round((vizConfig.coverPulseStrength ?? 0.3) * 100)} onChange={(v) => onUpdateViz({ coverPulseStrength: v / 100 })} width={200} />
                  </SettingRow>
                )}
                <SettingRow label={t("visualizerBlobs") || "Ambient blobs"} icon={<Sparkles />}>
                  <Toggle value={vizConfig.blobs !== false} onChange={(v) => onUpdateViz({ blobs: v })} />
                </SettingRow>
              </>
            )}

            {tab === "darstellung" && (
              <>
                <SectionLabel>{t("theme")}</SectionLabel>
                <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                  {[
                    { id: "dark",  label: t("themeDark"),  bg: "#0d0d0d", surface: "#141414", elevated: "#1c1c1c", text: "#f0f0f0" },
                    { id: "oled",  label: t("themeOled"),  bg: "#000000", surface: "#080808", elevated: "#0f0f0f", text: "#ffffff" },
                    { id: "light", label: t("themeLight"), bg: "#f0f0f0", surface: "#ffffff", elevated: "#e4e4e4", text: "#111111" },
                  ].map(th => (
                    <CardRoot key={th.id} onClick={() => onThemeChange(th.id)} variant="transparent"
                      className={cn(
                        "relative flex-1 p-0 gap-0 rounded-[10px] overflow-hidden cursor-default border-2",
                        anim && "transition-transform",
                        theme === th.id ? "border-accent shadow-[0_0_0_2px_var(--accent)]" : "border-border",
                        theme === th.id && anim && "scale-[1.02]",
                        anim && "hover:scale-[1.03]"
                      )}
                    >
                      {theme === th.id && (
                        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow-md">
                          <Check size={12} weight="bold" className="text-white" />
                        </div>
                      )}
                      {/* Mini preview */}
                      <div style={{ background: th.bg, padding: 10, height: 80 }}>
                        <div style={{ background: th.surface, borderRadius: 6, padding: "6px 8px", marginBottom: 5 }}>
                          <div style={{ width: "60%", height: 5, borderRadius: 3, background: accent, marginBottom: 4 }} />
                          <div style={{ width: "40%", height: 4, borderRadius: 3, background: th.text, opacity: 0.3 }} />
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <div style={{ flex: 1, background: th.elevated, borderRadius: 4, height: 24 }} />
                          <div style={{ flex: 1, background: th.elevated, borderRadius: 4, height: 24 }} />
                        </div>
                      </div>
                      {/* Label */}
                      <div style={{
                        background: th.surface, padding: "7px 10px", fontSize: "var(--t12)", fontWeight: 500,
                        color: theme === th.id ? accent : th.text, textAlign: "center",
                        borderTop: `1px solid ${th.id === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.06)"}`,
                      }}>{th.label}</div>
                    </CardRoot>
                  ))}
                </div>

                <SectionLabel>{t("accentColor")}</SectionLabel>
                <div className="flex gap-1.5 mb-3">
                  <Button variant={!accentDynamic ? "secondary" : "ghost"} size="sm" onPress={() => onAccentDynamicChange(false)}>{t("accentCustom") || "Custom"}</Button>
                  <Button variant={accentDynamic ? "secondary" : "ghost"} size="sm" onPress={() => onAccentDynamicChange(true)}>{t("visualizerDynamic") || "Dynamic"}</Button>
                </div>
                {accentDynamic ? (
                  <>
                    <div className="flex items-center gap-3 mb-2 rounded-xl border border-border px-4 py-3.5" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                      <span className="w-8 h-8 rounded-full shrink-0" style={{ background: "var(--accent)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)" }} />
                      <span style={{ fontSize: "var(--t13)", color: "var(--text-secondary)" }}>{t("accentDynamicDesc") || "The accent colour is derived live from the current track's cover art."}</span>
                    </div>
                    <SettingRow label={t("accentVibrancy") || "Vibrancy"} icon={<PaintBrushBroad />}>
                      <Slider min={0} max={100} step={5} value={Math.round((accentSat ?? 0.5) * 100)} onChange={(v) => onAccentSatChange(v / 100)} width={200} />
                    </SettingRow>
                    <SettingRow label={t("accentBrightness") || "Brightness"} icon={<Sparkles />}>
                      <Slider min={30} max={85} step={5} value={Math.round((accentLight ?? 0.6) * 100)} onChange={(v) => onAccentLightChange(v / 100)} width={200} />
                    </SettingRow>
                  </>
                ) : (
                  <AccentColorPicker value={accent} onChange={onAccentChange} />
                )}

                <SectionLabel>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {t("appIcon")}
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", background: "var(--accent)", color: "#fff", padding: "2px 5px", borderRadius: 4, lineHeight: 1.4 }}>Beta</span>
                  </span>
                </SectionLabel>
                <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", margin: "-2px 0 10px", paddingLeft: 2 }}>{t("appIconDesc")}</div>
                {APP_ICON_GROUPS.map(group => (
                  <div key={group.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: "var(--t11)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7 }}>{t(group.labelKey)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))", gap: 10 }}>
                      {group.icons.map(ic => {
                        const selected = appIcon === ic.file;
                        return (
                          <button key={ic.file} onClick={() => onAppIconChange?.(ic.file)} title={ic.label}
                            className={cn(
                              "relative p-0 rounded-[14px] overflow-hidden cursor-default border-2 aspect-square bg-transparent",
                              anim && "transition-transform hover:scale-[1.05]",
                              selected ? "border-accent shadow-[0_0_0_2px_var(--accent)]" : "border-transparent"
                            )}>
                            <img src={`/App-Icons/${encodeURIComponent(ic.file)}`} alt={ic.label} draggable={false} className="w-full h-full object-cover block" />
                            {selected && (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center shadow-md">
                                <Check size={10} weight="bold" className="text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <SectionLabel>{t("appearance")}</SectionLabel>
                <SettingRow label={t("animations")} description={t("animationsDesc")} icon={<Sparkles />}>
                  <Toggle value={animations} onChange={onAnimationsChange} />
                </SettingRow>
                <SettingRow label={t("uiZoom")} description={t("uiZoomDesc")} icon={<MagnifyingGlass />}>
                  <div style={{ width: 360 }}>
                    <Slider min={0} max={ZOOM_STEPS.length - 1} step={1}
                      value={Math.max(0, ZOOM_STEPS.indexOf(uiZoom))}
                      onChange={i => onUiZoomChange(ZOOM_STEPS[i])} width={360} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      {ZOOM_LABELS.map((label, i) => (
                        <span key={i} style={{ fontSize: "var(--t10)", fontWeight: uiZoom === ZOOM_STEPS[i] ? 700 : 400, color: uiZoom === ZOOM_STEPS[i] ? "var(--accent)" : "var(--text-muted)" }}>{label}</span>
                      ))}
                    </div>
                  </div>
                </SettingRow>
                <SettingRow label={t("fontSize")} description={t("fontSizeDesc")} icon={<TextSize />}>
                  <div style={{ width: 360 }}>
                    <Slider min={0} max={FONT_STEPS.length - 1} step={1}
                      value={Math.max(0, FONT_STEPS.indexOf(appFontScale))}
                      onChange={i => onFontScaleChange(FONT_STEPS[i])} width={360} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      {FONT_LABELS.map((label, i) => (
                        <span key={i} style={{ fontSize: "var(--t10)", fontWeight: appFontScale === FONT_STEPS[i] ? 700 : 400, color: appFontScale === FONT_STEPS[i] ? "var(--accent)" : "var(--text-muted)" }}>{label}</span>
                      ))}
                    </div>
                  </div>
                </SettingRow>
              </>
            )}

            {tab === "wiedergabe" && (
              <>
                <SectionLabel>{t("general")}</SectionLabel>
                <SettingRow label={t("autoplay")} description={t("autoplayDesc")} icon={<PlayCircle />}>
                  <Toggle value={autoplay} onChange={onAutoplayChange} />
                </SettingRow>
                <SettingRow label={t("progressivePlayback") || "Progressives Laden"} description={t("progressivePlaybackDesc") || "Schnellerer Start: streamt den Song statt ihn erst komplett herunterzuladen. Aus = klassisch (lädt vollständig, stabiler auf schwachen Geräten)."} icon={<WaveformLines />}>
                  <Toggle value={playbackProgressive} onChange={onPlaybackProgressiveChange} />
                </SettingRow>
                <SettingRow label={<span style={{ display: "flex", alignItems: "center", gap: 6 }}>{t("crossfade")}<span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", background: "var(--accent)", color: "#fff", padding: "2px 5px", borderRadius: 4, lineHeight: 1.4 }}>Beta</span></span>} description={`${t("crossfadeDesc")}: ${crossfade}s`} icon={<Sliders />}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Slider min={0} max={12} step={1} value={crossfade} onChange={onCrossfadeChange} width={120} />
                    <span style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", width: 28 }}>{crossfade}s</span>
                  </div>
                </SettingRow>
                <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", margin: "-2px 0 6px", paddingLeft: 2 }}>{t("customCrossfadesDesc")}</div>
                {Object.keys(crossfadeOverrides).length > 0 && (
                  <div style={{ margin: "2px 0 6px", padding: "10px 12px", background: "var(--fill-subtle)", borderRadius: 10 }}>
                    <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", marginBottom: 8 }}>{t("customCrossfadesTitle")}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {Object.entries(crossfadeOverrides).map(([key, ov]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t12)", color: "var(--text-primary)" }}>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ov.fromTitle || key.split("__")[0]}</span>
                            <span style={{ color: "var(--accent)", fontWeight: 700 }}>→</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ov.toTitle || key.split("__")[1]}</span>
                          </span>
                          <span style={{ fontSize: "var(--t11)", fontWeight: 700, color: "var(--accent)", width: 30, textAlign: "right" }}>{ov.secs}s</span>
                          <Button variant="ghost" size="sm" isIconOnly className="h-7 min-w-7 text-muted hover:text-[#ff7070]!" onPress={() => onRemoveCrossfadeOverride?.(key)}>
                            <Trash size={13} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <SettingRow label={t("hideExplicit")} description={t("hideExplicitDesc")} icon={<EyeSlash />}>
                  <Toggle value={hideExplicit} onChange={onHideExplicitChange} />
                </SettingRow>

                <SectionLabel>{t("connection")}</SectionLabel>
                <SettingRow label={t("discordRpc")} description={t("discordRpcDesc")} icon={<ShareNodes />}>
                  <Toggle value={discordRpc} onChange={onDiscordRpcChange} />
                </SettingRow>
                <LastfmRow />
              </>
            )}

            {tab === "lyrics" && (
              <>
                <SectionLabel>{t("general")}</SectionLabel>
                <SettingRow label={t("fontSize")} description={`${t("fontSizeDesc")}: ${lyricsFontSize}px`} icon={<TextSize />}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Slider min={18} max={52} step={2} value={lyricsFontSize} onChange={onLyricsFontSizeChange} width={120} />
                    <span style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", width: 36 }}>{lyricsFontSize}px</span>
                  </div>
                </SettingRow>
                <SettingRow label={t("translationFontSize")} description={`${t("fontSizeDesc")}: ${lyricsTranslationFontSize}px`} icon={<Translate />}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Slider min={12} max={40} step={2} value={lyricsTranslationFontSize} onChange={onLyricsTranslationFontSizeChange} width={120} />
                    <span style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", width: 36 }}>{lyricsTranslationFontSize}px</span>
                  </div>
                </SettingRow>
                <SettingRow label={t("showRomaji")} description={t("romajiLyrics")} icon={<Globe />}>
                  <Toggle value={showRomaji} onChange={onToggleRomaji} />
                </SettingRow>
                <SettingRow label={t("showAgentTags")} description={t("showAgentTagsDesc")} icon={<Tag />}>
                  <Toggle value={showAgentTags} onChange={onToggleAgentTags} />
                </SettingRow>
                <SettingRow label={t("syllableZoom")} description={t("syllableZoomDesc")} icon={<Sparkles />}>
                  <Toggle value={syllableZoom} onChange={onToggleSyllableZoom} />
                </SettingRow>
                <SettingRow label={t("fluidLyrics")} description={t("fluidLyricsDesc")} icon={<WaveformLines />}>
                  <Toggle value={fluidLyrics} onChange={onToggleFluidLyrics} />
                </SettingRow>
                <SettingRow label={t("romajiFontSize")} description={`${t("fontSizeDesc")}: ${lyricsRomajiFontSize}px`} icon={<TextSize />}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Slider min={12} max={40} step={2} value={lyricsRomajiFontSize} onChange={onLyricsRomajiFontSizeChange} width={120} />
                    <span style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", width: 36 }}>{lyricsRomajiFontSize}px</span>
                  </div>
                </SettingRow>
                <SectionLabel>{t("lyricsProviders")}</SectionLabel>
                <SectionDesc>{t("lyricsProvidersDesc")}</SectionDesc>
                <LyricsProviderList providers={lyricsProviders || DEFAULT_LYRICS_PROVIDERS} onChange={onLyricsProvidersChange} />
                <UnisonIdentitySection />
                <ComposerSettingsSection />
              </>
            )}

            {tab === "accessibility" && (
              <>
                <SectionLabel>{t("appearance")}</SectionLabel>
                <SettingRow label={t("highContrast")} description={t("highContrastDesc")} icon={<CircleHalf />}>
                  <Toggle value={highContrast} onChange={onToggleHighContrast} />
                </SettingRow>
                <SettingRow label={t("ambientBackground")} description={t("ambientBackgroundDesc")} icon={<Sparkles />}>
                  <Toggle value={ambientBackground} onChange={onToggleAmbientBackground} />
                </SettingRow>

                <SectionLabel>{t("behaviour")}</SectionLabel>
                <SettingRow label={t("closeTray")} description={t("closeTrayDesc")} icon={<X />}>
                  <Toggle value={closeTray} onChange={onCloseTrayChange} />
                </SettingRow>

                <SectionLabel>{t("appFont")}</SectionLabel>
                <div className="flex flex-col gap-2">
                  {[
                    { id: "default",  label: t("appFontDefault"),  font: "'MiSans Latin', system-ui, sans-serif" },
                    { id: "dyslexic", label: t("appFontDyslexic"), font: "'OpenDyslexic', system-ui, sans-serif" },
                  ].map(f => (
                    <CardRoot
                      key={f.id}
                      onClick={() => onAppFontChange(f.id)}
                      variant="secondary"
                      className={cn(
                        "flex flex-row items-center justify-between gap-3 px-4 py-3.5 cursor-default border-2 transition-colors",
                        appFont === f.id ? "border-accent bg-accent-dim" : "border-transparent bg-surface-1 hover:bg-hover"
                      )}
                    >
                      <div>
                        <div className="text-t13 font-semibold text-primary mb-0.5" style={{ fontFamily: f.font }}>{f.label}</div>
                        <div className="text-t12 text-muted" style={{ fontFamily: f.font }}>{language === "de" ? "Franz jagt im komplett verwahrlosten Taxi quer durch Bayern" : "The quick brown fox jumps over the lazy dog"}</div>
                      </div>
                      {appFont === f.id && <Check size={16} className="text-accent shrink-0 ml-3" />}
                    </CardRoot>
                  ))}
                </div>
              </>
            )}

            {tab === "shortcuts" && (() => {
              const SHORTCUT_ACTIONS = [
                { id: "playPause",   label: t("scPlayPause") },
                { id: "nextTrack",   label: t("scNext") },
                { id: "prevTrack",   label: t("scPrev") },
                { id: "volUp",       label: t("scVolUp") },
                { id: "volDown",     label: t("scVolDown") },
                { id: "fullscreen",  label: t("scFullscreen") },
                { id: "mute",        label: t("scMute") },
                { id: "lyrics",      label: t("scToggleLyrics") },
                { id: "seekBack",    label: t("scSeekBack") },
                { id: "seekForward", label: t("scSeekForward") },
                { id: "zoomIn",      label: t("scZoomIn") },
                { id: "zoomOut",     label: t("scZoomOut") },
              ];
              // Find conflict: which action uses the given code (excluding the one being checked)
              const conflictFor = (code, excludeId) =>
                SHORTCUT_ACTIONS.find(a => a.id !== excludeId && customShortcuts[a.id] === code)?.label;

              return (
                <>
                  <div className="flex flex-col gap-1.5">
                    {SHORTCUT_ACTIONS.map(({ id, label, fixed }) => {
                      const code = customShortcuts[id];
                      const isRecording = recordingShortcut === id;
                      const displayKey = getShortcutLabel(code);
                      const conflict = !isRecording && conflictFor(code, id);
                      return (
                        <CardRoot
                          key={id}
                          variant="secondary"
                          className={cn(
                            "bg-surface-1 flex flex-row items-center justify-between gap-3 px-[18px] py-3 border-2 transition-colors",
                            isRecording ? "border-accent" : conflict ? "border-[rgba(255,100,100,0.45)]" : "border-transparent"
                          )}
                        >
                          <span className="text-t13 text-secondary">{label}</span>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {isRecording ? (
                              <span className="text-t12 text-accent italic min-w-[100px] text-right">{t("scRecording")}</span>
                            ) : displayKey === "—" ? (
                              <span className="text-t14 font-semibold text-muted px-2">—</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                {displayKey.split("+").map((part, ki) => (
                                  <KbdRoot key={ki} style={{ fontFamily: "var(--font)" }} className={cn("text-t14 h-7 px-2.5 min-w-[30px] justify-center bg-surface-2!", conflict ? "text-[rgb(255,130,130)]!" : "text-primary!")}>
                                    <KbdContent>{part}</KbdContent>
                                  </KbdRoot>
                                ))}
                              </div>
                            )}
                            {!fixed && (
                              <Button variant={isRecording ? "primary" : "ghost"} size="sm" isIconOnly
                                onPress={() => setRecordingShortcut(isRecording ? null : id)}
                                title={isRecording ? t("scCancelRecord") : t("scRecordBtn")}>
                                {isRecording ? <X size={14} /> : <PencilSimple size={14} />}
                              </Button>
                            )}
                            {!fixed && customShortcuts[id] !== DEFAULT_SHORTCUTS[id] && !isRecording && (
                              <Button variant="ghost" size="sm" isIconOnly className="text-muted"
                                onPress={() => resetShortcut(id)} title={t("scResetShortcut")}>
                                <ArrowClockwise size={14} />
                              </Button>
                            )}
                          </div>
                        </CardRoot>
                      );
                    })}
                  </div>
                  <SectionDesc style={{ margin: "16px 0 0 2px" }}>{t("shortcutsNote")}</SectionDesc>
                  {Object.entries(customShortcuts).some(([k, v]) => DEFAULT_SHORTCUTS[k] && v !== DEFAULT_SHORTCUTS[k]) && (
                    <div className="mt-2">
                      <Button variant="ghost" size="sm"
                        onPress={() => {
                          setCustomShortcuts({ ...DEFAULT_SHORTCUTS });
                          localStorage.setItem("kiyoshi-shortcuts", "{}");
                        }}>
                        <ArrowClockwise size={14} />
                        {t("scResetAll")}
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}

            {tab === "storage" && <StorageTab t={t} />}

            {tab === "sicherheit" && (
              <>
                <SectionLabel>{t("pinProtection")}</SectionLabel>

                {/* Type selector — only when PIN is not yet enabled */}
                {!pinEnabled && (
                  <SettingRow label={t("pinTypeLabel")} description={t("pinTypeDesc")} icon={<Key />}>
                    <div className="flex gap-1.5">
                      {["pin", "password"].map(type => (
                        <Button key={type} variant={pinType === type ? "primary" : "ghost"} size="sm"
                          onPress={() => { setPinType(type); localStorage.setItem("kiyoshi-pin-type", type); }}>
                          {t(type === "pin" ? "pinTypePin" : "pinTypePassword")}
                        </Button>
                      ))}
                    </div>
                  </SettingRow>
                )}

                {/* PIN length selector — only when type is "pin" and not yet enabled */}
                {!pinEnabled && pinType === "pin" && (
                  <SettingRow label={t("pinLengthLabel")} description={t("pinLengthDesc")} icon={<Key />}>
                    <div className="flex gap-1.5">
                      {[4, 6].map(len => (
                        <Button key={len} variant={pinLength === len ? "primary" : "ghost"} size="sm"
                          onPress={() => { setPinLength(len); localStorage.setItem("kiyoshi-pin-length", String(len)); }}>
                          {len}-{t("pinDigits")}
                        </Button>
                      ))}
                    </div>
                  </SettingRow>
                )}

                <SettingRow
                  label={t("pinProtectionLabel")}
                  description={pinEnabled
                    ? `${t("pinProtectionDesc")} · ${t(pinType === "pin" ? "pinTypePin" : "pinTypePassword")}${pinType === "pin" ? ` (${pinLength}-${t("pinDigits")})` : ""}`
                    : t("pinProtectionDesc")}
                  icon={pinEnabled ? <Lock /> : <LockOpen />}
                >
                  <Toggle value={pinEnabled} onChange={() => {
                    if (!pinEnabled) {
                      setPinSetup({ mode: "enable", step: "new", first: null });
                      setPinSetupDigits([]); setPinSetupPasswordInput(""); setPinSetupError("");
                    } else {
                      setPinSetup({ mode: "disable", step: "current", first: null });
                      setPinSetupDigits([]); setPinSetupPasswordInput(""); setPinSetupError("");
                    }
                  }} />
                </SettingRow>

                {pinEnabled && (
                  <SettingRow label={t("pinChange")} description={t("pinChangeDesc")} icon={<Lock />}>
                    <Button variant="ghost" size="sm"
                      onPress={() => { setPinSetup({ mode: "change", step: "current", first: null }); setPinSetupDigits([]); setPinSetupPasswordInput(""); setPinSetupError(""); }}>
                      {t("pinChange")}
                    </Button>
                  </SettingRow>
                )}

                <SectionLabel style={{ marginTop: 24 }}>{t("pinEmergency")}</SectionLabel>
                <CardRoot variant="secondary" className="px-4 py-3.5 gap-0! text-t12 text-muted leading-[1.7]"
                  style={{ background: "rgba(244,67,54,0.06)" }}>
                  <div style={{ marginBottom: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{t("pinEmergencyDesc")}</div>
                  {!pinEmergencyConfirm ? (
                    <Button variant="danger-soft" size="sm" onPress={() => setPinEmergencyConfirm(true)}>
                      {t("pinEmergencyReset")}
                    </Button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ color: "#f44336", fontWeight: 600, fontSize: "var(--t12)" }}>
                        {t("pinEmergencyConfirmText")}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="danger" size="sm"
                          onPress={() => {
                            localStorage.removeItem("kiyoshi-pin-hash");
                            localStorage.removeItem("kiyoshi-pin-enabled");
                            localStorage.removeItem("kiyoshi-pin-type");
                            localStorage.removeItem("kiyoshi-pin-length");
                            setPinEnabled(false);
                            setPinVerified(true);
                            setPinDigits([]);
                            setPinPasswordInput("");
                            setPinSetup(null);
                            setPinSetupDigits([]);
                            setPinSetupPasswordInput("");
                            setPinSetupError("");
                            setPinEmergencyConfirm(false);
                          }}>
                          {t("pinEmergencyConfirm")}
                        </Button>
                        <Button variant="ghost" size="sm" onPress={() => setPinEmergencyConfirm(false)}>
                          {t("cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardRoot>
              </>
            )}

            {tab === "language" && (
              <>
                <div className="flex flex-col gap-2">
                  {LANGUAGES.map(lang => {
                    const pct = translationProgress(lang.code);
                    return (
                    <CardRoot
                      key={lang.code}
                      onClick={() => onLanguageChange(lang.code)}
                      variant="secondary"
                      className={cn(
                        "flex flex-row items-center gap-3.5 px-4 py-3 cursor-default border-2 transition-colors",
                        language === lang.code ? "border-accent bg-accent-dim" : "border-transparent bg-surface-1 hover:bg-hover"
                      )}
                    >
                      <div dangerouslySetInnerHTML={{ __html: lang.flag }} className="w-12 h-[30px] shrink-0 rounded overflow-hidden border border-border" />
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-t13 font-medium", language === lang.code ? "text-accent" : "text-primary")}>{lang.label}</div>
                        {lang.translators?.length > 0 && (
                          <div className="text-t11 text-muted mt-1 flex items-center gap-1">
                            <Users size={12} className="shrink-0" />
                            <span className="truncate">{lang.translators.join(", ")}</span>
                          </div>
                        )}
                      </div>
                      <div className="ml-auto flex items-center gap-3 shrink-0">
                        {pct < 100 && (
                          <div className="flex items-center gap-2">
                            <ProgressBar aria-label="Translation progress" value={pct} className="w-28 gap-0!">
                              <ProgressBarTrack className="h-1.5!">
                                <ProgressBarFill />
                              </ProgressBarTrack>
                            </ProgressBar>
                            <span className="text-[10px] text-muted tabular-nums shrink-0">{pct}%</span>
                          </div>
                        )}
                        {language === lang.code && <Check size={14} className="text-accent" />}
                      </div>
                    </CardRoot>
                    );
                  })}
                </div>
                <CardRoot variant="secondary" className="bg-surface-1 flex flex-row items-center gap-3 px-4 py-3 mt-2">
                  <Translate size={18} className="shrink-0 text-secondary" />
                  <div className="flex-1 text-t12 text-secondary leading-snug">{t("contributeTranslation")}</div>
                  <Button variant="ghost" size="sm" className="shrink-0" onPress={() => openUrl("https://crowdin.com/project/kiyoshi-music").catch(console.error)}>
                    Crowdin →
                  </Button>
                </CardRoot>
              </>
            )}

            {tab === "overlay" && (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <CardRoot variant="secondary" className="w-full max-w-sm px-[22px] py-5 flex flex-col gap-3 items-center text-center">
                  <span className="text-t15 font-semibold text-primary">{t("ovlOpenEditorBtn")}</span>
                  <span className="text-t12 text-muted leading-relaxed">{t("ovlOpenEditorDesc")}</span>
                  <Button
                    size="sm"
                    variant="solid"
                    color="accent"
                    className="mt-1 flex items-center gap-1.5"
                    onPress={() => openOverlayEditor()}
                  >
                    <ArrowSquareOut size={14} />
                    {t("ovlOpenEditorBtn")}
                  </Button>
                </CardRoot>
              </div>
            )}

            {tab === "update" && (
              <>
                {/* Current version row */}
                <SettingRow label={t("currentVersion")} icon={<Info size={15} />}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{APP_VERSION}</span>
                </SettingRow>

                {updateInfo ? (
                  <>
                    {/* New version card */}
                    <CardRoot variant="secondary" className="px-[18px] py-3.5 gap-0! my-1.5"
                      style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface-1))", border: "0.5px solid color-mix(in srgb, var(--accent) 40%, transparent)" }}>
                      <div className="flex items-center gap-2.5" style={{ marginBottom: updateInfo.releasedAt || updateInfo.changelog ? 10 : 0 }}>
                        <ArrowCircleUp size={20} className="text-accent shrink-0" />
                        <div>
                          <div className="text-t15 font-bold text-accent">{updateInfo.version}</div>
                          {updateInfo.releasedAt && (
                            <div className="text-t11 text-muted mt-0.5">{t("released")}: {new Date(updateInfo.releasedAt).toLocaleDateString()}</div>
                          )}
                        </div>
                      </div>
                      {updateInfo.changelog && (
                        <>
                          <div className="h-px my-2.5" style={{ background: "color-mix(in srgb, var(--accent) 25%, transparent)" }} />
                          <div className="text-t11 font-semibold text-muted mb-1.5">{t("changelog")}</div>
                          <div className="text-t12 text-secondary leading-relaxed whitespace-pre-wrap">{updateInfo.changelog}</div>
                        </>
                      )}
                    </CardRoot>

                    {/* Action area */}
                    {updateDownloaded ? (
                      <>
                        <div className="text-t12 my-2 flex items-center gap-1.5" style={{ color: "#4caf50" }}>
                          <CheckCircle size={14} weight="fill" />
                          {t("savedToDownloads")}
                        </div>
                        <Button variant="primary" fullWidth onPress={onInstallUpdate}>
                          <DownloadSimple size={16} />
                          {t("installNow")}
                        </Button>
                      </>
                    ) : updateDownloading ? (
                      <>
                        <div className="text-t12 text-muted my-2 flex items-center gap-1.5">
                          <ArrowClockwise size={13} style={{ animation: "spin2 0.8s linear infinite" }} />
                          {t("downloadingUpdate")} — {updateDownloadProgress ?? 0}%
                        </div>
                        <ProgressBar aria-label="Update download" value={updateDownloadProgress ?? 0} className="w-full gap-0! mb-2.5">
                          <ProgressBarTrack className="h-[3px]!"><ProgressBarFill /></ProgressBarTrack>
                        </ProgressBar>
                        <Button variant="ghost" fullWidth onPress={onCancelDownload}>{t("cancel")}</Button>
                      </>
                    ) : (
                      <Button variant="primary" fullWidth className="mt-1.5" onPress={onDownloadUpdate}>
                        <DownloadSimple size={16} />
                        {t("downloadUpdate")}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 py-10 px-4 text-muted">
                    <CheckCircle size={36} weight="fill" style={{ color: "#4caf50" }} />
                    <div className="text-t13 font-medium text-secondary text-center">{t("upToDate")}</div>
                  </div>
                )}

                {/* Check for updates button */}
                <Button variant="ghost" fullWidth className="mt-1.5" isDisabled={checkingUpdate}
                  onPress={() => { setCheckingUpdate(true); onCheckUpdate(true).finally(() => setCheckingUpdate(false)); }}>
                  <ArrowClockwise size={14} style={checkingUpdate ? { animation: "spin2 0.8s linear infinite" } : undefined} />
                  {checkingUpdate ? t("checking") : t("checkForUpdates")}
                </Button>

                {/* FFmpeg version + update */}
                <div className="h-px my-3.5 bg-border" />
                <FfmpegUpdateRow />

                {/* yt-dlp version + update (keep current when YouTube changes break playback) */}
                <YtDlpUpdateRow />
              </>
            )}

            {tab === "about" && (
              <>
                {/* Logo + App Info */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "12px 0 28px" }}>
                  <img src="/Kodama%20Logo%20Full.svg" alt="Kodama" style={{ width: 200, height: "auto", marginBottom: 12 }} />
                  <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)", marginBottom: 12 }}>v{APP_VERSION}</div>
                  <div style={{ fontSize: "var(--t13)", color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.6, marginBottom: 20 }}>
                    {t("aboutDesc")}
                  </div>
                  <div className="flex gap-2.5 flex-wrap">
                    <Button variant="secondary" size="sm" onPress={() => openUrl("https://github.com/KiyoshiTheDevil/Kodama")}>
                      <Globe size={14} />
                      GitHub
                    </Button>
                    <Button size="sm" className="bg-[#FFDD00]! text-black! font-semibold" onPress={() => openUrl("https://buymeacoffee.com/kiyoshi_the_devil")}>
                      ☕ Buy me a coffee
                    </Button>
                  </div>
                </div>

                {/* Contributors */}
                <div style={{ height: "0.5px", background: "var(--border)", marginBottom: 24 }} />
                <div style={{ fontSize: "var(--t11)", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                  {t("contributors")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                  {[
                    {
                      name: "Kiyoshi The Devil",
                      role: t("contributorRoleDev"),
                      avatar: "KiyoshiTheDevil_ProfileImage.png",
                      links: [
                        { icon: <BrandTwitch size={13} />, url: "https://twitch.tv/kiyoshi_the_devil" },
                        { icon: <BrandYoutube size={13} />, url: "https://www.youtube.com/@kiyoshi_the_devil" },
                        { icon: <BrandBluesky size={13} />, url: "https://bsky.app/profile/kiyoshi-the-devil.bsky.social" },
                      ],
                    },
                    {
                      name: "Grains Of Art",
                      role: t("contributorRoleAlphaTesterArtist"),
                      avatar: "GrainsOfArt_ProfileImage.png",
                      links: [
                        { icon: <BrandTwitch size={13} />, url: "https://www.twitch.tv/greekgeekgames" },
                        { icon: <BrandYoutube size={13} />, url: "https://www.youtube.com/@GrainsOfArt" },
                        { icon: <Link size={13} />, url: "https://linktr.ee/GrainsOfArt" },
                      ],
                    },
                    {
                      name: "LMary52",
                      role: t("contributorRoleAlphaTester"),
                      avatar: "LMary52_ProfileImage.png",
                      links: [
                        { icon: <BrandTwitch size={13} />, url: "https://www.twitch.tv/lmary52" },
                        { icon: <BrandYoutube size={13} />, url: "https://www.youtube.com/@LMary52" },
                        { icon: <BrandTiktok size={13} />, url: "https://www.tiktok.com/@lmary52" },
                        { icon: <BrandBluesky size={13} />, url: "https://bsky.app/profile/lmary52.bsky.social" },
                      ],
                    },
                  ].map(c => (
                    <CardRoot key={c.name} variant="secondary" className="bg-surface-1 flex flex-row items-center gap-3.5 px-4 py-3">
                      {c.avatar ? (
                        <img src={`/${c.avatar}`} alt={c.name} className="w-9 h-9 rounded-full shrink-0 object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-t13 font-bold text-white"
                          style={{ background: "linear-gradient(135deg, var(--accent), #FF008C)" }}>
                          {c.name[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-t13 font-semibold">{c.name}</div>
                        <div className="text-t11 text-muted mt-0.5">{c.role}</div>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        {c.links.map((l, i) => (
                          <Button key={i} variant="ghost" size="sm" isIconOnly className="text-muted hover:text-accent" onPress={() => openUrl(l.url)}>
                            {l.icon}
                          </Button>
                        ))}
                      </div>
                    </CardRoot>
                  ))}
                </div>

                {/* Tools */}
                <div style={{ fontSize: "var(--t11)", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                  {t("tools")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {[
                    { name: "Claude",       link: "https://claude.ai" },
                    { name: "Figma",        link: "https://figma.com" },
                    { name: "Font Awesome", link: "https://fontawesome.com" },
                  ].map(tool => (
                    <button key={tool.name} onClick={() => openUrl(tool.link)} style={{
                      background: "none", border: "none", padding: "4px 0",
                      fontSize: "var(--t13)", color: "var(--text-secondary)",
                      fontFamily: "var(--font)", cursor: "default", textAlign: "left",
                      transition: "color 0.15s", width: "fit-content",
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--accent)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--text-secondary)"}
                    >
                      {tool.name}
                    </button>
                  ))}
                </div>

                {/* Legal */}
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: "0.5px solid var(--border)", display: "flex", justifyContent: "center", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: "var(--t11)", color: "var(--text-muted)" }}>
                    © {new Date().getFullYear()} KiyoshiTheDevil ·
                  </span>
                  <button onClick={() => openUrl("https://github.com/KiyoshiTheDevil/Kodama/blob/master/LICENSE")}
                    style={{
                      background: "none", border: "none", padding: 0, cursor: "default",
                      fontSize: "var(--t11)", color: "var(--text-muted)", fontFamily: "var(--font)",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--accent)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                  >
                    GNU General Public License v3.0
                  </button>
                </div>
              </>
            )}

            {tab === "debug" && (
              <>
                <DebugTab t={t} />
                <div className="mt-6">
                  <Button variant="ghost" size="sm"
                    onPress={() => { localStorage.removeItem("kiyoshi-debug-unlocked"); setDebugUnlocked(false); window.dispatchEvent(new CustomEvent("kiyoshi-debug-change", { detail: { unlocked: false } })); setTab("darstellung"); }}>
                    <EyeSlash size={15} />
                    {t("hideDebugMenu")}
                  </Button>
                </div>
              </>
            )}

          </div>
        </div>

      </div>
  );
}


// ─── Queue Panel ────────────────────────────────────────────────────────────
// ─── Queue Row (standalone to prevent drag breaking on re-render) ────────────
function QueueRow({ track, globalIdx, isDraggable, dimmed, isActive, dragOver, onPointerDown, onPlay, onRemove, isLiked, onToggleLike, onEditFade, fadeSecs }) {
  const isDragOver = dragOver === globalIdx;
  return (
    <div
      data-queue-idx={globalIdx}
      onClick={onPlay}
      onContextMenu={onEditFade ? (e) => { e.preventDefault(); onEditFade(); } : undefined}
      onPointerDown={isDraggable ? e => onPointerDown(e, globalIdx) : undefined}
      className={`group/qrow flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-[var(--r-md)] cursor-default select-none border-t-2 transition-[background-color,border-color,opacity] ${
        isDragOver
          ? "bg-[rgba(224,64,251,0.12)] border-t-accent"
          : isActive
            ? "bg-accent-dim border-t-transparent"
            : "bg-transparent border-t-transparent hover:bg-[var(--fill-subtle)]"
      } ${dimmed ? "opacity-45 hover:opacity-100" : ""}`}
    >
      {/* Drag handle (the whole row is draggable; this is just the affordance) */}
      <div className={`shrink-0 px-px py-0.5 touch-none transition-opacity ${isDraggable ? "cursor-grab opacity-40 group-hover/qrow:opacity-100" : "opacity-0"}`}>
        <GripLines size={13} className="block pointer-events-none text-muted" />
      </div>

      {/* Thumbnail */}
      <div className="w-9 h-9 shrink-0 overflow-hidden rounded-[var(--r-sm)] bg-surface-1">
        {track.thumbnail
          ? <img src={thumb(track.thumbnail)} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-[linear-gradient(135deg,#2a1535,#1a0a25)]" />}
      </div>

      {/* Title + artist */}
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-1 overflow-hidden text-t12 font-medium ${isActive ? "text-accent" : "text-primary"}`}>
          <span className="truncate min-w-0">{track.title}</span>
          {track.isExplicit && <ExplicitBadge />}
        </div>
        <div className="text-t11 text-secondary truncate">{track.artists}</div>
      </div>

      {/* Custom-crossfade indicator (set via right-click) */}
      {fadeSecs != null && (
        <span title={`Crossfade: ${fadeSecs}s`}
          className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-accent px-1.5 py-0.5 rounded-[var(--r-sm)] bg-accent-dim">
          <Sliders size={10} weight="bold" />{fadeSecs}s
        </span>
      )}

      {/* Duration */}
      {track.duration && (
        <div className="shrink-0 min-w-[28px] text-t11 text-muted text-right">{track.duration}</div>
      )}

      {/* Like button */}
      <span className="shrink-0 inline-flex" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="sm" isIconOnly onPress={() => onToggleLike?.(track)}
          className={`h-7 min-w-7 rounded-[var(--r-sm)] ${isLiked ? "text-accent" : "text-muted hover:text-secondary"}`}>
          <Heart size={14} weight={isLiked ? "fill" : "regular"} />
        </Button>
      </span>

      {/* Remove button */}
      {isDraggable && (
        <span className="shrink-0 inline-flex" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="sm" isIconOnly onPress={() => onRemove(track.videoId)}
            className="h-7 min-w-7 rounded-[var(--r-sm)] text-muted hover:text-[#ff7070]!">
            <Trash size={13} />
          </Button>
        </span>
      )}
    </div>
  );
}

function QueuePanel({ queue, setQueue, currentTrack, setTrack, onClose, likedIds, onToggleLike, visible, crossfade = 0, crossfadeOverrides = {}, onSetCrossfadeOverride, onRemoveCrossfadeOverride }) {
  const t = useLang();
  const [panelTab, setPanelTab] = useState("queue");
  const [fadeEdit, setFadeEdit] = useState(null); // { from, to } — open the per-transition fade editor
  const fadeKey = (a, b) => `${a?.videoId}__${b?.videoId}`;
  const [songDesc, setSongDesc] = useState(null);    // null=loading, ""=none, str=text
  const [songDescId, setSongDescId] = useState(null);
  const [songDescError, setSongDescError] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [fabPos, setFabPos] = useState(null); // {left,width,bottom} for the portaled scroll-top pill
  const isDragging = useRef(false);
  const suppressClickRef = useRef(false);
  const listRef = useRef(null);
  const nowPlayingRef = useRef(null);

  // Fetch song description when switching to About tab or track changes
  const fetchSongDesc = useCallback((videoId, force = false) => {
    if (!videoId) return;
    if (!force && songDescId === videoId) return;
    setSongDesc(null);
    setSongDescError(null);
    setSongDescId(videoId);
    fetch(`${API}/song/credits/${videoId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setSongDescError(d.error);
        else setSongDesc(d.description || "");
      })
      .catch(() => setSongDesc(""));
  }, [songDescId]);

  useEffect(() => {
    if (panelTab !== "about" || !currentTrack?.videoId) return;
    fetchSongDesc(currentTrack.videoId);
  }, [panelTab, currentTrack?.videoId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // The pill is portaled to <body> (to escape the panel's overflow+radius clip, which
    // would kill its backdrop-filter), so we position it over the list's bottom edge.
    const updatePos = () => {
      const r = el.getBoundingClientRect();
      setFabPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.bottom });
    };
    const onScroll = () => {
      const target = nowPlayingRef.current;
      if (target) {
        const containerRect = el.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const targetScrollPos = el.scrollTop + targetRect.top - containerRect.top;
        setShowScrollTop(el.scrollTop > targetScrollPos + target.clientHeight);
      } else {
        setShowScrollTop(el.scrollTop > 180);
      }
      updatePos();
    };
    el.addEventListener("scroll", onScroll);
    window.addEventListener("resize", updatePos);
    return () => { el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", updatePos); };
  }, []);

  const currentIdx = queue.findIndex(t => t.videoId === currentTrack?.videoId);
  const upNext = queue.slice(currentIdx + 1);
  const played = queue.slice(0, currentIdx);

  // Open the per-transition fade editor for globalIdx → globalIdx+1.
  const openFadeEdit = (globalIdx) => {
    const from = queue[globalIdx], to = queue[globalIdx + 1];
    if (from && to) setFadeEdit({ from, to });
  };

  const removeTrack = useCallback((videoId) => {
    setQueue(q => q.filter(t => t.videoId !== videoId));
  }, [setQueue]);

  const dragOverRef = useRef(null);

  const handlePointerDown = useCallback((e, globalIdx) => {
    if (e.button !== 0) return; // ignore right/middle click so the context menu (fade editor) fires
    e.preventDefault();
    isDragging.current = false;
    dragOverRef.current = null;

    const startY = e.clientY;

    const onMove = (me) => {
      if (Math.abs(me.clientY - startY) > 4) isDragging.current = true;
      if (!isDragging.current || !listRef.current) return;
      const rows = listRef.current.querySelectorAll("[data-queue-idx]");
      let closest = null;
      let closestDist = Infinity;
      rows.forEach(row => {
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const dist = Math.abs(me.clientY - mid);
        if (dist < closestDist) { closestDist = dist; closest = row; }
      });
      if (closest) {
        const idx = parseInt(closest.dataset.queueIdx);
        dragOverRef.current = idx;
        setDragOver(idx);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const target = dragOverRef.current;
      const didDrag = isDragging.current;
      if (didDrag && target !== null && target !== globalIdx) {
        setQueue(q => {
          const next = [...q];
          const [moved] = next.splice(globalIdx, 1);
          // Compensate for the removed item: when dropping below the origin, every
          // index at/after `globalIdx` shifted up by one, so the visual slot is target-1.
          const targetIdx = target > globalIdx ? target - 1 : target;
          next.splice(targetIdx, 0, moved);
          return next;
        });
      }
      // Suppress the click that fires right after a drag so it doesn't also start playback.
      if (didDrag) { suppressClickRef.current = true; setTimeout(() => { suppressClickRef.current = false; }, 0); }
      isDragging.current = false;
      dragOverRef.current = null;
      setDragIdx(null);
      setDragOver(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [setQueue]);

  const handleDragStart = useCallback((i) => {}, []);
  const handleDragOver = useCallback((i) => {}, []);
  const handleDrop = useCallback((i) => {}, []);
  const handleDragEnd = useCallback(() => {}, []);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 pt-11 shrink-0">
        <div className="flex items-center gap-1.5 mb-2.5">
          {/* HeroUI segmented tabs */}
          <ToggleButtonGroupRoot
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[panelTab]}
            onSelectionChange={(keys) => { const v = [...keys][0]; if (v) setPanelTab(v); }}
            size="sm"
            fullWidth
            className="flex-1"
          >
            <ToggleButton id="queue" className="flex-1">{t("queue")}</ToggleButton>
            <ToggleButton id="about" className="flex-1">{t("aboutSong")}</ToggleButton>
          </ToggleButtonGroupRoot>
          {/* Clear queue icon button — always rendered to keep pill width stable */}
          <Tooltip text={t("clearQueue")}>
            <Button variant="ghost" size="sm" isIconOnly onPress={() => setQueue([])}
              className={`shrink-0 rounded-[var(--r-md)] text-muted hover:text-[#ff7070]! ${panelTab === "queue" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
            ><Trash size={13} /></Button>
          </Tooltip>
        </div>
      </div>

      {/* About Song tab */}
      {panelTab === "about" && (
        <div className="scrollable flex-1 overflow-y-auto px-4 pt-4 pb-6">
          {currentTrack ? (
            <>
              {/* Song card */}
              <CardRoot className="flex items-center gap-3 mb-5 px-3.5 py-3">
                {currentTrack.thumbnail && (
                  <img src={currentTrack.thumbnail} alt="" className="w-[52px] h-[52px] rounded-[var(--r-md)] object-cover shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-t13 font-semibold text-primary truncate">{currentTrack.title}</div>
                  <div className="text-t12 text-secondary mt-0.5 truncate">{currentTrack.artists}</div>
                  {currentTrack.album && <div className="text-t11 text-muted mt-0.5 truncate">{currentTrack.album}</div>}
                </div>
              </CardRoot>

              {/* Description */}
              {songDesc === null && !songDescError && (
                <div className="text-t12 text-muted">{t("loadingDots")}</div>
              )}
              {songDescError && (
                <div className="flex flex-col gap-2">
                  <div className="text-t12 text-muted">{t("noCredits")}</div>
                  <Button variant="secondary" size="sm" className="self-start gap-1.5 text-t11" onPress={() => { setSongDescId(null); fetchSongDesc(currentTrack?.videoId, true); }}
                  ><ArrowClockwise size={11} /> {t("retry") || "Erneut versuchen"}</Button>
                </div>
              )}
              {songDesc !== null && songDesc === "" && !songDescError && (
                <div className="text-t12 text-muted">{t("noCredits")}</div>
              )}
              {songDesc && (
                <p className="m-0 text-t12 leading-[1.7] text-secondary whitespace-pre-wrap">{songDesc}</p>
              )}
            </>
          ) : (
            <div className="text-t13 text-muted text-center mt-10">{t("selectSong")}</div>
          )}
        </div>
      )}

      {panelTab === "queue" && <ScrollShadowRoot ref={listRef} size={28} className="scrollable flex-1 overflow-y-auto px-2 pt-1 pb-4">
        {/* Previously played */}
        {played.length > 0 && (
          <>
            <div className="group/qsec flex items-center justify-between px-1.5 pt-2.5 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{t("previouslyPlayed")}</span>
              <Tooltip text={t("clearPlayed")}>
                <Button variant="ghost" size="sm" isIconOnly onPress={() => setQueue(q => q.slice(currentIdx))}
                  className="shrink-0 h-6 min-w-6 rounded-[var(--r-sm)] text-muted opacity-0 group-hover/qsec:opacity-100 hover:text-[#ff7070]!"
                ><Trash size={11} /></Button>
              </Tooltip>
            </div>
            {played.map((qt, i) => (
              <QueueRow key={qt.videoId || i} track={qt} globalIdx={i} isDraggable={true} dimmed={true}
                isActive={false} dragOver={dragOver}
                onPointerDown={handlePointerDown}
                onPlay={() => { if (suppressClickRef.current) return; setTrack(qt); }} onRemove={removeTrack}
                isLiked={likedIds?.has(qt.videoId)} onToggleLike={onToggleLike} />
            ))}
          </>
        )}

        {/* Now playing */}
        {currentTrack && (
          <>
            <div ref={nowPlayingRef} className="px-1.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{t("nowPlaying")}</div>
            <QueueRow track={currentTrack} globalIdx={currentIdx} isDraggable={false} dimmed={true}
              isActive={true} dragOver={dragOver}
              onPointerDown={handlePointerDown}
              onPlay={() => setTrack(currentTrack)} onRemove={removeTrack}
              isLiked={likedIds?.has(currentTrack.videoId)} onToggleLike={onToggleLike}
              onEditFade={queue[currentIdx + 1] ? () => openFadeEdit(currentIdx) : undefined}
              fadeSecs={crossfadeOverrides[fadeKey(currentTrack, queue[currentIdx + 1])]?.secs ?? null} />
          </>
        )}

        {/* Up next */}
        {upNext.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 px-1.5 pt-2.5 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{t("upNext")}</span>
              <ChipRoot size="sm" variant="soft"><ChipLabel>{upNext.length}</ChipLabel></ChipRoot>
            </div>
            {upNext.map((qt, i) => {
              const gIdx = currentIdx + 1 + i;
              return (
              <QueueRow key={qt.videoId || i} track={qt} globalIdx={gIdx} isDraggable={true}
                isActive={false} dragOver={dragOver}
                onPointerDown={handlePointerDown}
                onPlay={() => { if (suppressClickRef.current) return; setTrack(qt); }} onRemove={removeTrack}
                isLiked={likedIds?.has(qt.videoId)} onToggleLike={onToggleLike}
                onEditFade={queue[gIdx + 1] ? () => openFadeEdit(gIdx) : undefined}
                fadeSecs={crossfadeOverrides[fadeKey(qt, queue[gIdx + 1])]?.secs ?? null} />
              );
            })}
          </>
        )}

        {queue.length === 0 && (
          <div className="p-6 text-t13 text-muted text-center">{t("emptyQueue")}</div>
        )}
      </ScrollShadowRoot>}

      {/* Scroll-to-top pill — portaled to <body> so it escapes the panel's overflow+radius
          clip (which otherwise disables backdrop-filter on descendants). */}
      {visible && panelTab === "queue" && showScrollTop && fabPos && createPortal(
        <div style={{ position: "fixed", left: fabPos.left, width: fabPos.width, bottom: fabPos.bottom + 16, display: "flex", justifyContent: "center", zIndex: 200, pointerEvents: "none" }}
          className="animate-[pillRiseIn_0.26s_cubic-bezier(0.22,1,0.36,1)]">
          <div className="relative pointer-events-auto rounded-full shadow-[0_6px_22px_rgba(0,0,0,0.45)]">
            {/* Dedicated frosted backdrop layer — a plain div (no transform/isolation/clip
                ancestors here), so backdrop-filter actually samples the list behind it. */}
            <div className="absolute inset-0 rounded-full bg-[rgba(255,255,255,0.13)] backdrop-blur-2xl" />
            <Button
              variant="ghost" size="sm"
              onPress={() => {
                const target = nowPlayingRef.current;
                const container = listRef.current;
                if (target && container) {
                  const containerRect = container.getBoundingClientRect();
                  const targetRect = target.getBoundingClientRect();
                  const scrollOffset = container.scrollTop + targetRect.top - containerRect.top - 8;
                  container.scrollTo({ top: scrollOffset, behavior: "smooth" });
                } else {
                  listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              className="relative gap-2 h-9! px-4 rounded-full text-t13 font-semibold text-primary! border-none! bg-transparent! hover:bg-[rgba(255,255,255,0.09)]!"
            ><CaretLineUp size={15} weight="bold" className="text-accent" /> {t("scrollToTop")}</Button>
          </div>
        </div>,
        document.body
      )}

      {fadeEdit && (
        <FadeEditorModal
          from={fadeEdit.from}
          to={fadeEdit.to}
          globalDefault={crossfade}
          current={crossfadeOverrides[fadeKey(fadeEdit.from, fadeEdit.to)]?.secs ?? null}
          onSave={(secs) => onSetCrossfadeOverride?.(fadeEdit.from.videoId, fadeEdit.to.videoId, secs, fadeEdit.from.title, fadeEdit.to.title)}
          onClear={() => onRemoveCrossfadeOverride?.(fadeKey(fadeEdit.from, fadeEdit.to))}
          onClose={() => setFadeEdit(null)}
        />
      )}
    </div>
  );
}

function FadeEditorModal({ from, to, current, globalDefault = 0, onSave, onClear, onClose }) {
  const t = useLang();
  const [secs, setSecs] = useState(current != null ? current : (globalDefault || 5));
  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[320]!">
        <ModalContainer placement="center" size="sm" className="w-[420px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Sliders size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("customCrossfade")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-4 pb-1">
                <div className="flex items-center gap-2 text-t12">
                  <span className="flex-1 min-w-0 truncate font-medium text-primary">{from?.title}</span>
                  <span className="shrink-0 text-accent font-bold">→</span>
                  <span className="flex-1 min-w-0 truncate font-medium text-primary text-right">{to?.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Slider min={0} max={12} step={1} value={secs} onChange={setSecs} width={180} />
                  <span className="text-t12 text-secondary w-9 text-right">{secs}s</span>
                </div>
                <p className="text-t11 text-muted">
                  {secs === 0 ? t("crossfadeHardCut") : t("customCrossfadeHint", { secs })}
                  {" · "}{t("crossfadeDefault")}: {globalDefault}s
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  {current != null
                    ? <Button variant="ghost" size="sm" className="text-[#ff7070]!" onPress={() => { onClear(); onClose(); }}>{t("removeOverride")}</Button>
                    : <span />}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onPress={onClose}>{t("cancel")}</Button>
                    <Button size="sm" className="bg-accent! text-white!" onPress={() => { onSave(secs); onClose(); }}>{t("save")}</Button>
                  </div>
                </div>
              </div>
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

function Player({ track, setTrack, queue, setQueue, audioRef, isPlaying, setIsPlaying, expanded, onExpandToggle, showLyrics, onToggleLyrics, queueOpen, onToggleQueue, fullscreen, onToggleFullscreen, crossfade = 0, crossfadeOverrides = {}, playbackProgressive = true, onOpenAlbum, onOpenArtist, onExportSong, onDownloadSong, cachedSongIds, downloadingIds, onRefetchLyrics, lyricsProviders = DEFAULT_LYRICS_PROVIDERS, currentLyricsSource = "", onSwitchLyricsProvider, failedLyricsProviders = new Set(), language = "de", showLyricsTranslation = false, onToggleLyricsTranslation, lyricsTranslationLang = "DE", onSetLyricsTranslationLang, showRomaji = false, onToggleRomaji, isCustomLyrics = false, onImportLyrics, onRemoveCustomLyrics, onPremiumDetected, onCreatePlaylist }) {
  const [progress, setProgress] = useState(0);
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
  const [morePlaylists, setMorePlaylists] = useState(null);
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
      }

      if (!a.duration) return;
      // Crossfade is a Rust-core feature (two sinks, OBS-capturable). If we fell
      // back to HTML5 audio (Rust binary missing), skip it entirely.
      if (audioRef.current?._fallback !== false) return;
      if (crossfadeActiveRef.current || repeatRef.current === "one") return;
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

    // Always register listeners — even after a crossfade advance.
    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("ended", onEnd);
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
  mediaCtlRef.current = { togglePlay, getAdjacentTrack, setTrack, setIsPlaying };
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
          case "next":     { const tk = h.getAdjacentTrack("next"); if (tk) h.setTrack(tk); break; }
          case "previous": { const tk = h.getAdjacentTrack("prev"); if (tk) h.setTrack(tk); break; }
          case "stop":     if (a) { a.pause(); h.setIsPlaying(false); } break;
          case "seek":     if (a && typeof position === "number") a.currentTime = position; break;
          default: break;
        }
      }).then(fn => { unlisten = fn; });
    });
    return () => { if (unlisten) unlisten(); };
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
      <div className={cn("seek-band", fullscreen && "seek-fullscreen")} style={{ height: 10, display: "flex", alignItems: "center", padding: fullscreen ? "0" : "0 16px" }}>
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
              ? <img src={thumb(track.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", background: track ? "linear-gradient(135deg,#2a1535,#1a0a25)" : "transparent" }} />}
          </div>
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: "var(--t13)", fontWeight: 500, display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{loading ? t("loading") : track?.title}</span>
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
              style={{ visibility: track ? "visible" : "hidden", contain: "layout style", borderRadius: "9999px", width: 36, height: 36, minWidth: 36, padding: 0 }}>
              <Heart size={16} weight={isLiked ? "fill" : "regular"}
                style={likePulsing ? { animation: "heartPop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards" } : undefined} />
            </Button>
          </Tooltip>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
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
                if (audio && audio.currentTime >= 4) {
                  audio.currentTime = 0;
                } else {
                  const tk = getAdjacentTrack("prev"); if (tk) setTrack(tk);
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
              onPress={() => { if (anim) { setNextBouncing(true); setTimeout(() => setNextBouncing(false), 400); } const tk = getAdjacentTrack("next"); if (tk) setTrack(tk); }}
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

        <div style={{ display: "flex", alignItems: "center", gap: 2, width: 320, justifyContent: "flex-end", lineHeight: 0 }}>
          {/* Volume icon + slider */}
          <div data-volume-area style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
              title={sleepRemaining !== null ? `${translate(language, "sleepTimer")}: ${formatSleepRemaining(sleepRemaining)}` : translate(language, "sleepTimer")}
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
                {translate(language, "sleepTimer")}
              </div>
              <DropdownMenu
                aria-label={translate(language, "sleepTimer")}
                className="min-w-44"
                onAction={(key) => { if (key === "off") setSleepTimerEnd(null); else setSleepTimerEnd(Date.now() + Number(key) * 60 * 1000); }}
              >
                <DropdownSection>
                  {[5, 10, 15, 20, 30, 45, 60].map(min => (
                    <DropdownItem key={min} id={String(min)} textValue={`${min} ${translate(language, "minutes")}`}>
                      {min} {translate(language, "minutes")}
                      {sleepTimerEnd && Math.abs((sleepTimerEnd - Date.now()) / 60000 - min) < 1 && (
                        <Check size={12} className="ml-auto text-accent" />
                      )}
                    </DropdownItem>
                  ))}
                </DropdownSection>
                {sleepRemaining !== null ? (
                  <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                    <DropdownItem id="off" textValue={translate(language, "cancelSleepTimer")} className="text-[#f44336]">
                      <X size={13} />
                      {translate(language, "cancelSleepTimer")}
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
            const LANGS = [
              { code: "DE", name: "Deutsch" }, { code: "EN", name: "English" },
              { code: "FR", name: "Français" }, { code: "ES", name: "Español" },
              { code: "IT", name: "Italiano" }, { code: "PT", name: "Português" },
              { code: "NL", name: "Nederlands" }, { code: "PL", name: "Polski" },
              { code: "RU", name: "Русский" }, { code: "JA", name: "日本語" },
              { code: "KO", name: "한국어" }, { code: "ZH", name: "中文" },
            ];
            const downloaded = cachedSongIds?.has(track.videoId);
            const downloading = downloadingIds?.has(track.videoId);
            return (
              <Dropdown onOpenChange={(open) => {
                if (open) {
                  fetchMoreBrowseIds();
                  if (!morePlaylists) fetch(`${API}/library/playlists`).then(r => r.json()).then(d => setMorePlaylists(d.playlists || [])).catch(() => setMorePlaylists([]));
                } else { setMorePlaylists(null); }
              }}>
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
                      <DropdownSubmenuTrigger>
                        <DropdownItem textValue={t("addToPlaylist")}>
                          <Plus size={14} />
                          {t("addToPlaylist")}
                          <DropdownSubmenuIndicator className="ml-auto" />
                        </DropdownItem>
                        <DropdownPopover className="min-w-52 max-h-80 overflow-y-auto">
                          <DropdownMenu aria-label={t("addToPlaylist")}>
                            <DropdownSection>
                              {(morePlaylists || []).map(pl => (
                                <DropdownItem key={pl.playlistId} textValue={pl.title}
                                  onAction={async () => { try { await fetch(`${API}/playlist/${pl.playlistId}/add`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoIds: [track.videoId], tracks: [track] }) }); } catch {} }}>
                                  <Playlist size={14} />
                                  <span className="truncate">{pl.title}</span>
                                </DropdownItem>
                              ))}
                            </DropdownSection>
                            <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                              <DropdownItem textValue={t("newPlaylist")} onAction={() => onCreatePlaylist?.()}>
                                <Plus size={14} weight="bold" />
                                {t("newPlaylist")}
                              </DropdownItem>
                            </DropdownSection>
                          </DropdownMenu>
                        </DropdownPopover>
                      </DropdownSubmenuTrigger>
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
                          <DropdownItem textValue={translate(language, "goToAlbum")} onAction={() => { if (expanded) onExpandToggle(); onOpenAlbum({ browseId: albumId, title: track.album }); }}>
                            <VinylRecord size={14} />
                            {translate(language, "goToAlbum")}
                          </DropdownItem>
                        ) : null}
                        {artistId && onOpenArtist ? (
                          <DropdownItem textValue={translate(language, "goToArtist")} onAction={() => { if (expanded) onExpandToggle(); onOpenArtist({ browseId: artistId, artist: track.artists }); }}>
                            <Microphone size={14} />
                            {translate(language, "goToArtist")}
                          </DropdownItem>
                        ) : null}
                      </DropdownSection>
                    ) : null}

                    {/* Lyrics actions */}
                    <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                      <DropdownItem textValue={translate(language, "refetchLyrics")} onAction={() => onRefetchLyrics?.()}>
                        <ArrowClockwise size={14} />
                        {translate(language, "refetchLyrics")}
                      </DropdownItem>
                      <DropdownItem textValue={translate(language, "importLyrics")} onAction={() => onImportLyrics?.()}>
                        <UploadSimple size={14} />
                        {translate(language, "importLyrics")}
                      </DropdownItem>
                      {isCustomLyrics ? (
                        <DropdownItem textValue={translate(language, "removeCustomLyrics")} onAction={() => onRemoveCustomLyrics?.()} className="text-[#f44336]">
                          <Trash size={14} />
                          {translate(language, "removeCustomLyrics")}
                        </DropdownItem>
                      ) : null}
                      <DropdownItem textValue={translate(language, "translateLyrics")} onAction={() => onToggleLyricsTranslation?.()}>
                        <Translate size={14} />
                        {translate(language, "translateLyrics")}
                        {showLyricsTranslation && <Check size={12} className="ml-auto text-accent" />}
                      </DropdownItem>
                      {showLyricsTranslation ? (
                        <DropdownSubmenuTrigger>
                          <DropdownItem textValue="Language">
                            <Translate size={14} />
                            {(LANGS.find(l => l.code === lyricsTranslationLang)?.name) || lyricsTranslationLang}
                            <DropdownSubmenuIndicator className="ml-auto" />
                          </DropdownItem>
                          <DropdownPopover className="min-w-40 max-h-80 overflow-y-auto">
                            <DropdownMenu aria-label="Language">
                              {LANGS.map(({ code, name }) => (
                                <DropdownItem key={code} textValue={name} onAction={() => onSetLyricsTranslationLang?.(code)}
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

                    {/* Lyrics provider switcher */}
                    <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                      {lyricsProviders.filter(p => p.enabled).map(p => {
                        const sync = PROVIDER_SYNC[p.id];
                        const isActive = currentLyricsSource === p.label;
                        const isFailed = failedLyricsProviders.has(p.id);
                        return (
                          <DropdownItem key={p.id} textValue={p.label} isDisabled={isFailed}
                            onAction={() => { if (!isFailed) onSwitchLyricsProvider?.(p.id); }}
                            className={cn("text-t12", isActive ? "text-primary" : "text-secondary")}>
                            <span className="flex-1">{p.label}</span>
                            {sync && (
                              <span className="flex items-center gap-1.5 text-t10 px-1.5 py-0.5 rounded whitespace-nowrap" style={{ color: sync.color, background: sync.bg }}>
                                {sync.icon && <span className="inline-block w-4 h-4 shrink-0" style={{ backgroundColor: "currentColor", maskImage: `url(${sync.icon})`, WebkitMaskImage: `url(${sync.icon})`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />}
                                {sync.label}
                              </span>
                            )}
                            {isActive && <Check size={12} className="text-accent shrink-0" />}
                          </DropdownItem>
                        );
                      })}
                    </DropdownSection>

                    {/* Download / Export */}
                    <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                      {downloaded ? (
                        <DropdownItem textValue={translate(language, "downloaded")} isDisabled>
                          <DownloadSimple size={14} />
                          {translate(language, "downloaded")}
                        </DropdownItem>
                      ) : downloading ? (
                        <DropdownItem textValue={translate(language, "downloading")} isDisabled>
                          <DownloadSimple size={14} />
                          {translate(language, "downloading")}
                        </DropdownItem>
                      ) : (
                        <DropdownItem textValue={translate(language, "download")} onAction={() => onDownloadSong?.(track)}>
                          <DownloadSimple size={14} />
                          {translate(language, "download")}
                        </DropdownItem>
                      )}
                      <DropdownItem textValue={translate(language, "saveAsMp3")} onAction={() => onExportSong?.(track, "mp3")}>
                        <MusicNote size={14} />
                        {translate(language, "saveAsMp3")}
                      </DropdownItem>
                      <DropdownItem textValue={translate(language, "saveAsOpus")} onAction={() => onExportSong?.(track, "opus")}>
                        <MusicNote size={14} />
                        {translate(language, "saveAsOpus")}
                      </DropdownItem>
                    </DropdownSection>

                    <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                      <DropdownSubmenuTrigger>
                        <DropdownItem textValue={translate(language, "share")}>
                          <ShareNodes size={14} />
                          {translate(language, "share")}
                          <DropdownSubmenuIndicator className="ml-auto" />
                        </DropdownItem>
                        <DropdownPopover className="min-w-56">
                          <DropdownMenu aria-label={translate(language, "share")}>
                            <DropdownSection>
                              <DropdownItem textValue={translate(language, "copyShareLink")}
                                onAction={() => navigator.clipboard.writeText(`${KODAMA_SHARE_BASE}?v=${track.videoId}`).then(() => toast.success(translate(language, "linkCopied"))).catch(() => {})}>
                                <ShareNodes size={14} />
                                {translate(language, "copyShareLink")}
                              </DropdownItem>
                              <DropdownItem textValue={translate(language, "copyKodamaLink")}
                                onAction={() => navigator.clipboard.writeText(`kodama://song/${track.videoId}`).then(() => toast.success(translate(language, "linkCopied"))).catch(() => {})}>
                                <Copy size={14} />
                                {translate(language, "copyKodamaLink")}
                              </DropdownItem>
                              <DropdownItem textValue={translate(language, "copyYtMusicLink")}
                                onAction={() => navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${track.videoId}`).then(() => toast.success(translate(language, "linkCopied"))).catch(() => {})}>
                                <Copy size={14} />
                                {translate(language, "copyYtMusicLink")}
                              </DropdownItem>
                              <DropdownItem textValue={translate(language, "copyYoutubeLink")}
                                onAction={() => navigator.clipboard.writeText(`https://youtube.com/watch?v=${track.videoId}`).then(() => toast.success(translate(language, "linkCopied"))).catch(() => {})}>
                                <Copy size={14} />
                                {translate(language, "copyYoutubeLink")}
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
          {/* Lyrics toggle */}
          <Tooltip text={t("lyricsTooltip")}>
            <Button variant="ghost" isIconOnly onPress={onToggleLyrics}
              className={cn("rounded-full", (expanded && showLyrics) ? "text-accent" : "text-secondary hover:text-primary")}
              style={{ contain: "layout style" }}>
              <ChatText size={16} />
            </Button>
          </Tooltip>
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

function hiResThumb(url) {
  if (!url) return url;
  // Google user content (YTMusic album/artist art, lh3/lh4/lh5…, ggpht):
  // rewrite the sizing suffix (=w120-h120-…, =s226-…) — or append one if absent —
  // to request a large square. Only used in the Cover-View; everywhere else keeps
  // the smaller _pick_thumb size.
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com")) {
    if (/=[ws]\d+/.test(url)) return url.replace(/=[ws]\d+[^/]*$/, "=w800-h800-l90-rj");
    return url + "=w800-h800-l90-rj";
  }
  return url;
}

const VIZ_DEFAULTS = {
  shape: "frame",          // "frame" | "ring" | "linear"
  linearPos: "bottom",     // (linear only) "bottom" = over the seek bar | "center" = behind cover
  barCount: 56,
  barLength: 90,
  barThickness: 3,
  gap: 8,
  responsiveness: 0.75,    // 0..1, higher = snappier (less release smoothing)
  mirror: false,
  floor: 0,                // 0..1 — gate below
  ceiling: 1,              // 0..1 — clip above (remap [floor,ceiling] → [0,1])
  tilt: 0,                 // 0..1 — high-frequency boost
  smoothBands: 0,          // 0..1 — gaussian smoothing across bands
  render: "bars",          // "bars" | "curve"
  peakHold: false,         // hold peaks + slow decay
  gradient: false,         // colour by bar height (base → gradColor)
  gradColor: "#ffffff",
  color: "accent",         // "accent" | "custom" | "cover"
  customColor: "#e040fb",
  coverPulse: true, coverPulseStrength: 0.3,
  blobs: true,
};

// Colour helpers for the gradient mode (handle #hex and rgb()).
function vizToRGB(c) {
  if (!c) return [255, 255, 255];
  if (c[0] === "#") { const h = c.slice(1); const x = h.length === 3 ? h.split("").map((d) => d + d).join("") : h; return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
  const m = c.match(/(\d+)\D+(\d+)\D+(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
}
function vizLerp(a, b, t) { const A = vizToRGB(a), B = vizToRGB(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }

function CoverView({ track, isPlaying, onClose, ambientVisualizer = true, vizConfig, coverSize = 260, compact = false, narrow = false }) {
  const hq = hiResThumb(track.thumbnail);
  const specRef = useRef(null);
  const coverRef = useRef(null);
  const playingRef = useRef(isPlaying); playingRef.current = isPlaying;
  const cfgRef = useRef(null); cfgRef.current = { ...VIZ_DEFAULTS, ...(vizConfig || {}) };
  const coverColorRef = useRef(null);

  // Extract a vibrant colour from the cover for the "dynamic" colour mode.
  useEffect(() => {
    const url = track.thumbnail ? thumb(track.thumbnail) : null;
    if (!url) { coverColorRef.current = null; return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = 40; c.height = 40;
        const cx = c.getContext("2d"); cx.drawImage(img, 0, 0, 40, 40);
        const d = cx.getImageData(0, 0, 40, 40).data;
        let br = 0, bg = 0, bb = 0, best = -1, sr = 0, sg = 0, sb = 0, cnt = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          sr += r; sg += g; sb += b; cnt++;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const score = (mx === 0 ? 0 : (mx - mn) / mx) * (mx / 255); // saturation × brightness
          if (score > best) { best = score; br = r; bg = g; bb = b; }
        }
        const useV = best > 0.18;
        const R = useV ? br : Math.round(sr / cnt), G = useV ? bg : Math.round(sg / cnt), B = useV ? bb : Math.round(sb / cnt);
        coverColorRef.current = `rgb(${R},${G},${B})`;
      } catch { coverColorRef.current = null; }
    };
    img.onerror = () => { coverColorRef.current = null; };
    img.src = url;
  }, [track.thumbnail]);

  // Audio-reactive spectrum (ring or cover-hugging frame) + cover pulse, driven by the live
  // `audioLevels` (Rust FFT). Config read via a ref so changes apply without restarting rAF.
  useEffect(() => {
    if (!ambientVisualizer) return;
    const cv = specRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const accentVar = (getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()) || "#e040fb";
    let raf = 0, smoothLevel = 0;
    const sm = [], pk = [];
    const draw = () => {
      const cfg = cfgRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const src = audioLevels.bands || [], srcN = src.length || 48;
      // In a narrow (split) pane the linear spectrum is only a fraction of the window width —
      // scale the bar count by that fraction so the per-bar spacing matches the full view
      // (and adapts as the split is resized) instead of cramming the bars together.
      let n = Math.max(8, (cfg.barCount | 0) || 48);
      if (narrow && cfg.shape === "linear") {
        const frac = Math.min(1, w / (window.innerWidth || w));
        n = Math.max(8, Math.round(n * frac));
      }
      const resp = Math.max(0, Math.min(1, cfg.responsiveness != null ? cfg.responsiveness : 0.75));
      const rel = (1 - resp) * 0.95; // 0 = instant, 0.95 = very floaty
      const bandAt = (i) => { const f = (i / n) * srcN, lo = Math.floor(f), hi = Math.min(srcN - 1, lo + 1), t = f - lo; return (src[lo] || 0) * (1 - t) + (src[hi] || 0) * t; };
      // ── value pipeline: tilt → floor/ceiling → temporal smoothing → spatial blur ──
      const tilt = cfg.tilt || 0, fl = cfg.floor || 0, ce = (cfg.ceiling != null ? cfg.ceiling : 1), rng = Math.max(0.02, ce - fl);
      for (let i = 0; i < n; i++) {
        let v = Math.max(0, Math.min(1, bandAt(i)));
        if (tilt) v = Math.min(1, v * (1 + tilt * (i / Math.max(1, n - 1)) * 3));
        v = Math.max(0, Math.min(1, (v - fl) / rng));
        const p = sm[i] || 0;
        sm[i] = v > p ? v : p * rel + v * (1 - rel);
      }
      const sbr = Math.round((cfg.smoothBands || 0) * 8);
      const vals = new Array(n);
      if (sbr > 0) {
        for (let i = 0; i < n; i++) { let s = 0, wsum = 0; for (let k = -sbr; k <= sbr; k++) { const j = i + k; if (j < 0 || j >= n) continue; const wk = 1 - Math.abs(k) / (sbr + 1); s += (sm[j] || 0) * wk; wsum += wk; } vals[i] = s / wsum; }
      } else { for (let i = 0; i < n; i++) vals[i] = sm[i] || 0; }
      const peakOn = !!cfg.peakHold;
      if (peakOn) for (let i = 0; i < n; i++) pk[i] = Math.max(vals[i], (pk[i] || 0) * 0.94);

      const bv = (i) => vals[cfg.mirror ? Math.min(i, n - 1 - i) : i];
      const pkAt = (i) => pk[cfg.mirror ? Math.min(i, n - 1 - i) : i] || 0;

      const baseCol = cfg.color === "cover" ? (coverColorRef.current || accentVar)
        : cfg.color === "custom" ? (cfg.customColor || accentVar) : accentVar;
      const grad = !!cfg.gradient, topCol = cfg.gradColor || "#ffffff";
      const colAt = (v) => grad ? vizLerp(baseCol, topCol, Math.min(1, v)) : baseCol;
      const maxLen = cfg.barLength, gap = cfg.gap, curve = cfg.render === "curve";
      ctx.lineCap = "round"; ctx.lineWidth = cfg.barThickness;

      let bx = (w - 260) / 2, by = (h - 260) / 2, bw = 260, bh = 260;
      const cover = coverRef.current;
      if (cover) { const r = cover.getBoundingClientRect(), cr = cv.getBoundingClientRect(); bx = r.left - cr.left; by = r.top - cr.top; bw = r.width; bh = r.height; }

      if (cfg.shape === "ring") {
        const cx = bx + bw / 2, cy = by + bh / 2, R0 = bw / 2 + gap;
        if (curve) {
          ctx.strokeStyle = grad ? topCol : baseCol; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1.5, cfg.barThickness);
          ctx.beginPath();
          for (let i = 0; i <= n; i++) { const ii = i % n, a = (ii / n) * Math.PI * 2 - Math.PI / 2, r = R0 + 4 + bv(ii) * maxLen, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.closePath(); ctx.stroke();
        } else {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2, v = bv(i), len = 4 + v * maxLen, ca = Math.cos(a), sa = Math.sin(a);
            ctx.strokeStyle = colAt(v); ctx.globalAlpha = 0.25 + v * 0.6;
            ctx.beginPath(); ctx.moveTo(cx + ca * R0, cy + sa * R0); ctx.lineTo(cx + ca * (R0 + len), cy + sa * (R0 + len)); ctx.stroke();
            if (peakOn) { const pl = R0 + 4 + pkAt(i) * maxLen; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(cx + ca * pl, cy + sa * pl); ctx.lineTo(cx + ca * (pl + 3), cy + sa * (pl + 3)); ctx.stroke(); }
          }
        }
      } else if (cfg.shape === "linear") {
        const pos = cfg.linearPos || "bottom", Wlin = w - 56, xs = (w - Wlin) / 2, step = Wlin / n, yb = pos === "center" ? (by + bh / 2) : (h - 40 - gap);
        if (curve) {
          // sign -1 = upward; when mirrored, also draw the reflected downward curve.
          const drawCurve = (sign) => {
            const pts = []; for (let i = 0; i < n; i++) pts.push([xs + i * step + step / 2, yb + sign * (3 + bv(i) * maxLen)]);
            let fillStyle = baseCol;
            if (grad) { const g = ctx.createLinearGradient(0, yb + sign * maxLen, 0, yb); g.addColorStop(0, topCol); g.addColorStop(1, baseCol); fillStyle = g; }
            ctx.globalAlpha = 0.5; ctx.fillStyle = fillStyle;
            ctx.beginPath(); ctx.moveTo(pts[0][0], yb); ctx.lineTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) { const [ppx, ppy] = pts[i - 1], [x, y] = pts[i], mx = (ppx + x) / 2, my = (ppy + y) / 2; ctx.quadraticCurveTo(ppx, ppy, mx, my); }
            ctx.lineTo(pts[pts.length - 1][0], yb); ctx.closePath(); ctx.fill();
          };
          drawCurve(-1);
          if (cfg.mirror) drawCurve(1);
        } else {
          for (let i = 0; i < n; i++) {
            const v = bv(i), len = 3 + v * maxLen, x = xs + i * step + step / 2;
            ctx.strokeStyle = colAt(v); ctx.globalAlpha = 0.3 + v * 0.6;
            ctx.beginPath();
            if (cfg.mirror) { ctx.moveTo(x, yb - len); ctx.lineTo(x, yb + len); } else { ctx.moveTo(x, yb); ctx.lineTo(x, yb - len); }
            ctx.stroke();
            if (peakOn && !cfg.mirror) { const pl = 3 + pkAt(i) * maxLen; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(x - step * 0.32, yb - pl); ctx.lineTo(x + step * 0.32, yb - pl); ctx.stroke(); }
          }
        }
      } else {
        const x0 = bx - gap, y0 = by - gap, x1 = bx + bw + gap, y1 = by + bh + gap, W2 = x1 - x0, H2 = y1 - y0, P = 2 * (W2 + H2);
        for (let i = 0; i < n; i++) {
          const v = bv(i), len = 4 + v * maxLen, d = ((i + 0.5) / n) * P;
          let px, py, nx, ny;
          if (d < W2) { px = x0 + d; py = y0; nx = 0; ny = -1; }
          else if (d < W2 + H2) { px = x1; py = y0 + (d - W2); nx = 1; ny = 0; }
          else if (d < 2 * W2 + H2) { px = x1 - (d - (W2 + H2)); py = y1; nx = 0; ny = 1; }
          else { px = x0; py = y1 - (d - (2 * W2 + H2)); nx = -1; ny = 0; }
          ctx.strokeStyle = colAt(v); ctx.globalAlpha = 0.25 + v * 0.6;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + nx * len, py + ny * len); ctx.stroke();
          if (peakOn) { const pl = 4 + pkAt(i) * maxLen, ppx = px + nx * pl, ppy = py + ny * pl, ex = -ny, ey = nx; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(ppx - ex * 2.5, ppy - ey * 2.5); ctx.lineTo(ppx + ex * 2.5, ppy + ey * 2.5); ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1;

      smoothLevel += ((audioLevels.level || 0) - smoothLevel) * 0.25;
      const base = playingRef.current ? 1.03 : 0.97;
      // Pulse amplitude: strength (0..1) scales up to a 0.20 cover-scale swing at full level.
      // Default 0.3 ≈ the previous fixed 0.06 factor.
      const pulseAmt = cfg.coverPulse ? smoothLevel * (cfg.coverPulseStrength ?? 0.3) * 0.2 : 0;
      if (coverRef.current) coverRef.current.style.transform = `scale(${base + pulseAmt})`;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); if (coverRef.current) coverRef.current.style.transform = ""; };
  }, [ambientVisualizer, narrow]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>

      {/* Ambient colour blobs — negative inset keeps edges outside the visible area */}
      {ambientVisualizer && (vizConfig?.blobs !== false) && (<>
        <div style={{
          position: "absolute", inset: "-30%", zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse 38% 32% at 44% 42%, var(--accent) 0%, transparent 70%)",
          mixBlendMode: "screen",
          animation: "blobDrift1 18s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", inset: "-30%", zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse 32% 38% at 62% 60%, #7b2ff7 0%, transparent 68%)",
          mixBlendMode: "screen",
          animation: "blobDrift2 23s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", inset: "-30%", zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse 44% 36% at 52% 48%, #1565c0 0%, transparent 65%)",
          mixBlendMode: "screen",
          animation: "blobDrift3 29s ease-in-out infinite",
        }} />
      </>)}

      {/* Audio-reactive spectrum ring */}
      {ambientVisualizer && (
        <canvas ref={specRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none" }} />
      )}

      {/* Content — shifted up when a bottom linear spectrum would otherwise overlap it */}
      <div style={{ position: "relative", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 32 : 64,
        marginBottom: (ambientVisualizer && vizConfig?.shape === "linear" && (vizConfig?.linearPos || "bottom") === "bottom") ? (compact ? 56 : 96) : 0,
        transition: "margin-bottom 0.3s ease" }}>
        {/* Album cover */}
        <div ref={coverRef} style={{
          width: coverSize, height: coverSize, borderRadius: compact ? 12 : 16, overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          transform: isPlaying ? "scale(1.03)" : "scale(0.97)",
          transition: ambientVisualizer ? "none" : "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
        }}>
          {hq
            ? <img src={thumb(hq)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#2a1535,#1a0a25)" }} />
          }
        </div>

        {/* Track info */}
        <div style={{ textAlign: "center", maxWidth: compact ? 360 : 520 }}>
          <div style={{ fontSize: compact ? 17 : "var(--t22)", fontWeight: 700, color: "#fff", marginBottom: compact ? 3 : 6, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8, lineHeight: 1.3 }}>
            <span style={{ overflowWrap: "anywhere" }}>{track.title}</span>
            {track.isExplicit && <ExplicitBadge />}
          </div>
          <div style={{ fontSize: compact ? 12 : "var(--t14)", color: "rgba(255,255,255,0.6)", overflowWrap: "anywhere" }}>{track.artists}</div>
        </div>
      </div>
    </div>
  );
}



function parseLrc(lrc) {
  if (!lrc) return [];
  const lines = [];
  for (const line of lrc.split("\n")) {
    const m = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
    if (m) {
      const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
      lines.push({ time, text: m[3].trim() });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function parseRichSync(richsync) {
  // Musixmatch RichSync: [{ ts, te, l: [{c, o}], x }, ...]
  // ts/te = line start/end in seconds, l[i].c = word/char, l[i].o = offset from ts
  if (!Array.isArray(richsync)) return [];
  return richsync
    .filter(line => line && typeof line.ts === "number")
    .map(line => {
      const words = (line.l || []).map((w, j) => {
        const wordStart = line.ts + (w.o || 0);
        const wordEnd = line.l[j + 1] ? line.ts + line.l[j + 1].o : line.te;
        return { text: w.c, time: wordStart, end: wordEnd, isSpace: (w.c || "").trim() === "" };
      });
      return { time: line.ts, endTime: line.te, words, wordSync: true, text: line.x || "" };
    });
}

function parseTtml(ttml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(ttml, "text/xml");

  // Detect timing mode: "Line" = one timestamp per line, "Word" = per-word timestamps
  const ttEl = doc.querySelector("tt");
  const timingMode = ttEl?.getAttribute("itunes:timing") || ttEl?.getAttribute("composer:timing") || "Word";
  const isLineSync = timingMode === "Line";

  // Parse agents from <head><metadata><ttm:agent>
  const TTM_NS = "http://www.w3.org/ns/ttml#metadata";
  const agents = {};
  let leadAgentId = null;
  const agentEls = doc.getElementsByTagNameNS(TTM_NS, "agent");
  for (const a of agentEls) {
    const id = a.getAttribute("xml:id");
    const type = a.getAttribute("type");
    const nameEls = a.getElementsByTagNameNS(TTM_NS, "name");
    const name = nameEls[0]?.textContent?.trim();
    if (id) {
      agents[id] = { id, type, name };
      if (!leadAgentId && type === "person") leadAgentId = id;
    }
  }

  const lines = [];
  for (const p of doc.querySelectorAll("p")) {
    const begin = p.getAttribute("begin");
    const end = p.getAttribute("end");
    if (!begin) continue;
    const time = ttmlTimeToSeconds(begin);
    const endTime = end ? ttmlTimeToSeconds(end) : null;

    // Resolve agent and role
    const agentId = p.getAttribute("ttm:agent");
    const agent = agentId ? (agents[agentId] || null) : null;
    let agentRole = null;
    if (agent) {
      if (agent.type === "group") agentRole = "group";
      else if (agentId === leadAgentId) agentRole = "lead";
      else agentRole = "featured";
    }

    if (isLineSync) {
      // Line-sync main text + BG vocals that may have their own per-word timestamps.
      // Even in line-sync mode the x-bg span can contain timed inner spans — extract
      // those as bgWords so the RAF can animate them word-by-word.
      let mainText = "";
      const bgWords = [];

      const extractBgWords = (node, iBegin, iEnd) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent;
          if (t) bgWords.push({
            text: t,
            time: ttmlTimeToSeconds(iBegin || begin),
            end: ttmlTimeToSeconds(iEnd || end || begin),
            isSpace: t.trim() === "",
          });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const b = node.getAttribute("begin") || iBegin || begin;
          const e = node.getAttribute("end")   || iEnd   || end || begin;
          for (const c of node.childNodes) extractBgWords(c, b, e);
        }
      };

      for (const child of p.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          mainText += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.getAttribute("ttm:role") === "x-bg")
            for (const c of child.childNodes) extractBgWords(c, begin, end);
          else
            mainText += child.textContent;
        }
      }
      mainText = mainText.trim();

      // Stretch line time-range to fully cover bg vocals (before or after main line)
      let effectiveTime = time;
      let effectiveEnd  = endTime;
      if (bgWords.length) {
        const bgNS = bgWords.filter(w => !w.isSpace);
        if (bgNS.length) {
          const bgFirst = Math.min(...bgNS.map(w => w.time));
          const bgLast  = Math.max(...bgNS.map(w => w.end));
          if (isFinite(bgFirst) && bgFirst < effectiveTime) effectiveTime = bgFirst;
          if (isFinite(bgLast)  && bgLast  > (effectiveEnd ?? 0)) effectiveEnd = bgLast;
        }
      }

      if (mainText || bgWords.length) {
        const lineObj = { time: effectiveTime, endTime: effectiveEnd,
          text: mainText || "\u00A0", wordSync: false, lineSync: true, agent, agentRole };
        if (bgWords.length) lineObj.bgWords = bgWords;
        lines.push(lineObj);
      }
      continue;
    }

    // Word-sync: extract per-span timestamps; separate background vocals (ttm:role="x-bg")
    const words = [];
    const bgWords = [];
    const processNode = (node, inheritBegin, inheritEnd, isBg = false) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text) {
          const w = {
            text,
            time: ttmlTimeToSeconds(inheritBegin || begin),
            end: ttmlTimeToSeconds(inheritEnd || end || begin),
            isSpace: text.trim() === "",
          };
          if (isBg) bgWords.push(w); else words.push(w);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const nextIsBg = isBg || node.getAttribute("ttm:role") === "x-bg";
        const b = node.getAttribute("begin") || inheritBegin || begin;
        const e = node.getAttribute("end") || inheritEnd || end || begin;
        for (const child of node.childNodes) processNode(child, b, e, nextIsBg);
      }
    };

    for (const child of p.childNodes) processNode(child, begin, end, false);
    if (words.length || bgWords.length) {
      // Stretch the line's time range to fully cover bg vocals in both directions.
      // BG vocals can start before the main line (extend time backward) or end
      // after it (extend endTime forward) — the line must stay active throughout.
      let effectiveTime = time;
      let effectiveEnd = endTime;
      if (bgWords.length) {
        const bgNonSpace = bgWords.filter(w => !w.isSpace);
        if (bgNonSpace.length) {
          const bgFirst = Math.min(...bgNonSpace.map(w => w.time));
          const bgLast  = Math.max(...bgNonSpace.map(w => w.end));
          if (isFinite(bgFirst) && bgFirst < effectiveTime) effectiveTime = bgFirst;
          if (isFinite(bgLast)  && bgLast  > (effectiveEnd ?? 0)) effectiveEnd = bgLast;
        }
      }
      const lineObj = { time: effectiveTime, endTime: effectiveEnd, words, wordSync: true, agent, agentRole };
      if (bgWords.length) lineObj.bgWords = bgWords;
      lines.push(lineObj);
    }
  }
  return lines;
}

function ttmlTimeToSeconds(t) {
  if (!t) return 0;
  // Format: HH:MM:SS.mmm or MM:SS.mmm
  const parts = t.split(":");
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(t);
}

function parseDurationToSeconds(str) {
  if (!str) return null;
  const parts = str.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatTotalDuration(tracks) {
  const totalSecs = tracks.reduce((sum, t) => sum + (parseDurationToSeconds(t.duration) || 0), 0);
  if (totalSecs <= 0) return null;
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

const DEFAULT_LYRICS_PROVIDERS = [
  { id: "better",     label: "Better Lyrics", enabled: true },
  { id: "unison",     label: "Unison",        enabled: true },
  { id: "musixmatch", label: "Musixmatch",    enabled: true },
  { id: "lrclib",     label: "LRCLIB",        enabled: true },
  { id: "kugou",      label: "Kugou",         enabled: true },
  { id: "simp",       label: "SimpMusic",     enabled: true },
];

// Sync-type tags shown next to each provider in settings
const PROVIDER_SYNC = {
  better:     { label: "Syllable", icon: "/sync-syllable.svg", color: "#ce93d8", bg: "rgba(206,147,216,0.12)" },
  unison:     { label: "Syllable", icon: "/sync-syllable.svg", color: "#ce93d8", bg: "rgba(206,147,216,0.12)" },
  musixmatch: { label: "Word",     icon: "/sync-word.svg",     color: "#f48fb1", bg: "rgba(244,143,177,0.12)" },
  lrclib:     { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
  kugou:      { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
  simp:       { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
};

async function fetchLyrics(title, artist, album, duration, providers = DEFAULT_LYRICS_PROVIDERS, videoId = "") {
  const tryBetter = async () => {
    const params = new URLSearchParams({ title, artist, source: "better" });
    if (album) params.set("album", album);
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d?.ttml) { const lrc = parseTtml(d.ttml); if (lrc.length) return { source: "Better Lyrics", lrc }; }
    }
    return null;
  };
  const tryUnison = async () => {
    const params = new URLSearchParams({ title, artist, source: "unison" });
    if (album) params.set("album", album);
    if (duration) params.set("duration", Math.round(duration));
    if (videoId) params.set("videoId", videoId);
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      const sub = d?.submitterName || null;
      if (d?.ttml) { const lrc = parseTtml(d.ttml); if (lrc.length) return { source: "Unison", lrc, submitterName: sub }; }
      if (d?.synced) return { source: "Unison", lrc: parseLrc(d.synced), submitterName: sub };
      if (d?.plain)  return { source: "Unison", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })), submitterName: sub };
    }
    return null;
  };
  const tryLrclib = async () => {
    const params = new URLSearchParams({ title, artist, source: "lrclib" });
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d.synced) return { source: "LRCLIB", lrc: parseLrc(d.synced) };
      if (d.plain) return { source: "LRCLIB", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })) };
    }
    return null;
  };
  const tryKugou = async () => {
    const params = new URLSearchParams({ title, artist, source: "kugou" });
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d.synced) return { source: "Kugou", lrc: parseLrc(d.synced) };
    }
    return null;
  };
  const trySimp = async () => {
    const params = new URLSearchParams({ title, artist, source: "simp" });
    if (videoId) params.set("videoId", videoId);
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d.synced) return { source: "SimpMusic", lrc: parseLrc(d.synced) };
      if (d.plain) return { source: "SimpMusic", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })) };
    }
    return null;
  };
  const tryMusixmatch = async () => {
    const params = new URLSearchParams({ title, artist, source: "musixmatch" });
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.richsync) { const lrc = parseRichSync(d.richsync); if (lrc.length) return { source: "Musixmatch", lrc }; }
    if (d.synced)   return { source: "Musixmatch", lrc: parseLrc(d.synced) };
    if (d.plain)    return { source: "Musixmatch", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })) };
    return null;
  };

  const tryFns = { better: tryBetter, unison: tryUnison, lrclib: tryLrclib, kugou: tryKugou, simp: trySimp, musixmatch: tryMusixmatch };
  const enabledProviders = providers.filter(p => p.enabled && tryFns[p.id]);

  // Fetch all providers in parallel — so we know which ones have no lyrics
  const settled = await Promise.all(
    enabledProviders.map(p => tryFns[p.id]().catch(() => null).then(r => ({ id: p.id, result: r })))
  );

  // Pick best result in priority order, collect failures + every available version
  const failedIds = [];
  let bestResult = null;
  const allResults = [];
  for (const p of enabledProviders) {
    const { result } = settled.find(s => s.id === p.id);
    if (result) {
      const tagged = { ...result, providerId: p.id };
      allResults.push(tagged);
      if (!bestResult) bestResult = tagged;
    } else failedIds.push(p.id);
  }

  return bestResult ? { ...bestResult, failedIds, allResults } : { failedIds, allResults };
}

// ─── Unison signed write helpers ─────────────────────────────────────────────
// The frontend signs each request with the stored identity (WebCrypto) and posts the
// signed envelope to the backend, which forwards it to Unison.
function getUnisonIdentity() {
  try { const raw = localStorage.getItem("kodama-unison-identity"); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
async function unisonVote(lyricsId, vote) {
  const id = getUnisonIdentity();
  if (!id) throw new Error("no_identity");
  const method = vote === 0 ? "DELETE" : "POST";
  const body = await buildSignedRequest(id, vote === 0 ? {} : { vote });
  const r = await fetch(`${API}/unison/lyrics/${lyricsId}/vote`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("vote_failed");
  return true;
}
async function unisonReport(lyricsId, reason, details) {
  const id = getUnisonIdentity();
  if (!id) throw new Error("no_identity");
  const body = await buildSignedRequest(id, details ? { reason, details } : { reason });
  const r = await fetch(`${API}/unison/lyrics/${lyricsId}/report`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("report_failed");
  return true;
}

// Set / reset / look up the identity's Unison nickname (custom display name).
async function unisonSetNickname(nickname) {
  const id = getUnisonIdentity();
  if (!id) throw new Error("no_identity");
  const body = await buildSignedRequest(id, { nickname });
  const r = await fetch(`${API}/unison/auth/nickname`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "nickname_failed");
  return d;
}
async function unisonResetNickname() {
  const id = getUnisonIdentity();
  if (!id) throw new Error("no_identity");
  const body = await buildSignedRequest(id, {});
  const r = await fetch(`${API}/unison/auth/nickname`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("reset_failed");
  return true;
}
async function unisonFetchDisplayName(keyId) {
  try {
    const r = await fetch(`${API}/unison/displayname/${keyId}`);
    if (r.ok) return (await r.json()).displayName || null;
  } catch {}
  return null;
}

// Browse every available lyrics version for the current track and apply the preferred
// one. Fetches all providers on open and shows a preview + sync type per version.
const UNISON_REPORT_REASONS = ["wrong_song", "bad_sync", "offensive", "spam", "other"];

function LyricsBrowserModal({ track, providers, currentSource, currentSubmitter, currentVersionId, onApply, onClose }) {
  const t = useLang();
  const [results, setResults] = useState(null); // null = loading, [] = none
  const [votes, setVotes] = useState({});       // { [versionId]: { my: -1|0|1, count } }

  const doVote = async (r, dir) => {
    if (r.id == null) return;
    if (!getUnisonIdentity()) { toast.danger(t("unisonNeedIdentity"), { timeout: 5000 }); return; }
    const cur = votes[r.id]?.my ?? 0;
    const base = votes[r.id]?.count ?? (r.voteCount || 0);
    const next = cur === dir ? 0 : dir; // toggle off if same direction
    setVotes(v => ({ ...v, [r.id]: { my: next, count: base + (next - cur) } }));
    try { await unisonVote(r.id, next); }
    catch {
      setVotes(v => ({ ...v, [r.id]: { my: cur, count: base } }));
      toast.danger(t("unisonVoteError"), { timeout: 4000 });
    }
  };

  const doReport = async (versionId, reason) => {
    if (!getUnisonIdentity()) { toast.danger(t("unisonNeedIdentity"), { timeout: 5000 }); return; }
    try { await unisonReport(versionId, reason); toast.success(t("unisonReportThanks"), { timeout: 3500 }); }
    catch { toast.danger(t("unisonReportError"), { timeout: 4000 }); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchLyrics(track.title, track.artists, track.album, parseDurationToSeconds(track.duration), providers, track.videoId || "").catch(() => null);
      let base = res?.allResults || [];
      // Expand the single Unison entry into every community submission for this song.
      if (providers.some(p => p.enabled && p.id === "unison")) {
        try {
          const params = new URLSearchParams({ title: track.title, artist: track.artists });
          if (track.album) params.set("album", track.album);
          const dur = parseDurationToSeconds(track.duration);
          if (dur) params.set("duration", Math.round(dur));
          if (track.videoId) params.set("videoId", track.videoId);
          const r = await fetch(`${API}/lyrics/unison/versions?${params}`);
          if (r.ok) {
            const d = await r.json();
            const uVersions = (d.versions || []).map(v => {
              let lrc = null;
              if (v.format === "ttml") lrc = parseTtml(v.lyrics);
              else if (v.format === "lrc") lrc = parseLrc(v.lyrics);
              else if (v.lyrics) lrc = v.lyrics.split("\n").map(line => ({ time: -1, text: line }));
              return (lrc && lrc.length)
                ? { id: v.id, source: "Unison", providerId: "unison", submitterName: v.submitterName, syncType: v.syncType, format: v.format, voteCount: v.voteCount, lrc }
                : null;
            }).filter(Boolean);
            if (uVersions.length) {
              const idx = base.findIndex(x => x.providerId === "unison");
              const without = base.filter(x => x.providerId !== "unison");
              const at = idx >= 0 ? idx : 0;
              base = [...without.slice(0, at), ...uVersions, ...without.slice(at)];
            }
          }
        } catch {}
      }
      if (!cancelled) setResults(base);
    })();
    return () => { cancelled = true; };
  }, []);

  const lineText = (l) => (l.text || (l.words || []).map(w => w.text).join("")).trim();
  const previewOf = (lrc) => (lrc || []).map(lineText).filter(Boolean).slice(0, 3).join(" / ");

  // Sync badge derived from the ACTUAL parsed lyrics, not the provider — the real sync
  // type varies per song (e.g. Better Lyrics may return line-synced for some tracks).
  // word-level timing → Syllable/Word (by provider); line-level → Line; none → Plain.
  const detectSync = (lrc) => {
    if (!lrc || !lrc.length) return "plain";
    if (lrc.some(l => Array.isArray(l.words) && l.words.length > 0)) return "word";
    if (lrc.some(l => typeof l.time === "number" && l.time >= 0)) return "line";
    return "plain";
  };
  const syncFor = (r) => {
    const level = detectSync(r.lrc);
    if (level === "line") return PROVIDER_SYNC.lrclib;  // Line badge
    if (level === "plain") return { label: "Plain", color: "#9e9e9e", bg: "rgba(158,158,158,0.12)" };
    return r.providerId === "musixmatch" ? PROVIDER_SYNC.musixmatch : PROVIDER_SYNC.better;
  };

  // Exactly one row is "active": prefer an exact version-id match (set when a version
  // was applied from here), otherwise the first row matching the live source/submitter.
  const activeIdx = (() => {
    const list = results || [];
    if (currentVersionId != null) {
      const i = list.findIndex(r => r.id != null && r.id === currentVersionId);
      if (i >= 0) return i;
    }
    return list.findIndex(r => r.source === currentSource
      && (r.source !== "Unison" || (r.submitterName || null) === (currentSubmitter || null)));
  })();

  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="lg" className="w-[520px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Microphone size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading className="flex items-center gap-2">
                {t("browseLyrics")}
                <span className="text-t10 font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-accent-dim text-accent">Beta</span>
              </ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="h-[48vh] overflow-y-auto overflow-x-hidden px-0.5">
                {results === null ? (
                  <div className="h-full flex items-center justify-center"><Spinner size="sm" /></div>
                ) : results.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted text-t12">{t("noLyricsFound")}</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {results.map((r, i) => {
                      const sync = syncFor(r);
                      const isActive = i === activeIdx;
                      const preview = previewOf(r.lrc);
                      const isUnison = r.providerId === "unison" && r.id != null;
                      const vState = votes[r.id];
                      const count = vState ? vState.count : (r.voteCount ?? 0);
                      const my = vState ? vState.my : 0;
                      return (
                        <div key={`${r.providerId}-${i}`} role="button" tabIndex={0}
                          onClick={() => { onApply(r); onClose(); }}
                          onKeyDown={e => { if (e.key === "Enter") { onApply(r); onClose(); } }}
                          className={cn("flex flex-col gap-1.5 p-3 rounded-xl text-left border w-full min-w-0 cursor-default transition-colors duration-150",
                            isActive ? "border-accent bg-accent-dim" : "border-border bg-transparent hover:bg-hover")}>
                          <div className="flex items-center gap-2 w-full min-w-0">
                            <span className={cn("text-t13 font-semibold shrink-0", isActive && "text-accent")}>{r.source}</span>
                            {r.submitterName ? <span className="text-t11 text-muted truncate min-w-0">· {r.submitterName}</span> : null}
                            {sync ? (
                              <span className="ml-auto text-t10 px-1.5 py-0.5 rounded shrink-0" style={{ color: sync.color, background: sync.bg }}>{sync.label}</span>
                            ) : <span className="ml-auto" />}
                            {isActive ? <Check size={14} weight="bold" className="text-accent shrink-0" /> : null}
                          </div>
                          {preview ? <div className="text-t11 text-muted leading-relaxed line-clamp-2 break-words w-full">{preview}</div> : null}
                          {isUnison ? (
                            <div className="flex items-center gap-1 pt-0.5" onClick={e => e.stopPropagation()}>
                              <button onClick={() => doVote(r, 1)} title={t("upvote")}
                                className={cn("flex items-center justify-center size-6 rounded-md hover:bg-hover transition-colors", my === 1 ? "text-accent" : "text-muted")}>
                                <CaretUp size={13} weight="bold" />
                              </button>
                              <span className="text-t11 tabular-nums min-w-[18px] text-center text-secondary">{count}</span>
                              <button onClick={() => doVote(r, -1)} title={t("downvote")}
                                className={cn("flex items-center justify-center size-6 rounded-md hover:bg-hover transition-colors", my === -1 ? "text-[#e05252]" : "text-muted")}>
                                <CaretDown size={13} weight="bold" />
                              </button>
                              <Dropdown>
                                <DropdownTrigger title={t("report")}
                                  className="ml-auto flex items-center justify-center size-6 rounded-md hover:bg-hover text-muted hover:text-[#e05252] transition-colors">
                                  <Flag size={13} />
                                </DropdownTrigger>
                                <DropdownPopover className={cn("z-[400]!", CTX_POPOVER_ANIM)}>
                                  <DropdownMenu aria-label={t("report")} onAction={(key) => doReport(r.id, String(key))}>
                                    {UNISON_REPORT_REASONS.map(rr => (
                                      <DropdownItem key={rr} id={rr} textValue={t("report_" + rr)}>{t("report_" + rr)}</DropdownItem>
                                    ))}
                                  </DropdownMenu>
                                </DropdownPopover>
                              </Dropdown>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" fullWidth className="justify-center gap-2"
                onPress={() => { openComposer(track?.videoId).catch(console.error); onClose(); }}>
                <img src="/Boidu Composer Icon.svg" style={{ width: 18, height: 18 }} alt="" />{t("openComposerBtn")}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// LEGACY - replaced above
async function _fetchLyrics_unused(title, artist, album, duration) {
  // 1. Kimuco Lyrics (Supabase)
  try {
    const q = encodeURIComponent(title.toLowerCase());
    const url = `${SUPABASE_URL}/rest/v1/Kimuco%20Lyrics?select=synced_lyrics&title=ilike.${q}&limit=1`;
    const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    const d = await r.json();
    if (d?.[0]?.synced_lyrics) return { source: "Kimuco", lrc: parseLrc(d[0].synced_lyrics) };
  } catch {}

  // 2. Better Lyrics
  try {
    const params = new URLSearchParams({ s: title, a: artist });
    if (album) params.set("al", album);
    if (duration) params.set("d", Math.round(duration));
    const r = await fetch(`https://lyrics-api.boidu.dev/getLyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d?.ttml) { const lrc = parseTtml(d.ttml); if (lrc.length) return { source: "Better Lyrics", lrc }; }
    }
  } catch {}

  // 3. LRCLIB
  try {
    const r = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
    if (r.ok) {
      const d = await r.json();
      if (d.syncedLyrics) return { source: "LRCLIB", lrc: parseLrc(d.syncedLyrics) };
      if (d.plainLyrics) return { source: "LRCLIB", lrc: d.plainLyrics.split("\n").map(t => ({ time: -1, text: t })) };
    }
  } catch {}

  return null;
}

// Paint a word-synced line's per-syllable highlight directly onto its DOM spans.
// Shared by the ACTIVE line and the TRAILING line (a line that handed over before its
// endTime). Driving both from the same routine means a handed-over line keeps wiping its
// remaining syllables to completion instead of snapping fully white on the line switch.
// zoomMaxRef: pass a ref to enable the per-syllable zoom (active line); pass null to
// disable it (trailing line — it just finishes its wipe quietly, no attention-grab).
// Paints a single karaoke word sequence (its own active-word index, stored under
// idxKey on idxRef). Main vocals and background vocals are painted as INDEPENDENT
// sequences so a bg line starting does not mark the main line as fully sung.
// Map each non-space word entry to its space-delimited word-group index (for word-level glow).
function wordGroupIndices(allWords) {
  const groups = [];
  let g = -1, inWord = false;
  for (const w of (allWords || [])) {
    if (w.isSpace) { inWord = false; }
    else { if (!inWord) { g++; inWord = true; } groups.push(g); }
  }
  return groups;
}

function paintWordSeq(words, els, idxRef, idxKey, t, zoomMaxRef, glow, groups) {
  if (!words.length || !els.length) return;
  let curWordIdx = -1;
  for (let wi = 0; wi < words.length; wi++) {
    if (t >= words[wi].time) curWordIdx = wi;
    else break;
  }
  const prevIdx = idxRef[idxKey] ?? -1;
  // Update non-active words only on word change (cheap)
  if (curWordIdx !== prevIdx) {
    idxRef[idxKey] = curWordIdx;
    // Zoom only on a genuine sequential forward step to a not-yet-zoomed syllable.
    // Guards against (a) double-zoom from time-interpolation jitter flipping the index
    // back and forth, and (b) a spurious zoom when the index jumps (seek / line catch-up).
    const doZoom =
      zoomMaxRef && curWordIdx === prevIdx + 1 && curWordIdx > zoomMaxRef.current;
    if (doZoom) zoomMaxRef.current = curWordIdx;
    for (let wi = 0; wi < els.length; wi++) {
      const el = els[wi];
      if (!el) continue;
      const dimEl = el.previousElementSibling;
      if (wi === curWordIdx) {
        // Fade-in: bright span was opacity=0 (future state) → animate to 1
        el.style.transition = "opacity 0.15s ease-out, text-shadow 0.4s ease-out";
        el.style.opacity = "1";
        // Gentle karaoke zoom: a smooth, soft scale on the syllable as it activates.
        // transform-origin left → the scale grows toward the right. No overshoot/bounce.
        if (doZoom) {
          const wrap = el.parentElement;
          if (wrap && wrap.animate) {
            // Scale the zoom duration to the syllable length so long words swell gently
            // over their whole duration instead of a quick fixed pop. Clamped so very
            // short syllables still read and very long ones don't drag.
            const word = words[curWordIdx];
            const sylMs = word ? (word.end - word.time) * 1000 : 440;
            const durMs = Math.min(1100, Math.max(300, sylMs));
            wrap.style.transformOrigin = "left center";
            // Per-segment ease-in-out → velocity reaches 0 at start, peak AND end, so the
            // swell rises and falls with no hard corner at the top. Much smoother than a
            // single easing across the whole pulse.
            wrap.animate(
              [
                { transform: "scale(1)",    easing: "ease-in-out" },
                { transform: "scale(1.05)", offset: 0.5, easing: "ease-in-out" },
                { transform: "scale(1)" },
              ],
              { duration: durMs }
            );
          }
        }
      } else if (wi < curWordIdx) {
        // Past: keep bright span fully visible (same white as active)
        el.style.transition = "text-shadow 0.4s ease-out";
        el.style.WebkitMaskImage = "";
        el.style.maskImage = "";
        el.style.opacity = "1";
      } else {
        // Future: instant reset
        el.style.transition = "text-shadow 0.4s ease-out";
        el.style.opacity = "0";
        el.style.WebkitMaskImage = "linear-gradient(to right, black -6px, transparent 6px)";
        el.style.maskImage = "linear-gradient(to right, black -6px, transparent 6px)";
        if (dimEl) dimEl.style.color = "rgba(255,255,255,0.25)";
      }
      // Word-level glow (fluid): glow the segments of the active word that have ALREADY been
      // sung (incl. the one wiping) so the lit part of the word keeps glowing across syllable
      // changes; only fade out when the word itself changes. Not-yet-sung segments stay unlit.
      el.style.textShadow =
        glow && groups && curWordIdx >= 0 && wi <= curWordIdx && groups[wi] === groups[curWordIdx]
          ? "0 0 7px rgba(255,255,255,0.45)"
          : "";
    }
  }
  // Update active word mask every frame for smooth wipe (opacity handled by CSS transition)
  if (curWordIdx >= 0 && curWordIdx < els.length) {
    const el = els[curWordIdx];
    const word = words[curWordIdx];
    if (el && word) {
      const pct = Math.min(100, (t - word.time) / Math.max(word.end - word.time, 0.001) * 100);
      el.style.WebkitMaskImage = `linear-gradient(to right, black calc(${pct.toFixed(1)}% - 6px), transparent calc(${pct.toFixed(1)}% + 6px))`;
      el.style.maskImage = `linear-gradient(to right, black calc(${pct.toFixed(1)}% - 6px), transparent calc(${pct.toFixed(1)}% + 6px))`;
    }
  }
}

function paintLineWords(line, els, wordIdxRef, t, zoomMaxRef = null, glow = false) {
  if (!line || !els || els.length === 0) return;
  // DOM order of bright spans: main words first, then bg words. Split and paint each
  // as its own sequence so the two vocal streams never bleed into each other's fill.
  const mainWords = (line.words   || []).filter(w => !w.isSpace);
  const bgWords   = (line.bgWords || []).filter(w => !w.isSpace);
  const mainEls = mainWords.length ? els.slice(0, mainWords.length) : [];
  const bgEls   = bgWords.length   ? els.slice(mainWords.length)     : [];
  paintWordSeq(mainWords, mainEls, wordIdxRef, "current",   t, zoomMaxRef, glow, wordGroupIndices(line.words));
  paintWordSeq(bgWords,   bgEls,   wordIdxRef, "bgCurrent", t, null, glow, wordGroupIndices(line.bgWords));
}

function LyricsOverlay({ track, audioRef, onClose, fontSize = 32, providers = DEFAULT_LYRICS_PROVIDERS, refetchKey = 0, onAddToast, language = "de", forcedProvider = null, onSourceChange, onProviderFailed, showTranslation = false, translationLang = "DE", translationFontSize = 20, showRomaji = false, romajiFontSize = 18, onCustomLyricsStatusChange, importLyricsRef, removeCustomLyricsRef, showAgentTags = true, ambientVisualizer = true, syllableZoom = false, fluidLyrics = false, ambientBackground = false, fullscreen = false, playerBarVisible = false, onInstrumentalChange }) {
  // In fullscreen the player bar overlays the bottom of the lyrics view; lift the
  // bottom-anchored chips above it while it's visible so they aren't covered.
  const chipBottomLift = (fullscreen && playerBarVisible) ? 104 : 0;
  const [lyrics, setLyrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [submitterName, setSubmitterName] = useState(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  // Identifies the exact version currently shown (Unison submission id), so the browser
  // can mark the right one active when two versions share text + submitter.
  const [appliedVersionId, setAppliedVersionId] = useState(null);

  // Apply a specific version chosen from the lyrics browser, and remember it for this
  // song via the same per-video cache the normal fetch uses.
  const applyLyricsVersion = (r) => {
    if (!r?.lrc) return;
    setLyrics(r.lrc);
    setSource(r.source);
    setSubmitterName(r.submitterName || null);
    setAppliedVersionId(r.id ?? null);
    onSourceChange?.(r.source);
    try {
      localStorage.setItem(`kiyoshi-lyrics-${track?.videoId}`, JSON.stringify({
        lrc: r.lrc, source: r.source, submitterName: r.submitterName || null, versionId: r.id ?? null, failedIds: [],
      }));
    } catch {}
  };
  const [tick, setTick] = useState(0);
  const [translations, setTranslations] = useState(null); // array of strings, one per lyric line
  const [translating, setTranslating] = useState(false);
  const [romajiLines, setRomajiLines] = useState(null); // array of romaji strings
  const [isCustomLyrics, setIsCustomLyrics] = useState(false);
  const [customLyricsKey, setCustomLyricsKey] = useState(0);
  const [inGap, setInGap] = useState(false);
  const [trailingIdx, setTrailingIdx] = useState(-1); // previous line still visible after new line starts
  const [scrollActive, setScrollActive] = useState(false); // auto-hide scrollbar (hover + idle)
  const t = useLang();
  const containerRef = useRef(null);
  const scrollIdleRef = useRef(null);

  // Reveal the scrollbar on cursor activity, then auto-hide after a short idle.
  const wakeScrollbar = useCallback(() => {
    setScrollActive(true);
    if (scrollIdleRef.current) clearTimeout(scrollIdleRef.current);
    scrollIdleRef.current = setTimeout(() => setScrollActive(false), 3200);
  }, []);
  const sleepScrollbar = useCallback(() => {
    if (scrollIdleRef.current) clearTimeout(scrollIdleRef.current);
    // Linger before sliding out instead of snapping away on mouse-leave.
    scrollIdleRef.current = setTimeout(() => setScrollActive(false), 1600);
  }, []);
  useEffect(() => () => { if (scrollIdleRef.current) clearTimeout(scrollIdleRef.current); }, []);
  // Briefly reveal the source badge (+ scrollbar) once lyrics have loaded, then let it idle-hide.
  useEffect(() => { if (source) wakeScrollbar(); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  const rafRef = useRef(null);
  const lyricsDataRef = useRef(null); // rAF loop reads lyrics without closure
  const lastIdxRef = useRef(-1);       // tracks active line to detect changes
  const prevTRef = useRef(0);          // previous loop time — to detect backward seeks/restarts
  const inGapRef = useRef(false);      // tracks inter-line gap state without closure
  const instVizRef = useRef(false);    // tracks instrumental-segment state without closure
  const onInstChangeRef = useRef(onInstrumentalChange); // live prop for the rAF loop
  useEffect(() => { onInstChangeRef.current = onInstrumentalChange; });
  const trailingIdxRef = useRef(-1);   // mirror of trailingIdx for RAF access without stale closure
  const wordElsRef = useRef([]);       // DOM refs to active line's word spans
  const activeWordIdxRef = useRef(-1); // tracks active word within line
  const activeWordMaxRef = useRef(-1); // highest syllable already zoomed (dedupes the pop)
  const trailWordElsRef = useRef([]);       // DOM refs to trailing line's word spans
  const activeTrailWordIdxRef = useRef(-1); // tracks active word within the trailing line
  const syllableZoomRef = useRef(syllableZoom); // read live in the rAF loop without re-subscribing
  useEffect(() => { syllableZoomRef.current = syllableZoom; }, [syllableZoom]);
  const fluidLyricsRef = useRef(fluidLyrics); // live read in the word-paint rAF (for the word glow)
  useEffect(() => { fluidLyricsRef.current = fluidLyrics; }, [fluidLyrics]);
  const bgContainerRef = useRef(null); // DOM ref to bg-vocals container (RAF-controlled opacity)
  // High-resolution playback time: interpolate between timeupdate events
  const audioSnapRef = useRef({ ct: 0, pt: 0, playing: false });

  // Keep lyricsDataRef in sync with state
  useEffect(() => { lyricsDataRef.current = lyrics; }, [lyrics]);

  // Fetch translations when showTranslation is enabled, lyrics change, or target language changes
  useEffect(() => {
    if (!showTranslation || !lyrics || lyrics.length === 0) {
      if (!showTranslation) setTranslations(null);
      return;
    }
    const lines = lyrics.map(line => {
      const main = line.wordSync ? (line.words || []).map(w => w.text).join("") : (line.text || "");
      const bg = (line.bgWords || []).map(w => w.text).join("") || (line.bgText || "");
      return bg ? `${main} ${bg}` : main;
    });
    setTranslating(true);
    setTranslations(null);
    fetch("http://localhost:9847/translate-lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, target_lang: translationLang }),
    })
      .then(r => r.json())
      .then(d => { setTranslations(d.translations || null); })
      .catch(() => setTranslations(null))
      .finally(() => setTranslating(false));
  }, [showTranslation, lyrics, translationLang]);

  // Fetch Romaji when toggle is enabled or lyrics change
  useEffect(() => {
    if (!showRomaji || !lyrics || lyrics.length === 0) {
      if (!showRomaji) setRomajiLines(null);
      return;
    }
    const lines = lyrics.map(line => {
      const main = line.wordSync ? (line.words || []).map(w => w.text).join("") : (line.text || "");
      const bg = (line.bgWords || []).map(w => w.text).join("") || (line.bgText || "");
      return bg ? `${main} ${bg}` : main;
    });
    fetch("http://localhost:9847/romanize-lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    })
      .then(r => r.json())
      .then(d => { setRomajiLines(d.romanizations || null); })
      .catch(() => setRomajiLines(null));
  }, [showRomaji, lyrics]);

  // Sync audio snap so the rAF loop can interpolate currentTime at 60 fps
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const snap = () => {
      audioSnapRef.current = { ct: audio.currentTime, pt: performance.now(), playing: !audio.paused };
    };
    audio.addEventListener("timeupdate", snap);
    audio.addEventListener("play",       snap);
    audio.addEventListener("pause",      snap);
    audio.addEventListener("seeked",     snap);
    snap(); // initial
    return () => {
      audio.removeEventListener("timeupdate", snap);
      audio.removeEventListener("play",       snap);
      audio.removeEventListener("pause",      snap);
      audio.removeEventListener("seeked",     snap);
    };
  }, [audioRef]);

  // rAF loop: line changes trigger React re-render; word highlighting is direct DOM manipulation
  useEffect(() => {
    const loop = () => {
      const { ct, pt, playing } = audioSnapRef.current;
      const t = playing ? ct + (performance.now() - pt) / 1000 : ct;
      const lyr = lyricsDataRef.current;

      // Line detection — React re-render only when line changes
      const newIdx = lyr ? lyr.reduce((b, l, i) => l.time <= t ? i : b, -1) : -1;

      // Backward seek / restart (e.g. "previous" restarting the current song): time jumped
      // back >1s. videoId is unchanged so the song-change reset doesn't fire — handle it here.
      // Landing before the first line snaps to the top; landing on a line lets the centring
      // effect treat it as a jump (instant). A normal forward mid-song gap is unaffected.
      if (t < prevTRef.current - 1) {
        lastCenteredIdxRef.current = -1;
        if (newIdx < 0) {
          // Glide back to the top instead of a hard cut.
          scrollTargetRef.current = 0;
          scrollHistRef.current = [];
          if (!fluidLyricsRef.current) containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          // Fluid: leave scrollPos/velocity so the spring glides smoothly to the new target.
        }
      }
      prevTRef.current = t;

      // Gap detection: if gap between line's endTime and next line's start > 3s, deactivate at endTime
      let displayIdx = newIdx;
      if (newIdx >= 0 && lyr) {
        const line = lyr[newIdx];
        if (line.endTime != null) {
          const nextStart = lyr[newIdx + 1]?.time ?? Infinity;
          if (nextStart - line.endTime > 3 && t >= line.endTime) displayIdx = -1;
        }
      }

      if (displayIdx !== lastIdxRef.current) {
        const prevIdx = lastIdxRef.current;
        // If the previous line's endTime hasn't been reached yet, keep it visible as
        // a "trailing" line so it finishes naturally while the new line is already active.
        const newTrailing =
          prevIdx >= 0 && lyr?.[prevIdx]?.endTime != null && t < lyr[prevIdx].endTime
            ? prevIdx : -1;
        if (newTrailing !== trailingIdxRef.current) {
          trailingIdxRef.current = newTrailing;
          setTrailingIdx(newTrailing);
          // Reset trailing word tracking so the new trailing line gets a full repaint
          trailWordElsRef.current = [];
          activeTrailWordIdxRef.current = -1;
          activeTrailWordIdxRef.bgCurrent = -1;
        }
        lastIdxRef.current = displayIdx;
        activeWordIdxRef.current = -1;
        activeWordIdxRef.bgCurrent = -1;
        activeWordMaxRef.current = -1; // reset zoom dedupe for the new active line
        wordElsRef.current = [];    // cleared until useLayoutEffect repopulates after render
        bgContainerRef.current = null; // clear so RAF doesn't update the old line's element
        setTick(n => n + 1);
      }

      // Expire trailing line once its endTime is reached
      if (trailingIdxRef.current >= 0) {
        const trailEnd = lyr?.[trailingIdxRef.current]?.endTime;
        if (trailEnd != null && t >= trailEnd) {
          trailingIdxRef.current = -1;
          setTrailingIdx(-1);
        }
      }

      // Gap indicator: true only when a line has played but we're between lines (gap > 3s)
      const isGap = newIdx >= 0 && displayIdx === -1;
      if (isGap !== inGapRef.current) {
        inGapRef.current = isGap;
        setInGap(isGap);
      }

      // Instrumental segment: no active line and the next vocal is still ≥ INSTR_LEAD away
      // (covers a long intro, mid-song breaks, and the outro). Synced lyrics only — plain
      // lyrics have time -1 and never resolve to displayIdx -1.
      let inst = false;
      if (displayIdx === -1 && lyr && lyr.length) {
        let nextStart = Infinity;
        for (let i = 0; i < lyr.length; i++) { if (lyr[i].time > t) { nextStart = lyr[i].time; break; } }
        if (nextStart - t > 2) inst = true; // 2s lead so vocals are back before the cover clears
      }
      if (inst !== instVizRef.current) {
        instVizRef.current = inst;
        onInstChangeRef.current?.(inst);
      }

      // Word highlighting — direct DOM, bypasses React entirely.
      // ACTIVE line animates from newIdx. The TRAILING line (handed over before its
      // endTime) keeps animating in parallel so it finishes its syllable wipe instead
      // of snapping fully white. Both run through the same paintLineWords routine.
      const lyrLine = lyr?.[newIdx];
      // Zoom enabled only when the setting is on (pass null to disable per-syllable pop).
      paintLineWords(lyrLine, wordElsRef.current, activeWordIdxRef, t, syllableZoomRef.current ? activeWordMaxRef : null, fluidLyricsRef.current);
      if (trailingIdxRef.current >= 0) {
        // Trailing line: no zoom (null) — it only finishes its wipe quietly.
        paintLineWords(lyr?.[trailingIdxRef.current], trailWordElsRef.current, activeTrailWordIdxRef, t, null, fluidLyricsRef.current);
      }

      // BG vocals: fade in container independently based on bg-vocals' own start time
      if (bgContainerRef.current && lyrLine?.bgWords?.length) {
        const bgStart = lyrLine.bgWords.find(w => !w.isSpace)?.time;
        if (bgStart != null) {
          const bgActive = t >= bgStart;
          bgContainerRef.current.style.opacity = bgActive ? "1" : "0.35";
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // After React renders, cache word span elements and bg-vocals container for the active line
  useLayoutEffect(() => {
    const idx = lastIdxRef.current;
    if (idx >= 0) {
      const lineEl = document.querySelector(`[data-lyric-idx="${idx}"]`);
      wordElsRef.current = lineEl
        ? Array.from(lineEl.querySelectorAll("[data-word-bright]"))
        : [];
      bgContainerRef.current = lineEl
        ? lineEl.querySelector("[data-bg-container]")
        : null;
    } else {
      wordElsRef.current = [];
      bgContainerRef.current = null;
    }
    // Trailing line: cache its word spans and paint them immediately so already-sung
    // syllables stay bright (no 1-frame dim flash) while the line finishes its wipe.
    const tIdx = trailingIdxRef.current;
    if (tIdx >= 0) {
      const trailEl = document.querySelector(`[data-lyric-idx="${tIdx}"]`);
      trailWordElsRef.current = trailEl
        ? Array.from(trailEl.querySelectorAll("[data-word-bright]"))
        : [];
      activeTrailWordIdxRef.current = -1;
      activeTrailWordIdxRef.bgCurrent = -1;
      const { ct, pt, playing } = audioSnapRef.current;
      const tNow = playing ? ct + (performance.now() - pt) / 1000 : ct;
      paintLineWords(lyricsDataRef.current?.[tIdx], trailWordElsRef.current, activeTrailWordIdxRef, tNow, null, fluidLyricsRef.current);
    } else {
      trailWordElsRef.current = [];
    }
  }, [tick, trailingIdx]);

  // Sync isCustomLyrics to parent
  useEffect(() => { onCustomLyricsStatusChange?.(isCustomLyrics); }, [isCustomLyrics]); // eslint-disable-line react-hooks/exhaustive-deps

  // Import lyrics: open file dialog, read content, POST to backend
  const importCustomLyrics = async () => {
    if (!track?.videoId) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ filters: [{ name: "Lyrics", extensions: ["lrc", "ttml"] }], title: "Lyrics importieren" });
      if (!path) return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const content = await readTextFile(path);
      const fmt = path.toLowerCase().endsWith(".ttml") ? "ttml" : "lrc";
      const r = await fetch(`${API}/lyrics/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: track.videoId, content, format: fmt }),
      });
      if (!r.ok) throw new Error("Speichern fehlgeschlagen");
      const parsed = fmt === "ttml" ? parseTtml(content) : parseLrc(content);
      setLyrics(parsed.length ? parsed : null);
      setSource("Custom");
      onSourceChange?.("Custom");
      setIsCustomLyrics(true);
      setLoading(false);
      onAddToast?.("Lyrics importiert", "success");
    } catch (e) {
      onAddToast?.("Import fehlgeschlagen", "error");
      console.error(e);
    }
  };

  // Remove custom lyrics
  const removeCustomLyrics = async () => {
    if (!track?.videoId) return;
    try {
      await fetch(`${API}/lyrics/custom/${track.videoId}`, { method: "DELETE" });
    } catch {}
    setIsCustomLyrics(false);
    setLyrics(null);
    setSource("");
    onSourceChange?.("");
    setLoading(true);
    // Trigger a fresh provider fetch by bumping a local key
    setCustomLyricsKey(k => k + 1);
  };

  // Expose functions via refs for parent
  useEffect(() => {
    if (importLyricsRef) importLyricsRef.current = importCustomLyrics;
    if (removeCustomLyricsRef) removeCustomLyricsRef.current = removeCustomLyrics;
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!track) return;
    setLoading(true);
    setLyrics(null);
    setIsCustomLyrics(false);

    const cacheKey = `kiyoshi-lyrics-${track.videoId}`;

    // Check for custom lyrics first
    fetch(`${API}/lyrics/custom/${track.videoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.content) {
          const parsed = data.format === "ttml" ? parseTtml(data.content) : parseLrc(data.content);
          if (parsed.length) {
            setLyrics(parsed);
            setSource("Custom");
            onSourceChange?.("Custom");
            setIsCustomLyrics(true);
            setLoading(false);
            return;
          }
        }
        // No custom lyrics — proceed with normal fetch
        continueWithProviders();
      })
      .catch(() => continueWithProviders());

    function continueWithProviders() {
    // Forced provider: skip cache, fetch only that one provider
    if (forcedProvider) {
      const singleProviders = DEFAULT_LYRICS_PROVIDERS.map(p => ({ ...p, enabled: p.id === forcedProvider }));
      fetchLyrics(track.title, track.artists, track.album, parseDurationToSeconds(track.duration), singleProviders, track.videoId || "").then(res => {
        if (res?.lrc) { setLyrics(res.lrc); setSource(res.source); setSubmitterName(res.submitterName || null); setAppliedVersionId(null); onSourceChange?.(res.source); }
        else { setLyrics(null); setSubmitterName(null); onSourceChange?.(""); onProviderFailed?.(forcedProvider); }
        setLoading(false);
      });
      return;
    }

    // Check localStorage cache first (keyed by videoId), skip if refetching
    if (refetchKey === 0) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const { lrc, source, submitterName: cachedSubmitter } = parsed;
          // Invalidate old Unison cache entries that predate submitterName support
          if (source === "Unison" && !("submitterName" in parsed)) {
            localStorage.removeItem(cacheKey);
            throw new Error("stale");
          }
          setLyrics(lrc);
          setSource(source);
          setSubmitterName(cachedSubmitter || null);
          setAppliedVersionId(parsed.versionId ?? null);
          onSourceChange?.(source);
          setLoading(false);
          if (Array.isArray(parsed.failedIds)) {
            // Already have availability info — use immediately
            parsed.failedIds.forEach(id => onProviderFailed?.(id));
          } else {
            // Old cache entry — check availability silently in background
            fetchLyrics(track.title, track.artists, track.album, parseDurationToSeconds(track.duration), providers, track.videoId || "").then(res => {
              const ids = res?.failedIds || [];
              ids.forEach(id => onProviderFailed?.(id));
              try { localStorage.setItem(cacheKey, JSON.stringify({ lrc, source, submitterName: cachedSubmitter || null, failedIds: ids })); } catch {}
            });
          }
          return;
        }
      } catch {}
    } else {
      // Clear stale cache before refetching
      try { localStorage.removeItem(cacheKey); } catch {}
    }

    fetchLyrics(track.title, track.artists, track.album, parseDurationToSeconds(track.duration), providers, track.videoId || "").then(res => {
      if (res?.lrc) {
        setLyrics(res.lrc);
        setSource(res.source);
        setSubmitterName(res.submitterName || null);
        setAppliedVersionId(null);
        onSourceChange?.(res.source);
        try { localStorage.setItem(cacheKey, JSON.stringify({ lrc: res.lrc, source: res.source, submitterName: res.submitterName || null, failedIds: res.failedIds || [] })); } catch {}
      }
      // Mark providers that were tried but failed
      res?.failedIds?.forEach(id => onProviderFailed?.(id));
      setLoading(false);
    });
    } // end continueWithProviders
  }, [track, refetchKey, forcedProvider, customLyricsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeIdx = lastIdxRef.current;

  // Unique agents in order of first appearance (only when ≥2 distinct named agents)
  const lyricsAgents = useMemo(() => {
    if (!lyrics) return [];
    const seen = new Set();
    const result = [];
    for (const line of lyrics) {
      const key = line.agent?.id || line.agent?.name;
      if (key && line.agent.name && !seen.has(key)) {
        seen.add(key);
        result.push(line.agent);
      }
    }
    return result;
  }, [lyrics]);

  const activeAgent = lyrics?.[activeIdx]?.agent;

  // Centre the active line. Fluid mode drives scrollTop with a critically-damped spring
  // (SmoothDamp) — soft, no overshoot, and velocity-continuous so rapid line changes carry
  // their momentum (organic Apple-Music glide); otherwise the browser's native smooth scroll.
  const scrollTargetRef = useRef(0);
  const scrollPosRef = useRef(0);
  const scrollVelRef = useRef(0);
  const scrollLastTimeRef = useRef(0);
  const userScrollUntilRef = useRef(0);
  const scrollHistRef = useRef([]); // recent {t,s} scroll positions for the staggered drift
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx; // read live in the scroll rAF (which doesn't re-run per line)
  const lastCenteredIdxRef = useRef(-1); // last line we centred on — used to detect jumps

  // On song change, snap back to the top and reset the spring state — otherwise the new
  // lyrics inherit the previous song's scroll offset until the first active line appears.
  // Also neutralise the time snapshot + last index: when the new track's lyrics are cached
  // they render instantly, and a stale (advanced) time from the previous song would
  // otherwise resolve to a mid-song line and scroll there before the real time arrives.
  useEffect(() => {
    const c = containerRef.current;
    if (c) c.scrollTop = 0;
    scrollPosRef.current = 0;
    scrollTargetRef.current = 0;
    scrollVelRef.current = 0;
    scrollHistRef.current = [];
    userScrollUntilRef.current = 0;
    lastIdxRef.current = -1;
    lastCenteredIdxRef.current = -1;
    prevTRef.current = 0;
    // Reset to t=0 (new track) but keep the prior playing state so the interpolated time keeps
    // advancing instead of freezing at 0 until the next audio event corrects it.
    audioSnapRef.current = { ct: 0, pt: performance.now(), playing: audioSnapRef.current.playing };
    instVizRef.current = false;
    onInstChangeRef.current?.(false);
  }, [track?.videoId]);

  useEffect(() => {
    if (activeIdx < 0 || !containerRef.current) return;
    const container = containerRef.current;
    // Fluid wraps each line in a will-change:transform div (its own offsetParent), so the
    // inner [data-lyric] offsetTop is ~0 — measure the wrapper for positioning instead.
    const sel = fluidLyrics ? "[data-lyricdrift]" : "[data-lyric]";
    const measure = () => {
      const activeEl = container.querySelectorAll(sel)[activeIdx];
      if (!activeEl) return null;
      return Math.max(0, activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2);
    };
    let target = measure();
    if (target == null) return;
    // A jump (song change, seek, or skipping >1 line) snaps instantly so it lands centred;
    // sequential line advances scroll smoothly. lastCenteredIdxRef is -1 right after a reset.
    const prev = lastCenteredIdxRef.current;
    const jump = prev < 0 || Math.abs(activeIdx - prev) > 1;
    lastCenteredIdxRef.current = activeIdx;
    if (!fluidLyrics) {
      container.scrollTo({ top: target, behavior: jump ? "auto" : "smooth" });
    } else {
      scrollTargetRef.current = target;
      if (jump) { scrollPosRef.current = target; scrollVelRef.current = 0; container.scrollTop = target; }
    }
    // On a jump the new lyrics/line may still be settling (fonts, translations, wrapping) —
    // re-measure on the next frame and correct so it lands exactly centred.
    if (jump) {
      requestAnimationFrame(() => {
        if (!containerRef.current || activeIdxRef.current !== activeIdx) return;
        const t2 = measure();
        if (t2 == null || Math.abs(t2 - target) < 1) return;
        if (!fluidLyrics) container.scrollTo({ top: t2, behavior: "auto" });
        else { scrollTargetRef.current = t2; scrollPosRef.current = t2; scrollVelRef.current = 0; container.scrollTop = t2; }
      });
    }
  }, [activeIdx, fluidLyrics]);

  useEffect(() => {
    if (!fluidLyrics) return;
    const container = containerRef.current;
    if (!container) return;
    scrollPosRef.current = container.scrollTop;
    scrollVelRef.current = 0;
    scrollLastTimeRef.current = performance.now();
    scrollHistRef.current = [];
    const wraps = container.querySelectorAll("[data-lyricdrift]");
    let raf = 0;
    const onUserScroll = () => {
      userScrollUntilRef.current = performance.now() + 2000;
      scrollPosRef.current = container.scrollTop;
      scrollVelRef.current = 0;
    };
    container.addEventListener("wheel", onUserScroll, { passive: true });
    container.addEventListener("touchmove", onUserScroll, { passive: true });

    // Spring from the Apple-Music video analysis: stiffness 120 / damping 20 / mass 1
    // (damping ratio ~0.91 → <1% overshoot, ~650ms settle). Velocity-continuous.
    const K = 120, C = 20, STAGGER = 0.05; // s of lag per line of distance (elastic chain)
    const histAt = (hist, t) => {
      if (hist.length === 0) return scrollPosRef.current;
      if (t <= hist[0].t) return hist[0].s;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].t <= t) {
          const a = hist[i], b = hist[i + 1] || a;
          return b.t === a.t ? a.s : a.s + (b.s - a.s) * ((t - a.t) / (b.t - a.t));
        }
      }
      return hist[hist.length - 1].s;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - scrollLastTimeRef.current) / 1000, 0.04);
      scrollLastTimeRef.current = now;

      if (now < userScrollUntilRef.current) {
        scrollPosRef.current = container.scrollTop;
      } else {
        const target = scrollTargetRef.current;
        let p = scrollPosRef.current, v = scrollVelRef.current;
        const steps = Math.max(1, Math.ceil(dt / 0.008)); // sub-step for stability
        const h = dt / steps;
        for (let s = 0; s < steps; s++) {
          v += (-K * (p - target) - C * v) * h;
          p += v * h;
        }
        if (Math.abs(p - target) < 0.15 && Math.abs(v) < 0.5) { p = target; v = 0; }
        scrollPosRef.current = p;
        scrollVelRef.current = v;
        container.scrollTop = p;
      }

      // Scroll-position history (for the staggered drift lookup).
      const hist = scrollHistRef.current;
      hist.push({ t: now, s: scrollPosRef.current });
      while (hist.length > 2 && hist[0].t < now - 600) hist.shift();

      // Staggered positional drift ("rubber-band" chain): each line is shifted to the scroll
      // position from (distance × STAGGER) ago → it lags behind and catches up elastically.
      const ai = activeIdxRef.current;
      const cur = scrollPosRef.current;
      for (let n = 0; n < wraps.length; n++) {
        const dist = Math.abs(n - ai);
        if (dist === 0) { if (wraps[n].style.transform) wraps[n].style.transform = ""; continue; }
        const drift = Math.max(-34, Math.min(34, cur - histAt(hist, now - Math.min(dist, 8) * STAGGER * 1000)));
        wraps[n].style.transform = Math.abs(drift) > 0.1 ? `translateY(${drift.toFixed(2)}px)` : "";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("wheel", onUserScroll);
      container.removeEventListener("touchmove", onUserScroll);
      wraps.forEach(w => { w.style.transform = ""; });
    };
  }, [fluidLyrics, lyrics]);

  return (
    <div
      onMouseMove={wakeScrollbar} onWheel={wakeScrollbar} onMouseLeave={sleepScrollbar}
      style={{
      position: "absolute", inset: 0, zIndex: 50,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>

      {/* Fluid: a strong blurred + saturated album cover as the backdrop (Apple-style),
          replacing the ambient blobs. Darkened so the white lyrics stay high-contrast. */}
      {fluidLyrics && !ambientBackground && track?.thumbnail && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden",
          }}
        >
          <div style={{
            position: "absolute", inset: "-12%",
            backgroundImage: `url(${thumb(track.thumbnail)})`,
            backgroundSize: "cover", backgroundPosition: "center",
            filter: "blur(90px) saturate(1.4) brightness(0.5)",
            transform: "scale(1.25)",
          }} />
        </div>
      )}
      {/* Ambient colour blobs — wrapped in an isolated layer so their mix-blend-mode
          stays contained and doesn't flatten the backdrop for the chips' backdrop-filter. */}
      {ambientVisualizer && !fluidLyrics && !ambientBackground && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", isolation: "isolate" }}>
          <div style={{
            position: "absolute", inset: "-30%", pointerEvents: "none",
            background: "radial-gradient(ellipse 38% 30% at 44% 42%, var(--accent) 0%, transparent 70%)",
            mixBlendMode: "screen",
            animation: "blobDrift1 18s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", inset: "-30%", pointerEvents: "none",
            background: "radial-gradient(ellipse 32% 38% at 63% 61%, #7b2ff7 0%, transparent 68%)",
            mixBlendMode: "screen",
            animation: "blobDrift2 23s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", inset: "-30%", pointerEvents: "none",
            background: "radial-gradient(ellipse 44% 36% at 52% 46%, #1565c0 0%, transparent 65%)",
            mixBlendMode: "screen",
            animation: "blobDrift3 29s ease-in-out infinite",
          }} />
        </div>
      )}

      {/* Source badge — HeroUI Chip, glassy. Auto-hides with a slide-out like the
          scrollbar: revealed on cursor activity, slides off-right after idle. */}
      <div style={{
        position: "absolute", bottom: 12 + chipBottomLift, right: 16, zIndex: 2, display: "flex", alignItems: "center", gap: 6,
        transform: scrollActive ? "translateX(0)" : "translateX(calc(100% + 16px))",
        opacity: scrollActive ? 1 : 0,
        transition: "transform 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.32s ease, bottom 0.4s ease",
        pointerEvents: scrollActive ? "auto" : "none",
      }}>
        {source && (
          <button onClick={() => setBrowserOpen(true)} title={translate(language, "browseLyrics")}
            className="border-0 bg-transparent p-0 cursor-default">
            <ChipRoot size="sm" className="border-0! px-3.5! py-1.5! transition-all duration-200 hover:brightness-125"
              style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}>
              <ChipLabel className="font-semibold tracking-wide flex items-center gap-1.5" style={{ fontSize: "var(--t10)" }}>
                {source}
                {submitterName && <span style={{ opacity: 0.55 }}> · {submitterName}</span>}
                <CaretDown size={9} weight="bold" style={{ opacity: 0.6 }} />
              </ChipLabel>
            </ChipRoot>
          </button>
        )}
      </div>

      {browserOpen && (
        <LyricsBrowserModal
          track={track}
          providers={providers}
          currentSource={source}
          currentSubmitter={submitterName}
          currentVersionId={appliedVersionId}
          onApply={applyLyricsVersion}
          onClose={() => setBrowserOpen(false)}
        />
      )}

      {/* Agent tags — bottom center, only when ≥2 named agents and toggle is on */}
      {showAgentTags && lyricsAgents.length >= 2 && (
        <div style={{
          position: "absolute", bottom: 14 + chipBottomLift, left: "50%", transform: "translateX(-50%)",
          zIndex: 2, display: "flex", gap: 8, pointerEvents: "none",
          transition: "bottom 0.4s ease",
        }}>
          {lyricsAgents.map(agent => {
            const key = agent.id || agent.name;
            const isActive = (activeAgent?.id || activeAgent?.name) === key;
            return (
              <ChipRoot key={key} size="sm"
                className="border-0! uppercase font-bold whitespace-nowrap px-3.5! py-1.5! transition-all duration-300"
                style={{
                  background: isActive ? "color-mix(in srgb, var(--accent) 40%, transparent)" : "rgba(255,255,255,0.08)",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  boxShadow: isActive ? "0 2px 16px color-mix(in srgb, var(--accent) 32%, transparent)" : "none",
                }}>
                <ChipLabel style={{ fontSize: 10, letterSpacing: "0.07em" }}>{agent.name}</ChipLabel>
              </ChipRoot>
            );
          })}
        </div>
      )}

      {/* Lyrics */}
      <div ref={containerRef} className="lyrics-scroll" data-scroll-active={scrollActive ? "true" : "false"}
        style={{
          position: "relative", zIndex: 1, flex: 1,
          overflowY: "auto", padding: "40vh 80px 40vh",
          // Fluid: soft top/bottom edge-fade so lines dissolve instead of hard-clipping.
          ...(fluidLyrics ? {
            maskImage: "linear-gradient(to bottom, transparent 0, #000 110px, #000 calc(100% - 110px), transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 110px, #000 calc(100% - 110px), transparent 100%)",
          } : {}),
        }}>
        {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 60 }}>{t("lyricsLoading")}</div>}
        {!loading && !lyrics && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginTop: 60 }}>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "var(--t14)" }}>{t("noLyrics")}</div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "var(--t12)" }}>{t("noLyricsHint")}</div>
            <div style={{ display: "flex", gap: 10 }}>
              {/* Akari's LRC Maker */}
              <button
                onClick={() => openUrl("https://lrc-maker.github.io").catch(console.error)}
                style={{
                  background: "rgba(255,255,255,0.08)", border: "none",
                  borderRadius: 10, padding: "8px 16px", cursor: "default",
                  color: "#fff", fontSize: "var(--t13)", fontFamily: "var(--font)",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.16)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              >
                <img src="/Akari's LRC Icon.svg" style={{ width: 26, height: 26 }} alt="" />
                {"Akari's LRC Maker"}
              </button>
              {/* Boidu's Composer — embedded in a Kodama window */}
              <button
                onClick={() => openComposer(track?.videoId).catch(console.error)}
                style={{
                  background: "rgba(255,255,255,0.08)", border: "none",
                  borderRadius: 10, padding: "8px 16px", cursor: "default",
                  color: "#fff", fontSize: "var(--t13)", fontFamily: "var(--font)",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.16)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              >
                <img src="/Boidu Composer Icon.svg" style={{ width: 26, height: 26 }} alt="" />
                {"Boidu's Composer"}
              </button>
            </div>
            <button
              onClick={importCustomLyrics}
              style={{
                background: "rgba(255,255,255,0.06)", border: "none",
                borderRadius: 10, padding: "8px 20px", cursor: "default",
                color: "#fff", fontSize: "var(--t13)", fontFamily: "var(--font)",
                display: "flex", alignItems: "center", gap: 8,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            >
              <UploadSimple size={14} />
              {t("importLyrics")}
            </button>
          </div>
        )}
        {lyrics && lyrics.map((line, i) => {
          const isActive   = i === activeIdx;
          const isTrailing = i === trailingIdx; // previous line still playing while new one is active
          const isPast     = i < activeIdx && !isTrailing;
          const isFuture   = !isActive && !isTrailing && !isPast;

          const lineText = line.wordSync
            ? (line.words || []).map(w => w.text).join("")
            : (line.text || "\u00A0");

          // Trailing line looks identical to the active line — full opacity, no blur.
          // The existing CSS transition (0.4s) will carry it smoothly into the past
          // style once trailingIdx clears when endTime is reached.
          let blur, opacity;
          if (isActive || isTrailing) { blur = 0;   opacity = 1; }
          else if (isPast)            { blur = 3;   opacity = 0.4; }
          else                        { blur = 0;   opacity = 0.35; }
          // Fluid: upcoming (future) lines sit darker than already-sung ones.
          if (fluidLyrics && isFuture) opacity = 0.22;

          const seekable = line.time >= 0;
          const agentRole = line.agentRole; // "lead", "featured", "group", or null
          const textAlign = agentRole === "featured" ? "right" : agentRole === "group" ? "center" : "left";
          // Trailing spaces in the word list would sit at the right edge and push a
          // right-aligned active line visually left. Drop them so it stays flush-right.
          let renderWords = line.words || [];
          { let n = renderWords.length; while (n > 0 && renderWords[n - 1].isSpace) n--; renderWords = renderWords.slice(0, n); }
          const lineNode = (
            <div
              key={i}
              data-lyric="true"
              data-lyric-idx={i}
              onClick={seekable ? () => { audioRef.current.currentTime = line.time; } : undefined}
              onMouseEnter={seekable ? e => { e.currentTarget.style.opacity = Math.min(1, opacity + 0.25); } : undefined}
              onMouseLeave={seekable ? e => { e.currentTarget.style.opacity = opacity; } : undefined}
              style={{
                fontSize: fontSize,
                fontWeight: 700,
                lineHeight: 1.5,
                marginBottom: 24,
                cursor: "default",
                filter: `blur(${blur}px)`,
                opacity,
                transform: fluidLyrics ? `scale(${isActive || isTrailing ? 1.06 : 1})` : undefined,
                transformOrigin: textAlign === "right" ? "right center" : textAlign === "center" ? "center center" : "left center",
                transition: fluidLyrics
                  ? "transform 0.25s ease-out, opacity 0.4s ease-out, filter 0.4s ease-out"
                  : "filter 0.4s ease, opacity 0.4s ease",
                userSelect: "none",
                borderRadius: 8,
                padding: "2px 8px",
                margin: "0 -8px 24px",
                textAlign,
              }}
            >
              {(isActive || isTrailing) && line.wordSync ? (
                <span style={{ whiteSpace: "pre-wrap" }}>
                  {renderWords.map((word, wi) =>
                    word.isSpace
                      ? <span key={wi}>{word.text}</span>
                      : <span key={wi} style={{ position: "relative", display: "inline-block" }}>
                          <span style={{ color: "rgba(255,255,255,0.25)" }}>{word.text}</span>
                          <span
                            data-word-bright="true"
                            style={{
                              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                              color: "white",
                              opacity: 0,
                              WebkitMaskImage: "linear-gradient(to right, black -6px, transparent 6px)",
                              maskImage: "linear-gradient(to right, black -6px, transparent 6px)",
                              pointerEvents: "none",
                            }}
                          >{word.text}</span>
                        </span>
                  )}
                </span>
              ) : (
                <span style={{ color: "#fff" }}>{lineText}</span>
              )}
              {/* Background vocals — rendered in smaller text below the main line.
                  Initial opacity when isActive: 0.35 (dim). RAF loop sets it to 1
                  only when t >= bgWords[0].time so it activates independently. */}
              {line.bgWords?.length > 0 && (
                <div
                  data-bg-container="true"
                  style={{
                    fontSize: "0.68em", fontWeight: 600, marginTop: 3, lineHeight: 1.4,
                    opacity: isActive ? 0.35 : 0.9,
                    transition: "opacity 0.3s ease",
                  }}
                >
                  {(isActive || isTrailing) ? (
                    <span style={{ whiteSpace: "pre-wrap" }}>
                      {line.bgWords.map((word, wi) =>
                        word.isSpace
                          ? <span key={wi}>{word.text}</span>
                          : <span key={wi} style={{ position: "relative", display: "inline-block" }}>
                              <span style={{ color: "rgba(255,255,255,0.25)" }}>{word.text}</span>
                              <span
                                data-word-bright="true"
                                style={{
                                  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                  color: "white",
                                  opacity: 0,
                                  WebkitMaskImage: "linear-gradient(to right, black -6px, transparent 6px)",
                                  maskImage: "linear-gradient(to right, black -6px, transparent 6px)",
                                  pointerEvents: "none",
                                }}
                              >{word.text}</span>
                            </span>
                      )}
                    </span>
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.55)" }}>{line.bgWords.map(w => w.text).join("")}</span>
                  )}
                </div>
              )}
              {line.bgText && (
                <div style={{ fontSize: "0.68em", fontWeight: 600, marginTop: 3, lineHeight: 1.4, opacity: isActive ? 0.35 : 0.9, color: "#fff" }}>
                  {line.bgText}
                </div>
              )}
              {showRomaji && romajiLines?.[i] && (
                <div style={{
                  fontSize: romajiFontSize,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.55)",
                  opacity: isActive ? 1 : 0.6,
                  marginTop: 4,
                  lineHeight: 1.4,
                  textAlign,
                }}>{romajiLines[i]}</div>
              )}
              {showTranslation && translations?.[i] && translations[i] !== lineText && (
                <div style={{
                  fontSize: translationFontSize,
                  fontWeight: 600,
                  color: "var(--accent)",
                  opacity: isActive ? 0.9 : 0.45,
                  marginTop: 6,
                  lineHeight: 1.4,
                  textAlign,
                }}>{translations[i]}</div>
              )}
            </div>
          );
          // Fluid mode wraps each line so the rAF scroll loop can drive a per-line
          // positional drift (translateY) on the wrapper while the line's own scale stays
          // a CSS transition on the inner node (separate elements → no transform clash).
          return fluidLyrics
            ? <div key={i} data-lyricdrift="true" style={{ willChange: "transform" }}>{lineNode}</div>
            : lineNode;
        })}
      </div>
    </div>
  );
}

function GridCard({ thumbnail, title, subtitle, onClick, onContextMenu }) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="grid-card cursor-default overflow-hidden rounded-[14px] bg-surface shadow-[0_2px_10px_rgba(0,0,0,0.3)] transition-[transform,box-shadow] duration-200 hover:scale-[1.03] hover:shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
    >
      {/* Thumbnail */}
      <div className="w-full aspect-square overflow-hidden bg-elevated">
        {thumbnail
          ? <img src={thumb(thumbnail)} alt="" className="block w-full h-full object-cover" />
          : <div className="w-full h-full bg-[linear-gradient(135deg,#2a1535,#1a0a25)]" />}
      </div>
      {/* Info footer */}
      <div className="grid-card-footer min-h-[52px] px-[14px] pt-3 pb-[14px] bg-[rgb(10,10,12)]">
        <div className="text-t13 font-semibold text-white truncate">{title}</div>
        <div className="text-t11 text-muted mt-1 min-h-[14px] truncate">{subtitle || ""}</div>
      </div>
    </div>
  );
}

function LibraryView({ onPlay, currentTrack, isPlaying, onOpenPlaylist, onOpenAlbum, onOpenArtist, onContextMenu }) {
  const [tab, setTab] = useState("playlists");
  const [playlists, setPlaylists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortOrder, setSortOrder] = useState("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const t = useLang();

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  useEffect(() => { setSearchQuery(""); setSearchOpen(false); }, [tab]);

  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1);
    window.addEventListener("kiyoshi-library-updated", handler);
    return () => window.removeEventListener("kiyoshi-library-updated", handler);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const endpoints = {
      playlists: `${API}/library/playlists`,
      albums: `${API}/library/albums`,
      artists: `${API}/library/artists`,
    };
    fetch(endpoints[tab])
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        if (tab === "playlists") setPlaylists(d.playlists || []);
        if (tab === "albums") setAlbums(d.albums || []);
        if (tab === "artists") setArtists(d.artists || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, refreshKey]);

  const tabs = [
    { id: "playlists", label: t("filterPlaylists"), icon: <Playlist size={14} /> },
    { id: "albums",    label: t("filterAlbums"),    icon: <VinylRecord size={14} /> },
    { id: "artists",   label: t("filterArtists"),   icon: <Microphone size={14} /> },
  ];

  const rawItems = tab === "playlists" ? playlists : tab === "albums" ? albums : artists;

  const items = [...rawItems].sort((a, b) => {
    const nameA = (tab === "artists" ? a.artist : a.title) || "";
    const nameB = (tab === "artists" ? b.artist : b.title) || "";
    if (sortOrder === "az") return nameA.localeCompare(nameB);
    if (sortOrder === "za") return nameB.localeCompare(nameA);
    if (sortOrder === "artist") return (a.artists || "").localeCompare(b.artists || "");
    if (sortOrder === "year_desc") return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
    if (sortOrder === "year_asc")  return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);
    return 0; // "default" — keep API order
  }).filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (tab === "artists") return (item.artist || "").toLowerCase().includes(q);
    return (item.title || "").toLowerCase().includes(q) || (item.artists || "").toLowerCase().includes(q);
  });

  const sortOptions = [
    { value: "default",   label: t("sortDefault") },
    { value: "az",        label: t("sortAlphaAZ") },
    { value: "za",        label: t("sortAlphaZA") },
    ...(tab === "albums" ? [
      { value: "artist",    label: t("sortByArtist") },
      { value: "year_desc", label: t("sortByYearDesc") },
      { value: "year_asc",  label: t("sortByYearAsc") },
    ] : []),
  ];

  return (
    <div style={{ padding: "24px 24px 0" }}>
      {/* Header row: title left, tabs centered */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", marginBottom: 12, height: 36 }}>
        <div style={{ fontSize: "var(--t22)", fontWeight: 600 }}>{t("library")}</div>
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4 }}>
          {tabs.map(tab_ => (
            <button key={tab_.id} onClick={() => { setTab(tab_.id); setSortOrder("default"); }}
              className={`view-tab-btn${tab === tab_.id ? " active" : ""}`}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: tab === tab_.id ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "transparent",
                color: tab === tab_.id ? "var(--accent)" : "var(--text-secondary)",
                border: "none", borderRadius: 8, padding: "7px 14px",
                fontSize: "var(--t13)", cursor: "default", fontFamily: "var(--font)",
                transition: "all 0.15s", fontWeight: tab === tab_.id ? 600 : 400,
              }}>{tab_.icon}{tab_.label}</button>
          ))}
        </div>
      </div>

      {/* Sort + search row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        <Sliders size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        {sortOptions.map(o => (
          <button
            key={o.value}
            onClick={() => setSortOrder(o.value)}
            style={{
              background: sortOrder === o.value ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "none",
              border: "none", borderRadius: 6, padding: "3px 9px",
              fontSize: "var(--t12)", fontFamily: "var(--font)",
              color: sortOrder === o.value ? "var(--accent)" : "var(--text-muted)",
              fontWeight: sortOrder === o.value ? 600 : 400,
              cursor: "default", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (sortOrder !== o.value) e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={e => { if (sortOrder !== o.value) e.currentTarget.style.color = "var(--text-muted)"; }}
          >{o.label}</button>
        ))}
        {/* Search — right side */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: searchOpen ? 200 : 0, overflow: "hidden", transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") { setSearchQuery(""); setSearchOpen(false); } }}
              placeholder={t("search")}
              style={{
                background: "var(--bg-elevated)", border: "0.5px solid var(--border)",
                borderRadius: 20, padding: "5px 12px", fontSize: "var(--t12)",
                color: "var(--text-primary)", outline: "none",
                width: 200, fontFamily: "var(--font)",
              }}
            />
          </div>
          <button
            onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery(""); }}
            style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: searchOpen ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "var(--bg-elevated)",
              border: "0.5px solid var(--border)",
              color: searchOpen ? "var(--accent)" : "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "default", transition: "all 0.15s", padding: 0,
            }}
            onMouseEnter={e => { if (!searchOpen) e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { if (!searchOpen) e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <MagnifyingGlass size={13} />
          </button>
        </div>
      </div>

      {loading && <div style={{ color: "var(--text-secondary)" }}>{t("loadingDots")}</div>}
      {error && <div style={{ color: "#f44336" }}>{error}</div>}
      {!loading && !error && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: 16,
        }}>
          {items.map((item, i) => {
            if (tab === "playlists") return (
              <GridCard key={i}
                thumbnail={item.thumbnail}
                title={item.title}
                subtitle={item.count ? `${item.count} ${t("songs")}` : ""}
                onClick={() => onOpenPlaylist(item)}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, item) : undefined}
              />
            );
            if (tab === "albums") return (
              <GridCard key={i}
                thumbnail={item.thumbnail}
                title={item.title}
                subtitle={`${item.artists}${item.year ? ` · ${item.year}` : ""}`}
                onClick={() => onOpenAlbum(item)}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, { ...item, type: "album" }) : undefined}
              />
            );
            if (tab === "artists") return (
              <GridCard key={i}
                thumbnail={item.thumbnail}
                title={item.artist}
                subtitle={item.songs ? `${item.songs} ${t("songs")}` : ""}
                onClick={() => onOpenArtist(item)}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, { ...item, title: item.artist, type: "artist" }) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Extract dominant color from image via Canvas ──────────────────────────
function useAccentColor(imageUrl) {
  const [color, setColor] = useState("40,40,60");
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 50;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 50, 50);
        const d = ctx.getImageData(0, 0, 50, 50).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < d.length; i += 16) {
          r += d[i]; g += d[i+1]; b += d[i+2]; count++;
        }
        r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
        setColor(`${r},${g},${b}`);
      } catch {}
    };
    img.src = imageUrl;
  }, [imageUrl]);
  return color;
}

// ─── Shared table row for playlist/liked views ─────────────────────────────
function SelActionBtn({ icon, label, onClick, danger, iconOnly, horizontal }) {
  const [hov, setHov] = React.useState(false);
  const btn = (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        alignItems: "center", justifyContent: "center",
        gap: horizontal ? 8 : 6,
        padding: iconOnly ? "10px 14px" : horizontal ? "10px 18px" : "10px 20px",
        border: "none", borderRadius: 12,
        background: hov
          ? (danger ? "rgba(239,68,68,0.85)" : "rgba(255,255,255,0.10)")
          : "transparent",
        color: hov
          ? (danger ? "#fff" : "var(--text-primary)")
          : "var(--text-secondary)",
        cursor: "default",
        transition: "background 0.15s, color 0.15s",
        flexShrink: 0,
        fontFamily: "inherit",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      {!iconOnly && <span style={{ fontSize: horizontal ? "var(--t13)" : "var(--t11)", fontWeight: 500, whiteSpace: "nowrap", fontFamily: "inherit" }}>{label}</span>}
    </button>
  );
  return iconOnly ? <Tooltip text={label}>{btn}</Tooltip> : btn;
}

function TableRow({ track, index, isPlaying, onPlay, onOpenArtist, onOpenAlbum, isAlbum, onContextMenu, isCached, isDownloading, onDownload, isPremiumOnly, selected = false, onToggleSelect }) {
  const anim = useAnimations();
  const t = useLang();

  const gridCols = onToggleSelect
    ? (isAlbum ? "28px minmax(0,2fr) minmax(0,1fr) 28px 52px" : "28px minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px")
    : (isAlbum ? "minmax(0,2fr) minmax(0,1fr) 28px 52px" : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px");

  const row = (
    <div
      onClick={isPremiumOnly ? undefined : () => onPlay(track)}
      onContextMenu={(!isPremiumOnly && onContextMenu) ? (e) => { e.preventDefault(); onContextMenu(e, track); } : undefined}
      style={{ gridTemplateColumns: gridCols }}
      className={`group grid items-center gap-2 px-4 py-1 min-h-[52px] rounded-lg cursor-default transition-colors ${
        selected
          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
          : isPlaying
            ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
            : "hover:bg-hover"
      } ${isPremiumOnly ? "opacity-40" : ""}`}
    >
      {onToggleSelect && (
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect(); }}
          className={`flex items-center justify-center shrink-0 cursor-default transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          {selected
            ? <CheckCircle size={18} weight="fill" className="text-accent" />
            : <div className="w-4 h-4 rounded-full border-[1.5px] border-[var(--text-muted)] bg-elevated" />}
        </div>
      )}
      {/* Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-10 h-10 shrink-0 overflow-hidden rounded-md bg-elevated">
          {track.thumbnail
            ? <img src={thumb(track.thumbnail)} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-[linear-gradient(135deg,#2a1535,#1a0a25)]" />}
          {isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/50">
              {anim ? [1, 2, 3].map(b => (
                <div key={b} className="w-[3px] rounded-[2px] bg-accent" style={{ animation: `eqBar${b} ${0.6 + b * 0.15}s ease-in-out infinite`, animationDelay: `${b * 0.1}s` }} />
              )) : <Pause size={12} className="text-accent" />}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className={`flex items-center gap-1 overflow-hidden text-t13 font-medium ${isPlaying ? "text-accent" : "text-primary"}`}>
            <span className="truncate min-w-0">{track.title}</span>
            {track.isExplicit && <ExplicitBadge />}
          </div>
        </div>
      </div>
      {/* Artist */}
      <div className="text-t12 text-secondary truncate">
        <ArtistLinks track={track} onOpenArtist={onOpenArtist} />
        {(!track.artists || (Array.isArray(track.artists) && track.artists.length === 0)) && "—"}
      </div>
      {/* Album */}
      {!isAlbum && (
        <div
          onClick={e => { if (track.albumBrowseId && onOpenAlbum) { e.stopPropagation(); onOpenAlbum({ browseId: track.albumBrowseId, title: track.album }); }}}
          className="text-t12 text-secondary truncate cursor-default transition-colors hover:text-primary"
        >
          {track.album || "—"}
        </div>
      )}
      {/* Download */}
      <div className="flex justify-center"
        onClick={e => { e.stopPropagation(); if (!isPremiumOnly && onDownload && !isCached && !isDownloading) onDownload(track); }}
      >
        {isPremiumOnly ? (
          <Crown size={14} weight="fill" className="text-[#f0b429]" />
        ) : isCached ? (
          <CheckCircle size={14} className="text-[#4caf50]" />
        ) : isDownloading ? (
          <DownloadSimple size={14} className="text-accent animate-pulse" />
        ) : onDownload ? (
          <DownloadSimple size={14} className="text-muted cursor-default opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
      {/* Duration */}
      <div className="text-t12 text-muted text-right">
        {track.duration || "—"}
      </div>
    </div>
  );

  return isPremiumOnly
    ? <Tooltip text={t("premiumOnly")}>{row}</Tooltip>
    : row;
}

// ─── Shared playlist/collection layout ────────────────────────────────────
function PlaylistLayout({ title, thumbnail, tracks, total, loading, progress, cached, onPlay, currentTrack, isPlaying, onBack, isLiked, onOpenArtist, onOpenAlbum, isAlbum, albumArtists, albumArtistBrowseId, year, onRefresh, onTrackContextMenu, cachedSongIds, downloadingIds, premiumSongIds, onDownloadSong, onDownloadAll, onRemoveAll, hideExplicit, onToggleLike, likedIds, selectedTracks, onToggleSelect, onSelectAll, extraActions, typeLabel }) {
  const accentColor = useAccentColor(thumbnail);
  const t = useLang();
  const [trackSearch, setTrackSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (searchVisible) searchInputRef.current?.focus();
  }, [searchVisible]);

  const visibleTracks = tracks.filter(tr => {
    if (hideExplicit && tr.isExplicit) return false;
    if (trackSearch.trim()) {
      const q = trackSearch.toLowerCase();
      return (tr.title || "").toLowerCase().includes(q) || (tr.artists || "").toLowerCase().includes(q);
    }
    return true;
  });

  const totalDuration = formatTotalDuration(tracks);
  const skeletonCount = total ? Math.max(0, total - tracks.length) : 0;

  // ── List virtualization ─────────────────────────────────────────────────────
  // Only the visible rows are mounted (constant DOM regardless of list length).
  // The whole page scrolls (the list is NOT the scroll container), so we virtualize
  // against the nearest `.scrollable` ancestor and offset by the list's position in it.
  const listInnerRef = useRef(null);
  const [scrollEl, setScrollEl] = useState(null);
  const [listScrollMargin, setListScrollMargin] = useState(0);
  const [, bumpMeasure] = useState(0);

  useEffect(() => {
    const onResize = () => bumpMeasure(n => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Re-measure the list's offset within the scroll container every render (cheap, guarded);
  // catches header-height changes as tracks/metadata stream in.
  useLayoutEffect(() => {
    const inner = listInnerRef.current;
    if (!inner) return;
    const sc = inner.closest(".scrollable");
    if (sc !== scrollEl) setScrollEl(sc);
    if (!sc) return;
    const top = Math.max(0, Math.round(inner.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop));
    setListScrollMargin(prev => (prev === top ? prev : top));
  });

  const skelN = trackSearch ? 0 : skeletonCount;
  const rowCount = visibleTracks.length + skelN;
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => 52,
    overscan: 12,
    scrollMargin: listScrollMargin,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.9}}`}</style>

      {/* Hero header */}
      <div style={{
        position: "relative",
      }}>
        {/* Navigation row */}
        <div style={{ padding: "48px 22px 18px", display: "flex", gap: 8 }}>
          <button
            onClick={onBack || undefined}
            disabled={!onBack}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(0,0,0,0.38)", border: "0.5px solid rgba(255,255,255,0.12)",
              color: onBack ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "default",
              backdropFilter: "blur(8px)", transition: "background 0.15s",
              padding: 0,
            }}
            onMouseEnter={e => { if (onBack) e.currentTarget.style.background = "rgba(0,0,0,0.58)"; }}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.38)"}
          >
            <ArrowLeft size={16} />
          </button>
        </div>

        {/* Album / playlist info */}
        <div style={{ display: "flex", gap: 26, alignItems: "flex-end", padding: "0 28px 28px" }}>
          {/* Cover */}
          <div style={{
            width: 190, height: 190, borderRadius: 12, flexShrink: 0,
            overflow: "hidden", background: "var(--bg-elevated)",
            boxShadow: `0 18px 52px rgba(${accentColor},0.38)`,
          }}>
            {thumbnail
              ? <img src={thumb(thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, rgba(${accentColor},0.8), rgba(${accentColor},0.3))`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isLiked
                    ? <Heart size={72} weight="fill" style={{ color: "rgba(255,255,255,0.9)" }} />
                    : typeLabel
                    ? <ClockCounterClockwise size={72} style={{ color: "rgba(255,255,255,0.9)" }} />
                    : null}
                </div>}
          </div>

          {/* Info */}
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Type label */}
            <div style={{ fontSize: "var(--t11)", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              {typeLabel ?? (isAlbum ? t("album") : t("playlist"))}
            </div>

            {/* Title */}
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, marginBottom: 14, color: "#fff", textShadow: "0 2px 20px rgba(0,0,0,0.55)" }}>{title}</div>

            {/* Metadata row with pipe separators */}
            <div style={{ fontSize: "var(--t13)", color: "rgba(255,255,255,0.65)", marginBottom: 20, display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
              {isAlbum && albumArtists && (
                <>
                  <span
                    onClick={() => albumArtistBrowseId && onOpenArtist?.({ browseId: albumArtistBrowseId, artist: albumArtists })}
                    style={{
                      cursor: "default",
                      display: "inline-flex", alignItems: "center",
                      background: `rgba(${accentColor},0.25)`,
                      border: `1px solid rgba(${accentColor},0.42)`,
                      borderRadius: 20, padding: "3px 12px",
                      fontSize: "var(--t13)", fontWeight: 600,
                      color: "var(--accent)", transition: "background 0.15s, border-color 0.15s",
                      marginRight: 10,
                    }}
                    onMouseEnter={e => { if (albumArtistBrowseId) { e.currentTarget.style.background = `rgba(${accentColor},0.38)`; e.currentTarget.style.borderColor = `rgba(${accentColor},0.65)`; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = `rgba(${accentColor},0.25)`; e.currentTarget.style.borderColor = `rgba(${accentColor},0.42)`; }}
                  >{albumArtists}</span>
                  <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 10px", fontSize: "var(--t14)" }}>|</span>
                </>
              )}
              {isAlbum && year && (
                <>
                  <span>{year}</span>
                  <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 10px", fontSize: "var(--t14)" }}>|</span>
                </>
              )}
              <span>{total || tracks.length} {t("songs")}</span>
              {totalDuration && (
                <>
                  <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 10px", fontSize: "var(--t14)" }}>|</span>
                  <span>{totalDuration}</span>
                </>
              )}
            </div>

            {/* Action buttons — play left, secondary right */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              {/* Left: play */}
              <button onClick={() => tracks.length && onPlay(tracks[0], tracks)} style={{
                background: `rgba(${accentColor},0.18)`,
                border: `1px solid rgba(${accentColor},0.38)`,
                borderRadius: 28, height: 50, padding: "0 28px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                cursor: "default", transition: "background 0.18s, border-color 0.18s, transform 0.15s",
                fontSize: "var(--t15)", fontWeight: 700, color: "var(--accent)",
                fontFamily: "var(--font)", backdropFilter: "blur(6px)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `rgba(${accentColor},0.3)`; e.currentTarget.style.borderColor = `rgba(${accentColor},0.6)`; e.currentTarget.style.transform = "scale(1.03)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = `rgba(${accentColor},0.18)`; e.currentTarget.style.borderColor = `rgba(${accentColor},0.38)`; e.currentTarget.style.transform = "scale(1)"; }}
              >
                <Play size={14} weight="fill" style={{ color: "var(--accent)" }} />
                {t("playAll")}
              </button>

              {/* Right: secondary actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {extraActions}
                {/* Inline search input */}
                <div style={{
                  width: searchVisible ? 200 : 0, overflow: "hidden",
                  transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
                  display: "flex", alignItems: "center",
                }}>
                  <input
                    ref={searchInputRef}
                    value={trackSearch}
                    onChange={e => setTrackSearch(e.target.value)}
                    placeholder={t("searchInPlaylist")}
                    style={{
                      background: "rgba(0,0,0,0.35)", border: "0.5px solid rgba(255,255,255,0.18)",
                      borderRadius: 20, padding: "9px 14px", fontSize: "var(--t13)", color: "#fff",
                      outline: "none", width: 200, flexShrink: 0, fontFamily: "var(--font)",
                    }}
                  />
                </div>
                {searchVisible && trackSearch && (
                  <span style={{ fontSize: "var(--t12)", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>
                    {visibleTracks.length} {t("xOfY")} {tracks.length}
                  </span>
                )}
                {/* Search toggle */}
                <Tooltip text={t("searchInPlaylist")}><button
                  onClick={() => { setSearchVisible(v => !v); if (searchVisible) setTrackSearch(""); }}
                  style={{
                    background: searchVisible ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.3)",
                    border: "0.5px solid rgba(255,255,255,0.15)",
                    borderRadius: "50%", width: 42, height: 42, display: "flex", alignItems: "center",
                    justifyContent: "center", cursor: "default", transition: "background 0.15s",
                    color: "rgba(255,255,255,0.85)", padding: 0, backdropFilter: "blur(6px)",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                  onMouseLeave={e => e.currentTarget.style.background = searchVisible ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.3)"}
                >
                  <MagnifyingGlass size={15} />
                </button></Tooltip>

                {/* Download / downloaded state */}
                {onDownloadAll && tracks.length > 0 && (() => {
                  const allCached = cachedSongIds && tracks.every(tr => cachedSongIds.has(tr.videoId));
                  const someDownloading = downloadingIds && tracks.some(tr => downloadingIds.has(tr.videoId));
                  const btnBase = {
                    borderRadius: 28, height: 42, display: "flex", alignItems: "center",
                    padding: "0 18px", gap: 8, fontSize: "var(--t13)", fontWeight: 600,
                    cursor: "default", transition: "background 0.15s, border-color 0.15s",
                    fontFamily: "var(--font)", backdropFilter: "blur(6px)", border: "0.5px solid rgba(255,255,255,0.15)",
                  };
                  return allCached ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ ...btnBase, cursor: "default", color: "#4caf50", background: "rgba(76,175,80,0.12)", border: "0.5px solid rgba(76,175,80,0.3)" }}>
                        <CheckCircle size={14} weight="fill" />
                        {t("downloaded")}
                      </div>
                      {onRemoveAll && (
                        <Tooltip text={t("removeDownload")}><button
                          onClick={() => onRemoveAll(tracks)}
                          style={{
                            background: "rgba(0,0,0,0.3)", border: "0.5px solid rgba(255,255,255,0.15)",
                            borderRadius: "50%", width: 42, height: 42, display: "flex", alignItems: "center",
                            justifyContent: "center", cursor: "default", transition: "background 0.15s",
                            color: "rgba(255,255,255,0.7)", padding: 0, backdropFilter: "blur(6px)",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(224,82,82,0.25)"; e.currentTarget.style.color = "#e05252"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.3)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                        >
                          <Trash size={14} />
                        </button></Tooltip>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => onDownloadAll(tracks)}
                      disabled={someDownloading}
                      style={{
                        ...btnBase,
                        background: "rgba(0,0,0,0.3)",
                        color: "rgba(255,255,255,0.85)",
                        opacity: someDownloading ? 0.65 : 1,
                        cursor: someDownloading ? "default" : "default",
                      }}
                      onMouseEnter={e => { if (!someDownloading) e.currentTarget.style.background = "rgba(255,255,255,0.14)"; }}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.3)"}
                    >
                      {someDownloading
                        ? <DownloadSimple size={14} style={{ animation: "pulse 1s ease-in-out infinite" }} />
                        : <DownloadSimple size={14} />}
                      {t("downloadAll")}
                    </button>
                  );
                })()}

                {/* Refresh */}
                {cached && onRefresh && (
                  <Tooltip text={t("refresh")}><button
                    onClick={onRefresh}
                    style={{
                      background: "rgba(0,0,0,0.3)", border: "0.5px solid rgba(255,255,255,0.15)",
                      borderRadius: "50%", width: 42, height: 42, display: "flex", alignItems: "center",
                      justifyContent: "center", cursor: "default", transition: "background 0.15s, transform 0.15s",
                      color: "rgba(255,255,255,0.85)", padding: 0, backdropFilter: "blur(6px)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.transform = "rotate(30deg)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.3)"; e.currentTarget.style.transform = "rotate(0deg)"; }}
                  >
                    <ArrowClockwise size={14} />
                  </button></Tooltip>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Loading progress */}
      {loading && !cached && (
        <div style={{ padding: "0 28px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: "var(--t11)", color: "var(--text-muted)" }}>{t("fetchingSongs")}</span>
            <span style={{ fontSize: "var(--t11)", color: "var(--accent)", fontWeight: 500 }}>{progress}%</span>
          </div>
          <div style={{ height: 3, background: "var(--bg-elevated)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, background: "linear-gradient(90deg,var(--accent),#c020e0)", width: `${progress}%`, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: onToggleSelect
          ? (isAlbum ? "28px minmax(0,2fr) minmax(0,1fr) 28px 52px" : "28px minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px")
          : (isAlbum ? "minmax(0,2fr) minmax(0,1fr) 28px 52px" : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px"),
        gap: 8, padding: "8px 16px", margin: "0 12px",
        borderBottom: "0.5px solid var(--border)",
        fontSize: "var(--t11)", fontWeight: 600, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {onToggleSelect && (() => {
          const allSelected = visibleTracks.length > 0 && visibleTracks.every(tr => selectedTracks?.has(tr.videoId));
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "default" }}
              onClick={() => onSelectAll?.(visibleTracks, allSelected)}
              title={allSelected ? t("deselectAll") : t("selectAll")}
            >
              {allSelected
                ? <CheckCircle size={18} weight="fill" style={{ color: "var(--accent)" }} />
                : <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1.5px solid var(--text-muted)", background: "var(--bg-elevated)" }} />
              }
            </div>
          );
        })()}
        <div>{t("colTitle")}</div>
        <div>{t("colArtist")}</div>
        {!isAlbum && <div>{t("colAlbum")}</div>}
        <div></div>
        <div style={{ textAlign: "right" }}>{t("colDuration")}</div>
      </div>

      {/* Track list (virtualized — only on-screen rows are mounted) */}
      <div style={{ padding: "8px 12px 32px" }}>
        <div ref={listInnerRef} style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map(vi => {
            const i = vi.index;
            const tr = visibleTracks[i];
            return (
              <div
                key={vi.key}
                data-index={i}
                ref={rowVirtualizer.measureElement}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start - listScrollMargin}px)` }}
              >
                {tr ? (
                  <TableRow track={tr} index={i}
                    isPlaying={isPlaying && currentTrack?.videoId === tr.videoId}
                    onPlay={() => onPlay(tr, visibleTracks)}
                    onOpenArtist={onOpenArtist}
                    onOpenAlbum={onOpenAlbum}
                    isAlbum={isAlbum}
                    onContextMenu={onTrackContextMenu}
                    isCached={cachedSongIds?.has(tr.videoId)}
                    isDownloading={downloadingIds?.has(tr.videoId)}
                    isPremiumOnly={premiumSongIds?.has(tr.videoId)}
                    onDownload={onDownloadSong}
                    selected={selectedTracks?.has(tr.videoId)}
                    onToggleSelect={onToggleSelect ? () => onToggleSelect(tr) : undefined}
                  />
                ) : (
                  <SkeletonRow />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 16px", borderRadius: "var(--radius)",
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 6, background: "var(--bg-elevated)", flexShrink: 0,
        animation: "pulse 1.4s ease-in-out infinite" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ height: 12, width: "45%", borderRadius: 4, background: "var(--bg-elevated)",
          animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ height: 10, width: "30%", borderRadius: 4, background: "var(--bg-elevated)",
          animation: "pulse 1.4s ease-in-out 0.2s infinite" }} />
      </div>
      <div style={{ height: 10, width: 36, borderRadius: 4, background: "var(--bg-elevated)",
        animation: "pulse 1.4s ease-in-out infinite" }} />
    </div>
  );
}

function DownloadsView({ onPlay, currentTrack, isPlaying, cachedSongIds, downloadingIds, premiumSongIds, onDownloadSong, onTrackContextMenu, hideExplicit, onOpenAlbum, onOpenArtist, onToggleLike, likedIds }) {
  const t = useLang();
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("songs");
  const [selectedGroup, setSelectedGroup] = useState(null);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    const load = (attempt = 0) => {
      fetch(`${API}/song/cached/list`)
        .then(r => r.json())
        .then(d => { if (!cancelled) { setSongs(d.songs || []); setLoading(false); } })
        .catch(() => {
          if (!cancelled && attempt < 20) setTimeout(() => load(attempt + 1), 1500);
          else if (!cancelled) setLoading(false);
        });
    };
    load();
    return () => { cancelled = true; };
  }, [cachedSongIds.size]);

  const albums = useMemo(() => {
    const map = new Map();
    songs.forEach(song => {
      if (!song.album) return;
      const key = song.albumBrowseId || song.album;
      if (!map.has(key)) map.set(key, { key, title: song.album, browseId: song.albumBrowseId, thumbnail: song.thumbnail, artists: song.artists, songs: [] });
      map.get(key).songs.push(song);
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [songs]);

  const artists = useMemo(() => {
    const map = new Map();
    songs.forEach(song => {
      if (!song.artists) return;
      const key = song.artistBrowseId || song.artists;
      if (!map.has(key)) map.set(key, { key, artist: song.artists, browseId: song.artistBrowseId, thumbnail: song.thumbnail, songs: [] });
      map.get(key).songs.push(song);
    });
    return Array.from(map.values()).sort((a, b) => a.artist.localeCompare(b.artist));
  }, [songs]);

  const tabDefs = [
    { id: "songs",   label: t("filterSongs"),   icon: <MusicNote size={14} /> },
    { id: "albums",  label: t("filterAlbums"),  icon: <VinylRecord size={14} /> },
    { id: "artists", label: t("filterArtists"), icon: <Microphone size={14} /> },
  ];

  // Detail view for a selected album or artist
  if (selectedGroup) {
    return (
      <PlaylistLayout
        title={selectedGroup.title}
        thumbnail={selectedGroup.thumbnail}
        tracks={selectedGroup.songs}
        total={selectedGroup.songs.length}
        loading={false}
        progress={1}
        cached={true}
        onPlay={onPlay}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onBack={() => setSelectedGroup(null)}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={onOpenAlbum}
        onTrackContextMenu={onTrackContextMenu}
        cachedSongIds={cachedSongIds}
        downloadingIds={downloadingIds}
        premiumSongIds={premiumSongIds}
        onDownloadSong={onDownloadSong}
        hideExplicit={hideExplicit}
        onToggleLike={onToggleLike}
        likedIds={likedIds}
      />
    );
  }

  // Header in normal flow — sits above PlaylistLayout via zIndex:5 (safe, below any overlay)
  const HEADER_H = 60; // 24px top padding + 36px row height
  const tabBar = (
    <div style={{ position: "relative", zIndex: 5, flexShrink: 0, padding: "24px 24px 0" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", height: 36 }}>
      <div style={{ fontSize: "var(--t22)", fontWeight: 600 }}>{t("downloads")}</div>
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4 }}>
        {tabDefs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`view-tab-btn${tab === tb.id ? " active" : ""}`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: tab === tb.id ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "transparent",
              color: tab === tb.id ? "var(--accent)" : "var(--text-secondary)",
              border: "none", borderRadius: 8, padding: "7px 14px",
              fontSize: "var(--t13)", cursor: "default", fontFamily: "var(--font)",
              transition: "all 0.15s", fontWeight: tab === tb.id ? 600 : 400,
            }}>{tb.icon}{tb.label}</button>
        ))}
      </div>
      </div>
    </div>
  );

  if (tab === "songs") {
    return (
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        {tabBar}
        {/* Negative margin pulls PlaylistLayout's gradient up behind the header */}
        <div style={{ marginTop: -HEADER_H, flex: 1 }}>
          <PlaylistLayout
            title={t("allSongs")}
            thumbnail={null}
            tracks={songs}
            total={songs.length}
            loading={loading}
            progress={1}
            cached={false}
            onPlay={onPlay}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onBack={null}
            onOpenArtist={onOpenArtist}
            onOpenAlbum={onOpenAlbum}
            onTrackContextMenu={onTrackContextMenu}
            cachedSongIds={cachedSongIds}
            downloadingIds={downloadingIds}
            premiumSongIds={premiumSongIds}
            onDownloadSong={onDownloadSong}
            hideExplicit={hideExplicit}
            onToggleLike={onToggleLike}
            likedIds={likedIds}
          />
        </div>
      </div>
    );
  }

  // Albums / Artists grid
  const items = tab === "albums" ? albums : artists;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {tabBar}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 32px" }}>
        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: "var(--t13)" }}>{t("loading")}…</div>
        ) : items.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "var(--t13)" }}>{t("noResults")}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 16 }}>
            {tab === "albums" && albums.map((album, i) => (
              <GridCard key={i}
                thumbnail={album.thumbnail}
                title={album.title}
                subtitle={`${album.artists || ""} · ${album.songs.length} ${t("songs")}`}
                onClick={() => setSelectedGroup({ title: album.title, thumbnail: album.thumbnail, songs: album.songs })}
              />
            ))}
            {tab === "artists" && artists.map((artist, i) => (
              <GridCard key={i}
                thumbnail={artist.thumbnail}
                title={artist.artist}
                subtitle={`${artist.songs.length} ${t("songs")}`}
                onClick={() => setSelectedGroup({ title: artist.artist, thumbnail: artist.thumbnail, songs: artist.songs })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionView({ title, thumbnail, tracks, total, loading, progress, cached, onPlay, currentTrack, isPlaying, onBack, onOpenArtist, onOpenAlbum, isAlbum, albumArtists, albumArtistBrowseId, year, onRefresh, onTrackContextMenu, cachedSongIds, downloadingIds, premiumSongIds, onDownloadSong, onDownloadAll, onRemoveAll, hideExplicit, onToggleLike, likedIds, selectedTracks, onToggleSelect, onSelectAll }) {
  return (
    <PlaylistLayout
      title={title} thumbnail={thumbnail} tracks={tracks} total={total}
      loading={loading} progress={progress} cached={cached}
      onPlay={onPlay} currentTrack={currentTrack} isPlaying={isPlaying}
      onBack={onBack} onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum}
      isAlbum={isAlbum} albumArtists={albumArtists} albumArtistBrowseId={albumArtistBrowseId} year={year}
      onRefresh={onRefresh} onTrackContextMenu={onTrackContextMenu}
      cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} premiumSongIds={premiumSongIds} onDownloadSong={onDownloadSong} onDownloadAll={onDownloadAll} onRemoveAll={onRemoveAll}
      hideExplicit={hideExplicit} onToggleLike={onToggleLike} likedIds={likedIds}
      selectedTracks={selectedTracks} onToggleSelect={onToggleSelect} onSelectAll={onSelectAll}
    />
  );
}

function SearchView({ query, onPlay, currentTrack, isPlaying, onOpenArtist, onOpenAlbum, onOpenPlaylist, onContextMenu, onTrackContextMenu, hideExplicit }) {
  const [filter, setFilter] = useState("songs");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const t = useLang();

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    setError(null);
    setResults([]);
    fetch(`${API}/search?q=${encodeURIComponent(query)}&filter=${filter}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setResults(d.results || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [query, filter]);

  const tabs = [
    { id: "songs",   label: t("filterSongs") },
    { id: "artists", label: t("filterArtists") },
    { id: "albums",  label: t("filterAlbums") },
  ];

  if (!query) return (
    <div style={{ padding: 28, color: "var(--text-secondary)" }}>
      {t("searchPrompt")}
    </div>
  );

  return (
    <div style={{ padding: "20px 12px" }}>
      {/* Header */}
      <div style={{ padding: "0 16px", marginBottom: 16 }}>
        <div style={{ fontSize: "var(--t18)", fontWeight: 500, marginBottom: 12 }}>
          {t("searchResultsFor")} „{query}"
        </div>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          {tabs.map(tab_ => (
            <button key={tab_.id} onClick={() => setFilter(tab_.id)} style={{
              background: filter === tab_.id ? "var(--accent)" : "var(--bg-elevated)",
              color: filter === tab_.id ? "#fff" : "var(--text-secondary)",
              border: "none", borderRadius: 20, padding: "6px 16px",
              fontSize: "var(--t13)", cursor: "default", fontFamily: "var(--font)",
              transition: "all 0.15s",
            }}>{tab_.label}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ padding: "0 16px", color: "var(--text-secondary)" }}>{t("loadingDots")}</div>}
      {error && <div style={{ padding: "0 16px", color: "#f44336" }}>{t("errorLoading")}: {error}</div>}
      {!loading && !error && results.length === 0 && (
        <div style={{ padding: "0 16px", color: "var(--text-muted)" }}>{t("noResults")}</div>
      )}

      {/* Songs */}
      {filter === "songs" && results.filter(s => !hideExplicit || !s.isExplicit).map(song => (
        <TrackRow
          key={song.videoId}
          track={song}
          isPlaying={isPlaying && currentTrack?.videoId === song.videoId}
          onPlay={() => onPlay(song, results.filter(s => !hideExplicit || !s.isExplicit))}
          onOpenArtist={onOpenArtist}
          onContextMenu={onTrackContextMenu}
        />
      ))}

      {/* Artists */}
      {filter === "artists" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: 16, padding: "0 16px",
        }}>
          {results.map((a, i) => (
            <div key={i} onClick={() => a.browseId && onOpenArtist?.({ browseId: a.browseId, artist: a.title })}
              style={{ cursor: "default", borderRadius: 8, padding: "12px 0", textAlign: "center" }}
              onMouseEnter={e => e.currentTarget.querySelector(".sr-title").style.color = "var(--accent)"}
              onMouseLeave={e => e.currentTarget.querySelector(".sr-title").style.color = "var(--text-primary)"}
            >
              <div style={{ width: 100, height: 100, borderRadius: "50%", overflow: "hidden", background: "var(--bg-elevated)", margin: "0 auto 10px" }}>
                {a.thumbnail
                  ? <img src={thumb(a.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#2a1535,#1a0a25)" }} />}
              </div>
              <div className="sr-title" style={{ fontSize: "var(--t13)", fontWeight: 500, transition: "color 0.15s", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
              {a.subtitle && <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", marginTop: 3 }}>{a.subtitle}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Albums */}
      {filter === "albums" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: 16, padding: "0 16px",
        }}>
          {results.map((a, i) => (
            <GridCard key={i}
              thumbnail={a.thumbnail}
              title={a.title}
              subtitle={`${a.artists}${a.year ? ` · ${a.year}` : ""}`}
              onClick={() => a.browseId && onOpenAlbum?.({ browseId: a.browseId, title: a.title, thumbnail: a.thumbnail })}
              onContextMenu={a.browseId ? (e) => onContextMenu?.(e, { browseId: a.browseId, title: a.title, thumbnail: a.thumbnail, type: "album" }) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Horizontal scroller built on HeroUI ScrollShadow — adds soft fade edges that
// appear/disappear based on scroll position. Keeps the .carousel hover-scrollbar.
// `insetX` insets the whole scroller (margin) so both the tiles AND the native
// scrollbar line up with horizontally-padded content above/below.
function Carousel({ children, style, insetX = 0 }) {
  return (
    <ScrollShadowRoot
      orientation="horizontal"
      hideScrollBar={false}
      size={28}
      className="carousel"
      style={{ display: "flex", overflowX: "auto", marginLeft: insetX, marginRight: insetX, ...style }}
    >
      {children}
    </ScrollShadowRoot>
  );
}

// Reusable media tile matching the Home-page card behavior (hover image-scale,
// play overlay, CardRoot). shape: "square" | "circle" | "video".
function MediaTile({ thumbnail, title, subtitle, fallbackIcon, shape = "square", size = 148, onOpen, onPlay, onContextMenu }) {
  const isVideo = shape === "video";
  const isCircle = shape === "circle";
  const w = isVideo ? 200 : size;
  const h = isVideo ? 113 : size;
  const Fallback = fallbackIcon || (isCircle ? Microphone : MusicNote);
  return (
    <CardRoot
      variant="transparent"
      className="home-card p-0! gap-0! rounded-none! shadow-none!"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      style={{ flexShrink: 0, width: w, cursor: "default" }}
    >
      <div style={{ position: "relative", marginBottom: 8, borderRadius: isCircle ? "50%" : 10, overflow: "hidden", boxShadow: "0 4px 14px rgba(0,0,0,0.3)" }}>
        <div style={{ width: w, height: h, background: "var(--bg-elevated)" }}>
          {thumbnail
            ? <img className="home-card-img" src={thumb(thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.25s" }} />
            : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#2a1535,#1a0a25)", display: "flex", alignItems: "center", justifyContent: "center" }}><Fallback size={Math.round(w * 0.3)} style={{ opacity: 0.3 }} /></div>}
        </div>
        {onPlay && !isCircle && (
          <div className="home-card-play" style={{ position: "absolute", bottom: 8, right: 8, opacity: 0, transform: "translateY(8px)", transition: "opacity 0.2s, transform 0.2s", pointerEvents: "none" }}>
            <div className="home-card-play-btn" onClick={(e) => { e.stopPropagation(); onPlay(e); }} style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto", cursor: "default", boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>
              <Play size={17} weight="fill" style={{ color: "white", marginLeft: 2 }} />
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: "var(--t12)", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: isCircle ? "center" : "left" }}>{title}</div>
      {subtitle && <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: isCircle ? "center" : "left" }}>{subtitle}</div>}
    </CardRoot>
  );
}

function HomeView({ displayName, onPlay, onOpenPlaylist, onOpenAlbum, onOpenArtist, onContextMenu, onTrackContextMenu, hideExplicit }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moodGroups, setMoodGroups] = useState({});   // { "For you": [...], "Moods & moments": [...], "Genres": [...] }
  const [activeMoodTab, setActiveMoodTab] = useState(null);
  const [activeMoodChip, setActiveMoodChip] = useState(null);
  const [moodPlaylists, setMoodPlaylists] = useState([]);
  const [moodLoading, setMoodLoading] = useState(false);
  const [podcastLoading, setPodcastLoading] = useState(null); // playlistId being fetched
  const [speedDialPage, setSpeedDialPage] = useState(0);
  const t = useLang();

  useEffect(() => {
    fetch(`${API}/home`)
      .then(r => r.json())
      .then(d => { setSections(d.sections || []); setLoading(false); })
      .catch(() => setLoading(false));
    fetch(`${API}/mood/categories`)
      .then(r => r.json())
      .then(d => {
        const groups = (d && !Array.isArray(d) && typeof d === "object") ? d : {};
        setMoodGroups(groups);
        const firstKey = Object.keys(groups)[0];
        if (firstKey) setActiveMoodTab(firstKey);
      })
      .catch(() => {});
  }, []);

  const handleMoodChipClick = (chip) => {
    if (activeMoodChip?.params === chip.params) {
      setActiveMoodChip(null);
      setMoodPlaylists([]);
      return;
    }
    setActiveMoodChip(chip);
    setMoodLoading(true);
    setMoodPlaylists([]);
    fetch(`${API}/mood/playlists?params=${encodeURIComponent(chip.params)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setMoodPlaylists(d); setMoodLoading(false); })
      .catch(() => setMoodLoading(false));
  };

  const handlePodcastClick = async (item) => {
    if (podcastLoading) return;
    const pid = item.playlistId || item.browseId;
    if (!pid) return;
    setPodcastLoading(pid);
    try {
      const r = await fetch(`${API}/podcast/${pid}`);
      if (!r.ok) throw new Error("fetch failed");
      const d = await r.json();
      const episodes = (d.episodes || [])
        .filter(ep => ep.videoId)
        .map(ep => ({
          type: "song",
          videoId: ep.videoId,
          title: ep.title,
          artists: d.author?.name || "",
          artistBrowseId: d.author?.id || "",
          artistLinks: [],
          album: d.title || "",
          albumBrowseId: "",
          duration: ep.duration || "",
          thumbnail: ep.thumbnail || item.thumbnail,
          isExplicit: false,
        }));
      if (episodes.length) {
        onPlay(episodes[0], episodes);
      } else {
        onOpenPlaylist({ playlistId: pid, title: item.title, thumbnail: item.thumbnail });
      }
    } catch {
      onOpenPlaylist({ playlistId: pid, title: item.title, thumbnail: item.thumbnail });
    } finally {
      setPodcastLoading(null);
    }
  };

  // ── Section classification ────────────────────────────────────────────────
  const tl = (s) => (s.title || "").toLowerCase();
  const isDiscover        = (s) => tl(s).includes("discover");
  const isListenAgain     = (s) => tl(s).includes("listen again") || tl(s).includes("erneut anhören") || tl(s).includes("nochmal");
  const isQuickPicks      = (s) => tl(s).includes("quick pick") || tl(s).includes("speed dial") || tl(s).includes("schnellzugriff");
  const isAllSongsSection = (s) => s.items.length > 0 && s.items.every(x => x.type === "song");

  const allSections = sections.map(s => ({
    ...s,
    items: (s.items || []).filter(x => !hideExplicit || !x.isExplicit),
  })).filter(s => s.items.length > 0);

  const discoverSection   = allSections.find(isDiscover);
  const listenAgainSection = allSections.find(isListenAgain);
  // Speed Dial source = "Quick picks" (YTMusic's recommendations grid). Fall back to
  // the first all-songs section that isn't Discover/Listen again.
  const speedDialSection  = allSections.find(isQuickPicks)
                            || allSections.find(s => isAllSongsSection(s) && !isDiscover(s) && !isListenAgain(s));
  const speedDialItems    = speedDialSection?.items || [];

  // Left column: up to 2 carousel sections. Prefer Listen again + Daily Discover,
  // then fill from remaining (non-song-grid) sections so the column reliably
  // matches the Speed Dial height even when the feed rotates one of them out.
  const preferredLeft = [listenAgainSection, discoverSection].filter(Boolean);
  const usedTitles = new Set([speedDialSection, ...preferredLeft].filter(Boolean).map(s => s.title));
  const leftSections = [...preferredLeft];
  for (const s of allSections) {
    if (leftSections.length >= 2) break;
    if (usedTitles.has(s.title) || isAllSongsSection(s)) continue;
    leftSections.push(s);
    usedTitles.add(s.title);
  }
  const leftTitles = new Set(leftSections.map(s => s.title));
  const regularSections = allSections.filter(s => s.title !== speedDialSection?.title && !leftTitles.has(s.title));

  // ── Shared: play-direct for carousels ────────────────────────────────────
  const handleCardPlayDirect = (e, item, section) => {
    e.stopPropagation();
    if (item.type === "podcast" || item.type === "podcast_episode") { handlePodcastClick(item); return; }
    if (item.type === "song") { onPlay(item, (section?.items || []).filter(x => x.type === "song")); return; }
    if (item.type === "album") {
      fetch(`${API}/album/${item.browseId}`).then(r => r.json())
        .then(d => { if (d.tracks?.length) onPlay(d.tracks[0], d.tracks); }).catch(() => {});
      return;
    }
    if (item.type === "playlist") {
      const es = new EventSource(`${API}/playlist/${item.playlistId}/stream`);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "tracks" && msg.tracks?.length) { onPlay(msg.tracks[0], msg.tracks); es.close(); }
          else if (msg.type === "done" || msg.type === "error") es.close();
        } catch { es.close(); }
      };
      es.onerror = () => es.close();
    }
  };

  const handleCardClick = (item, section) => {
    if (item.type === "song")            { onPlay(item, (section?.items || []).filter(x => x.type === "song")); return; }
    if (item.type === "podcast" || item.type === "podcast_episode") { handlePodcastClick(item); return; }
    if (item.type === "playlist")        { onOpenPlaylist({ playlistId: item.playlistId, title: item.title, thumbnail: item.thumbnail }); return; }
    if (item.type === "album")           { onOpenAlbum({ browseId: item.browseId, title: item.title, thumbnail: item.thumbnail }); return; }
    if (item.type === "artist")          { onOpenArtist({ browseId: item.browseId, artist: item.title }); }
  };

  const getContextItem = (item) => {
    if (item.type === "playlist" || item.type === "podcast") return { playlistId: item.playlistId, title: item.title, thumbnail: item.thumbnail };
    if (item.type === "album")  return { browseId: item.browseId, title: item.title, thumbnail: item.thumbnail, type: "album" };
    if (item.type === "artist") return { browseId: item.browseId, title: item.title, thumbnail: item.thumbnail, type: "artist" };
    return null;
  };

  // ── MediaCard ─────────────────────────────────────────────────────────────
  const MediaCard = ({ item, section, size = 160 }) => {
    const isArtist  = item.type === "artist";
    const isPodcast = item.type === "podcast" || item.type === "podcast_episode";
    const isLoading = podcastLoading && (podcastLoading === item.playlistId || podcastLoading === item.browseId);
    const ctx       = getContextItem(item);
    return (
      <CardRoot
        variant="transparent"
        className="home-card p-0! gap-0! rounded-none! shadow-none!"
        onClick={() => handleCardClick(item, section)}
        onContextMenu={item.type === "song"
          ? (e) => { e.preventDefault(); onTrackContextMenu?.(e, item); }
          : ctx ? (e) => { e.preventDefault(); onContextMenu?.(e, ctx); } : undefined}
        style={{ flexShrink: 0, width: size, cursor: "default" }}
      >
        <div style={{ position: "relative", marginBottom: 8, borderRadius: isArtist ? "50%" : 10, overflow: "hidden", boxShadow: "0 4px 14px rgba(0,0,0,0.3)" }}>
          <div style={{ width: size, height: size, background: "var(--bg-elevated)" }}>
            {item.thumbnail
              ? <img className="home-card-img" src={thumb(item.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.25s" }} />
              : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#2a1535,#1a0a25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isPodcast ? <PodcastIcon size={size * 0.3} style={{ opacity: 0.4 }} /> : <MusicNote size={size * 0.3} style={{ opacity: 0.25 }} />}
                </div>
            }
          </div>
          {!isArtist && (
            <div className="home-card-play" style={{ position: "absolute", bottom: 8, right: 8, opacity: 0, transform: "translateY(8px)", transition: "opacity 0.2s, transform 0.2s", pointerEvents: "none" }}>
              <div
                className="home-card-play-btn"
                onClick={(e) => handleCardPlayDirect(e, item, section)}
                style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto", cursor: "default", boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}
              >
                {isLoading
                  ? <Spinner size="sm" classNames={{ circle1: "border-white", circle2: "border-white" }} />
                  : isPodcast
                    ? <Headphones size={17} style={{ color: "white" }} />
                    : <Play size={17} weight="fill" style={{ color: "white", marginLeft: 2 }} />
                }
              </div>
            </div>
          )}
        </div>
        <div style={{ fontSize: "var(--t13)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 5, textAlign: isArtist ? "center" : "left" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</span>
          {item.isExplicit && <ExplicitBadge />}
        </div>
        {(item.subtitle || (item.type === "song" && item.artists) || (item.type === "artist")) && (
          <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: isArtist ? "center" : "left" }}>
            {item.subtitle || item.artists || "Artist"}
          </div>
        )}
      </CardRoot>
    );
  };

  // ── Loading skeleton (HeroUI Skeleton) ────────────────────────────────────
  if (loading) return (
    <div style={{ padding: 28 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ marginBottom: 36 }}>
          <Skeleton className="h-3.5 w-40 rounded mb-4" />
          <div style={{ display: "flex", gap: 16 }}>
            {[1,2,3,4,5].map(j => (
              <div key={j} style={{ flexShrink: 0, width: 160 }}>
                <Skeleton className="w-40 h-40 rounded-[10px] mb-2.5" />
                <Skeleton className="h-3 w-[80%] rounded mb-1.5" />
                <Skeleton className="h-2.5 w-[55%] rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (!allSections.length) return (
    <div style={{ padding: 28, color: "var(--text-muted)", fontSize: "var(--t13)" }}>{t("noSuggestions")}</div>
  );

  const { greeting, GreetingIcon } = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 11)  return { greeting: t("goodMorning"),   GreetingIcon: SunHorizon };
    if (h >= 11 && h < 13) return { greeting: t("goodDay"),       GreetingIcon: Sun };
    if (h >= 13 && h < 18) return { greeting: t("goodAfternoon"), GreetingIcon: CloudSun };
    if (h >= 18 && h < 23) return { greeting: t("goodEvening"),   GreetingIcon: Moon };
    return                        { greeting: t("goodNight"),      GreetingIcon: MoonStars };
  })();

  return (
    <div style={{ padding: "0 0 40px 0" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:.9}}
        @keyframes homeHeaderIcon{from{opacity:0;transform:translateY(-22px) scale(0.8)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes homeHeaderText{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .carousel::-webkit-scrollbar{height:8px}
        .carousel::-webkit-scrollbar-track{background:transparent}
        .carousel::-webkit-scrollbar-thumb{background-color:transparent;border-radius:4px;border:2.5px solid transparent;background-clip:content-box;transition:background-color 0.2s}
        .carousel:hover::-webkit-scrollbar-thumb{background-color:var(--bg-elevated)}
        /* Smoothly-animated ScrollShadow edge fade. @property makes the fade widths
           interpolatable, so the mask gently fades in/out instead of hard-cutting. */
        @property --fade-l{syntax:"<length>";inherits:false;initial-value:0px}
        @property --fade-r{syntax:"<length>";inherits:false;initial-value:0px}
        .carousel{--fade-l:0px;--fade-r:0px;
          -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 var(--fade-l),#000 calc(100% - var(--fade-r)),transparent 100%)!important;
          mask-image:linear-gradient(90deg,transparent 0,#000 var(--fade-l),#000 calc(100% - var(--fade-r)),transparent 100%)!important;
          transition:--fade-l 0.3s ease,--fade-r 0.3s ease}
        .carousel[data-left-scroll="true"],.carousel[data-left-right-scroll="true"]{--fade-l:28px}
        .carousel[data-right-scroll="true"],.carousel[data-left-right-scroll="true"]{--fade-r:28px}
        .home-card:hover .home-card-play{opacity:1!important;transform:translateY(0)!important}
        .home-card:hover .home-card-img{transform:scale(1.04)}
      `}</style>

      {/* ── Gradient header (centered hero) ── */}
      <div style={{ position: "relative", padding: "120px 28px 72px", overflow: "hidden", marginBottom: 20 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 100% at 50% 0%, var(--accent), transparent 70%)", opacity: 0.18, pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18 }}>
          <GreetingIcon size={64} weight="duotone" style={{ color: "var(--accent)", flexShrink: 0, animation: "homeHeaderIcon 0.6s cubic-bezier(0.22,1,0.36,1) both" }} />
          <h1 style={{ fontSize: "var(--t26, 28px)", fontWeight: 700, margin: 0, lineHeight: 1.25, animation: "homeHeaderText 0.55s cubic-bezier(0.22,1,0.36,1) 0.12s both" }}>
            {greeting}
            {displayName && <>{", "}<span style={{ color: "var(--accent)" }}>{displayName}</span></>}
          </h1>
        </div>
      </div>

      {/* ── Top row: left stack (carousels) + Speed Dial (right) ── */}
      {(leftSections.length > 0 || speedDialItems.length > 0) && (() => {
        const PER_PAGE = 9;
        const pages = [];
        for (let i = 0; i < speedDialItems.length; i += PER_PAGE) pages.push(speedDialItems.slice(i, i + PER_PAGE));
        const curPage = Math.min(speedDialPage, Math.max(0, pages.length - 1));
        const hasSpeedDial = speedDialItems.length > 0;
        const hasLeft = leftSections.length > 0;
        const goPage = (dir) => setSpeedDialPage(p => {
          const cur = Math.min(p, pages.length - 1);
          return Math.max(0, Math.min(pages.length - 1, cur + dir));
        });

        return (
          <div style={{ display: "grid", gridTemplateColumns: hasLeft && hasSpeedDial ? "1fr minmax(0, 460px)" : hasSpeedDial ? "minmax(0, 460px)" : "1fr", gap: 16, paddingLeft: 28, paddingRight: 28, marginBottom: 32, alignItems: "start" }}>

            {/* Left column — up to 2 plain carousels stacked (Listen again, Daily Discover, …) */}
            {hasLeft && (
              <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
                {leftSections.map((section, li) => {
                  return (
                    <div key={li} style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: "var(--t16)", fontWeight: 700 }}>{section.title}</span>
                      </div>
                      <Carousel style={{ gap: 16, paddingBottom: 8 }}>
                        {section.items.map((item, i) => <MediaCard key={i} item={item} section={section} size={148} />)}
                      </Carousel>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Speed Dial — Quick picks recommendations as a paginated 3×3 grid */}
            {hasSpeedDial && (
              <CardRoot variant="transparent" className="overflow-hidden gap-0! p-0!"
                style={{
                  background: "color-mix(in srgb, var(--bg-surface) 55%, transparent)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "none",
                }}>
                <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: "var(--t12)", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("speedDial")}</span>
                  </div>
                  {pages.length > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <Button isIconOnly size="sm" variant="secondary" className="size-7 min-w-0 rounded-full" isDisabled={curPage === 0} onPress={() => goPage(-1)}>
                        <CaretLeft size={13} weight="bold" />
                      </Button>
                      <Button isIconOnly size="sm" variant="secondary" className="size-7 min-w-0 rounded-full" isDisabled={curPage >= pages.length - 1} onPress={() => goPage(1)}>
                        <CaretRight size={13} weight="bold" />
                      </Button>
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, padding: "0 16px 12px" }}>
                  {Array.from({ length: pages.length > 1 ? PER_PAGE : (pages[0]?.length || 0) }).map((_, i) => {
                    const item = (pages[curPage] || [])[i];
                    // Empty placeholder keeps the grid at a constant 3-row height on the last page
                    if (!item) return <div key={i} aria-hidden style={{ minWidth: 0, aspectRatio: "1 / 1" }} />;
                    return (
                    <CardRoot key={i} variant="transparent" className="home-card p-0! gap-0! rounded-none! shadow-none!"
                      onClick={() => onPlay(item, speedDialItems)}
                      onContextMenu={(e) => { e.preventDefault(); onTrackContextMenu?.(e, item); }}
                      style={{ cursor: "default", minWidth: 0 }}>
                      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" }}>
                        {item.thumbnail
                          ? <img className="home-card-img" src={thumb(item.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.25s" }} />
                          : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#2a1535,#1a0a25)" }} />
                        }
                        {/* Gradient + title/artist overlay (bottom-left) */}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 32%, transparent 60%)", pointerEvents: "none" }} />
                        <div style={{ position: "absolute", left: 8, right: 8, bottom: 7, pointerEvents: "none" }}>
                          <div style={{ fontSize: "var(--t11)", fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{item.title}</div>
                          <div style={{ fontSize: "var(--t10)", color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{item.artists}</div>
                        </div>
                        <div className="home-card-play" style={{ position: "absolute", inset: 0, opacity: 0, transition: "opacity 0.2s", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Play size={13} weight="fill" style={{ color: "white", marginLeft: 2 }} />
                          </div>
                        </div>
                      </div>
                    </CardRoot>
                    );
                  })}
                </div>
                {/* Pagination dots */}
                {pages.length > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingBottom: 14 }}>
                    {pages.map((_, pi) => (
                      <button key={pi} onClick={() => setSpeedDialPage(pi)} style={{
                        width: pi === curPage ? 18 : 7, height: 7, borderRadius: 4, border: "none", padding: 0,
                        background: pi === curPage ? "var(--accent)" : "color-mix(in srgb, var(--text-muted) 55%, transparent)",
                        cursor: "default", transition: "width 0.2s, background 0.2s",
                      }} />
                    ))}
                  </div>
                )}
              </CardRoot>
            )}
          </div>
        );
      })()}

      {/* ── Regular sections (carousels) ── */}
      {regularSections.map((section, si) => (
        <div key={si} style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, paddingLeft: 28, paddingRight: 28 }}>
            <span style={{ fontSize: "var(--t16)", fontWeight: 700 }}>{section.title}</span>
          </div>
          <Carousel insetX={28} style={{ gap: 16, paddingBottom: 8 }}>
            {section.items.map((item, ii) => <MediaCard key={ii} item={item} section={section} />)}
          </Carousel>
        </div>
      ))}

      {/* ── Moods & Genres (full grid, tabbed) ── */}
      {Object.keys(moodGroups).length > 0 && (
        <div style={{ paddingLeft: 28, paddingRight: 28, marginTop: 8 }}>
          <CardRoot variant="secondary" className="overflow-hidden gap-0! p-0!">
            {/* Header + group selector (HeroUI segmented ToggleButtonGroup) */}
            <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid var(--border-subtle, var(--bg-elevated))" }}>
              <div style={{ fontSize: "var(--t16)", fontWeight: 700, marginBottom: 12 }}>{t("moodsGenres")}</div>
              <ToggleButtonGroupRoot selectionMode="single" disallowEmptySelection size="sm"
                selectedKeys={[activeMoodTab]}
                onSelectionChange={(keys) => { const k = [...keys][0]; if (k != null) { setActiveMoodTab(String(k)); setActiveMoodChip(null); setMoodPlaylists([]); } }}>
                {Object.keys(moodGroups).map(tabKey => (
                  <ToggleButton key={tabKey} id={tabKey}>{tabKey}</ToggleButton>
                ))}
              </ToggleButtonGroupRoot>
            </div>

            {/* Genre/mood toggle buttons */}
            <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(moodGroups[activeMoodTab] || []).map((chip, i) => {
                const active = activeMoodChip?.params === chip.params;
                return (
                  <ToggleButton key={i} size="md" variant="default" isSelected={active}
                    onChange={() => handleMoodChipClick(chip)}>
                    {chip.title}
                  </ToggleButton>
                );
              })}
            </div>

            {/* Mood / genre results */}
            {activeMoodChip && (
              <div style={{ borderTop: "1.5px solid var(--border-subtle, var(--bg-elevated))", padding: "14px 20px 18px" }}>
                <div style={{ fontSize: "var(--t14)", fontWeight: 700, marginBottom: 14 }}>{activeMoodChip.title}</div>
                {moodLoading
                  ? <div style={{ display: "flex", gap: 14 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{ flexShrink: 0, width: 148 }}>
                          <Skeleton className="w-[148px] h-[148px] rounded-[10px]" />
                          <Skeleton className="h-[11px] w-[72%] rounded mt-2.5" />
                        </div>
                      ))}
                    </div>
                  : moodPlaylists.length === 0
                    ? <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)" }}>{t("noSuggestions")}</div>
                    : <Carousel style={{ gap: 14, paddingBottom: 4 }}>
                        {moodPlaylists.map((item, i) => <MediaCard key={i} item={item} section={{ items: moodPlaylists }} size={148} />)}
                      </Carousel>
                }
              </div>
            )}
          </CardRoot>
        </div>
      )}
    </div>
  );
}

function timeAgo(ts, t) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return t("justNow")    || "Gerade eben";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} d`;
  return new Date(ts).toLocaleDateString();
}

function HistoryView({ onPlay, currentTrack, isPlaying, onOpenArtist, onOpenAlbum, onTrackContextMenu, cachedSongIds, downloadingIds, onDownloadSong, hideExplicit, onBack }) {
  const t = useLang();
  const profileKey = () => `kiyoshi-history-${window.__activeProfile || "default"}`;
  const load = () => { try { return JSON.parse(localStorage.getItem(profileKey()) || "[]"); } catch { return []; } };
  const [tracks, setTracks] = useState(load);
  const [historyCtx, setHistoryCtx] = useState(null); // { x, y, track, index }

  useEffect(() => {
    const sync = () => setTracks(load());
    window.addEventListener("kiyoshi-history-updated", sync);
    return () => window.removeEventListener("kiyoshi-history-updated", sync);
  }, []);

  const clearHistory = () => {
    localStorage.removeItem(profileKey());
    setTracks([]);
  };

  const removeFromHistory = (index) => {
    const updated = [...tracks];
    updated.splice(index, 1);
    localStorage.setItem(profileKey(), JSON.stringify(updated));
    setTracks(updated);
  };

  const clearHistoryBtn = tracks.length > 0 ? (
    <button onClick={clearHistory} style={{
      borderRadius: 28, height: 42, display: "flex", alignItems: "center",
      padding: "0 18px", gap: 8, fontSize: "var(--t13)", fontWeight: 600,
      cursor: "default", transition: "background 0.15s, border-color 0.15s, color 0.15s",
      fontFamily: "var(--font)", backdropFilter: "blur(6px)",
      border: "0.5px solid rgba(255,255,255,0.15)",
      background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.75)",
    }}
    onMouseEnter={e => { e.currentTarget.style.color = "#f44336"; e.currentTarget.style.borderColor = "#f44336"; e.currentTarget.style.background = "rgba(244,67,54,0.12)"; }}
    onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.background = "rgba(0,0,0,0.3)"; }}
    >
      <Trash size={13} /> {t("clearHistory")}
    </button>
  ) : null;

  return (
    <PlaylistLayout
      title={t("history")} thumbnail={null} tracks={tracks} total={tracks.length}
      loading={false} progress={0} cached={false}
      onPlay={onPlay} currentTrack={currentTrack} isPlaying={isPlaying}
      onBack={onBack}
      typeLabel={t("history")}
      isLiked={false}
      onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum}
      onTrackContextMenu={onTrackContextMenu}
      cachedSongIds={cachedSongIds} downloadingIds={downloadingIds}
      onDownloadSong={onDownloadSong}
      hideExplicit={hideExplicit}
      extraActions={clearHistoryBtn}
    />
  );
}

function LikedView({ onPlay, currentTrack, isPlaying, onOpenArtist, onOpenAlbum, onTrackContextMenu, cachedSongIds, downloadingIds, onDownloadSong, hideExplicit, onToggleLike, likedIds, selectedTracks, onToggleSelect, onSelectAll, onBack }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const t = useLang();

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/liked`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { const err = new Error(d.error); err.code = d.code; throw err; }
        setTracks(d.tracks || []);
      })
      .catch(e => { setError(e.message); setErrorCode(e.code || null); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 28, color: "var(--text-secondary)" }}>
      {t("loadingLikedSongs")}
    </div>
  );

  if (error && errorCode === "auth_expired") return (
    <div style={{ padding: 28 }}>
      <div style={{ color: "#f44336", marginBottom: 8 }}>{t("sessionExpired")}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: "var(--t13)" }}>{t("sessionExpiredHint")}</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 28 }}>
      <div style={{ color: "#f44336", marginBottom: 8 }}>{t("errorLoading")}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: "var(--t13)" }}>{error}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "var(--t12)", marginTop: 12 }}>
        {t("backendHint")} <code style={{ background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 4 }}>python server.py</code>
      </div>
    </div>
  );

  return (
    <PlaylistLayout
      title={t("likedSongs")} thumbnail={null} tracks={tracks} total={tracks.length}
      loading={false} progress={0} cached={false}
      onPlay={onPlay} currentTrack={currentTrack} isPlaying={isPlaying}
      onBack={onBack || null} isLiked={true} onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum}
      onTrackContextMenu={onTrackContextMenu}
      cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} onDownloadSong={onDownloadSong}
      hideExplicit={hideExplicit} onToggleLike={onToggleLike} likedIds={likedIds}
      selectedTracks={selectedTracks} onToggleSelect={onToggleSelect} onSelectAll={onSelectAll}
    />
  );
}

function ArtistDescription({ text, name, url }) {
  const [popupOpen, setPopupOpen] = useState(false);
  const t = useLang();
  // Split off the trailing "From Wikipedia (...)" footer (YTMusic truncates the URL,
  // so the text just ends with "From Wikipedia ("). Strip it from the body and offer
  // a button that resolves the real article via Wikipedia search on click.
  const wikiIdx = text.search(/from wikipedia/i);
  const body = (wikiIdx !== -1 ? text.slice(0, wikiIdx) : text).trimEnd();
  const wikiCited = !!url || (wikiIdx !== -1 && !!name);
  // Role keyword from the description disambiguates names like "Ado" → "Ado (singer)"
  // (only used for the search fallback when the backend didn't supply a direct URL).
  const roleMatch = body.match(/\b(singer-songwriter|rapper|singer|musician|songwriter|girl group|boy band|band|duo|group|record producer|producer|composer|vocalist|DJ|artist)\b/i);
  const role = roleMatch ? roleMatch[0] : "";

  const openWikipedia = async () => {
    if (url) { openUrl(url).catch(console.error); return; }
    const q = (role ? `${name} ${role}` : name).trim();
    let target = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`);
      const d = await r.json();
      const title = d?.query?.search?.[0]?.title;
      if (title) target = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    } catch { /* keep the search-results fallback */ }
    openUrl(target).catch(console.error);
  };
  const PREVIEW = 300;
  const isLong = body.length > PREVIEW;
  const preview = isLong ? body.slice(0, PREVIEW).trimEnd() + "…" : body;

  return (
    <>
      {/* Compact snippet — glassy card, upper-right of the hero */}
      <div style={{
        position: "absolute", top: 96, right: 24,
        width: "clamp(220px, 42%, 460px)", zIndex: 4,
        background: "rgba(0,0,0,0.42)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 14, padding: "12px 14px 10px",
      }}>
        <div style={{ fontSize: "var(--t10)", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{t("about")}</div>
        <p style={{
          margin: 0, fontSize: "var(--t11)", lineHeight: 1.6,
          color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap",
          display: "-webkit-box", WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{preview}</p>
        {isLong && (
          <Button size="sm" variant="ghost" color="accent" className="mt-1 h-6 px-0 min-w-0 font-semibold"
            onPress={() => setPopupOpen(true)}>{t("showMore")}</Button>
        )}
      </div>

      {/* Full-text popup — HeroUI Modal */}
      <ModalRoot isOpen={popupOpen} onOpenChange={(open) => { if (!open) setPopupOpen(false); }}>
        <ModalBackdrop className="z-[300]!">
          <ModalContainer placement="center" size="md" className="w-[480px] max-w-[92vw]">
            <ModalDialog>
              <ModalHeader>
                <ModalIcon><Info size={18} /></ModalIcon>
                <ModalCloseTrigger />
                <ModalHeading>{t("about")}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <p className="scrollable text-t12 text-secondary leading-relaxed whitespace-pre-wrap max-h-[55vh] overflow-y-auto pr-1">{body}</p>
              </ModalBody>
              {wikiCited && (
                <ModalFooter>
                  <Button variant="secondary" size="sm" className="gap-1.5" onPress={openWikipedia}>
                    <ArrowSquareOut size={14} /> {t("viewOnWikipedia")}
                  </Button>
                </ModalFooter>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>
    </>
  );
}

function ArtistView({ browseId, onPlay, currentTrack, isPlaying, onOpenAlbum, onOpenPlaylist, onOpenArtist, onBack, onContextMenu, onTogglePin, isPinned, hideExplicit, onStartRadio }) {
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allAlbums, setAllAlbums] = useState(null);       // null = not yet loaded
  const [allAlbumsLoading, setAllAlbumsLoading] = useState(false);
  const [allSingles, setAllSingles] = useState(null);
  const [allSinglesLoading, setAllSinglesLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(null);     // null = unknown (not loaded yet)
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const t = useLang();
  const artistAccent = useAccentColor(artist?.thumbnail);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/artist/${browseId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setArtist(d);
        setSubscribed(d.subscribed ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [browseId]);

  if (loading) return (
    <div style={{ padding: 28 }}>
      <Skeleton className="h-[200px] w-full rounded-xl mb-6" />
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-[52px] w-full rounded-lg mb-2" />)}
    </div>
  );

  if (error) return <div style={{ padding: 28, color: "#f44336" }}>{error}</div>;
  if (!artist) return null;

  const topTracks = (artist.tracks || []).filter(tr => !hideExplicit || !tr.isExplicit);

  const doSubscribe = () => {
    const next = !subscribed;
    setSubLoading(true);
    setSubError(null);
    fetch(`${API}/artist/${browseId}/${next ? "subscribe" : "unsubscribe"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: artist.channelId || browseId }),
    })
      .then(r => r.json())
      .then(d => { if (d.error) setSubError(d.error); else setSubscribed(next); })
      .catch(e => setSubError(e.message))
      .finally(() => setSubLoading(false));
  };
  const doRadio = () => {
    setRadioLoading(true);
    fetch(`${API}/radio/${artist.radioId}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); if (d.tracks?.length) onPlay(d.tracks[0], d.tracks); })
      .catch(e => console.error("Radio error:", e))
      .finally(() => setRadioLoading(false));
  };
  const playAlbumDirect = (browseId) => {
    fetch(`${API}/album/${browseId}`).then(r => r.json())
      .then(d => { if (d.tracks?.length) onPlay(d.tracks[0], d.tracks); }).catch(() => {});
  };

  return (
    <div style={{ paddingBottom: 32 }}>

      {/* ── Hero banner ── */}
      <div style={{ position: "relative", minHeight: 320, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {artist.thumbnail
          ? <img src={thumb(hiResThumb(artist.thumbnail))} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, rgba(${artistAccent},0.6), rgba(${artistAccent},0.2))` }} />}
        {/* Darkening + fade-to-base overlays */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.55) 75%, var(--bg-base) 100%)" }} />

        {/* Back button */}
        <Button isIconOnly variant="secondary" className="absolute top-11 left-4 z-10 size-9 rounded-full backdrop-blur-md"
          style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }} onPress={onBack}>
          <ArrowLeft size={18} />
        </Button>

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2, padding: "0 24px 22px" }}>
          <div style={{ fontSize: "var(--t11)", fontWeight: 600, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{t("artist")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <h1 style={{ fontSize: 46, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.05, textShadow: "0 2px 18px rgba(0,0,0,0.55)" }}>{artist.name}</h1>
            {onTogglePin && (
              <Tooltip text={t(isPinned ? "removeFromSidebar" : "pinToSidebar")}>
                <Button isIconOnly size="sm" className="size-8 rounded-full shrink-0 backdrop-blur-md"
                  style={{ background: isPinned ? "var(--accent)" : "rgba(255,255,255,0.18)", color: "#fff" }}
                  onPress={() => onTogglePin({ browseId, title: artist.name, thumbnail: artist.thumbnail, type: "artist" })}>
                  <PushPin size={15} weight={isPinned ? "fill" : "regular"} />
                </Button>
              </Tooltip>
            )}
          </div>
          {(artist.subscribers || artist.monthlyListeners) && (
            <div style={{ fontSize: "var(--t12)", color: "rgba(255,255,255,0.62)", fontWeight: 500, marginBottom: 16 }}>
              {[artist.subscribers && `${artist.subscribers} ${t("subscribers")}`, artist.monthlyListeners && `${artist.monthlyListeners} ${t("monthlyListeners")}`].filter(Boolean).join("  ·  ")}
            </div>
          )}
          {/* Action row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {topTracks.length > 0 && (
              <>
                <Button color="accent" variant="solid" className="rounded-full gap-1.5 px-5 font-semibold" onPress={() => onPlay(topTracks[0], topTracks)}>
                  <Play size={15} weight="fill" /> {t("playAll")}
                </Button>
                <Button variant="secondary" className="rounded-full gap-1.5 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
                  onPress={() => { const sh = [...topTracks].sort(() => Math.random() - 0.5); onPlay(sh[0], sh); }}>
                  <Shuffle size={15} /> {t("shuffle")}
                </Button>
              </>
            )}
            {subscribed !== null && (
              <Tooltip text={subscribed ? t("unsubscribe") : t("subscribe")}>
                <Button variant={subscribed ? "secondary" : "solid"} color={subscribed ? "default" : "accent"} isDisabled={subLoading}
                  className="rounded-full gap-1.5 font-semibold" onPress={doSubscribe}>
                  {subscribed ? <><UserCheck size={13} /> {t("subscribed")}</> : <><UserPlus size={13} /> {t("subscribe")}</>}
                </Button>
              </Tooltip>
            )}
            {artist.radioId && (
              <Button variant="ghost" color="accent" isDisabled={radioLoading} className="rounded-full gap-1.5 font-semibold" onPress={doRadio}>
                <Radio size={13} /> {radioLoading ? "…" : "Radio"}
              </Button>
            )}
          </div>
          {subError && <div style={{ marginTop: 8, fontSize: "var(--t11)", color: "#ff7070", maxWidth: 280, lineHeight: 1.35 }}>{subError}</div>}
        </div>
        {/* Artist description — bottom right of hero */}
        {artist.description && <ArtistDescription text={artist.description} name={artist.name} url={artist.descriptionUrl} />}
      </div>

      <div style={{ padding: "0 24px" }}>

        {/* Top Songs */}
        {artist.tracks?.length > 0 && (() => {
          const visibleTracks = artist.tracks.filter(tr => !hideExplicit || !tr.isExplicit);
          if (!visibleTracks.length) return null;
          return (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, marginTop: 8 }}>
              <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("topSongs")}</div>
              {artist.songsBrowseId && (
                <Button size="sm" variant="ghost" className="text-secondary font-medium h-7 px-3 min-w-0"
                  onPress={() => onOpenPlaylist({ playlistId: artist.songsBrowseId, title: `${artist.name} – ${t("topSongs")}`, forcedTitle: `${artist.name} – ${t("topSongs")}`, thumbnail: artist.thumbnail })}>
                  {t("showAll")}
                </Button>
              )}
            </div>
            <div style={{ margin: "0 -16px" }}>
              {visibleTracks.map((t, i) => (
                <TrackRow key={t.videoId || i} track={t}
                  isPlaying={isPlaying && currentTrack?.videoId === t.videoId}
                  onPlay={() => onPlay(t, visibleTracks)}
                />
              ))}
            </div>
          </div>
          );
        })()}

        {/* Albums */}
        {artist.albums?.length > 0 && (() => {
          const displayAlbums = allAlbums ?? artist.albums;
          const canShowAll = !allAlbums && artist.albumsBrowseId && artist.albumsParams;
          return (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("albums")}</div>
                {canShowAll && (
                  <Button size="sm" variant="ghost" className="text-secondary font-medium h-7 px-3 min-w-0" isDisabled={allAlbumsLoading}
                    onPress={() => {
                      setAllAlbumsLoading(true);
                      fetch(`${API}/artist_albums?channelId=${encodeURIComponent(artist.albumsBrowseId)}&params=${encodeURIComponent(artist.albumsParams)}`)
                        .then(r => r.json())
                        .then(d => { if (!d.error) setAllAlbums(d.albums); })
                        .catch(() => {})
                        .finally(() => setAllAlbumsLoading(false));
                    }}>
                    {allAlbumsLoading ? "…" : t("showAll")}
                  </Button>
                )}
              </div>
              {allAlbums ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  {displayAlbums.map((a, i) => (
                    <MediaTile key={i} thumbnail={a.thumbnail} title={a.title}
                      subtitle={a.year ? `${a.year}${a.type ? ` · ${a.type}` : ""}` : null}
                      onOpen={() => onOpenAlbum({ browseId: a.browseId, title: a.title, thumbnail: a.thumbnail })}
                      onPlay={() => playAlbumDirect(a.browseId)}
                      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: a.browseId, title: a.title, thumbnail: a.thumbnail, type: "album" }); }} />
                  ))}
                </div>
              ) : (
                <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
                  {displayAlbums.map((a, i) => (
                    <MediaTile key={i} thumbnail={a.thumbnail} title={a.title} subtitle={a.year || null}
                      onOpen={() => onOpenAlbum({ browseId: a.browseId, title: a.title, thumbnail: a.thumbnail })}
                      onPlay={() => playAlbumDirect(a.browseId)}
                      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: a.browseId, title: a.title, thumbnail: a.thumbnail, type: "album" }); }} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Singles & EPs */}
        {artist.singles?.length > 0 && (() => {
          const displaySingles = allSingles ?? artist.singles;
          const canShowAll = !allSingles && artist.singlesBrowseId && artist.singlesParams;
          return (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("singles")}</div>
                {canShowAll && (
                  <Button size="sm" variant="ghost" className="text-secondary font-medium h-7 px-3 min-w-0" isDisabled={allSinglesLoading}
                    onPress={() => {
                      setAllSinglesLoading(true);
                      fetch(`${API}/artist_albums?channelId=${encodeURIComponent(artist.singlesBrowseId)}&params=${encodeURIComponent(artist.singlesParams)}`)
                        .then(r => r.json())
                        .then(d => { if (!d.error) setAllSingles(d.albums); })
                        .catch(() => {})
                        .finally(() => setAllSinglesLoading(false));
                    }}>
                    {allSinglesLoading ? "…" : t("showAll")}
                  </Button>
                )}
              </div>
              {allSingles ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  {displaySingles.map((s, i) => (
                    <MediaTile key={i} thumbnail={s.thumbnail} title={s.title}
                      subtitle={s.year ? `${s.year}${s.type ? ` · ${s.type}` : ""}` : null}
                      onOpen={() => onOpenAlbum({ browseId: s.browseId, title: s.title, thumbnail: s.thumbnail })}
                      onPlay={() => playAlbumDirect(s.browseId)}
                      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: s.browseId, title: s.title, thumbnail: s.thumbnail, type: "album" }); }} />
                  ))}
                </div>
              ) : (
                <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
                  {displaySingles.map((s, i) => (
                    <MediaTile key={i} thumbnail={s.thumbnail} title={s.title}
                      subtitle={s.year ? `${s.year} · ${t("single")}` : null}
                      onOpen={() => onOpenAlbum({ browseId: s.browseId, title: s.title, thumbnail: s.thumbnail })}
                      onPlay={() => playAlbumDirect(s.browseId)}
                      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: s.browseId, title: s.title, thumbnail: s.thumbnail, type: "album" }); }} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Videos */}
        {artist.videos?.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: "var(--t16)", fontWeight: 600, marginBottom: 12 }}>{t("videos")}</div>
            <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
              {artist.videos.map((v, i) => {
                const playVideo = () => onPlay(
                  { videoId: v.videoId, title: v.title, artists: v.artists, thumbnail: v.thumbnail, duration: "" },
                  artist.videos.map(x => ({ videoId: x.videoId, title: x.title, artists: x.artists, thumbnail: x.thumbnail, duration: "" }))
                );
                return (
                  <MediaTile key={i} shape="video" thumbnail={v.thumbnail} title={v.title} subtitle={v.views || null}
                    onOpen={playVideo} onPlay={playVideo} />
                );
              })}
            </div>
          </div>
        )}

        {/* Related Artists */}
        {artist.related?.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: "var(--t16)", fontWeight: 600, marginBottom: 12 }}>{t("relatedArtists")}</div>
            <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
              {artist.related.map((r, i) => (
                <MediaTile key={i} shape="circle" size={120} thumbnail={r.thumbnail} title={r.title} subtitle={r.subscribers || null}
                  onOpen={() => onOpenArtist?.({ browseId: r.browseId, artist: r.title })} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Profile Manager ────────────────────────────────────────────────────────

// Extracted outside LoginScreen to avoid remount on every parent render
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
      await invoke("open_login_window", { profileName: name });
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
        style={{ width: 420, maxWidth: "92vw", padding: 36, boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
        {onCancel && step !== "waiting" && (
          <Button isIconOnly size="sm" variant="ghost" className="absolute top-3.5 right-3.5 size-7 min-w-0 rounded-full text-muted hover:text-primary" onPress={onCancel}>
            <X size={16} />
          </Button>
        )}
        <Logo />

        {/* ── Start ── */}
        {step === "start" && (
          <>
            <div style={{ fontSize: "var(--t20)", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{t("welcome")}</div>
            <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)", textAlign: "center", marginBottom: 28, lineHeight: 1.6 }}>
              {t("loginDesc")}
            </div>
            <Btn onClick={startLogin}>
              {t("loginButton")}
            </Btn>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "var(--t11)", color: "var(--text-muted)" }}>{t("orSignInWithGoogle") ? t("orSignInWithGoogle").split(" ").slice(-2).join(" ") : "oder"}</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <Btn onClick={() => setStep("local-create")} secondary>
              {t("createLocalProfile")}
            </Btn>
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
            <div style={{ background: "var(--bg-elevated)", borderRadius: 10, padding: "12px 14px", marginBottom: 20, border: "0.5px solid var(--border)" }}>
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
        style={{ width: 420, maxWidth: "92vw", padding: 36, maxHeight: "calc(100vh - 40px)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
        {/* Logo + heading */}
        <img src="/Kodama%20Logo.png" alt="Kodama" style={{ width: 64, height: 64, alignSelf: "center", marginBottom: 14 }} />
        <div style={{ fontSize: "var(--t20)", fontWeight: 700, textAlign: "center", marginBottom: 6 }}>Kodama</div>
        <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)", textAlign: "center", marginBottom: 24 }}>{subtitle}</div>

        {/* Language rows */}
        <div className="scrollable" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22, overflowY: "auto", minHeight: 0 }}>
          {LANGUAGES.map(lang => {
            const active = selected === lang.code;
            return (
              <button key={lang.code} onClick={() => setSelected(lang.code)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
                  padding: "13px 14px", borderRadius: 12, cursor: "default", fontFamily: "var(--font)", textAlign: "left",
                  border: `1.5px solid ${active ? "var(--accent)" : "transparent"}`,
                  background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--bg-elevated)",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "var(--bg-elevated)"; }}
              >
                <div style={{ width: 44, height: 28, borderRadius: 5, overflow: "hidden", flexShrink: 0 }}
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
function FfmpegUpdateRow() {
  const t = useLang();
  const [info, setInfo] = useState(null);      // { installed, latest, updateAvailable }
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState("idle");  // idle | downloading | done | error
  const [percent, setPercent] = useState(0);

  const check = useCallback(async () => {
    setLoading(true);
    try { setInfo(await fetch(`${API}/ffmpeg/check-update`).then(r => r.json())); }
    catch { setInfo(null); }
    setLoading(false);
  }, []);
  useEffect(() => { check(); }, [check]);

  const startUpdate = () => {
    setPhase("downloading"); setPercent(0);
    const es = new EventSource(`${API}/ffmpeg/download?force=1`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.status === "progress") setPercent(d.percent || 0);
        else if (d.status === "done") {
          es.close(); setPercent(100); setPhase("done");
          try { localStorage.setItem("kiyoshi-ffmpeg-update-dismissed", info?.latest || ""); localStorage.setItem("kiyoshi-ffmpeg-ok", "1"); } catch {}
          check();
        } else if (d.status === "error") { es.close(); setPhase("error"); }
      } catch {}
    };
    es.onerror = () => { es.close(); setPhase("error"); };
  };

  const desc = loading ? t("checking")
    : !info?.installed ? (t("ffmpegNotInstalled") || "Nicht installiert")
    : info.updateAvailable ? `${info.installed} → ${info.latest}`
    : `${info.installed} · ${t("upToDate")}`;

  return (
    <>
      <SettingRow label="FFmpeg" description={desc} icon={<DownloadSimple size={15} />}>
        {phase === "downloading" ? (
          <span className="text-t12 text-muted flex items-center gap-1.5"><ArrowClockwise size={13} style={{ animation: "spin2 0.8s linear infinite" }} />{percent}%</span>
        ) : phase === "done" ? (
          <span className="text-t12 flex items-center gap-1.5" style={{ color: "#4caf50" }}><CheckCircle size={14} weight="fill" />{t("ffmpegUpdated")}</span>
        ) : info?.updateAvailable ? (
          <Button color="accent" variant="solid" size="sm" onPress={startUpdate}>{t("ffmpegUpdate")}</Button>
        ) : (!loading && info && !info.installed) ? (
          <Button color="accent" variant="solid" size="sm" onPress={startUpdate}>{t("ffmpegDownload")}</Button>
        ) : (
          <Button variant="ghost" size="sm" isIconOnly className="rounded-full text-muted" isDisabled={loading} onPress={check}>
            <ArrowClockwise size={14} style={loading ? { animation: "spin2 0.8s linear infinite" } : undefined} />
          </Button>
        )}
      </SettingRow>
      {phase === "downloading" && (
        <ProgressBar aria-label="FFmpeg update" value={percent} className="w-full gap-0! mt-1.5">
          <ProgressBarTrack className="h-[3px]!"><ProgressBarFill /></ProgressBarTrack>
        </ProgressBar>
      )}
      {phase === "error" && (
        <div className="text-t12 mt-1.5 flex items-center gap-1.5" style={{ color: "#ff7070" }}>{t("ffmpegUpdateFailed")}</div>
      )}
    </>
  );
}

// yt-dlp version + on-demand update. yt-dlp is pure Python, so the backend can swap in a
// newer wheel at runtime — lets the user fix YouTube extraction breakage ("Sign in to confirm
// you're not a bot") without waiting for a full app release.
function YtDlpUpdateRow() {
  const t = useLang();
  const [info, setInfo] = useState(null);      // { installed, latest, updateAvailable }
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState("idle");  // idle | updating | done | error

  const check = useCallback(async () => {
    setLoading(true);
    try { setInfo(await fetch(`${API}/ytdlp/check-update`).then(r => r.json())); }
    catch { setInfo(null); }
    setLoading(false);
  }, []);
  useEffect(() => { check(); }, [check]);

  const startUpdate = async () => {
    setPhase("updating");
    try {
      const d = await fetch(`${API}/ytdlp/update`, { method: "POST" }).then(r => r.json());
      if (d.ok) { setPhase("done"); check(); }
      else setPhase("error");
    } catch { setPhase("error"); }
  };

  const desc = loading ? t("checking")
    : !info?.installed ? "—"
    : info.updateAvailable ? `${info.installed} → ${info.latest}`
    : `${info.installed} · ${t("upToDate")}`;

  return (
    <SettingRow label="yt-dlp" description={desc} icon={<DownloadSimple size={15} />}>
      {phase === "updating" ? (
        <span className="text-t12 text-muted flex items-center gap-1.5"><ArrowClockwise size={13} style={{ animation: "spin2 0.8s linear infinite" }} /></span>
      ) : phase === "done" ? (
        <span className="text-t12 flex items-center gap-1.5" style={{ color: "#4caf50" }}><CheckCircle size={14} weight="fill" />{t("ytdlpUpdated") || "yt-dlp updated"}</span>
      ) : phase === "error" ? (
        <Button color="accent" variant="solid" size="sm" onPress={startUpdate}>{t("ffmpegUpdate") || "Update"}</Button>
      ) : info?.updateAvailable ? (
        <Button color="accent" variant="solid" size="sm" onPress={startUpdate}>{t("ffmpegUpdate") || "Update"}</Button>
      ) : (
        <Button variant="ghost" size="sm" isIconOnly className="rounded-full text-muted" isDisabled={loading} onPress={check}>
          <ArrowClockwise size={14} style={loading ? { animation: "spin2 0.8s linear infinite" } : undefined} />
        </Button>
      )}
    </SettingRow>
  );
}

// Small non-blocking banner offering an FFmpeg update when gyan.dev has a newer release
// than the installed build. Portaled to <body>; dismissal is remembered per target version.
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
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${phase === "error" ? "bg-[rgba(255,112,112,0.16)] text-[#ff7070]" : "bg-accent-dim text-accent"}`}>
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
      // Sidebar starts at the window's left edge; width ≈ cursor X (account for 8px left padding)
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX - 4));
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
      // Panel's right edge sits 8px from the window's right; width ≈ (rightEdge - cursorX).
      const w = Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, (window.innerWidth - 8) - ev.clientX));
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
  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem("kiyoshi-offline") === "true");
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
    } catch {
      const lang = getInitialLang();
      addToast(translate(lang, "downloadFailed"), "error");
      setUpdateDownloadProgress(null);
    } finally {
      setUpdateDownloading(false);
    }
  }, [updateInfo, addToast]);

  const installUpdate = useCallback(async () => {
    if (!updateInfo?._update) return;
    try {
      // Stop the Python backend before the NSIS installer runs,
      // otherwise it holds file locks and the installation fails.
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_server_cmd").catch(() => {});
      await updateInfo._update.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      const lang = getInitialLang();
      addToast(translate(lang, "downloadFailed"), "error");
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
  const [theme, setTheme] = useState(() => localStorage.getItem("kiyoshi-theme") || "dark");
  const [highContrast, setHighContrast] = useState(() => {
    const hc = localStorage.getItem("kiyoshi-high-contrast") === "true";
    if (hc) document.documentElement.setAttribute("data-highcontrast", "true");
    return hc;
  });
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
  const [ambientVisualizer, setAmbientVisualizer] = useState(() =>
    localStorage.getItem("kiyoshi-ambient-visualizer") !== "false"
  );
  const [instrumentalViz, setInstrumentalViz] = useState(() =>
    localStorage.getItem("kiyoshi-instrumental-viz") !== "false"
  );
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
  const [ambientBackground, setAmbientBackground] = useState(() =>
    localStorage.getItem("kiyoshi-ambient-bg") === "true"
  );
  const [flashbang, setFlashbang] = useState(false);
  const lightClickRef = useRef({ count: 0, lastTime: 0 });

  const [accentDynamic, setAccentDynamic] = useState(() => localStorage.getItem("kiyoshi-accent-dynamic") === "true");
  const handleAccentDynamicChange = useCallback((on) => {
    setAccentDynamic(on);
    localStorage.setItem("kiyoshi-accent-dynamic", on ? "true" : "false");
  }, []);
  const [accentSat, setAccentSat] = useState(() => { const v = parseFloat(localStorage.getItem("kiyoshi-accent-sat")); return isNaN(v) ? 0.5 : v; });
  const [accentLight, setAccentLight] = useState(() => { const v = parseFloat(localStorage.getItem("kiyoshi-accent-light")); return isNaN(v) ? 0.6 : v; });
  const handleAccentSatChange = useCallback((v) => { setAccentSat(v); localStorage.setItem("kiyoshi-accent-sat", String(v)); }, []);
  const handleAccentLightChange = useCallback((v) => { setAccentLight(v); localStorage.setItem("kiyoshi-accent-light", String(v)); }, []);

  const handleAccentChange = useCallback((color) => {
    setAccent(color);
    if (!accentDynamic) document.documentElement.style.setProperty("--accent", color);
    localStorage.setItem("kiyoshi-accent", color);
  }, [accentDynamic]);

  const handleThemeChange = useCallback((t) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("kiyoshi-theme", t);
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
  const [discordRpc, setDiscordRpc] = useState(() => localStorage.getItem("kiyoshi-discord-rpc") !== "false");

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
      try { setAccentSmooth(vibrantAccentFromImage(img, accentSat, accentLight)); }
      catch { document.documentElement.style.setProperty("--accent", accent); }
    };
    img.onerror = () => { if (!cancelled) document.documentElement.style.setProperty("--accent", accent); };
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

  const [closeTray, setCloseTray] = useState(() => localStorage.getItem("kiyoshi-close-tray") !== "false");
  useEffect(() => {
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_close_to_tray", { enabled: closeTray }).catch(() => {}));
  }, []);

  const [obsEnabled,   setObsEnabled]   = useState(() => localStorage.getItem("kiyoshi-obs-enabled") === "true");
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
    localStorage.setItem("kiyoshi-obs-enabled", enabled);
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
  const [showLyricsTranslation, setShowLyricsTranslation] = useState(() =>
    localStorage.getItem("kiyoshi-lyrics-translation") === "true"
  );
  const [lyricsTranslationLang, setLyricsTranslationLang] = useState(() =>
    localStorage.getItem("kiyoshi-lyrics-translation-lang") || "DE"
  );
  const [showRomaji, setShowRomaji] = useState(() =>
    localStorage.getItem("kiyoshi-lyrics-romaji") === "true"
  );
  const [syllableZoom, setSyllableZoom] = useState(() =>
    localStorage.getItem("kiyoshi-lyrics-syllable-zoom") === "true"
  );
  const [fluidLyrics, setFluidLyrics] = useState(() =>
    localStorage.getItem("kiyoshi-lyrics-fluid") === "true"
  );
  const [isCustomLyrics, setIsCustomLyrics] = useState(false);
  const [showAgentTags, setShowAgentTags] = useState(() => localStorage.getItem("kiyoshi-lyrics-agent-tags") !== "false");
  const importLyricsRef = useRef(null);
  const removeCustomLyricsRef = useRef(null);

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
      // Split spans the full window in fullscreen, so the ratio ≈ cursorX / window width.
      const r = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ev.clientX / window.innerWidth));
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
    const onMove = (e) => {
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
  }, [currentTrack, isPlaying, discordRpc]);

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
      // Built-in overlay server
      if (obsEnabled) {
        fetch(`${API}/overlay/push`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(500), body: JSON.stringify(payload),
        }).catch(() => {});
      }
    };

    report();
    const id = setInterval(report, 1000);
    return () => clearInterval(id);
  }, [currentTrack, isPlaying, obsEnabled]);

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
        setCollection(c => c ? { ...c, title: c.forcedTitle || msg.title, thumbnail: msg.thumbnail || c.thumbnail, total: msg.total, cached: msg.cached || false } : c);
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

  const [animations, setAnimations] = useState(() => localStorage.getItem("kiyoshi-animations") !== "false");
  // Defer the queue panel's ambient blur until the slide-in transition has settled.
  useEffect(() => {
    if (!queueOpen) { setQueueSettled(false); return; }
    const id = setTimeout(() => setQueueSettled(true), animations ? 320 : 0);
    return () => clearTimeout(id);
  }, [queueOpen, animations]);
  const [lyricsFontSize, setLyricsFontSize] = useState(() => {
    const s = parseInt(localStorage.getItem("kiyoshi-lyrics-font-size"));
    return isNaN(s) ? 32 : s;
  });
  const [lyricsTranslationFontSize, setLyricsTranslationFontSize] = useState(() => {
    const s = parseInt(localStorage.getItem("kiyoshi-lyrics-translation-font-size"));
    return isNaN(s) ? 20 : s;
  });
  const [lyricsRomajiFontSize, setLyricsRomajiFontSize] = useState(() => {
    const s = parseInt(localStorage.getItem("kiyoshi-lyrics-romaji-font-size"));
    return isNaN(s) ? 18 : s;
  });
  const [hideExplicit, setHideExplicit] = useState(() => localStorage.getItem("kiyoshi-hide-explicit") === "true");
  const [hideUserHandle, setHideUserHandle] = useState(() => localStorage.getItem("kiyoshi-hide-handle") === "true");
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

  const CSS_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22];
  const [appFontScale, setAppFontScale] = useState(() => {
    const saved = parseFloat(localStorage.getItem("kiyoshi-font-scale"));
    const scale = FONT_STEPS.includes(saved) ? saved : 1.0;
    // Set CSS vars synchronously to avoid flash of unstyled text
    CSS_FONT_SIZES.forEach(s => {
      document.documentElement.style.setProperty(`--t${s}`, `${Math.round(s * scale)}px`);
    });
    return scale;
  });

  useEffect(() => {
    CSS_FONT_SIZES.forEach(s => {
      document.documentElement.style.setProperty(`--t${s}`, `${Math.round(s * appFontScale)}px`);
    });
  }, [appFontScale]);

  // uiZoom wird direkt im App-Container angewendet (kein document.documentElement),
  // damit position:fixed / 100vh-Werte korrekt bleiben.
  const [lyricsProviders, setLyricsProviders] = useState(() => {
    const validIds = new Set(DEFAULT_LYRICS_PROVIDERS.map(p => p.id));
    try {
      const saved = localStorage.getItem("kiyoshi-lyrics-providers");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Remove providers that no longer exist (e.g. old Kimuco entry)
        const filtered = parsed.filter(p => validIds.has(p.id));
        // Add any new default providers not yet in the saved list
        const ids = filtered.map(p => p.id);
        const merged = [...filtered, ...DEFAULT_LYRICS_PROVIDERS.filter(p => !ids.includes(p.id))];
        return merged;
      }
    } catch {}
    return DEFAULT_LYRICS_PROVIDERS;
  });
  // Migration: add newly introduced providers / remove obsolete ones
  useEffect(() => {
    const validIds = new Set(DEFAULT_LYRICS_PROVIDERS.map(p => p.id));
    setLyricsProviders(current => {
      const filtered = current.filter(p => validIds.has(p.id));
      const ids = filtered.map(p => p.id);
      const missing = DEFAULT_LYRICS_PROVIDERS.filter(p => !ids.includes(p.id));
      if (missing.length === 0 && filtered.length === current.length) return current;
      const merged = [...filtered, ...missing];
      localStorage.setItem("kiyoshi-lyrics-providers", JSON.stringify(merged));
      return merged;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [autoplay, setAutoplay] = useState(() => localStorage.getItem("kiyoshi-autoplay") !== "false");
  const [crossfade, setCrossfade] = useState(() => {
    const s = parseInt(localStorage.getItem("kiyoshi-crossfade"));
    return isNaN(s) ? 0 : s;
  });
  // Progressive playback (default): stream the song for a fast start. Off = classic full
  // download first (more stable on weak devices). Both stay in the Rust audio core.
  const [playbackProgressive, setPlaybackProgressive] = useState(
    () => localStorage.getItem("kodama-playback-mode") !== "classic"
  );
  // App-icon personalization. Applies live to taskbar/window/tray (+ macOS Dock & bundle)
  // via the Rust `set_app_icon` command. The static pinned-shortcut icon stays as installed.
  const [appIcon, setAppIcon] = useState(() => localStorage.getItem("kodama-app-icon") || APP_ICON_DEFAULT);
  const applyAppIcon = useCallback(async (file) => {
    try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_app_icon", { file }); }
    catch (e) { console.error("[AppIcon] set failed:", e); }
  }, []);
  const handleAppIconChange = useCallback((file) => {
    setAppIcon(file);
    localStorage.setItem("kodama-app-icon", file);
    applyAppIcon(file);
  }, [applyAppIcon]);
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
  const [hasProfile, setHasProfile] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
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
      firstTimer = setTimeout(() => { if (!cancelled) rotate(); }, 25000);
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
    await fetch(`${API}/profiles/switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    await fetchProfiles();
    setView("home"); setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false); setSearchQuery(""); setAppKey(k => k + 1);
    window.__activeProfile = name; window.dispatchEvent(new CustomEvent("profile-switched"));
  }, [fetchProfiles]);

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
  }, [likedIds]);

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
      localStorage.setItem("kiyoshi-offline", String(next));
      if (next) setView("downloads");
      return next;
    });
  }, []);

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
          // Auth invalid — clear stale cache and show login
          try { localStorage.removeItem("kiyoshi-profiles-cache"); } catch {}
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
    const lang = localStorage.getItem("kiyoshi-lang") || "de";
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
      }
    };
    // capture:true so we intercept before the WebView can handle Ctrl+= etc.
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [isPlaying, audioRef, overlayOpen, currentTrack, setUiZoom, splitView, openFeedback]);

  // Animated view wrapper
  const AnimatedView = useCallback(({ children }) => (
    <div key={view} style={{
      animation: animations ? "fadeSlideIn 0.28s cubic-bezier(0.22,1,0.36,1) both" : "none",
    }}>
      {children}
    </div>
  ), [view, animations]);

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
    <LangContext.Provider value={language}>
    <AnimationContext.Provider value={animations}>
    <FontScaleContext.Provider value={appFontScale}>
    <ZoomContext.Provider value={uiZoom}>
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
          <Sidebar view={view} setView={navigateTo} onSearch={handleSearch} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} onOpenSettings={() => setSettingsOpen(true)} onOpenAccountTab={() => { setSettingsTab("account"); setSettingsOpen(true); }} onOpenUpdateTab={() => { setSettingsTab("update"); setSettingsOpen(true); }} onCloseOverlay={() => setOverlayOpen(false)} onOpenPlaylist={(pl) => openPlaylist(pl, view)} onOpenAlbum={(item) => openAlbum(item, view)} onOpenArtist={(item) => openArtist(item, view)} onAddRecent={addRecentPlaylist} onContextMenu={openContextMenu} currentProfileData={profiles.find(p => p.active)} onOpenProfileSwitcher={() => setShowProfileSwitcher(true)} profiles={profiles}
            onSwitchProfile={async (name) => {
              await fetch(`${API}/profiles/switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
              await fetchProfiles();
              setView("home"); setCurrentTrack(null); setQueue([]); setCollection(null); setOverlayOpen(false); setQueueOpen(false); setSearchQuery(""); setAppKey(k => k + 1);
              window.__activeProfile = name; window.dispatchEvent(new CustomEvent("profile-switched"));
            }}
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
            updateInfo={updateInfo}
            offlineMode={offlineMode}
            isActuallyOffline={isActuallyOffline}
            onToggleOffline={handleToggleOffline}
            onRefreshView={() => setViewRefreshKey(k => k + 1)}
            obsEnabled={obsEnabled}
            onOpenOverlaySettings={() => { setSettingsTab("overlay"); setSettingsOpen(true); }}
            onOpenNews={openNews}
            onOpenFeedback={openFeedback}
            newsUnread={newsUnreadCount}
            settingsOpen={settingsOpen}
            hideUserHandle={hideUserHandle}
          />
          {(settingsOpen || settingsClosing) && !fullscreen && (
            <SettingsSidebarContent
              tab={settingsTab}
              setTab={setSettingsTab}
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
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 50 }}
              onMouseEnter={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = "1"; }}
              onMouseLeave={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = sidebarResizing ? "1" : "0"; }}
            >
              <div style={{
                position: "absolute", top: "50%", right: 1, transform: "translateY(-50%)",
                width: 3, height: 44, borderRadius: 2, background: "var(--accent)",
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
          <div key={appKey} className="scrollable" style={{ height: "100%", overflowY: "auto" }}>
            {view === "home" && <AnimatedView key={`home-${viewRefreshKey}`}><HomeView displayName={profiles.find(p => p.active)?.displayName} onPlay={handlePlay} onOpenPlaylist={(item) => openPlaylist(item, "home")} onOpenAlbum={(item) => openAlbum(item, "home")} onOpenArtist={(item) => openArtist(item, "home")} onContextMenu={openContextMenu} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track })} hideExplicit={hideExplicit} /></AnimatedView>}
            {view === "search" && <AnimatedView key={`search-${viewRefreshKey}`}><SearchView query={searchQuery} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenArtist={openArtist} onOpenAlbum={(item) => openAlbum(item, "search")} onOpenPlaylist={(item) => openPlaylist(item, "search")} onContextMenu={openContextMenu} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track })} hideExplicit={hideExplicit} /></AnimatedView>}
            {view === "liked" && <AnimatedView key={`liked-${viewRefreshKey}`}><LikedView onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenArtist={openArtist} onOpenAlbum={(item) => openAlbum(item, "liked")} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track })} cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} onDownloadSong={handleDownloadSong} hideExplicit={hideExplicit} onToggleLike={handleToggleLike} likedIds={likedIds} selectedTracks={selectedTracks} onToggleSelect={toggleTrackSelection} onSelectAll={selectAllTracks} onBack={goBack} /></AnimatedView>}
            {view === "history" && <AnimatedView key={`history-${viewRefreshKey}`}><HistoryView onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenArtist={openArtist} onOpenAlbum={(item) => openAlbum(item, "history")} onTrackContextMenu={(e, track, extra) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track, ...extra })} cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} onDownloadSong={handleDownloadSong} hideExplicit={hideExplicit} onBack={goBack} /></AnimatedView>}
            {view === "library" && <AnimatedView key={`library-${viewRefreshKey}`}><LibraryView onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenPlaylist={openPlaylist} onOpenAlbum={openAlbum} onOpenArtist={openArtist} onContextMenu={openContextMenu} /></AnimatedView>}
            {view === "collection" && collection && <AnimatedView key={`collection-${viewRefreshKey}`}><CollectionView title={collection.title} thumbnail={collection.thumbnail} tracks={collection.tracks} total={collection.total} loading={collection.loading} progress={collection.progress || 0} cached={collection.cached} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onBack={goBack} onOpenArtist={openArtist} onOpenAlbum={(item) => openAlbum(item, "collection")} isAlbum={collection.isAlbum} albumArtists={collection.albumArtists} albumArtistBrowseId={collection.albumArtistBrowseId} year={collection.year} onRefresh={() => { if (collection.isAlbum) openAlbum({ browseId: collection.browseId, title: collection.title, thumbnail: collection.thumbnail }, collection.fromView, true); else openPlaylist({ playlistId: collection.playlistId, title: collection.title, thumbnail: collection.thumbnail, forcedTitle: collection.forcedTitle }, collection.fromView, true); }} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track, playlistId: collection.isAlbum ? null : collection.playlistId })} cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} premiumSongIds={premiumSongIds} onDownloadSong={handleDownloadSong} onDownloadAll={(tracks) => handleDownloadAll(tracks, { title: collection.title, thumbnail: collection.thumbnail, artists: collection.albumArtists || "" })} onRemoveAll={handleRemoveAllDownloads} hideExplicit={hideExplicit} onToggleLike={handleToggleLike} likedIds={likedIds} selectedTracks={selectedTracks} onToggleSelect={toggleTrackSelection} onSelectAll={selectAllTracks} /></AnimatedView>}
            {view === "artist" && artistView && <AnimatedView key={`artist-${viewRefreshKey}`}><ArtistView browseId={artistView.browseId} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} onOpenAlbum={(item) => openAlbum(item, "artist")} onOpenPlaylist={(item) => openPlaylist(item, "artist")} onOpenArtist={(item) => openArtist(item, "artist")} onBack={goBack} onContextMenu={openContextMenu} onTogglePin={togglePin} isPinned={pinnedIds.includes(artistView.browseId)} hideExplicit={hideExplicit} onStartRadio={handlePlay} /></AnimatedView>}
            {view === "downloads" && <AnimatedView key={`downloads-${viewRefreshKey}`}><DownloadsView onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} premiumSongIds={premiumSongIds} onDownloadSong={handleDownloadSong} onTrackContextMenu={(e, track) => setTrackContextMenu({ x: e.clientX, y: e.clientY, track })} hideExplicit={hideExplicit} onOpenAlbum={(item) => openAlbum(item, "downloads")} onOpenArtist={openArtist} onToggleLike={handleToggleLike} likedIds={likedIds} /></AnimatedView>}
            {isOffline && view !== "downloads" && (
              <div style={{
                position: "sticky", bottom: 0, left: 0, right: 0,
                background: "rgba(240,180,41,0.12)", borderTop: "1px solid rgba(240,180,41,0.3)",
                color: "#f0b429", display: "flex", alignItems: "center", gap: 8,
                padding: "6px 16px", fontSize: 13, zIndex: 10,
              }}>
                <WifiX size={15} weight="bold" />
                {translate(language, "offlineBanner")}
              </div>
            )}
            {/* Spacer so content scrolls clear of the floating player bar */}
            <div style={{ height: 97, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
          </div>
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
                <div style={{
                  pointerEvents: "auto",
                  display: "flex", flexDirection: "column", alignItems: "stretch",
                  background: "var(--bg-elevated)", border: "0.5px solid var(--border)",
                  borderRadius: 16,
                  boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
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
                    {view === "collection" && collection?.playlistId && (
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
                </div>
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
            queueOpen={queueOpen}
            onToggleQueue={() => setQueueOpen(q => !q)}
            crossfade={crossfade}
            crossfadeOverrides={crossfadeOverrides}
            playbackProgressive={playbackProgressive}
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
            lyricsProviders={lyricsProviders}
            currentLyricsSource={currentLyricsSource}
            onSwitchLyricsProvider={(id) => setForcedLyricsProvider(id)}
            failedLyricsProviders={failedLyricsProviders}
            language={language}
            showLyricsTranslation={showLyricsTranslation}
            onToggleLyricsTranslation={() => {
              const next = !showLyricsTranslation;
              setShowLyricsTranslation(next);
              localStorage.setItem("kiyoshi-lyrics-translation", String(next));
            }}
            lyricsTranslationLang={lyricsTranslationLang}
            onSetLyricsTranslationLang={(lang) => {
              setLyricsTranslationLang(lang);
              localStorage.setItem("kiyoshi-lyrics-translation-lang", lang);
            }}
            showRomaji={showRomaji}
            onToggleRomaji={() => {
              const next = !showRomaji;
              setShowRomaji(next);
              localStorage.setItem("kiyoshi-lyrics-romaji", String(next));
            }}
            isCustomLyrics={isCustomLyrics}
            onImportLyrics={() => importLyricsRef.current?.()}
            onRemoveCustomLyrics={() => removeCustomLyricsRef.current?.()}
            onPremiumDetected={(videoId) => setPremiumSongIds(prev => new Set(prev).add(videoId))}
            onCreatePlaylist={() => setCreatePlaylistOpen(true)}
          />
          </div>
          </div>
          </div>
        <div style={{
          position: "absolute",
          top: overlayOpen ? (fullscreen ? 0 : 8) : "100%",
          left: fullscreen ? 0 : ((sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4),
          right: fullscreen ? 0 : (queueOpen ? queueWidth + 16 : 8),
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
              backgroundImage: currentTrack.thumbnail ? `url(${hiResThumb(currentTrack.thumbnail)})` : "none",
              backgroundSize: "cover", backgroundPosition: "center",
              filter: "blur(24px) brightness(0.5)",
              transform: "scale(1.08)",
            }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
          </>)}
          {currentTrack && (() => {
            // Split (fullscreen only): cover/visualizer left, lyrics right. Both stay mounted —
            // only width/opacity animate, so there's no remount/refetch when switching modes.
            const splitActive = fullscreen && splitView;
            const coverPct = `${(splitRatio * 100).toFixed(2)}%`;
            const lyricsPct = `${((1 - splitRatio) * 100).toFixed(2)}%`;
            // No width animation while dragging (snappy), otherwise the smooth mode transition.
            const widthTransition = splitResizing ? "none" : "width 0.4s cubic-bezier(0.4,0,0.2,1)";
            const paneTransition = `opacity 0.35s ease, ${widthTransition}`;
            return (<>
              <div style={{
                position: "absolute", top: 0, bottom: 0, right: 0,
                width: splitActive ? lyricsPct : "100%",
                opacity: splitActive ? 1 : (showLyrics ? 1 : 0),
                transition: paneTransition,
                pointerEvents: (splitActive || showLyrics) ? "all" : "none",
              }}>
                <LyricsOverlay track={currentTrack} audioRef={audioRef} onClose={() => setOverlayOpen(false)} fontSize={lyricsFontSize} providers={lyricsProviders} refetchKey={lyricsRefetchKey} onAddToast={addToast} language={language} forcedProvider={forcedLyricsProvider} onSourceChange={setCurrentLyricsSource} onProviderFailed={(id) => setFailedLyricsProviders(s => new Set([...s, id]))} showTranslation={showLyricsTranslation} translationLang={lyricsTranslationLang} translationFontSize={lyricsTranslationFontSize} showRomaji={showRomaji} romajiFontSize={lyricsRomajiFontSize} onCustomLyricsStatusChange={setIsCustomLyrics} importLyricsRef={importLyricsRef} removeCustomLyricsRef={removeCustomLyricsRef} showAgentTags={showAgentTags} ambientVisualizer={ambientVisualizer} syllableZoom={syllableZoom} fluidLyrics={fluidLyrics} ambientBackground={ambientBackground} fullscreen={fullscreen} playerBarVisible={playerVisible} onInstrumentalChange={handleInstrumentalChange} />
              </div>
              <div style={{
                position: "absolute", top: 0, bottom: 0, left: 0,
                width: splitActive ? coverPct : "100%",
                opacity: splitActive ? 1 : (showLyrics ? 0 : 1),
                transition: paneTransition,
                pointerEvents: (splitActive || !showLyrics) ? "all" : "none",
                borderRight: splitActive ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}>
                <CoverView track={currentTrack} isPlaying={isPlaying} onClose={() => setOverlayOpen(false)} ambientVisualizer={ambientVisualizer} vizConfig={vizConfig} narrow={splitActive} />
              </div>
              {/* Drag handle between the two panes (mirrors the sidebar/queue handles) */}
              {splitActive && (
                <div
                  onMouseDown={startSplitResize}
                  style={{ position: "absolute", top: 0, bottom: 0, left: coverPct, width: 12, marginLeft: -6, cursor: "ew-resize", zIndex: 6 }}
                  onMouseEnter={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = "1"; }}
                  onMouseLeave={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = splitResizing ? "1" : "0"; }}
                >
                  <div style={{ position: "absolute", left: 5, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.55)", opacity: splitResizing ? 1 : 0, transition: "opacity 0.15s", pointerEvents: "none" }} />
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
              style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 50 }}
              onMouseEnter={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = "1"; }}
              onMouseLeave={e => { const bar = e.currentTarget.firstChild; if (bar) bar.style.opacity = queueResizing ? "1" : "0"; }}
            >
              <div style={{
                position: "absolute", top: "50%", left: 1, transform: "translateY(-50%)",
                width: 3, height: 44, borderRadius: 2, background: "var(--accent)",
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
            crossfade={crossfade}
            crossfadeOverrides={crossfadeOverrides}
            onSetCrossfadeOverride={setCrossfadeOverride}
            onRemoveCrossfadeOverride={removeCrossfadeOverride}
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


      {(settingsOpen || settingsClosing) && (
        <div style={{
          position: "absolute",
          top: fullscreen ? 0 : 8,
          left: fullscreen ? 0 : ((sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4),
          right: fullscreen ? 0 : 8,
          bottom: fullscreen ? 0 : 8,
          zIndex: 150,
          borderRadius: fullscreen ? 0 : "var(--r-xl)",
          overflow: "hidden",
          animation: animations ? (settingsClosing ? "fadeSlideOut 0.22s cubic-bezier(0.4,0,0.2,1) forwards" : "fadeSlideIn 0.28s cubic-bezier(0.4,0,0.2,1)") : undefined,
        }}>
          <SettingsPanel
            onClose={closeSettings}
            accounts={profiles} activeAccount={profiles.find(p => p.active)}
            onAccountSwitch={handleAccountSwitch} onAccountAdd={handleAccountAdd}
            onAccountReauth={handleAccountReauth} onAccountRemove={handleAccountRemove}
            onAccountRename={handleAccountRename} onAccountLogout={handleAccountLogout} onAccountAvatarChange={handleAccountAvatarChange}
            accent={accent}
            onAccentChange={handleAccentChange}
            accentDynamic={accentDynamic}
            onAccentDynamicChange={handleAccentDynamicChange}
            accentSat={accentSat}
            onAccentSatChange={handleAccentSatChange}
            accentLight={accentLight}
            onAccentLightChange={handleAccentLightChange}
            theme={theme}
            onThemeChange={handleThemeChange}
            animations={animations}
            onAnimationsChange={v => { setAnimations(v); localStorage.setItem("kiyoshi-animations", v); }}
            lyricsFontSize={lyricsFontSize}
            onLyricsFontSizeChange={v => { setLyricsFontSize(v); localStorage.setItem("kiyoshi-lyrics-font-size", v); }}
            lyricsTranslationFontSize={lyricsTranslationFontSize}
            onLyricsTranslationFontSizeChange={v => { setLyricsTranslationFontSize(v); localStorage.setItem("kiyoshi-lyrics-translation-font-size", v); }}
            lyricsRomajiFontSize={lyricsRomajiFontSize}
            onLyricsRomajiFontSizeChange={v => { setLyricsRomajiFontSize(v); localStorage.setItem("kiyoshi-lyrics-romaji-font-size", v); }}
            lyricsProviders={lyricsProviders}
            onLyricsProvidersChange={v => { setLyricsProviders(v); localStorage.setItem("kiyoshi-lyrics-providers", JSON.stringify(v)); }}
            autoplay={autoplay}
            onAutoplayChange={v => { setAutoplay(v); localStorage.setItem("kiyoshi-autoplay", v); }}
            appIcon={appIcon}
            onAppIconChange={handleAppIconChange}
            crossfade={crossfade}
            onCrossfadeChange={v => { setCrossfade(v); localStorage.setItem("kiyoshi-crossfade", v); }}
            crossfadeOverrides={crossfadeOverrides}
            onRemoveCrossfadeOverride={removeCrossfadeOverride}
            playbackProgressive={playbackProgressive}
            onPlaybackProgressiveChange={v => { setPlaybackProgressive(v); localStorage.setItem("kodama-playback-mode", v ? "progressive" : "classic"); }}
            closeTray={closeTray}
            onCloseTrayChange={v => { setCloseTray(v); localStorage.setItem("kiyoshi-close-tray", String(v)); import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_close_to_tray", { enabled: v }).catch(() => {})); }}
            discordRpc={discordRpc}
            onDiscordRpcChange={(v) => { setDiscordRpc(v); localStorage.setItem("kiyoshi-discord-rpc", v); if (!v) import("@tauri-apps/api/core").then(({ invoke }) => invoke("clear_discord_rpc").catch(() => {})); }}
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
            onHideExplicitChange={v => { setHideExplicit(v); localStorage.setItem("kiyoshi-hide-explicit", v); }}
            hideUserHandle={hideUserHandle}
            onToggleHideUserHandle={v => { setHideUserHandle(v); localStorage.setItem("kiyoshi-hide-handle", String(v)); }}
            uiZoom={uiZoom}
            onUiZoomChange={v => { setUiZoom(v); localStorage.setItem("kiyoshi-ui-zoom", v); }}
            appFontScale={appFontScale}
            onFontScaleChange={v => { setAppFontScale(v); localStorage.setItem("kiyoshi-font-scale", v); }}
            showRomaji={showRomaji}
            onToggleRomaji={() => { const next = !showRomaji; setShowRomaji(next); localStorage.setItem("kiyoshi-lyrics-romaji", String(next)); }}
            showAgentTags={showAgentTags}
            onToggleAgentTags={() => { const next = !showAgentTags; setShowAgentTags(next); localStorage.setItem("kiyoshi-lyrics-agent-tags", String(next)); }}
            syllableZoom={syllableZoom}
            onToggleSyllableZoom={() => { const next = !syllableZoom; setSyllableZoom(next); localStorage.setItem("kiyoshi-lyrics-syllable-zoom", String(next)); }}
            fluidLyrics={fluidLyrics}
            onToggleFluidLyrics={() => { const next = !fluidLyrics; setFluidLyrics(next); localStorage.setItem("kiyoshi-lyrics-fluid", String(next)); }}
            highContrast={highContrast}
            onToggleHighContrast={() => {
              const next = !highContrast;
              setHighContrast(next);
              document.documentElement.setAttribute("data-highcontrast", String(next));
              localStorage.setItem("kiyoshi-high-contrast", String(next));
            }}
            appFont={appFont}
            onAppFontChange={handleAppFontChange}
            ambientVisualizer={ambientVisualizer}
            onToggleAmbientVisualizer={() => {
              const next = !ambientVisualizer;
              setAmbientVisualizer(next);
              localStorage.setItem("kiyoshi-ambient-visualizer", String(next));
            }}
            vizConfig={vizConfig}
            onUpdateViz={updateViz}
            instrumentalViz={instrumentalViz}
            onToggleInstrumentalViz={v => { setInstrumentalViz(v); localStorage.setItem("kiyoshi-instrumental-viz", v ? "true" : "false"); if (!v && autoCoverRef.current) { autoCoverRef.current = false; setShowLyrics(true); } }}
            vizPreviewTrack={currentTrack}
            vizPreviewPlaying={isPlaying}
            ambientBackground={ambientBackground}
            onToggleAmbientBackground={() => {
              const next = !ambientBackground;
              setAmbientBackground(next);
              localStorage.setItem("kiyoshi-ambient-bg", String(next));
            }}
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
          />
        )}

        {createPlaylistOpen && (
          <CreatePlaylistModal
            t={(key) => translate(language, key)}
            onClose={() => { setCreatePlaylistOpen(false); setCreatePlaylistForSelection(false); }}
            onCreated={async (id, title) => {
              if (createPlaylistForSelection && selectedTracks.size > 0) {
                const tracks = Array.from(selectedTracks.values());
                try {
                  await fetch(`${API}/playlist/${id}/add`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ videoIds: tracks.map(t => t.videoId), tracks }),
                  });
                } catch {}
                clearSelection();
                setCreatePlaylistForSelection(false);
              }
              openPlaylist({ playlistId: id, title, thumbnail: "" }, view);
            }}
          />
        )}

        {/* Add to playlist — dedicated modal (search + rich playlist rows) */}
        {addToPlaylistFor && (
          <AddToPlaylistModal
            tracks={addToPlaylistFor.tracks}
            onClose={() => setAddToPlaylistFor(null)}
            onNewPlaylist={() => { if (addToPlaylistFor.fromSelection) setCreatePlaylistForSelection(true); setCreatePlaylistOpen(true); }}
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
                ? <CheckCircle size={14} weight="fill" className="text-[#4caf50] shrink-0" />
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
                        ? <CheckCircle size={15} weight="fill" className="text-[#4caf50] shrink-0" />
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
            try {
              await fetch(`${API}/playlist/${trackContextMenu.playlistId}/remove`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videos: [{ videoId: track.videoId, setVideoId: track.setVideoId }] }),
              });
              setCollection(c => c ? { ...c, tracks: c.tracks.filter(t => t.videoId !== track.videoId || t.setVideoId !== track.setVideoId) } : c);
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
                          onSelect={() => copyShare(`${KODAMA_SHARE_BASE}?v=${track.videoId}`)} />
                        <CtxItem icon={<Copy size={15} />} label={translate(language, "copyKodamaLink")}
                          onSelect={() => copyShare(`kodama://song/${track.videoId}`)} />
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
          const isUserPlaylist = pl?.playlistId && pl?.type !== "album";
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
              try {
                await fetch(`${API}/playlist/${deleteDialog.playlistId}`, { method: "DELETE" });
                window.dispatchEvent(new Event("kiyoshi-library-updated"));
                removeRecentPlaylist(deleteDialog.playlistId);
                if (view === "collection" && collection?.playlistId === deleteDialog.playlistId) setView("library");
              } catch {}
              setDeleteDialog(null);
            }}
          />
        )}
      </div>
    </ZoomContext.Provider>
    </FontScaleContext.Provider>
    </AnimationContext.Provider>
    </LangContext.Provider>
    </IconContext.Provider>
  );
}
