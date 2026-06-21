import { describe, expect, it } from "vitest";
import { Modal } from "@/ui/modal";
import { useModalStackStore } from "@/stores/modal-stack";
import { render } from "@/test/render";

// -- Render -------------------------------------------------------------------

describe("Modal", () => {
  it("renders nothing when isOpen is false", async () => {
    await render(
      <Modal isOpen={false} onClose={() => {}}>
        <div>Hidden</div>
      </Modal>,
    );
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("renders a dialog with the title and body when open", async () => {
    const screen = await render(
      <Modal isOpen onClose={() => {}} title="Settings">
        <div>Body content</div>
      </Modal>,
    );
    await expect.element(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await expect.element(screen.getByText("Body content")).toBeInTheDocument();
  });

  // -- Dismissal --------------------------------------------------------------

  it("closes when Escape is pressed", async () => {
    let closeCalls = 0;
    await render(
      <Modal isOpen onClose={() => closeCalls++}>
        <div>Body</div>
      </Modal>,
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closeCalls).toBeGreaterThan(0);
  });

  it("closes when the overlay backdrop is clicked", async () => {
    let closeCalls = 0;
    await render(
      <Modal isOpen onClose={() => closeCalls++}>
        <div>Body</div>
      </Modal>,
    );
    const overlay = document.querySelector("dialog")?.parentElement;
    expect(overlay).not.toBeNull();
    overlay?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(closeCalls).toBeGreaterThan(0);
  });

  it("does not close when clicking inside the dialog body", async () => {
    let closeCalls = 0;
    const screen = await render(
      <Modal isOpen onClose={() => closeCalls++}>
        <button type="button">Inside</button>
      </Modal>,
    );
    await screen.getByRole("button", { name: "Inside" }).click();
    expect(closeCalls).toBe(0);
  });

  // -- Modal stack ------------------------------------------------------------

  it("pushes onto the modal stack while open", async () => {
    expect(useModalStackStore.getState().count).toBe(0);
    const { unmount } = await render(
      <Modal isOpen onClose={() => {}}>
        <div />
      </Modal>,
    );
    expect(useModalStackStore.getState().count).toBe(1);
    await unmount();
    expect(useModalStackStore.getState().count).toBe(0);
  });

  it("locks document.body overflow while open and restores it on close", async () => {
    document.body.style.overflow = "";
    const { unmount } = await render(
      <Modal isOpen onClose={() => {}}>
        <div />
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    await unmount();
    expect(document.body.style.overflow).toBe("");
  });

  // -- Title close button -----------------------------------------------------

  it("renders an icon-only close button next to the title that fires onClose", async () => {
    let closeCalls = 0;
    await render(
      <Modal isOpen onClose={() => closeCalls++} title="Tour">
        <div>Body</div>
      </Modal>,
    );
    const titleBar = document.querySelector("#modal-title")?.parentElement;
    const closeButton = titleBar?.querySelector("button");
    expect(closeButton).not.toBeNull();
    closeButton?.click();
    expect(closeCalls).toBeGreaterThan(0);
  });
});
