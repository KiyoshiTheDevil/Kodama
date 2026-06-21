import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconExclamationCircle, IconLoader2 } from "@tabler/icons-react";
import { useSettingsStore } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { hasBridgeEverBeenDetected, markBridgeDetected } from "@/utils/bridge-detection";
import {
  type BridgeHealth,
  checkBridgeHealth,
  DEFAULT_BRIDGE_URL,
  HEALTH_QUERY_KEY,
} from "@/utils/composer-bridge-api";
import { cn } from "@/utils/cn";
import { BridgeInstallGuide } from "@/ui/settings/bridge-install-guide";

// -- Constants ----------------------------------------------------------------

const HEALTH_REFETCH_INTERVAL = 8000;
const HIGHLIGHT_PULSE_MS = 2000;

// -- Sub-components -----------------------------------------------------------

const BridgeToggle: React.FC<{ enabled: boolean; onToggle: () => void }> = ({ enabled, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    aria-label="Use Composer Bridge for YouTube"
    onClick={onToggle}
    className={cn(
      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
      enabled ? "bg-composer-accent" : "bg-composer-button",
    )}
  >
    <span
      className={cn(
        "pointer-events-none inline-block size-4 rounded-full bg-white shadow transform transition-transform mt-0.5",
        enabled ? "translate-x-4.5" : "translate-x-0.5",
      )}
    />
  </button>
);

const StatusBadge: React.FC<{
  state: "checking" | "ok" | "error";
  data: BridgeHealth | undefined;
  errorMessage: string | undefined;
}> = ({ state, data, errorMessage }) => {
  if (state === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-composer-text-muted">
        <IconLoader2 size={12} className="animate-spin" />
        Checking…
      </span>
    );
  }
  if (state === "ok" && data) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500" title={`yt-dlp ${data.ytdlp}`}>
        <IconCheck size={12} />
        Running · bridge {data.bridge} · yt-dlp {data.ytdlp}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-rose-500"
      title={errorMessage ?? "bridge unreachable"}
    >
      <IconExclamationCircle size={12} />
      Not running
    </span>
  );
};

// -- Sub-sections -------------------------------------------------------------

const BridgeStoppedHint: React.FC = () => (
  <div className="text-xs text-composer-text-muted leading-relaxed">
    <p className="mb-1">Bridge isn't responding at this address. Start it with:</p>
    <code className="block px-2 py-1 rounded bg-composer-bg font-mono text-[11px] select-text">composer-bridge</code>
    <p className="mt-2">
      If you don't have it yet, grab a binary from{" "}
      <a
        href="https://github.com/better-lyrics/composer-bridge/releases"
        target="_blank"
        rel="noopener noreferrer"
        className="text-composer-accent-text hover:text-composer-accent underline"
      >
        releases
      </a>
      .
    </p>
  </div>
);

// -- Section ------------------------------------------------------------------

const BridgeSection: React.FC = () => {
  const enabled = useSettingsStore((s) => s.experiments.youtubeBridge);
  const bridgeUrl = useSettingsStore((s) => s.composerBridgeUrl);
  const setSetting = useSettingsStore((s) => s.set);
  const settingsHighlight = useUIStore((s) => s.settingsHighlight);
  const clearHighlight = useUIStore((s) => s.clearHighlight);

  const containerRef = useRef<HTMLDivElement>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (settingsHighlight !== "bridge-section") return;
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    setPulsing(true);
    pulseTimerRef.current = setTimeout(() => {
      setPulsing(false);
      pulseTimerRef.current = null;
    }, HIGHLIGHT_PULSE_MS);
    clearHighlight();
  }, [settingsHighlight, clearHighlight]);
  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const [draftUrl, setDraftUrl] = useState(bridgeUrl);
  useEffect(() => {
    setDraftUrl(bridgeUrl);
  }, [bridgeUrl]);

  const toggleEnabled = () => {
    const current = useSettingsStore.getState().experiments;
    setSetting("experiments", { ...current, youtubeBridge: !current.youtubeBridge });
  };

  const commitUrl = () => {
    if (draftUrl !== bridgeUrl) setSetting("composerBridgeUrl", draftUrl);
  };
  const resetUrl = () => {
    setDraftUrl(DEFAULT_BRIDGE_URL);
    setSetting("composerBridgeUrl", DEFAULT_BRIDGE_URL);
  };

  const everDetectedAtMount = useMemo(() => hasBridgeEverBeenDetected(), []);

  const health = useQuery({
    queryKey: [HEALTH_QUERY_KEY, bridgeUrl],
    queryFn: ({ signal }) => checkBridgeHealth(bridgeUrl, signal),
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: enabled ? HEALTH_REFETCH_INTERVAL : false,
    retry: false,
  });

  useEffect(() => {
    if (health.data) markBridgeDetected();
  }, [health.data]);

  const state: "checking" | "ok" | "error" =
    health.isFetching && !health.data ? "checking" : health.data ? "ok" : "error";
  const errorMessage = health.error instanceof Error ? health.error.message : undefined;

  return (
    <div
      ref={containerRef}
      data-testid="bridge-section"
      className={cn(
        "pt-3 mt-3 border-t border-composer-border transition-shadow duration-300",
        pulsing && "ring-2 ring-composer-accent",
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-col gap-0.5 pr-4">
          <span className="text-sm font-medium text-composer-text">
            Composer Bridge for YouTube
            <span className="ml-2 text-[10px] tracking-wide text-composer-accent-text">Experimental</span>
          </span>
          <span className="text-xs text-composer-text-muted">
            Route YouTube imports through a small local binary running on your machine instead of Cobalt. Uses your
            residential IP, so YouTube doesn't block it. Requires running{" "}
            <a
              href="https://github.com/better-lyrics/composer-bridge"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-composer-text"
            >
              Composer Bridge
            </a>
            .
          </span>
        </div>
        <BridgeToggle enabled={enabled} onToggle={toggleEnabled} />
      </div>

      {enabled && (
        <div className="flex flex-col gap-2 px-3 py-3 rounded-md bg-composer-input border border-composer-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-composer-text">Bridge status</span>
            <StatusBadge state={state} data={health.data} errorMessage={errorMessage} />
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-composer-text-muted">Bridge URL</span>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                onBlur={commitUrl}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                spellCheck={false}
                className="flex-1 h-7 px-2 text-xs font-mono rounded bg-composer-bg text-composer-text border border-composer-border focus:outline-none focus:border-composer-accent select-text"
                placeholder={DEFAULT_BRIDGE_URL}
              />
              {bridgeUrl !== DEFAULT_BRIDGE_URL && (
                <button
                  type="button"
                  onClick={resetUrl}
                  className="text-xs text-composer-accent-text hover:text-composer-accent cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </label>

          {state === "error" &&
            (everDetectedAtMount ? <BridgeStoppedHint /> : <BridgeInstallGuide onCheckNow={() => health.refetch()} />)}
        </div>
      )}
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { BridgeSection };
