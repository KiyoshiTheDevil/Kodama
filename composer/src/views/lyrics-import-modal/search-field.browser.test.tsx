import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "@/test/render";
import { SearchField } from "@/views/lyrics-import-modal/search-field";

// -- Helpers ------------------------------------------------------------------

const noop = () => {};

// -- Rendering ----------------------------------------------------------------

describe("SearchField rendering", () => {
  it("renders the label and placeholder", async () => {
    const screen = await render(
      <SearchField
        label="Track"
        icon={<span data-testid="icon">o</span>}
        value=""
        placeholder="Bohemian Rhapsody"
        onChange={noop}
      />,
    );
    await expect.element(screen.getByText("Track")).toBeInTheDocument();
    const input = screen.getByLabelText("Track").element() as HTMLInputElement;
    expect(input.placeholder).toBe("Bohemian Rhapsody");
  });

  it("appends the optional suffix to the label when optional is true", async () => {
    const screen = await render(
      <SearchField label="Album" optional icon={<span>o</span>} value="" placeholder="x" onChange={noop} />,
    );
    expect(screen.getByText("Album").element().parentElement?.textContent).toContain("optional");
  });

  it("does not append the optional suffix when optional is false", async () => {
    const screen = await render(
      <SearchField label="Track" icon={<span>o</span>} value="" placeholder="x" onChange={noop} />,
    );
    expect(screen.getByText("Track").element().parentElement?.textContent).not.toContain("optional");
  });

  it("applies the mono input class when mono is true", async () => {
    const screen = await render(
      <SearchField label="Duration" mono icon={<span>o</span>} value="" placeholder="3:45" onChange={noop} />,
    );
    const input = screen.getByLabelText("Duration").element() as HTMLInputElement;
    expect(input.className).toContain("font-mono");
  });

  it("applies the full-width column-span class when fullWidth is true", async () => {
    const screen = await render(
      <SearchField label="Video ID" fullWidth icon={<span>o</span>} value="" placeholder="abc" onChange={noop} />,
    );
    const label = screen.getByText("Video ID").element().parentElement as HTMLElement;
    expect(label.className).toContain("col-span-2");
  });
});

// -- Interaction --------------------------------------------------------------

describe("SearchField interaction", () => {
  it("calls onChange with the new value on input", async () => {
    const calls: string[] = [];
    const screen = await render(
      <SearchField label="Track" icon={<span>o</span>} value="" placeholder="x" onChange={(v) => calls.push(v)} />,
    );
    const input = screen.getByLabelText("Track").element() as HTMLInputElement;
    input.focus();
    await userEvent.type(input, "Hi");
    expect(calls.join("")).toBe("Hi");
  });

  it("calls onBlur when the input is blurred", async () => {
    let blurCalls = 0;
    const screen = await render(
      <SearchField
        label="Track"
        icon={<span>o</span>}
        value="hi"
        placeholder="x"
        onChange={noop}
        onBlur={() => blurCalls++}
      />,
    );
    const input = screen.getByLabelText("Track").element() as HTMLInputElement;
    input.focus();
    input.blur();
    expect(blurCalls).toBe(1);
  });
});
