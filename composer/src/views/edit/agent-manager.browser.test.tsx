import { describe, expect, it } from "vitest";
import { AgentManager } from "@/views/edit/agent-manager";
import { useProjectStore } from "@/stores/project";
import { DEFAULT_AGENTS } from "@/domain/agent/colors";
import { render } from "@/test/render";

describe("AgentManager", () => {
  it("renders one badge per agent in the project store", async () => {
    useProjectStore.setState({ agents: [...DEFAULT_AGENTS] });
    const screen = await render(<AgentManager />);
    for (const agent of DEFAULT_AGENTS) {
      expect(screen.container.textContent).toContain(agent.id);
    }
  });

  it("renders the Add button to create new agents", async () => {
    useProjectStore.setState({ agents: [...DEFAULT_AGENTS] });
    const screen = await render(<AgentManager />);
    await expect.element(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
  });

  it("labels the agent name input in the edit popover", async () => {
    useProjectStore.setState({ agents: [...DEFAULT_AGENTS] });
    const screen = await render(<AgentManager />);
    await screen.getByRole("button", { name: /v1/ }).click();
    await expect.element(screen.getByRole("textbox", { name: "Agent name" })).toBeInTheDocument();
  });

  it("labels the custom agent name input in the add popover", async () => {
    useProjectStore.setState({ agents: [...DEFAULT_AGENTS] });
    const screen = await render(<AgentManager />);
    await screen.getByRole("button", { name: /Add/ }).click();
    await expect.element(screen.getByRole("textbox", { name: "Custom agent name" })).toBeInTheDocument();
  });
});
