import { describe, expect, it, vi } from "vitest";
import { useDualClickImport } from "@/hooks/useDualClickImport";
import { useImportModalStore } from "@/stores/import-modal-store";
import { useProjectStore } from "@/stores/project";
import { render } from "@/test/render";

// -- Harness ------------------------------------------------------------------

interface HarnessProps {
  onOpen: () => void;
}

const Harness: React.FC<HarnessProps> = ({ onOpen }) => {
  const { onClick, onDoubleClick, fileInput } = useDualClickImport(onOpen);
  return (
    <>
      <button type="button" onClick={onClick} onDoubleClick={onDoubleClick}>
        Import lyrics
      </button>
      {fileInput}
    </>
  );
};

function getHiddenFileInput(): HTMLInputElement {
  const input = document.querySelector("input[type='file']") as HTMLInputElement | null;
  if (!input) throw new Error("hidden file input not found");
  return input;
}

function dispatchFileChange(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", {
    value: [file] as unknown as FileList,
    configurable: true,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// -- Tests --------------------------------------------------------------------

describe("useDualClickImport · single click", () => {
  it("opens the modal after the 220 ms debounce window", async () => {
    const onOpen = vi.fn();
    const screen = await render(<Harness onOpen={onOpen} />);
    await screen.getByRole("button", { name: "Import lyrics" }).click();
    expect(onOpen).not.toHaveBeenCalled();
    await expect.poll(() => onOpen.mock.calls.length, { timeout: 1000 }).toBe(1);
  });

  it("ignores a second click while a debounce is pending (does not re-arm or double-fire)", async () => {
    const onOpen = vi.fn();
    const screen = await render(<Harness onOpen={onOpen} />);
    const button = screen.getByRole("button", { name: "Import lyrics" });
    await button.click();
    await button.click();
    await expect.poll(() => onOpen.mock.calls.length, { timeout: 1000 }).toBe(1);
  });
});

describe("useDualClickImport · double click", () => {
  it("cancels the pending single-click open and clicks the hidden file input instead", async () => {
    const onOpen = vi.fn();
    const screen = await render(<Harness onOpen={onOpen} />);
    const input = getHiddenFileInput();
    let inputClicks = 0;
    const listener = () => {
      inputClicks++;
    };
    input.addEventListener("click", listener);

    try {
      await screen.getByRole("button", { name: "Import lyrics" }).dblClick();
      await expect.poll(() => inputClicks).toBeGreaterThanOrEqual(1);
      await new Promise((r) => setTimeout(r, 300));
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      input.removeEventListener("click", listener);
    }
  });
});

describe("useDualClickImport · hidden input", () => {
  it("renders a screen-reader-friendly hidden file input that accepts the supported extensions", async () => {
    const screen = await render(<Harness onOpen={() => {}} />);
    const input = (await screen.getByLabelText("Direct lyrics upload picker").element()) as HTMLInputElement;
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".txt,.lrc,.srt,.ttml,.xml");
    expect(input.tabIndex).toBe(-1);
    expect(input.className).toContain("sr-only");
  });

  it("does not surface as a tab-focusable element to keyboard users", async () => {
    await render(<Harness onOpen={() => {}} />);
    const input = getHiddenFileInput();
    expect(input.tabIndex).toBe(-1);
  });
});

describe("useDualClickImport · file pick wiring", () => {
  it("parses a plain-text file and writes lines to the project store, recording the result", async () => {
    await render(<Harness onOpen={() => {}} />);
    const input = getHiddenFileInput();
    const file = new File(["Hello world\nSecond line"], "lyrics.txt", { type: "text/plain" });

    dispatchFileChange(input, file);

    await expect.poll(() => useProjectStore.getState().lines.length).toBeGreaterThan(0);
    const lines = useProjectStore.getState().lines;
    expect(lines.map((l) => l.text)).toEqual(["Hello world", "Second line"]);

    const recorded = useImportModalStore.getState().lastImportResult;
    expect(recorded?.source.label).toBe("File");
    expect(recorded?.source.filename).toBe("lyrics.txt");
  });

  it("clears the input value after a pick so re-picking the same filename re-fires", async () => {
    await render(<Harness onOpen={() => {}} />);
    const input = getHiddenFileInput();
    const file = new File(["Hello"], "same.txt", { type: "text/plain" });

    dispatchFileChange(input, file);

    await expect.poll(() => useProjectStore.getState().lines.length).toBeGreaterThan(0);
    expect(input.value).toBe("");
  });

  it("ignores a change event with no files attached (does not throw, does not touch project)", async () => {
    await render(<Harness onOpen={() => {}} />);
    const input = getHiddenFileInput();
    const beforeLines = useProjectStore.getState().lines.length;

    Object.defineProperty(input, "files", { value: [] as unknown as FileList, configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 50));
    expect(useProjectStore.getState().lines.length).toBe(beforeLines);
  });
});
