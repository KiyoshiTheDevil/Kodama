import { describe, expect, it } from "vitest";
import { ExportPanel } from "@/views/export";
import { useProjectStore } from "@/stores/project";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";

describe("ExportPanel", () => {
  it("shows the 'No lyrics to export' empty state when there are no lines", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<ExportPanel />);
    await expect.element(screen.getByText("No lyrics to export")).toBeInTheDocument();
  });

  it("labels the hidden project import input on the empty state", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<ExportPanel />);
    await expect.element(screen.getByLabelText("Import project file")).toBeInTheDocument();
  });

  it("labels the project import input and TTML editor on the main view", async () => {
    useProjectStore.setState({
      lines: [createLine({ text: "Hi", words: [createWord({ text: "Hi", begin: 0, end: 1 })] })],
    });
    const screen = await render(<ExportPanel />);
    await expect.element(screen.getByLabelText("Import project file")).toBeInTheDocument();
    await screen.getByRole("button", { name: /Edit$/ }).click();
    await expect.element(screen.getByRole("textbox", { name: "Edit TTML content" })).toBeInTheDocument();
  });
});
