import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { ConverterView } from "@/pages/converters/converter-view";
import { render } from "@/test/render";

const FAKE_TTML = `<?xml version="1.0"?><tt><body><div><p>line</p></div></body></tt>`;

describe("ConverterView", () => {
  it("renders the title and input textarea", async () => {
    const screen = await render(
      <ConverterView
        title="LRC → TTML"
        inputLabel="LRC"
        inputPlaceholder="Paste LRC"
        sampleInput="[00:01.00] hello"
        convert={() => ({ ttml: FAKE_TTML, projectPayload: "{}" })}
        downloadFilename="out.ttml"
      />,
      { withRouter: true },
    );
    await expect.element(screen.getByText("LRC → TTML")).toBeInTheDocument();
    expect(screen.container.querySelector("textarea")).not.toBeNull();
  });

  it("labels the input textarea", async () => {
    const screen = await render(
      <ConverterView
        title="LRC → TTML"
        inputLabel="LRC"
        inputPlaceholder="Paste LRC"
        sampleInput="[00:01.00] hello"
        convert={() => ({ ttml: FAKE_TTML, projectPayload: "{}" })}
        downloadFilename="out.ttml"
      />,
      { withRouter: true },
    );
    await expect.element(screen.getByRole("textbox", { name: "Converter input" })).toBeInTheDocument();
  });

  it("produces TTML output when the user provides input", async () => {
    const screen = await render(
      <ConverterView
        title="LRC → TTML"
        inputLabel="LRC"
        inputPlaceholder="Paste LRC"
        sampleInput="[00:01.00] hello"
        convert={() => ({ ttml: FAKE_TTML, projectPayload: "{}" })}
        downloadFilename="out.ttml"
      />,
      { withRouter: true },
    );
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;
    await userEvent.fill(textarea, "[00:01.00] hello");
    expect(screen.container.textContent).toContain("tt");
  });
});
