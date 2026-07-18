import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import {
  cn,
  Button,
  ListBox,
  ListBoxItem,
  Disclosure,
  DisclosureHeading,
  DisclosureTrigger,
  DisclosureContent,
  DisclosureBody,
  DisclosureIndicator,
  Dropdown,
  DropdownTrigger,
  DropdownPopover,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  DropdownSubmenuTrigger,
  DropdownSubmenuIndicator,
  ModalRoot,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalIcon,
  ModalHeading,
  ModalBody,
  ModalFooter,
  ModalCloseTrigger,
  SliderRoot,
  SliderTrack,
  SliderFill,
  SliderThumb,
  toast,
  ToastProvider,
  Spinner,
  ProgressBar,
  ProgressBarTrack,
  ProgressBarFill,
  SearchFieldRoot,
  SearchFieldGroup,
  SearchFieldSearchIcon,
  SearchFieldInput,
  SearchFieldClearButton,
  TextFieldRoot,
  InputRoot,
  TextArea,
  SwitchRoot,
  SwitchControl,
  SwitchThumb,
  CardRoot,
  ColorAreaRoot,
  ColorAreaThumb,
  ColorSliderRoot,
  ColorSliderTrack,
  ColorSliderThumb,
  ColorSwatchRoot,
  KbdRoot,
  KbdContent,
  Skeleton,
  ToggleButton,
  ToggleButtonGroupRoot,
  ScrollShadowRoot,
  ChipRoot,
  ChipLabel,
} from "@heroui/react";
import { parseColor } from "react-aria-components";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
const appWindow = getCurrentWebviewWindow();
import { openUrl } from "@tauri-apps/plugin-opener";
import { API } from "./shared/api/client.js";
import { thumb } from "./shared/api/thumbnails.js";
import { TitleBar } from "./shared/ui/title-bar.jsx";
import { ContextMenu, CtxItem } from "./shared/ui/context-menu.jsx";
import { AmbientBackdrop } from "./shared/ui/ambient-backdrop.jsx";
import { DownloadQueueCard } from "./app/DownloadQueueCard.jsx";
import { SelectionActionBar } from "./app/SelectionActionBar.jsx";
import { storageCodecs, usePersistedState } from "./shared/hooks/use-persisted-state.js";
import { matchesShortcut, serializeShortcut } from "./shared/lib/shortcuts.js";
import { compareVersions } from "./shared/lib/version.js";
import { useNews } from "./app/hooks/use-news.js";
import { useNetworkStatus } from "./app/hooks/use-network-status.js";
import { useAppUpdate } from "./app/hooks/use-app-update.js";
import { useObsOverlay } from "./features/overlay/hooks/use-obs-overlay.js";
import { useRemoteControl } from "./features/remote/hooks/use-remote-control.js";
import { useDownloadManager } from "./features/downloads/hooks/use-download-manager.js";
import { useProfiles } from "./features/profiles/hooks/use-profiles.js";
import { LANGUAGES, translate, translationProgress } from "./i18n.js";
import { normalizeOverlayDoc } from "./overlay/schema.js";
import OverlayEditor from "./overlay/OverlayEditor.jsx";
import { startAudioLevels } from "./audioLevels.js";
import {
  generateIdentity,
  importIdentityFile,
  exportIdentityFile,
  buildSignedRequest,
} from "./unison/identity.js";
import {
  IconContext,
  Minus,
  X,
  Play,
  Pause,
  House,
  Books,
  Heart,
  CaretLineLeft,
  CaretLineRight,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  Gear,
  Palette,
  PlayCircle,
  Microphone,
  VinylRecord,
  MusicNote,
  Playlist,
  ImageSquare,
  DotsSixVertical,
  GripLines,
  Shuffle,
  SkipBack,
  SkipForward,
  Repeat,
  RepeatOnce,
  SpeakerX,
  SpeakerLow,
  SpeakerHigh,
  Queue,
  ChatText,
  CaretUp,
  CaretDown,
  Flag,
  ArrowsIn,
  ArrowsOut,
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
  Flask,
  ShareNodes,
  DeviceMobile,
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

import {
  LangContext,
  useLang,
  AnimationContext,
  useAnimations,
  ZoomContext,
  useZoom,
  FontScaleContext,
  useFontScale,
  TrackNumberContext,
} from "./context.jsx";
import {
  CreatePlaylistModal,
  RenamePlaylistModal,
  DeletePlaylistModal,
} from "./modals/playlist-modals.jsx";
import { NewsModal, renderNewsBody } from "./modals/news-modal.jsx";
import { BugReportModal } from "./modals/bug-report-modal.jsx";
import { ProfileSwitcherModal } from "./modals/profile-switcher-modal.jsx";
import { RemotePairModal, RemoteControlPanel } from "./ui/remote-control.jsx";
import { DEFAULT_LYRICS_PROVIDERS, PROVIDER_SYNC } from "./lyrics/providers.js";
import { parseDurationToSeconds } from "./lyrics/parse.js";
import { unisonSetNickname, unisonResetNickname, unisonFetchDisplayName } from "./unison/api.js";
import { ExplicitBadge, ArtistLinks, TrackRow, GridCard, SkeletonRow } from "./ui/rows.jsx";
import { Tooltip } from "./ui/tooltip.jsx";
import { useAccentColor } from "./ui/use-accent-color.js";
import { PlaylistLayout } from "./views/track-table.jsx";
import { CollectionView } from "./views/collection-view.jsx";
import { DownloadsView } from "./views/downloads-view.jsx";
import { HistoryView } from "./views/history-view.jsx";
import { LikedView } from "./views/liked-view.jsx";
import { LibraryView } from "./features/music/views/library-view.jsx";
import { SearchView } from "./features/music/views/search-view.jsx";
import { HomeView } from "./features/music/views/home-view.jsx";
import { ArtistView } from "./features/music/views/artist-view.jsx";
import { LyricsOverlay } from "./features/lyrics/LyricsOverlay.jsx";
import { CoverView, Player, QueuePanel, VIZ_DEFAULTS } from "./features/player/player-ui.jsx";
import { hiResThumb } from "./features/player/cover-art.js";
import { usePlayerController } from "./features/player/use-player-controller.js";
import { PlayerProvider } from "./features/player/player-context.jsx";
import { SettingsPanel } from "./features/settings/settings-panel.jsx";
import { SettingsSidebarContent } from "./features/settings/settings-sidebar.jsx";
import { DebugFloatingWindow } from "./features/settings/settings-support.jsx";
import { SettingsProviders } from "./features/settings/settings-context.jsx";
import {
  lockSettingsSection,
  isSettingsSectionLocked,
  setSettingsSectionStore,
  subscribeSettingsSection,
  getSettingsSection,
} from "./features/settings/section-store.js";
import { AddToPlaylistModal } from "./modals/add-to-playlist-modal.jsx";
import { particleBurst, dissolve } from "./effects/particle-burst.js";
import {
  Slider,
  Toggle,
  SettingRow,
  SettingsSectionLabel,
  SettingsSectionDesc,
} from "./ui/settings-controls.jsx";

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

async function openOverlayEditor() {
  const existing = await WebviewWindow.getByLabel("overlay-editor");
  if (existing) {
    await existing.setFocus();
    return;
  }
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

// openComposer (community-lyrics editor bridge) moved to features/lyrics/LyricsOverlay.jsx.

// SHA-256 hash of a PIN string (hex). Used for PIN protection storage — never stores plain text.
async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── App Version ─────────────────────────────────────────────────────────────
// Injected from src-tauri/tauri.conf.json at build time (see vite.config.js) — the single
// source of truth, so this never drifts from the shipped version.
const APP_VERSION = __APP_VERSION__;

// News feed + anonymous heartbeat now live in app/hooks/use-news.js.

// macOS uses a native titled window (traffic lights + native drag), so the custom
// titlebar/drag-region is Windows-only. (Borderless windows swallow clicks on macOS.)
const IS_MAC = /Mac OS X|Macintosh/.test(navigator.userAgent || "");

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

const SIDEBAR_EXPANDED = 288; // default expanded width
const SIDEBAR_COLLAPSED = 56;
const SIDEBAR_MIN = 230; // min when dragging
const SIDEBAR_MAX = 440; // max when dragging
const SPLIT_MIN = 0.22; // min/max cover-pane fraction in the fullscreen split view
const SPLIT_MAX = 0.78;
const QUEUE_DEFAULT = 360; // default queue panel width
const QUEUE_MIN = 320; // min when dragging
const QUEUE_MAX = 620; // max when dragging
const SIDEBAR_WIDTH_STORAGE = {
  serialize: storageCodecs.integer.serialize,
  deserialize: (raw) =>
    Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, storageCodecs.integer.deserialize(raw))),
};
const QUEUE_WIDTH_STORAGE = {
  serialize: storageCodecs.integer.serialize,
  deserialize: (raw) =>
    Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, storageCodecs.integer.deserialize(raw))),
};

