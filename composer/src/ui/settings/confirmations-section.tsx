import { ToggleSetting } from "@/ui/settings/setting-controls";

// -- Confirmations Section ----------------------------------------------------

const ConfirmationsSection: React.FC = () => {
  return (
    <div className="py-3">
      <div className="flex flex-col gap-0.5 mb-3">
        <span className="text-sm font-medium text-composer-text">Confirmation prompts</span>
        <span className="text-xs text-composer-text-muted">
          Toggle confirmation prompts for actions that can lose work. Turn one off to skip its warning until you
          re-enable it here.
        </span>
      </div>
      <div className="divide-y divide-composer-border">
        <ToggleSetting
          label="Confirm replacing project from URL"
          description="Show a warning when an import URL would replace your current project."
          settingKey="confirmReplaceProjectFromHash"
        />
        <ToggleSetting
          label="Confirm replacing lyrics on import"
          description="Show a warning when importing lyrics into a project that already has lines."
          settingKey="confirmReplaceLyrics"
        />
        <ToggleSetting
          label="Confirm resetting sync timing"
          description="Show a warning before clearing every word and line timing in the sync view."
          settingKey="confirmSyncReset"
        />
        <ToggleSetting
          label="Confirm clearing project"
          description="Show a warning before discarding the current project, metadata, and audio file."
          settingKey="confirmClearProject"
        />
        <ToggleSetting
          label="Confirm resetting all settings"
          description="Show a warning before restoring all settings to their defaults."
          settingKey="confirmResetSettings"
        />
        <ToggleSetting
          label="Confirm resetting all shortcuts"
          description="Show a warning before clearing all custom keyboard bindings."
          settingKey="confirmResetShortcuts"
        />
        <ToggleSetting
          label="Confirm before splitting multiple identical words"
          description="Show a warning when a syllable split would also apply to other identical words across the project."
          settingKey="confirmApplyToAllSyllableSplit"
        />
      </div>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { ConfirmationsSection };
