import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { TimeNudgeInput } from "@/views/sync/time-nudge-input";
import { useSettingsStore } from "@/stores/settings";
import { formatTimeMs } from "@/utils/sync-helpers";
import { render } from "@/test/render";

interface HarnessProps {
  value: number;
  currentTime?: number;
  canDecrease?: boolean;
  canIncrease?: boolean;
  onNudge?: (delta: number) => void;
  onSetTime?: (newTime: number) => void;
}

function Harness({
  value,
  currentTime = 0,
  canDecrease = true,
  canIncrease = true,
  onNudge = () => {},
  onSetTime = () => {},
}: HarnessProps) {
  return (
    <TimeNudgeInput
      value={value}
      currentTime={currentTime}
      canDecrease={canDecrease}
      canIncrease={canIncrease}
      onNudge={onNudge}
      onSetTime={onSetTime}
    />
  );
}

describe("TimeNudgeInput", () => {
  it("renders the formatted time on the central button", async () => {
    const screen = await render(<Harness value={12.345} />);
    await expect.element(screen.getByRole("button", { name: formatTimeMs(12.345) })).toBeInTheDocument();
  });

  it("calls onNudge with negative delta when the minus button is clicked and canDecrease is true", async () => {
    let lastDelta = 0;
    useSettingsStore.setState({ nudgeAmount: 0.05 });
    const screen = await render(
      <Harness
        value={5}
        onNudge={(d) => {
          lastDelta = d;
        }}
      />,
    );
    const minus = screen.container.querySelectorAll("button")[0];
    minus?.click();
    expect(lastDelta).toBeCloseTo(-0.05, 5);
  });

  it("does not call onNudge when canDecrease is false", async () => {
    let nudges = 0;
    const screen = await render(<Harness value={5} canDecrease={false} onNudge={() => nudges++} />);
    const minus = screen.container.querySelectorAll("button")[0];
    minus?.click();
    expect(nudges).toBe(0);
  });

  it("calls onNudge with positive delta when the plus button is clicked", async () => {
    let lastDelta = 0;
    useSettingsStore.setState({ nudgeAmount: 0.1 });
    const screen = await render(
      <Harness
        value={5}
        onNudge={(d) => {
          lastDelta = d;
        }}
      />,
    );
    const plus = screen.container.querySelectorAll("button")[2];
    plus?.click();
    expect(lastDelta).toBeCloseTo(0.1, 5);
  });

  // -- Edit mode --------------------------------------------------------------

  it("enters edit mode and pre-fills the formatted current value", async () => {
    const screen = await render(<Harness value={3.456} />);
    await screen.getByRole("button", { name: formatTimeMs(3.456) }).click();
    const input = screen.container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.value).toBe(formatTimeMs(3.456));
  });

  it("labels the edit input", async () => {
    const screen = await render(<Harness value={3.456} />);
    await screen.getByRole("button", { name: formatTimeMs(3.456) }).click();
    await expect.element(screen.getByRole("textbox", { name: "Edit time" })).toBeInTheDocument();
  });

  it("commits a parsed value on Enter and exits edit mode", async () => {
    let setTime = -1;
    const screen = await render(
      <Harness
        value={1}
        onSetTime={(t) => {
          setTime = t;
        }}
      />,
    );
    await screen.getByRole("button", { name: formatTimeMs(1) }).click();
    const input = screen.container.querySelector("input") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, input.value.length);
    await userEvent.keyboard("0:05.000{Enter}");
    expect(setTime).toBeCloseTo(5, 5);
  });

  it("does not commit when Escape is pressed", async () => {
    let setTime = -1;
    const screen = await render(
      <Harness
        value={1}
        onSetTime={(t) => {
          setTime = t;
        }}
      />,
    );
    await screen.getByRole("button", { name: formatTimeMs(1) }).click();
    const input = screen.container.querySelector("input") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, input.value.length);
    await userEvent.keyboard("0:42.000{Escape}");
    expect(setTime).toBe(-1);
  });

  it("replaces the edit value with the current playback time on Tab", async () => {
    const screen = await render(<Harness value={1} currentTime={9.876} />);
    await screen.getByRole("button", { name: formatTimeMs(1) }).click();
    const input = screen.container.querySelector("input") as HTMLInputElement;
    input.focus();
    await userEvent.keyboard("{Tab}");
    expect(input.value).toBe(formatTimeMs(9.876));
  });
});
