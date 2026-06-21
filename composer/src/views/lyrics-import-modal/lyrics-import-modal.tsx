import { IconFileImport, IconUpload } from "@tabler/icons-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAudioStore } from "@/stores/audio";
import { useConfirm } from "@/stores/confirm-store";
import { type ImportModalSection, useImportModalState, useImportModalStore } from "@/stores/import-modal-store";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { Button } from "@/ui/button";
import { Modal } from "@/ui/modal";
import { cn } from "@/utils/cn";
import type { LyricsSearchResult } from "@/domain/lyrics-search/result";
import { parseLyricsFile } from "@/utils/lyrics-parsers";
import { textToLyricLines } from "@/utils/lyrics-text";
import { PasteSection } from "@/views/lyrics-import-modal/paste-section";
import { SearchSection } from "@/views/lyrics-import-modal/search-section";
import {
  isAbortError,
  payloadToContent,
  syntheticFilenameForResult,
  wrapTextAsParseResult,
} from "@/views/lyrics-import-modal/shell-helpers";
import {
  ACCEPTED_EXTENSIONS,
  UNSUPPORTED_TYPE_MESSAGE,
  UploadSection,
} from "@/views/lyrics-import-modal/upload-section";
import {
  importParsedLyrics,
  type ImportParsedLyricsContext,
  type ImportSourceInfo,
} from "@/views/lyrics-import-modal/use-import-modal-actions";

// -- Component ----------------------------------------------------------------

