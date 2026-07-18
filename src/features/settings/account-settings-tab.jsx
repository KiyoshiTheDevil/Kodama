import { useEffect, useState } from "react";
import {
  Button,
  CardRoot,
  cn,
  InputRoot,
  ModalBackdrop,
  ModalBody,
  ModalCloseTrigger,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  ModalIcon,
  ModalRoot,
  TextFieldRoot,
  toast,
} from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";

import {
  ArrowClockwise,
  ArrowSquareOut,
  BrandYoutube,
  Clock,
  ClockCounterClockwise,
  EyeSlash,
  Heart,
  ImageSquare,
  MusicNote,
  Playlist,
  SignOut,
  Trash,
  UserCircle,
  UserPlus,
} from "../../icons.jsx";
import { API } from "../../shared/api/client.js";
import { thumb } from "../../shared/api/thumbnails.js";
import { useLang } from "../../context.jsx";
import { fmtDuration } from "./settings-support.jsx";
import { SettingRow, Toggle } from "../../ui/settings-controls.jsx";
import { useProfileState, useProfileActions } from "../profiles/profile-context.jsx";

export function AccountSettingsTab({ hideUserHandle, onToggleHideUserHandle }) {
  const t = useLang();
  // Account list/active account/actions come from ProfileContext (Step 12) rather than props.
  const { profiles: list, activeProfile: active } = useProfileState();
  const {
    switchProfile: onSwitch,
    addProfile: onAdd,
    reauthProfile: onReauth,
    removeProfile: onRemove,
    renameProfile: onRename,
    logout: onLogout,
    changeAvatar: onAvatarChange,
  } = useProfileActions();
  const [nameDraft, setNameDraft] = useState(active?.displayName || "");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  useEffect(() => {
    setNameDraft(active?.displayName || "");
  }, [active?.name]);

  const nameChanged =
    !!active && !!nameDraft.trim() && nameDraft.trim() !== (active.displayName || "");

  // ─── Usage statistics ────────────────────────────────────────────────────────
  const [stats, setStats] = useState({
    usage: 0,
    playtime: 0,
    liked: null,
    playlists: null,
    history: 0,
  });
  useEffect(() => {
    let history = 0;
    try {
      const hk = `kiyoshi-history-${window.__activeProfile || "default"}`;
      history = (JSON.parse(localStorage.getItem(hk) || "[]") || []).length;
    } catch {}
    setStats((s) => ({
      ...s,
      usage: Number(localStorage.getItem("kiyoshi-total-usage") || 0),
      playtime: Number(localStorage.getItem("kiyoshi-total-playtime") || 0),
      history,
    }));
    let cancelled = false;
    fetch(`${API}/liked/ids`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStats((s) => ({ ...s, liked: (d.ids || []).length }));
      })
      .catch(() => {});
    fetch(`${API}/library/playlists`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStats((s) => ({ ...s, playlists: (d.playlists || []).length }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const Avatar = ({ a, size }) => (
    <div
      className={cn(
        "rounded-full overflow-hidden shrink-0 flex items-center justify-center font-semibold",
        a.type === "local"
          ? "bg-elevated text-secondary border border-border"
          : "bg-accent text-white"
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {a.avatar ? (
        <img src={thumb(a.avatar)} alt="" className="w-full h-full object-cover" />
      ) : (
        (a.displayName || a.name || "?")[0].toUpperCase()
      )}
    </div>
  );

  const pickAvatar = async () => {
    if (!active) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (!path) return;
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const bytes = await readFile(path);
      if (bytes.length > 2 * 1024 * 1024) {
        toast.danger(t("avatarTooLarge"));
        return;
      }
      const ext = String(path).split(".").pop().toLowerCase();
      const mime =
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : "image/jpeg";
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const dataUri = `data:${mime};base64,${btoa(binary)}`;
      await onAvatarChange?.(active.name, dataUri);
      toast.success(t("avatarUpdated"));
    } catch (e) {
      console.error("avatar pick failed:", e);
    }
  };

  const clearPlaybackHistory = () => {
    try {
      localStorage.removeItem(`kiyoshi-history-${window.__activeProfile || "default"}`);
      window.dispatchEvent(new Event("kiyoshi-history-updated"));
    } catch {}
    setStats((s) => ({ ...s, history: 0 }));
    setConfirmClearHistory(false);
    toast.success(t("historyCleared"));
  };

  const StatTile = ({ icon, label, value }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-elevated">
      <div className="w-9 h-9 rounded-lg bg-accent-dim text-accent flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-t16 font-semibold truncate tabular-nums">{value}</div>
        <div className="text-t11 text-muted truncate">{label}</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 text-primary max-w-[560px]">
      <div
        id="set-sec-account-overview"
        data-settings-section="account-overview"
        className="flex flex-col gap-6"
        style={{ scrollMarginTop: 8 }}
      >
        {/* Active account card */}
        {active && (
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-elevated">
            {active.type === "local" ? (
              <button
                onClick={pickAvatar}
                title={t("changeAvatar")}
                className="relative group shrink-0 rounded-full cursor-default"
              >
                <Avatar a={active} size={56} />
                <span className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <ImageSquare size={18} />
                </span>
              </button>
            ) : (
              <Avatar a={active} size={56} />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-t18 font-semibold truncate">
                {active.displayName || active.name}
              </div>
              {active.handle && <div className="text-t13 text-muted truncate">{active.handle}</div>}
              <div className="text-t11 text-muted mt-0.5">
                {active.type === "local" ? t("localAccount") : "Google"}
              </div>
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nameChanged) onRename(active.name, nameDraft);
                  }}
                />
              </TextFieldRoot>
              <Button
                variant="primary"
                isDisabled={!nameChanged}
                onPress={() => onRename(active.name, nameDraft)}
              >
                {t("save")}
              </Button>
            </div>
          </div>
        )}

        {/* Sidebar display preference */}
        <SettingRow
          label={t("hideUserHandle")}
          description={t("hideUserHandleDesc")}
          icon={<EyeSlash />}
        >
          <Toggle value={hideUserHandle} onChange={onToggleHideUserHandle} />
        </SettingRow>
      </div>
      <div
        id="set-sec-account-accounts"
        data-settings-section="account-accounts"
        className="flex flex-col gap-6"
        style={{ scrollMarginTop: 8 }}
      >
        {/* Accounts list */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-t12 font-semibold text-muted uppercase tracking-wider">
              {t("manageAccounts")}
            </span>
            <Button variant="ghost" size="sm" onPress={onAdd}>
              <UserPlus size={15} />
              {t("addAccount")}
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {list.map((a) => (
              <div
                key={a.name}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-xl transition-colors duration-150",
                  a.active ? "bg-accent-dim" : "hover:bg-hover"
                )}
              >
                <Avatar a={a} size={36} />
                <div
                  className="flex-1 min-w-0"
                  onClick={() => {
                    if (!a.active) onSwitch(a.name);
                  }}
                >
                  <div className={cn("text-t13 font-medium truncate", a.active && "text-accent")}>
                    {a.displayName || a.name}
                  </div>
                  <div className="text-t11 text-muted truncate">
                    {a.type === "local" ? t("localAccount") : a.loggedOut ? t("logOut") : a.handle}
                  </div>
                </div>
                {a.type !== "local" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    onPress={() => onReauth(a.name)}
                    title={t("reauthSession")}
                  >
                    <ArrowClockwise size={14} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  onPress={() => setConfirmRemove(a.name)}
                  title={t("removeAccountTitle")}
                  className="text-muted hover:text-[#f44336]"
                >
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
            <span className="text-t12 font-semibold text-muted uppercase tracking-wider">
              {t("links")}
            </span>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="ghost"
                fullWidth
                className="justify-start gap-2.5 rounded-xl"
                onPress={() => openUrl("https://music.youtube.com/").catch(console.error)}
              >
                <BrandYoutube size={16} />
                {t("openYouTubeMusic")}
                <ArrowSquareOut size={13} className="ml-auto text-muted" />
              </Button>
              <Button
                variant="ghost"
                fullWidth
                className="justify-start gap-2.5 rounded-xl"
                onPress={() => openUrl("https://myaccount.google.com/").catch(console.error)}
              >
                <UserCircle size={16} />
                {t("manageGoogleAccount")}
                <ArrowSquareOut size={13} className="ml-auto text-muted" />
              </Button>
            </div>
          </div>
        )}
      </div>
      <div
        id="set-sec-account-statistics"
        data-settings-section="account-statistics"
        className="flex flex-col gap-6"
        style={{ scrollMarginTop: 8 }}
      >
        {/* Usage statistics */}
        <div className="flex flex-col gap-2">
          <span className="text-t12 font-semibold text-muted uppercase tracking-wider">
            {t("statistics")}
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile
              icon={<Clock size={16} />}
              label={t("totalUsageTime")}
              value={fmtDuration(stats.usage)}
            />
            <StatTile
              icon={<MusicNote size={16} />}
              label={t("totalPlaytime")}
              value={fmtDuration(stats.playtime)}
            />
            <StatTile
              icon={<Heart size={16} />}
              label={t("likedSongs")}
              value={stats.liked == null ? "…" : stats.liked}
            />
            <StatTile
              icon={<Playlist size={16} />}
              label={t("playlists")}
              value={stats.playlists == null ? "…" : stats.playlists}
            />
            <StatTile
              icon={<ClockCounterClockwise size={16} />}
              label={t("history")}
              value={stats.history}
            />
          </div>
        </div>

        {/* Data management */}
        <div className="flex flex-col gap-2">
          <span className="text-t12 font-semibold text-muted uppercase tracking-wider">
            {t("dataManagement")}
          </span>
          <div>
            <Button
              variant="danger-soft"
              isDisabled={!stats.history}
              onPress={() => setConfirmClearHistory(true)}
            >
              <Trash size={15} />
              {t("clearPlaybackHistory")}
            </Button>
          </div>
        </div>
      </div>

      {/* Clear history confirmation */}
      <ModalRoot
        isOpen={confirmClearHistory}
        onOpenChange={(open) => {
          if (!open) setConfirmClearHistory(false);
        }}
      >
        <ModalBackdrop className="z-[300]!">
          <ModalContainer placement="center" size="sm" className="w-[360px] max-w-[92vw]">
            <ModalDialog>
              <ModalHeader>
                <ModalIcon>
                  <ClockCounterClockwise size={18} />
                </ModalIcon>
                <ModalCloseTrigger />
                <ModalHeading>{t("clearPlaybackHistory")}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <div className="text-t12 text-muted leading-relaxed">
                  {t("clearPlaybackHistoryDesc")}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onPress={() => setConfirmClearHistory(false)}>
                  {t("cancel")}
                </Button>
                <Button variant="danger" onPress={clearPlaybackHistory}>
                  {t("clearPlaybackHistoryConfirm")}
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>

      {/* Remove confirmation */}
      <ModalRoot
        isOpen={!!confirmRemove}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <ModalBackdrop className="z-[300]!">
          <ModalContainer placement="center" size="sm" className="w-[360px] max-w-[92vw]">
            <ModalDialog>
              <ModalHeader>
                <ModalIcon>
                  <Trash size={18} />
                </ModalIcon>
                <ModalCloseTrigger />
                <ModalHeading>{t("removeAccountTitle")}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <div className="text-t12 text-muted leading-relaxed">{t("removeAccountDesc")}</div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onPress={() => setConfirmRemove(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    const name = confirmRemove;
                    setConfirmRemove(null);
                    onRemove(name);
                  }}
                >
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
