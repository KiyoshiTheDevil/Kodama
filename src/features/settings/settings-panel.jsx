import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  CardRoot,
  cn,
  InputRoot,
  KbdContent,
  KbdRoot,
  ListBox,
  ListBoxItem,
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
  ProgressBar,
  ProgressBarFill,
  ProgressBarTrack,
  Spinner,
  TextFieldRoot,
} from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";

import {
  ArrowsClockwise,
  ArrowCircleUp,
  ArrowClockwise,
  ArrowSquareOut,
  BrandBluesky,
  BrandTiktok,
  BrandTwitch,
  BrandYoutube,
  Bug,
  CaretDown,
  CaretUp,
  ChatText,
  Check,
  CheckCircle,
  CircleHalf,
  CloudSun,
  DownloadSimple,
  Eye,
  EyeSlash,
  Flask,
  Globe,
  Info,
  Key,
  Keyboard,
  Link,
  Lock,
  LockOpen,
  MagnifyingGlass,
  Moon,
  MoonStars,
  MusicNote,
  Palette,
  PaintBrushBroad,
  PencilSimple,
  Play,
  PlayCircle,
  PersonArmsSpread,
  Radio,
  ScreencastSimple,
  ShareNodes,
  Sliders,
  Sparkles,
  Sun,
  SunHorizon,
  TextSize,
  Tag,
  Trash,
  Translate,
  UserCheck,
  UserCircle,
  UserPlus,
  Users,
  WarningCircle,
  WifiHigh,
  WifiX,
  DeviceMobile,
  HardDrives,
  WaveformLines,
  X,
} from "../../icons.jsx";
import { thumb } from "../../shared/api/thumbnails.js";
import { useAnimations, useLang } from "../../context.jsx";
import { LANGUAGES, translate, translationProgress } from "../../i18n.js";
import { renderNewsBody } from "../../modals/news-modal.jsx";
import { RemoteControlPanel } from "../../ui/remote-control.jsx";
import { DEFAULT_LYRICS_PROVIDERS } from "../../lyrics/providers.js";
import { CoverView, VIZ_DEFAULTS } from "../player/player-ui.jsx";
import {
  Slider,
  Toggle,
  SettingRow,
  SettingsSectionDesc,
  SettingsSectionLabel,
} from "../../ui/settings-controls.jsx";
import { AccountSettingsTab } from "./account-settings-tab.jsx";
import {
  AccentColorPicker,
  APP_VERSION,
  CacheTab,
  ComposerSettingsSection,
  DebugTab,
  DownloadsTab,
  FfmpegUpdateRow,
  LastfmRow,
  LyricsProviderList,
  StorageTab,
  UnisonIdentitySection,
  YtDlpUpdateRow,
} from "./settings-support.jsx";
import { isSettingsSectionLocked } from "./section-store.js";
import {
  APP_ICON_DEFAULT,
  APP_ICON_GROUPS,
  DEFAULT_SHORTCUTS,
  FONT_LABELS,
  FONT_STEPS,
  ZOOM_LABELS,
  ZOOM_STEPS,
} from "./settings-constants.js";
import {
  useAppearanceSettings,
  usePlaybackSettings,
  useLyricsSettings,
  useIntegrationSettings,
  useShortcutSettings,
} from "./settings-context.jsx";

