// Standalone recovery helper. Reads the autosaved project directly from
// IndexedDB and triggers a file download, with zero dependencies on any
// store, hook, or component so it remains usable from error boundaries
// and `/recover` even when the rest of the app is in a broken state.

import { PROJECT_STORE_NAME, getFromStore, openDB } from "@/lib/persistence-idb";

// -- Types --------------------------------------------------------------------

interface RecoveredProject {
  version?: number;
  savedAt?: number;
  metadata?: { title?: string };
  lines?: unknown[];
}

interface RecoveryResult {
  found: boolean;
  filename: string;
  lineCount: number;
  savedAt: number | undefined;
  title: string;
}

// -- Constants ----------------------------------------------------------------

const CURRENT_PROJECT_KEY = "current";
const NOT_FOUND_RESULT: RecoveryResult = {
  found: false,
  filename: "",
  lineCount: 0,
  savedAt: undefined,
  title: "",
};

// -- Helpers ------------------------------------------------------------------

function readProjectFromIDB(): Promise<RecoveredProject | undefined> {
  return getFromStore<RecoveredProject>(PROJECT_STORE_NAME, CURRENT_PROJECT_KEY);
}

function buildRecoveryResult(project: RecoveredProject): RecoveryResult {
  const title = project.metadata?.title?.trim() || "recovered";
  const date = new Date().toISOString().slice(0, 10);
  return {
    found: true,
    filename: `${title}-${date}.ttml-project.json`,
    lineCount: project.lines?.length ?? 0,
    savedAt: project.savedAt,
    title,
  };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -- Public API ---------------------------------------------------------------

async function readRecoveryMetadata(): Promise<RecoveryResult> {
  const project = await readProjectFromIDB();
  return project ? buildRecoveryResult(project) : NOT_FOUND_RESULT;
}

async function downloadRecoveryFile(): Promise<RecoveryResult> {
  const project = await readProjectFromIDB();
  if (!project) return NOT_FOUND_RESULT;
  const result = buildRecoveryResult(project);
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  triggerDownload(blob, result.filename);
  return result;
}

async function clearRecoveryStorage(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE_NAME, "readwrite");
    tx.objectStore(PROJECT_STORE_NAME).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB clear failed"));
    };
  });
}

// -- Exports ------------------------------------------------------------------

export { readRecoveryMetadata, downloadRecoveryFile, clearRecoveryStorage, buildRecoveryResult, NOT_FOUND_RESULT };
export type { RecoveredProject, RecoveryResult };
