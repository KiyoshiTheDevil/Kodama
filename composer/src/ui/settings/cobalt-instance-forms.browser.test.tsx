import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "@/test/render";
import { CobaltInstanceAddForm, CobaltInstanceEditRow } from "@/ui/settings/cobalt-instance-forms";

describe("CobaltInstanceAddForm", () => {
  it("keeps Add disabled until a valid label and URL are entered", async () => {
    const screen = await render(<CobaltInstanceAddForm onAdd={() => {}} />);
    const add = screen.getByRole("button", { name: "Add" });
    await expect.element(add).toBeDisabled();
    await screen.getByPlaceholder("Name").fill("Box");
    await screen.getByPlaceholder(/your-cobalt-instance/).fill("https://cobalt.example.com");
    await expect.element(add).toBeEnabled();
  });

  it("labels the inputs by purpose", async () => {
    const screen = await render(<CobaltInstanceAddForm onAdd={() => {}} />);
    await expect.element(screen.getByRole("textbox", { name: "Instance name" })).toBeInTheDocument();
    await expect.element(screen.getByLabelText("Instance URL")).toBeInTheDocument();
  });

  it("shows an error for an invalid URL", async () => {
    const screen = await render(<CobaltInstanceAddForm onAdd={() => {}} />);
    await screen.getByPlaceholder(/your-cobalt-instance/).fill("https://");
    await expect.element(screen.getByText(/valid http/)).toBeInTheDocument();
  });

  it("submits a scheme-normalised instance on Enter and clears the inputs", async () => {
    let added: [string, string] | null = null;
    const screen = await render(
      <CobaltInstanceAddForm
        onAdd={(label, url) => {
          added = [label, url];
        }}
      />,
    );
    await screen.getByPlaceholder("Name").fill("My Box");
    const url = screen.getByPlaceholder(/your-cobalt-instance/);
    await url.fill("cobalt.example.com");
    (url.element() as HTMLInputElement).focus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => added).toEqual(["My Box", "https://cobalt.example.com"]);
    await expect.element(screen.getByPlaceholder("Name")).toHaveValue("");
  });
});

describe("CobaltInstanceEditRow", () => {
  it("prefills the label and host from the initial values", async () => {
    const screen = await render(
      <CobaltInstanceEditRow
        initialLabel="Old"
        initialUrl="https://old.example.com"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    await expect.element(screen.getByRole("textbox").first()).toHaveValue("Old");
    await expect.element(screen.getByRole("textbox").nth(1)).toHaveValue("old.example.com");
  });

  it("labels the inputs by purpose", async () => {
    const screen = await render(
      <CobaltInstanceEditRow
        initialLabel="Old"
        initialUrl="https://old.example.com"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    await expect.element(screen.getByRole("textbox", { name: "Instance name" })).toBeInTheDocument();
    await expect.element(screen.getByLabelText("Instance URL")).toBeInTheDocument();
  });

  it("saves the trimmed label and scheme-normalised URL", async () => {
    let saved: [string, string] | null = null;
    const screen = await render(
      <CobaltInstanceEditRow
        initialLabel="Old"
        initialUrl="https://old.example.com"
        onSave={(label, url) => {
          saved = [label, url];
        }}
        onCancel={() => {}}
      />,
    );
    await screen.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => saved).toEqual(["Old", "https://old.example.com"]);
  });

  it("cancels on Escape", async () => {
    let cancelled = false;
    const screen = await render(
      <CobaltInstanceEditRow
        initialLabel="Old"
        initialUrl="https://old.example.com"
        onSave={() => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />,
    );
    (screen.getByRole("textbox").first().element() as HTMLInputElement).focus();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => cancelled).toBe(true);
  });
});
