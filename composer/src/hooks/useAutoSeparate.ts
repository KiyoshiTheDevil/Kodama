import { useEffect } from "react";
import { useAudioStore } from "@/stores/audio";
import { useSeparationStore } from "@/stores/separation";
import { useSettingsStore } from "@/stores/settings";

function useAutoSeparate(): void {
  useEffect(() => {
    let prevKey: string | null = null;
    const unsub = useAudioStore.subscribe(async (state) => {
      const source = state.source;
      const file = source?.type === "file" ? source.file : source?.type === "youtube" ? source.file : null;
      const key = file ? `${file.name}|${file.size}|${file.lastModified ?? 0}` : null;
      if (key === prevKey) return;
      prevKey = key;

      const sep = useSeparationStore.getState();
      await sep.refreshForCurrentSource();

      if (!key) return;
      if (!useSettingsStore.getState().autoSeparateOnImport) return;
      if (!sep.hostingConfigured) return;
      if (sep.status === "downloading" || sep.status === "processing") return;
      sep.separate();
    });
    return () => unsub();
  }, []);
}

export { useAutoSeparate };