// react-doctor-disable-next-line react-doctor/prefer-useReducer
const LyricsImportModalShell: React.FC = () => {
  const { prefill, initialSection } = useImportModalState();
  const confirm = useConfirm();
  const agents = useProjectStore((s) => s.agents);
  const audioDuration = useAudioStore((s) => s.duration);
  const autoExtractBackgroundVocals = useSettingsStore((s) => s.autoExtractBackgroundVocals);
  const mergeStandaloneBackgroundLines = useSettingsStore((s) => s.mergeStandaloneBackgroundLines);
  const preserveBracketsOnExtraction = useSettingsStore((s) => s.preserveBracketsOnExtraction);

  const [currentSection, setCurrentSection] = useState<ImportModalSection>(initialSection ?? "search");
  const [pasteText, setPasteText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectingResultId, setSelectingResultId] = useState<string | null>(null);
  const [isModalDragOver, setIsModalDragOver] = useState(false);
  const closedRef = useRef(false);
  const selectionAbortRef = useRef<AbortController | null>(null);
  const dragCountRef = useRef(0);

  const close = useCallback(() => {
    closedRef.current = true;
    if (selectionAbortRef.current !== null) {
      selectionAbortRef.current.abort();
      selectionAbortRef.current = null;
    }
    useImportModalStore.getState().close();
    setPasteText("");
    setPendingFile(null);
    setSelectingResultId(null);
  }, []);

  const buildContext = useCallback(
    (source: ImportSourceInfo): ImportParsedLyricsContext => ({
      confirm,
      agents,
      audioDuration,
      applyBackgroundExtraction: autoExtractBackgroundVocals,
      backgroundExtractionMergeStandalone: mergeStandaloneBackgroundLines,
      backgroundExtractionPreserveBrackets: preserveBracketsOnExtraction,
      source,
      onResult: (parsed, src) => {
        useImportModalStore.getState().recordImportResult(parsed, src);
      },
    }),
    [
      agents,
      audioDuration,
      autoExtractBackgroundVocals,
      confirm,
      mergeStandaloneBackgroundLines,
      preserveBracketsOnExtraction,
    ],
  );

  const handleImportPaste = useCallback(async () => {
    if (pasteText.trim().length === 0) return;
    const defaultAgentId = agents?.[0]?.id ?? "v1";
    const lyricLines = textToLyricLines(pasteText, defaultAgentId);
    const parsed = wrapTextAsParseResult(lyricLines);
    const ok = await importParsedLyrics(parsed, buildContext({ label: "Paste", filename: "paste.txt" }));
    if (ok) close();
  }, [agents, buildContext, close, pasteText]);

  const handleImportUpload = useCallback(async () => {
    if (!pendingFile) return;
    const content = await pendingFile.text();
    const parsed = parseLyricsFile(pendingFile.name, content, audioDuration > 0 ? audioDuration : undefined);
    const ok = await importParsedLyrics(parsed, buildContext({ label: "File", filename: pendingFile.name }));
    if (ok) close();
  }, [audioDuration, buildContext, close, pendingFile]);

  const handleSearchSelect = useCallback(
    async (result: LyricsSearchResult) => {
      if (selectionAbortRef.current !== null) selectionAbortRef.current.abort();
      const controller = new AbortController();
      selectionAbortRef.current = controller;
      setSelectingResultId(result.id);

      let content: string | null;
      try {
        content = await payloadToContent(result, controller.signal);
      } catch (error) {
        if (selectionAbortRef.current === controller) selectionAbortRef.current = null;
        setSelectingResultId((prev) => (prev === result.id ? null : prev));
        if (isAbortError(error) || controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Failed to fetch lyrics";
        toast.error(`${result.sourceLabel}: ${message}`);
        return;
      }

      if (controller.signal.aborted || closedRef.current || !useImportModalStore.getState().isOpen) {
        if (selectionAbortRef.current === controller) selectionAbortRef.current = null;
        setSelectingResultId((prev) => (prev === result.id ? null : prev));
        return;
      }

      if (content === null) {
        if (selectionAbortRef.current === controller) selectionAbortRef.current = null;
        setSelectingResultId((prev) => (prev === result.id ? null : prev));
        return;
      }

      const filename = syntheticFilenameForResult(result);
      const parsed = parseLyricsFile(filename, content, audioDuration > 0 ? audioDuration : undefined);
      const ok = await importParsedLyrics(parsed, buildContext({ label: result.sourceLabel, filename }));
      if (selectionAbortRef.current === controller) selectionAbortRef.current = null;
      setSelectingResultId((prev) => (prev === result.id ? null : prev));
      if (ok) close();
    },
    [audioDuration, buildContext, close],
  );

  const handleFilePicked = useCallback((file: File) => {
    setPendingFile(file);
  }, []);

  const switchToSearch = useCallback(() => setCurrentSection("search"), []);
  const switchToPaste = useCallback(() => setCurrentSection("paste"), []);
  const switchToUpload = useCallback(() => setCurrentSection("upload"), []);

  const isFileDrag = useCallback((e: React.DragEvent) => {
    return Array.from(e.dataTransfer.types).includes("Files");
  }, []);

  const handleModalDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCountRef.current++;
      if (dragCountRef.current === 1) setIsModalDragOver(true);
    },
    [isFileDrag],
  );

  const handleModalDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
    },
    [isFileDrag],
  );

  const handleModalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = Math.max(0, dragCountRef.current - 1);
    if (dragCountRef.current === 0) setIsModalDragOver(false);
  }, []);

  const handleModalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsModalDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      toast.error(UNSUPPORTED_TYPE_MESSAGE);
      return;
    }
    setPendingFile(file);
    setCurrentSection("upload");
  }, []);

  const expectedDurationSec = audioDuration > 0 ? audioDuration : undefined;

  const sectionBody = useMemo(() => {
    if (currentSection === "search") {
      return (
        <SearchSection
          initialPrefill={prefill}
          expectedDurationSec={expectedDurationSec}
          onSelect={handleSearchSelect}
          onSwitchToPaste={switchToPaste}
          onSwitchToUpload={switchToUpload}
        />
      );
    }
    if (currentSection === "paste") {
      return (
        <PasteSection
          value={pasteText}
          onChange={setPasteText}
          onSwitchToSearch={switchToSearch}
          onSwitchToUpload={switchToUpload}
        />
      );
    }
    return (
      <UploadSection onFile={handleFilePicked} onSwitchToSearch={switchToSearch} onSwitchToPaste={switchToPaste} />
    );
  }, [
    currentSection,
    expectedDurationSec,
    handleFilePicked,
    handleSearchSelect,
    pasteText,
    prefill,
    switchToPaste,
    switchToSearch,
    switchToUpload,
  ]);

  const showImportButton = currentSection !== "search";
  const importDisabled =
    (currentSection === "paste" && pasteText.trim().length === 0) ||
    (currentSection === "upload" && pendingFile === null) ||
    selectingResultId !== null;

  const handleImportClick = currentSection === "paste" ? handleImportPaste : handleImportUpload;

  const pendingFileLabel = pendingFile ? pendingFile.name : null;

  return (
    <Modal isOpen onClose={close} title="Import Lyrics" className="max-w-lg">
      <div
        className="relative flex flex-col gap-4"
        onDragEnter={handleModalDragEnter}
        onDragOver={handleModalDragOver}
        onDragLeave={handleModalDragLeave}
        onDrop={handleModalDrop}
      >
        {sectionBody}

        {pendingFileLabel && currentSection === "upload" && (
          <div className="text-xs text-composer-text-muted">
            Ready to import: <span className="text-composer-text-secondary select-text">{pendingFileLabel}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={close}>
            Cancel
          </Button>
          {showImportButton && (
            <Button variant="primary" size="sm" hasIcon disabled={importDisabled} onClick={handleImportClick}>
              <IconFileImport size={16} />
              Import
            </Button>
          )}
        </div>

        <div
          aria-hidden={!isModalDragOver}
          className={cn(
            "absolute -inset-2 rounded-xl flex flex-col items-center justify-center gap-2 pointer-events-none transition-opacity",
            "bg-composer-bg-dark/90 border-2 border-composer-accent",
            isModalDragOver ? "opacity-100" : "opacity-0",
          )}
        >
          <IconUpload size={32} stroke={1.5} className="text-composer-accent" />
          <div className="text-sm font-medium text-composer-text">Drop lyrics file to import</div>
          <div className="font-mono text-[10.5px] tracking-tight text-composer-text opacity-50">
            .txt .lrc .srt .ttml
          </div>
        </div>
      </div>
    </Modal>
  );
};

// -- Exports ------------------------------------------------------------------

export { LyricsImportModalShell };
