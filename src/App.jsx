import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, CardRoot, ProgressBar, ProgressBarFill, ProgressBarTrack, toast, ToastProvider } from "@heroui/react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { API } from "./shared/api/client.js";
import { thumb } from "./shared/api/thumbnails.js";
import { AppShell } from "./app/AppShell.jsx";
import { storageCodecs, usePersistedState } from "./shared/hooks/use-persisted-state.js";
import { useNetworkStatus } from "./app/hooks/use-network-status.js";
import { useObsOverlay } from "./features/overlay/hooks/use-obs-overlay.js";
import { useRemoteControl } from "./features/remote/hooks/use-remote-control.js";
import { useDownloadManager } from "./features/downloads/hooks/use-download-manager.js";
import { useProfiles } from "./features/profiles/hooks/use-profiles.js";
import { LANGUAGES, translate } from "./i18n.js";
import { startAudioLevels } from "./audioLevels.js";
import { ArrowClockwise, Check, CheckCircle, IconContext, X } from "./icons.jsx";

import {
  AnimationContext,
  FontScaleContext,
  LangContext,
  TrackNumberContext,
  useLang,
  ZoomContext,
} from "./context.jsx";
import { DEFAULT_LYRICS_PROVIDERS } from "./lyrics/providers.js";
import { itemId, profileKey } from "./features/music/lib/playlist-id.js";
import { useMusicNavigation } from "./features/music/hooks/use-music-navigation.js";
import { VIZ_DEFAULTS } from "./features/player/player-ui.jsx";
import { usePlayerController } from "./features/player/use-player-controller.js";
import { PlayerProvider } from "./features/player/player-context.jsx";
import { ProfileProvider } from "./features/profiles/profile-context.jsx";
import { DownloadProvider } from "./features/downloads/download-context.jsx";
import { useLastfmClient } from "./features/integrations/lastfm.js";
import { SettingsProviders } from "./features/settings/settings-context.jsx";

const appWindow = getCurrentWebviewWindow();

const IPV4_FIRST_ENDPOINTS = ["/operation/network/ipv4-first", "/network/ipv4-first"];

async function fetchIpv4FirstSetting(options = {}) {
  let lastError = null;
  for (const path of IPV4_FIRST_ENDPOINTS) {
    try {
      const res = await fetch(`${API}${path}`, options);
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("IPv4-first setting request failed");
}

// openOverlayEditor moved to src/app/AppShell.jsx (Step 13a-i).

// openComposer (community-lyrics editor bridge) moved to features/lyrics/LyricsOverlay.jsx.

// SHA-256 hash of a PIN string (hex). Used for PIN protection storage — never stores plain text.
async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// APP_VERSION (Vite-injected) moved to src/app/AppShell.jsx — its only consumer, BugReportModal,
// lives there now.

// News feed + anonymous heartbeat now live in app/hooks/use-news.js.

// IS_MAC moved to src/app/AppShell.jsx (Step 13a-i) — App no longer renders any platform-specific
// chrome directly.

// ─── Update Checker (GitHub Releases) ───────────────────────────────────────
const APP_TAG = "v1.0.0";
const GITHUB_RELEASES_API =
  "https://api.github.com/repos/KiyoshiTheDevil/Kodama/releases?per_page=1";

// Detect the best matching language from the browser/OS locale.
// Falls back to "en" for anything that isn't explicitly supported.
function detectSystemLang() {
  const supported = ["de", "en"]; // extend when more locales are added
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || "en"];
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

// Stepped values for the zoom and font-size sliders
const ZOOM_STEPS = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
const ZOOM_LABELS = ["80%", "90%", "100%", "110%", "120%", "130%", "140%", "150%"];
const FONT_STEPS = [0.85, 0.93, 1.0, 1.1, 1.2, 1.35, 1.5];
const FONT_LABELS = FONT_STEPS.map((s) => `${Math.round(13 * s)}px`);
const UI_ZOOM_STORAGE = {
  serialize: storageCodecs.number.serialize,
  deserialize: (raw) => {
    const value = storageCodecs.number.deserialize(raw);
    if (!ZOOM_STEPS.includes(value)) throw new TypeError("Stored zoom value is unsupported");
    return value;
  },
};
const FONT_SCALE_STORAGE = {
  serialize: storageCodecs.number.serialize,
  deserialize: (raw) => {
    const value = storageCodecs.number.deserialize(raw);
    if (!FONT_STEPS.includes(value)) throw new TypeError("Stored font scale is unsupported");
    return value;
  },
};

const DEFAULT_SHORTCUTS = {
  playPause: "Space",
  nextTrack: "ArrowRight",
  prevTrack: "ArrowLeft",
  volUp: "ArrowUp",
  volDown: "ArrowDown",
  fullscreen: "KeyF",
  mute: "KeyM",
  lyrics: "KeyL",
  seekBack: "Comma",
  seekForward: "Period",
  zoomIn: "Ctrl+Equal",
  zoomOut: "Ctrl+Minus",
};

const CODE_DISPLAY_FALLBACK = {
  Space: "Space",
  ArrowRight: "→",
  ArrowLeft: "←",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  KeyA: "A",
  KeyB: "B",
  KeyC: "C",
  KeyD: "D",
  KeyE: "E",
  KeyF: "F",
  KeyG: "G",
  KeyH: "H",
  KeyI: "I",
  KeyJ: "J",
  KeyK: "K",
  KeyL: "L",
  KeyM: "M",
  KeyN: "N",
  KeyO: "O",
  KeyP: "P",
  KeyQ: "Q",
  KeyR: "R",
  KeyS: "S",
  KeyT: "T",
  KeyU: "U",
  KeyV: "V",
  KeyW: "W",
  KeyX: "X",
  KeyY: "Y",
  KeyZ: "Z",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  Equal: "=",
  Minus: "-",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
  NumpadAdd: "Num+",
  NumpadSubtract: "Num-",
  NumpadMultiply: "Num*",
  NumpadDivide: "Num/",
  NumpadDecimal: "Num.",
  Numpad0: "Num0",
  Numpad1: "Num1",
  Numpad2: "Num2",
  Numpad3: "Num3",
  Numpad4: "Num4",
  Numpad5: "Num5",
  Numpad6: "Num6",
  Numpad7: "Num7",
  Numpad8: "Num8",
  Numpad9: "Num9",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
  Backspace: "⌫",
  Tab: "Tab",
  Enter: "↵",
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

// IpcAudio moved to src/features/player/ipc-audio.js (Step 11).

// TitleBar moved to src/shared/ui/title-bar.jsx.

/** Returns {left, top} clamped so the menu (w×h px) stays within the viewport. */
function clampMenu(x, y, w = 220, h = 320) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: x + w > vw ? Math.max(4, x - w) : x,
    top: y + h > vh ? Math.max(4, y - h) : y,
  };
}

// ContextMenu + CtxItem moved to src/shared/ui/context-menu.jsx.

// SIDEBAR_*/QUEUE_*/SPLIT_* geometry constants and Sidebar moved to src/app/AppShell.jsx (Step 13a-i).
// Alternate app icons for personalization (live: taskbar/window/tray + macOS Dock & bundle).
// `file` matches the PNGs in public/App-Icons/ (also bundled as a Tauri resource for Rust).
const APP_ICON_DEFAULT = "Kodama App Icon - Standard Pink.png";

// KODAMA_SHARE_BASE / buildShareLink moved to src/app/AppShell.jsx (Step 13a-i).
const APP_ICON_GROUPS = [
  {
    id: "default",
    labelKey: "appIconDefault",
    icons: [
      { label: "Standard Pink", file: "Kodama App Icon - Standard Pink.png" },
      { label: "Standard White", file: "Kodama App Icon - Standard White.png" },
      { label: "3D Pink", file: "Kodama App Icon - 3D Pink.png" },
    ],
  },
  {
    id: "pride",
    labelKey: "appIconPride",
    icons: [
      { label: "Pride", file: "Kodama App Icon - Pride.png" },
      { label: "Progress", file: "Kodama App Icon - Progress.png" },
      { label: "Trans", file: "Kodama App Icon - Trans.png" },
      { label: "Nonbinary", file: "Kodama App Icon - Nonbinary.png" },
      { label: "Asexual", file: "Kodama App Icon - Asexual.png" },
      { label: "Bisexual", file: "Kodama App Icon - Bisexual.png" },
      { label: "Lesbian", file: "Kodama App Icon - Lesbian.png" },
      { label: "Pansexual", file: "Kodama App Icon - Pansexual.png" },
      { label: "Polyamory", file: "Kodama App Icon - Polyamory.png" },
    ],
  },
];

const ACCENT_PRESETS = [
  // Row 1 — saturated
  { label: "Red", value: "#e53935" },
  { label: "Orange", value: "#f4511e" },
  { label: "Amber", value: "#fb8c00" },
  { label: "Lime", value: "#7cb342" },
  { label: "Teal", value: "#00897b" },
  { label: "Cyan", value: "#0097a7" },
  { label: "Blue", value: "#1e88e5" },
  { label: "Purple", value: "#8e24aa" },
  { label: "Pink", value: "#e91e8c" },
  // Row 2 — medium
  { label: "Salmon", value: "#ef7070" },
  { label: "Coral", value: "#f48060" },
  { label: "Gold", value: "#fba840" },
  { label: "Yellow-Green", value: "#a0c464" },
  { label: "Medium Teal", value: "#3aab9f" },
  { label: "Medium Cyan", value: "#3ab4c4" },
  { label: "Cornflower", value: "#5ca8ec" },
  { label: "Orchid", value: "#aa5cc4" },
  { label: "Hot Pink", value: "#ee60a8" },
  // Row 3 — light
  { label: "Light Red", value: "#f4a0a0" },
  { label: "Peach", value: "#f4a890" },
  { label: "Light Amber", value: "#fcc880" },
  { label: "Light Lime", value: "#bcd888" },
  { label: "Mint", value: "#7cccc4" },
  { label: "Light Cyan", value: "#7cd0dc" },
  { label: "Light Blue", value: "#94c4f4" },
  { label: "Lavender", value: "#c494dc" },
  { label: "Light Pink", value: "#f4a0c8" },
  // Row 4 — pastel
  { label: "Pastel Red", value: "#f9cece" },
  { label: "Pastel Peach", value: "#f8ccb8" },
  { label: "Pastel Yellow", value: "#fde4b8" },
  { label: "Pastel Green", value: "#d8ecb8" },
  { label: "Pastel Mint", value: "#b0e0dc" },
  { label: "Pastel Cyan", value: "#b0e4ec" },
  { label: "Pastel Blue", value: "#c4dcf8" },
  { label: "Pastel Purple", value: "#dcbcec" },
  { label: "Pastel Pink", value: "#f8cce0" },
];

// ── Smoothly fade the global --accent from its current value to a target hex ──
let accentFadeRaf = 0;
function hexToRgb(str) {
  if (!str) return null;
  str = str.trim();
  const m = str.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  return null;
}
function setAccentSmooth(toHex, duration = 380) {
  const root = document.documentElement;
  const a = hexToRgb(getComputedStyle(root).getPropertyValue("--accent"));
  const b = hexToRgb(toHex);
  if (!a || !b) {
    root.style.setProperty("--accent", toHex);
    return;
  }
  cancelAnimationFrame(accentFadeRaf);
  const t0 = performance.now();
  const hx = (v) => Math.round(v).toString(16).padStart(2, "0");
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
    root.style.setProperty(
      "--accent",
      `#${hx(a[0] + (b[0] - a[0]) * e)}${hx(a[1] + (b[1] - a[1]) * e)}${hx(a[2] + (b[2] - a[2]) * e)}`
    );
    if (p < 1) accentFadeRaf = requestAnimationFrame(tick);
  };
  accentFadeRaf = requestAnimationFrame(tick);
}

