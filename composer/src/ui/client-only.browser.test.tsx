import { describe, expect, it } from "vitest";
import { ClientOnly } from "@/ui/client-only";
import { render } from "@/test/render";

describe("ClientOnly", () => {
  it("renders children after mount", async () => {
    const screen = await render(
      <ClientOnly fallback={<div>Loading</div>}>
        <div>Ready</div>
      </ClientOnly>,
    );
    await expect.element(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders nothing when no fallback is provided and children are not yet shown", async () => {
    const screen = await render(<ClientOnly>{null}</ClientOnly>);
    expect(screen.container.textContent ?? "").toBe("");
  });

  it("renders the children even if a fallback was passed (post-mount)", async () => {
    const screen = await render(
      <ClientOnly fallback={<div>Loading</div>}>
        <div>Done</div>
      </ClientOnly>,
    );
    await expect.element(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.container.querySelector("div")?.textContent).not.toContain("Loading");
  });
});
