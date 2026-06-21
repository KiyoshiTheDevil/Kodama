import { getEffectiveKeysArray, useShortcutBindingsStore } from "@/stores/shortcut-bindings";
import type { ShortcutBinding, ShortcutDefinition } from "@/stores/shortcut-registry";
import { Button } from "@/ui/button";
import { KeyBadge } from "@/ui/shortcut-reference";
import { Modal } from "@/ui/modal";
import { isMac } from "@/utils/platform";
import { detectConflicts, isReservedBrowserShortcut } from "@/utils/shortcut-matcher";
import { useCallback, useEffect, useState } from "react";

// -- Types --------------------------------------------------------------------

interface ShortcutRebindRowProps {
  definition: ShortcutDefinition;
}

type CaptureState =
  | { status: "idle" }
  | { status: "listening" }
  | { status: "warning"; newBinding: ShortcutBinding }
  | { status: "conflict"; newBinding: ShortcutBinding; conflicts: ShortcutDefinition[] };

// -- Component ----------------------------------------------------------------

const ShortcutRebindRow: React.FC<ShortcutRebindRowProps> = ({ definition }) => {
  const [captureState, setCaptureState] = useState<CaptureState>({ status: "idle" });
  const setBinding = useShortcutBindingsStore((s) => s.setBinding);
  const resetBinding = useShortcutBindingsStore((s) => s.resetBinding);
  const overrides = useShortcutBindingsStore((s) => s.overrides);
  const isOverridden = definition.id in overrides;

  const keys = getEffectiveKeysArray(definition.id);

  const startCapture = useCallback(() => {
    setCaptureState({ status: "listening" });
  }, []);

  const cancelCapture = useCallback(() => {
    setCaptureState({ status: "idle" });
  }, []);

  const applyBinding = useCallback(
    (binding: ShortcutBinding, conflicting: ShortcutDefinition[]) => {
      for (const c of conflicting) {
        resetBinding(c.id);
      }
      setBinding(definition.id, binding);
      setCaptureState({ status: "idle" });
    },
    [definition.id, setBinding, resetBinding],
  );

  const continueFromWarning = useCallback(
    (binding: ShortcutBinding) => {
      const conflicts = detectConflicts(definition.id, binding);
      if (conflicts.length > 0) {
        setCaptureState({ status: "conflict", newBinding: binding, conflicts });
      } else {
        setBinding(definition.id, binding);
        setCaptureState({ status: "idle" });
      }
    },
    [definition.id, setBinding],
  );

  useEffect(() => {
    if (captureState.status !== "listening") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        cancelCapture();
        return;
      }

      if (e.key === "Shift" || e.key === "Alt" || e.key === "Control" || e.key === "Meta") return;

      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      const rawCtrl = isMac ? e.ctrlKey : false;
      const rawMeta = isMac ? false : e.metaKey;

      const newBinding: ShortcutBinding = {
        key: e.key,
        ...(e.shiftKey && { shift: true }),
        ...(e.altKey && { alt: true }),
        ...(modPressed && { mod: true }),
        ...(rawCtrl && { ctrl: true }),
        ...(rawMeta && { meta: true }),
      };

      if (isReservedBrowserShortcut(newBinding)) {
        setCaptureState({ status: "warning", newBinding });
        return;
      }

      const conflicts = detectConflicts(definition.id, newBinding);
      if (conflicts.length > 0) {
        setCaptureState({ status: "conflict", newBinding, conflicts });
      } else {
        setBinding(definition.id, newBinding);
        setCaptureState({ status: "idle" });
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [captureState.status, definition.id, setBinding, cancelCapture]);

  return (
    <>
      <div className="flex items-center justify-between py-2.5">
        <span className="text-sm text-composer-text-secondary">{definition.description}</span>
        <div className="flex items-center gap-2">
          {isOverridden && (
            <button
              type="button"
              onClick={() => resetBinding(definition.id)}
              className="text-xs text-composer-text-muted hover:text-composer-text cursor-pointer transition-colors"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={startCapture}
            className="flex items-center gap-1 cursor-pointer rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-composer-button/50"
          >
            {keys.length === 0 ? (
              <span className="text-xs text-composer-text-muted italic">Unbound</span>
            ) : (
              keys.map((key) => <KeyBadge key={key} keyName={key} />)
            )}
          </button>
        </div>
      </div>

      <Modal isOpen={captureState.status === "listening"} onClose={cancelCapture} title="Rebind shortcut">
        <div className="text-center py-4">
          <p className="text-sm text-composer-text-secondary mb-1">Press a new key combination</p>
          <p className="text-xs text-composer-text-muted">Press Escape to cancel</p>
        </div>
      </Modal>

      {captureState.status === "warning" && (
        <BrowserWarningModal
          binding={captureState.newBinding}
          onContinue={() => continueFromWarning(captureState.newBinding)}
          onCancel={cancelCapture}
        />
      )}

      {captureState.status === "conflict" && (
        <ConflictModal
          newBinding={captureState.newBinding}
          conflicts={captureState.conflicts}
          onReplace={() => applyBinding(captureState.newBinding, captureState.conflicts)}
          onCancel={cancelCapture}
        />
      )}
    </>
  );
};

// -- Browser Warning Modal ----------------------------------------------------

const BrowserWarningModal: React.FC<{
  binding: ShortcutBinding;
  onContinue: () => void;
  onCancel: () => void;
}> = ({ binding, onCancel, onContinue }) => {
  const displayKey = binding.key === " " ? "Space" : binding.key;
  const bindingKeys: string[] = [];
  if (binding.mod) bindingKeys.push("Mod");
  if (binding.meta) bindingKeys.push("Meta");
  if (binding.ctrl) bindingKeys.push("Ctrl");
  if (binding.shift) bindingKeys.push("Shift");
  if (binding.alt) bindingKeys.push("Alt");
  bindingKeys.push(displayKey);

  return (
    <Modal isOpen onClose={onCancel} title="Browser shortcut">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-composer-text">
          <span className="inline-flex items-center gap-1">
            {bindingKeys.map((key) => (
              <KeyBadge key={key} keyName={key} />
            ))}
          </span>
          <span className="text-composer-text-secondary">may be reserved by the browser.</span>
        </div>
        <p className="text-xs text-composer-text-muted">
          This combination might be handled by your browser before it reaches the app. You can still assign it, but it
          may not work in all browsers.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onContinue}>
            Assign anyway
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// -- Conflict Modal -----------------------------------------------------------

const SCOPE_LABELS: Record<string, string> = {
  global: "General",
  sync: "Sync Mode",
  timeline: "Timeline Mode",
};

const ConflictModal: React.FC<{
  newBinding: ShortcutBinding;
  conflicts: ShortcutDefinition[];
  onReplace: () => void;
  onCancel: () => void;
}> = ({ newBinding, conflicts, onReplace, onCancel }) => {
  const displayKey = newBinding.key === " " ? "Space" : newBinding.key;
  const bindingKeys: string[] = [];
  if (newBinding.mod) bindingKeys.push("Mod");
  if (newBinding.meta) bindingKeys.push("Meta");
  if (newBinding.ctrl) bindingKeys.push("Ctrl");
  if (newBinding.shift) bindingKeys.push("Shift");
  if (newBinding.alt) bindingKeys.push("Alt");
  bindingKeys.push(displayKey);

  return (
    <Modal isOpen onClose={onCancel} title="Shortcut conflict">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-composer-text">
          <span className="inline-flex items-center gap-1">
            {bindingKeys.map((key) => (
              <KeyBadge key={key} keyName={key} />
            ))}
          </span>
          <span className="text-composer-text-secondary">is already used by:</span>
        </div>

        <div className="rounded-lg bg-composer-bg-elevated border border-composer-border divide-y divide-composer-border">
          {conflicts.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm text-composer-text">{c.description}</span>
              <span className="text-xs text-composer-text-muted">{SCOPE_LABELS[c.scope] ?? c.scope}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-composer-text-muted">
          Replacing will reset the conflicting shortcut to its default.
        </p>

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onReplace}>
            Replace
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// -- Exports ------------------------------------------------------------------

export { ShortcutRebindRow };
