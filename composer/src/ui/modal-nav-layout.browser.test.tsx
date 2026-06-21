import { IconKeyboard, IconRocket } from "@tabler/icons-react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ModalNavLayout, type ModalNavSection } from "@/ui/modal-nav-layout";
import { render } from "@/test/render";

// -- Fixtures -----------------------------------------------------------------

const SECTIONS: ModalNavSection[] = [
  { id: "first", label: "First Section", icon: IconRocket },
  { id: "second", label: "Second Section", icon: IconKeyboard },
];

const Harness: React.FC = () => {
  const [activeSection, setActiveSection] = useState("first");
  return (
    <ModalNavLayout sections={SECTIONS} activeSection={activeSection} onSectionChange={setActiveSection}>
      <p>Content for {activeSection}</p>
    </ModalNavLayout>
  );
};

// -- Tests --------------------------------------------------------------------

describe("ModalNavLayout", () => {
  it("renders a nav button for every section", async () => {
    const screen = await render(
      <ModalNavLayout sections={SECTIONS} activeSection="first" onSectionChange={() => {}}>
        <p>Body</p>
      </ModalNavLayout>,
    );
    await expect.element(screen.getByRole("button", { name: /first section/i })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: /second section/i })).toBeInTheDocument();
  });

  it("renders the supplied content for the active section", async () => {
    const screen = await render(
      <ModalNavLayout sections={SECTIONS} activeSection="first" onSectionChange={() => {}}>
        <p>Body Content</p>
      </ModalNavLayout>,
    );
    await expect.element(screen.getByText("Body Content")).toBeInTheDocument();
  });

  it("calls onSectionChange with the section id when a nav button is clicked", async () => {
    const changes: string[] = [];
    const screen = await render(
      <ModalNavLayout sections={SECTIONS} activeSection="first" onSectionChange={(id) => changes.push(id)}>
        <p>Body</p>
      </ModalNavLayout>,
    );
    await screen.getByRole("button", { name: /second section/i }).click();
    expect(changes).toEqual(["second"]);
  });

  it("switches the rendered content when a different section is selected", async () => {
    const screen = await render(<Harness />);
    await expect.element(screen.getByText("Content for first")).toBeInTheDocument();
    await screen.getByRole("button", { name: /second section/i }).click();
    await expect.element(screen.getByText("Content for second")).toBeInTheDocument();
  });
});
