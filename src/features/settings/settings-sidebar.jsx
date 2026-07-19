import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, cn, ListBox, ListBoxItem } from "@heroui/react";

import { ArrowLeft, ArrowsClockwise, Bug, ChatText, Flask, HardDrives, Info, Keyboard, Link, Lock, PaintBrushBroad, PersonArmsSpread, Play, ScreencastSimple, Translate, UserCircle, WaveformLines } from "../../icons.jsx";
import { useAnimations, useLang } from "../../context.jsx";
import { APP_VERSION } from "./settings-support.jsx";
import { getSettingsSection, subscribeSettingsSection } from "./section-store.js";

export function SettingsSidebarContent({
  tab,
  setTab,
  onSectionSelect,
  updateInfo,
  onClose,
  collapsed,
  closing,
}) {
  const activeSection = useSyncExternalStore(subscribeSettingsSection, getSettingsSection);
  const t = useLang();
  const anim = useAnimations();
  const [debugUnlocked, setDebugUnlocked] = useState(
    () => localStorage.getItem("kiyoshi-debug-unlocked") === "true"
  );
  const [, setDebugTapCount] = useState(0);
  const [debugToast, setDebugToast] = useState(null);
  const debugTapTimer = useRef(null);
  const chromiumVersion = window.navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? "—";
  useEffect(() => {
    const handler = (e) => setDebugUnlocked(e.detail.unlocked);
    window.addEventListener("kiyoshi-debug-change", handler);
    return () => window.removeEventListener("kiyoshi-debug-change", handler);
  }, []);
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
        window.dispatchEvent(
          new CustomEvent("kiyoshi-debug-change", { detail: { unlocked: true } })
        );
        setDebugToast("unlocked");
        debugTapTimer.current = setTimeout(() => setDebugToast(null), 2500);
        return 0;
      }
      debugTapTimer.current = setTimeout(() => setDebugTapCount(0), 2000);
      return next;
    });
  };

  const navItems = [
    {
      id: "account",
      label: t("account"),
      iconEl: <UserCircle size={18} />,
      sections: [
        { id: "account-overview", label: t("accOverview") },
        { id: "account-accounts", label: t("accAccounts") },
        { id: "account-statistics", label: t("statistics") },
      ],
    },
    {
      id: "darstellung",
      label: t("appearance"),
      iconEl: <PaintBrushBroad size={18} />,
      sections: [
        { id: "ap-theme", label: t("theme") },
        { id: "ap-icon", label: t("appIcon") },
        { id: "ap-colors", label: t("apColors") },
        { id: "ap-others", label: t("apOthers") },
      ],
    },
    {
      id: "accessibility",
      label: t("accessibility"),
      iconEl: <PersonArmsSpread size={18} />,
      sections: [
        { id: "acc-visual", label: t("accVisual") },
        { id: "acc-behaviour", label: t("behaviour") },
      ],
    },
    { id: "connections", label: t("connections"), iconEl: <Link size={18} /> },
    {
      id: "lyrics",
      label: t("lyrics"),
      iconEl: <ChatText size={18} />,
      sections: [
        { id: "lyrics-visual", label: t("lyrVisual") },
        { id: "lyrics-effects", label: t("lyrEffects") },
        { id: "lyrics-providers", label: t("lyricsProviders") },
        { id: "lyrics-unison", label: t("unisonIdentity") },
        { id: "lyrics-composer", label: t("composer") },
      ],
    },
    { id: "wiedergabe", label: t("playback"), iconEl: <Play size={18} /> },
    { id: "visualizer", label: t("visualizer"), iconEl: <WaveformLines size={18} /> },
    {
      id: "storage",
      label: t("storage"),
      iconEl: <HardDrives size={18} />,
      sections: [
        { id: "storage-downloads", label: t("storageDownloads") },
        { id: "storage-cache", label: t("storageCache") },
      ],
    },
    { id: "sicherheit", label: t("security"), iconEl: <Lock size={18} /> },
    { id: "overlay", label: t("overlay"), iconEl: <ScreencastSimple size={18} />, badge: "Beta" },
    { id: "shortcuts", label: t("shortcuts"), iconEl: <Keyboard size={18} /> },
    { id: "experimental", label: t("experimental"), iconEl: <Flask size={18} /> },
    { id: "language", label: t("language"), iconEl: <Translate size={18} /> },
    { id: "update", label: t("update"), iconEl: <ArrowsClockwise size={18} /> },
    { id: "about", label: t("about"), iconEl: <Info size={18} /> },
    ...(debugUnlocked ? [{ id: "debug", label: t("debug"), iconEl: <Bug size={18} /> }] : []),
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 4,
        bottom: 8,
        left: 8,
        zIndex: 300,
        background: "transparent",
        borderRadius: "var(--r-xl)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: anim
          ? closing
            ? "fadeSlideOut 0.22s cubic-bezier(0.4,0,0.2,1) forwards"
            : "fadeSlideIn 0.25s cubic-bezier(0.4,0,0.2,1)"
          : undefined,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 8,
          padding: collapsed ? "16px 0 8px" : "16px 12px 8px",
          justifyContent: collapsed ? "center" : "flex-start",
          flexShrink: 0,
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          onPress={onClose}
          title={t("back") || "Back"}
          className="rounded-full shrink-0"
        >
          <ArrowLeft size={16} weight="bold" />
        </Button>
        {!collapsed && (
          <span
            style={{
              fontSize: "var(--t13)",
              fontWeight: 600,
              color: "var(--t1)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {t("appSettings")}
          </span>
        )}
      </div>

      <div
        style={{
          height: 1,
          background: "var(--stroke)",
          margin: collapsed ? "0 8px 8px" : "0 12px 8px",
          flexShrink: 0,
        }}
      />

      {/* Nav items */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: collapsed ? "0 4px 8px" : "0 8px 8px",
        }}
      >
        <ListBox
          aria-label={t("appSettings")}
          selectionMode="none"
          onAction={(key) => {
            const k = String(key);
            if (k.startsWith("sec:")) onSectionSelect?.(k.slice(4));
            else setTab(k);
          }}
          className="w-full"
        >
          {navItems.flatMap((item) => {
            const parent = (
              <ListBoxItem
                key={item.id}
                id={item.id}
                data-testid={`settings-nav-${item.id}`}
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
                  <span className="ml-auto shrink-0 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-accent text-white uppercase">
                    {item.badge}
                  </span>
                )}
                {!collapsed && item.id === "update" && updateInfo && !item.badge && (
                  <span className="ml-auto shrink-0 w-[7px] h-[7px] rounded-full bg-accent" />
                )}
              </ListBoxItem>
            );
            // Discord-style sub-nav: when this page is active, list its sections as indented
            // children with a vertical tree line; the active one (scroll-spy) is highlighted.
            if (collapsed || tab !== item.id || !item.sections) return [parent];
            const children = item.sections.map((sec) => (
              <ListBoxItem
                key={"sec:" + sec.id}
                id={"sec:" + sec.id}
                textValue={sec.label}
                className={cn(
                  "text-t12 min-h-8 rounded-lg pl-9 relative",
                  activeSection === sec.id ? "text-accent font-medium" : "text-secondary"
                )}
              >
                <span
                  aria-hidden
                  className="absolute left-[17px] top-0 bottom-0 w-px"
                  style={{
                    background: activeSection === sec.id ? "var(--accent)" : "var(--stroke)",
                  }}
                />
                <span className="flex-1 truncate">{sec.label}</span>
              </ListBoxItem>
            ));
            return [parent, ...children];
          })}
        </ListBox>
      </div>

      {/* Footer — version info + debug tap + quit */}
      <div
        style={{
          borderTop: "0.5px solid var(--stroke)",
          paddingTop: 8,
          flexShrink: 0,
          position: "relative",
          margin: "0 8px 8px",
        }}
      >
        {debugToast && (
          <div
            className={[
              "absolute left-0 right-0 bottom-[calc(100%+6px)] rounded-lg px-2.5 py-1.5 text-t11 font-medium text-center pointer-events-none z-10 border",
              debugToast === "unlocked"
                ? "border-transparent"
                : "bg-surface-1 text-secondary border-border",
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
            <div
              style={{
                fontSize: "var(--t11)",
                fontWeight: 600,
                color: "var(--t1)",
                marginBottom: 2,
              }}
            >
              {APP_VERSION}
            </div>
            <div style={{ fontSize: "var(--t10)", color: "var(--t3)", lineHeight: 1.7 }}>
              <span
                onClick={handleTauriVersionTap}
                style={{ cursor: "default", userSelect: "none" }}
              >
                Tauri 2.10.3
              </span>
              <br />
              Chromium {chromiumVersion}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
