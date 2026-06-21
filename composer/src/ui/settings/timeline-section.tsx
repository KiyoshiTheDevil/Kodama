import { useSettingsStore } from "@/stores/settings";
import { SliderSetting, ToggleSetting } from "@/ui/settings/setting-controls";
import { useTimelineStore } from "@/views/timeline/timeline-store";

// -- Timeline Section ---------------------------------------------------------

const TimelineSection: React.FC = () => {
  const set = useSettingsStore((s) => s.set);

  return (
    <div className="divide-y divide-composer-border">
      <SliderSetting
        label="Default zoom"
        description="Initial zoom level (px/sec) when opening the timeline."
        settingKey="defaultZoom"
        min={20}
        max={500}
        step={20}
        format={(v) => `${v} px/s`}
        action={{
          label: "Use current",
          onClick: () => set("defaultZoom", useTimelineStore.getState().zoom),
        }}
      />
      <SliderSetting
        label="Default row height"
        description="Starting height of each lyric row in the timeline."
        settingKey="defaultRowHeight"
        min={32}
        max={120}
        step={4}
        format={(v) => `${v}px`}
        action={{
          label: "Use current",
          onClick: () => set("defaultRowHeight", useTimelineStore.getState().defaultRowHeight),
        }}
      />
      <ToggleSetting
        label="Snap (magnet)"
        description="Word edges snap to nearby anchors when dragging or resizing."
        settingKey="timelineSnap"
      />
      <SliderSetting
        label="Snap threshold"
        description="Distance (in pixels) at which the moving block locks onto an anchor."
        settingKey="timelineSnapThreshold"
        min={4}
        max={24}
        step={1}
        format={(v) => `${v}px`}
      />
      <ToggleSetting
        label="Follow playhead"
        description="Auto-scroll the timeline to keep the playhead visible."
        settingKey="followPlayhead"
      />
      <ToggleSetting
        label="Scroll wheel scrolls timeline"
        description="Plain scroll moves the timeline horizontally. Hold Shift to scroll vertically."
        settingKey="timelineHorizontalScroll"
      />
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { TimelineSection };
