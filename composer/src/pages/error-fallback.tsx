import { downloadRecoveryFile } from "@/lib/recovery";
import { Button } from "@/ui/button";
import { ClearRecoveryButton } from "@/ui/clear-recovery-button";
import { Scroll } from "@/ui/scroll";
import {
  IconBug,
  IconChevronDown,
  IconChevronRight,
  IconDiscOff,
  IconDownload,
  IconGhost2,
  IconHome2,
  IconRefresh,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

// -- Constants -----------------------------------------------------------------

const LOG_PREFIX = "[Composer]";

const ERROR_ICONS = [IconDiscOff, IconGhost2, IconBug] as const;

// -- Helpers -------------------------------------------------------------------

interface ErrorDetails {
  title: string;
  subtitle: string;
  errorName?: string;
  status?: number;
  statusText?: string;
  stack?: string;
  responseData?: unknown;
}

function describeError(error: unknown): ErrorDetails {
  if (error === undefined || error === null) {
    return {
      title: "404",
      subtitle: "We couldn't find that page.",
      status: 404,
    };
  }

  if (isRouteErrorResponse(error)) {
    const is404 = error.status === 404;
    return {
      title: is404 ? "404" : `${error.status}`,
      subtitle: is404 ? "We couldn't find that page." : error.statusText || "The route returned an error response.",
      status: error.status,
      statusText: error.statusText,
      responseData: error.data,
    };
  }

  if (error instanceof Error) {
    return {
      title: "Something broke",
      subtitle: error.message || "The view threw without a message.",
      errorName: error.name,
      stack: error.stack,
    };
  }

  return {
    title: "Something broke",
    subtitle: typeof error === "string" ? error : "The view threw a non-Error value.",
    stack: safeStringify(error),
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// -- Component -----------------------------------------------------------------

const ErrorFallback: React.FC = () => {
  const error = useRouteError();
  const details = describeError(error);
  const Icon = useMemo(() => ERROR_ICONS[Math.floor(Math.random() * ERROR_ICONS.length)], []);
  const [showDetails, setShowDetails] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "downloading" | "success" | "empty" | "failed">("idle");

  console.error(LOG_PREFIX, "route error", error);

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  const handleRecover = async () => {
    setRecoveryStatus("downloading");
    try {
      const result = await downloadRecoveryFile();
      setRecoveryStatus(result.found ? "success" : "empty");
    } catch (err) {
      console.error(LOG_PREFIX, "recovery failed", err);
      setRecoveryStatus("failed");
    }
  };

  const recoveryMessage =
    recoveryStatus === "success"
      ? "Saved. Open Composer, head to the Export tab, and click Import Project to keep going."
      : recoveryStatus === "empty"
        ? "Nothing saved in this browser yet."
        : recoveryStatus === "failed"
          ? "Couldn't reach your save. Try opening /recover in a fresh tab."
          : null;

  const responseDataString =
    details.responseData !== undefined && details.responseData !== null ? safeStringify(details.responseData) : null;
  const hasDetails = !!(details.stack || responseDataString);

  return (
    <div className="min-h-screen bg-composer-bg text-composer-text flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-lg flex flex-col items-center text-center gap-5">
        <Icon size={56} strokeWidth={1.5} className="text-composer-text opacity-50" />

        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold text-composer-text">{details.title}</h1>
          {details.errorName && details.errorName !== "Error" && (
            <p className="text-xs font-mono text-composer-text-muted select-text">{details.errorName}</p>
          )}
          <p className="text-sm text-composer-text-secondary leading-relaxed select-text break-words">
            {details.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button variant="primary" hasIcon onClick={handleReload}>
            <IconRefresh size={16} />
            Reload
          </Button>
          <Button variant="secondary" hasIcon onClick={handleGoHome}>
            <IconHome2 size={16} />
            Go home
          </Button>
          <Button variant="secondary" hasIcon onClick={handleRecover} disabled={recoveryStatus === "downloading"}>
            <IconDownload size={16} />
            {recoveryStatus === "downloading" ? "Downloading…" : "Download my work"}
          </Button>
        </div>
        {recoveryMessage && <p className="text-xs text-composer-text-muted select-text">{recoveryMessage}</p>}
        {recoveryStatus === "success" && (
          <ClearRecoveryButton clearedMessage="Cleared. Reload Composer to start fresh." />
        )}

        {hasDetails && (
          <div className="w-full mt-2 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-composer-text-muted hover:text-composer-text transition-colors cursor-pointer"
              aria-expanded={showDetails}
            >
              {showDetails ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              Technical details
            </button>
            {showDetails && (
              <div className="w-full flex flex-col gap-2 text-left">
                {responseDataString && (
                  <Scroll className="rounded-md bg-composer-button max-h-48">
                    <pre className="p-3 text-[11px] leading-relaxed text-composer-text-secondary select-text font-mono">
                      {responseDataString}
                    </pre>
                  </Scroll>
                )}
                {details.stack && (
                  <Scroll className="rounded-md bg-composer-button max-h-72">
                    <pre className="p-3 text-[11px] leading-relaxed text-composer-text-secondary select-text font-mono whitespace-pre-wrap">
                      {details.stack}
                    </pre>
                  </Scroll>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// -- Exports -------------------------------------------------------------------

export { ErrorFallback };
