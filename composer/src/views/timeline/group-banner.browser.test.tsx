import { describe, expect, it } from "vitest";
import { GroupBanner } from "@/views/timeline/group-banner";
import { useProjectStore } from "@/stores/project";
import { createGroup } from "@/test/factories";
import { render } from "@/test/render";

describe("GroupBanner", () => {
  it("renders the group label", async () => {
    const group = createGroup({ label: "Chorus" });
    useProjectStore.setState({ groups: [group], lines: [] });
    const screen = await render(
      <GroupBanner
        group={group}
        instanceIdx={0}
        totalInstances={1}
        instanceStart={0}
        instanceEnd={5}
        isCollapsed={false}
        zoom={50}
      />,
    );
    expect(screen.container.textContent).toContain("Chorus");
  });

  it("renders instance numbering when multiple instances exist", async () => {
    const group = createGroup({ label: "Verse" });
    useProjectStore.setState({ groups: [group], lines: [] });
    const screen = await render(
      <GroupBanner
        group={group}
        instanceIdx={1}
        totalInstances={3}
        instanceStart={0}
        instanceEnd={5}
        isCollapsed={false}
        zoom={50}
      />,
    );
    expect(screen.container.textContent).toContain("Verse");
  });
});