async function hashPin(pin) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function SettingsPanel({
  onClose,
  onOpenOverlayEditor,
  onResetShortcuts,
  onSectionChange,
  language,
  onLanguageChange,
  updateInfo,
  onCheckUpdate,
  updateDownloading,
  updateDownloadProgress,
  updateDownloaded,
  onDownloadUpdate,
  onInstallUpdate,
  onCancelDownload,
  anonStats,
  onAnonStatsChange,
  hideUserHandle,
  onToggleHideUserHandle,
  tab,
  setTab,
}) {
  const anim = useAnimations();
  const t = useLang();
  const {
    accent,
    onAccentChange,
    accentDynamic,
    onAccentDynamicChange,
    accentSat,
    onAccentSatChange,
    accentLight,
    onAccentLightChange,
    appIcon = APP_ICON_DEFAULT,
    onAppIconChange,
    theme,
    onThemeChange,
    animations,
    onAnimationsChange,
    highContrast,
    onToggleHighContrast,
    appFont,
    onAppFontChange,
    appFontScale,
    onFontScaleChange,
    uiZoom,
    onUiZoomChange,
    showTrackNumbers,
    onTrackNumbersChange,
    hideExplicit,
    onHideExplicitChange,
    ambientBackground,
    onToggleAmbientBackground,
    ambientVisualizer,
    onToggleAmbientVisualizer,
    instrumentalViz,
    onToggleInstrumentalViz,
    vizConfig,
    onUpdateViz,
    vizPreviewTrack,
    vizPreviewPlaying,
  } = useAppearanceSettings();
  const {
    autoplay,
    onAutoplayChange,
    crossfade,
    onCrossfadeChange,
    crossfadeOverrides = {},
    onRemoveCrossfadeOverride,
    playbackProgressive,
    onPlaybackProgressiveChange,
  } = usePlaybackSettings();
  const {
    lyricsFontSize,
    onLyricsFontSizeChange,
    lyricsTranslationFontSize,
    onLyricsTranslationFontSizeChange,
    lyricsRomajiFontSize,
    onLyricsRomajiFontSizeChange,
    lyricsProviders,
    onLyricsProvidersChange,
    showRomaji,
    onToggleRomaji,
    showAgentTags,
    onToggleAgentTags,
    syllableZoom,
    onToggleSyllableZoom,
    fluidLyrics,
    onToggleFluidLyrics,
  } = useLyricsSettings();
  const {
    closeTray,
    onCloseTrayChange,
    discordRpc,
    onDiscordRpcChange,
    ipv4First,
    onIpv4FirstChange,
    obsEnabled,
    obsPort,
    obsPortInput,
    setObsPortInput,
    toggleObs,
    onObsPortSave,
    remoteEnabled = false,
    remoteDevices = [],
    remoteTrustedIds = new Set(),
    onToggleRemote,
    onRemoteDevice,
    onRememberDevice,
    onPairDevice,
  } = useIntegrationSettings();
  const {
    customShortcuts,
    shortcutLabels,
    recordingShortcut,
    setRecordingShortcut,
    getShortcutLabel,
    resetShortcut,
  } = useShortcutSettings();
  // Scroll-spy for the Discord-style sub-nav: watch the [data-settings-section] blocks in the
  // scroll container and report which one sits in the top band as the active section.
  const contentScrollRef = useRef(null);
  useEffect(() => {
    const root = contentScrollRef.current;
    if (!root || !onSectionChange) return;
    const secs = [...root.querySelectorAll("[data-settings-section]")];
    if (!secs.length) {
      onSectionChange(null);
      return;
    }
    const compute = () => {
      if (isSettingsSectionLocked()) return; // don't fight a click's smooth scroll
      // Discord-style proportional "reading line": it sits at the container's top when scrolled to
      // the very top and glides down to the container's bottom as you reach the end of the scroll.
      // The active section is the last one whose top is above that line — so sections light up in
      // order while scrolling and the last one is reached exactly at the bottom (no trailing space).
      const rect = root.getBoundingClientRect();
      const maxScroll = root.scrollHeight - root.clientHeight;
      const progress = maxScroll > 0 ? Math.min(1, root.scrollTop / maxScroll) : 0;
      const line = rect.top + root.clientHeight * progress;
      let active = secs[0];
      for (const s of secs) {
        if (s.getBoundingClientRect().top <= line) active = s;
        else break;
      }
      onSectionChange(active.dataset.settingsSection);
    };
    compute();
    root.addEventListener("scroll", compute, { passive: true });
    return () => root.removeEventListener("scroll", compute);
  }, [tab, onSectionChange]);
  // Visualizer preview scales with the window height (live on resize) so on short windows it
  // shrinks — both the box AND the cover — leaving room to reach the options below.
  const [winH, setWinH] = useState(() => window.innerHeight);
  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => {
      setWinH(window.innerHeight);
      setWinW(window.innerWidth);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const vizPreviewH = Math.round(Math.max(260, Math.min(620, winH * 0.48)));
  const vizCoverSize = Math.round(Math.max(130, Math.min(260, vizPreviewH * 0.42)));
  const [vizPreviewOpen, setVizPreviewOpen] = useState(
    () => localStorage.getItem("kodama-viz-preview") !== "collapsed"
  );
  const toggleVizPreview = () =>
    setVizPreviewOpen((o) => {
      const n = !o;
      localStorage.setItem("kodama-viz-preview", n ? "open" : "collapsed");
      return n;
    });
  // Scaled-replica preview: render at the same proportions as the fullscreen cover view (coverSize
  // 260, window-sized container) but shrunk by s = previewWidth / windowWidth. Scaling the pixel
  // config values (barLength/gap/thickness) along with the cover + container makes the preview a
  // true 1:1 miniature of the real visualizer, including the linear bar spread.
  const vizPreviewRef = useRef(null);
  const [vizPreviewW, setVizPreviewW] = useState(0);
  useEffect(() => {
    const el = vizPreviewRef.current;
    if (!el || !vizPreviewOpen) return;
    const ro = new ResizeObserver(() => setVizPreviewW(el.clientWidth));
    ro.observe(el);
    setVizPreviewW(el.clientWidth);
    return () => ro.disconnect();
  }, [vizPreviewOpen]);
  const vizScale = vizPreviewW > 0 && winW > 0 ? vizPreviewW / winW : vizCoverSize / 260;
  const vizPreviewHReplica =
    vizPreviewW > 0 && winW > 0 ? Math.round((vizPreviewW * winH) / winW) : vizPreviewH;
  const vizPreviewCover = Math.max(60, Math.round(260 * vizScale));

  // Visualizer presets — save/apply/import/export named snapshots of the config (same pattern as
  // the Overlay Editor's design profiles). Stored locally as { id, name, savedAt, config }.
  const [vizPresets, setVizPresets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kodama-visualizer-presets") || "[]");
    } catch {
      return [];
    }
  });
  const persistVizPresets = (next) => {
    setVizPresets(next);
    try {
      localStorage.setItem("kodama-visualizer-presets", JSON.stringify(next));
    } catch {}
  };
  const [vizPresetName, setVizPresetName] = useState("");
  const vizImportRef = useRef(null);
  const saveVizPreset = () => {
    const name = vizPresetName.trim() || t("preset") || "Preset";
    persistVizPresets([
      {
        id: crypto.randomUUID(),
        name,
        savedAt: new Date().toISOString(),
        config: { ...vizConfig },
      },
      ...vizPresets,
    ]);
    setVizPresetName("");
  };
  const applyVizPreset = (p) => onUpdateViz({ ...VIZ_DEFAULTS, ...p.config });
  const deleteVizPreset = (id) => persistVizPresets(vizPresets.filter((p) => p.id !== id));
  const exportVizPreset = (p) => {
    const blob = new Blob(
      [JSON.stringify({ name: p.name, savedAt: p.savedAt, config: p.config }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(p.name || "visualizer").replace(/[^\w\s-]/g, "").trim() || "visualizer"}.kodama-visualizer.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleVizImport = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    Promise.all(files.map((f) => f.text())).then((texts) => {
      const imported = [];
      for (const text of texts) {
        try {
          const parsed = JSON.parse(text);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            const cfg = item && (item.config || item);
            if (
              cfg &&
              typeof cfg === "object" &&
              ("shape" in cfg || "barCount" in cfg || "barLength" in cfg)
            ) {
              imported.push({
                id: crypto.randomUUID(),
                name: item.name || t("preset") || "Preset",
                savedAt: new Date().toISOString(),
                config: cfg,
              });
            }
          }
        } catch {
          /* skip malformed files */
        }
      }
      if (imported.length > 0) persistVizPresets([...imported, ...vizPresets]);
    });
  };
  const [debugUnlocked, setDebugUnlocked] = useState(
    () => localStorage.getItem("kiyoshi-debug-unlocked") === "true"
  );
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [debugToast, setDebugToast] = useState(null); // "unlocked" | "already" | null
  const debugTapTimer = useRef(null);
  const handleTauriVersionTap = () => {
    if (debugUnlocked) {
      setDebugToast("already");
      clearTimeout(debugTapTimer.current);
      debugTapTimer.current = setTimeout(() => setDebugToast(null), 1800);
      return;
    }
    setDebugTapCount((n) => {
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
  const [pinEnabled, setPinEnabled] = useState(
    () => localStorage.getItem("kiyoshi-pin-enabled") === "true"
  );
  const [pinVerified, setPinVerified] = useState(
    () => localStorage.getItem("kiyoshi-pin-enabled") !== "true"
  );
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
  const [pinLength, setPinLength] = useState(() =>
    parseInt(localStorage.getItem("kiyoshi-pin-length") || "4", 10)
  );
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
    const hash = await hashPin(input);
    if (hash === stored) {
      setPinVerified(true);
      setPinDigits([]);
      setPinPasswordInput("");
    } else {
      setPinShake(true);
      setPinError(true);
      setPinDigits([]);
      setPinPasswordInput("");
      setTimeout(() => {
        setPinShake(false);
        setPinError(false);
      }, 700);
    }
  };

  const handlePinKey = (key) => {
    if (pinError) return;
    if (key === "del") {
      setPinDigits((d) => d.slice(0, -1));
      return;
    }
    setPinDigits((prev) => {
      if (prev.length >= PIN_LEN) return prev;
      const next = [...prev, key];
      if (next.length === PIN_LEN) setTimeout(() => submitPinEntry(next.join("")), 80);
      return next;
    });
  };

  const handleSetupKey = async (key) => {
    if (key === "del") {
      setPinSetupDigits((d) => d.slice(0, -1));
      setPinSetupError("");
      return;
    }
    setPinSetupDigits((prev) => {
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
    const resetSetupInputs = () => {
      setPinSetupDigits([]);
      setPinSetupPasswordInput("");
    };
    if (step === "current") {
      const hash = await hashPin(input);
      if (hash !== localStorage.getItem("kiyoshi-pin-hash")) {
        setPinSetupError(t("pinWrong"));
        resetSetupInputs();
        return;
      }
      setPinSetup((s) => ({ ...s, step: mode === "disable" ? "done" : "new" }));
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
      setPinSetup((s) => ({ ...s, step: "confirm", first: input }));
      resetSetupInputs();
      setPinSetupError("");
      return;
    }
    if (step === "confirm") {
      if (input !== first) {
        setPinSetupError(t("pinMismatch"));
        resetSetupInputs();
        setPinSetup((s) => ({ ...s, step: "new", first: null }));
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
        <div
          key={i}
          className={cn(
            "w-3.5 h-3.5 rounded-full border-2 transition-colors",
            i < filled ? "bg-primary border-primary" : "border-secondary"
          )}
        />
      ))}
    </div>
  );

  const PinKeypad = ({ onKey }) => (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(3, 68px)" }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, "del", 0, null].map((k, i) => {
        if (k === null) return <div key={i} />;
        return (
          <Button
            key={i}
            variant={k === "del" ? "ghost" : "secondary"}
            onPress={() => onKey(k === "del" ? "del" : k)}
            className="h-[58px] w-full rounded-xl text-t20 font-semibold"
          >
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

  const PasswordEntryInput = ({
    value,
    onChange,
    onSubmit,
    show,
    onToggleShow,
    error,
    autoFocus,
  }) => (
    <div className="flex flex-col items-center gap-3.5">
      <div className="relative w-[260px]">
        <TextFieldRoot aria-label="PIN" value={value} onChange={onChange} className="w-full">
          <InputRoot
            type={show ? "text" : "password"}
            placeholder="••••••••"
            autoFocus={autoFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.length > 0) onSubmit(value);
            }}
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
      {error && (
        <div className="text-t12 font-medium" style={{ color: "#f44336" }}>
          {error}
        </div>
      )}
      <Button
        variant="primary"
        isDisabled={value.length === 0}
        onPress={() => value.length > 0 && onSubmit(value)}
      >
        {t("pinSubmit")}
      </Button>
    </div>
  );

  const navItems = [
    { id: "account", label: t("account"), iconEl: <UserCircle size={18} /> },
    { id: "darstellung", label: t("appearance"), iconEl: <PaintBrushBroad size={18} /> },
    { id: "visualizer", label: t("visualizer"), iconEl: <WaveformLines size={18} /> },
    { id: "wiedergabe", label: t("playback"), iconEl: <Play size={18} /> },
    { id: "lyrics", label: t("lyrics"), iconEl: <ChatText size={18} /> },
    { id: "accessibility", label: t("accessibility"), iconEl: <PersonArmsSpread size={18} /> },
    { id: "connections", label: t("connections"), iconEl: <Link size={18} /> },
    { id: "shortcuts", label: t("shortcuts"), iconEl: <Keyboard size={18} /> },
    { id: "language", label: t("language"), iconEl: <Translate size={18} /> },
    { id: "storage", label: t("storage"), iconEl: <HardDrives size={18} /> },
    { id: "sicherheit", label: t("security"), iconEl: <Lock size={18} /> },
    { id: "overlay", label: t("overlay"), iconEl: <ScreencastSimple size={18} />, badge: "Beta" },
    { id: "experimental", label: t("experimental"), iconEl: <Flask size={18} /> },
    { id: "update", label: t("update"), iconEl: <ArrowsClockwise size={18} /> },
    { id: "about", label: t("about"), iconEl: <Info size={18} /> },
    ...(debugUnlocked ? [{ id: "debug", label: t("debug"), iconEl: <Bug size={18} /> }] : []),
  ];

  const SectionLabel = SettingsSectionLabel;
  const SectionDesc = SettingsSectionDesc;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      {/* ── PIN entry overlay ─────────────────────────────────────────────── */}
      {pinEnabled && !pinVerified && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            borderRadius: 12,
            background: "var(--bg-base)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            animation: anim ? "fadeIn 0.18s ease" : undefined,
          }}
        >
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
            <div style={{ fontSize: "var(--t18)", fontWeight: 700, color: "var(--text-primary)" }}>
              Kodama
            </div>
            <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)" }}>
              {t("pinEnterPrompt")}
            </div>
          </div>

          <div
            style={{
              animation: pinShake ? "pinShake 0.5s ease" : undefined,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
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
                onChange={(v) => {
                  if (!pinError) setPinPasswordInput(v);
                }}
                onSubmit={async (val) => {
                  setPinPasswordInput("");
                  await submitPinEntry(val);
                }}
                show={showPinPassword}
                onToggleShow={() => setShowPinPassword((v) => !v)}
                error={pinError ? t("pinWrong") : ""}
                autoFocus
              />
            )}
          </div>

          {pinType === "pin" && <PinKeypad onKey={handlePinKey} />}

          {/* ── Emergency reset — only visible after 7 secret taps on the lock icon ── */}
          {pinEmergencyConfirm && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                background: "rgba(244,67,54,0.08)",
                border: "0.5px solid rgba(244,67,54,0.3)",
                borderRadius: 12,
                padding: "16px 24px",
                marginTop: 8,
              }}
            >
              <div
                style={{
                  fontSize: "var(--t12)",
                  color: "#f44336",
                  fontWeight: 600,
                  textAlign: "center",
                  maxWidth: 280,
                }}
              >
                {t("pinEmergencyConfirmText")}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
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
                  }}
                >
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            borderRadius: 12,
            background: "color-mix(in srgb, var(--bg-base) 92%, transparent)",
            backdropFilter: "blur(8px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            animation: anim ? "fadeIn 0.18s ease" : undefined,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: "var(--t16)", fontWeight: 700, color: "var(--text-primary)" }}>
              {pinSetup.step === "current"
                ? t("pinEnterCurrent")
                : pinSetup.step === "new"
                  ? t("pinEnterNew")
                  : t("pinConfirmNew")}
            </div>
          </div>

          {/* current step: use stored pinType; new/confirm: use selected pinType */}
          {(pinSetup.step === "current" ? pinType : pinType) === "pin" ? (
            <>
              <PinDots count={PIN_LEN} filled={pinSetupDigits.length} />
              {pinSetupError && (
                <div style={{ fontSize: "var(--t12)", color: "#f44336", fontWeight: 500 }}>
                  {pinSetupError}
                </div>
              )}
              <PinKeypad onKey={handleSetupKey} />
            </>
          ) : (
            <PasswordEntryInput
              value={pinSetupPasswordInput}
              onChange={(v) => {
                setPinSetupPasswordInput(v);
                setPinSetupError("");
              }}
              onSubmit={async (val) => {
                setPinSetupPasswordInput("");
                await advanceSetup(val);
              }}
              show={showSetupPassword}
              onToggleShow={() => setShowSetupPassword((v) => !v)}
              error={pinSetupError}
              autoFocus
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setPinSetup(null);
              setPinSetupDigits([]);
              setPinSetupError("");
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      )}

      {/* Right Content */}
      <div
        style={{
          flex: 1,
          background: "var(--bg-base)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "24px max(32px, calc((100% - 760px) / 2)) 0", flexShrink: 0 }}>
          <div
            style={{
              fontSize: "var(--t20)",
              fontWeight: 700,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {navItems.find((i) => i.id === tab)?.label}
            {navItems.find((i) => i.id === tab)?.badge && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  padding: "3px 8px",
                  borderRadius: 5,
                  background: "var(--accent)",
                  color: "#fff",
                  textTransform: "uppercase",
                }}
              >
                {navItems.find((i) => i.id === tab)?.badge}
              </span>
            )}
          </div>
          <div style={{ height: 1, background: "var(--border)", marginTop: 20 }} />
        </div>

        <div
          ref={contentScrollRef}
          key={tab}
          className="scrollable"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px max(32px, calc((100% - 760px) / 2)) 32px",
            animation: anim ? "fadeSlideIn 0.22s cubic-bezier(0.4,0,0.2,1)" : "none",
          }}
        >
          {tab === "account" && (
            <AccountSettingsTab
              hideUserHandle={hideUserHandle}
              onToggleHideUserHandle={onToggleHideUserHandle}
            />
          )}
          {tab === "visualizer" && (
            <>
              {/* Live preview — reflects the current track + config in real time.
                    Collapsible so the options below are always reachable on short windows. */}
              {vizPreviewOpen ? (
                <div
                  ref={vizPreviewRef}
                  className="mb-4 rounded-xl overflow-hidden border border-border sticky z-10 shrink-0"
                  style={{ height: vizPreviewHReplica, top: -8, background: "var(--bg-base)" }}
                >
                  {vizPreviewTrack?.thumbnail && (
                    <>
                      <div
                        style={{
                          position: "absolute",
                          inset: "-10%",
                          backgroundImage: `url(${thumb(vizPreviewTrack.thumbnail)})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          filter: "blur(56px) saturate(1.4) brightness(0.7)",
                          transform: "scale(1.2)",
                        }}
                      />
                      <div
                        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.42)" }}
                      />
                    </>
                  )}
                  <div style={{ position: "absolute", inset: 0 }}>
                    {vizPreviewTrack ? (
                      <CoverView
                        track={vizPreviewTrack}
                        isPlaying={vizPreviewPlaying}
                        onClose={() => {}}
                        ambientVisualizer
                        coverSize={vizPreviewCover}
                        vizConfig={{
                          ...vizConfig,
                          barLength: (vizConfig.barLength ?? 90) * vizScale,
                          gap: (vizConfig.gap ?? 8) * vizScale,
                          barThickness: Math.max(1, (vizConfig.barThickness ?? 3) * vizScale),
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-t13 text-muted">
                        {t("visualizerPreviewHint") || "Play a song to preview the visualizer"}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={toggleVizPreview}
                    title={t("hidePreview") || "Vorschau einklappen"}
                    className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-full px-2.5 py-1 text-t12 text-white"
                    style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
                  >
                    <EyeSlash size={14} />
                    <CaretUp size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={toggleVizPreview}
                  className="mb-4 w-full flex items-center justify-center gap-2 rounded-xl border border-border text-t13 text-secondary hover:bg-hover transition-colors"
                  style={{ height: 44 }}
                >
                  <Eye size={16} />
                  {t("showPreview") || "Vorschau anzeigen"}
                  <CaretDown size={13} />
                </button>
              )}
              {/* Presets — save / apply / import / export named visualizer configs. */}
              <div className="mb-5">
                <div
                  className="text-t13 font-semibold mb-2.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t("visualizerPresets") || "Presets"}
                </div>
                <div className="flex gap-2 items-center mb-2">
                  <input
                    value={vizPresetName}
                    onChange={(e) => setVizPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveVizPreset();
                    }}
                    placeholder={t("presetNamePlaceholder") || "Preset benennen…"}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 34,
                      padding: "0 12px",
                      borderRadius: 8,
                      fontSize: "var(--t13)",
                      color: "var(--text-primary)",
                      background: "var(--bg-elevated)",
                      border: "0.5px solid var(--border)",
                      outline: "none",
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onPress={saveVizPreset}
                  >
                    {t("save") || "Speichern"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onPress={() => vizImportRef.current?.click()}
                  >
                    <DownloadSimple size={13} className="rotate-180" />
                    {t("import") || "Importieren"}
                  </Button>
                  <input
                    ref={vizImportRef}
                    type="file"
                    accept=".json"
                    multiple
                    className="hidden"
                    onChange={handleVizImport}
                  />
                </div>
                {vizPresets.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {vizPresets.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-lg"
                        style={{ background: "var(--bg-elevated)" }}
                      >
                        <button
                          className="flex-1 min-w-0 text-left text-t13 font-medium truncate hover:text-accent transition-colors"
                          onClick={() => applyVizPreset(p)}
                        >
                          {p.name}
                        </button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          className="h-7! w-7! min-w-0!"
                          onPress={() => exportVizPreset(p)}
                          title={t("export") || "Exportieren"}
                        >
                          <DownloadSimple size={13} />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          className="h-7! w-7! min-w-0! text-muted hover:text-[#f44336]"
                          onPress={() => deleteVizPreset(p.id)}
                          title={t("delete") || "Löschen"}
                        >
                          <Trash size={13} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <SettingRow
                label={t("visualizer")}
                description={t("visualizerDesc")}
                icon={<WaveformLines />}
              >
                <Toggle value={ambientVisualizer} onChange={onToggleAmbientVisualizer} />
              </SettingRow>
              <SettingRow
                label={t("instrumentalViz") || "Instrumental cover"}
                description={
                  t("instrumentalVizDesc") ||
                  "Show the cover + visualizer during instrumental passages in the lyrics view"
                }
                icon={<MusicNote />}
              >
                <Toggle value={instrumentalViz} onChange={onToggleInstrumentalViz} />
              </SettingRow>
              <SettingRow label={t("visualizerShape") || "Shape"} icon={<WaveformLines />}>
                <div className="flex gap-1.5">
                  <Button
                    variant={vizConfig.shape === "frame" ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onUpdateViz({ shape: "frame" })}
                  >
                    {t("visualizerFrame") || "Frame"}
                  </Button>
                  <Button
                    variant={vizConfig.shape === "ring" ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onUpdateViz({ shape: "ring" })}
                  >
                    {t("visualizerRing") || "Ring"}
                  </Button>
                  <Button
                    variant={vizConfig.shape === "linear" ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onUpdateViz({ shape: "linear" })}
                  >
                    {t("visualizerLinear") || "Linear"}
                  </Button>
                </div>
              </SettingRow>
              {vizConfig.shape === "linear" && (
                <SettingRow
                  label={t("visualizerPlacement") || "Placement"}
                  icon={<WaveformLines />}
                >
                  <div className="flex gap-1.5">
                    <Button
                      variant={
                        (vizConfig.linearPos || "bottom") === "bottom" ? "secondary" : "ghost"
                      }
                      size="sm"
                      onPress={() => onUpdateViz({ linearPos: "bottom" })}
                    >
                      {t("visualizerPosBottom") || "Bottom"}
                    </Button>
                    <Button
                      variant={vizConfig.linearPos === "center" ? "secondary" : "ghost"}
                      size="sm"
                      onPress={() => onUpdateViz({ linearPos: "center" })}
                    >
                      {t("visualizerPosCenter") || "Behind cover"}
                    </Button>
                  </div>
                </SettingRow>
              )}
              <SettingRow label={t("visualizerMirror") || "Mirror"} icon={<WaveformLines />}>
                <Toggle value={!!vizConfig.mirror} onChange={(v) => onUpdateViz({ mirror: v })} />
              </SettingRow>
              <SettingRow label={t("visualizerBars") || "Bars"} icon={<WaveformLines />}>
                <Slider
                  min={8}
                  max={160}
                  step={2}
                  value={vizConfig.barCount}
                  onChange={(v) => onUpdateViz({ barCount: v })}
                  width={200}
                />
              </SettingRow>
              <SettingRow label={t("visualizerLength") || "Bar length"} icon={<WaveformLines />}>
                <Slider
                  min={8}
                  max={260}
                  step={4}
                  value={vizConfig.barLength}
                  onChange={(v) => onUpdateViz({ barLength: v })}
                  width={200}
                />
              </SettingRow>
              <SettingRow
                label={t("visualizerThickness") || "Bar thickness"}
                icon={<WaveformLines />}
              >
                <Slider
                  min={1}
                  max={16}
                  step={1}
                  value={vizConfig.barThickness}
                  onChange={(v) => onUpdateViz({ barThickness: v })}
                  width={200}
                />
              </SettingRow>
              <SettingRow
                label={
                  vizConfig.shape === "linear"
                    ? t("visualizerGapBottom") || "Gap from bottom"
                    : t("visualizerGap") || "Gap"
                }
                icon={<WaveformLines />}
              >
                <Slider
                  min={0}
                  max={80}
                  step={2}
                  value={vizConfig.gap}
                  onChange={(v) => onUpdateViz({ gap: v })}
                  width={200}
                />
              </SettingRow>
              <SettingRow
                label={t("visualizerResponse") || "Responsiveness"}
                icon={<WaveformLines />}
              >
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((vizConfig.responsiveness ?? 0.75) * 100)}
                  onChange={(v) => onUpdateViz({ responsiveness: v / 100 })}
                  width={200}
                />
              </SettingRow>
              <SettingRow
                label={t("visualizerFloor") || "Floor"}
                description={t("visualizerFloorDesc")}
                icon={<WaveformLines />}
              >
                <Slider
                  min={0}
                  max={90}
                  step={2}
                  value={Math.round((vizConfig.floor ?? 0) * 100)}
                  onChange={(v) => onUpdateViz({ floor: v / 100 })}
                  width={200}
                />
              </SettingRow>
              <SettingRow label={t("visualizerCeiling") || "Ceiling"} icon={<WaveformLines />}>
                <Slider
                  min={10}
                  max={100}
                  step={2}
                  value={Math.round((vizConfig.ceiling ?? 1) * 100)}
                  onChange={(v) => onUpdateViz({ ceiling: v / 100 })}
                  width={200}
                />
              </SettingRow>
              <SettingRow
                label={t("visualizerTilt") || "Tilt (boost highs)"}
                icon={<WaveformLines />}
              >
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((vizConfig.tilt ?? 0) * 100)}
                  onChange={(v) => onUpdateViz({ tilt: v / 100 })}
                  width={200}
                />
              </SettingRow>
              <SettingRow
                label={t("visualizerBandSmooth") || "Band smoothing"}
                icon={<WaveformLines />}
              >
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((vizConfig.smoothBands ?? 0) * 100)}
                  onChange={(v) => onUpdateViz({ smoothBands: v / 100 })}
                  width={200}
                />
              </SettingRow>
              <SettingRow label={t("visualizerRender") || "Render mode"} icon={<WaveformLines />}>
                <div className="flex gap-1.5">
                  <Button
                    variant={(vizConfig.render || "bars") === "bars" ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onUpdateViz({ render: "bars" })}
                  >
                    {t("visualizerBarsMode") || "Bars"}
                  </Button>
                  <Button
                    variant={vizConfig.render === "curve" ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onUpdateViz({ render: "curve" })}
                  >
                    {t("visualizerCurve") || "Curve"}
                  </Button>
                </div>
              </SettingRow>
              <SettingRow label={t("visualizerPeakHold") || "Peak hold"} icon={<WaveformLines />}>
                <Toggle
                  value={!!vizConfig.peakHold}
                  onChange={(v) => onUpdateViz({ peakHold: v })}
                />
              </SettingRow>
              <SettingRow label={t("visualizerColor") || "Color"} icon={<PaintBrushBroad />}>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={vizConfig.color === "accent" ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onUpdateViz({ color: "accent" })}
                  >
                    {t("accent") || "Accent"}
                  </Button>
                  <Button
                    variant={vizConfig.color === "cover" ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onUpdateViz({ color: "cover" })}
                  >
                    {t("visualizerCover") || "Cover"}
                  </Button>
                  <Button
                    variant={vizConfig.color === "custom" ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onUpdateViz({ color: "custom" })}
                  >
                    {t("custom") || "Custom"}
                  </Button>
                  {vizConfig.color === "custom" && (
                    <input
                      type="color"
                      value={vizConfig.customColor || "#e040fb"}
                      onChange={(e) => onUpdateViz({ customColor: e.target.value })}
                      className="w-7 h-7 rounded-md cursor-pointer border border-border bg-transparent p-0.5 shrink-0"
                    />
                  )}
                </div>
              </SettingRow>
              <SettingRow
                label={t("visualizerGradient") || "Gradient"}
                description={t("visualizerGradientDesc")}
                icon={<PaintBrushBroad />}
              >
                <div className="flex items-center gap-2">
                  {vizConfig.gradient && (
                    <input
                      type="color"
                      value={vizConfig.gradColor || "#ffffff"}
                      onChange={(e) => onUpdateViz({ gradColor: e.target.value })}
                      className="w-7 h-7 rounded-md cursor-pointer border border-border bg-transparent p-0.5 shrink-0"
                    />
                  )}
                  <Toggle
                    value={!!vizConfig.gradient}
                    onChange={(v) => onUpdateViz({ gradient: v })}
                  />
                </div>
              </SettingRow>
              <SettingRow label={t("coverPulse") || "Cover pulse"} icon={<Sparkles />}>
                <Toggle
                  value={vizConfig.coverPulse !== false}
                  onChange={(v) => onUpdateViz({ coverPulse: v })}
                />
              </SettingRow>
              {vizConfig.coverPulse !== false && (
                <SettingRow label={t("coverPulseStrength") || "Pulse strength"} icon={<Sparkles />}>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((vizConfig.coverPulseStrength ?? 0.3) * 100)}
                    onChange={(v) => onUpdateViz({ coverPulseStrength: v / 100 })}
                    width={200}
                  />
                </SettingRow>
              )}
              <SettingRow label={t("visualizerBlobs") || "Ambient blobs"} icon={<Sparkles />}>
                <Toggle
                  value={vizConfig.blobs !== false}
                  onChange={(v) => onUpdateViz({ blobs: v })}
                />
              </SettingRow>
              <div className="flex justify-end mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  onPress={() => onUpdateViz({ ...VIZ_DEFAULTS })}
                >
                  <ArrowClockwise size={13} /> {t("resetToDefault") || "Auf Standard zurücksetzen"}
                </Button>
              </div>
            </>
          )}

          {tab === "darstellung" && (
            <>
              <div
                id="set-sec-ap-theme"
                data-settings-section="ap-theme"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel>{t("theme")}</SectionLabel>
                <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                  {[
                    {
                      id: "dark",
                      label: t("themeDark"),
                      bg: "#0d0d0d",
                      surface: "#141414",
                      elevated: "#1c1c1c",
                      text: "#f0f0f0",
                    },
                    {
                      id: "oled",
                      label: t("themeOled"),
                      bg: "#000000",
                      surface: "#080808",
                      elevated: "#0f0f0f",
                      text: "#ffffff",
                    },
                    {
                      id: "light",
                      label: t("themeLight"),
                      bg: "#f0f0f0",
                      surface: "#ffffff",
                      elevated: "#e4e4e4",
                      text: "#111111",
                    },
                  ].map((th) => (
                  <CardRoot
                    key={th.id}
                    data-testid={`theme-${th.id}`}
                      onClick={() => onThemeChange(th.id)}
                      variant="transparent"
                      className={cn(
                        "relative flex-1 p-0 gap-0 rounded-[10px] overflow-hidden cursor-default border-2",
                        anim && "transition-transform",
                        theme === th.id
                          ? "border-accent shadow-[0_0_0_2px_var(--accent)]"
                          : "border-border",
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
                        <div
                          style={{
                            background: th.surface,
                            borderRadius: 6,
                            padding: "6px 8px",
                            marginBottom: 5,
                          }}
                        >
                          <div
                            style={{
                              width: "60%",
                              height: 5,
                              borderRadius: 3,
                              background: accent,
                              marginBottom: 4,
                            }}
                          />
                          <div
                            style={{
                              width: "40%",
                              height: 4,
                              borderRadius: 3,
                              background: th.text,
                              opacity: 0.3,
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <div
                            style={{
                              flex: 1,
                              background: th.elevated,
                              borderRadius: 4,
                              height: 24,
                            }}
                          />
                          <div
                            style={{
                              flex: 1,
                              background: th.elevated,
                              borderRadius: 4,
                              height: 24,
                            }}
                          />
                        </div>
                      </div>
                      {/* Label */}
                      <div
                        style={{
                          background: th.surface,
                          padding: "7px 10px",
                          fontSize: "var(--t12)",
                          fontWeight: 500,
                          color: theme === th.id ? accent : th.text,
                          textAlign: "center",
                          borderTop: `1px solid ${th.id === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.06)"}`,
                        }}
                      >
                        {th.label}
                      </div>
                    </CardRoot>
                  ))}
                </div>
              </div>

              <div
                id="set-sec-ap-icon"
                data-settings-section="ap-icon"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {t("appIcon")}
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        background: "var(--accent)",
                        color: "#fff",
                        padding: "2px 5px",
                        borderRadius: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      Beta
                    </span>
                  </span>
                </SectionLabel>
                <div
                  style={{
                    fontSize: "var(--t11)",
                    color: "var(--text-muted)",
                    margin: "-2px 0 10px",
                    paddingLeft: 2,
                  }}
                >
                  {t("appIconDesc")}
                </div>
                {APP_ICON_GROUPS.map((group) => (
                  <div key={group.id} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: "var(--t11)",
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        marginBottom: 7,
                      }}
                    >
                      {t(group.labelKey)}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {group.icons.map((ic) => {
                        const selected = appIcon === ic.file;
                        return (
                          <button
                            key={ic.file}
                            onClick={() => onAppIconChange?.(ic.file)}
                            title={ic.label}
                            className={cn(
                              "relative p-0 rounded-[14px] overflow-hidden cursor-default border-2 aspect-square bg-transparent",
                              anim && "transition-transform hover:scale-[1.05]",
                              selected
                                ? "border-accent shadow-[0_0_0_2px_var(--accent)]"
                                : "border-transparent"
                            )}
                          >
                            <img
                              src={`/App-Icons/${encodeURIComponent(ic.file)}`}
                              alt={ic.label}
                              draggable={false}
                              className="w-full h-full object-cover block"
                            />
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
              </div>

              <div
                id="set-sec-ap-colors"
                data-settings-section="ap-colors"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel>{t("apColors")}</SectionLabel>
                <div className="flex gap-1.5 mb-3">
                  <Button
                    variant={!accentDynamic ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onAccentDynamicChange(false)}
                  >
                    {t("accentCustom") || "Custom"}
                  </Button>
                  <Button
                    variant={accentDynamic ? "secondary" : "ghost"}
                    size="sm"
                    onPress={() => onAccentDynamicChange(true)}
                  >
                    {t("visualizerDynamic") || "Dynamic"}
                  </Button>
                </div>
                {accentDynamic ? (
                  <>
                    <div
                      className="flex items-center gap-3 mb-2 rounded-xl border border-border px-4 py-3.5"
                      style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}
                    >
                      <span
                        className="w-8 h-8 rounded-full shrink-0"
                        style={{
                          background: "var(--accent)",
                          boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)",
                        }}
                      />
                      <span style={{ fontSize: "var(--t13)", color: "var(--text-secondary)" }}>
                        {t("accentDynamicDesc") ||
                          "The accent colour is derived live from the current track's cover art."}
                      </span>
                    </div>
                    <SettingRow
                      label={t("accentVibrancy") || "Vibrancy"}
                      icon={<PaintBrushBroad />}
                    >
                      <Slider
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round((accentSat ?? 0.5) * 100)}
                        onChange={(v) => onAccentSatChange(v / 100)}
                        width={200}
                      />
                    </SettingRow>
                    <SettingRow label={t("accentBrightness") || "Brightness"} icon={<Sparkles />}>
                      <Slider
                        min={30}
                        max={85}
                        step={5}
                        value={Math.round((accentLight ?? 0.6) * 100)}
                        onChange={(v) => onAccentLightChange(v / 100)}
                        width={200}
                      />
                    </SettingRow>
                  </>
                ) : (
                  <AccentColorPicker value={accent} onChange={onAccentChange} />
                )}
              </div>

              <div
                id="set-sec-ap-others"
                data-settings-section="ap-others"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel>{t("apOthers")}</SectionLabel>
                <SettingRow
                  label={t("animations")}
                  description={t("animationsDesc")}
                  icon={<Sparkles />}
                >
                  <Toggle value={animations} onChange={onAnimationsChange} />
                </SettingRow>
                <SettingRow
                  label={t("uiZoom")}
                  description={t("uiZoomDesc")}
                  icon={<MagnifyingGlass />}
                >
                  <div style={{ width: 360 }}>
                    <Slider
                      min={0}
                      max={ZOOM_STEPS.length - 1}
                      step={1}
                      value={Math.max(0, ZOOM_STEPS.indexOf(uiZoom))}
                      onChange={(i) => onUiZoomChange(ZOOM_STEPS[i])}
                      width={360}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      {ZOOM_LABELS.map((label, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "var(--t10)",
                            fontWeight: uiZoom === ZOOM_STEPS[i] ? 700 : 400,
                            color: uiZoom === ZOOM_STEPS[i] ? "var(--accent)" : "var(--text-muted)",
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </SettingRow>
                <SettingRow
                  label={t("fontSize")}
                  description={t("fontSizeDesc")}
                  icon={<TextSize />}
                >
                  <div style={{ width: 360 }}>
                    <Slider
                      min={0}
                      max={FONT_STEPS.length - 1}
                      step={1}
                      value={Math.max(0, FONT_STEPS.indexOf(appFontScale))}
                      onChange={(i) => onFontScaleChange(FONT_STEPS[i])}
                      width={360}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      {FONT_LABELS.map((label, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "var(--t10)",
                            fontWeight: appFontScale === FONT_STEPS[i] ? 700 : 400,
                            color:
                              appFontScale === FONT_STEPS[i]
                                ? "var(--accent)"
                                : "var(--text-muted)",
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </SettingRow>
              </div>
            </>
          )}

          {tab === "wiedergabe" && (
            <>
              <SectionLabel>{t("general")}</SectionLabel>
              <SettingRow
                label={t("autoplay")}
                description={t("autoplayDesc")}
                icon={<PlayCircle />}
              >
                <Toggle value={autoplay} onChange={onAutoplayChange} />
              </SettingRow>
              <SettingRow
                label={t("progressivePlayback") || "Progressives Laden"}
                description={
                  t("progressivePlaybackDesc") ||
                  "Schnellerer Start: streamt den Song statt ihn erst komplett herunterzuladen. Aus = klassisch (lädt vollständig, stabiler auf schwachen Geräten)."
                }
                icon={<WaveformLines />}
              >
                <Toggle value={playbackProgressive} onChange={onPlaybackProgressiveChange} />
              </SettingRow>
              <SettingRow
                label={
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t("crossfade")}
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        background: "var(--accent)",
                        color: "#fff",
                        padding: "2px 5px",
                        borderRadius: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      Beta
                    </span>
                  </span>
                }
                description={`${t("crossfadeDesc")}: ${crossfade}s`}
                icon={<Sliders />}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Slider
                    min={0}
                    max={12}
                    step={1}
                    value={crossfade}
                    onChange={onCrossfadeChange}
                    width={120}
                  />
                  <span
                    style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", width: 28 }}
                  >
                    {crossfade}s
                  </span>
                </div>
              </SettingRow>
              <div
                style={{
                  fontSize: "var(--t11)",
                  color: "var(--text-muted)",
                  margin: "-2px 0 6px",
                  paddingLeft: 2,
                }}
              >
                {t("customCrossfadesDesc")}
              </div>
              {Object.keys(crossfadeOverrides).length > 0 && (
                <div
                  style={{
                    margin: "2px 0 6px",
                    padding: "10px 12px",
                    background: "var(--fill-subtle)",
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{ fontSize: "var(--t11)", color: "var(--text-muted)", marginBottom: 8 }}
                  >
                    {t("customCrossfadesTitle")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(crossfadeOverrides).map(([key, ov]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: "var(--t12)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ov.fromTitle || key.split("__")[0]}
                          </span>
                          <span style={{ color: "var(--accent)", fontWeight: 700 }}>→</span>
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ov.toTitle || key.split("__")[1]}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: "var(--t11)",
                            fontWeight: 700,
                            color: "var(--accent)",
                            width: 30,
                            textAlign: "right",
                          }}
                        >
                          {ov.secs}s
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          className="h-7 min-w-7 text-muted hover:text-[#ff7070]!"
                          onPress={() => onRemoveCrossfadeOverride?.(key)}
                        >
                          <Trash size={13} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <SettingRow
                label={t("hideExplicit")}
                description={t("hideExplicitDesc")}
                icon={<EyeSlash />}
              >
                <Toggle value={hideExplicit} onChange={onHideExplicitChange} />
              </SettingRow>
              <SettingRow
                label={t("trackNumbers")}
                description={t("trackNumbersDesc")}
                icon={
                  <i className="fa-solid fa-list-ol" style={{ fontSize: 15 }} aria-hidden="true" />
                }
              >
                <Toggle value={showTrackNumbers} onChange={onTrackNumbersChange} />
              </SettingRow>
              <SettingRow
                label={t("anonStats")}
                description={t("anonStatsDesc")}
                icon={
                  <i
                    className="fa-solid fa-chart-simple"
                    style={{ fontSize: 15 }}
                    aria-hidden="true"
                  />
                }
              >
                <Toggle value={anonStats} onChange={onAnonStatsChange} />
              </SettingRow>
            </>
          )}

          {tab === "connections" && (
            <>
              <SettingRow
                label={t("discordRpc")}
                description={t("discordRpcDesc")}
                icon={<ShareNodes />}
              >
                <Toggle value={discordRpc} onChange={onDiscordRpcChange} />
              </SettingRow>
              <SettingRow
                label={t("ipv4First")}
                description={t("ipv4FirstDesc")}
                icon={<WifiHigh />}
              >
                <Toggle value={ipv4First} onChange={onIpv4FirstChange} />
              </SettingRow>
              <LastfmRow />
              <SettingRow
                label={
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t("remoteControl")}
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        background: "var(--accent)",
                        color: "#fff",
                        padding: "2px 5px",
                        borderRadius: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      Beta
                    </span>
                  </span>
                }
                description={t("remoteControlDesc")}
                icon={<DeviceMobile />}
              >
                <Toggle value={remoteEnabled} onChange={onToggleRemote} />
              </SettingRow>
              {remoteEnabled && (
                <RemoteControlPanel
                  devices={remoteDevices}
                  onDevice={onRemoteDevice}
                  onPair={onPairDevice}
                  trustedIds={remoteTrustedIds}
                  onRemember={onRememberDevice}
                />
              )}
            </>
          )}

          {tab === "lyrics" && (
            <>
              <div
                id="set-sec-lyrics-visual"
                data-settings-section="lyrics-visual"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel style={{ marginTop: 4 }}>{t("lyrVisual")}</SectionLabel>
                <SettingRow
                  label={t("fontSize")}
                  description={`${t("fontSizeDesc")}: ${lyricsFontSize}px`}
                  icon={<TextSize />}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Slider
                      min={18}
                      max={52}
                      step={2}
                      value={lyricsFontSize}
                      onChange={onLyricsFontSizeChange}
                      width={120}
                    />
                    <span
                      style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", width: 36 }}
                    >
                      {lyricsFontSize}px
                    </span>
                  </div>
                </SettingRow>
                <SettingRow
                  label={t("translationFontSize")}
                  description={`${t("fontSizeDesc")}: ${lyricsTranslationFontSize}px`}
                  icon={<Translate />}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Slider
                      min={12}
                      max={40}
                      step={2}
                      value={lyricsTranslationFontSize}
                      onChange={onLyricsTranslationFontSizeChange}
                      width={120}
                    />
                    <span
                      style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", width: 36 }}
                    >
                      {lyricsTranslationFontSize}px
                    </span>
                  </div>
                </SettingRow>
                <SettingRow
                  label={t("romajiFontSize")}
                  description={`${t("fontSizeDesc")}: ${lyricsRomajiFontSize}px`}
                  icon={<TextSize />}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Slider
                      min={12}
                      max={40}
                      step={2}
                      value={lyricsRomajiFontSize}
                      onChange={onLyricsRomajiFontSizeChange}
                      width={120}
                    />
                    <span
                      style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", width: 36 }}
                    >
                      {lyricsRomajiFontSize}px
                    </span>
                  </div>
                </SettingRow>
                <SettingRow
                  label={t("showRomaji")}
                  description={t("romajiLyrics")}
                  icon={<Globe />}
                >
                  <Toggle value={showRomaji} onChange={onToggleRomaji} />
                </SettingRow>
                <SettingRow
                  label={t("showAgentTags")}
                  description={t("showAgentTagsDesc")}
                  icon={<Tag />}
                >
                  <Toggle value={showAgentTags} onChange={onToggleAgentTags} />
                </SettingRow>
              </div>

              <div
                id="set-sec-lyrics-effects"
                data-settings-section="lyrics-effects"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel>{t("lyrEffects")}</SectionLabel>
                <SettingRow
                  label={t("syllableZoom")}
                  description={t("syllableZoomDesc")}
                  icon={<Sparkles />}
                >
                  <Toggle value={syllableZoom} onChange={onToggleSyllableZoom} />
                </SettingRow>
                <SettingRow
                  label={t("fluidLyrics")}
                  description={t("fluidLyricsDesc")}
                  icon={<WaveformLines />}
                >
                  <Toggle value={fluidLyrics} onChange={onToggleFluidLyrics} />
                </SettingRow>
              </div>

              <div
                id="set-sec-lyrics-providers"
                data-settings-section="lyrics-providers"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel>{t("lyricsProviders")}</SectionLabel>
                <SectionDesc>{t("lyricsProvidersDesc")}</SectionDesc>
                <LyricsProviderList
                  providers={lyricsProviders || DEFAULT_LYRICS_PROVIDERS}
                  onChange={onLyricsProvidersChange}
                />
              </div>

              <div
                id="set-sec-lyrics-unison"
                data-settings-section="lyrics-unison"
                style={{ scrollMarginTop: 8 }}
              >
                <UnisonIdentitySection />
              </div>

              <div
                id="set-sec-lyrics-composer"
                data-settings-section="lyrics-composer"
                style={{ scrollMarginTop: 8 }}
              >
                <ComposerSettingsSection />
              </div>
            </>
          )}

          {tab === "accessibility" && (
            <>
              <div
                id="set-sec-acc-visual"
                data-settings-section="acc-visual"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel style={{ marginTop: 4 }}>{t("accVisual")}</SectionLabel>
                <SettingRow
                  label={t("highContrast")}
                  description={t("highContrastDesc")}
                  icon={<CircleHalf />}
                >
                  <Toggle value={highContrast} onChange={onToggleHighContrast} />
                </SettingRow>
                <SettingRow
                  label={t("ambientBackground")}
                  description={t("ambientBackgroundDesc")}
                  icon={<Sparkles />}
                >
                  <Toggle value={ambientBackground} onChange={onToggleAmbientBackground} />
                </SettingRow>

                <SectionLabel>{t("appFont")}</SectionLabel>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      id: "default",
                      label: t("appFontDefault"),
                      font: "'MiSans Latin', system-ui, sans-serif",
                    },
                    {
                      id: "dyslexic",
                      label: t("appFontDyslexic"),
                      font: "'OpenDyslexic', system-ui, sans-serif",
                    },
                  ].map((f) => (
                    <CardRoot
                      key={f.id}
                      onClick={() => onAppFontChange(f.id)}
                      variant="secondary"
                      className={cn(
                        "flex flex-row items-center justify-between gap-3 px-4 py-3.5 cursor-default border-2 transition-colors",
                        appFont === f.id
                          ? "border-accent bg-accent-dim"
                          : "border-transparent bg-surface-1 hover:bg-hover"
                      )}
                    >
                      <div>
                        <div
                          className="text-t13 font-semibold text-primary mb-0.5"
                          style={{ fontFamily: f.font }}
                        >
                          {f.label}
                        </div>
                        <div className="text-t12 text-muted" style={{ fontFamily: f.font }}>
                          {language === "de"
                            ? "Franz jagt im komplett verwahrlosten Taxi quer durch Bayern"
                            : "The quick brown fox jumps over the lazy dog"}
                        </div>
                      </div>
                      {appFont === f.id && (
                        <Check size={16} className="text-accent shrink-0 ml-3" />
                      )}
                    </CardRoot>
                  ))}
                </div>
              </div>

              <div
                id="set-sec-acc-behaviour"
                data-settings-section="acc-behaviour"
                style={{ scrollMarginTop: 8 }}
              >
                <SectionLabel style={{ marginTop: 4 }}>{t("behaviour")}</SectionLabel>
                <SettingRow label={t("closeTray")} description={t("closeTrayDesc")} icon={<X />}>
                  <Toggle value={closeTray} onChange={onCloseTrayChange} />
                </SettingRow>
              </div>
            </>
          )}

          {tab === "shortcuts" &&
            (() => {
              const SHORTCUT_ACTIONS = [
                { id: "playPause", label: t("scPlayPause") },
                { id: "nextTrack", label: t("scNext") },
                { id: "prevTrack", label: t("scPrev") },
                { id: "volUp", label: t("scVolUp") },
                { id: "volDown", label: t("scVolDown") },
                { id: "fullscreen", label: t("scFullscreen") },
                { id: "mute", label: t("scMute") },
                { id: "lyrics", label: t("scToggleLyrics") },
                { id: "seekBack", label: t("scSeekBack") },
                { id: "seekForward", label: t("scSeekForward") },
                { id: "zoomIn", label: t("scZoomIn") },
                { id: "zoomOut", label: t("scZoomOut") },
              ];
              // Find conflict: which action uses the given code (excluding the one being checked)
              const conflictFor = (code, excludeId) =>
                SHORTCUT_ACTIONS.find((a) => a.id !== excludeId && customShortcuts[a.id] === code)
                  ?.label;

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
                            isRecording
                              ? "border-accent"
                              : conflict
                                ? "border-[rgba(255,100,100,0.45)]"
                                : "border-transparent"
                          )}
                        >
                          <span className="text-t13 text-secondary">{label}</span>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {isRecording ? (
                              <span className="text-t12 text-accent italic min-w-[100px] text-right">
                                {t("scRecording")}
                              </span>
                            ) : displayKey === "—" ? (
                              <span className="text-t14 font-semibold text-muted px-2">—</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                {displayKey.split("+").map((part, ki) => (
                                  <KbdRoot
                                    key={ki}
                                    style={{ fontFamily: "var(--font)" }}
                                    className={cn(
                                      "text-t14 h-7 px-2.5 min-w-[30px] justify-center bg-surface-2!",
                                      conflict ? "text-[rgb(255,130,130)]!" : "text-primary!"
                                    )}
                                  >
                                    <KbdContent>{part}</KbdContent>
                                  </KbdRoot>
                                ))}
                              </div>
                            )}
                            {!fixed && (
                              <Button
                                variant={isRecording ? "primary" : "ghost"}
                                size="sm"
                                isIconOnly
                                onPress={() => setRecordingShortcut(isRecording ? null : id)}
                                title={isRecording ? t("scCancelRecord") : t("scRecordBtn")}
                              >
                                {isRecording ? <X size={14} /> : <PencilSimple size={14} />}
                              </Button>
                            )}
                            {!fixed &&
                              customShortcuts[id] !== DEFAULT_SHORTCUTS[id] &&
                              !isRecording && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  isIconOnly
                                  className="text-muted"
                                  onPress={() => resetShortcut(id)}
                                  title={t("scResetShortcut")}
                                >
                                  <ArrowClockwise size={14} />
                                </Button>
                              )}
                          </div>
                        </CardRoot>
                      );
                    })}
                  </div>
                  <SectionDesc style={{ margin: "16px 0 0 2px" }}>{t("shortcutsNote")}</SectionDesc>
                  {Object.entries(customShortcuts).some(
                    ([k, v]) => DEFAULT_SHORTCUTS[k] && v !== DEFAULT_SHORTCUTS[k]
                  ) && (
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          onResetShortcuts?.({ ...DEFAULT_SHORTCUTS });
                          localStorage.setItem("kiyoshi-shortcuts", "{}");
                        }}
                      >
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
                    {["pin", "password"].map((type) => (
                      <Button
                        key={type}
                        variant={pinType === type ? "primary" : "ghost"}
                        size="sm"
                        onPress={() => {
                          setPinType(type);
                          localStorage.setItem("kiyoshi-pin-type", type);
                        }}
                      >
                        {t(type === "pin" ? "pinTypePin" : "pinTypePassword")}
                      </Button>
                    ))}
                  </div>
                </SettingRow>
              )}

              {/* PIN length selector — only when type is "pin" and not yet enabled */}
              {!pinEnabled && pinType === "pin" && (
                <SettingRow
                  label={t("pinLengthLabel")}
                  description={t("pinLengthDesc")}
                  icon={<Key />}
                >
                  <div className="flex gap-1.5">
                    {[4, 6].map((len) => (
                      <Button
                        key={len}
                        variant={pinLength === len ? "primary" : "ghost"}
                        size="sm"
                        onPress={() => {
                          setPinLength(len);
                          localStorage.setItem("kiyoshi-pin-length", String(len));
                        }}
                      >
                        {len}-{t("pinDigits")}
                      </Button>
                    ))}
                  </div>
                </SettingRow>
              )}

              <SettingRow
                label={t("pinProtectionLabel")}
                description={
                  pinEnabled
                    ? `${t("pinProtectionDesc")} · ${t(pinType === "pin" ? "pinTypePin" : "pinTypePassword")}${pinType === "pin" ? ` (${pinLength}-${t("pinDigits")})` : ""}`
                    : t("pinProtectionDesc")
                }
                icon={pinEnabled ? <Lock /> : <LockOpen />}
              >
                <Toggle
                  value={pinEnabled}
                  onChange={() => {
                    if (!pinEnabled) {
                      setPinSetup({ mode: "enable", step: "new", first: null });
                      setPinSetupDigits([]);
                      setPinSetupPasswordInput("");
                      setPinSetupError("");
                    } else {
                      setPinSetup({ mode: "disable", step: "current", first: null });
                      setPinSetupDigits([]);
                      setPinSetupPasswordInput("");
                      setPinSetupError("");
                    }
                  }}
                />
              </SettingRow>

              {pinEnabled && (
                <SettingRow label={t("pinChange")} description={t("pinChangeDesc")} icon={<Lock />}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      setPinSetup({ mode: "change", step: "current", first: null });
                      setPinSetupDigits([]);
                      setPinSetupPasswordInput("");
                      setPinSetupError("");
                    }}
                  >
                    {t("pinChange")}
                  </Button>
                </SettingRow>
              )}

              <SectionLabel style={{ marginTop: 24 }}>{t("pinEmergency")}</SectionLabel>
              <CardRoot
                variant="secondary"
                className="px-4 py-3.5 gap-0! text-t12 text-muted leading-[1.7]"
                style={{ background: "rgba(244,67,54,0.06)" }}
              >
                <div style={{ marginBottom: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
                  {t("pinEmergencyDesc")}
                </div>
                {!pinEmergencyConfirm ? (
                  <Button
                    variant="danger-soft"
                    size="sm"
                    onPress={() => setPinEmergencyConfirm(true)}
                  >
                    {t("pinEmergencyReset")}
                  </Button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ color: "#f44336", fontWeight: 600, fontSize: "var(--t12)" }}>
                      {t("pinEmergencyConfirmText")}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
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
                        }}
                      >
                        {t("pinEmergencyConfirm")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setPinEmergencyConfirm(false)}
                      >
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
                {LANGUAGES.map((lang) => {
                  const pct = translationProgress(lang.code);
                  return (
                    <CardRoot
                      key={lang.code}
                      data-testid={`settings-language-${lang.code}`}
                      onClick={() => onLanguageChange(lang.code)}
                      variant="secondary"
                      className={cn(
                        "flex flex-row items-center gap-3.5 px-4 py-3 cursor-default border-2 transition-colors",
                        language === lang.code
                          ? "border-accent bg-accent-dim"
                          : "border-transparent bg-surface-1 hover:bg-hover"
                      )}
                    >
                      <div
                        dangerouslySetInnerHTML={{ __html: lang.flag }}
                        className="w-12 h-[30px] shrink-0 rounded overflow-hidden border border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            "text-t13 font-medium",
                            language === lang.code ? "text-accent" : "text-primary"
                          )}
                        >
                          {lang.label}
                        </div>
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
                            <ProgressBar
                              aria-label="Translation progress"
                              value={pct}
                              className="w-28 gap-0!"
                            >
                              <ProgressBarTrack className="h-1.5!">
                                <ProgressBarFill />
                              </ProgressBarTrack>
                            </ProgressBar>
                            <span className="text-[10px] text-muted tabular-nums shrink-0">
                              {pct}%
                            </span>
                          </div>
                        )}
                        {language === lang.code && <Check size={14} className="text-accent" />}
                      </div>
                    </CardRoot>
                  );
                })}
              </div>
              <CardRoot
                variant="secondary"
                className="bg-surface-1 flex flex-row items-center gap-3 px-4 py-3 mt-2"
              >
                <Translate size={18} className="shrink-0 text-secondary" />
                <div className="flex-1 text-t12 text-secondary leading-snug">
                  {t("contributeTranslation")}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onPress={() =>
                    openUrl("https://crowdin.com/project/kiyoshi-music").catch(console.error)
                  }
                >
                  Crowdin →
                </Button>
              </CardRoot>
            </>
          )}

          {tab === "overlay" && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <CardRoot
                variant="secondary"
                className="w-full max-w-sm px-[22px] py-5 flex flex-col gap-3 items-center text-center"
              >
                <span className="text-t15 font-semibold text-primary">{t("ovlOpenEditorBtn")}</span>
                <span className="text-t12 text-muted leading-relaxed">
                  {t("ovlOpenEditorDesc")}
                </span>
                <Button
                  data-testid="open-overlay-editor"
                  size="sm"
                  variant="solid"
                  color="accent"
                  className="mt-1 flex items-center gap-1.5"
                  onPress={() => onOpenOverlayEditor?.()}
                >
                  <ArrowSquareOut size={14} />
                  {t("ovlOpenEditorBtn")}
                </Button>
              </CardRoot>
            </div>
          )}

          {tab === "experimental" && (
            <div className="flex flex-col gap-4">
              <SettingsSectionDesc style={{ marginTop: 0 }}>
                {t("experimentalDesc")}
              </SettingsSectionDesc>
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <Flask size={40} className="text-muted" />
                <span className="text-t14 font-semibold text-secondary">
                  {t("experimentalEmptyTitle")}
                </span>
                <span className="text-t12 text-muted max-w-sm leading-relaxed">
                  {t("experimentalEmptyHint")}
                </span>
              </div>
            </div>
          )}

          {tab === "update" && (
            <>
              {/* Current version row */}
              <SettingRow label={t("currentVersion")} icon={<Info size={15} />}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>
                  {APP_VERSION}
                </span>
              </SettingRow>

              {updateInfo ? (
                <>
                  {/* New version card */}
                  <CardRoot
                    variant="secondary"
                    className="px-[18px] py-3.5 gap-0! my-1.5"
                    style={{
                      background: "color-mix(in srgb, var(--accent) 8%, var(--surface-1))",
                      border: "0.5px solid color-mix(in srgb, var(--accent) 40%, transparent)",
                    }}
                  >
                    <div
                      className="flex items-center gap-2.5"
                      style={{
                        marginBottom: updateInfo.releasedAt || updateInfo.changelog ? 10 : 0,
                      }}
                    >
                      <ArrowCircleUp size={20} className="text-accent shrink-0" />
                      <div>
                        <div className="text-t15 font-bold text-accent">{updateInfo.version}</div>
                        {updateInfo.releasedAt && (
                          <div className="text-t11 text-muted mt-0.5">
                            {t("released")}: {new Date(updateInfo.releasedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    {updateInfo.changelog && (
                      <>
                        <div
                          className="h-px my-2.5"
                          style={{
                            background: "color-mix(in srgb, var(--accent) 25%, transparent)",
                          }}
                        />
                        <div className="text-t11 font-semibold text-muted mb-1.5">
                          {t("changelog")}
                        </div>
                        <div className="text-t12 text-secondary leading-relaxed">
                          {renderNewsBody(updateInfo.changelog)}
                        </div>
                      </>
                    )}
                  </CardRoot>

                  {/* Action area */}
                  {updateDownloaded ? (
                    <>
                      <div
                        className="text-t12 my-2 flex items-center gap-1.5"
                        style={{ color: "#4caf50" }}
                      >
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
                        <ArrowClockwise
                          size={13}
                          style={{ animation: "spin2 0.8s linear infinite" }}
                        />
                        {t("downloadingUpdate")} — {updateDownloadProgress ?? 0}%
                      </div>
                      <ProgressBar
                        aria-label="Update download"
                        value={updateDownloadProgress ?? 0}
                        className="w-full gap-0! mb-2.5"
                      >
                        <ProgressBarTrack className="h-[3px]!">
                          <ProgressBarFill />
                        </ProgressBarTrack>
                      </ProgressBar>
                      <Button variant="ghost" fullWidth onPress={onCancelDownload}>
                        {t("cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      fullWidth
                      className="mt-1.5"
                      onPress={onDownloadUpdate}
                    >
                      <DownloadSimple size={16} />
                      {t("downloadUpdate")}
                    </Button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-2.5 py-10 px-4 text-muted">
                  <CheckCircle size={36} weight="fill" style={{ color: "#4caf50" }} />
                  <div className="text-t13 font-medium text-secondary text-center">
                    {t("upToDate")}
                  </div>
                </div>
              )}

              {/* Check for updates button */}
              <Button
                variant="ghost"
                fullWidth
                className="mt-1.5"
                isDisabled={checkingUpdate}
                onPress={() => {
                  setCheckingUpdate(true);
                  onCheckUpdate(true).finally(() => setCheckingUpdate(false));
                }}
              >
                <ArrowClockwise
                  size={14}
                  style={checkingUpdate ? { animation: "spin2 0.8s linear infinite" } : undefined}
                />
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
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  padding: "12px 0 28px",
                }}
              >
                <img
                  src="/Kodama%20Logo%20Full.svg"
                  alt="Kodama"
                  style={{ width: 200, height: "auto", marginBottom: 12 }}
                />
                <div
                  style={{ fontSize: "var(--t13)", color: "var(--text-muted)", marginBottom: 12 }}
                >
                  v{APP_VERSION}
                </div>
                <div
                  style={{
                    fontSize: "var(--t13)",
                    color: "var(--text-secondary)",
                    maxWidth: 420,
                    lineHeight: 1.6,
                    marginBottom: 20,
                  }}
                >
                  {t("aboutDesc")}
                </div>
                <div className="flex gap-2.5 flex-wrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => openUrl("https://github.com/KiyoshiTheDevil/Kodama")}
                  >
                    <Globe size={14} />
                    GitHub
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#FFDD00]! text-black! font-semibold"
                    onPress={() => openUrl("https://buymeacoffee.com/kiyoshi_the_devil")}
                  >
                    ☕ Buy me a coffee
                  </Button>
                </div>
              </div>

              {/* Contributors */}
              <div style={{ height: "0.5px", background: "var(--border)", marginBottom: 24 }} />
              <div
                style={{
                  fontSize: "var(--t11)",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 14,
                }}
              >
                {t("contributors")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                {[
                  {
                    name: "Kiyoshi The Devil",
                    role: t("contributorRoleDev"),
                    avatar: "KiyoshiTheDevil_ProfileImage.png",
                    links: [
                      {
                        icon: <BrandTwitch size={13} />,
                        url: "https://twitch.tv/kiyoshi_the_devil",
                      },
                      {
                        icon: <BrandYoutube size={13} />,
                        url: "https://www.youtube.com/@kiyoshi_the_devil",
                      },
                      {
                        icon: <BrandBluesky size={13} />,
                        url: "https://bsky.app/profile/kiyoshi-the-devil.bsky.social",
                      },
                    ],
                  },
                  {
                    name: "Grains Of Art",
                    role: t("contributorRoleAlphaTesterArtist"),
                    avatar: "GrainsOfArt_ProfileImage.png",
                    links: [
                      {
                        icon: <BrandTwitch size={13} />,
                        url: "https://www.twitch.tv/greekgeekgames",
                      },
                      {
                        icon: <BrandYoutube size={13} />,
                        url: "https://www.youtube.com/@GrainsOfArt",
                      },
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
                      {
                        icon: <BrandBluesky size={13} />,
                        url: "https://bsky.app/profile/lmary52.bsky.social",
                      },
                    ],
                  },
                ].map((c) => (
                  <CardRoot
                    key={c.name}
                    variant="secondary"
                    className="bg-surface-1 flex flex-row items-center gap-3.5 px-4 py-3"
                  >
                    {c.avatar ? (
                      <img
                        src={`/${c.avatar}`}
                        alt={c.name}
                        className="w-9 h-9 rounded-full shrink-0 object-cover"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-t13 font-bold text-white"
                        style={{ background: "linear-gradient(135deg, var(--accent), #FF008C)" }}
                      >
                        {c.name[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-t13 font-semibold">{c.name}</div>
                      <div className="text-t11 text-muted mt-0.5">{c.role}</div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {c.links.map((l, i) => (
                        <Button
                          key={i}
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          className="text-muted hover:text-accent"
                          onPress={() => openUrl(l.url)}
                        >
                          {l.icon}
                        </Button>
                      ))}
                    </div>
                  </CardRoot>
                ))}
              </div>

              {/* Tools */}
              <div
                style={{
                  fontSize: "var(--t11)",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 10,
                }}
              >
                {t("tools")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {[
                  { name: "Claude", link: "https://claude.ai" },
                  { name: "Figma", link: "https://figma.com" },
                  { name: "Font Awesome", link: "https://fontawesome.com" },
                ].map((tool) => (
                  <button
                    key={tool.name}
                    onClick={() => openUrl(tool.link)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "4px 0",
                      fontSize: "var(--t13)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font)",
                      cursor: "default",
                      textAlign: "left",
                      transition: "color 0.15s",
                      width: "fit-content",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                  >
                    {tool.name}
                  </button>
                ))}
              </div>

              {/* Legal */}
              <div
                style={{
                  marginTop: 28,
                  paddingTop: 20,
                  borderTop: "0.5px solid var(--border)",
                  display: "flex",
                  justifyContent: "center",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "var(--t11)", color: "var(--text-muted)" }}>
                  © {new Date().getFullYear()} KiyoshiTheDevil ·
                </span>
                <button
                  onClick={() =>
                    openUrl("https://github.com/KiyoshiTheDevil/Kodama/blob/master/LICENSE")
                  }
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "default",
                    fontSize: "var(--t11)",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font)",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
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
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    localStorage.removeItem("kiyoshi-debug-unlocked");
                    setDebugUnlocked(false);
                    window.dispatchEvent(
                      new CustomEvent("kiyoshi-debug-change", { detail: { unlocked: false } })
                    );
                    setTab("darstellung");
                  }}
                >
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
