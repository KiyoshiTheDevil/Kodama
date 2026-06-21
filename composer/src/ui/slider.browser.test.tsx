import { describe, expect, it } from "vitest";
import { Slider } from "@/ui/slider";
import { render } from "@/test/render";

interface ControlledHarnessProps {
  initial: number;
  min: number;
  max: number;
  step?: number;
  ariaLabel?: string;
  onChange?: (value: number) => void;
}

function ControlledHarness({ initial, min, max, step, ariaLabel, onChange }: ControlledHarnessProps) {
  return (
    <Slider
      value={initial}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel ?? "Test slider"}
      onChange={(value) => onChange?.(value)}
    />
  );
}

describe("Slider", () => {
  it("exposes accessible role and ARIA attributes", async () => {
    const screen = await render(<ControlledHarness initial={50} min={0} max={100} ariaLabel="Volume" />);
    const slider = screen.getByRole("slider", { name: "Volume" }).element();
    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    expect(slider.getAttribute("aria-valuemax")).toBe("100");
    expect(slider.getAttribute("aria-valuenow")).toBe("50");
  });

  // -- Keyboard ---------------------------------------------------------------

  it("increments by step on ArrowRight", async () => {
    let value = 50;
    const screen = await render(
      <ControlledHarness
        initial={value}
        min={0}
        max={100}
        step={5}
        onChange={(v) => {
          value = v;
        }}
      />,
    );
    const slider = screen.getByRole("slider").element() as HTMLElement;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(value).toBe(55);
  });

  it("decrements by step on ArrowLeft", async () => {
    let value = 50;
    const screen = await render(
      <ControlledHarness
        initial={value}
        min={0}
        max={100}
        step={5}
        onChange={(v) => {
          value = v;
        }}
      />,
    );
    const slider = screen.getByRole("slider").element() as HTMLElement;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(value).toBe(45);
  });

  it("jumps to min on Home and max on End", async () => {
    const updates: number[] = [];
    const screen = await render(<ControlledHarness initial={50} min={0} max={100} onChange={(v) => updates.push(v)} />);
    const slider = screen.getByRole("slider").element() as HTMLElement;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(updates).toContain(0);
    expect(updates).toContain(100);
  });

  it("steps up by 10% on PageUp", async () => {
    let value = 50;
    const screen = await render(
      <ControlledHarness
        initial={value}
        min={0}
        max={100}
        onChange={(v) => {
          value = v;
        }}
      />,
    );
    const slider = screen.getByRole("slider").element() as HTMLElement;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));
    expect(value).toBeCloseTo(60, 5);
  });

  it("steps down by 10% on PageDown", async () => {
    let value = 50;
    const screen = await render(
      <ControlledHarness
        initial={value}
        min={0}
        max={100}
        onChange={(v) => {
          value = v;
        }}
      />,
    );
    const slider = screen.getByRole("slider").element() as HTMLElement;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    expect(value).toBeCloseTo(40, 5);
  });

  it("clamps to min when decrementing past min", async () => {
    let value = 1;
    const screen = await render(
      <ControlledHarness
        initial={value}
        min={0}
        max={100}
        step={5}
        onChange={(v) => {
          value = v;
        }}
      />,
    );
    const slider = screen.getByRole("slider").element() as HTMLElement;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(value).toBe(0);
  });

  it("clamps to max when incrementing past max", async () => {
    let value = 99;
    const screen = await render(
      <ControlledHarness
        initial={value}
        min={0}
        max={100}
        step={5}
        onChange={(v) => {
          value = v;
        }}
      />,
    );
    const slider = screen.getByRole("slider").element() as HTMLElement;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(value).toBe(100);
  });

  // -- Mouse ------------------------------------------------------------------

  it("snaps value to step when clicking the track", async () => {
    let value = 0;
    const screen = await render(
      <ControlledHarness
        initial={value}
        min={0}
        max={100}
        step={10}
        onChange={(v) => {
          value = v;
        }}
      />,
    );
    const slider = screen.getByRole("slider").element() as HTMLElement;
    const rect = slider.getBoundingClientRect();
    slider.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
      }),
    );
    expect([40, 50, 60]).toContain(value);
  });
});