// ── Dynamic accent: derive a vibrant, legible accent hex from a cover image ──
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const to = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
// Pick the most saturated×bright pixel, then normalise S/L into a legible accent band.
// `satMin` raises the saturation floor (vibrancy); `light` sets the target lightness centre.
function vibrantAccentFromImage(img, satMin = 0.5, light = 0.6) {
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const cx = c.getContext("2d");
  cx.drawImage(img, 0, 0, 48, 48);
  const d = cx.getImageData(0, 0, 48, 48).data;
  let br = 0,
    bg = 0,
    bb = 0,
    best = -1;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b);
    const score = (mx === 0 ? 0 : (mx - mn) / mx) * (mx / 255); // saturation × brightness
    if (score > best) {
      best = score;
      br = r;
      bg = g;
      bb = b;
    }
  }
  const [h, s, l] = rgbToHsl(br, bg, bb);
  const L = Math.min(light + 0.08, Math.max(light - 0.08, l)); // keep near the chosen centre
  return hslToHex(h, Math.min(1, Math.max(satMin, s)), Math.min(0.92, Math.max(0.12, L)));
}

// Accent colour picker built from HeroUI colour components:
// ColorSwatch (preset grid + preview) + ColorArea (saturation/brightness) + ColorSlider (hue).
// Bridges between our hex-string accent value and react-aria Color objects.
// ─── Queue Panel ────────────────────────────────────────────────────────────
// ─── Queue Row (standalone to prevent drag breaking on re-render) ────────────
// src/features/lyrics/LyricsOverlay.jsx.

// Music views (LibraryView / SearchView / HomeView / ArtistView) and their media/artist
// primitives moved to src/features/music/{views,components}/.

// ─── Profile Manager ────────────────────────────────────────────────────────