function Sidebar({
  view,
  setView,
  onSearch,
  collapsed,
  onToggleCollapse,
  onOpenSettings,
  onOpenAccountTab,
  onOpenUpdateTab,
  onOpenOverlaySettings,
  onCloseOverlay,
  onOpenPlaylist,
  onOpenAlbum,
  onOpenArtist,
  onAddRecent,
  onContextMenu,
  currentProfileData,
  onOpenProfileSwitcher,
  profiles,
  onSwitchProfile,
  onAddProfile,
  onDeleteProfile,
  onReauthProfile,
  onLogout,
  onCreatePlaylist,
  updateInfo,
  offlineMode,
  isActuallyOffline,
  onToggleOffline,
  onRefreshView,
  obsEnabled,
  onOpenNews,
  onOpenFeedback,
  newsUnread = 0,
  settingsOpen,
  hideUserHandle,
}) {
  const [query, setQuery] = useState("");
  // Search autocomplete: debounced suggestion fetch + a dropdown under the field.
  const [suggestions, setSuggestions] = useState([]);
  const [sugOpen, setSugOpen] = useState(false);
  const sugBlurRef = useRef(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const id = setTimeout(() => {
      fetch(`${API}/search/suggestions?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : []))
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
    if (quitHoldTimer.current) {
      clearTimeout(quitHoldTimer.current);
      quitHoldTimer.current = null;
    }
  };
  const [pinnedPlaylists, setPinnedPlaylists] = useState([]);
  const [recentPlaylists, setRecentPlaylists] = useState([]);
  const anim = useAnimations();

  const reloadFromStorage = useCallback((prof) => {
    const p = prof || window.__activeProfile || "default";
    try {
      setPinnedPlaylists(JSON.parse(localStorage.getItem(`kiyoshi-pinned-${p}`) || "[]"));
    } catch {
      setPinnedPlaylists([]);
    }
    try {
      setRecentPlaylists(JSON.parse(localStorage.getItem(`kiyoshi-recent-${p}`) || "[]"));
    } catch {
      setRecentPlaylists([]);
    }
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
  const isPinned = (pl) => pinnedPlaylists.some((p) => sidebarItemId(p) === sidebarItemId(pl));
  const openItem = (pl) => {
    if (pl.type === "album") onOpenAlbum?.(pl);
    else if (pl.type === "artist") onOpenArtist?.(pl);
    else onOpenPlaylist(pl);
  };

  useEffect(() => {
    if (tetoVisible && !query.toLowerCase().includes("teto")) hideTeto();
  }, [query]);

  const hideTeto = () => {
    setTetoLeaving(true);
    clearTimeout(tetoTimerRef.current);
    tetoTimerRef.current = setTimeout(() => {
      setTetoVisible(false);
      setTetoLeaving(false);
    }, 450);
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

  const pickSuggestion = (s) => {
    setQuery(s);
    handleSubmit(s);
  };
  // Dropdown of live suggestions, positioned under the (relatively-positioned) field wrapper.
  const suggestionsBox =
    sugOpen && query.trim().length >= 2 && suggestions.length > 0 ? (
      <div
        onMouseDown={(e) => e.preventDefault()} /* keep field focus so onClick fires before blur */
        style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 60,
          marginTop: 4,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          overflow: "hidden",
          padding: 4,
        }}
      >
        {suggestions.map((s, i) => (
          <div
            key={i}
            onClick={() => pickSuggestion(s)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 6,
              cursor: "default",
              fontSize: "var(--t13)",
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <MagnifyingGlass size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s}</span>
          </div>
        ))}
      </div>
    ) : null;
  const sugFocus = () => {
    clearTimeout(sugBlurRef.current);
    setSugOpen(true);
  };
  const sugBlur = () => {
    sugBlurRef.current = setTimeout(() => setSugOpen(false), 150);
  };

  const mainNavItems = [
    { id: "home", label: t("home"), iconEl: <House size={16} /> },
    { id: "library", label: t("library"), iconEl: <Books size={16} /> },
  ];

  const secondaryNavItems = [
    { id: "liked", label: t("likedSongs"), iconEl: <Heart size={16} /> },
    { id: "history", label: t("history"), iconEl: <ClockCounterClockwise size={16} /> },
    { id: "downloads", label: t("downloads"), iconEl: <DownloadSimple size={16} /> },
  ];

  // HeroUI ListBox-based navigation. Selected state is unstyled by HeroUI, so we
  // map it to our accent via data-[selected=true]. onAction handles navigation;
  // selectedKeys (controlled from `view`) drives the active highlight.
  const navList = (items) => (
    <ListBox
      aria-label="Navigation"
      selectionMode="none"
      onAction={(key) => {
        setView(key);
        onCloseOverlay?.();
      }}
      className="w-full"
    >
      {items.map((item) => (
        <ListBoxItem
          key={item.id}
          id={item.id}
          textValue={item.label}
          className={cn(
            "text-t13 min-h-10 rounded-xl",
            view === item.id && "bg-accent-dim text-accent",
            collapsed && "justify-center"
          )}
          onMouseEnter={(e) => {
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
        const pl = items.find((p) => sidebarItemId(p) === key);
        if (pl) {
          openItem(pl);
          onCloseOverlay?.();
        }
      }}
      className="w-full"
    >
      {items.map((pl) => (
        <ListBoxItem
          key={sidebarItemId(pl)}
          id={sidebarItemId(pl)}
          textValue={pl.title}
          className={cn(
            "text-t12 rounded-xl",
            collapsed ? "justify-center px-0 min-h-12" : "min-h-14"
          )}
          onContextMenu={(e) => onContextMenu?.(e, pl)}
          onMouseEnter={(e) => {
            if (collapsed) {
              const r = e.currentTarget.getBoundingClientRect();
              setTooltip({ text: pl.title, x: r.right + 10, y: r.top + r.height / 2 });
            }
          }}
          onMouseLeave={() => collapsed && setTooltip(null)}
        >
          <div
            className={cn(
              "shrink-0 overflow-hidden bg-elevated flex items-center justify-center",
              collapsed ? "w-9 h-9" : "w-10 h-10",
              pl.type === "artist" ? "rounded-full" : "rounded-md"
            )}
          >
            {pl.thumbnail ? (
              <img src={thumb(pl.thumbnail)} alt="" className="w-full h-full object-cover" />
            ) : pl.type === "album" ? (
              <VinylRecord size={18} className="text-muted" />
            ) : pl.type === "artist" ? (
              <Microphone size={18} className="text-muted" />
            ) : (
              <Playlist size={18} className="text-muted" />
            )}
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
          onMouseEnter={
            collapsed
              ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTooltip({ text: t(titleKey), x: r.right + 10, y: r.top + r.height / 2 });
                }
              : undefined
          }
          onMouseLeave={collapsed ? () => setTooltip(null) : undefined}
        >
          <span className={cn("shrink-0 flex items-center justify-center", !collapsed && "w-3.5")}>
            <Icon size={collapsed ? 15 : 11} weight={iconWeight} />
          </span>
          {!collapsed && t(titleKey)}
          {!collapsed && <DisclosureIndicator />}
        </DisclosureTrigger>
      </DisclosureHeading>
      <DisclosureContent>
        <DisclosureBody className="!p-0">{playlistList(items)}</DisclosureBody>
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
    <DropdownPopover
      placement="top start"
      className="data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-bottom-3 data-[entering]:duration-300 data-[entering]:ease-out data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:slide-out-to-bottom-3 data-[exiting]:duration-200 data-[exiting]:ease-in"
    >
      <DropdownMenu
        onAction={handleAccountAction}
        aria-label={t("account")}
        className="w-[var(--trigger-width)] min-w-56"
      >
        <DropdownSection>
          <DropdownItem id="profile" textValue={t("account")}>
            <span className="w-4 flex justify-center shrink-0">
              <UserCircle size={16} />
            </span>
            {t("account")}
          </DropdownItem>
          {profiles?.length > 1 ? (
            <DropdownItem id="switch" textValue={t("switchAccount")}>
              <span className="w-4 flex justify-center shrink-0">
                <Users size={16} />
              </span>
              {t("switchAccount")}
            </DropdownItem>
          ) : null}
          <DropdownItem id="logout" textValue={t("logOut")}>
            <span className="w-4 flex justify-center shrink-0">
              <SignOut size={16} />
            </span>
            {t("logOut")}
          </DropdownItem>
        </DropdownSection>
        <DropdownSection className="w-full border-t border-border mt-1 pt-1">
          {obsEnabled ? (
            <DropdownItem id="overlay" textValue={t("overlay")}>
              <span className="w-4 flex justify-center shrink-0">
                <ScreencastSimple size={16} />
              </span>
              {t("overlay")}
            </DropdownItem>
          ) : null}
          <DropdownItem id="news" textValue={t("news") || "Neuigkeiten"}>
            <span className="w-4 flex justify-center shrink-0">
              <Megaphone size={16} />
            </span>
            <span className="flex items-center gap-2">
              {t("news") || "Neuigkeiten"}
              {newsUnread > 0 && (
                <span
                  className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {newsUnread}
                </span>
              )}
            </span>
          </DropdownItem>
          <DropdownItem id="feedback" textValue={t("reportBug") || "Fehler melden"}>
            <span className="w-4 flex justify-center shrink-0">
              <Bug size={16} />
            </span>
            {t("reportBug") || "Fehler melden"}
          </DropdownItem>
          <DropdownItem id="settings" textValue={t("settings")}>
            <span className="w-4 flex justify-center shrink-0">
              <Gear size={16} />
            </span>
            {t("settings")}
          </DropdownItem>
          <DropdownItem
            id="quit"
            textValue={t("quitApp")}
            className="relative overflow-hidden"
            onPointerDown={startQuitHold}
            onPointerUp={cancelQuitHold}
            onPointerLeave={cancelQuitHold}
            onPointerCancel={cancelQuitHold}
          >
            <span
              className="absolute inset-0 origin-left pointer-events-none"
              style={{
                background: "rgba(244,67,54,0.28)",
                transform: quitHolding ? "scaleX(1)" : "scaleX(0)",
                transition: quitHolding ? "transform 1s linear" : "transform 0.15s ease",
              }}
            />
            <span className="w-4 flex justify-center shrink-0 relative z-[1]">
              <Power size={16} />
            </span>
            <span className="relative z-[1]">{t("quitApp")}</span>
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </DropdownPopover>
  );

  return (
    <div
      className="w-full h-full bg-transparent flex flex-col pt-4 shrink-0 rounded-xl overflow-hidden"
      style={{ visibility: settingsOpen ? "hidden" : "visible" }}
    >
      {/* Tooltip portal */}
      {tooltip && (
        <div
          className="fixed -translate-y-1/2 bg-elevated text-primary px-2.5 py-1 rounded text-t12 whitespace-nowrap border border-border pointer-events-none z-[9999] shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
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
          IS_MAC && !collapsed ? "pb-3" : "pb-4",
          collapsed ? "justify-center px-3" : "justify-start",
          !collapsed && (IS_MAC ? "pl-[72px] pr-2.5" : "px-3"),
          collapsed && IS_MAC && "pt-8"
        )}
      >
        {/* Collapse toggle: leading on Windows/Linux and when collapsed; on macOS-expanded
            it moves to the trailing side (after the search). */}
        {(!IS_MAC || collapsed) && (
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={onToggleCollapse}
            className="shrink-0 relative z-[201] rounded-full"
            style={{ visibility: settingsOpen ? "hidden" : "visible", contain: "layout style" }}
            onMouseEnter={(e) => {
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

        {!collapsed &&
          (IS_MAC ? (
            <>
              <div
                className="flex-1 min-w-0"
                style={{
                  contain: "layout style",
                  position: "relative",
                  zIndex: sugOpen ? 70 : "auto",
                }}
                onFocus={sugFocus}
                onBlur={sugBlur}
              >
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
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={onRefreshView}
                className="shrink-0 rounded-full"
                title={t("refresh")}
                style={{ contain: "layout style" }}
              >
                <ArrowClockwise size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={onToggleCollapse}
                className="shrink-0 rounded-full"
                title={t("collapse") || "Collapse"}
                style={{ contain: "layout style" }}
              >
                <CaretLineLeft size={16} />
              </Button>
            </>
          ) : (
            <>
              <img
                src="/Kodama%20Logo.png"
                alt="Kodama"
                width="20"
                height="20"
                className="shrink-0"
              />
              <span className="text-t15 font-medium whitespace-nowrap">Kodama</span>
              <div className="ml-auto flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
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
        <div
          className="px-3 mb-3"
          style={{ contain: "layout style", position: "relative", zIndex: sugOpen ? 70 : "auto" }}
          onFocus={sugFocus}
          onBlur={sugBlur}
        >
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
        <div className={cn("overflow-y-auto flex-1 min-h-0 my-1", collapsed ? "px-0" : "px-2")}>
          {pinnedPlaylists.length > 0 &&
            playlistSection("pinned", pinnedPlaylists, PushPin, "fill")}
          {recentPlaylists.filter((pl) => !isPinned(pl)).length > 0 &&
            playlistSection(
              "recentlyOpened",
              recentPlaylists.filter((pl) => !isPinned(pl)),
              ClockCounterClockwise
            )}
        </div>
      )}

      {/* New Playlist button */}
      {!collapsed && (
        <div className="px-2 mb-1.5">
          <Button
            variant="ghost"
            fullWidth
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
            <div
              onClick={onOpenUpdateTab}
              className="flex items-center gap-2 py-1.5 px-3 mb-1 rounded-xl text-t12 font-medium text-accent transition-all duration-150"
              style={{ background: "rgba(224,64,251,0.08)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(224,64,251,0.15)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(224,64,251,0.08)")}
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
                    {currentProfileData?.avatar ? (
                      <img
                        src={thumb(currentProfileData.avatar)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (currentProfileData?.displayName || "?")[0].toUpperCase()
                    )}
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0 text-left">
                    <div className="text-t12 font-medium truncate">
                      {currentProfileData?.displayName || t("noProfile")}
                    </div>
                    {!(hideUserHandle && currentProfileData?.handle) && (
                      <div className="text-t11 text-muted truncate">
                        {currentProfileData?.handle || t("switchProfile")}
                      </div>
                    )}
                  </div>
                </DropdownTrigger>
                {accountMenu}
              </Dropdown>
            </div>
            {/* What's-new bell, beside the profile button */}
            <div className="relative shrink-0">
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={onOpenNews}
                className="shrink-0 rounded-full"
                title={t("news") || "Neuigkeiten"}
                style={{ contain: "layout style" }}
              >
                <Bell size={16} />
              </Button>
              {newsUnread > 0 && (
                <span
                  className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-[9px] font-bold leading-none pointer-events-none"
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    boxShadow: "0 0 0 2px var(--bg-surface)",
                  }}
                >
                  {newsUnread > 9 ? "9+" : newsUnread}
                </span>
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
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    text: currentProfileData?.displayName || "Kiyoshi",
                    x: r.right + 10,
                    y: r.top + r.height / 2,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                {currentProfileData?.avatar ? (
                  <img
                    src={thumb(currentProfileData.avatar)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (currentProfileData?.displayName || "?")[0].toUpperCase()
                )}
              </DropdownTrigger>
              {accountMenu}
            </Dropdown>
            {updateInfo && (
              <div
                className="w-9 h-9 rounded flex items-center justify-center text-accent"
                style={{ background: "rgba(224,64,251,0.08)" }}
                onClick={onOpenUpdateTab}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    text: t("updateAvailable"),
                    x: r.right + 10,
                    y: r.top + r.height / 2,
                  });
                }}
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
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    text: isActuallyOffline ? t("offlineBanner") : t("offlineComingSoon"),
                    x: r.right + 10,
                    y: r.top + r.height / 2,
                  });
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
      {tetoVisible &&
        createPortal(
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
// Works for everyone regardless of whether they have Kodama installed. Title/artist/cover are
// encoded in the link so the landing page can show the song without any API call.
const KODAMA_SHARE_BASE = "https://kiyoshithedevil.github.io/Kodama/s/";
function buildShareLink(track) {
  const p = new URLSearchParams({ v: track.videoId });
  const title = track.title || "";
  const artists = Array.isArray(track.artists)
    ? track.artists
        .map((a) => (a && a.name) || a)
        .filter(Boolean)
        .join(", ")
    : track.artists || "";
  if (title) p.set("t", title);
  if (artists) p.set("a", artists);
  if (track.thumbnail) p.set("c", track.thumbnail);
  return `${KODAMA_SHARE_BASE}?${p.toString()}`;
}
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
      }).then((fn) => {
        unlistenComplete = fn;
      });
      listen("login-cancelled", () => {
        setStep("start");
      }).then((fn) => {
        unlistenCancelled = fn;
      });
    });
    return () => {
      if (unlistenComplete) unlistenComplete();
      if (unlistenCancelled) unlistenCancelled();
    };
  }, []);

  const startLogin = async () => {
    const name = forcedProfileName || "account_" + Date.now();
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
  const Btn = LoginBtn;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-base)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <CardRoot
        variant="secondary"
        className="relative gap-0!"
        style={{
          width: 420,
          maxWidth: "92vw",
          padding: 36,
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        {onCancel && step !== "waiting" && (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className="absolute top-3.5 right-3.5 size-7 min-w-0 rounded-full text-muted hover:text-primary"
            onPress={onCancel}
          >
            <X size={16} />
          </Button>
        )}
        <Logo />

        {/* ── Start ── */}
        {step === "start" && (
          <>
            <div
              style={{
                fontSize: "var(--t20)",
                fontWeight: 700,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {forcedProfileName ? t("reauthTitle") : t("welcome")}
            </div>
            <div
              style={{
                fontSize: "var(--t13)",
                color: "var(--text-muted)",
                textAlign: "center",
                marginBottom: 28,
                lineHeight: 1.6,
              }}
            >
              {forcedProfileName ? t("reauthDesc") : t("loginDesc")}
            </div>
            <Btn onClick={startLogin}>{t("loginButton")}</Btn>
            {/* Hide "create local profile" for a cancelable re-auth (from settings — it has an X);
                keep it at startup as an escape hatch even when re-auth is targeted. */}
            {!(forcedProfileName && onCancel) && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: "var(--t11)", color: "var(--text-muted)" }}>
                    {t("orSignInWithGoogle")
                      ? t("orSignInWithGoogle").split(" ").slice(-2).join(" ")
                      : "oder"}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
                <Btn onClick={() => setStep("local-create")} secondary>
                  {t("createLocalProfile")}
                </Btn>
              </>
            )}
            <div
              style={{
                fontSize: "var(--t11)",
                color: "var(--text-muted)",
                textAlign: "center",
                marginTop: 14,
                lineHeight: 1.6,
              }}
            >
              {t("loginHint")}
            </div>
          </>
        )}

        {/* ── Lokales Profil erstellen ── */}
        {step === "local-create" && (
          <>
            <div
              style={{
                fontSize: "var(--t18)",
                fontWeight: 700,
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              {t("localProfile")}
            </div>
            <div
              style={{
                fontSize: "var(--t12)",
                color: "var(--text-muted)",
                textAlign: "center",
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              {t("localProfileDesc")}
            </div>
            {/* Vorteile-Panel */}
            <div
              style={{
                background: "var(--bg-elevated)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 20,
                border: "0.5px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--t11)",
                  fontWeight: 600,
                  color: "var(--accent)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM8 5.5a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
                {t("googleBenefits")}
              </div>
              {[
                { icon: "☁️", key: "benefitLibrary" },
                { icon: "🎵", key: "benefitRecommendations" },
                { icon: "📋", key: "benefitPlaylists" },
                { icon: "🔄", key: "benefitSync" },
              ].map(({ icon, key }) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "var(--t12)",
                    color: "var(--text-secondary)",
                    marginBottom: 4,
                  }}
                >
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
                onKeyDown={(e) => e.key === "Enter" && createLocalProfile()}
              />
            </TextFieldRoot>
            <Btn onClick={createLocalProfile} disabled={!localName.trim() || localLoading}>
              {localLoading ? "..." : t("createProfile")}
            </Btn>
            <div style={{ marginTop: 10 }}>
              <Btn onClick={() => setStep("start")} secondary>
                {t("cancel")}
              </Btn>
            </div>
          </>
        )}

        {/* ── Warten ── */}
        {step === "waiting" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div className="flex justify-center" style={{ marginBottom: 20 }}>
              <Spinner size="lg" />
            </div>
            <div style={{ fontSize: "var(--t15)", fontWeight: 600, marginBottom: 8 }}>
              {t("loginWaiting")}
            </div>
            <div
              style={{
                fontSize: "var(--t12)",
                color: "var(--text-muted)",
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              {t("loginWaitingDesc")}
            </div>
            <Btn onClick={cancelLogin} secondary>
              {t("cancel")}
            </Btn>
          </div>
        )}

        {/* ── Erfolg ── */}
        {step === "success" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
              <CheckCircle size={52} weight="fill" style={{ color: "var(--accent)" }} />
            </div>
            <div style={{ fontSize: "var(--t16)", fontWeight: 600, marginBottom: 6 }}>
              {t("loginSuccess")}
            </div>
            <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)" }}>
              {t("loginSuccessHint")}
            </div>
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
    <div
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

  const [view, setView] = useState("home");
  const [navHistory, setNavHistory] = useState([]); // navigation history stack for back button
  const [appKey, setAppKey] = useState(0); // increment to force full re-render
  const [viewRefreshKey, setViewRefreshKey] = useState(0); // increment to refresh current view
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth, { setTransient: setSidebarWidthTransient }] =
    usePersistedState("kiyoshi-sidebar-width", SIDEBAR_EXPANDED, SIDEBAR_WIDTH_STORAGE);
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
      setSidebarWidthTransient(w);
    };
    const onUp = () => {
      setSidebarResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setSidebarWidth((width) => width);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setSidebarWidth, setSidebarWidthTransient]);

  // Drag-to-resize the queue panel (docked right; handle sits on its left edge).
  const [queueWidth, setQueueWidth, { setTransient: setQueueWidthTransient }] = usePersistedState(
    "kiyoshi-queue-width",
    QUEUE_DEFAULT,
    QUEUE_WIDTH_STORAGE
  );
  const [queueResizing, setQueueResizing] = useState(false);
  const startQueueResize = useCallback((e) => {
    e.preventDefault();
    setQueueResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      // Panel's right edge sits 8px from the window's right; width ≈ (rightEdge - cursorX).
      const w = Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, window.innerWidth - 8 - ev.clientX));
      setQueueWidthTransient(w);
    };
    const onUp = () => {
      setQueueResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setQueueWidth((width) => width);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setQueueWidth, setQueueWidthTransient]);
  const [globalContextMenu, setGlobalContextMenu] = useState(null); // { x, y, playlist }
  const [pinnedIds, setPinnedIds] = useState([]);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [createPlaylistForSelection, setCreatePlaylistForSelection] = useState(false);
  const [createPlaylistTracks, setCreatePlaylistTracks] = useState(null); // tracks to add to the freshly created playlist (from "Add to playlist ▸ New playlist")
  const [selectedTracks, setSelectedTracks] = useState(new Map()); // videoId → track
  const [selectionPlaylistOpen, setSelectionPlaylistOpen] = useState(false);

  const toggleTrackSelection = useCallback((track) => {
    setSelectedTracks((prev) => {
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
      setSelectedTracks(new Map(tracks.map((tr) => [tr.videoId, tr])));
    }
  }, []);
  const [trackContextMenu, setTrackContextMenu] = useState(null); // { x, y, track, playlistId? }
  const [addToPlaylistFor, setAddToPlaylistFor] = useState(null); // { tracks: [...] } — opens the add-to-playlist modal
  const [renameDialog, setRenameDialog] = useState(null); // { playlistId, title }
  const [deleteDialog, setDeleteDialog] = useState(null); // { playlistId, title }
  const [likedIds, setLikedIds] = useState(new Set());
  // Download/cache state + operations live in features/downloads/hooks/use-download-manager.js.
  // Network status + offline mode live in app/hooks/use-network-status.js.
  const [debugFloat, setDebugFloat] = useState(false);
  const mutePrevVolumeRef = useRef(0.5);

  // ─── Toast Notifications (HeroUI toast system) ───────────────────────────────
  // Thin wrapper so all existing addToast(message, type) call sites keep working.
  const addToast = useCallback((message, type = "info") => {
    if (type === "error") toast.danger(message, { timeout: 6000 });
    else if (type === "success") toast.success(message, { timeout: 3500 });
    else toast(message, { timeout: 3500 });
  }, []);

  // ─── App update lifecycle (see app/hooks/use-app-update.js) ──────────────────
  // Owns the plugin-updater check/download/install and the silent startup check.
  const {
    updateInfo,
    updateDownloading,
    updateDownloadProgress,
    updateDownloaded,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    cancelUpdateDownload,
  } = useAppUpdate({ addToast, getInitialLang });

  // Start Rust audio-level collection on mount (the update check runs from the hook).
  useEffect(() => {
    startAudioLevels();
  }, []);

  // Unified item ID — playlists use playlistId, albums use browseId
  const itemId = (item) => item?.playlistId || item?.browseId || null;
  const profileKey = (base) => `${base}-${window.__activeProfile || "default"}`;

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

  const openContextMenu = useCallback((e, pl) => {
    e.preventDefault();
    setGlobalContextMenu({ x: e.clientX, y: e.clientY, playlist: pl });
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);

  // ── News feed (see app/hooks/use-news.js) + bug report ──────────────────────
  const { newsItems, newsOpen, setNewsOpen, newsUnreadSnapshot, newsUnreadCount, loadNews, openNews } =
    useNews();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackShot, setFeedbackShot] = useState(null);
  // Capture the app window first (so the screenshot shows the app, not the report form),
  // then open the dialog. Small delay lets the dropdown menu close before the capture.
  const openFeedback = useCallback(async () => {
    let shot = null;
    try {
      await new Promise((r) => setTimeout(r, 180));
      const { invoke } = await import("@tauri-apps/api/core");
      shot = await invoke("capture_screenshot");
    } catch {
      shot = null;
    }
    setFeedbackShot(shot);
    setFeedbackOpen(true);
  }, []);
  const [settingsTab, setSettingsTab] = useState("darstellung");
  // Scroll-spy for the settings sub-nav lives in an external store (see setSettingsSectionStore)
  // so it never re-renders App. Clicking a sub-entry just scrolls; the content observer updates
  // the store, and only the sidebar subscribes.
  const selectSettingsSection = useCallback((id) => {
    lockSettingsSection();
    setSettingsSectionStore(id);
    document
      .getElementById("set-sec-" + id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const [settingsInitialTab, setSettingsInitialTab] = useState(null);
  const closeSettings = useCallback(() => {
    setSettingsClosing(true);
    setTimeout(() => {
      setSettingsOpen(false);
      setSettingsClosing(false);
    }, 240);
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
  const instrumentalVizRef = useRef(instrumentalViz);
  instrumentalVizRef.current = instrumentalViz;
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
  const [flashbang, setFlashbang] = useState(false);
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
  // Player controller owns the audio, track, queue, playing state, and playback commands.
  // Consumed here via destructure so existing JSX/prop chains are unchanged (Step 11).
  // resetLyricsSessionRef is populated further down, once the lyrics-session state exists.
  const resetLyricsSessionRef = useRef(null);
  const player = usePlayerController({ addToast, resetLyricsSessionRef });
  const {
    audioRef,
    currentTrack,
    setCurrentTrack,
    isPlaying,
    setIsPlaying,
    setQueue,
    queueRef,
    enqueue,
    startSongRadio,
    crossfade,
    setCrossfade,
    playbackProgressive,
    setPlaybackProgressive,
    crossfadeOverrides,
    removeCrossfadeOverride,
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
    fetch(`${API}/lastfm/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };
  const refreshLastfm = useCallback(() => {
    fetch(`${API}/lastfm/status`)
      .then((r) => r.json())
      .then((d) => {
        lastfmConnectedRef.current = !!d.connected;
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshLastfm();
    const h = () => refreshLastfm();
    window.addEventListener("lastfm-changed", h);
    window.addEventListener("profile-switched", h);
    return () => {
      window.removeEventListener("lastfm-changed", h);
      window.removeEventListener("profile-switched", h);
    };
  }, [refreshLastfm]);
  // On track change → reset scrobble state + send Now Playing.
  useEffect(() => {
    const vid = currentTrack?.videoId;
    if (!vid) {
      scrobbleRef.current = { videoId: null, played: 0, scrobbled: false, startTs: 0 };
      return;
    }
    scrobbleRef.current = {
      videoId: vid,
      played: 0,
      scrobbled: false,
      startTs: Math.floor(Date.now() / 1000),
    };
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
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [lyricsRefetchKey, setLyricsRefetchKey] = useState(0);
  const [forcedLyricsProvider, setForcedLyricsProvider] = useState(null);
  const [currentLyricsSource, setCurrentLyricsSource] = useState("");
  const [failedLyricsProviders, setFailedLyricsProviders] = useState(new Set());
  // Wire the player controller's per-track lyrics-session reset (see usePlayerController). Assigned
  // every render; the setters it closes over are stable, so identity does not matter.
  resetLyricsSessionRef.current = () => {
    setForcedLyricsProvider(null);
    setCurrentLyricsSource("");
    setFailedLyricsProviders(new Set());
  };
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
  const [isCustomLyrics, setIsCustomLyrics] = useState(false);
  const [showAgentTags, setShowAgentTags] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-agent-tags") !== "false"
  );
  const importLyricsRef = useRef(null);
  const removeCustomLyricsRef = useRef(null);

  // Reset lyrics state on every track change (incl. auto-advance / prev-next)
  useEffect(() => {
    setFailedLyricsProviders(new Set());
    setForcedLyricsProvider(null);
    setCurrentLyricsSource("");
  }, [currentTrack?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showLyrics, setShowLyrics] = useState(true);
  const showLyricsRef = useRef(showLyrics);
  showLyricsRef.current = showLyrics;
  // Combined split view (fullscreen only): cover/visualizer left, lyrics right.
  const [splitView, setSplitView] = useState(false);
  const splitViewRef = useRef(splitView);
  splitViewRef.current = splitView;
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
      setSplitRatio((r) => {
        localStorage.setItem("kiyoshi-split-ratio", String(r));
        return r;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  // Auto-switch to the cover view during instrumental segments, then back to lyrics. The ref
  // remembers whether *we* made the switch, so a manual toggle isn't overridden afterwards.
  const autoCoverRef = useRef(false);
  const lastInstSwitchRef = useRef(0); // cooldown so the auto-switch can't rapidly flip
  const setShowLyricsManual = useCallback((v) => {
    autoCoverRef.current = false;
    setShowLyrics(v);
  }, []);
  // Instrumental segment toggles the cover view in/out (only if the feature is on and we
  // aren't overriding a manual choice). Reuses the existing 0.35s showLyrics crossfade.
  // A short cooldown guards against any rapid back-and-forth flicker.
  const handleInstrumentalChange = useCallback((inst) => {
    if (!instrumentalVizRef.current || splitViewRef.current) return;
    const now = performance.now();
    if (now - lastInstSwitchRef.current < 1500) return;
    if (inst) {
      if (showLyricsRef.current) {
        autoCoverRef.current = true;
        lastInstSwitchRef.current = now;
        setShowLyrics(false);
      }
    } else if (autoCoverRef.current) {
      autoCoverRef.current = false;
      lastInstSwitchRef.current = now;
      setShowLyrics(true);
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

  // Composer-pause and native window title now live in usePlayerController (Step 11d).

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
          ? currentTrack.artists.map((a) => a?.name || a).join(", ")
          : currentTrack.artists || "";

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
        ? currentTrack.artists.map((x) => x?.name || x).join(", ")
        : currentTrack?.artists || "";
      const payload = {
        title: currentTrack?.title || "",
        artist: artistStr,
        album: currentTrack?.album || "",
        cover: coverUrl,
        progress: a?.currentTime || 0,
        duration: a?.duration || 0,
        isPlaying: isPlaying && !!currentTrack,
      };
      // External Kimuco v1
      fetch("http://127.0.0.1:8888/api/source/kiyoshi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(500),
        body: JSON.stringify(payload),
      }).catch(() => {});
      // Built-in overlay server
      if (obsEnabled) {
        fetch(`${API}/overlay/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(500),
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    };

    report();
    const id = setInterval(report, 1000);
    return () => clearInterval(id);
  }, [currentTrack, isPlaying, obsEnabled]);

  // Playback commands (handlePlay/enqueue/startSongRadio/playByVideoId), the Big Picture
  // bridge, and deep-link handling moved to features/player/use-player-controller.js (Step 11).

  const [language, setLanguage] = useState(() => getInitialLang());

  // ── Downloads + local cache (see features/downloads/hooks/use-download-manager.js) ──
  const {
    cachedSongIds,
    downloadingIds,
    premiumSongIds,
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
  } = useDownloadManager({ addToast, language });

  const handleSearch = useCallback((q) => {
    setSearchQuery(q);
    setView("search");
  }, []);

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

  const openPlaylist = useCallback((item, fromView, refresh = false) => {
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
  }, []);

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

  const [animations, setAnimations] = useState(
    () => localStorage.getItem("kiyoshi-animations") !== "false"
  );
  // Defer the queue panel's ambient blur until the slide-in transition has settled.
  useEffect(() => {
    if (!queueOpen) {
      setQueueSettled(false);
      return;
    }
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
  const [autoplay, setAutoplay] = useState(
    () => localStorage.getItem("kiyoshi-autoplay") !== "false"
  );
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
    handleAccountSwitch,
    handleAccountAdd,
    handleAccountReauth,
    handleAccountRemove,
    handleAccountRename,
    handleAccountAvatarChange,
    handleAccountLogout,
  } = useProfiles({
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
  });

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
        if (lastfmConnectedRef.current) {
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
    [likedIds]
  );

  // ── Network status + offline mode (see app/hooks/use-network-status.js) ──
  const { offlineMode, isActuallyOffline, isOffline, handleToggleOffline } = useNetworkStatus({
    fetchProfiles,
    setAppKey,
    setView,
  });

  // Debug float window toggle
  useEffect(() => {
    const handler = () => setDebugFloat(true);
    window.addEventListener("kiyoshi-debug-float", handler);
    return () => window.removeEventListener("kiyoshi-debug-float", handler);
  }, []);

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

  const [artistView, setArtistView] = useState(null);

  // Always-fresh snapshot of current nav state — used by open* callbacks to push history.
  // Updated synchronously on every render so callbacks always read the latest values.
  const navStateRef = useRef({ view: "home", collection: null, artistView: null });
  navStateRef.current = { view, collection, artistView };

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
    [view]
  );

  // ── Navigation history ──────────────────────────────────────────────────────
  // Snapshot the current view state onto the history stack before navigating away.
  const pushNav = useCallback((currentView, currentCollection, currentArtistView) => {
    setNavHistory((h) => [
      ...h,
      {
        view: currentView,
        collection: currentView === "collection" ? currentCollection : undefined,
        artistView: currentView === "artist" ? currentArtistView : undefined,
      },
    ]);
  }, []);

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

  // ── Clear track selection when view changes ─────────────────────────────────
  useEffect(() => {
    clearSelection();
  }, [view]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tgt = e.target;
      // Never hijack keystrokes meant for text entry or for an open menu/dialog
      // (e.g. the search field inside the "Add to playlist" submenu). The menu
      // popover holds DOM focus (role="menu") while its search field is typed in,
      // so a plain tagName check isn't enough — also bail when focus is inside one.
      if (
        tgt.tagName === "INPUT" ||
        tgt.tagName === "TEXTAREA" ||
        tgt.isContentEditable ||
        (tgt.closest && tgt.closest('[role="menu"],[role="dialog"],[role="menuitem"]'))
      )
        return;
      const isModifier = ["Control", "Shift", "Alt", "Meta"].includes(e.key);

      // Recording mode — capture next non-modifier key (with any active modifiers)
      if (recordingShortcutRef.current) {
        if (!isModifier) {
          e.preventDefault();
          if (e.code !== "Escape") {
            const actionId = recordingShortcutRef.current;
            const shortcut = serializeShortcut(e);
            setCustomShortcuts((prev) => {
              const next = { ...prev, [actionId]: shortcut };
              localStorage.setItem("kiyoshi-shortcuts", JSON.stringify(next));
              return next;
            });
            setShortcutLabels((prev) => {
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
        setShortcutLabels((prev) => {
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

      if (matchesShortcut(sc.playPause, e)) {
        e.preventDefault();
        if (audioRef.current) {
          if (audioRef.current.paused) {
            audioRef.current.play();
            setIsPlaying(true);
          } else {
            audioRef.current.pause();
            setIsPlaying(false);
          }
        }
      } else if (matchesShortcut(sc.nextTrack, e)) {
        e.preventDefault();
        const q = queueRef.current;
        setCurrentTrack((t) => {
          if (!t) return t;
          const idx = q.findIndex((x) => x.videoId === t.videoId);
          return idx < q.length - 1 ? q[idx + 1] : t;
        });
      } else if (matchesShortcut(sc.prevTrack, e)) {
        e.preventDefault();
        const q = queueRef.current;
        setCurrentTrack((t) => {
          if (!t) return t;
          const idx = q.findIndex((x) => x.videoId === t.videoId);
          return idx > 0 ? q[idx - 1] : t;
        });
      } else if (matchesShortcut(sc.volUp, e)) {
        e.preventDefault();
        if (audioRef.current) {
          const dv = Math.min(1, Math.sqrt(audioRef.current.volume) + 0.02);
          audioRef.current.volume = dv * dv;
        }
      } else if (matchesShortcut(sc.volDown, e)) {
        e.preventDefault();
        if (audioRef.current) {
          const dv = Math.max(0, Math.sqrt(audioRef.current.volume) - 0.02);
          audioRef.current.volume = dv * dv;
        }
      } else if (matchesShortcut(sc.fullscreen, e)) {
        setFullscreen((f) => {
          const next = !f;
          import("@tauri-apps/api/core").then(({ invoke }) =>
            invoke("set_fullscreen", { fullscreen: next }).catch(() => {})
          );
          if (next) setOverlayOpen(true);
          return next;
        });
      } else if (e.code === "Escape") {
        setOverlayOpen(false);
        setQueueOpen(false);
      } else if (e.code === "F8") {
        e.preventDefault();
        openFeedback();
      } else if (matchesShortcut(sc.mute, e)) {
        e.preventDefault();
        if (audioRef.current) {
          if (audioRef.current.volume > 0) {
            mutePrevVolumeRef.current = audioRef.current.volume;
            audioRef.current.volume = 0;
          } else {
            audioRef.current.volume = mutePrevVolumeRef.current || 0.5;
          }
        }
      } else if (matchesShortcut(sc.lyrics, e)) {
        e.preventDefault();
        if (!currentTrack) return;
        if (overlayOpen) {
          if (splitView) {
            setSplitView(false);
            setShowLyricsManual(true);
          } else setShowLyricsManual((l) => !l);
        } else {
          setOverlayOpen(true);
        }
      } else if (matchesShortcut(sc.seekBack, e)) {
        e.preventDefault();
        if (audioRef.current)
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
      } else if (matchesShortcut(sc.seekForward, e)) {
        e.preventDefault();
        if (audioRef.current)
          audioRef.current.currentTime = Math.min(
            audioRef.current.duration || 0,
            audioRef.current.currentTime + 5
          );
      } else if (matchesShortcut(sc.zoomIn, e) || (e.ctrlKey && e.code === "NumpadAdd")) {
        e.preventDefault();
        setUiZoom((z) => {
          const idx = ZOOM_STEPS.indexOf(z);
          const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx >= 0 ? idx + 1 : 2)];
          return next;
        });
      } else if (matchesShortcut(sc.zoomOut, e) || (e.ctrlKey && e.code === "NumpadSubtract")) {
        e.preventDefault();
        setUiZoom((z) => {
          const idx = ZOOM_STEPS.indexOf(z);
          const next = ZOOM_STEPS[Math.max(0, idx >= 0 ? idx - 1 : 2)];
          return next;
        });
      }
    };
    // capture:true so we intercept before the WebView can handle Ctrl+= etc.
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [isPlaying, audioRef, overlayOpen, currentTrack, setUiZoom, splitView, openFeedback]);

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

  const playbackSettings = useMemo(
    () => ({
      autoplay,
      onAutoplayChange: (v) => {
        setAutoplay(v);
        localStorage.setItem("kiyoshi-autoplay", v);
      },
      crossfade,
      onCrossfadeChange: (v) => {
        setCrossfade(v);
        localStorage.setItem("kiyoshi-crossfade", v);
      },
      crossfadeOverrides,
      onRemoveCrossfadeOverride: removeCrossfadeOverride,
      playbackProgressive,
      onPlaybackProgressiveChange: (v) => {
        setPlaybackProgressive(v);
        localStorage.setItem("kodama-playback-mode", v ? "progressive" : "classic");
      },
    }),
    [autoplay, crossfade, crossfadeOverrides, removeCrossfadeOverride, playbackProgressive]
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

  // Animated view wrapper
  const AnimatedView = useCallback(
    ({ children }) => (
      <div
        key={view}
        style={{
          animation: animations ? "fadeSlideIn 0.28s cubic-bezier(0.22,1,0.36,1) both" : "none",
        }}
      >
        {children}
      </div>
    ),
    [view, animations]
  );

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <LangContext.Provider value={language}>
        <TrackNumberContext.Provider value={showTrackNumbers}>
          <AnimationContext.Provider value={animations}>
            <FontScaleContext.Provider value={appFontScale}>
              <ZoomContext.Provider value={uiZoom}>
                <PlayerProvider controller={player}>
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
                <ToastProvider placement="bottom end" className="bottom-[120px]! z-[100000]!" />

                {flashbang && (
                  <div
                    onAnimationEnd={() => setFlashbang(false)}
                    style={{
                      position: "fixed",
                      inset: 0,
                      zIndex: 999999,
                      pointerEvents: "none",
                      background: "white",
                      animation: "flashbangFade 3s ease-out forwards",
                    }}
                  />
                )}
                <div
                  data-ambient={ambientBackground && currentTrack?.thumbnail ? "true" : undefined}
                  style={{
                    display: "flex",
                    height: `${100 / uiZoom}vh`,
                    background: "var(--bg-base)",
                    position: "relative",
                    isolation: "isolate",
                    cursor: fullscreen && !cursorVisible ? "none" : "default",
                    zoom: uiZoom,
                  }}
                >
                  {/* Experimental: the playing track's cover as a heavily-blurred, theme-tinted ambient
            backdrop for the WHOLE app (z-index:-1 → paints over bg-base but under all content,
            so it shows through the transparent sidebar/canvas while cards keep their own bg). */}
                  <AmbientBackdrop thumbnail={ambientBackground ? currentTrack?.thumbnail : null} />
                  {!fullscreen && !IS_MAC && <TitleBar />}
                  <div
                    style={{
                      width: fullscreen ? 0 : sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth,
                      minWidth: fullscreen
                        ? 0
                        : sidebarCollapsed
                          ? SIDEBAR_COLLAPSED
                          : sidebarWidth,
                      flexShrink: 0,
                      overflow: "hidden",
                      transition: sidebarResizing
                        ? "none"
                        : "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)",
                      padding: fullscreen ? 0 : "8px 4px 8px 8px",
                      position: "relative",
                    }}
                  >
                    <Sidebar
                      view={view}
                      setView={navigateTo}
                      onSearch={handleSearch}
                      collapsed={sidebarCollapsed}
                      onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
                      onOpenSettings={() => setSettingsOpen(true)}
                      onOpenAccountTab={() => {
                        setSettingsTab("account");
                        setSettingsOpen(true);
                      }}
                      onOpenUpdateTab={() => {
                        setSettingsTab("update");
                        setSettingsOpen(true);
                      }}
                      onCloseOverlay={() => setOverlayOpen(false)}
                      onOpenPlaylist={(pl) => openPlaylist(pl, view)}
                      onOpenAlbum={(item) => openAlbum(item, view)}
                      onOpenArtist={(item) => openArtist(item, view)}
                      onAddRecent={addRecentPlaylist}
                      onContextMenu={openContextMenu}
                      currentProfileData={profiles.find((p) => p.active)}
                      onOpenProfileSwitcher={() => setShowProfileSwitcher(true)}
                      profiles={profiles}
                      onSwitchProfile={handleAccountSwitch}
                      onAddProfile={handleAccountAdd}
                      onReauthProfile={handleAccountReauth}
                      onDeleteProfile={handleAccountRemove}
                      onLogout={handleAccountLogout}
                      onCreatePlaylist={() => setCreatePlaylistOpen(true)}
                      updateInfo={updateInfo}
                      offlineMode={offlineMode}
                      isActuallyOffline={isActuallyOffline}
                      onToggleOffline={handleToggleOffline}
                      onRefreshView={() => setViewRefreshKey((k) => k + 1)}
                      obsEnabled={obsEnabled}
                      onOpenOverlaySettings={() => {
                        setSettingsTab("overlay");
                        setSettingsOpen(true);
                      }}
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
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          bottom: 0,
                          width: 8,
                          cursor: "ew-resize",
                          zIndex: 50,
                        }}
                        onMouseEnter={(e) => {
                          const bar = e.currentTarget.firstChild;
                          if (bar) bar.style.opacity = "1";
                        }}
                        onMouseLeave={(e) => {
                          const bar = e.currentTarget.firstChild;
                          if (bar) bar.style.opacity = sidebarResizing ? "1" : "0";
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            right: 1,
                            transform: "translateY(-50%)",
                            width: 3,
                            height: 44,
                            borderRadius: 2,
                            background: "var(--accent)",
                            opacity: sidebarResizing ? 1 : 0,
                            transition: "opacity 0.15s",
                            pointerEvents: "none",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div
                    {...(IS_MAC ? { "data-tauri-drag-region": true } : {})}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    {/* macOS: the gap above the content card (this column's exposed top margin) is a
              drag region, so the window can be moved from the top of the main area too — the
              card and everything inside it stay clickable (they're children, not the region). */}
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "hidden",
                        borderRadius: "var(--r-xl)",
                        margin: queueOpen
                          ? `${IS_MAC ? 16 : 8}px ${queueWidth + 16}px 4px 4px`
                          : `${IS_MAC ? 16 : 8}px 8px 4px 4px`,
                        transition: queueResizing
                          ? "none"
                          : animations
                            ? "margin 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease"
                            : "none",
                        opacity: overlayOpen || settingsOpen || settingsClosing ? 0 : 1,
                        pointerEvents:
                          overlayOpen || settingsOpen || settingsClosing ? "none" : "auto",
                      }}
                    >
                      <div
                        key={appKey}
                        className="scrollable"
                        style={{ height: "100%", overflowY: "auto" }}
                      >
                        {view === "home" && (
                          <AnimatedView key={`home-${viewRefreshKey}`}>
                            <HomeView
                              displayName={profiles.find((p) => p.active)?.displayName}
                              onOpenPlaylist={(item) => openPlaylist(item, "home")}
                              onOpenAlbum={(item) => openAlbum(item, "home")}
                              onOpenArtist={(item) => openArtist(item, "home")}
                              onContextMenu={openContextMenu}
                              onTrackContextMenu={(e, track) =>
                                setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
                              }
                              hideExplicit={hideExplicit}
                            />
                          </AnimatedView>
                        )}
                        {view === "search" && (
                          <AnimatedView key={`search-${viewRefreshKey}`}>
                            <SearchView
                              query={searchQuery}
                              currentTrack={currentTrack}
                              isPlaying={isPlaying}
                              onOpenArtist={openArtist}
                              onOpenAlbum={(item) => openAlbum(item, "search")}
                              onOpenPlaylist={(item) => openPlaylist(item, "search")}
                              onContextMenu={openContextMenu}
                              onTrackContextMenu={(e, track) =>
                                setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
                              }
                              hideExplicit={hideExplicit}
                            />
                          </AnimatedView>
                        )}
                        {view === "liked" && (
                          <AnimatedView key={`liked-${viewRefreshKey}`}>
                            <LikedView
                              currentTrack={currentTrack}
                              isPlaying={isPlaying}
                              onOpenArtist={openArtist}
                              onOpenAlbum={(item) => openAlbum(item, "liked")}
                              onTrackContextMenu={(e, track) =>
                                setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
                              }
                              cachedSongIds={cachedSongIds}
                              downloadingIds={downloadingIds}
                              onDownloadSong={handleDownloadSong}
                              hideExplicit={hideExplicit}
                              onToggleLike={handleToggleLike}
                              likedIds={likedIds}
                              selectedTracks={selectedTracks}
                              onToggleSelect={toggleTrackSelection}
                              onSelectAll={selectAllTracks}
                              onBack={goBack}
                            />
                          </AnimatedView>
                        )}
                        {view === "history" && (
                          <AnimatedView key={`history-${viewRefreshKey}`}>
                            <HistoryView
                              currentTrack={currentTrack}
                              isPlaying={isPlaying}
                              onOpenArtist={openArtist}
                              onOpenAlbum={(item) => openAlbum(item, "history")}
                              onTrackContextMenu={(e, track, extra) =>
                                setTrackContextMenu({ x: e.clientX, y: e.clientY, track, ...extra })
                              }
                              cachedSongIds={cachedSongIds}
                              downloadingIds={downloadingIds}
                              onDownloadSong={handleDownloadSong}
                              hideExplicit={hideExplicit}
                              onBack={goBack}
                            />
                          </AnimatedView>
                        )}
                        {view === "library" && (
                          <AnimatedView key={`library-${viewRefreshKey}`}>
                            <LibraryView
                              currentTrack={currentTrack}
                              isPlaying={isPlaying}
                              onOpenPlaylist={openPlaylist}
                              onOpenAlbum={openAlbum}
                              onOpenArtist={openArtist}
                              onContextMenu={openContextMenu}
                            />
                          </AnimatedView>
                        )}
                        {view === "collection" && collection && (
                          <AnimatedView key={`collection-${viewRefreshKey}`}>
                            <CollectionView
                              title={collection.title}
                              thumbnail={collection.thumbnail}
                              tracks={collection.tracks}
                              total={collection.total}
                              loading={collection.loading}
                              progress={collection.progress || 0}
                              cached={collection.cached}
                              currentTrack={currentTrack}
                              isPlaying={isPlaying}
                              onBack={goBack}
                              onOpenArtist={openArtist}
                              onOpenAlbum={(item) => openAlbum(item, "collection")}
                              isAlbum={collection.isAlbum}
                              albumArtists={collection.albumArtists}
                              albumArtistBrowseId={collection.albumArtistBrowseId}
                              year={collection.year}
                              onRefresh={() => {
                                if (collection.isAlbum)
                                  openAlbum(
                                    {
                                      browseId: collection.browseId,
                                      title: collection.title,
                                      thumbnail: collection.thumbnail,
                                    },
                                    collection.fromView,
                                    true
                                  );
                                else
                                  openPlaylist(
                                    {
                                      playlistId: collection.playlistId,
                                      title: collection.title,
                                      thumbnail: collection.thumbnail,
                                      forcedTitle: collection.forcedTitle,
                                    },
                                    collection.fromView,
                                    true
                                  );
                              }}
                              onTrackContextMenu={(e, track) =>
                                setTrackContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  track,
                                  playlistId: collection.isAlbum ? null : collection.playlistId,
                                })
                              }
                              cachedSongIds={cachedSongIds}
                              downloadingIds={downloadingIds}
                              premiumSongIds={premiumSongIds}
                              onDownloadSong={handleDownloadSong}
                              onDownloadAll={(tracks) =>
                                handleDownloadAll(tracks, {
                                  title: collection.title,
                                  thumbnail: collection.thumbnail,
                                  artists: collection.albumArtists || "",
                                })
                              }
                              onRemoveAll={handleRemoveAllDownloads}
                              hideExplicit={hideExplicit}
                              onToggleLike={handleToggleLike}
                              likedIds={likedIds}
                              selectedTracks={selectedTracks}
                              onToggleSelect={toggleTrackSelection}
                              onSelectAll={selectAllTracks}
                            />
                          </AnimatedView>
                        )}
                        {view === "artist" && artistView && (
                          <AnimatedView key={`artist-${viewRefreshKey}`}>
                            <ArtistView
                              browseId={artistView.browseId}
                              currentTrack={currentTrack}
                              isPlaying={isPlaying}
                              onOpenAlbum={(item) => openAlbum(item, "artist")}
                              onOpenPlaylist={(item) => openPlaylist(item, "artist")}
                              onOpenArtist={(item) => openArtist(item, "artist")}
                              onBack={goBack}
                              onContextMenu={openContextMenu}
                              onTogglePin={togglePin}
                              isPinned={pinnedIds.includes(artistView.browseId)}
                              hideExplicit={hideExplicit}
                            />
                          </AnimatedView>
                        )}
                        {view === "downloads" && (
                          <AnimatedView key={`downloads-${viewRefreshKey}`}>
                            <DownloadsView
                              currentTrack={currentTrack}
                              isPlaying={isPlaying}
                              cachedSongIds={cachedSongIds}
                              downloadingIds={downloadingIds}
                              premiumSongIds={premiumSongIds}
                              onDownloadSong={handleDownloadSong}
                              onTrackContextMenu={(e, track) =>
                                setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
                              }
                              hideExplicit={hideExplicit}
                              onOpenAlbum={(item) => openAlbum(item, "downloads")}
                              onOpenArtist={openArtist}
                              onToggleLike={handleToggleLike}
                              likedIds={likedIds}
                            />
                          </AnimatedView>
                        )}
                        {isOffline && view !== "downloads" && (
                          <div
                            style={{
                              position: "sticky",
                              bottom: 0,
                              left: 0,
                              right: 0,
                              background: "rgba(240,180,41,0.12)",
                              borderTop: "1px solid rgba(240,180,41,0.3)",
                              color: "#f0b429",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 16px",
                              fontSize: 13,
                              zIndex: 10,
                            }}
                          >
                            <WifiX size={15} weight="bold" />
                            {translate(language, "offlineBanner")}
                          </div>
                        )}
                        {/* Spacer so content scrolls clear of the floating player bar */}
                        <div
                          style={{ height: 97, flexShrink: 0, pointerEvents: "none" }}
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                    {/* end clip container */}
                    {/* Player + floating action bar wrapper — position:relative so the bar can float above the player without affecting layout */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      {/* Multi-track selection action bar — position:absolute so it floats above the player without pushing the list up */}
                      {selectedTracks.size > 0 && (
                        <SelectionActionBar
                          selectedTracks={selectedTracks}
                          language={language}
                          view={view}
                          collection={collection}
                          setCollection={setCollection}
                          onToggleLike={handleToggleLike}
                          onClearSelection={clearSelection}
                          onAddToPlaylist={(tracks) =>
                            setAddToPlaylistFor({ tracks, fromSelection: true })
                          }
                        />
                      )}
                      <div
                        style={{
                          // Fullscreen: slide the bar down off-screen when hidden. Settings: plain fade.
                          opacity: settingsOpen ? 0 : 1,
                          transform:
                            fullscreen && !playerVisible ? "translateY(120%)" : "translateY(0)",
                          visibility:
                            settingsOpen || (fullscreen && !playerVisible) ? "hidden" : "visible",
                          transition:
                            "opacity 0.35s ease, transform 0.42s cubic-bezier(0.4,0,0.2,1), visibility 0.42s ease",
                          pointerEvents: settingsOpen
                            ? "none"
                            : !fullscreen || playerVisible
                              ? "auto"
                              : "none",
                          position: "relative",
                          zIndex: fullscreen ? 105 : "auto",
                          padding: fullscreen ? 0 : "0 8px 8px 4px",
                        }}
                      >
                        <Player
                          expanded={overlayOpen}
                          onExpandToggle={() => setOverlayOpen((e) => !e)}
                          showLyrics={showLyrics}
                          onToggleLyrics={() => {
                            if (!overlayOpen) {
                              setOverlayOpen(true);
                              setSplitView(false);
                              setShowLyricsManual(true);
                            } else if (fullscreen) {
                              // Cycle: lyrics → cover → split → lyrics
                              autoCoverRef.current = false;
                              if (splitView) {
                                setSplitView(false);
                                setShowLyrics(true);
                              } else if (showLyrics) {
                                setShowLyrics(false);
                              } else {
                                setSplitView(true);
                              }
                            } else {
                              setShowLyricsManual((l) => !l);
                            }
                          }}
                          queueOpen={queueOpen}
                          onToggleQueue={() => setQueueOpen((q) => !q)}
                          remoteEnabled={remoteEnabled}
                          fullscreen={fullscreen}
                          onToggleFullscreen={async () => {
                            const { invoke } = await import("@tauri-apps/api/core");
                            const next = !fullscreen;
                            try {
                              await invoke("set_fullscreen", { fullscreen: next });
                            } catch (e) {
                              console.error(e);
                            }
                            setFullscreen(next);
                            if (next) setOverlayOpen(true);
                            else if (splitView) {
                              setSplitView(false);
                              setShowLyrics(true);
                            }
                          }}
                          onOpenAlbum={openAlbum}
                          onOpenArtist={openArtist}
                          onExportSong={handleExportSong}
                          onDownloadSong={handleDownloadSong}
                          cachedSongIds={cachedSongIds}
                          downloadingIds={downloadingIds}
                          onRefetchLyrics={() => {
                            setForcedLyricsProvider(null);
                            setLyricsRefetchKey((k) => k + 1);
                          }}
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
                          onPremiumDetected={markPremium}
                          onCreatePlaylist={() => setCreatePlaylistOpen(true)}
                          onAddToPlaylist={(tracks) => setAddToPlaylistFor({ tracks })}
                          buildShareLink={buildShareLink}
                        />
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: overlayOpen ? (fullscreen ? 0 : 8) : "100%",
                      left: fullscreen
                        ? 0
                        : (sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4,
                      right: fullscreen ? 0 : queueOpen ? queueWidth + 16 : 8,
                      bottom: fullscreen ? 0 : 112,
                      zIndex: fullscreen ? 102 : 100,
                      overflow: "hidden",
                      borderRadius: fullscreen ? 0 : "var(--r-xl)",
                      transition: queueResizing
                        ? "top 0.42s cubic-bezier(0.4,0,0.2,1), left 0.3s ease"
                        : animations
                          ? "top 0.42s cubic-bezier(0.4,0,0.2,1), right 0.3s ease, left 0.3s ease"
                          : "top 0.1s ease",
                      pointerEvents: overlayOpen ? "all" : "none",
                    }}
                  >
                    {/* Shared static background — stays fixed during crossfade */}
                    {currentTrack && !ambientBackground && (
                      <>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: "#0d0d0d",
                            pointerEvents: "none",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            backgroundImage: currentTrack.thumbnail
                              ? `url(${hiResThumb(currentTrack.thumbnail)})`
                              : "none",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            filter: "blur(24px) brightness(0.5)",
                            transform: "scale(1.08)",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: "rgba(0,0,0,0.55)",
                            pointerEvents: "none",
                          }}
                        />
                      </>
                    )}
                    {currentTrack &&
                      (() => {
                        // Split (fullscreen only): cover/visualizer left, lyrics right. Both stay mounted —
                        // only width/opacity animate, so there's no remount/refetch when switching modes.
                        const splitActive = fullscreen && splitView;
                        const coverPct = `${(splitRatio * 100).toFixed(2)}%`;
                        const lyricsPct = `${((1 - splitRatio) * 100).toFixed(2)}%`;
                        // No width animation while dragging (snappy), otherwise the smooth mode transition.
                        const widthTransition = splitResizing
                          ? "none"
                          : "width 0.4s cubic-bezier(0.4,0,0.2,1)";
                        const paneTransition = `opacity 0.35s ease, ${widthTransition}`;
                        return (
                          <>
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                right: 0,
                                width: splitActive ? lyricsPct : "100%",
                                opacity: splitActive ? 1 : showLyrics ? 1 : 0,
                                transition: paneTransition,
                                pointerEvents: splitActive || showLyrics ? "all" : "none",
                              }}
                            >
                              <LyricsOverlay
                                track={currentTrack}
                                audioRef={audioRef}
                                onClose={() => setOverlayOpen(false)}
                                fontSize={lyricsFontSize}
                                providers={lyricsProviders}
                                refetchKey={lyricsRefetchKey}
                                onAddToast={addToast}
                                language={language}
                                forcedProvider={forcedLyricsProvider}
                                onSourceChange={setCurrentLyricsSource}
                                onProviderFailed={(id) =>
                                  setFailedLyricsProviders((s) => new Set([...s, id]))
                                }
                                showTranslation={showLyricsTranslation}
                                translationLang={lyricsTranslationLang}
                                translationFontSize={lyricsTranslationFontSize}
                                showRomaji={showRomaji}
                                romajiFontSize={lyricsRomajiFontSize}
                                onCustomLyricsStatusChange={setIsCustomLyrics}
                                importLyricsRef={importLyricsRef}
                                removeCustomLyricsRef={removeCustomLyricsRef}
                                showAgentTags={showAgentTags}
                                ambientVisualizer={ambientVisualizer}
                                syllableZoom={syllableZoom}
                                fluidLyrics={fluidLyrics}
                                ambientBackground={ambientBackground}
                                fullscreen={fullscreen}
                                playerBarVisible={playerVisible}
                                onInstrumentalChange={handleInstrumentalChange}
                              />
                            </div>
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: 0,
                                width: splitActive ? coverPct : "100%",
                                opacity: splitActive ? 1 : showLyrics ? 0 : 1,
                                transition: paneTransition,
                                pointerEvents: splitActive || !showLyrics ? "all" : "none",
                                borderRight: splitActive
                                  ? "1px solid rgba(255,255,255,0.08)"
                                  : "none",
                              }}
                            >
                              <CoverView
                                track={currentTrack}
                                isPlaying={isPlaying}
                                onClose={() => setOverlayOpen(false)}
                                ambientVisualizer={ambientVisualizer}
                                vizConfig={vizConfig}
                                narrow={splitActive}
                              />
                            </div>
                            {/* Drag handle between the two panes (mirrors the sidebar/queue handles) */}
                            {splitActive && (
                              <div
                                onMouseDown={startSplitResize}
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  bottom: 0,
                                  left: coverPct,
                                  width: 12,
                                  marginLeft: -6,
                                  cursor: "ew-resize",
                                  zIndex: 6,
                                }}
                                onMouseEnter={(e) => {
                                  const bar = e.currentTarget.firstChild;
                                  if (bar) bar.style.opacity = "1";
                                }}
                                onMouseLeave={(e) => {
                                  const bar = e.currentTarget.firstChild;
                                  if (bar) bar.style.opacity = splitResizing ? "1" : "0";
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    left: 5,
                                    top: 0,
                                    bottom: 0,
                                    width: 2,
                                    background: "rgba(255,255,255,0.55)",
                                    opacity: splitResizing ? 1 : 0,
                                    transition: "opacity 0.15s",
                                    pointerEvents: "none",
                                  }}
                                />
                              </div>
                            )}
                          </>
                        );
                      })()}
                  </div>

                  {/* Queue panel */}
                  <div
                    style={{
                      position: "absolute",
                      top: fullscreen ? 0 : 8,
                      right: fullscreen ? 0 : 8,
                      width: fullscreen ? 360 : queueWidth,
                      bottom: fullscreen ? 0 : 112,
                      zIndex: fullscreen ? 104 : 101,
                      // Slide via transform (compositor-only) instead of `right` (per-frame layout).
                      // Once settled, drop the transform/will-change entirely — an ancestor transform
                      // otherwise neutralises backdrop-filter on descendants (e.g. the scroll-to-top pill).
                      transform: queueOpen
                        ? queueSettled
                          ? "none"
                          : "translateX(0)"
                        : "translateX(calc(100% + 16px))",
                      willChange: queueOpen && queueSettled ? "auto" : "transform",
                      // Keep the panel near-opaque while moving; only switch to the costly ambient
                      // backdrop-blur once it has settled, so the slide never repaints the blur.
                      background: ambientBackground
                        ? queueSettled
                          ? "rgba(18,18,18,0.5)"
                          : "rgba(18,18,18,0.92)"
                        : "var(--bg-surface)",
                      backdropFilter:
                        ambientBackground && queueSettled ? "blur(32px) saturate(1.4)" : "none",
                      WebkitBackdropFilter:
                        ambientBackground && queueSettled ? "blur(32px) saturate(1.4)" : "none",
                      border: ambientBackground ? "0.5px solid rgba(255,255,255,0.08)" : "none",
                      borderRadius: fullscreen ? 0 : "var(--r-xl)",
                      overflow: "hidden",
                      transition: queueResizing
                        ? "none"
                        : animations
                          ? "transform 0.3s cubic-bezier(0.4,0,0.2,1), background 0.25s ease"
                          : "transform 0.1s ease",
                      display: "flex",
                      flexDirection: "column",
                      pointerEvents: queueOpen ? "all" : "none",
                    }}
                  >
                    {/* Drag handle to resize the panel (mirrors the sidebar handle) */}
                    {!fullscreen && queueOpen && (
                      <div
                        onMouseDown={startQueueResize}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          bottom: 0,
                          width: 8,
                          cursor: "ew-resize",
                          zIndex: 50,
                        }}
                        onMouseEnter={(e) => {
                          const bar = e.currentTarget.firstChild;
                          if (bar) bar.style.opacity = "1";
                        }}
                        onMouseLeave={(e) => {
                          const bar = e.currentTarget.firstChild;
                          if (bar) bar.style.opacity = queueResizing ? "1" : "0";
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: 1,
                            transform: "translateY(-50%)",
                            width: 3,
                            height: 44,
                            borderRadius: 2,
                            background: "var(--accent)",
                            opacity: queueResizing ? 1 : 0,
                            transition: "opacity 0.15s",
                            pointerEvents: "none",
                          }}
                        />
                      </div>
                    )}
                    <QueuePanel
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
                      onSuccess={() => {
                        fetchProfiles();
                        setShowLogin(false);
                        setAddingProfile(false);
                        setReauthName(null);
                      }}
                      onCancel={
                        addingProfile
                          ? () => {
                              setShowLogin(false);
                              setAddingProfile(false);
                              setReauthName(null);
                            }
                          : undefined
                      }
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
                    <div
                      style={{
                        position: "absolute",
                        top: fullscreen ? 0 : 8,
                        left: fullscreen
                          ? 0
                          : (sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4,
                        right: fullscreen ? 0 : 8,
                        bottom: fullscreen ? 0 : 8,
                        zIndex: 150,
                        borderRadius: fullscreen ? 0 : "var(--r-xl)",
                        overflow: "hidden",
                        animation: animations
                          ? settingsClosing
                            ? "fadeSlideOut 0.22s cubic-bezier(0.4,0,0.2,1) forwards"
                            : "fadeSlideIn 0.28s cubic-bezier(0.4,0,0.2,1)"
                          : undefined,
                      }}
                    >
                      <SettingsProviders
                        appearance={appearanceSettings}
                        playback={playbackSettings}
                        lyrics={lyricsSettings}
                        integrations={integrationSettings}
                        shortcuts={shortcutSettings}
                      >
                        <SettingsPanel
                          onClose={closeSettings}
                          onOpenOverlayEditor={openOverlayEditor}
                          onResetShortcuts={setCustomShortcuts}
                          onSectionChange={setSettingsSectionStore}
                          accounts={profiles}
                          activeAccount={profiles.find((p) => p.active)}
                          onAccountSwitch={handleAccountSwitch}
                          onAccountAdd={handleAccountAdd}
                          onAccountReauth={handleAccountReauth}
                          onAccountRemove={handleAccountRemove}
                          onAccountRename={handleAccountRename}
                          onAccountLogout={handleAccountLogout}
                          onAccountAvatarChange={handleAccountAvatarChange}
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
                          anonStats={anonStats}
                          onAnonStatsChange={handleAnonStatsChange}
                          hideUserHandle={hideUserHandle}
                          onToggleHideUserHandle={(v) => {
                            setHideUserHandle(v);
                            localStorage.setItem("kiyoshi-hide-handle", String(v));
                          }}
                        />
                      </SettingsProviders>
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
                      version={APP_VERSION}
                      currentTrack={
                        currentTrack
                          ? { videoId: currentTrack.videoId, title: currentTrack.title }
                          : null
                      }
                    />
                  )}

                  {createPlaylistOpen && (
                    <CreatePlaylistModal
                      t={(key) => translate(language, key)}
                      onClose={() => {
                        setCreatePlaylistOpen(false);
                        setCreatePlaylistForSelection(false);
                        setCreatePlaylistTracks(null);
                      }}
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
                              body: JSON.stringify({
                                videoIds: pending.map((t) => t.videoId),
                                tracks: pending,
                              }),
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
                      onNewPlaylist={() => {
                        setCreatePlaylistTracks(addToPlaylistFor.tracks || null);
                        if (addToPlaylistFor.fromSelection) setCreatePlaylistForSelection(true);
                        setCreatePlaylistOpen(true);
                      }}
                      onAdded={addToPlaylistFor.fromSelection ? clearSelection : undefined}
                    />
                  )}

                  {/* Download Queue — HeroUI toast-styled card with Spinner + ProgressBar */}
                  {downloadBatches.length > 0 && (
                    <DownloadQueueCard
                      batches={downloadBatches}
                      minimized={downloadQueueMin}
                      onToggleMinimize={() => setDownloadQueueMin((m) => !m)}
                      onCancelBatch={handleCancelBatch}
                      language={language}
                    />
                  )}

                  {/* Track context menu */}
                  {trackContextMenu &&
                    (() => {
                      const track = trackContextMenu.track;
                      const ctxLiked = likedIds.has(track.videoId);
                      const showRemovePl = trackContextMenu.playlistId && track.setVideoId;
                      const showRemoveHist = !!trackContextMenu.removeFromHistory;
                      const artistList = Array.isArray(track.artists)
                        ? track.artists.filter((a) => a?.browseId || a?.id)
                        : [];
                      const showAlbumNav = !!track.albumBrowseId;
                      const showArtistNav = artistList.length > 0 || !!track.artistBrowseId;
                      const isCached = cachedSongIds.has(track.videoId);

                      const copyShare = (url) => {
                        navigator.clipboard
                          .writeText(url)
                          .then(() => toast.success(translate(language, "linkCopied")))
                          .catch(() => {});
                      };
                      const copyLyrics = () => {
                        fetch(`${API}/lyrics/${track.videoId}`)
                          .then((r) => r.json())
                          .then((d) => {
                            if (!d.lyrics) return;
                            const text = d.lyrics
                              .map((l) => {
                                const main = l.wordSync
                                  ? (l.words || []).map((w) => w.text).join("")
                                  : l.text || "";
                                const bg =
                                  (l.bgWords || []).map((w) => w.text).join("") || l.bgText || "";
                                return bg ? `${main} ${bg}` : main;
                              })
                              .join("\n");
                            navigator.clipboard.writeText(text).catch(() => {});
                          })
                          .catch(() => {});
                      };
                      const saveLrc = async () => {
                        try {
                          const d = await fetch(`${API}/lyrics/${track.videoId}`).then((r) =>
                            r.json()
                          );
                          if (!d.lyrics) return;
                          const lyrics = d.lyrics;
                          const isSync = lyrics.some((l) => l.time >= 0);
                          const lrcLineText = (l) => {
                            const main = l.wordSync
                              ? (l.words || []).map((w) => w.text).join("")
                              : l.text || "";
                            const bg =
                              (l.bgWords || []).map((w) => w.text).join("") || l.bgText || "";
                            return bg ? `${main} ${bg}` : main;
                          };
                          const lrcText = isSync
                            ? lyrics
                                .map((l) => {
                                  const lineText = lrcLineText(l);
                                  if (l.time < 0) return lineText;
                                  const mm = String(Math.floor(l.time / 60)).padStart(2, "0");
                                  const ss = String(Math.floor(l.time % 60)).padStart(2, "0");
                                  const cs = String(Math.floor((l.time % 1) * 100)).padStart(
                                    2,
                                    "0"
                                  );
                                  return `[${mm}:${ss}.${cs}] ${lineText}`;
                                })
                                .join("\n")
                            : lyrics.map(lrcLineText).join("\n");
                          const { save } = await import("@tauri-apps/plugin-dialog");
                          const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                          const safeTitle = (track?.title || "lyrics").replace(
                            /[<>:"/\\|?*]/g,
                            "_"
                          );
                          const filePath = await save({
                            title: translate(language, "saveLrc"),
                            defaultPath: `${safeTitle}.lrc`,
                            filters: [
                              { name: "LRC", extensions: ["lrc"] },
                              { name: "Text", extensions: ["txt"] },
                            ],
                          });
                          if (!filePath) return;
                          await writeTextFile(filePath, lrcText);
                        } catch (e) {
                          console.error(e);
                        }
                      };
                      const removeFromPlaylist = async () => {
                        // Optimistic: burst the row + drop it (and decrement total so the virtualized list
                        // doesn't render a phantom SkeletonRow for the now-missing slot), then tell the server.
                        if (animations) {
                          try {
                            particleBurst(
                              document.querySelector(
                                `[data-track-id="${CSS.escape(track.videoId)}"]`
                              )
                            );
                          } catch {}
                        }
                        setCollection((c) =>
                          c
                            ? {
                                ...c,
                                tracks: c.tracks.filter(
                                  (t) =>
                                    t.videoId !== track.videoId || t.setVideoId !== track.setVideoId
                                ),
                                total: Math.max(0, (c.total ?? c.tracks.length) - 1),
                              }
                            : c
                        );
                        try {
                          await fetch(`${API}/playlist/${trackContextMenu.playlistId}/remove`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              videos: [{ videoId: track.videoId, setVideoId: track.setVideoId }],
                            }),
                          });
                        } catch {}
                      };
                      const removeDownload = () => removeCachedSong(track.videoId);

                      return (
                        <ContextMenu
                          x={trackContextMenu.x}
                          y={trackContextMenu.y}
                          zoom={uiZoom}
                          onClose={() => setTrackContextMenu(null)}
                          ariaLabel={track.title || "Track"}
                          minWidth={210}
                        >
                          <DropdownSection>
                            {/* Add to playlist — opens a dedicated modal with search + rich rows */}
                            <CtxItem
                              icon={<Plus size={15} />}
                              label={translate(language, "addToPlaylist")}
                              onSelect={() => setAddToPlaylistFor({ tracks: [track] })}
                            />

                            <CtxItem
                              icon={<Queue size={15} />}
                              label={translate(language, "playNext")}
                              onSelect={() => {
                                enqueue(track, "next");
                                addToast(
                                  translate(language, "addedNext") || "Als Nächstes eingereiht",
                                  "success"
                                );
                              }}
                            />
                            <CtxItem
                              icon={<Queue size={15} />}
                              label={translate(language, "addToQueue")}
                              onSelect={() => {
                                enqueue(track, "end");
                                addToast(
                                  translate(language, "addedQueue") ||
                                    "Zur Warteschlange hinzugefügt",
                                  "success"
                                );
                              }}
                            />
                            <CtxItem
                              icon={<Radio size={15} />}
                              label={translate(language, "startRadio")}
                              onSelect={() => startSongRadio(track)}
                            />

                            <DropdownItem
                              textValue={
                                ctxLiked
                                  ? translate(language, "unlike")
                                  : translate(language, "like")
                              }
                              onAction={() => handleToggleLike(track)}
                              className={
                                ctxLiked
                                  ? "text-accent! data-[focused]:text-accent! data-[hovered]:text-accent!"
                                  : undefined
                              }
                            >
                              <span className="w-4 flex justify-center shrink-0">
                                <Heart size={15} weight={ctxLiked ? "fill" : "regular"} />
                              </span>
                              {ctxLiked
                                ? translate(language, "unlike")
                                : translate(language, "like")}
                            </DropdownItem>

                            {showRemovePl ? (
                              <CtxItem
                                icon={<X size={15} />}
                                danger
                                label={translate(language, "removeFromPlaylist")}
                                onSelect={removeFromPlaylist}
                              />
                            ) : null}
                            {showRemoveHist ? (
                              <CtxItem
                                icon={<X size={15} />}
                                danger
                                label={translate(language, "removeFromHistory")}
                                onSelect={() => trackContextMenu.removeFromHistory()}
                              />
                            ) : null}
                          </DropdownSection>

                          {showAlbumNav || showArtistNav ? (
                            <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                              {showAlbumNav ? (
                                <CtxItem
                                  icon={<VinylRecord size={15} />}
                                  label={translate(language, "goToAlbum")}
                                  onSelect={() =>
                                    openAlbum(
                                      { browseId: track.albumBrowseId, title: track.album },
                                      view
                                    )
                                  }
                                />
                              ) : null}
                              {artistList.length > 0 ? (
                                artistList.map((a, i) => {
                                  const browseId = a.browseId || a.id;
                                  const name = a.name || "";
                                  return (
                                    <CtxItem
                                      key={browseId || i}
                                      id={`artist-${browseId || i}`}
                                      icon={<Microphone size={15} />}
                                      label={`${translate(language, "goToArtist")}${name ? `: ${name}` : ""}`}
                                      textValue={`${translate(language, "goToArtist")} ${name}`}
                                      onSelect={() => openArtist({ browseId, artist: name }, view)}
                                    />
                                  );
                                })
                              ) : track.artistBrowseId ? (
                                <CtxItem
                                  icon={<Microphone size={15} />}
                                  label={translate(language, "goToArtist")}
                                  onSelect={() =>
                                    openArtist({ browseId: track.artistBrowseId }, view)
                                  }
                                />
                              ) : null}
                            </DropdownSection>
                          ) : null}

                          <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                            <DropdownSubmenuTrigger>
                              <DropdownItem textValue={translate(language, "share")}>
                                <span className="w-4 flex justify-center shrink-0">
                                  <ShareNodes size={15} />
                                </span>
                                {translate(language, "share")}
                                <DropdownSubmenuIndicator className="ml-auto" />
                              </DropdownItem>
                              <DropdownPopover className="min-w-56">
                                <DropdownMenu aria-label={translate(language, "share")}>
                                  <DropdownSection>
                                    <CtxItem
                                      icon={<ShareNodes size={15} />}
                                      label={translate(language, "copyShareLink")}
                                      onSelect={() => copyShare(buildShareLink(track))}
                                    />
                                    <CtxItem
                                      icon={<Copy size={15} />}
                                      label={translate(language, "copyKodamaLink")}
                                      onSelect={() => copyShare(`kodama://song/${track.videoId}`)}
                                    />
                                    <CtxItem
                                      icon={<Copy size={15} />}
                                      label={translate(language, "copyYtMusicLink")}
                                      onSelect={() =>
                                        copyShare(
                                          `https://music.youtube.com/watch?v=${track.videoId}`
                                        )
                                      }
                                    />
                                    <CtxItem
                                      icon={<Copy size={15} />}
                                      label={translate(language, "copyYoutubeLink")}
                                      onSelect={() =>
                                        copyShare(`https://youtube.com/watch?v=${track.videoId}`)
                                      }
                                    />
                                  </DropdownSection>
                                </DropdownMenu>
                              </DropdownPopover>
                            </DropdownSubmenuTrigger>
                          </DropdownSection>

                          <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                            {isCached ? (
                              <CtxItem
                                icon={<Trash size={15} />}
                                danger
                                label={translate(language, "removeDownload")}
                                onSelect={removeDownload}
                              />
                            ) : !downloadingIds.has(track.videoId) ? (
                              <CtxItem
                                icon={<DownloadSimple size={15} />}
                                label={translate(language, "download")}
                                onSelect={() => handleDownloadSong(track)}
                              />
                            ) : null}
                            <CtxItem
                              icon={<MusicNote size={15} />}
                              label={translate(language, "saveAsMp3")}
                              onSelect={() => handleExportSong(track, "mp3")}
                            />
                            <CtxItem
                              icon={<MusicNote size={15} />}
                              label={translate(language, "saveAsOpus")}
                              onSelect={() => handleExportSong(track, "opus")}
                            />
                          </DropdownSection>

                          <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                            <CtxItem
                              icon={<Copy size={15} />}
                              label={translate(language, "copyLyrics")}
                              onSelect={copyLyrics}
                            />
                            <CtxItem
                              icon={<DownloadSimple size={15} />}
                              label={translate(language, "saveLrc")}
                              onSelect={saveLrc}
                            />
                          </DropdownSection>
                        </ContextMenu>
                      );
                    })()}

                  {/* Global playlist context menu */}
                  {globalContextMenu &&
                    (() => {
                      const pl = globalContextMenu.playlist;
                      const isPinned = pinnedIds.includes(itemId(pl));
                      const showAlbumNav = pl?.browseId && pl?.type !== "artist";
                      const showArtistNav = !!pl?.artistBrowseId;
                      const isUserPlaylist =
                        pl?.playlistId && pl?.type !== "album" && pl?.owned !== false;
                      // Playlists are shareable (not albums/artists). The raw list id is the
                      // playlistId, or the search browseId with its "VL" prefix stripped.
                      const isPlaylistShare =
                        pl &&
                        pl.type !== "album" &&
                        pl.type !== "artist" &&
                        (pl.playlistId || pl.browseId);
                      const plShareId = (pl?.playlistId || pl?.browseId || "").replace(/^VL/, "");
                      return (
                        <ContextMenu
                          x={globalContextMenu.x}
                          y={globalContextMenu.y}
                          zoom={uiZoom}
                          onClose={() => setGlobalContextMenu(null)}
                          ariaLabel="Playlist"
                          minWidth={190}
                        >
                          <DropdownSection>
                            <CtxItem
                              icon={<PushPin size={15} />}
                              label={
                                isPinned ? translate(language, "unpin") : translate(language, "pin")
                              }
                              onSelect={() => togglePin(pl)}
                            />
                            <CtxItem
                              icon={<DotsThreeVertical size={16} />}
                              label={translate(language, "open")}
                              onSelect={() => {
                                if (pl?.type === "album") openAlbum(pl, view);
                                else if (pl?.type === "artist") openArtist(pl, view);
                                else openPlaylist(pl, view);
                              }}
                            />
                          </DropdownSection>
                          {isPlaylistShare && plShareId ? (
                            <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                              <CtxItem
                                icon={<ShareNodes size={15} />}
                                label={translate(language, "copyYtMusicLink")}
                                onSelect={() =>
                                  navigator.clipboard
                                    .writeText(
                                      `https://music.youtube.com/playlist?list=${plShareId}`
                                    )
                                    .then(() => toast.success(translate(language, "linkCopied")))
                                    .catch(() => {})
                                }
                              />
                              <CtxItem
                                icon={<Copy size={15} />}
                                label={translate(language, "copyYoutubeLink")}
                                onSelect={() =>
                                  navigator.clipboard
                                    .writeText(`https://youtube.com/playlist?list=${plShareId}`)
                                    .then(() => toast.success(translate(language, "linkCopied")))
                                    .catch(() => {})
                                }
                              />
                            </DropdownSection>
                          ) : null}
                          {showAlbumNav || showArtistNav ? (
                            <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                              {showAlbumNav ? (
                                <CtxItem
                                  icon={<VinylRecord size={15} />}
                                  label={translate(language, "goToAlbum")}
                                  onSelect={() => openAlbum(pl, view)}
                                />
                              ) : null}
                              {showArtistNav ? (
                                <CtxItem
                                  icon={<Microphone size={15} />}
                                  label={translate(language, "goToArtist")}
                                  onSelect={() => openArtist({ browseId: pl.artistBrowseId }, view)}
                                />
                              ) : null}
                            </DropdownSection>
                          ) : null}
                          {isUserPlaylist || !isPinned ? (
                            <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                              {isUserPlaylist ? (
                                <CtxItem
                                  icon={<PencilSimple size={15} />}
                                  label={translate(language, "renamePlaylist")}
                                  onSelect={() =>
                                    setRenameDialog({ playlistId: pl.playlistId, title: pl.title })
                                  }
                                />
                              ) : null}
                              {isUserPlaylist ? (
                                <CtxItem
                                  icon={<Trash size={15} />}
                                  danger
                                  label={translate(language, "deletePlaylist")}
                                  onSelect={() =>
                                    setDeleteDialog({ playlistId: pl.playlistId, title: pl.title })
                                  }
                                />
                              ) : null}
                              {!isPinned ? (
                                <CtxItem
                                  icon={<X size={16} />}
                                  danger
                                  label={translate(language, "removeFromRecent")}
                                  onSelect={() => removeRecentPlaylist(itemId(pl))}
                                />
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
                        const fromCollection =
                          view === "collection" && collection?.playlistId === pid;
                        setDeleteDialog(null);
                        removeRecentPlaylist(pid);
                        if (!fromCollection) {
                          // Library grid: dissolve the card (burst + fade), then remove just that one card
                          // locally — no full library refetch, so the grid never flashes empty.
                          const remove = () =>
                            window.dispatchEvent(
                              new CustomEvent("kiyoshi-playlist-removed", { detail: pid })
                            );
                          requestAnimationFrame(() => {
                            const el = document.querySelector(
                              `[data-card-id="${CSS.escape(pid)}"]`
                            );
                            if (animations && el) dissolve(el, remove);
                            else remove();
                          });
                          fetch(`${API}/playlist/${pid}`, { method: "DELETE" }).catch(() => {});
                        } else {
                          // Deleting the currently open playlist: delete first, then go back to a fresh library.
                          try {
                            await fetch(`${API}/playlist/${pid}`, { method: "DELETE" });
                          } catch {}
                          window.dispatchEvent(new Event("kiyoshi-library-updated"));
                          setView("library");
                        }
                      }}
                    />
                  )}
                </div>
                </PlayerProvider>
              </ZoomContext.Provider>
            </FontScaleContext.Provider>
          </AnimationContext.Provider>
        </TrackNumberContext.Provider>
      </LangContext.Provider>
    </IconContext.Provider>
  );
}
