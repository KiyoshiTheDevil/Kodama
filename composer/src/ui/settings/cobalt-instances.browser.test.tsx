import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "@/test/render";
import { CobaltDirectoryLink, CobaltInstanceRow } from "@/ui/settings/cobalt-instances";

const instance = { id: "i1", label: "My Instance", url: "https://my.example.com" };

describe("CobaltInstanceRow", () => {
  it("renders the instance label and host", async () => {
    const screen = await render(<CobaltInstanceRow instance={instance} isSelected={false} onSelect={() => {}} />);
    await expect.element(screen.getByText("My Instance")).toBeInTheDocument();
    await expect.element(screen.getByText("my.example.com")).toBeInTheDocument();
  });

  it("calls onSelect when an unselected row is clicked", async () => {
    let selected = false;
    const screen = await render(
      <CobaltInstanceRow
        instance={instance}
        isSelected={false}
        onSelect={() => {
          selected = true;
        }}
        onEdit={() => {}}
      />,
    );
    await screen.getByRole("button", { name: /My Instance/ }).click();
    await expect.poll(() => selected).toBe(true);
  });

  it("calls onEdit when the already-selected row is clicked", async () => {
    let edited = false;
    const screen = await render(
      <CobaltInstanceRow
        instance={instance}
        isSelected
        onSelect={() => {}}
        onEdit={() => {
          edited = true;
        }}
      />,
    );
    await screen.getByRole("button", { name: /My Instance/ }).click();
    await expect.poll(() => edited).toBe(true);
  });

  it("selects the row when Enter is pressed with the row focused", async () => {
    let selected = false;
    const screen = await render(
      <CobaltInstanceRow
        instance={instance}
        isSelected={false}
        onSelect={() => {
          selected = true;
        }}
      />,
    );
    (screen.getByRole("button", { name: /My Instance/ }).element() as HTMLElement).focus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => selected).toBe(true);
  });

  it("calls onRemove when the remove button is clicked", async () => {
    let removed = false;
    const screen = await render(
      <CobaltInstanceRow
        instance={instance}
        isSelected={false}
        onSelect={() => {}}
        onRemove={() => {
          removed = true;
        }}
      />,
    );
    await screen.getByRole("button", { name: "Remove instance", exact: true }).click();
    await expect.poll(() => removed).toBe(true);
  });
});

describe("CobaltDirectoryLink", () => {
  it("links to the cobalt directory", async () => {
    const screen = await render(<CobaltDirectoryLink />);
    await expect.element(screen.getByRole("link")).toHaveAttribute("href", "https://cobalt.directory/service");
  });
});