// LoginLogo / LoginBtn / LoginScreen moved to src/app/AppShell.jsx (Step 13a-i).
function LanguagePickerScreen({ currentLanguage, onConfirm }) {
  const [selected, setSelected] = useState(currentLanguage);
  const subtitle = translate(selected, "selectLanguage");
  const continueLabel = selected === "de" ? "Weiter" : "Continue";

  return (
    <div
      data-testid="language-picker"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-base)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        animation: "fadeIn 0.3s ease",
        overflowY: "auto",
        padding: "20px 0",
      }}
    >
      <CardRoot
        variant="secondary"
        className="flex flex-col gap-0! shrink-0"
        style={{
          width: 420,
          maxWidth: "92vw",
          padding: 36,
          maxHeight: "calc(100vh - 40px)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Logo + heading */}
        <img
          src="/Kodama%20Logo.png"
          alt="Kodama"
          style={{ width: 64, height: 64, alignSelf: "center", marginBottom: 14 }}
        />
        <div
          style={{ fontSize: "var(--t20)", fontWeight: 700, textAlign: "center", marginBottom: 6 }}
        >
          Kodama
        </div>
        <div
          style={{
            fontSize: "var(--t13)",
            color: "var(--text-muted)",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {subtitle}
        </div>

        {/* Language rows */}
        <div
          className="scrollable"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 22,
            overflowY: "auto",
            minHeight: 0,
          }}
        >
          {LANGUAGES.map((lang) => {
            const active = selected === lang.code;
            return (
              <button
                key={lang.code}
                data-testid={`language-${lang.code}`}
                onClick={() => setSelected(lang.code)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flexShrink: 0,
                  padding: "13px 14px",
                  borderRadius: 12,
                  cursor: "default",
                  fontFamily: "var(--font)",
                  textAlign: "left",
                  border: `1.5px solid ${active ? "var(--accent)" : "transparent"}`,
                  background: active
                    ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                    : "var(--bg-elevated)",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--bg-elevated)";
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 28,
                    borderRadius: 5,
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                  dangerouslySetInnerHTML={{ __html: lang.flag }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: "var(--t14)",
                    fontWeight: 500,
                    color: active ? "var(--accent)" : "var(--text-primary)",
                  }}
                >
                  {lang.label}
                </span>
                {active && <Check size={15} style={{ color: "var(--accent)" }} />}
              </button>
            );
          })}
        </div>

        <Button
          data-testid="language-confirm"
          color="accent"
          variant="solid"
          fullWidth
          className="font-semibold shrink-0"
          onPress={() => onConfirm(selected)}
        >
          {continueLabel} →
        </Button>
      </CardRoot>
    </div>
  );
}

