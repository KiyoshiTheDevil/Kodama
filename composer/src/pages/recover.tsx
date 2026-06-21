import { downloadRecoveryFile, readRecoveryMetadata, type RecoveryResult } from "@/lib/recovery";
import { PageHead } from "@/seo/page-head";
import { Button } from "@/ui/button";
import { ClearRecoveryButton } from "@/ui/clear-recovery-button";
import { ClientOnly } from "@/ui/client-only";
import { IconCheck, IconDownload, IconHome2, IconLifebuoy, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";

// -- Constants -----------------------------------------------------------------

const TITLE = "Recover Your Work ・ Composer";
const DESCRIPTION = "Grab the backup Composer saved in this browser and pick up where you left off.";

// -- Helpers -------------------------------------------------------------------

function formatSavedAt(savedAt: number | undefined): string {
  if (!savedAt) return "unknown";
  try {
    return new Date(savedAt).toLocaleString();
  } catch {
    return new Date(savedAt).toISOString();
  }
}

// Middle-ellipsis truncation so the extension stays visible. End-truncation
// (CSS text-overflow) would hide ".ttml-project.json" which is the most
// useful part for the user to recognise.
function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

// -- Component -----------------------------------------------------------------

type RecoveryState =
  | { phase: "reading" }
  | { phase: "ready"; result: RecoveryResult }
  | { phase: "downloaded"; result: RecoveryResult }
  | { phase: "empty" }
  | { phase: "failed"; message: string };

const RecoverPanel: React.FC = () => {
  const [state, setState] = useState<RecoveryState>({ phase: "reading" });

  useEffect(() => {
    let cancelled = false;
    downloadRecoveryFile().then(
      (result) => {
        if (cancelled) return;
        if (!result.found) {
          setState({ phase: "empty" });
        } else {
          setState({ phase: "downloaded", result });
        }
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ phase: "failed", message });
        readRecoveryMetadata().then(
          (meta) => {
            if (cancelled || !meta.found) return;
            setState({ phase: "ready", result: meta });
          },
          () => {},
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownloadAgain = async () => {
    try {
      const result = await downloadRecoveryFile();
      if (!result.found) {
        setState({ phase: "empty" });
      } else {
        setState({ phase: "downloaded", result });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ phase: "failed", message });
    }
  };

  return (
    <div className="min-h-screen bg-composer-bg text-composer-text flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-lg flex flex-col items-center text-center gap-5">
        <IconLifebuoy size={56} strokeWidth={1.5} className="text-composer-text opacity-50" />

        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold text-composer-text">Recover your work</h1>
          <p className="text-sm text-composer-text-secondary leading-relaxed">
            Composer saves your work automatically as you go. This page grabs that backup and downloads it as a file.
            Open Composer, head to the Export tab, and click Import Project to pick up where you left off.
          </p>
        </div>

        {state.phase === "reading" && <p className="text-xs text-composer-text-muted">Looking for your work…</p>}

        {state.phase === "downloaded" && (
          <div className="flex flex-col items-center gap-2 text-sm max-w-full">
            <p className="inline-flex items-center gap-2 text-composer-text max-w-full flex-wrap justify-center">
              <IconCheck size={16} className="text-green-400 shrink-0" />
              <span className="shrink-0">Downloaded as</span>
              <span className="font-mono text-xs select-text" title={state.result.filename}>
                {truncateMiddle(state.result.filename, 44)}
              </span>
            </p>
            <p className="text-xs text-composer-text-muted select-text">
              {state.result.lineCount} lines, last edited {formatSavedAt(state.result.savedAt)}
            </p>
          </div>
        )}

        {state.phase === "ready" && (
          <div className="flex flex-col items-center gap-2 text-sm">
            <p className="text-composer-text">We found your last session.</p>
            <p className="text-xs text-composer-text-muted select-text">
              {state.result.lineCount} lines, last edited {formatSavedAt(state.result.savedAt)}
            </p>
          </div>
        )}

        {state.phase === "empty" && (
          <p className="text-sm text-composer-text-secondary">
            Nothing saved in this browser yet. If you were working in a different browser or profile, open this page
            there instead.
          </p>
        )}

        {state.phase === "failed" && (
          <div className="flex flex-col items-center gap-2 text-sm">
            <p className="text-composer-error-text">Something went wrong while trying to find your work.</p>
            <p className="text-xs font-mono text-composer-text-muted select-text break-all max-w-md">{state.message}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {state.phase !== "empty" && (
            <Button variant="primary" hasIcon onClick={handleDownloadAgain} disabled={state.phase === "reading"}>
              <IconDownload size={16} />
              {state.phase === "downloaded" ? "Download again" : "Download"}
            </Button>
          )}
          <Button variant="secondary" hasIcon onClick={() => window.location.assign("/")}>
            <IconHome2 size={16} />
            Back to Composer
          </Button>
          {state.phase === "failed" && (
            <Button variant="ghost" hasIcon onClick={() => window.location.reload()}>
              <IconRefresh size={16} />
              Retry
            </Button>
          )}
        </div>

        {state.phase === "downloaded" && (
          <ClearRecoveryButton
            hint="Use this if Composer keeps crashing on the same project. Wipes the autosave so the app opens fresh. Make sure your download succeeded first."
            clearedMessage="Cleared. Open Composer to start fresh."
          />
        )}
      </div>
    </div>
  );
};

// -- Page ----------------------------------------------------------------------

const RecoverFallback: React.FC = () => (
  <div className="flex items-center justify-center h-screen bg-composer-bg text-composer-text-muted text-sm">
    Looking for your work…
  </div>
);

const RecoverPage: React.FC = () => {
  return (
    <>
      <PageHead title={TITLE} description={DESCRIPTION} path="/recover" />
      <ClientOnly fallback={<RecoverFallback />}>
        <RecoverPanel />
      </ClientOnly>
    </>
  );
};

export default RecoverPage;
export { RecoverPanel };
