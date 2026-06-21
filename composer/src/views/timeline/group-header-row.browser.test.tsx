import { describe, expect, it } from "vitest";
import { GroupHeaderRow } from "@/views/timeline/group-header-row";
import { useProjectStore } from "@/stores/project";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { createGroup, createLine } from "@/test/factories";
import { render } from "@/test/render";

describe("GroupHeaderRow", () => {
  it("renders the group banner", async () => {
    const group = createGroup({ label: "Chorus" });
    const line = createLine({ groupId: group.id, instanceIdx: 0, begin: 0, end: 2 });
    useProjectStore.setState({ groups: [group], lines: [line] });
    const screen = await render(
      <GroupHeaderRow group={group} instanceIdx={0} totalInstances={1} instanceStart={0} instanceEnd={2} />,
    );
    expect(screen.container.textContent).toContain("Chorus");
  });

  it("labels the rename input", async () => {
    const group = createGroup({ label: "Chorus" });
    const line = createLine({ groupId: group.id, instanceIdx: 0, begin: 0, end: 2 });
    useProjectStore.setState({ groups: [group], lines: [line] });
    useTimelineStore.getState().setRenamingGroupId(group.id, 0);
    const screen = await render(
      <GroupHeaderRow group={group} instanceIdx={0} totalInstances={1} instanceStart={0} instanceEnd={2} />,
    );
    await expect.element(screen.getByRole("textbox", { name: "Group name" })).toBeInTheDocument();
  });
});
