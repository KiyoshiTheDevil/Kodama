import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  CardRoot,
  cn,
  Disclosure,
  DisclosureBody,
  DisclosureContent,
  DisclosureHeading,
  DisclosureIndicator,
  DisclosureTrigger,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownSection,
  DropdownSubmenuIndicator,
  DropdownSubmenuTrigger,
  DropdownTrigger,
  InputRoot,
  ListBox,
  ListBoxItem,
  SearchFieldClearButton,
  SearchFieldGroup,
  SearchFieldInput,
  SearchFieldRoot,
  SearchFieldSearchIcon,
  Spinner,
  TextFieldRoot,
  toast,
} from "@heroui/react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { API } from "../shared/api/client.js";
import { thumb } from "../shared/api/thumbnails.js";
import { ContextMenu, CtxItem } from "../shared/ui/context-menu.jsx";
import { AmbientBackdrop } from "../shared/ui/ambient-backdrop.jsx";
import { TitleBar } from "../shared/ui/title-bar.jsx";
import { DownloadQueueCard } from "./DownloadQueueCard.jsx";
import { SelectionActionBar } from "./SelectionActionBar.jsx";
import { storageCodecs, usePersistedState } from "../shared/hooks/use-persisted-state.js";
import { matchesShortcut, serializeShortcut } from "../shared/lib/shortcuts.js";
import { useNews } from "./hooks/use-news.js";
import { useAppUpdate } from "./hooks/use-app-update.js";
import { translate } from "../i18n.js";
import {
  ArrowCircleUp,
  ArrowClockwise,
  Bell,
  Books,
  Bug,
  CaretLineLeft,
  CaretLineRight,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  DotsThreeVertical,
  DownloadSimple,
  Gear,
  Heart,
  House,
  MagnifyingGlass,
  Megaphone,
  Microphone,
  MusicNote,
  PencilSimple,
  Playlist,
  Plus,
  Power,
  PushPin,
  Queue,
  Radio,
  ScreencastSimple,
  ShareNodes,
  SignOut,
  Trash,
  UserCircle,
  Users,
  VinylRecord,
  WifiX,
  X,
} from "../icons.jsx";
import { useAnimations, useLang } from "../context.jsx";
import {
  CreatePlaylistModal,
  DeletePlaylistModal,
  RenamePlaylistModal,
} from "../modals/playlist-modals.jsx";
import { NewsModal } from "../modals/news-modal.jsx";
import { BugReportModal } from "../modals/bug-report-modal.jsx";
import { ProfileSwitcherModal } from "../modals/profile-switcher-modal.jsx";
import { RemotePairModal } from "../ui/remote-control.jsx";
import { CollectionView } from "../views/collection-view.jsx";
import { DownloadsView } from "../views/downloads-view.jsx";
import { HistoryView } from "../views/history-view.jsx";
import { LikedView } from "../views/liked-view.jsx";
import { LibraryView } from "../features/music/views/library-view.jsx";
import { SearchView } from "../features/music/views/search-view.jsx";
import { HomeView } from "../features/music/views/home-view.jsx";
import { ArtistView } from "../features/music/views/artist-view.jsx";
import { itemId } from "../features/music/lib/playlist-id.js";
import { LyricsOverlay } from "../features/lyrics/LyricsOverlay.jsx";
import { CoverView, Player, QueuePanel } from "../features/player/player-ui.jsx";
import { hiResThumb } from "../features/player/cover-art.js";
import { usePlaybackStatus, useQueueState, usePlayerActions } from "../features/player/player-context.jsx";
import { useProfileState, useProfileActions } from "../features/profiles/profile-context.jsx";
import { useDownloadState, useDownloadActions } from "../features/downloads/download-context.jsx";
import { SettingsPanel } from "../features/settings/settings-panel.jsx";
import { SettingsSidebarContent } from "../features/settings/settings-sidebar.jsx";
import { DebugFloatingWindow } from "../features/settings/settings-support.jsx";
import { lockSettingsSection, setSettingsSectionStore } from "../features/settings/section-store.js";
import { AddToPlaylistModal } from "../modals/add-to-playlist-modal.jsx";
import { dissolve, particleBurst } from "../effects/particle-burst.js";

