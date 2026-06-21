import { exportProjectToFile, importProjectFromFile, clearCurrentProject } from "@/lib/persistence";
import { cancelPendingSave } from "@/lib/persistence-debounce";
import { useAudioStore } from "@/stores/audio";
import { useConfirm } from "@/stores/confirm-store";
import { useProjectStore } from "@/stores/project";
import { DEFAULT_SYLLABLE_SPLIT_DEFAULTS } from "@/stores/project/types";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { Scroll } from "@/ui/scroll";
import { effectiveBounds } from "@/domain/line/bounds";
import { generateTTML } from "@/utils/ttml";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconEdit,
  IconFolderOpen,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { Highlight, themes } from "prism-react-renderer";
import { useCallback, useMemo, useRef, useState } from "react";

// -- Components ---------------------------------------------------------------

const ExportPanel: React.FC = () => {
  const metadata = useProjectStore((s) => s.metadata);
  const agents = useProjectStore((s) => s.agents);
  const lines = useProjectStore((s) => s.lines);
  const groups = useProjectStore((s) => s.groups);
  const granularity = useProjectStore((s) => s.granularity);
  const duration = useAudioStore((s) => s.duration);
  const setMetadata = useProjectStore((s) => s.setMetadata);
  const setLines = useProjectStore((s) => s.setLines);
  const setGranularity = useProjectStore((s) => s.setGranularity);
  const setAgents = useProjectStore((s) => s.setAgents);
  const reset = useProjectStore((s) => s.reset);
  const markClean = useProjectStore((s) => s.markClean);
  const confirm = useConfirm();

  const [copied, setCopied] = useState(false);
  const [editState, setEditState] = useState<{ source: string; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasSyncedContent = useMemo(() => {
    return lines.some((line) => effectiveBounds(line) !== null);
  }, [lines]);

  const syncedLineCount = useMemo(() => {
    return lines.filter((line) => effectiveBounds(line) !== null).length;
  }, [lines]);

  const generatedTtml = useMemo(() => {
    if (!hasSyncedContent) return "";
    return generateTTML({ metadata, agents, lines, groups, granularity, duration });
  }, [metadata, agents, lines, groups, granularity, duration, hasSyncedContent]);

  const minifiedTtml = useMemo(() => {
    if (!hasSyncedContent) return "";
    return generateTTML({ metadata, agents, lines, groups, granularity, minify: true, duration });
  }, [metadata, agents, lines, groups, granularity, duration, hasSyncedContent]);

  const editedContent = editState && editState.source === generatedTtml ? editState.content : null;
  const isEditing = editedContent !== null;
  const displayContent = editedContent ?? generatedTtml;
  const exportContent = editedContent ?? minifiedTtml;

  const handleDownload = useCallback(() => {
    if (!exportContent) return;

    const blob = new Blob([exportContent], {
      type: "application/ttml+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${metadata.title || "lyrics"}.ttml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportContent, metadata.title]);

  const handleCopy = useCallback(async () => {
    if (!exportContent) return;

    await navigator.clipboard.writeText(exportContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [exportContent]);

  const handleEdit = useCallback(() => {
    setEditState((prev) => (prev ? null : { source: generatedTtml, content: displayContent }));
  }, [generatedTtml, displayContent]);

  const handleRegenerate = useCallback(() => {
    setEditState(null);
  }, []);

  const handleExportProject = useCallback(() => {
    const audioSource = useAudioStore.getState().source;
    const audioFileName = audioSource?.type === "file" ? audioSource.file.name : undefined;
    const { dismissedSuggestions, dismissedExplicitSuggestions, syllableSplitDefaults } = useProjectStore.getState();
    exportProjectToFile(
      metadata,
      agents,
      lines,
      groups,
      granularity,
      syllableSplitDefaults,
      dismissedSuggestions,
      dismissedExplicitSuggestions,
      audioFileName,
    );
  }, [metadata, agents, lines, groups, granularity]);

  const handleImportProject = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const existingLineCount = useProjectStore.getState().lines.length;
      if (existingLineCount > 0) {
        const ok = await confirm({
          title: "Replace current project?",
          description: `Loading this project file will replace your ${existingLineCount} existing line${existingLineCount === 1 ? "" : "s"} and metadata. This cannot be undone.`,
          confirmLabel: "Replace",
          variant: "destructive",
          settingsKey: "confirmReplaceLyrics",
        });
        if (!ok) {
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      }

      const project = await importProjectFromFile(file);
      const store = useProjectStore.getState();
      setMetadata(project.metadata);
      setLines(project.lines);
      store.setGroups(project.groups ?? []);
      store.setDismissedSuggestions(project.dismissedSuggestions ?? []);
      store.setDismissedExplicitSuggestions(project.dismissedExplicitSuggestions ?? []);
      setGranularity(project.granularity);
      store.setSyllableSplitDefaults(project.syllableSplitDefaults ?? DEFAULT_SYLLABLE_SPLIT_DEFAULTS);
      setAgents(project.agents);
      markClean();

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [setMetadata, setLines, setGranularity, setAgents, markClean, confirm],
  );

  const handleClearProject = useCallback(async () => {
    const ok = await confirm({
      title: "Clear all project data?",
      description: "Remove every line, all metadata, and the audio file from this project. This cannot be undone.",
      confirmLabel: "Clear",
      variant: "destructive",
      settingsKey: "confirmClearProject",
    });
    if (!ok) return;
    cancelPendingSave();
    reset();
    await clearCurrentProject();
  }, [reset, confirm]);

  const projectFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      aria-label="Import project file"
      accept=".json,.ttml-project.json"
      onChange={handleImportProject}
      className="hidden"
    />
  );
  const importAction = (
    <>
      {projectFileInput}
      <Button hasIcon variant="secondary" onClick={() => fileInputRef.current?.click()} className="mt-2">
        <IconFolderOpen className="size-4 text-composer-text opacity-50" />
        Import Project
      </Button>
    </>
  );

  if (lines.length === 0) {
    return (
      <div className="flex flex-col flex-1 p-4">
        <EmptyState message="No lyrics to export" hint="Add lyrics in the Edit tab first" action={importAction} />
      </div>
    );
  }

  if (!hasSyncedContent) {
    return (
      <div className="flex flex-col flex-1 p-4">
        <EmptyState message="No synced content" hint="Sync lyrics in the Sync tab first" action={importAction} />
      </div>
    );
  }

  return (
    <div data-tour="export-panel" className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-composer-border">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-medium">Export</h2>
          <span className="text-sm text-composer-text-muted">
            {syncedLineCount}/{lines.length} lines synced
            {editedContent !== null && " · edited"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {editedContent !== null && (
            <Button hasIcon onClick={handleRegenerate}>
              <IconRefresh className="size-4" />
              Regenerate
            </Button>
          )}
          <Button hasIcon variant={isEditing ? "primary" : "secondary"} onClick={handleEdit}>
            <IconEdit className="size-4" />
            {isEditing ? "Done" : "Edit"}
          </Button>
          <Button hasIcon onClick={handleCopy}>
            {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button hasIcon variant="primary" onClick={handleDownload}>
            <IconDownload className="size-4" />
            Download TTML
          </Button>
        </div>
      </div>

      {/* Project management */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-composer-border bg-composer-bg-elevated/50">
        <span className="text-sm text-composer-text-muted">Project</span>
        <div className="flex items-center gap-2">
          {projectFileInput}
          <Button hasIcon variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            <IconFolderOpen className="size-4 text-composer-text opacity-50" />
            Import Project
          </Button>
          <Button hasIcon variant="ghost" size="sm" onClick={handleExportProject}>
            <IconUpload className="size-4 text-composer-text opacity-50" />
            Export Project
          </Button>
          <Button hasIcon variant="ghost" size="sm" onClick={handleClearProject}>
            <IconTrash className="size-4 text-composer-text opacity-50" />
            Clear
          </Button>
        </div>
      </div>

      {/* Preview / Editor */}
      <Scroll className="flex-1 p-6">
        {isEditing ? (
          <textarea
            value={editedContent ?? ""}
            aria-label="Edit TTML content"
            onChange={(e) => setEditState({ source: generatedTtml, content: e.target.value })}
            className="w-full h-full p-4 rounded-lg font-mono text-xs bg-composer-bg-elevated text-composer-text resize-none focus:outline-none focus:ring-1 focus:ring-composer-accent"
            spellCheck={false}
          />
        ) : (
          <Highlight theme={themes.nightOwl} code={displayContent} language="xml">
            {({ style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className="p-4 rounded-lg font-mono text-xs whitespace-pre-wrap break-all select-text"
                style={{
                  ...style,
                  background: "var(--color-composer-bg-elevated)",
                }}
              >
                {tokens.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable line indices
                  <div key={i} {...getLineProps({ line })}>
                    {line.map((token, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable token indices
                      <span key={j} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        )}
      </Scroll>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { ExportPanel };
