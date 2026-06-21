import { useConfirm } from "@/stores/confirm-store";
import { useSettingsStore } from "@/stores/settings";
import { Button } from "@/ui/button";
import { ToggleSetting } from "@/ui/settings/setting-controls";
import { IconRefresh, IconRoute } from "@tabler/icons-react";

// -- General Section ----------------------------------------------------------

const GeneralSection: React.FC<{
  onResetTour: () => void;
  onClose: () => void;
}> = ({ onResetTour, onClose }) => {
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const confirm = useConfirm();

  const handleResetSettings = async () => {
    const ok = await confirm({
      title: "Reset all settings?",
      description: "Restore every setting to its default value. Your project data is not affected.",
      confirmLabel: "Reset",
      variant: "destructive",
      settingsKey: "confirmResetSettings",
    });
    if (ok) resetToDefaults();
  };

  return (
    <div className="divide-y divide-composer-border">
      <ToggleSetting
        label="Show shortcut hints"
        description="Display keyboard shortcut badges on toolbar buttons."
        settingKey="showShortcutHints"
      />
      <ToggleSetting
        label="Show syllable indicators"
        description="Visually group syllables split from one word."
        settingKey="showSyllableIndicators"
      />
      <ToggleSetting
        label="Auto-extract background vocals"
        description="Move parenthesised text into background vocals when lyrics are pasted, imported, or edited."
        settingKey="autoExtractBackgroundVocals"
      />
      <ToggleSetting
        label="Merge standalone background lines"
        description="When a whole line is in parentheses, attach it to the line above instead of keeping it as its own line."
        settingKey="mergeStandaloneBackgroundLines"
      />
      <ToggleSetting
        label="Preserve brackets when extracting"
        description="Keep parentheses around extracted background vocals. Multiple snippets share one outer pair."
        settingKey="preserveBracketsOnExtraction"
      />
      <div className="flex items-center justify-between py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-composer-text">Reset product tour</span>
          <span className="text-xs text-composer-text-muted">
            Restart the guided walkthrough that introduces Composer's features.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          hasIcon
          onClick={() => {
            onResetTour();
            onClose();
          }}
        >
          <IconRoute size={14} />
          Reset tour
        </Button>
      </div>
      <div className="flex items-center justify-between py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-composer-text">Reset to defaults</span>
          <span className="text-xs text-composer-text-muted">Restore all settings to their original values.</span>
        </div>
        <Button size="sm" variant="secondary" hasIcon onClick={handleResetSettings}>
          <IconRefresh size={14} />
          Reset all
        </Button>
      </div>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { GeneralSection };