// macOS uses a native titled window (traffic lights + native drag), so the custom
// titlebar/drag-region is Windows-only. (Borderless windows swallow clicks on macOS.)
const IS_MAC = /Mac OS X|Macintosh/.test(navigator.userAgent || "");

// ─── App Version ─────────────────────────────────────────────────────────────
const APP_VERSION = __APP_VERSION__;

// Stepped values for the zoom slider (mirrors the copy in App.jsx, which owns the persisted state).
const ZOOM_STEPS = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];

// Detect the best matching language from the browser/OS locale — used only for the silent
// update-check startup call (App owns the persisted `language` state itself).
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
function getInitialLang() {
  return localStorage.getItem("kiyoshi-lang") || detectSystemLang();
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

// Universal share link → GitHub-Pages redirect page (tries kodama://, falls back to YT Music).
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
  onOpenProfileSwitcher,
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
  // Profile list/active profile/logout come from ProfileContext (Step 12) rather than props.
  const { profiles, activeProfile: currentProfileData } = useProfileState();
  const { logout: onLogout } = useProfileActions();
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
          data-testid={`nav-${item.id}`}
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
          <DropdownItem id="switch" data-testid="menu-switch-profile" textValue={t("switchAccount")}>
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
          <DropdownItem id="settings" data-testid="menu-settings" textValue={t("settings")}>
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
                    <SearchFieldInput data-testid="sidebar-search" placeholder={t("search")} />
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
              <SearchFieldInput data-testid="sidebar-search" placeholder={t("search")} />
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
                  data-testid="account-menu-trigger"
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
                data-testid="account-menu-trigger"
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
      data-testid="login-screen"
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

// ─── AppShell ─────────────────────────────────────────────────────────────────
// Layout, route/view selection, sidebar/content/player/queue placement, and
// resize/fullscreen presentation state (Step 13a-i). Consumes the domain
// contexts built in Steps 11/12 directly instead of re-threading their values
// as props. Everything still pinned to App (settings-memo closures, the
// profile/navigation reset injections) crosses as an explicit prop for now —
// bundling those into named objects is Step 13a-ii.
export function AppShell({
  language,
  addToast,
  handleLanguageChange,
  // OBS (useObsOverlay stays in App — its own native-bridge sync effect needs it)
  obsEnabled,
  // likes
  likedIds,
  handleToggleLike,
  // Everything else pinned to App by a settings-memo closure or a profile/navigation-reset
  // injection (see the Step 13 boundary map) arrives bundled by domain instead of as a flat prop
  // list (Step 13a-ii) — destructured back to their original flat names below so the rest of this
  // component (state, effects, JSX) is unchanged from Step 13a-i.
  nav,
  shellUi,
  shortcuts,
  appearancePrefs,
  lyricsPrefs,
  authGate,
  remote,
  network,
  downloadQueue,
  privacySettings,
  bridges,
}) {
  // navigation (features/music/hooks/use-music-navigation.js, called in App) + pinned playlists
  const {
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
  } = nav;
  // overlay / queue / lyrics-visibility / zoom (settings-memo or profile-reset pinned)
  const { overlayOpen, setOverlayOpen, queueOpen, setQueueOpen, showLyrics, setShowLyrics, uiZoom, setUiZoom } =
    shellUi;
  // shortcuts (settings-memo pinned) — raw setters + stale-closure-safe refs
  const { customShortcutsRef, recordingShortcutRef, setCustomShortcuts, setShortcutLabels, setRecordingShortcut } =
    shortcuts;
  // appearance/lyrics settings values read directly by the moved JSX (raw state, App-owned)
  const { animations, hideExplicit, ambientBackground, ambientVisualizer, vizConfig, instrumentalViz } =
    appearancePrefs;
  const {
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
  } = lyricsPrefs;
  // profile / auth-gate startup state (stays App-owned per profile-context.jsx)
  const {
    showLogin,
    setShowLogin,
    addingProfile,
    setAddingProfile,
    reauthName,
    setReauthName,
    showProfileSwitcher,
    setShowProfileSwitcher,
  } = authGate;
  // remote control (useRemoteControl stays in App — integrationSettings memo needs it)
  const { remoteEnabled, remoteInfo, remoteDevices, pairModalOpen, setPairModalOpen, remoteDeviceAction, remoteRememberDevice } =
    remote;
  // network status (useNetworkStatus stays in App — needs music-nav/profile setters)
  const { offlineMode, isActuallyOffline, isOffline, handleToggleOffline } = network;
  // downloads — the queue card + batch cancel stay App-owned (useDownloadManager call);
  // cached/downloading ids + per-track actions come from DownloadContext below instead.
  const { downloadBatches, downloadQueueMin, setDownloadQueueMin, handleCancelBatch } = downloadQueue;
  // misc small settings not covered by a settings-memo prop bundle
  const { anonStats, handleAnonStatsChange, hideUserHandle, setHideUserHandle } = privacySettings;
  // instrumental auto-cover bridge (shared with App's appearanceSettings memo), theme quad-click
  // flashbang bridge (App's handleThemeChange triggers this ref), and the per-track lyrics-session
  // reset bridge (populated here, invoked by usePlayerController in App)
  const { autoCoverRef, flashbangTriggerRef, resetLyricsSessionRef } = bridges;

  // Player controller (Step 11): consumed via context instead of re-threaded props.
  const { track: currentTrack, isPlaying, audioRef } = usePlaybackStatus();
  const { queueRef } = useQueueState();
  const { setTrack: setCurrentTrack, setIsPlaying, enqueue, startSongRadio } = usePlayerActions();
  // Downloads (Step 12): per-track state/actions via context; the queue card stays a prop above.
  const { cachedSongIds, downloadingIds } = useDownloadState();
  const {
    downloadSong: handleDownloadSong,
    exportSong: handleExportSong,
    removeCachedSong,
  } = useDownloadActions();
  // Profiles (Step 12): list + fetch via context; startup/auth-gate state stays a prop above.
  const { profiles } = useProfileState();
  const { fetchProfiles } = useProfileActions();

  // ── App update lifecycle (see app/hooks/use-app-update.js) ──────────────────
  // Only consumed by Sidebar/SettingsPanel, both rendered here — moved wholesale off App.
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

  // ── News feed (see app/hooks/use-news.js) ────────────────────────────────────
  // Only consumed by Sidebar/NewsModal, both rendered here — moved wholesale off App.
  const { newsItems, newsOpen, setNewsOpen, newsUnreadSnapshot, newsUnreadCount, loadNews, openNews } =
    useNews();

  // ── Sidebar / queue resize geometry ──────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth, { setTransient: setSidebarWidthTransient }] =
    usePersistedState("kiyoshi-sidebar-width", SIDEBAR_EXPANDED, SIDEBAR_WIDTH_STORAGE);
  const [sidebarResizing, setSidebarResizing] = useState(false);

  const startSidebarResize = useCallback(
    (e) => {
      e.preventDefault();
      setSidebarResizing(true);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev) => {
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
    },
    [setSidebarWidth, setSidebarWidthTransient]
  );

  const [queueWidth, setQueueWidth, { setTransient: setQueueWidthTransient }] = usePersistedState(
    "kiyoshi-queue-width",
    QUEUE_DEFAULT,
    QUEUE_WIDTH_STORAGE
  );
  const [queueResizing, setQueueResizing] = useState(false);
  const startQueueResize = useCallback(
    (e) => {
      e.preventDefault();
      setQueueResizing(true);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev) => {
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
    },
    [setQueueWidth, setQueueWidthTransient]
  );

  // ── Playlist / global context menu ───────────────────────────────────────────
  const [globalContextMenu, setGlobalContextMenu] = useState(null); // { x, y, playlist }
  const openContextMenu = useCallback((e, pl) => {
    e.preventDefault();
    setGlobalContextMenu({ x: e.clientX, y: e.clientY, playlist: pl });
  }, []);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [createPlaylistForSelection, setCreatePlaylistForSelection] = useState(false);
  const [createPlaylistTracks, setCreatePlaylistTracks] = useState(null);
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
  const [addToPlaylistFor, setAddToPlaylistFor] = useState(null);
  const [renameDialog, setRenameDialog] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const mutePrevVolumeRef = useRef(0.5);

  // ── Clear track selection when view changes ─────────────────────────────────
  useEffect(() => {
    clearSelection();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debug floating window toggle ─────────────────────────────────────────────
  const [debugFloat, setDebugFloat] = useState(false);
  useEffect(() => {
    const handler = () => setDebugFloat(true);
    window.addEventListener("kiyoshi-debug-float", handler);
    return () => window.removeEventListener("kiyoshi-debug-float", handler);
  }, []);

  // ── Settings panel open-state ────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [settingsTab, setSettingsTab] = useState("darstellung");
  const [settingsInitialTab, setSettingsInitialTab] = useState(null); // eslint-disable-line no-unused-vars
  const selectSettingsSection = useCallback((id) => {
    lockSettingsSection();
    setSettingsSectionStore(id);
    document
      .getElementById("set-sec-" + id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsClosing(true);
    setTimeout(() => {
      setSettingsOpen(false);
      setSettingsClosing(false);
    }, 240);
  }, []);

  // ── Feedback / bug report ────────────────────────────────────────────────────
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackShot, setFeedbackShot] = useState(null);
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

  // ── Theme quad-click flashbang ───────────────────────────────────────────────
  const [flashbang, setFlashbang] = useState(false);
  flashbangTriggerRef.current = () => setFlashbang(true);

  // ── Lyrics-session state (forced provider / current source / failed providers / …) ──
  const [lyricsRefetchKey, setLyricsRefetchKey] = useState(0);
  const [forcedLyricsProvider, setForcedLyricsProvider] = useState(null);
  const [currentLyricsSource, setCurrentLyricsSource] = useState("");
  const [failedLyricsProviders, setFailedLyricsProviders] = useState(new Set());
  // Wire the player controller's per-track lyrics-session reset (see usePlayerController in App).
  // Assigned every render; the setters it closes over are stable, so identity does not matter.
  resetLyricsSessionRef.current = () => {
    setForcedLyricsProvider(null);
    setCurrentLyricsSource("");
    setFailedLyricsProviders(new Set());
  };
  const [isCustomLyrics, setIsCustomLyrics] = useState(false);
  const importLyricsRef = useRef(null);
  const removeCustomLyricsRef = useRef(null);

  // Reset lyrics state on every track change (incl. auto-advance / prev-next)
  useEffect(() => {
    setFailedLyricsProviders(new Set());
    setForcedLyricsProvider(null);
    setCurrentLyricsSource("");
  }, [currentTrack?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Split view (fullscreen only): cover/visualizer left, lyrics right ───────
  const [splitView, setSplitView] = useState(false);
  const splitViewRef = useRef(splitView);
  splitViewRef.current = splitView;
  const showLyricsRef = useRef(showLyrics);
  showLyricsRef.current = showLyrics;
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
  // Auto-switch to the cover view during instrumental segments, then back to lyrics.
  const instrumentalVizRef = useRef(instrumentalViz);
  instrumentalVizRef.current = instrumentalViz;
  const lastInstSwitchRef = useRef(0);
  const setShowLyricsManual = useCallback(
    (v) => {
      autoCoverRef.current = false;
      setShowLyrics(v);
    },
    [autoCoverRef, setShowLyrics]
  );
  const handleInstrumentalChange = useCallback(
    (inst) => {
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
    },
    [autoCoverRef, setShowLyrics]
  );

  // ── Fullscreen / idle player-bar + cursor ────────────────────────────────────
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

  // Defer the queue panel's ambient blur until the slide-in transition has settled.
  useEffect(() => {
    if (!queueOpen) {
      setQueueSettled(false);
      return;
    }
    const id = setTimeout(() => setQueueSettled(true), animations ? 320 : 0);
    return () => clearTimeout(id);
  }, [queueOpen, animations]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tgt = e.target;
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

      // While the overlay editor is open, playback shortcuts must not fire.
      if (document.querySelector("[data-overlay-editor]")) return;
      // Same for Big Picture mode.
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
  }, [isPlaying, audioRef, overlayOpen, currentTrack, setUiZoom, splitView, openFeedback]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <>
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
            minWidth: fullscreen ? 0 : sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth,
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
            onOpenProfileSwitcher={() => setShowProfileSwitcher(true)}
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
              pointerEvents: overlayOpen || settingsOpen || settingsClosing ? "none" : "auto",
            }}
          >
            <div key={appKey} className="scrollable" style={{ height: "100%", overflowY: "auto" }}>
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
                    onOpenArtist={openArtist}
                    onOpenAlbum={(item) => openAlbum(item, "liked")}
                    onTrackContextMenu={(e, track) =>
                      setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
                    }
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
                    onOpenArtist={openArtist}
                    onOpenAlbum={(item) => openAlbum(item, "history")}
                    onTrackContextMenu={(e, track, extra) =>
                      setTrackContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        track,
                        ...extra,
                      })
                    }
                    hideExplicit={hideExplicit}
                    onBack={goBack}
                  />
                </AnimatedView>
              )}
              {view === "library" && (
                <AnimatedView key={`library-${viewRefreshKey}`}>
                  <LibraryView
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
              <div style={{ height: 97, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
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
                onAddToPlaylist={(tracks) => setAddToPlaylistFor({ tracks, fromSelection: true })}
              />
            )}
            <div
              style={{
                opacity: settingsOpen ? 0 : 1,
                transform: fullscreen && !playerVisible ? "translateY(120%)" : "translateY(0)",
                visibility:
                  settingsOpen || (fullscreen && !playerVisible) ? "hidden" : "visible",
                transition:
                  "opacity 0.35s ease, transform 0.42s cubic-bezier(0.4,0,0.2,1), visibility 0.42s ease",
                pointerEvents: settingsOpen ? "none" : !fullscreen || playerVisible ? "auto" : "none",
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
                onRefetchLyrics={() => {
                  setForcedLyricsProvider(null);
                  setLyricsRefetchKey((k) => k + 1);
                }}
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
                isCustomLyrics={isCustomLyrics}
                onImportLyrics={() => importLyricsRef.current?.()}
                onRemoveCustomLyrics={() => removeCustomLyricsRef.current?.()}
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
            left: fullscreen ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4,
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
              const splitActive = fullscreen && splitView;
              const coverPct = `${(splitRatio * 100).toFixed(2)}%`;
              const lyricsPct = `${((1 - splitRatio) * 100).toFixed(2)}%`;
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
                      borderRight: splitActive ? "1px solid rgba(255,255,255,0.08)" : "none",
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
            transform: queueOpen
              ? queueSettled
                ? "none"
                : "translateX(0)"
              : "translateX(calc(100% + 16px))",
            willChange: queueOpen && queueSettled ? "auto" : "transform",
            background: ambientBackground
              ? queueSettled
                ? "rgba(18,18,18,0.5)"
                : "rgba(18,18,18,0.92)"
              : "var(--bg-surface)",
            backdropFilter: ambientBackground && queueSettled ? "blur(32px) saturate(1.4)" : "none",
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
              left: fullscreen ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4,
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
            <SettingsPanel
              onClose={closeSettings}
              onOpenOverlayEditor={openOverlayEditor}
              onResetShortcuts={setCustomShortcuts}
              onSectionChange={setSettingsSectionStore}
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
          </div>
        )}

        {/* Debug Floating Window */}
        {debugFloat && <DebugFloatingWindow onClose={() => setDebugFloat(false)} />}

        {/* Create Playlist Modal */}
        <ProfileSwitcherModal isOpen={showProfileSwitcher} onOpenChange={setShowProfileSwitcher} />
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
              currentTrack ? { videoId: currentTrack.videoId, title: currentTrack.title } : null
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
                      const bg = (l.bgWords || []).map((w) => w.text).join("") || l.bgText || "";
                      return bg ? `${main} ${bg}` : main;
                    })
                    .join("\n");
                  navigator.clipboard.writeText(text).catch(() => {});
                })
                .catch(() => {});
            };
            const saveLrc = async () => {
              try {
                const d = await fetch(`${API}/lyrics/${track.videoId}`).then((r) => r.json());
                if (!d.lyrics) return;
                const lyrics = d.lyrics;
                const isSync = lyrics.some((l) => l.time >= 0);
                const lrcLineText = (l) => {
                  const main = l.wordSync
                    ? (l.words || []).map((w) => w.text).join("")
                    : l.text || "";
                  const bg = (l.bgWords || []).map((w) => w.text).join("") || l.bgText || "";
                  return bg ? `${main} ${bg}` : main;
                };
                const lrcText = isSync
                  ? lyrics
                      .map((l) => {
                        const lineText = lrcLineText(l);
                        if (l.time < 0) return lineText;
                        const mm = String(Math.floor(l.time / 60)).padStart(2, "0");
                        const ss = String(Math.floor(l.time % 60)).padStart(2, "0");
                        const cs = String(Math.floor((l.time % 1) * 100)).padStart(2, "0");
                        return `[${mm}:${ss}.${cs}] ${lineText}`;
                      })
                      .join("\n")
                  : lyrics.map(lrcLineText).join("\n");
                const { save } = await import("@tauri-apps/plugin-dialog");
                const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                const safeTitle = (track?.title || "lyrics").replace(/[<>:"/\\|?*]/g, "_");
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
              if (animations) {
                try {
                  particleBurst(
                    document.querySelector(`[data-track-id="${CSS.escape(track.videoId)}"]`)
                  );
                } catch {}
              }
              setCollection((c) =>
                c
                  ? {
                      ...c,
                      tracks: c.tracks.filter(
                        (t) => t.videoId !== track.videoId || t.setVideoId !== track.setVideoId
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
                        translate(language, "addedQueue") || "Zur Warteschlange hinzugefügt",
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
                      ctxLiked ? translate(language, "unlike") : translate(language, "like")
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
                    {ctxLiked ? translate(language, "unlike") : translate(language, "like")}
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
                          openAlbum({ browseId: track.albumBrowseId, title: track.album }, view)
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
                        onSelect={() => openArtist({ browseId: track.artistBrowseId }, view)}
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
                              copyShare(`https://music.youtube.com/watch?v=${track.videoId}`)
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
            const isUserPlaylist = pl?.playlistId && pl?.type !== "album" && pl?.owned !== false;
            const isPlaylistShare =
              pl && pl.type !== "album" && pl.type !== "artist" && (pl.playlistId || pl.browseId);
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
                    label={isPinned ? translate(language, "unpin") : translate(language, "pin")}
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
                          .writeText(`https://music.youtube.com/playlist?list=${plShareId}`)
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
              const fromCollection = view === "collection" && collection?.playlistId === pid;
              setDeleteDialog(null);
              removeRecentPlaylist(pid);
              if (!fromCollection) {
                const remove = () =>
                  window.dispatchEvent(new CustomEvent("kiyoshi-playlist-removed", { detail: pid }));
                requestAnimationFrame(() => {
                  const el = document.querySelector(`[data-card-id="${CSS.escape(pid)}"]`);
                  if (animations && el) dissolve(el, remove);
                  else remove();
                });
                fetch(`${API}/playlist/${pid}`, { method: "DELETE" }).catch(() => {});
              } else {
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
    </>
  );
}
