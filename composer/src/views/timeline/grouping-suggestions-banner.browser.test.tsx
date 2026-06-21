import { describe, expect, it } from "vitest";
import { GroupingSuggestionsBanner } from "@/views/timeline/grouping-suggestions-banner";
import { useProjectStore } from "@/stores/project";
import { render } from "@/test/render";

describe("GroupingSuggestionsBanner", () => {
  it("renders nothing for an empty project", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<GroupingSuggestionsBanner />);
    expect(screen.container.textContent ?? "").toBe("");
  });
});
