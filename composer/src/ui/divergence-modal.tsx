import { useState } from "react";
import { useDivergenceStore } from "@/stores/divergence-store";
import { Button } from "@/ui/button";
import { Modal } from "@/ui/modal";
import { MOD_KEY } from "@/utils/platform";

// -- Component ----------------------------------------------------------------

const DivergenceModalHost: React.FC = () => {
  const isOpen = useDivergenceStore((s) => s.isOpen);
  const options = useDivergenceStore((s) => s.options);
  const resolveAndClose = useDivergenceStore((s) => s.resolveAndClose);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!isOpen || !options) return null;

  const close = (value: "apply" | "detach" | "cancel") => {
    const pref = dontAskAgain && value !== "cancel" ? value : null;
    resolveAndClose(value, pref);
    setDontAskAgain(false);
  };

  const { affectedSiblingCount, groupLabel } = options;
  const groupName = groupLabel ?? "this group";
  const siblingNoun = affectedSiblingCount === 1 ? "instance" : "instances";

  return (
    <Modal isOpen onClose={() => close("cancel")} title="Word structure changed" className="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="text-sm text-composer-text-secondary leading-relaxed select-text">
          You changed the word count on a line in <strong>{groupName}</strong>. {affectedSiblingCount} other{" "}
          {siblingNoun} will be affected.
          <br />
          <br />
          <strong>Apply to all</strong> (recommended)
          <br />
          Mirrors the new word structure across every instance. Words that didn't actually change keep their existing
          timing, so per-instance rhythms you've already tuned stay intact. Only the split or merged word's slot gets
          re-divided.
          <br />
          <br />
          <strong>Detach</strong>
          <br />
          Keeps the change on this line only and unlinks it from the group. Other instances stay exactly as they were.
        </div>
        <div className="text-xs text-composer-text-muted">This can be undone with {MOD_KEY}+Z.</div>

        <div className="flex items-center justify-between pt-2">
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
          <div className="flex gap-2 select-none">
            <Button variant="secondary" size="sm" onClick={() => close("cancel")}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => close("detach")}>
              Detach
            </Button>
            <Button
              size="sm"
              onClick={() => close("apply")}
              className="bg-composer-accent-dark hover:bg-composer-accent text-white"
            >
              Apply to all
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// -- Exports ------------------------------------------------------------------

export { DivergenceModalHost };
