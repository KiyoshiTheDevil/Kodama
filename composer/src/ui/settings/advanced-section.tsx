import { BUILTIN_COBALT_INSTANCE, DEFAULT_COBALT_INSTANCE_ID, useSettingsStore } from "@/stores/settings";
import { BridgeSection } from "@/ui/settings/bridge-section";
import { CobaltInstanceAddForm, CobaltInstanceEditRow } from "@/ui/settings/cobalt-instance-forms";
import { CobaltDirectoryLink, CobaltInstanceRow } from "@/ui/settings/cobalt-instances";
import { SelectSetting } from "@/ui/settings/setting-controls";
import { useState } from "react";

// -- Advanced Section ---------------------------------------------------------

const AdvancedSection: React.FC = () => {
  const cobaltInstances = useSettingsStore((s) => s.cobaltInstances);
  const selectedCobaltInstanceId = useSettingsStore((s) => s.selectedCobaltInstanceId);
  const cobaltInstanceStatus = useSettingsStore((s) => s.cobaltInstanceStatus);
  const addCobaltInstance = useSettingsStore((s) => s.addCobaltInstance);
  const updateCobaltInstance = useSettingsStore((s) => s.updateCobaltInstance);
  const removeCobaltInstance = useSettingsStore((s) => s.removeCobaltInstance);
  const selectCobaltInstance = useSettingsStore((s) => s.selectCobaltInstance);

  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <SelectSetting
        label="Preview renderer"
        description="Which engine renders synced lyrics in the Preview tab."
        settingKey="previewRenderer"
        options={[
          { value: "braccato", label: "Braccato (default)" },
          { value: "am-lyrics", label: "am-lyrics" },
        ]}
      />

      <BridgeSection />

      <div className="pt-3 mt-3 border-t border-composer-border">
        <div className="flex flex-col gap-0.5 mb-3">
          <span className="text-sm font-medium text-composer-text">Cobalt instance</span>
          <span className="text-xs text-composer-text-muted">
            Composer uses a Cobalt backend to fetch YouTube audio. The default one is currently blocked by YouTube, so
            add a working instance from cobalt.directory below, or self-host.
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <CobaltInstanceRow
            instance={BUILTIN_COBALT_INSTANCE}
            isSelected={selectedCobaltInstanceId === DEFAULT_COBALT_INSTANCE_ID}
            onSelect={() => selectCobaltInstance(DEFAULT_COBALT_INSTANCE_ID)}
          />
          {cobaltInstances.map((inst) =>
            editingId === inst.id ? (
              <CobaltInstanceEditRow
                key={inst.id}
                initialLabel={inst.label}
                initialUrl={inst.url}
                onSave={(label, url) => {
                  updateCobaltInstance(inst.id, { label, url });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <CobaltInstanceRow
                key={inst.id}
                instance={inst}
                isSelected={selectedCobaltInstanceId === inst.id}
                onSelect={() => selectCobaltInstance(inst.id)}
                onRemove={() => removeCobaltInstance(inst.id)}
                onEdit={() => setEditingId(inst.id)}
                status={cobaltInstanceStatus[inst.id]}
              />
            ),
          )}
        </div>

        <CobaltInstanceAddForm onAdd={(label, url) => addCobaltInstance({ label, url })} />

        <CobaltDirectoryLink />
      </div>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { AdvancedSection };
