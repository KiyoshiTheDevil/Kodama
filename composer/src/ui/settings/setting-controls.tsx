import { useSettingsStore } from "@/stores/settings";
import type { SettingsState } from "@/stores/settings";
import { cn } from "@/utils/cn";

// -- Setting Controls ---------------------------------------------------------

const SliderSetting: React.FC<{
  label: string;
  description: string;
  settingKey: keyof SettingsState;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  action?: { label: string; onClick: () => void };
}> = ({ label, description, settingKey, min, max, step, format, action }) => {
  const value = useSettingsStore((s) => s[settingKey]) as number;
  const set = useSettingsStore((s) => s.set);
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-composer-text">{label}</span>
          <span className="text-xs text-composer-text-muted">{description}</span>
        </div>
        <div className="flex items-center gap-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="text-xs text-composer-accent-text hover:text-composer-accent cursor-pointer transition-colors"
            >
              {action.label}
            </button>
          )}
          <span className="text-sm font-mono text-composer-text-secondary tabular-nums min-w-12 text-right">
            {format ? format(value) : value}
          </span>
        </div>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(settingKey, Number(e.target.value))}
        className="settings-slider w-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--color-composer-accent) ${percent}%, var(--color-composer-button) ${percent}%)`,
        }}
      />
    </div>
  );
};

const ToggleSetting: React.FC<{
  label: string;
  description: string;
  settingKey: keyof SettingsState;
}> = ({ label, description, settingKey }) => {
  const value = useSettingsStore((s) => s[settingKey]) as boolean;
  const set = useSettingsStore((s) => s.set);

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-composer-text">{label}</span>
        <span className="text-xs text-composer-text-muted">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => set(settingKey, !value)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
          value ? "bg-composer-accent" : "bg-composer-button",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-4 rounded-full bg-white shadow transform transition-transform mt-0.5",
            value ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
};

const SelectSetting: React.FC<{
  label: string;
  description: string;
  settingKey: keyof SettingsState;
  options: { value: string; label: string }[];
}> = ({ label, description, settingKey, options }) => {
  const value = useSettingsStore((s) => s[settingKey]) as string;
  const set = useSettingsStore((s) => s.set);

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-composer-text">{label}</span>
        <span className="text-xs text-composer-text-muted">{description}</span>
      </div>
      <select
        value={value}
        onChange={(e) => set(settingKey, e.target.value as SettingsState[typeof settingKey])}
        className="h-7 px-2 text-sm rounded-lg bg-composer-input text-composer-text border border-composer-border focus:outline-none focus:border-composer-accent cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { SliderSetting, ToggleSetting, SelectSetting };
