import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ErrorFallback } from "@/pages/error-fallback";
import { render } from "@/test/render";
import { allowConsole } from "@/test/console-guard";
import { seedProject } from "@/test/idb";

const ThrowingRoute: React.FC = () => {
  throw new Error("Boom for test");
};

function renderFallback() {
  const router = createMemoryRouter([{ path: "/", element: <ThrowingRoute />, errorElement: <ErrorFallback /> }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

describe("ErrorFallback", () => {
  beforeEach(() => {
    allowConsole(/Boom for test|route error|RenderErrorBoundary|caught the following error|recovery failed/);
  });

  it("renders Reload and Go home buttons when a route throws", async () => {
    const screen = await renderFallback();
    await expect.element(screen.getByRole("button", { name: /Reload/ })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: /Go home/ })).toBeInTheDocument();
  });

  it("renders a Download my work button", async () => {
    const screen = await renderFallback();
    await expect.element(screen.getByRole("button", { name: /Download my work/ })).toBeInTheDocument();
  });

  it("shows 'Nothing saved' message when IndexedDB has nothing to recover", async () => {
    const screen = await renderFallback();
    await screen.getByRole("button", { name: /Download my work/ }).click();
    await expect.element(screen.getByText(/Nothing saved in this browser yet/)).toBeInTheDocument();
  });

  it("shows a success message after a successful recovery download", async () => {
    await seedProject({
      version: 1,
      savedAt: Date.now(),
      metadata: { title: "TestSong" },
      lines: [{ id: "a", text: "x", agentId: "v1" }],
    });

    let capturedFilename: string | null = null;
    const originalCreate = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      const el = originalCreate(tag);
      if (tag.toLowerCase() === "a") {
        const anchor = el as HTMLAnchorElement;
        const click = anchor.click.bind(anchor);
        anchor.click = () => {
          capturedFilename = anchor.download;
          click();
        };
      }
      return el;
      // biome-ignore lint/suspicious/noExplicitAny: monkey-patch for capture
    }) as any;

    try {
      const screen = await renderFallback();
      await screen.getByRole("button", { name: /Download my work/ }).click();
      await expect.element(screen.getByText(/Saved\./)).toBeInTheDocument();
      expect(capturedFilename).toMatch(/^TestSong-/);
    } finally {
      document.createElement = originalCreate;
    }
  });
});
