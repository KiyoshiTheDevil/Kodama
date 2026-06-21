import { useAudioStore } from "@/stores/audio";
import { useSettingsStore } from "@/stores/settings";
import { SelectSetting, SliderSetting, ToggleSetting } from "@/ui/settings/setting-controls";

// -- Playback Section ---------------------------------------------------------

const PlaybackSection: React.FC = () => {
  const set = useSettingsStore((s) => s.set);
  const hasAudio = useAudioStore((s) => s.source !== null);

  return (
    <div className="divide-y divide-composer-border">
      <SliderSetting
        label="Default playback rate"
        description="Starting playback speed when audio is loaded."
        settingKey="defaultPlaybackRate"
        min={0.25}
        max={2}
        step={0.05}
        format={(v) => `${v.toFixed(2)}x`}
        action={
          hasAudio
            ? {
                label: "Use current",
                onClick: () => set("defaultPlaybackRate", useAudioStore.getState().playbackRate),
              }
            : undefined
        }
      />
      <ToggleSetting
        label="Remember volume"
        description="Keep your volume level between sessions."
        settingKey="rememberVolume"
      />
      <ToggleSetting
        label="Audio scrub preview"
        description="Play a short audio snippet while dragging or wheel-scrubbing the playhead."
        settingKey="audioScrubPreview"
      />
      <ToggleSetting
        label="Auto-separate vocals on import"
        description="Run the vocal-separation model automatically each time a new audio file is loaded."
        settingKey="autoSeparateOnImport"
      />
      <SelectSetting
        label="Vocal model precision"
        description="fp32 is the stable default. fp16 is smaller but may produce invalid output in some browsers."
        settingKey="vocalModelVariant"
        options={[
          { value: "fp32", label: "fp32 (~171 MB, recommended)" },
          { value: "fp16", label: "fp16 (~85 MB, experimental)" },
        ]}
      />
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { PlaybackSection };