// ─── FFmpeg Setup Screen ──────────────────────────────────────────────────────
function FfmpegSetupScreen({ onDone }) {
  const t = useLang();
  const [phase, setPhase] = useState("checking"); // checking | needed | downloading | done | error
  const [percent, setPercent] = useState(0);
  const [mbDone, setMbDone] = useState(0);
  const [mbTotal, setMbTotal] = useState(0);
  const [speedKbps, setSpeedKbps] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [fadeOut, setFadeOut] = useState(false);

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
          setTimeout(() => {
            setPhase("done");
            onDone();
          }, 400);
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
              .catch(() => {
                onDone();
              }); // im Dev-Modus kein relaunch → einfach weiter
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

  const fmtSpeed = (kbps) => (kbps > 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps} KB/s`);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: phase === "checking" ? 9997 : 9998,
        background: "#0d0d0d",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.4s ease",
        fontFamily: "var(--font)",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(238,168,255,0.12) 0%, rgba(255,0,140,0.06) 55%, transparent 72%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          width: 360,
        }}
      >
        {/* Logo */}
        <img
          src="/Kodama%20Logo.png"
          alt="Kodama"
          width="56"
          height="56"
          style={{ filter: "drop-shadow(0 0 20px rgba(238,168,255,0.4))" }}
        />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            {phase === "checking" && "Kodama"}
            {phase === "needed" && t("ffmpegSetupTitle")}
            {phase === "downloading" && t("ffmpegDownloadingTitle")}
            {phase === "error" && t("ffmpegErrorTitle")}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              lineHeight: 1.6,
              maxWidth: 300,
            }}
          >
            {phase === "checking" && t("ffmpegLoading")}
            {phase === "needed" && t("ffmpegNeededDesc")}
            {phase === "downloading" &&
              mbTotal > 0 &&
              `${mbDone} / ${mbTotal} MB · ${fmtSpeed(speedKbps)}`}
            {phase === "error" && errMsg}
          </div>
        </div>

        {/* Progress bar */}
        {phase === "downloading" && (
          <ProgressBar aria-label="FFmpeg download" value={percent} className="w-full gap-0!">
            <ProgressBarTrack className="h-1!">
              <ProgressBarFill />
            </ProgressBarTrack>
          </ProgressBar>
        )}

        {/* Buttons */}
        {phase === "needed" && (
          <div style={{ display: "flex", gap: 12, width: "100%" }}>
            <Button
              variant="ghost"
              className="text-white/55 hover:text-white"
              style={{ flex: 1 }}
              onPress={() => {
                setFadeOut(true);
                setTimeout(() => {
                  setPhase("done");
                  onDone();
                }, 400);
              }}
            >
              {t("ffmpegSkip")}
            </Button>
            <Button
              color="accent"
              variant="solid"
              className="font-semibold"
              style={{ flex: 2 }}
              onPress={startDownload}
            >
              {t("ffmpegDownload")}
            </Button>
          </div>
        )}

        {phase === "error" && (
          <Button
            fullWidth
            variant="ghost"
            className="text-white/65 hover:text-white"
            onPress={() => {
              setFadeOut(true);
              setTimeout(() => {
                setPhase("done");
                onDone();
              }, 400);
            }}
          >
            {t("ffmpegStartAnyway")}
          </Button>
        )}
      </div>
    </div>
  );
}

// Inline FFmpeg version + update control for the Update settings tab. Checks gyan.dev on mount
// and lets the user update in place (same force-download as the banner).
// Small non-blocking banner offering an FFmpeg update when gyan.dev has a newer release
// than the installed build. Portaled to <body>; dismissal is remembered per target version.
function FfmpegUpdateBanner({ installed, latest, onClose }) {
  const t = useLang();
  const [phase, setPhase] = useState("offer"); // offer | downloading | done | error

  const [percent, setPercent] = useState(0);

  const dismiss = () => {
    try {
      localStorage.setItem("kiyoshi-ffmpeg-update-dismissed", latest || "");
    } catch {}
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
          es.close();
          setPercent(100);
          setPhase("done");
          try {
            localStorage.setItem("kiyoshi-ffmpeg-update-dismissed", latest || "");
          } catch {}
          setTimeout(onClose, 2400);
        } else if (data.status === "error") {
          es.close();
          setPhase("error");
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      setPhase("error");
    };
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 124,
        transform: "translateX(-50%)",
        zIndex: 9990,
      }}
      className="animate-[pillRiseIn_0.3s_cubic-bezier(0.22,1,0.36,1)]"
    >
      <div className="flex items-center gap-3 pl-4 pr-2.5 py-2.5 rounded-2xl bg-elevated border-[0.5px] border-border shadow-[0_10px_40px_rgba(0,0,0,0.55)] w-[400px] max-w-[calc(100vw-32px)]">
        <div
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${phase === "error" ? "bg-[rgba(255,112,112,0.16)] text-[#ff7070]" : "bg-accent-dim text-accent"}`}
        >
          {phase === "done" ? (
            <CheckCircle size={18} weight="fill" />
          ) : (
            <ArrowClockwise size={16} weight="bold" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-t13 font-semibold text-primary">
            {phase === "done"
              ? t("ffmpegUpdated")
              : phase === "error"
                ? t("ffmpegUpdateFailed")
                : t("ffmpegUpdateAvailable")}
          </div>
          {phase === "downloading" ? (
            <ProgressBar aria-label="FFmpeg update" value={percent} className="mt-1.5 gap-0!">
              <ProgressBarTrack className="h-[3px]!">
                <ProgressBarFill />
              </ProgressBarTrack>
            </ProgressBar>
          ) : (
            <div className="text-t11 text-secondary truncate">
              {phase === "error"
                ? t("ffmpegConnectionLost")
                : installed
                  ? `${installed} → ${latest}`
                  : latest}
            </div>
          )}
        </div>
        {phase === "offer" && (
          <>
            <Button
              color="accent"
              variant="solid"
              size="sm"
              className="shrink-0"
              onPress={startUpdate}
            >
              {t("ffmpegUpdate")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="shrink-0 rounded-full text-muted"
              onPress={dismiss}
            >
              <X size={14} weight="bold" />
            </Button>
          </>
        )}
        {phase === "error" && (
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            className="shrink-0 rounded-full text-muted"
            onPress={onClose}
          >
            <X size={14} weight="bold" />
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}

function SplashScreen({ fading }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0d0d0d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: fading ? "splashFadeOut 0.45s ease forwards" : "none",
        pointerEvents: "none",
      }}
    >
      <style>{`@keyframes kodamaPulse{0%,100%{transform:scale(0.92);opacity:.7}50%{transform:scale(1.06);opacity:1}}`}</style>
      <img
        src="/Kodama%20Logo.png"
        alt="Kodama"
        width="96"
        height="96"
        style={{ animation: "kodamaPulse 1.5s ease-in-out infinite" }}
      />
    </div>
  );
}

// AmbientBackdrop moved to src/shared/ui/ambient-backdrop.jsx.

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
        const d = await fetch(`${API}/ffmpeg/check-update`).then((r) => r.json());
        if (cancelled || !d.updateAvailable) return;
        if (localStorage.getItem("kiyoshi-ffmpeg-update-dismissed") === d.latest) return;
        setFfmpegUpdate({ installed: d.installed, latest: d.latest });
      } catch {}
    }, 6000); // defer so it never competes with startup work
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [ffmpegSetupDone]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 1700);
    const hideTimer = setTimeout(() => setShowSplash(false), 2150);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  // Sidebar/queue resize geometry, split-view, selection state, context menus, and
  // playlist/settings/feedback/debug dialogs now live in src/app/AppShell.jsx (Step 13a-i).
  const [pinnedIds, setPinnedIds] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());

  // ─── Toast Notifications (HeroUI toast system) ───────────────────────────────
  // Thin wrapper so all existing addToast(message, type) call sites keep working.
  const addToast = useCallback((message, type = "info") => {
    if (type === "error") toast.danger(message, { timeout: 6000 });
    else if (type === "success") toast.success(message, { timeout: 3500 });
    else toast(message, { timeout: 3500 });
  }, []);

  // App update lifecycle (useAppUpdate) moved wholesale to src/app/AppShell.jsx (Step 13a-i) —
  // its only consumers (Sidebar, SettingsPanel) live there now.

  // Start Rust audio-level collection on mount.
  useEffect(() => {
    startAudioLevels();
  }, []);

  const togglePin = useCallback((pl) => {
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem(profileKey("kiyoshi-pinned")) || "[]");
      } catch {
        return [];
      }
    })();
    const id = itemId(pl);
    const already = stored.find((p) => itemId(p) === id);
    const next = already ? stored.filter((p) => itemId(p) !== id) : [pl, ...stored];
    localStorage.setItem(profileKey("kiyoshi-pinned"), JSON.stringify(next));
    setPinnedIds(next.map((p) => itemId(p)));
    window.dispatchEvent(new Event("kiyoshi-pins-updated"));
  }, []);

  // openContextMenu/settingsOpen/settingsClosing/settingsTab/settingsInitialTab, the news feed
  // (useNews), the feedback/bug-report dialog, and closeSettings/selectSettingsSection all moved
  // to src/app/AppShell.jsx (Step 13a-i).
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
    if (saved === "dyslexic")
      document.documentElement.style.setProperty("--font", "'OpenDyslexic', system-ui, sans-serif");
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
  const [ambientVisualizer, setAmbientVisualizer] = useState(
    () => localStorage.getItem("kiyoshi-ambient-visualizer") !== "false"
  );
  const [instrumentalViz, setInstrumentalViz] = useState(
    () => localStorage.getItem("kiyoshi-instrumental-viz") !== "false"
  );
  const [vizConfig, setVizConfig] = useState(() => {
    try {
      return {
        ...VIZ_DEFAULTS,
        ...JSON.parse(localStorage.getItem("kiyoshi-visualizer-config") || "{}"),
      };
    } catch {
      return { ...VIZ_DEFAULTS };
    }
  });
  const updateViz = useCallback(
    (patch) =>
      setVizConfig((c) => {
        const next = { ...c, ...patch };
        localStorage.setItem("kiyoshi-visualizer-config", JSON.stringify(next));
        return next;
      }),
    []
  );
  const [ambientBackground, setAmbientBackground] = useState(
    () => localStorage.getItem("kiyoshi-ambient-bg") === "true"
  );
  // flashbang state now lives in AppShell; this ref lets handleThemeChange (pinned here by the
  // appearanceSettings memo closure) trigger it without prop-threading a setter upward.
  const flashbangTriggerRef = useRef(null);
  const lightClickRef = useRef({ count: 0, lastTime: 0 });

  const [accentDynamic, setAccentDynamic] = useState(
    () => localStorage.getItem("kiyoshi-accent-dynamic") === "true"
  );
  const handleAccentDynamicChange = useCallback((on) => {
    setAccentDynamic(on);
    localStorage.setItem("kiyoshi-accent-dynamic", on ? "true" : "false");
  }, []);
  const [accentSat, setAccentSat] = useState(() => {
    const v = parseFloat(localStorage.getItem("kiyoshi-accent-sat"));
    return isNaN(v) ? 0.5 : v;
  });
  const [accentLight, setAccentLight] = useState(() => {
    const v = parseFloat(localStorage.getItem("kiyoshi-accent-light"));
    return isNaN(v) ? 0.6 : v;
  });
  const handleAccentSatChange = useCallback((v) => {
    setAccentSat(v);
    localStorage.setItem("kiyoshi-accent-sat", String(v));
  }, []);
  const handleAccentLightChange = useCallback((v) => {
    setAccentLight(v);
    localStorage.setItem("kiyoshi-accent-light", String(v));
  }, []);

  const handleAccentChange = useCallback(
    (color) => {
      setAccent(color);
      if (!accentDynamic) document.documentElement.style.setProperty("--accent", color);
      localStorage.setItem("kiyoshi-accent", color);
    },
    [accentDynamic]
  );

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
          flashbangTriggerRef.current?.();
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
  // Music navigation domain (see features/music/hooks/use-music-navigation.js): view, back-nav
  // history, the open collection/artist, and the open*/navigateTo/goBack commands. Consumed here
  // via destructure so existing JSX/prop chains are unchanged (Step 12), same pattern as the
  // player controller below. Must run before useProfiles/useNetworkStatus — both inject this
  // hook's setView/setAppKey/setCollection setters into their own reset sequences.
  const {
    view,
    setView,
    appKey,
    setAppKey,
    viewRefreshKey,
    setViewRefreshKey,
    collection,
    setCollection,
    artistView,
    handleSearch,
    addRecentPlaylist,
    removeRecentPlaylist,
    openPlaylist,
    openAlbum,
    openArtist,
    navigateTo,
    goBack,
  } = useMusicNavigation({ setSearchQuery });
  // Player controller owns the audio, track, queue, playing state, and playback commands.
  // Consumed here via destructure so existing JSX/prop chains are unchanged (Step 11).
  // resetLyricsSessionRef is populated further down, once the lyrics-session state exists.
  const resetLyricsSessionRef = useRef(null);
  // These values are declared below the controller. Refs let player-native bridges read
  // the latest settings without reordering the existing settings/hooks graph.
  const playerIntegrationRef = useRef({ discordRpc: true, obsEnabled: false, obsPort: 9848 });
  const lastfm = useLastfmClient();
  const player = usePlayerController({
    addToast,
    resetLyricsSessionRef,
    lastfm,
    integrationsRef: playerIntegrationRef,
  });
  const {
    audioRef,
    currentTrack,
    setCurrentTrack,
    isPlaying,
    stopPlayback,
    setQueue,
    crossfade,
    setCrossfade,
    playbackProgressive,
    setPlaybackProgressive,
    crossfadeOverrides,
    removeCrossfadeOverride,
    refreshNativeIntegrations,
  } = player;
  const [discordRpc, setDiscordRpc] = useState(
    () => localStorage.getItem("kiyoshi-discord-rpc") !== "false"
  );

  // Dynamic accent: when enabled, derive --accent live from the current cover; otherwise
  // fall back to the fixed accent. Re-runs whenever the track or the mode changes.
  useEffect(() => {
    if (!accentDynamic) {
      document.documentElement.style.setProperty("--accent", accent);
      return;
    }
    const url = currentTrack?.thumbnail ? thumb(currentTrack.thumbnail) : null;
    if (!url) {
      document.documentElement.style.setProperty("--accent", accent);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        setAccentSmooth(vibrantAccentFromImage(img, accentSat, accentLight));
      } catch {
        document.documentElement.style.setProperty("--accent", accent);
      }
    };
    img.onerror = () => {
      if (!cancelled) document.documentElement.style.setProperty("--accent", accent);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [accentDynamic, currentTrack?.thumbnail, accent, accentSat, accentLight]);

  // ─── Usage stats: total app usage time + total song playtime (persisted, global) ───
  const usageSecRef = useRef(Number(localStorage.getItem("kiyoshi-total-usage") || 0));
  const playtimeSecRef = useRef(Number(localStorage.getItem("kiyoshi-total-playtime") || 0));
  // App usage: count seconds while the window is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        usageSecRef.current += 1;
        if (usageSecRef.current % 30 === 0)
          localStorage.setItem("kiyoshi-total-usage", String(usageSecRef.current));
      }
    }, 1000);
    const flush = () => localStorage.setItem("kiyoshi-total-usage", String(usageSecRef.current));
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      clearInterval(id);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
  // Song playtime: count seconds while actually playing.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      playtimeSecRef.current += 1;
      if (playtimeSecRef.current % 15 === 0)
        localStorage.setItem("kiyoshi-total-playtime", String(playtimeSecRef.current));
    }, 1000);
    return () => {
      localStorage.setItem("kiyoshi-total-playtime", String(playtimeSecRef.current));
      clearInterval(id);
    };
  }, [isPlaying]);

  const [closeTray, setCloseTray] = useState(
    () => localStorage.getItem("kiyoshi-close-tray") !== "false"
  );
  useEffect(() => {
    import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("set_close_to_tray", { enabled: closeTray }).catch(() => {})
    );
  }, []);

  // ── OBS overlay server (see features/overlay/hooks/use-obs-overlay.js) ──
  const { obsEnabled, obsPort, obsPortInput, setObsPortInput, toggleObs, saveObsPort } =
    useObsOverlay();
  useEffect(() => {
    playerIntegrationRef.current = { discordRpc, obsEnabled, obsPort };
    refreshNativeIntegrations();
  }, [discordRpc, obsEnabled, obsPort, refreshNativeIntegrations]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  // lyricsRefetchKey/forcedLyricsProvider/currentLyricsSource/failedLyricsProviders and the
  // resetLyricsSessionRef.current wiring now live in AppShell (Step 13a-i); the ref itself is
  // still created here since usePlayerController (above) is injected with it.
  const [showLyricsTranslation, setShowLyricsTranslation] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-translation") === "true"
  );
  const [lyricsTranslationLang, setLyricsTranslationLang] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-translation-lang") || "DE"
  );
  const [showRomaji, setShowRomaji] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-romaji") === "true"
  );
  const [syllableZoom, setSyllableZoom] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-syllable-zoom") === "true"
  );
  const [fluidLyrics, setFluidLyrics] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-fluid") === "true"
  );
  // isCustomLyrics, importLyricsRef/removeCustomLyricsRef, the reset-lyrics-on-track-change
  // effect, splitView/splitRatio/splitResizing/startSplitResize, showLyricsRef/splitViewRef,
  // lastInstSwitchRef, setShowLyricsManual, and handleInstrumentalChange now live in AppShell.
  // autoCoverRef stays here (it's mirrored by AppShell but also written by this appearanceSettings
  // memo's onToggleInstrumentalViz below, so it's a shared ref passed down as a prop).
  const [showAgentTags, setShowAgentTags] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-agent-tags") !== "false"
  );
  const [showLyrics, setShowLyrics] = useState(true);
  const autoCoverRef = useRef(false);
  const [queueOpen, setQueueOpen] = useState(false);
  // fullscreen/playerVisible/cursorVisible/hideTimerRef + the idle-cursor effect, and
  // queueSettled + its effect, now live in AppShell (Step 13a-i).

  // Composer-pause and native window title now live in usePlayerController (Step 11d).

  // Playback commands (handlePlay/enqueue/startSongRadio/playByVideoId), the Big Picture
  // bridge, and deep-link handling moved to features/player/use-player-controller.js (Step 11).

  const [language, setLanguage] = useState(() => getInitialLang());

  // ── Downloads + local cache (see features/downloads/hooks/use-download-manager.js) ──
  const downloads = useDownloadManager({ addToast, language });
  // Distributed to views/PlaylistLayout/Player/track-context-menu via DownloadContext (Step 12);
  // App keeps only what the download-queue progress card (still App-owned, passed to AppShell as
  // props) reads/acts on directly.
  const { downloadBatches, downloadQueueMin, setDownloadQueueMin, handleCancelBatch } = downloads;

  // handleSearch/addRecentPlaylist/removeRecentPlaylist/openPlaylist/openAlbum now live in
  // features/music/hooks/use-music-navigation.js (Step 12).

  const [animations, setAnimations] = useState(
    () => localStorage.getItem("kiyoshi-animations") !== "false"
  );
  // queueSettled + its effect now live in AppShell (Step 13a-i).
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
  const [hideExplicit, setHideExplicit] = useState(
    () => localStorage.getItem("kiyoshi-hide-explicit") === "true"
  );
  const [showTrackNumbers, setShowTrackNumbers] = useState(
    () => localStorage.getItem("kodama-track-numbers") === "true"
  );
  const handleTrackNumbersChange = useCallback((on) => {
    setShowTrackNumbers(on);
    localStorage.setItem("kodama-track-numbers", String(on));
  }, []);
  // Anonymous active-user stats: default ON, one-click opt-out. See analytics/.
  const [anonStats, setAnonStats] = useState(
    () => localStorage.getItem("kodama-anon-stats") !== "false"
  );
  const handleAnonStatsChange = useCallback((on) => {
    setAnonStats(on);
    localStorage.setItem("kodama-anon-stats", String(on));
  }, []);
  const [hideUserHandle, setHideUserHandle] = useState(
    () => localStorage.getItem("kiyoshi-hide-handle") === "true"
  );
  const [uiZoom, setUiZoom] = usePersistedState("kiyoshi-ui-zoom", 1.0, UI_ZOOM_STORAGE);

  const [customShortcuts, setCustomShortcuts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("kiyoshi-shortcuts") || "{}");
      return { ...DEFAULT_SHORTCUTS, ...saved };
    } catch {
      return { ...DEFAULT_SHORTCUTS };
    }
  });
  const [shortcutLabels, setShortcutLabels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kiyoshi-shortcut-labels") || "{}");
    } catch {
      return {};
    }
  });
  const [recordingShortcut, setRecordingShortcut] = useState(null);
  const customShortcutsRef = useRef(customShortcuts);
  const recordingShortcutRef = useRef(null);
  useEffect(() => {
    customShortcutsRef.current = customShortcuts;
  }, [customShortcuts]);
  useEffect(() => {
    recordingShortcutRef.current = recordingShortcut;
  }, [recordingShortcut]);

  const getShortcutLabel = useCallback(
    (stored) => {
      if (!stored) return "—";
      if (!stored.includes("+")) {
        const label = shortcutLabels[stored] || CODE_DISPLAY_FALLBACK[stored] || stored;
        return label.length === 1 ? label.toUpperCase() : label;
      }
      // Compound: "Ctrl+Equal" → "Ctrl+="
      const parts = stored.split("+");
      const code = parts[parts.length - 1];
      const mods = parts.slice(0, -1);
      const keyLabel = shortcutLabels[code] || CODE_DISPLAY_FALLBACK[code] || code;
      const displayKey = keyLabel.length === 1 ? keyLabel.toUpperCase() : keyLabel;
      return [...mods, displayKey].join("+");
    },
    [shortcutLabels]
  );

  const resetShortcut = useCallback((id) => {
    setCustomShortcuts((prev) => {
      const next = { ...prev, [id]: DEFAULT_SHORTCUTS[id] };
      localStorage.setItem("kiyoshi-shortcuts", JSON.stringify(next));
      return next;
    });
  }, []);

  const CSS_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22];
  const [appFontScale, setAppFontScale] = usePersistedState(
    "kiyoshi-font-scale",
    1.0,
    FONT_SCALE_STORAGE
  );

  useLayoutEffect(() => {
    CSS_FONT_SIZES.forEach((s) => {
      document.documentElement.style.setProperty(`--t${s}`, `${Math.round(s * appFontScale)}px`);
    });
  }, [appFontScale]);

  // uiZoom wird direkt im App-Container angewendet (kein document.documentElement),
  // damit position:fixed / 100vh-Werte korrekt bleiben.
  const [lyricsProviders, setLyricsProviders] = useState(() => {
    const validIds = new Set(DEFAULT_LYRICS_PROVIDERS.map((p) => p.id));
    try {
      const saved = localStorage.getItem("kiyoshi-lyrics-providers");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Remove providers that no longer exist (e.g. old Kimuco entry)
        const filtered = parsed.filter((p) => validIds.has(p.id));
        // Add any new default providers not yet in the saved list
        const ids = filtered.map((p) => p.id);
        const merged = [
          ...filtered,
          ...DEFAULT_LYRICS_PROVIDERS.filter((p) => !ids.includes(p.id)),
        ];
        return merged;
      }
    } catch {}
    return DEFAULT_LYRICS_PROVIDERS;
  });
  // Migration: add newly introduced providers / remove obsolete ones
  useEffect(() => {
    const validIds = new Set(DEFAULT_LYRICS_PROVIDERS.map((p) => p.id));
    setLyricsProviders((current) => {
      const filtered = current.filter((p) => validIds.has(p.id));
      const ids = filtered.map((p) => p.id);
      const missing = DEFAULT_LYRICS_PROVIDERS.filter((p) => !ids.includes(p.id));
      if (missing.length === 0 && filtered.length === current.length) return current;
      const merged = [...filtered, ...missing];
      localStorage.setItem("kiyoshi-lyrics-providers", JSON.stringify(merged));
      return merged;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [ipv4First, setIpv4First] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchIpv4FirstSetting()
      .then((d) => {
        if (!cancelled) setIpv4First(!!d.enabled);
      })
      .catch((e) => console.error("[Network] IPv4-first load failed:", e));
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleIpv4First = useCallback(
    (enabled) => {
      const previous = ipv4First;
      setIpv4First(enabled);
      fetchIpv4FirstSetting({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
        .then((d) => setIpv4First(!!d.enabled))
        .catch((e) => {
          console.error("[Network] IPv4-first toggle failed:", e);
          setIpv4First(previous);
        });
    },
    [ipv4First]
  );

  // ── LAN remote control (see features/remote/hooks/use-remote-control.js) ──
  // Enabling starts the token-gated phone endpoints on the (already 0.0.0.0) backend.
  // The Player pushes now-playing state + drains commands while enabled.
  const {
    remoteEnabled,
    remoteInfo,
    remoteDevices,
    remoteTrustedIds,
    pairModalOpen,
    setPairModalOpen,
    toggleRemote,
    remoteDeviceAction,
    remoteRememberDevice,
  } = useRemoteControl();

  // App-icon personalization. Applies live to taskbar/window/tray (+ macOS Dock & bundle)
  // via the Rust `set_app_icon` command. The static pinned-shortcut icon stays as installed.
  const [appIcon, setAppIcon] = useState(
    () => localStorage.getItem("kodama-app-icon") || APP_ICON_DEFAULT
  );
  const applyAppIcon = useCallback(async (file) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_app_icon", { file });
    } catch (e) {
      console.error("[AppIcon] set failed:", e);
    }
  }, []);
  const handleAppIconChange = useCallback(
    (file) => {
      setAppIcon(file);
      localStorage.setItem("kodama-app-icon", file);
      applyAppIcon(file);
    },
    [applyAppIcon]
  );
  // Re-apply the user's chosen icon on each launch (only if they customized it).
  useEffect(() => {
    const stored = localStorage.getItem("kodama-app-icon");
    if (stored && stored !== APP_ICON_DEFAULT) applyAppIcon(stored);
  }, [applyAppIcon]);

  // Per-transition crossfade overrides: { "fromId__toId": { secs, fromTitle, toTitle } }.
  // A pair override beats the global default; secs 0 = hard cut for that one transition.
  // ── Profile / Auth ──
  // ── Profiles / auth / session (see features/profiles/hooks/use-profiles.js) ──
  // The account switch/remove/logout commands reset app-wide UI as a single business
  // sequence; those state cells are still App-owned, so their setters are injected while
  // the ordering stays in the profile domain.
  const profile = useProfiles({
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
    stopPlayback,
  });
  // Account actions (switch/add/reauth/remove/rename/avatar/logout) are consumed through
  // ProfileContext now (Sidebar, settings account tab, profile-switcher modal — see
  // features/profiles/profile-context.jsx); App keeps only the startup/auth-gate state and
  // `profiles`/`fetchProfiles`, which it still reads directly (home greeting, network status).
  const {
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
    fetchProfiles,
  } = profile;

  // Keepalive ping to prevent server connection timeout
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${API}/status`).catch(() => {});
    }, 30000); // ping every 30s
    return () => clearInterval(interval);
  }, []);

  // Cached-song id loading now lives in features/downloads/hooks/use-download-manager.js.

  // Load liked song IDs on mount
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/liked/ids`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setLikedIds(new Set(d.ids || []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // OBS overlay auto-start on mount lives in features/overlay/hooks/use-obs-overlay.js.

  // Toggle like for a track from playlist rows
  const handleToggleLike = useCallback(
    async (track) => {
      if (!track?.videoId) return;
      const wasLiked = likedIds.has(track.videoId);
      const newRating = wasLiked ? "INDIFFERENT" : "LIKE";
      setLikedIds((prev) => {
        const s = new Set(prev);
        if (wasLiked) s.delete(track.videoId);
        else s.add(track.videoId);
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
        if (lastfm.connectedRef.current) {
          const lfArtist = (track.artists || "").replace(/\s*-\s*Topic$/i, "").trim();
          const lfTitle = (track.title || "").trim();
          if (lfArtist && lfTitle) {
            fetch(`${API}/lastfm/${newRating === "LIKE" ? "love" : "unlove"}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ artist: lfArtist, track: lfTitle }),
            }).catch(() => {});
          }
        }
      } catch {
        // revert on error
        setLikedIds((prev) => {
          const s = new Set(prev);
          if (wasLiked) s.add(track.videoId);
          else s.delete(track.videoId);
          return s;
        });
      }
    },
    [likedIds, lastfm]
  );

  // ── Network status + offline mode (see app/hooks/use-network-status.js) ──
  const { offlineMode, isActuallyOffline, isOffline, handleToggleOffline } = useNetworkStatus({
    fetchProfiles,
    setAppKey,
    setView,
  });

  // Debug float window toggle now lives in AppShell (Step 13a-i).

  // Auth bootstrap (validate → cache fallback → background poll) lives in
  // features/profiles/hooks/use-profiles.js.

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
      const playerBar = e.target.closest?.("[data-volume-area]");
      if (!playerBar) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.02 : -0.02;
      const dv = Math.min(1, Math.max(0, Math.sqrt(audio.volume) + delta));
      audio.volume = dv * dv;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [audioRef]);

  // artistView/openArtist/navigateTo/goBack now live in
  // features/music/hooks/use-music-navigation.js (Step 12).

  // Clear-selection-on-view-change and the keyboard-shortcut effect now live in AppShell
  // (Step 13a-i). openFeedback previously lived here too.

  // Settings domain slices — each is an independent, memoized value/actions object so a change in
  // one domain (e.g. a lyric toggle) does not invalidate consumers of another (e.g. appearance).
  // App remains the temporary owner of the underlying state/persistence; these objects only carry
  // it into the settings feature via SettingsProviders. See features/settings/settings-context.jsx.
  const appearanceSettings = useMemo(
    () => ({
      accent,
      onAccentChange: handleAccentChange,
      accentDynamic,
      onAccentDynamicChange: handleAccentDynamicChange,
      accentSat,
      onAccentSatChange: handleAccentSatChange,
      accentLight,
      onAccentLightChange: handleAccentLightChange,
      appIcon,
      onAppIconChange: handleAppIconChange,
      theme,
      onThemeChange: handleThemeChange,
      animations,
      onAnimationsChange: (v) => {
        setAnimations(v);
        localStorage.setItem("kiyoshi-animations", v);
      },
      highContrast,
      onToggleHighContrast: () => {
        const next = !highContrast;
        setHighContrast(next);
        document.documentElement.setAttribute("data-highcontrast", String(next));
        localStorage.setItem("kiyoshi-high-contrast", String(next));
      },
      appFont,
      onAppFontChange: handleAppFontChange,
      appFontScale,
      onFontScaleChange: (v) => {
        setAppFontScale(v);
      },
      uiZoom,
      onUiZoomChange: (v) => {
        setUiZoom(v);
      },
      showTrackNumbers,
      onTrackNumbersChange: handleTrackNumbersChange,
      hideExplicit,
      onHideExplicitChange: (v) => {
        setHideExplicit(v);
        localStorage.setItem("kiyoshi-hide-explicit", v);
      },
      ambientBackground,
      onToggleAmbientBackground: () => {
        const next = !ambientBackground;
        setAmbientBackground(next);
        localStorage.setItem("kiyoshi-ambient-bg", String(next));
      },
      ambientVisualizer,
      onToggleAmbientVisualizer: () => {
        const next = !ambientVisualizer;
        setAmbientVisualizer(next);
        localStorage.setItem("kiyoshi-ambient-visualizer", String(next));
      },
      instrumentalViz,
      onToggleInstrumentalViz: (v) => {
        setInstrumentalViz(v);
        localStorage.setItem("kiyoshi-instrumental-viz", v ? "true" : "false");
        if (!v && autoCoverRef.current) {
          autoCoverRef.current = false;
          setShowLyrics(true);
        }
      },
      vizConfig,
      onUpdateViz: updateViz,
      vizPreviewTrack: currentTrack,
      vizPreviewPlaying: isPlaying,
    }),
    [
      accent,
      handleAccentChange,
      accentDynamic,
      handleAccentDynamicChange,
      accentSat,
      handleAccentSatChange,
      accentLight,
      handleAccentLightChange,
      appIcon,
      handleAppIconChange,
      theme,
      handleThemeChange,
      animations,
      highContrast,
      appFont,
      handleAppFontChange,
      appFontScale,
      uiZoom,
      showTrackNumbers,
      handleTrackNumbersChange,
      hideExplicit,
      ambientBackground,
      ambientVisualizer,
      instrumentalViz,
      vizConfig,
      updateViz,
      currentTrack,
      isPlaying,
    ]
  );

  // Autoplay/crossfade/progressive-mode state and persistence are owned by the player controller
  // (Step 11f); App only adapts the controller's values/actions into the settings shape.
  const playbackSettings = useMemo(
    () => ({
      autoplay: player.autoplay,
      onAutoplayChange: player.setAutoplay,
      crossfade,
      onCrossfadeChange: setCrossfade,
      crossfadeOverrides,
      onRemoveCrossfadeOverride: removeCrossfadeOverride,
      playbackProgressive,
      onPlaybackProgressiveChange: setPlaybackProgressive,
    }),
    [
      player.autoplay,
      player.setAutoplay,
      crossfade,
      setCrossfade,
      crossfadeOverrides,
      removeCrossfadeOverride,
      playbackProgressive,
      setPlaybackProgressive,
    ]
  );

  const lyricsSettings = useMemo(
    () => ({
      lyricsFontSize,
      onLyricsFontSizeChange: (v) => {
        setLyricsFontSize(v);
        localStorage.setItem("kiyoshi-lyrics-font-size", v);
      },
      lyricsTranslationFontSize,
      onLyricsTranslationFontSizeChange: (v) => {
        setLyricsTranslationFontSize(v);
        localStorage.setItem("kiyoshi-lyrics-translation-font-size", v);
      },
      lyricsRomajiFontSize,
      onLyricsRomajiFontSizeChange: (v) => {
        setLyricsRomajiFontSize(v);
        localStorage.setItem("kiyoshi-lyrics-romaji-font-size", v);
      },
      lyricsProviders,
      onLyricsProvidersChange: (v) => {
        setLyricsProviders(v);
        localStorage.setItem("kiyoshi-lyrics-providers", JSON.stringify(v));
      },
      showRomaji,
      onToggleRomaji: () => {
        const next = !showRomaji;
        setShowRomaji(next);
        localStorage.setItem("kiyoshi-lyrics-romaji", String(next));
      },
      showAgentTags,
      onToggleAgentTags: () => {
        const next = !showAgentTags;
        setShowAgentTags(next);
        localStorage.setItem("kiyoshi-lyrics-agent-tags", String(next));
      },
      syllableZoom,
      onToggleSyllableZoom: () => {
        const next = !syllableZoom;
        setSyllableZoom(next);
        localStorage.setItem("kiyoshi-lyrics-syllable-zoom", String(next));
      },
      fluidLyrics,
      onToggleFluidLyrics: () => {
        const next = !fluidLyrics;
        setFluidLyrics(next);
        localStorage.setItem("kiyoshi-lyrics-fluid", String(next));
      },
    }),
    [
      lyricsFontSize,
      lyricsTranslationFontSize,
      lyricsRomajiFontSize,
      lyricsProviders,
      showRomaji,
      showAgentTags,
      syllableZoom,
      fluidLyrics,
    ]
  );

  const integrationSettings = useMemo(
    () => ({
      closeTray,
      onCloseTrayChange: (v) => {
        setCloseTray(v);
        localStorage.setItem("kiyoshi-close-tray", String(v));
        import("@tauri-apps/api/core").then(({ invoke }) =>
          invoke("set_close_to_tray", { enabled: v }).catch(() => {})
        );
      },
      discordRpc,
      onDiscordRpcChange: (v) => {
        setDiscordRpc(v);
        localStorage.setItem("kiyoshi-discord-rpc", v);
        if (!v)
          import("@tauri-apps/api/core").then(({ invoke }) =>
            invoke("clear_discord_rpc").catch(() => {})
          );
      },
      ipv4First,
      onIpv4FirstChange: toggleIpv4First,
      obsEnabled,
      obsPort,
      obsPortInput,
      setObsPortInput,
      toggleObs,
      onObsPortSave: saveObsPort,
      remoteEnabled,
      remoteDevices,
      remoteTrustedIds,
      onToggleRemote: toggleRemote,
      onRemoteDevice: remoteDeviceAction,
      onRememberDevice: remoteRememberDevice,
      onPairDevice: () => setPairModalOpen(true),
    }),
    [
      closeTray,
      discordRpc,
      ipv4First,
      toggleIpv4First,
      obsEnabled,
      obsPort,
      obsPortInput,
      setObsPortInput,
      toggleObs,
      saveObsPort,
      remoteEnabled,
      remoteDevices,
      remoteTrustedIds,
      toggleRemote,
      remoteDeviceAction,
      remoteRememberDevice,
    ]
  );

  const shortcutSettings = useMemo(
    () => ({
      customShortcuts,
      shortcutLabels,
      recordingShortcut,
      setRecordingShortcut,
      getShortcutLabel,
      resetShortcut,
    }),
    [
      customShortcuts,
      shortcutLabels,
      recordingShortcut,
      setRecordingShortcut,
      getShortcutLabel,
      resetShortcut,
    ]
  );

  // AnimatedView moved to AppShell (Step 13a-i).

  // ── AppShell prop bundles (Step 13a-ii) ──────────────────────────────────────
  // Everything below is pinned to App by a settings-memo closure or a profile/navigation-reset
  // injection (see the Step 13 boundary map). Grouped into named objects instead of a flat prop
  // list, mirroring the appearanceSettings-style pattern; AppShell isn't memoized, so these are
  // plain object literals rather than useMemo — object identity doesn't gate any re-render here.
  const appShellNav = {
    view,
    setView,
    appKey,
    viewRefreshKey,
    setViewRefreshKey,
    collection,
    setCollection,
    artistView,
    searchQuery,
    handleSearch,
    addRecentPlaylist,
    removeRecentPlaylist,
    openPlaylist,
    openAlbum,
    openArtist,
    navigateTo,
    goBack,
    pinnedIds,
    togglePin,
  };
  const appShellUi = {
    overlayOpen,
    setOverlayOpen,
    queueOpen,
    setQueueOpen,
    showLyrics,
    setShowLyrics,
    uiZoom,
    setUiZoom,
  };
  const appShellShortcuts = {
    customShortcutsRef,
    recordingShortcutRef,
    setCustomShortcuts,
    setShortcutLabels,
    setRecordingShortcut,
  };
  const appShellAppearancePrefs = {
    animations,
    hideExplicit,
    ambientBackground,
    ambientVisualizer,
    vizConfig,
    instrumentalViz,
  };
  const appShellLyricsPrefs = {
    lyricsFontSize,
    lyricsProviders,
    showLyricsTranslation,
    setShowLyricsTranslation,
    lyricsTranslationLang,
    setLyricsTranslationLang,
    lyricsTranslationFontSize,
    showRomaji,
    lyricsRomajiFontSize,
    showAgentTags,
    syllableZoom,
    fluidLyrics,
  };
  const appShellAuthGate = {
    showLogin,
    setShowLogin,
    addingProfile,
    setAddingProfile,
    reauthName,
    setReauthName,
    showProfileSwitcher,
    setShowProfileSwitcher,
  };
  const appShellRemote = {
    remoteEnabled,
    remoteInfo,
    remoteDevices,
    pairModalOpen,
    setPairModalOpen,
    remoteDeviceAction,
    remoteRememberDevice,
  };
  const appShellNetwork = { offlineMode, isActuallyOffline, isOffline, handleToggleOffline };
  const appShellDownloadQueue = {
    downloadBatches,
    downloadQueueMin,
    setDownloadQueueMin,
    handleCancelBatch,
  };
  const appShellPrivacySettings = {
    anonStats,
    handleAnonStatsChange,
    hideUserHandle,
    setHideUserHandle,
  };
  const appShellBridges = { autoCoverRef, flashbangTriggerRef, resetLyricsSessionRef };

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <LangContext.Provider value={language}>
        <TrackNumberContext.Provider value={showTrackNumbers}>
          <AnimationContext.Provider value={animations}>
            <FontScaleContext.Provider value={appFontScale}>
              <ZoomContext.Provider value={uiZoom}>
                <ProfileProvider controller={profile}>
                  <DownloadProvider controller={downloads}>
                    <PlayerProvider controller={player}>
                      <SettingsProviders
                        appearance={appearanceSettings}
                        playback={playbackSettings}
                        lyrics={lyricsSettings}
                        integrations={integrationSettings}
                        shortcuts={shortcutSettings}
                      >
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
                              if (!profiles.length) setShowLogin(true);
                            }}
                          />
                        )}
                        {!ffmpegSetupDone && !showLangPicker && (
                          <FfmpegSetupScreen onDone={() => setFfmpegSetupDone(true)} />
                        )}
                        {ffmpegUpdate && (
                          <FfmpegUpdateBanner
                            installed={ffmpegUpdate.installed}
                            latest={ffmpegUpdate.latest}
                            onClose={() => setFfmpegUpdate(null)}
                          />
                        )}

                        {/* Toast Notifications */}
                        <ToastProvider
                          placement="bottom end"
                          className="bottom-[120px]! z-[100000]!"
                        />

                        <AppShell
                          language={language}
                          addToast={addToast}
                          handleLanguageChange={handleLanguageChange}
                          obsEnabled={obsEnabled}
                          likedIds={likedIds}
                          handleToggleLike={handleToggleLike}
                          nav={appShellNav}
                          shellUi={appShellUi}
                          shortcuts={appShellShortcuts}
                          appearancePrefs={appShellAppearancePrefs}
                          lyricsPrefs={appShellLyricsPrefs}
                          authGate={appShellAuthGate}
                          remote={appShellRemote}
                          network={appShellNetwork}
                          downloadQueue={appShellDownloadQueue}
                          privacySettings={appShellPrivacySettings}
                          bridges={appShellBridges}
                        />
                      </SettingsProviders>
                    </PlayerProvider>
                  </DownloadProvider>
                </ProfileProvider>
              </ZoomContext.Provider>
            </FontScaleContext.Provider>
          </AnimationContext.Provider>
        </TrackNumberContext.Provider>
      </LangContext.Provider>
    </IconContext.Provider>
  );
}
