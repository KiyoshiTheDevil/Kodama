import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
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
  DropdownTrigger,
  ListBox,
  ListBoxItem,
  SearchFieldClearButton,
  SearchFieldGroup,
  SearchFieldInput,
  SearchFieldRoot,
  SearchFieldSearchIcon,
} from "@heroui/react";
import { API } from "../shared/api/client.js";
import { thumb } from "../shared/api/thumbnails.js";
import { IS_MAC } from "../shared/lib/platform.js";
import {
  ArrowCircleUp,
  ArrowClockwise,
  Bell,
  Books,
  Bug,
  CaretLineLeft,
  CaretLineRight,
  ClockCounterClockwise,
  DownloadSimple,
  Gear,
  Heart,
  House,
  MagnifyingGlass,
  Megaphone,
  Microphone,
  Playlist,
  Plus,
  Power,
  PushPin,
  ScreencastSimple,
  SignOut,
  UserCircle,
  Users,
  VinylRecord,
  WifiX,
} from "../icons.jsx";
import { useAnimations, useLang } from "../context.jsx";
import { useProfileState, useProfileActions } from "../features/profiles/profile-context.jsx";

export function Sidebar({
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
