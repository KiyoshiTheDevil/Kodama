import { useProjectStore } from "@/stores/project";
import { type ExplicitSuggestion, findExplicitWords } from "@/utils/explicit-detection";
import { getExplicitSnippet } from "@/utils/explicit-snippet";
import { SuggestionsBanner } from "@/views/timeline/suggestions-banner";
import { IconAlertTriangle, IconLink } from "@tabler/icons-react";
import { useMemo } from "react";

const INLINE_WORD_MAX = 32;
const MODAL_LINE_MAX = 80;
const MAX_LINE_NUMBERS_SHOWN = 4;

const ExplicitSuggestionsBanner: React.FC = () => {
  const lines = useProjectStore((s) => s.lines);
  const groups = useProjectStore((s) => s.groups);
  const dismissed = useProjectStore((s) => s.dismissedExplicitSuggestions);
  const dismissExplicitSuggestion = useProjectStore((s) => s.dismissExplicitSuggestion);
  const toggleWordExplicit = useProjectStore((s) => s.toggleWordExplicit);
  const markWordsExplicit = useProjectStore((s) => s.markWordsExplicit);

  const suggestions = useMemo(() => findExplicitWords(lines, groups), [lines, groups]);
  const lineMap = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const acceptOne = (s: ExplicitSuggestion) => {
    toggleWordExplicit(s.lineId, s.field, s.wordIndices);
  };

  const dismissOne = (s: ExplicitSuggestion) => dismissExplicitSuggestion(s.fingerprint);

  const dismissAll = (visible: ExplicitSuggestion[]) => {
    for (const s of visible) dismissExplicitSuggestion(s.fingerprint);
  };

  const acceptAll = (visible: ExplicitSuggestion[]) => {
    markWordsExplicit(
      visible.flatMap((s) => s.wordIndices.map((wordIndex) => ({ lineId: s.lineId, field: s.field, wordIndex }))),
      true,
    );
  };

  return (
    <SuggestionsBanner<ExplicitSuggestion>
      suggestions={suggestions}
      dismissed={dismissed}
      icon={IconAlertTriangle}
      iconClass="text-composer-warning"
      accentClass="bg-composer-warning/8"
      modalTitle="Explicit-word suggestions"
      multiText={(count) => `Found ${count} possibly explicit words across your lyrics`}
      modalCountText={(count) => `${count} possibly explicit word${count === 1 ? "" : "s"} detected`}
      accept={{ label: "Mark explicit", rowLabel: "Mark", icon: IconAlertTriangle }}
      acceptAll={{ label: "Mark all", icon: IconAlertTriangle }}
      rowKey={(s) => s.fingerprint}
      renderInline={(s) => (
        <>
          Possibly explicit word:{" "}
          <span className="text-composer-text-secondary">"{truncate(s.word, INLINE_WORD_MAX)}"</span>
          {s.linked ? <LinkedPill linked={s.linked} /> : null}
        </>
      )}
      renderRow={(s) => {
        const line = lineMap.get(s.lineId);
        const source = (s.field === "words" ? line?.text : line?.backgroundText) ?? "";
        return (
          <>
            <span className="text-sm text-composer-text">
              <span className="text-composer-explicit font-medium">"{s.word}"</span>
              <span className="text-composer-text-muted"> · {s.field === "words" ? "main" : "background"}</span>
              {s.linked ? <LinkedPill linked={s.linked} /> : null}
            </span>
            <span className="text-xs text-composer-text-muted truncate">
              {formatLineLocation(s)} · <SnippetPreview source={source} wordIndices={s.wordIndices} />
            </span>
          </>
        );
      }}
      onAccept={acceptOne}
      onDismiss={dismissOne}
      onAcceptAll={acceptAll}
      onDismissAll={dismissAll}
    />
  );
};

const LinkedPill: React.FC<{ linked: NonNullable<ExplicitSuggestion["linked"]> }> = ({ linked }) => (
  <span
    className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border align-middle"
    style={{
      backgroundColor: "color-mix(in srgb, var(--color-composer-accent) 18%, transparent)",
      borderColor: "color-mix(in srgb, var(--color-composer-accent) 32%, transparent)",
      color: "var(--color-composer-accent-text)",
    }}
  >
    <IconLink className="size-2.5" />
    {linked.groupLabel} × {linked.instanceCount}
  </span>
);

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

const SnippetPreview: React.FC<{ source: string; wordIndices: number[] }> = ({ source, wordIndices }) => {
  const trimmed = source.trim();
  if (trimmed.length === 0) return <span>(empty line)</span>;
  const snippet = getExplicitSnippet(source, wordIndices, MODAL_LINE_MAX);
  if (!snippet) return <span>{truncate(trimmed, MODAL_LINE_MAX)}</span>;
  return (
    <span>
      {snippet.leadingEllipsis ? "…" : ""}
      {snippet.before}
      <span className="text-composer-explicit/75 font-medium">{snippet.word}</span>
      {snippet.after}
      {snippet.trailingEllipsis ? "…" : ""}
    </span>
  );
};

function formatLineLocation(s: ExplicitSuggestion): string {
  if (!s.linked) return `line ${s.lineIndex + 1}`;
  const indices = s.linked.instances.map((i) => i.lineIndex + 1).sort((a, b) => a - b);
  if (indices.length <= MAX_LINE_NUMBERS_SHOWN) {
    return `lines ${indices.join(", ")}`;
  }
  const shown = indices.slice(0, MAX_LINE_NUMBERS_SHOWN).join(", ");
  return `lines ${shown} +${indices.length - MAX_LINE_NUMBERS_SHOWN} more`;
}

export { ExplicitSuggestionsBanner };
