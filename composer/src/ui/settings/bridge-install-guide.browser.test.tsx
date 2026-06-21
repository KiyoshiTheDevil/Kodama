import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { BridgeInstallGuide } from "@/ui/settings/bridge-install-guide";

const EXPECTED_INSTALL_CMD =
  "curl -fsSL https://github.com/better-lyrics/composer-bridge/releases/latest/download/install.sh | sh";

const RELEASES_URL = "https://github.com/better-lyrics/composer-bridge/releases/latest";

// -- Clipboard stub -----------------------------------------------------------

interface ClipboardStub {
  writes: string[];
  restore: () => void;
}

const stubClipboard = (): ClipboardStub => {
  const writes: string[] = [];
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "clipboard");
  Object.defineProperty(Navigator.prototype, "clipboard", {
    configurable: true,
    get: () => ({
      writeText: async (text: string) => {
        writes.push(text);
      },
    }),
  });
  return {
    writes,
    restore: () => {
      if (original) {
        Object.defineProperty(Navigator.prototype, "clipboard", original);
      } else {
        (Navigator.prototype as unknown as Record<string, unknown>).clipboard = undefined;
      }
    },
  };
};

let clipboard: ClipboardStub;

beforeEach(() => {
  clipboard = stubClipboard();
});

afterEach(() => {
  clipboard.restore();
});

// -- Tests --------------------------------------------------------------------

describe("BridgeInstallGuide", () => {
  describe("happy path", () => {
    it("renders three numbered steps", async () => {
      const screen = await render(<BridgeInstallGuide onCheckNow={() => {}} />);
      await expect.element(screen.getByRole("heading", { name: /Install/ })).toBeInTheDocument();
      await expect.element(screen.getByRole("heading", { name: /Launch/ })).toBeInTheDocument();
      await expect.element(screen.getByRole("heading", { name: /Return here/ })).toBeInTheDocument();
    });

    it("shows the install.sh terminal command", async () => {
      const screen = await render(<BridgeInstallGuide onCheckNow={() => {}} />);
      await expect.element(screen.getByText(EXPECTED_INSTALL_CMD)).toBeInTheDocument();
    });

    it("provides a manual download link to the GitHub releases page", async () => {
      const screen = await render(<BridgeInstallGuide onCheckNow={() => {}} />);
      const link = screen.getByRole("link", { name: /Windows or manual download/ });
      await expect.element(link).toHaveAttribute("href", RELEASES_URL);
    });

    it("opens the manual download link in a new tab safely", async () => {
      const screen = await render(<BridgeInstallGuide onCheckNow={() => {}} />);
      const link = screen.getByRole("link", { name: /Windows or manual download/ });
      await expect.element(link).toHaveAttribute("target", "_blank");
      await expect.element(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("calls onCheckNow when the Check now button is clicked", async () => {
      let checked = 0;
      const screen = await render(
        <BridgeInstallGuide
          onCheckNow={() => {
            checked += 1;
          }}
        />,
      );
      await screen.getByRole("button", { name: /Check now/ }).click();
      await expect.poll(() => checked).toBe(1);
    });
  });

  describe("copy behavior", () => {
    it("writes the install command to the clipboard when Copy is clicked", async () => {
      const screen = await render(<BridgeInstallGuide onCheckNow={() => {}} />);
      await screen.getByRole("button", { name: /Copy install command/ }).click();
      await expect.poll(() => clipboard.writes).toEqual([EXPECTED_INSTALL_CMD]);
    });

    it("flips Copy to Copied feedback after a successful copy", async () => {
      const screen = await render(<BridgeInstallGuide onCheckNow={() => {}} />);
      await screen.getByRole("button", { name: /Copy install command/ }).click();
      await expect.element(screen.getByRole("button", { name: /Copy install command/ })).toHaveTextContent(/Copied/);
    });
  });

  describe("invariants", () => {
    it("the install command is rendered as selectable text so users can copy it manually", async () => {
      const screen = await render(<BridgeInstallGuide onCheckNow={() => {}} />);
      const code = screen.getByText(EXPECTED_INSTALL_CMD);
      await expect.element(code).toHaveClass("select-text");
    });

    it("the install command uses the stable releases/latest path so it never points at a specific version", async () => {
      const screen = await render(<BridgeInstallGuide onCheckNow={() => {}} />);
      const code = screen.getByText(EXPECTED_INSTALL_CMD);
      await expect.element(code).toHaveTextContent("/releases/latest/download/install.sh");
    });
  });
});
