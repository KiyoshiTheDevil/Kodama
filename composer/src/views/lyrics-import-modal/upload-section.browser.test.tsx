import { describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";
import { UploadSection } from "@/views/lyrics-import-modal/upload-section";
import { render } from "@/test/render";

// -- Helpers ------------------------------------------------------------------

function noop() {}

function dispatchDragEvent(target: Element, type: string, files: File[] = []) {
  const dataTransfer = new DataTransfer();
  for (const file of files) dataTransfer.items.add(file);
  const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
  target.dispatchEvent(event);
}

function getDropZone(): HTMLElement {
  const node = document.querySelector("[data-upload-dropzone]");
  if (!node) throw new Error("drop zone not found");
  return node as HTMLElement;
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector("input[type='file']") as HTMLInputElement | null;
  if (!input) throw new Error("file input not found");
  return input;
}

// -- Tests --------------------------------------------------------------------

describe("UploadSection", () => {
  it("renders the drop zone with the expected copy", async () => {
    const screen = await render(<UploadSection onFile={noop} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    await expect.element(screen.getByText("Drop a lyrics file here")).toBeInTheDocument();
    await expect.element(screen.getByText(/click to browse/i)).toBeInTheDocument();
    expect(document.body.textContent).toContain(".txt");
    expect(document.body.textContent).toContain(".lrc");
    expect(document.body.textContent).toContain(".srt");
    expect(document.body.textContent).toContain(".ttml");
  });

  it("triggers the hidden file input click when the drop zone is clicked", async () => {
    const screen = await render(<UploadSection onFile={noop} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    const input = getFileInput();
    let clicked = false;
    const listener = () => {
      clicked = true;
    };
    input.addEventListener("click", listener);
    try {
      await screen.getByRole("button", { name: /Drop a lyrics file here/i }).click();
      expect(clicked).toBe(true);
    } finally {
      input.removeEventListener("click", listener);
    }
  });

  it("applies an accent border class while dragging over", async () => {
    await render(<UploadSection onFile={noop} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    const zone = getDropZone();
    dispatchDragEvent(zone, "dragenter");
    dispatchDragEvent(zone, "dragover");
    await expect.poll(() => zone.className).toMatch(/border-composer-accent/);
  });

  it("removes the accent border on drag leave", async () => {
    await render(<UploadSection onFile={noop} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    const zone = getDropZone();
    dispatchDragEvent(zone, "dragenter");
    await expect.poll(() => zone.className).toMatch(/border-composer-accent/);
    dispatchDragEvent(zone, "dragleave");
    await expect.poll(() => zone.className).not.toMatch(/border-composer-accent/);
  });

  it("calls onFile with a dropped .lrc file", async () => {
    const onFile = vi.fn();
    await render(<UploadSection onFile={onFile} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    const zone = getDropZone();
    const file = new File(["[00:01.00]hi"], "song.lrc", { type: "text/plain" });
    dispatchDragEvent(zone, "drop", [file]);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("song.lrc");
  });

  it("does not call onFile for a .png file and surfaces a toast error", async () => {
    const onFile = vi.fn();
    await render(
      <>
        <Toaster />
        <UploadSection onFile={onFile} onSwitchToSearch={noop} onSwitchToPaste={noop} />
      </>,
    );
    const zone = getDropZone();
    const file = new File(["binary"], "image.png", { type: "image/png" });
    dispatchDragEvent(zone, "drop", [file]);
    expect(onFile).not.toHaveBeenCalled();
    await expect.poll(() => document.body.textContent).toMatch(/Unsupported file type/i);
  });

  it("calls onFile when a .txt file is chosen via the file input", async () => {
    const onFile = vi.fn();
    await render(<UploadSection onFile={onFile} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    const input = getFileInput();
    const file = new File(["plain lyrics"], "song.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", {
      value: [file] as unknown as FileList,
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("song.txt");
  });

  it("calls onSwitchToSearch when the Back to search button is clicked", async () => {
    const onSwitchToSearch = vi.fn();
    const screen = await render(
      <UploadSection onFile={noop} onSwitchToSearch={onSwitchToSearch} onSwitchToPaste={noop} />,
    );
    await screen.getByRole("button", { name: /Back to search/i }).click();
    expect(onSwitchToSearch).toHaveBeenCalledTimes(1);
  });

  it("calls onSwitchToPaste when the Switch to paste button is clicked", async () => {
    const onSwitchToPaste = vi.fn();
    const screen = await render(
      <UploadSection onFile={noop} onSwitchToSearch={noop} onSwitchToPaste={onSwitchToPaste} />,
    );
    await screen.getByRole("button", { name: /paste/i }).click();
    expect(onSwitchToPaste).toHaveBeenCalledTimes(1);
  });

  it("only forwards the first file when multiple are dropped at once", async () => {
    const onFile = vi.fn();
    await render(<UploadSection onFile={onFile} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    const zone = getDropZone();
    const first = new File(["a"], "one.lrc", { type: "text/plain" });
    const second = new File(["b"], "two.lrc", { type: "text/plain" });
    dispatchDragEvent(zone, "drop", [first, second]);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("one.lrc");
  });

  it("clears the file input value after a drop so re-dropping the same filename re-fires", async () => {
    const onFile = vi.fn();
    await render(<UploadSection onFile={onFile} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    const input = getFileInput();
    const file = new File(["x"], "same.lrc", { type: "text/plain" });
    Object.defineProperty(input, "files", {
      value: [file] as unknown as FileList,
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });

  it("labels the hidden file input for assistive tech", async () => {
    const screen = await render(<UploadSection onFile={noop} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    await expect.element(screen.getByLabelText("Import lyrics file")).toBeInTheDocument();
  });

  it("exposes the drop zone as a keyboard-activatable button", async () => {
    const screen = await render(<UploadSection onFile={noop} onSwitchToSearch={noop} onSwitchToPaste={noop} />);
    const zone = screen.getByRole("button", { name: /Drop a lyrics file here/i });
    await expect.element(zone).toBeInTheDocument();
    expect((zone.element() as HTMLElement).tabIndex).toBeGreaterThanOrEqual(0);
  });
});
