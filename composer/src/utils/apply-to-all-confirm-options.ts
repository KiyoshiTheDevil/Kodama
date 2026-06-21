import type { ConfirmOptions } from "@/stores/confirm-store";

// -- Types --------------------------------------------------------------------

interface ApplyToAllConfirmParams {
  identicalCount: number;
  sourceText: string;
}

// -- Helper -------------------------------------------------------------------

function buildApplyToAllConfirmOptions({ identicalCount, sourceText }: ApplyToAllConfirmParams): ConfirmOptions {
  return {
    title: `Split ${identicalCount + 1} matching "${sourceText}"?`,
    description: `Apply this split to the source and ${identicalCount} other ${
      identicalCount === 1 ? "match" : "matches"
    }.`,
    confirmLabel: "Split",
    cancelLabel: "Cancel",
    variant: "primary",
    settingsKey: "confirmApplyToAllSyllableSplit",
    recoverable: true,
  };
}

// -- Exports ------------------------------------------------------------------

export { buildApplyToAllConfirmOptions };
