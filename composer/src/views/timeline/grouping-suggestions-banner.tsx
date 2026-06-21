import { useProjectStore } from "@/stores/project";
import { findRepeatingStandaloneSections, type RepeatingSection } from "@/views/timeline/repeating-sections";
import { SuggestionsBanner } from "@/views/timeline/suggestions-banner";
import { IconBulb, IconLink } from "@tabler/icons-react";
import { useMemo } from "react";

const INLINE_LINE_MAX = 32;
const MODAL_LINE_MAX = 80;
const MODAL_LINE_LIMIT = 6;

const GroupingSuggestionsBanner: React.FC = () => {
  const lines = useProjectStore((s) => s.lines);
  const dismissed = useProjectStore((s) => s.dismissedSuggestions);
  const groupRepeatingSections = useProjectStore((s) => s.groupRepeatingSections);
  const dismissSuggestion = useProjectStore((s) => s.dismissSuggestion);

  const suggestions = useMemo(() => findRepeatingStandaloneSections(lines), [lines]);

  const dismissOne = (s: RepeatingSection) => dismissSuggestion(s.fingerprint);

  const dismissAll = (visible: RepeatingSection[]) => {
    for (const s of visible) dismissSuggestion(s.fingerprint);
  };

  const acceptOne = (s: RepeatingSection) => {
    groupRepeatingSections(s.starts, s.length);
  };

  const acceptAll = (visible: RepeatingSection[]) => {
    for (const s of visible) groupRepeatingSections(s.starts, s.length);
  };

  return (
    // react-doctor-disable-next-line react-doctor/no-render-prop-children
    <SuggestionsBanner<RepeatingSection>
      suggestions={suggestions}
      dismissed={dismissed}
      icon={IconBulb}
      iconClass="text-composer-accent"
      accentClass="bg-composer-accent/8"
      modalTitle="Grouping suggestions"
      multiText={(count) => `Found ${count} grouping suggestions across your lyrics`}
      modalCountText={(count) => `${count} repeating section${count === 1 ? "" : "s"} detected`}
      accept={{ label: "Group them", rowLabel: "Group", icon: IconLink }}
      acceptAll={{ label: "Group all", icon: IconLink }}
      rowKey={suggestionKey}
      renderInline={(s) => summarizeInline(s)}
      renderRow={(s) => (
        <>
          <span className="text-sm text-composer-text">
            {s.starts.length} runs · {s.length} line{s.length === 1 ? "" : "s"} each
          </span>
          <span className="text-xs text-composer-text-muted">
            At lines {s.starts.map((start) => `${start + 1} to ${start + s.length}`).join(", ")}
          </span>
        </>
      )}
      renderRowFooter={(s) => <BlockPreview lines={s.previewLines} />}
      onAccept={acceptOne}
      onDismiss={dismissOne}
      onAcceptAll={acceptAll}
      onDismissAll={dismissAll}
    />
  );
};

const BlockPreview: React.FC<{ lines: string[] }> = ({ lines }) => {
  const display = collapseLines(lines, MODAL_LINE_LIMIT);
  return (
    <div className="rounded-md border border-composer-border bg-composer-bg-elevated/60 px-3 py-2 text-xs text-composer-text-secondary whitespace-pre-wrap break-words">
      {display.map((entry, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable order from collapseLines
        <div key={idx} className={entry.kind === "ellipsis" ? "text-composer-text-muted" : undefined}>
          {entry.kind === "line" ? truncate(entry.text.trim() || "(empty line)", MODAL_LINE_MAX) : "…"}
        </div>
      ))}
    </div>
  );
};

function suggestionKey(s: RepeatingSection): string {
  return `${s.starts.join(",")}:${s.length}`;
}

function summarizeInline(s: RepeatingSection): React.ReactNode {
  const trimmedLines = s.previewLines.map((t) => t.trim() || "(empty line)");
  const lengthSuffix = ` (${s.length} line${s.length === 1 ? "" : "s"} each)`;

  if (trimmedLines.length === 1) {
    return (
      <>
        {s.starts.length} runs of{" "}
        <span className="text-composer-text-secondary">"{truncate(trimmedLines[0], INLINE_LINE_MAX)}"</span>
      </>
    );
  }

  if (trimmedLines.length === 2) {
    return (
      <>
        {s.starts.length} runs of{" "}
        <span className="text-composer-text-secondary">"{truncate(trimmedLines[0], INLINE_LINE_MAX)}"</span> /{" "}
        <span className="text-composer-text-secondary">"{truncate(trimmedLines[1], INLINE_LINE_MAX)}"</span>
        {lengthSuffix}
      </>
    );
  }

  const first = truncate(trimmedLines[0], INLINE_LINE_MAX);
  const last = truncate(trimmedLines[trimmedLines.length - 1], INLINE_LINE_MAX);
  return (
    <>
      {s.starts.length} runs of <span className="text-composer-text-secondary">"{first}"</span> ...{" "}
      <span className="text-composer-text-secondary">"{last}"</span>
      {lengthSuffix}
    </>
  );
}

type CollapsedEntry = { kind: "line"; text: string } | { kind: "ellipsis" };

function collapseLines(lines: string[], limit: number): CollapsedEntry[] {
  if (lines.length <= limit) return lines.map((text) => ({ kind: "line", text }));
  const head = Math.ceil((limit - 1) / 2);
  const tail = Math.floor((limit - 1) / 2);
  const out: CollapsedEntry[] = [];
  for (let i = 0; i < head; i++) out.push({ kind: "line", text: lines[i] });
  out.push({ kind: "ellipsis" });
  for (let i = lines.length - tail; i < lines.length; i++) out.push({ kind: "line", text: lines[i] });
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

export { GroupingSuggestionsBanner };
