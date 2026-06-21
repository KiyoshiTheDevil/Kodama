import { useState } from "react";
import { useConfirmStore } from "@/stores/confirm-store";
import { Button } from "@/ui/button";
import { Modal } from "@/ui/modal";
import { cn } from "@/utils/cn";
import { MOD_KEY } from "@/utils/platform";

// -- Component ----------------------------------------------------------------

const ConfirmModalHost: React.FC = () => {
  const isOpen = useConfirmStore((s) => s.isOpen);
  const options = useConfirmStore((s) => s.options);
  const resolveAndClose = useConfirmStore((s) => s.resolveAndClose);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleClose = () => {
    resolveAndClose(false, false);
    setDontAskAgain(false);
  };

  const handleConfirm = () => {
    resolveAndClose(true, dontAskAgain);
    setDontAskAgain(false);
  };

  if (!isOpen || !options) return null;

  const {
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "destructive",
    settingsKey,
    recoverable = false,
  } = options;

  const showDontAskAgain = Boolean(settingsKey);

  return (
    <Modal isOpen onClose={handleClose} title={title} className="max-w-md">
      <div className="flex flex-col gap-4">
        {description && (
          <div className="text-sm text-composer-text-secondary leading-relaxed select-text">{description}</div>
        )}
        {recoverable && <div className="text-xs text-composer-text-muted">This can be undone with {MOD_KEY}+Z.</div>}

        <div className={cn("flex items-center pt-2", showDontAskAgain ? "justify-between" : "justify-end")}>
          {showDontAskAgain && (
            <label className="flex items-center gap-2 text-xs text-composer-text-muted cursor-pointer select-none">
              {/* react-doctor-disable-next-line react-doctor/control-has-associated-label */}
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="size-3.5 rounded accent-composer-accent cursor-pointer"
              />
              Don't ask again
            </label>
          )}
          <div className="flex gap-2 select-none">
            <Button variant="secondary" size="sm" onClick={handleClose}>
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              className={cn(
                variant === "destructive"
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-composer-accent-dark hover:bg-composer-accent text-white",
              )}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// -- Exports ------------------------------------------------------------------

export { ConfirmModalHost };
