import { useProjectStore } from "@/stores/project";
import type { SimpleTab } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { InlineKeyBadge } from "@/ui/inline-key-badge";

const TABS: { id: SimpleTab; label: string }[] = [
  { id: "import", label: "Import" },
  { id: "edit", label: "Edit" },
  { id: "sync", label: "Sync" },
  { id: "timeline", label: "Timeline" },
  { id: "preview", label: "Preview" },
  { id: "export", label: "Export" },
];

const TabBar: React.FC = () => {
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const showHints = useSettingsStore((s) => s.showShortcutHints);

  return (
    <nav data-tour="tab-bar" className="flex border-b border-composer-border select-none">
      {TABS.map((tab, index) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-tour={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`cursor-pointer px-4 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "border-b-2 border-composer-accent text-composer-text"
                : "text-composer-text-muted hover:text-composer-text-secondary"
            }`}
          >
            {tab.label}
            {showHints && <InlineKeyBadge keys={["Mod", String(index + 1)]} />}
          </button>
        );
      })}
    </nav>
  );
};

export { TabBar };
