import { useProjectStore } from "@/stores/project";
import { getAgentColor } from "@/domain/agent/colors";
import { Popover } from "@/ui/popover";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { IconPlus } from "@tabler/icons-react";
import { useCallback, useState } from "react";

// -- Types --------------------------------------------------------------------

interface GutterAgentPickerProps {
  lineId: string;
  lineIndex: number;
  agentId: string;
}

// -- Component ----------------------------------------------------------------

const GutterAgentPicker: React.FC<GutterAgentPickerProps> = ({ lineId, lineIndex, agentId }) => {
  const agents = useProjectStore((s) => s.agents);
  const addAgent = useProjectStore((s) => s.addAgent);
  const updateLineWithHistory = useProjectStore((s) => s.updateLineWithHistory);
  const color = getAgentColor(agentId);
  const [newAgentName, setNewAgentName] = useState("");

  const handleAssign = useCallback(
    (newAgentId: string, close: () => void) => {
      updateLineWithHistory(lineId, { agentId: newAgentId });
      close();
    },
    [lineId, updateLineWithHistory],
  );

  const handleAddNew = useCallback(
    (close: () => void) => {
      if (!newAgentName.trim()) return;
      const usedNumbers = new Set<number>();
      for (const a of agents) {
        const m = a.id.match(/^v(\d+)$/);
        if (m) usedNumbers.add(Number.parseInt(m[1], 10));
      }
      let next = 1;
      while (usedNumbers.has(next)) next++;
      const newId = `v${next}`;
      addAgent({ id: newId, type: "person", name: newAgentName.trim() });
      updateLineWithHistory(lineId, { agentId: newId });
      setNewAgentName("");
      close();
    },
    [lineId, agents, newAgentName, addAgent, updateLineWithHistory],
  );

  return (
    <Popover
      placement="right-start"
      trigger={
        <button
          type="button"
          className="size-full flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: `${color}15` }}
          title="Assign agent"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const { setContextMenu } = useTimelineStore.getState();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              target: { kind: "gutter", lineId, lineIndex },
            });
          }}
        >
          <span className="text-xs text-composer-text-muted tabular-nums">{lineIndex + 1}</span>
        </button>
      }
    >
      {(close) => (
        <div className="w-48 p-2">
          <p className="px-2 mb-1 text-xs text-composer-text-muted">Assign agent</p>
          <div className="flex flex-col gap-px">
            {agents.map((agent) => {
              const agentColor = getAgentColor(agent.id);
              const isActive = agent.id === agentId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleAssign(agent.id, close)}
                  className={`w-full text-left px-2 py-1 text-sm cursor-pointer rounded-md flex items-center gap-2 transition-colors ${
                    isActive
                      ? "bg-composer-accent/15 text-composer-text"
                      : "text-composer-text hover:bg-composer-button"
                  }`}
                >
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: agentColor }} />
                  {agent.name || agent.id}
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-composer-border">
            <div className="flex gap-1">
              <input
                type="text"
                aria-label="New agent name"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleAddNew(close);
                }}
                placeholder="New agent name"
                className="flex-1 px-2 py-1 text-xs rounded bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent"
              />
              <button
                type="button"
                onClick={() => handleAddNew(close)}
                disabled={!newAgentName.trim()}
                className="p-1 rounded cursor-pointer text-composer-text-muted hover:text-composer-text hover:bg-composer-button disabled:opacity-30"
              >
                <IconPlus size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
};

// -- Exports ------------------------------------------------------------------

export { GutterAgentPicker };
