import { useCallback, useRef } from "react";
import { useAudioStore } from "@/stores/audio";
import { useConfirm } from "@/stores/confirm-store";
import { useImportModalStore } from "@/stores/import-modal-store";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { parseLyricsFile } from "@/utils/lyrics-parsers";
import { importParsedLyrics } from "@/views/lyrics-import-modal/use-import-modal-actions";

// -- Constants ----------------------------------------------------------------

const SINGLE_CLICK_DELAY_MS = 220;
const ACCEPTED_FILE_INPUT = ".txt,.lrc,.srt,.ttml,.xml";

// -- Hook ---------------------------------------------------------------------

interface DualClickImportHandlers {
  onClick: () => void;
  onDoubleClick: () => void;
  fileInput: React.ReactElement;
}

function useDualClickImport(openModal: () => void): DualClickImportHandlers {
  const confirm = useConfirm();
  const agents = useProjectStore((s) => s.agents);
  const audioDuration = useAudioStore((s) => s.duration);
  const autoExtract = useSettingsStore((s) => s.autoExtractBackgroundVocals);
  const mergeStandalone = useSettingsStore((s) => s.mergeStandaloneBackgroundLines);
  const preserveBrackets = useSettingsStore((s) => s.preserveBracketsOnExtraction);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  const triggerDirectUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onClick = useCallback(() => {
    if (clickTimerRef.current !== null) return;
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      openModal();
    }, SINGLE_CLICK_DELAY_MS);
  }, [openModal]);

  const onDoubleClick = useCallback(() => {
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    triggerDirectUpload();
  }, [triggerDirectUpload]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const content = await file.text();
      const parsed = parseLyricsFile(file.name, content, audioDuration > 0 ? audioDuration : undefined);
      await importParsedLyrics(parsed, {
        confirm,
        agents,
        audioDuration,
        applyBackgroundExtraction: autoExtract,
        backgroundExtractionMergeStandalone: mergeStandalone,
        backgroundExtractionPreserveBrackets: preserveBrackets,
        source: { label: "File", filename: file.name },
        onResult: (parsedResult, source) => {
          useImportModalStore.getState().recordImportResult(parsedResult, source);
        },
      });
    },
    [agents, audioDuration, autoExtract, confirm, mergeStandalone, preserveBrackets],
  );

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      aria-label="Direct lyrics upload picker"
      accept={ACCEPTED_FILE_INPUT}
      onChange={handleFileChange}
      className="sr-only"
      tabIndex={-1}
    />
  );

  return { onClick, onDoubleClick, fileInput };
}

// -- Exports ------------------------------------------------------------------

export { useDualClickImport };
export type { DualClickImportHandlers };
