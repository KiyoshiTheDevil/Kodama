import { useEffect, useState } from "react";
import {
  Button,
  CardRoot,
  InputRoot,
  Spinner,
  TextFieldRoot,
} from "@heroui/react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { API } from "../shared/api/client.js";
import { useLang } from "../context.jsx";
import { CheckCircle, X } from "../icons.jsx";
import { translate } from "../i18n.js";
import { usePlaybackStatus } from "../features/player/player-context.jsx";
import { useProfileActions } from "../features/profiles/profile-context.jsx";
import { SettingsPanel } from "../features/settings/settings-panel.jsx";
import { DebugFloatingWindow } from "../features/settings/settings-support.jsx";
import { setSettingsSectionStore } from "../features/settings/section-store.js";
import { RemotePairModal } from "../ui/remote-control.jsx";
import { NewsModal } from "../modals/news-modal.jsx";
import { BugReportModal } from "../modals/bug-report-modal.jsx";
import { ProfileSwitcherModal } from "../modals/profile-switcher-modal.jsx";
import {
  CreatePlaylistModal,
  DeletePlaylistModal,
  RenamePlaylistModal,
} from "../modals/playlist-modals.jsx";
import { AddToPlaylistModal } from "../modals/add-to-playlist-modal.jsx";
import { DownloadQueueCard } from "./DownloadQueueCard.jsx";
import { TrackContextMenu } from "./TrackContextMenu.jsx";
import { PlaylistContextMenu } from "./PlaylistContextMenu.jsx";
import { dissolve } from "../effects/particle-burst.js";
import { SIDEBAR_COLLAPSED } from "./shell-constants.js";

// ─── App Version ─────────────────────────────────────────────────────────────
// Injected from src-tauri/tauri.conf.json at build time (see vite.config.js) — the single
// source of truth, so this never drifts from the shipped version.
const APP_VERSION = __APP_VERSION__;

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
    } catch { /* intentionally ignored */ }
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

// ─── AppOverlays ────────────────────────────────────────────────────────────
// Every dialog, menu, and piece of transient UI that floats above AppShell's core layout
// (Step 13b): login/auth gate, remote pairing, the settings panel overlay, debug float window,
// profile switcher, news/bug-report modals, playlist create/rename/delete/add-to-playlist
// dialogs, the download queue card, and the track/playlist context menus. No new context is
// introduced — this is a straight parent (AppShell) → child relationship, so ordinary (bundled)
// props carry what's needed, per the Step 13 boundary decision.
export function AppOverlays({
  language,
  addToast,
  handleLanguageChange,
  uiZoom,
  animations,
  fullscreen,
  sidebarCollapsed,
  sidebarWidth,
  view,
  setView,
  collection,
  setCollection,
  openAlbum,
  openArtist,
  openPlaylist,
  removeRecentPlaylist,
  pinnedIds,
  togglePin,
  likedIds,
  handleToggleLike,
  clearSelection,
  auth,
  remote,
  settingsPanel,
  debugFloatState,
  profileSwitcher,
  news,
  feedback,
  playlistDialogs,
  downloadQueueCard,
  trackMenu,
  playlistMenu,
}) {
  const { track: currentTrack } = usePlaybackStatus();
  const { fetchProfiles } = useProfileActions();

  const { showLogin, setShowLogin, addingProfile, setAddingProfile, reauthName, setReauthName } =
    auth;
  const {
    remoteEnabled,
    pairModalOpen,
    setPairModalOpen,
    remoteInfo,
    remoteDevices,
    remoteDeviceAction,
    remoteRememberDevice,
  } = remote;
  const {
    settingsOpen,
    settingsClosing,
    closeSettings,
    settingsTab,
    setSettingsTab,
    setCustomShortcuts,
    anonStats,
    handleAnonStatsChange,
    hideUserHandle,
    setHideUserHandle,
    updateInfo,
    checkForUpdates,
    updateDownloading,
    updateDownloadProgress,
    updateDownloaded,
    downloadUpdate,
    installUpdate,
    cancelUpdateDownload,
  } = settingsPanel;
  const { debugFloat, setDebugFloat } = debugFloatState;
  const { showProfileSwitcher, setShowProfileSwitcher } = profileSwitcher;
  const { newsOpen, newsItems, newsUnreadSnapshot, loadNews, setNewsOpen } = news;
  const { feedbackOpen, feedbackShot, setFeedbackOpen } = feedback;
  const {
    createPlaylistOpen,
    setCreatePlaylistOpen,
    createPlaylistForSelection,
    setCreatePlaylistForSelection,
    createPlaylistTracks,
    setCreatePlaylistTracks,
    addToPlaylistFor,
    setAddToPlaylistFor,
    renameDialog,
    setRenameDialog,
    deleteDialog,
    setDeleteDialog,
  } = playlistDialogs;
  const { downloadBatches, downloadQueueMin, setDownloadQueueMin, handleCancelBatch } =
    downloadQueueCard;
  const { trackContextMenu, setTrackContextMenu } = trackMenu;
  const { globalContextMenu, setGlobalContextMenu } = playlistMenu;

  return (
    <>
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
              } catch { /* intentionally ignored */ }
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

      <TrackContextMenu
        menu={trackContextMenu}
        onClose={() => setTrackContextMenu(null)}
        language={language}
        uiZoom={uiZoom}
        animations={animations}
        likedIds={likedIds}
        handleToggleLike={handleToggleLike}
        addToast={addToast}
        setCollection={setCollection}
        openAlbum={openAlbum}
        openArtist={openArtist}
        view={view}
        onAddToPlaylist={(track) => setAddToPlaylistFor({ tracks: [track] })}
      />

      <PlaylistContextMenu
        menu={globalContextMenu}
        onClose={() => setGlobalContextMenu(null)}
        language={language}
        uiZoom={uiZoom}
        pinnedIds={pinnedIds}
        togglePin={togglePin}
        openAlbum={openAlbum}
        openArtist={openArtist}
        openPlaylist={openPlaylist}
        view={view}
        onRename={setRenameDialog}
        onDelete={setDeleteDialog}
        removeRecentPlaylist={removeRecentPlaylist}
      />

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
              } catch { /* intentionally ignored */ }
              window.dispatchEvent(new Event("kiyoshi-library-updated"));
              setView("library");
            }
          }}
        />
      )}
    </>
  );
}
