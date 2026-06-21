import {
  DEFAULTS,
  DEFAULT_COBALT_INSTANCE_ID,
  getActiveCobaltInstance,
  isUsingDefaultCobaltInstance,
  useSettingsStore,
} from "@/stores/settings";
import { beforeEach, describe, expect, it } from "vitest";

describe("preview renderer settings", () => {
  beforeEach(() => {
    useSettingsStore.setState({ ...DEFAULTS });
  });

  it("defaults to braccato as the preview renderer", () => {
    expect(useSettingsStore.getState().previewRenderer).toBe("braccato");
  });

  it("defaults audioScrubPreview to true", () => {
    expect(useSettingsStore.getState().audioScrubPreview).toBe(true);
  });

  it("allows switching renderer via set()", () => {
    useSettingsStore.getState().set("previewRenderer", "am-lyrics");
    expect(useSettingsStore.getState().previewRenderer).toBe("am-lyrics");
  });

  it("resetToDefaults restores the renderer to braccato", () => {
    useSettingsStore.getState().set("previewRenderer", "am-lyrics");
    useSettingsStore.getState().resetToDefaults();
    expect(useSettingsStore.getState().previewRenderer).toBe("braccato");
  });
});

describe("vocal model settings", () => {
  beforeEach(() => {
    useSettingsStore.setState({ ...DEFAULTS });
  });

  it("defaults to fp32 for stable browser inference", () => {
    expect(useSettingsStore.getState().vocalModelVariant).toBe("fp32");
  });
});

describe("background vocal extraction settings", () => {
  beforeEach(() => {
    useSettingsStore.setState({ ...DEFAULTS });
  });

  it("defaults autoExtractBackgroundVocals to true", () => {
    expect(DEFAULTS.autoExtractBackgroundVocals).toBe(true);
    expect(useSettingsStore.getState().autoExtractBackgroundVocals).toBe(true);
  });

  it("defaults mergeStandaloneBackgroundLines to true", () => {
    expect(DEFAULTS.mergeStandaloneBackgroundLines).toBe(true);
    expect(useSettingsStore.getState().mergeStandaloneBackgroundLines).toBe(true);
  });

  it("defaults preserveBracketsOnExtraction to false", () => {
    expect(DEFAULTS.preserveBracketsOnExtraction).toBe(false);
    expect(useSettingsStore.getState().preserveBracketsOnExtraction).toBe(false);
  });

  it("allows toggling preserveBracketsOnExtraction via set()", () => {
    useSettingsStore.getState().set("preserveBracketsOnExtraction", true);
    expect(useSettingsStore.getState().preserveBracketsOnExtraction).toBe(true);
    useSettingsStore.getState().set("preserveBracketsOnExtraction", false);
    expect(useSettingsStore.getState().preserveBracketsOnExtraction).toBe(false);
  });

  it("allows toggling autoExtractBackgroundVocals via set()", () => {
    useSettingsStore.getState().set("autoExtractBackgroundVocals", false);
    expect(useSettingsStore.getState().autoExtractBackgroundVocals).toBe(false);
    useSettingsStore.getState().set("autoExtractBackgroundVocals", true);
    expect(useSettingsStore.getState().autoExtractBackgroundVocals).toBe(true);
  });

  it("allows disabling mergeStandaloneBackgroundLines via set()", () => {
    useSettingsStore.getState().set("mergeStandaloneBackgroundLines", false);
    expect(useSettingsStore.getState().mergeStandaloneBackgroundLines).toBe(false);
  });

  it("resetToDefaults restores the background vocal toggles", () => {
    useSettingsStore.getState().set("autoExtractBackgroundVocals", false);
    useSettingsStore.getState().set("mergeStandaloneBackgroundLines", false);
    useSettingsStore.getState().resetToDefaults();
    expect(useSettingsStore.getState().autoExtractBackgroundVocals).toBe(true);
    expect(useSettingsStore.getState().mergeStandaloneBackgroundLines).toBe(true);
  });
});

describe("cobalt instance helpers", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULTS,
      cobaltInstances: [],
      selectedCobaltInstanceId: DEFAULT_COBALT_INSTANCE_ID,
    });
  });

  it("isUsingDefaultCobaltInstance returns true when default is selected", () => {
    expect(isUsingDefaultCobaltInstance()).toBe(true);
  });

  it("isUsingDefaultCobaltInstance returns false when a custom instance is active", () => {
    useSettingsStore.getState().addCobaltInstance({ label: "Custom", url: "https://example.test" });
    const custom = useSettingsStore.getState().cobaltInstances[0];
    useSettingsStore.getState().selectCobaltInstance(custom.id);
    expect(isUsingDefaultCobaltInstance()).toBe(false);
  });

  it("isUsingDefaultCobaltInstance falls back to default when selected id is missing", () => {
    useSettingsStore.setState({ selectedCobaltInstanceId: "ghost-id" });
    expect(isUsingDefaultCobaltInstance()).toBe(true);
  });

  it("getActiveCobaltInstance returns the built-in for the default id", () => {
    expect(getActiveCobaltInstance().id).toBe(DEFAULT_COBALT_INSTANCE_ID);
  });

  it("getActiveCobaltInstance returns the matching custom instance", () => {
    useSettingsStore.getState().addCobaltInstance({ label: "Custom", url: "https://example.test" });
    const custom = useSettingsStore.getState().cobaltInstances[0];
    useSettingsStore.getState().selectCobaltInstance(custom.id);
    expect(getActiveCobaltInstance().url).toBe("https://example.test");
  });
});
