import { describe, expect, it } from "vitest";
import { ExplicitSuggestionsBanner } from "@/views/timeline/explicit-suggestions-banner";
import { useProjectStore } from "@/stores/project";
import { createLine } from "@/test/factories";
import { render } from "@/test/render";

describe("ExplicitSuggestionsBanner", () => {
  it("renders nothing when there are no explicit-word suggestions", async () => {
    useProjectStore.setState({ lines: [createLine({ text: "innocuous line" })] });
    const screen = await render(<ExplicitSuggestionsBanner />);
    expect(screen.container.textContent ?? "").toBe("");
  });

  it("marks the word explicit when the single-suggestion 'Mark explicit' button is clicked", async () => {
    useProjectStore.setState({
      lines: [
        createLine({
          id: "L1",
          text: "fuck this",
          words: [
            { text: "fuck ", begin: 0, end: 0.5 },
            { text: "this", begin: 0.5, end: 1 },
          ],
        }),
      ],
    });
    const screen = await render(<ExplicitSuggestionsBanner />);
    expect(screen.container.textContent ?? "").toContain("Possibly explicit word");

    await screen.getByRole("button", { name: /mark explicit/i }).click();
    expect(useProjectStore.getState().lines[0].words?.[0].explicit).toBe(true);
  });

  it("opens the review modal for multiple suggestions", async () => {
    useProjectStore.setState({
      lines: [createLine({ id: "L1", text: "fuck this" }), createLine({ id: "L2", text: "oh shit" })],
    });
    const screen = await render(<ExplicitSuggestionsBanner />);
    expect(screen.container.textContent ?? "").toContain("Found 2");

    await screen.getByRole("button", { name: /review 2/i }).click();
    await expect.element(screen.getByRole("button", { name: /mark all/i })).toBeInTheDocument();
  });

  it("marks every suggestion when 'Mark all' is clicked in the modal", async () => {
    useProjectStore.setState({
      lines: [
        createLine({
          id: "L1",
          text: "fuck this",
          words: [
            { text: "fuck ", begin: 0, end: 0.5 },
            { text: "this", begin: 0.5, end: 1 },
          ],
        }),
        createLine({
          id: "L2",
          text: "oh shit",
          words: [
            { text: "oh ", begin: 1, end: 1.5 },
            { text: "shit", begin: 1.5, end: 2 },
          ],
        }),
      ],
    });
    const screen = await render(<ExplicitSuggestionsBanner />);

    await screen.getByRole("button", { name: /review 2/i }).click();
    await screen.getByRole("button", { name: /mark all/i }).click();

    const lines = useProjectStore.getState().lines;
    expect(lines[0].words?.[0].explicit).toBe(true);
    expect(lines[1].words?.[1].explicit).toBe(true);
  });

  it("dismissing the single suggestion hides the banner", async () => {
    useProjectStore.setState({
      lines: [
        createLine({
          id: "L1",
          text: "fuck this",
          words: [
            { text: "fuck ", begin: 0, end: 0.5 },
            { text: "this", begin: 0.5, end: 1 },
          ],
        }),
      ],
    });
    const screen = await render(<ExplicitSuggestionsBanner />);

    await screen.getByRole("button", { name: "Dismiss suggestion" }).click();

    expect(useProjectStore.getState().dismissedExplicitSuggestions).toHaveLength(1);
    await expect.poll(() => screen.container.textContent ?? "").toBe("");
  });

  it("highlights the whole word in the modal snippet for a syllable-split profanity", async () => {
    useProjectStore.setState({
      lines: [createLine({ id: "L1", text: "I fu|cking love it" }), createLine({ id: "L2", text: "oh shit" })],
    });
    const screen = await render(<ExplicitSuggestionsBanner />);

    await screen.getByRole("button", { name: /review 2/i }).click();
    await expect.element(screen.getByText("fu|cking", { exact: true })).toBeInTheDocument();
  });
});
