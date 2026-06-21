import { Button } from "@/ui/button";
import { Modal } from "@/ui/modal";
import { Scroll } from "@/ui/scroll";
import type { Icon } from "@tabler/icons-react";
import { IconX } from "@tabler/icons-react";
import { useMemo, useState } from "react";

// -- Interfaces ----------------------------------------------------------------

interface SuggestionAction {
  label: string;
  rowLabel?: string;
  icon: Icon;
}

interface SuggestionsBannerProps<T extends { fingerprint: string }> {
  suggestions: T[];
  dismissed: string[];
  icon: Icon;
  iconClass: string;
  accentClass: string;
  modalTitle: string;
  multiText: (count: number) => React.ReactNode;
  modalCountText: (count: number) => React.ReactNode;
  accept: SuggestionAction;
  acceptAll: SuggestionAction;
  rowKey: (suggestion: T) => string;
  renderInline: (suggestion: T) => React.ReactNode;
  renderRow: (suggestion: T) => React.ReactNode;
  renderRowFooter?: (suggestion: T) => React.ReactNode;
  onAccept: (suggestion: T) => void;
  onDismiss: (suggestion: T) => void;
  onAcceptAll: (visible: T[]) => void;
  onDismissAll: (visible: T[]) => void;
}

interface SuggestionsModalProps<T extends { fingerprint: string }> {
  isOpen: boolean;
  onClose: () => void;
  suggestions: T[];
  title: string;
  icon: Icon;
  countText: (count: number) => React.ReactNode;
  accept: SuggestionAction;
  acceptAll: SuggestionAction;
  rowKey: (suggestion: T) => string;
  renderRow: (suggestion: T) => React.ReactNode;
  renderRowFooter?: (suggestion: T) => React.ReactNode;
  onAccept: (suggestion: T) => void;
  onDismiss: (suggestion: T) => void;
  onAcceptAll: (visible: T[]) => void;
}

// -- Components ----------------------------------------------------------------

const AcceptButton: React.FC<{ action: SuggestionAction; label: string; onClick: () => void }> = ({
  action,
  label,
  onClick,
}) => {
  const Icon = action.icon;
  return (
    <Button size="sm" variant="primary" hasIcon onClick={onClick}>
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
};

const DismissButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <Button size="icon" variant="ghost" onClick={onClick} className="size-7" aria-label={label}>
    <IconX className="size-4" />
  </Button>
);

function SuggestionsBanner<T extends { fingerprint: string }>(props: SuggestionsBannerProps<T>): React.ReactNode {
  const {
    suggestions,
    dismissed,
    icon: LeadingIcon,
    iconClass,
    accentClass,
    modalTitle,
    multiText,
    modalCountText,
    accept,
    acceptAll,
    rowKey,
    renderInline,
    renderRow,
    renderRowFooter,
    onAccept,
    onDismiss,
    onAcceptAll,
    onDismissAll,
  } = props;
  const [modalOpen, setModalOpen] = useState(false);

  const visible = useMemo(() => {
    const dismissedSet = new Set(dismissed);
    return suggestions.filter((suggestion) => !dismissedSet.has(suggestion.fingerprint));
  }, [suggestions, dismissed]);

  if (visible.length === 0 && modalOpen) setModalOpen(false);

  if (visible.length === 0) return null;

  const shellClass = `flex items-center justify-between gap-3 px-4 py-2 border-b border-composer-border ${accentClass} text-sm`;

  return (
    <>
      {visible.length === 1 ? (
        <div className={shellClass}>
          <div className="flex items-center gap-2 min-w-0">
            <LeadingIcon className={`size-4 shrink-0 ${iconClass}`} />
            <span className="text-composer-text truncate">{renderInline(visible[0])}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <AcceptButton action={accept} label={accept.label} onClick={() => onAccept(visible[0])} />
            <DismissButton label="Dismiss suggestion" onClick={() => onDismiss(visible[0])} />
          </div>
        </div>
      ) : (
        <div className={shellClass}>
          <div className="flex items-center gap-2 min-w-0">
            <LeadingIcon className={`size-4 shrink-0 ${iconClass}`} />
            <span className="text-composer-text truncate">{multiText(visible.length)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="primary" onClick={() => setModalOpen(true)}>
              Review {visible.length}
            </Button>
            <DismissButton label="Dismiss all suggestions" onClick={() => onDismissAll(visible)} />
          </div>
        </div>
      )}
      <SuggestionsModal
        isOpen={modalOpen && visible.length > 0}
        onClose={() => setModalOpen(false)}
        suggestions={visible}
        title={modalTitle}
        icon={LeadingIcon}
        countText={modalCountText}
        accept={accept}
        acceptAll={acceptAll}
        rowKey={rowKey}
        renderRow={renderRow}
        renderRowFooter={renderRowFooter}
        onAccept={onAccept}
        onDismiss={onDismiss}
        onAcceptAll={onAcceptAll}
      />
    </>
  );
}

function SuggestionsModal<T extends { fingerprint: string }>(props: SuggestionsModalProps<T>): React.ReactNode {
  const {
    isOpen,
    onClose,
    suggestions,
    title,
    icon: LeadingIcon,
    countText,
    accept,
    acceptAll,
    rowKey,
    renderRow,
    renderRowFooter,
    onAccept,
    onDismiss,
    onAcceptAll,
  } = props;
  const AcceptAllIcon = acceptAll.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-xl" bodyClassName="p-0">
      <div className="px-5 py-3 border-b border-composer-border flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-composer-text-muted min-w-0">
          <LeadingIcon className="size-4 text-composer-text shrink-0 opacity-50" />
          <span className="truncate">{countText(suggestions.length)}</span>
        </div>
        {suggestions.length > 1 && (
          <Button
            size="sm"
            variant="primary"
            hasIcon
            onClick={() => onAcceptAll(suggestions)}
            className="h-6 pl-1.5 pr-2 text-[11px]"
          >
            <AcceptAllIcon className="size-3" />
            {acceptAll.label}
          </Button>
        )}
      </div>
      <Scroll className="max-h-[60vh]">
        <ul className="divide-y divide-composer-border">
          {suggestions.map((suggestion) => (
            <li key={rowKey(suggestion)} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex flex-col gap-0.5">{renderRow(suggestion)}</div>
                <div className="flex items-center gap-1 shrink-0">
                  <AcceptButton
                    action={accept}
                    label={accept.rowLabel ?? accept.label}
                    onClick={() => onAccept(suggestion)}
                  />
                  <DismissButton label="Dismiss suggestion" onClick={() => onDismiss(suggestion)} />
                </div>
              </div>
              {renderRowFooter?.(suggestion)}
            </li>
          ))}
        </ul>
      </Scroll>
    </Modal>
  );
}

// -- Exports -------------------------------------------------------------------

export { SuggestionsBanner };
