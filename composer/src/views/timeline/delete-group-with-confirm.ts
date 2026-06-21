import { useConfirmStore } from "@/stores/confirm-store";
import { useProjectStore } from "@/stores/project";
import { showGroupActionToast } from "@/utils/group-toast";

// -- Types --------------------------------------------------------------------

interface DeleteGroupConfirmArgs {
  groupId: string;
  groupLabel: string;
  instanceCount: number;
}

// -- Operation -----------------------------------------------------------------

async function deleteGroupWithConfirm({ groupId, groupLabel, instanceCount }: DeleteGroupConfirmArgs): Promise<void> {
  const ok = await useConfirmStore.getState().open({
    title: `Delete the "${groupLabel}" group?`,
    description: `All ${instanceCount} instance${instanceCount === 1 ? "" : "s"} will become standalone lines. They keep their text and timing, but stop updating together.`,
    confirmLabel: "Delete group",
    variant: "destructive",
    settingsKey: "confirmGroupDissolution",
    recoverable: true,
  });
  if (!ok) return;
  useProjectStore.getState().removeGroup(groupId);
  showGroupActionToast("Group deleted");
}

// -- Exports -------------------------------------------------------------------

export { deleteGroupWithConfirm };
