import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, CardRoot, ProgressBar, ProgressBarFill, ProgressBarTrack } from "@heroui/react";
import { API } from "../shared/api/client.js";
import { LANGUAGES, translate } from "../i18n.js";
import { ArrowClockwise, Check, CheckCircle, X } from "../icons.jsx";
import { useLang } from "../context.jsx";

// Startup-gate screens rendered by App over the main layout: the first-run language picker,
// the FFmpeg setup/download screen, the FFmpeg update banner, and the splash. Extracted from
// App.jsx to keep the composition root focused on state, effects, and layout.

export function LanguagePickerScreen({ currentLanguage, onConfirm }) {
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
export function FfmpegSetupScreen({ onDone }) {
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
      } catch { /* intentionally ignored */ }
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
export function FfmpegUpdateBanner({ installed, latest, onClose }) {
  const t = useLang();
  const [phase, setPhase] = useState("offer"); // offer | downloading | done | error

  const [percent, setPercent] = useState(0);

  const dismiss = () => {
    try {
      localStorage.setItem("kiyoshi-ffmpeg-update-dismissed", latest || "");
    } catch { /* intentionally ignored */ }
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
          } catch { /* intentionally ignored */ }
          setTimeout(onClose, 2400);
        } else if (data.status === "error") {
          es.close();
          setPhase("error");
        }
      } catch { /* intentionally ignored */ }
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

export function SplashScreen({ fading }) {
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
