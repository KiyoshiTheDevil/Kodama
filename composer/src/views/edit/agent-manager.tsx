import { useProjectStore } from "@/stores/project";
import { AGENT_PRESETS, getAgentColor } from "@/domain/agent/colors";
import type { Agent, AgentType } from "@/domain/agent/model";
import { Button } from "@/ui/button";
import { Popover } from "@/ui/popover";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useCallback, useState } from "react";

// -- Helpers ------------------------------------------------------------------

function generateAgentId(existingAgents: { id: string }[]): string {
  const usedNumbers = new Set<number>();
  for (const a of existingAgents) {
    const m = a.id.match(/^v(\d+)$/);
    if (m) usedNumbers.add(Number.parseInt(m[1], 10));
  }

  let next = 1;
  while (usedNumbers.has(next)) {
    next++;
  }
  return `v${next}`;
}

// -- Components ---------------------------------------------------------------

const AgentBadge: React.FC<
  { agent: Agent; ref?: React.Ref<HTMLButtonElement> } & React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ agent, ref, ...props }) => {
  const color = getAgentColor(agent.id);

  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-md bg-composer-button cursor-pointer"
    >
      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sm text-composer-text">{agent.name || agent.id}</span>
      <span className="text-xs text-composer-text-muted">{agent.id}</span>
    </button>
  );
};

const EditAgentPopover: React.FC<{
  agent: Agent;
  removable?: boolean;
  onRemove?: () => void;
}> = ({ agent, removable = true, onRemove }) => {
  const updateAgent = useProjectStore((s) => s.updateAgent);
  const [name, setName] = useState(() => agent.name || "");
  const [type, setType] = useState<AgentType>(() => agent.type);

  const handleSave = useCallback(
    (close: () => void) => {
      updateAgent(agent.id, { name: name.trim() || undefined, type });
      close();
    },
    [updateAgent, agent.id, name, type],
  );

  const handleDelete = useCallback(
    (close: () => void) => {
      onRemove?.();
      close();
    },
    [onRemove],
  );

  return (
    <Popover placement="bottom-start" trigger={<AgentBadge agent={agent} />}>
      {(close) => (
        <div className="w-64 p-3">
          <p className="mb-2 text-xs font-medium text-composer-text-secondary">Edit Agent · {agent.id}</p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              aria-label="Agent name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name"
              className="px-2 py-1.5 text-sm rounded-md bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AgentType)}
              className="px-2 py-1.5 text-sm rounded-md bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent cursor-pointer"
            >
              <option value="person">Person</option>
              <option value="group">Group</option>
              <option value="character">Character</option>
              <option value="organization">Organization</option>
              <option value="other">Other</option>
            </select>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => handleSave(close)} className="flex-1">
                Save
              </Button>
              {removable && onRemove && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(close)}
                  className="text-composer-error-text bg-composer-error/80 hover:bg-composer-error flex items-center gap-2"
                >
                  <IconTrash className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
};

const AddAgentPopover: React.FC = () => {
  const agents = useProjectStore((s) => s.agents);
  const addAgent = useProjectStore((s) => s.addAgent);
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<AgentType>("person");

  const availablePresets = AGENT_PRESETS.filter((preset) => !agents.some((a) => a.id === preset.id));

  const handleAddPreset = useCallback(
    (preset: Agent, close: () => void) => {
      addAgent(preset);
      close();
    },
    [addAgent],
  );

  const handleAddCustom = useCallback(
    (close: () => void) => {
      if (!customName.trim()) return;
      addAgent({
        id: generateAgentId(agents),
        type: customType,
        name: customName.trim(),
      });
      setCustomName("");
      close();
    },
    [addAgent, agents, customName, customType],
  );

  return (
    <Popover
      placement="bottom-start"
      trigger={
        <Button size="sm" hasIcon>
          <IconPlus className="size-3.5" />
          Add
        </Button>
      }
    >
      {(close) => (
        <div className="w-64 p-3">
          {availablePresets.length > 0 && (
            <>
              <p className="mb-2 text-xs font-medium text-composer-text-secondary">Presets</p>
              <div className="flex flex-col gap-1 mb-3">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleAddPreset(preset, close)}
                    className="flex items-center gap-2 px-2 py-1.5 text-left rounded-md cursor-pointer hover:bg-composer-button"
                  >
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: getAgentColor(preset.id) }}
                    />
                    <span className="text-sm text-composer-text">{preset.name}</span>
                    <span className="text-xs text-composer-text-muted">{preset.id}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="mb-2 text-xs font-medium text-composer-text-secondary">Custom Agent</p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              aria-label="Custom agent name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Agent name"
              className="px-2 py-1.5 text-sm rounded-md bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent"
            />
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value as AgentType)}
              className="px-2 py-1.5 text-sm rounded-md bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent cursor-pointer"
            >
              <option value="person">Person</option>
              <option value="group">Group</option>
              <option value="character">Character</option>
              <option value="organization">Organization</option>
              <option value="other">Other</option>
            </select>
            <Button size="sm" variant="primary" onClick={() => handleAddCustom(close)} disabled={!customName.trim()}>
              Add Custom Agent
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
};

const AgentManager: React.FC = () => {
  const agents = useProjectStore((s) => s.agents);
  const removeAgent = useProjectStore((s) => s.removeAgent);
  const lines = useProjectStore((s) => s.lines);
  const setLinesWithHistory = useProjectStore((s) => s.setLinesWithHistory);

  const handleRemoveAgent = useCallback(
    (agentId: string) => {
      const fallbackId = agents.find((a) => a.id !== agentId)?.id ?? "v1";
      const updatedLines = lines.map((line) => (line.agentId === agentId ? { ...line, agentId: fallbackId } : line));
      setLinesWithHistory(updatedLines);
      removeAgent(agentId);
    },
    [agents, lines, setLinesWithHistory, removeAgent],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-composer-text-secondary">Agents</span>
      {agents.map((agent) => (
        <EditAgentPopover
          key={agent.id}
          agent={agent}
          removable={agents.length > 1}
          onRemove={() => handleRemoveAgent(agent.id)}
        />
      ))}
      <AddAgentPopover />
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { AgentManager };
