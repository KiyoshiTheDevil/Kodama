import { useProjectStore } from "@/stores/project";
import { toast } from "sonner";

// -- Constants -----------------------------------------------------------------

const GROUP_TOAST_DURATION_MS = 8000;

// -- Functions -----------------------------------------------------------------

function showGroupActionToast(message: string, undoFn?: () => void): void {
  toast.success(message, {
    duration: GROUP_TOAST_DURATION_MS,
    action: {
      label: "Undo",
      onClick: undoFn ?? (() => useProjectStore.getState().undo()),
    },
  });
}

// -- Exports -------------------------------------------------------------------

export { showGroupActionToast };
