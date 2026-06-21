import { useSettingsStore } from "@/stores/settings";
import { BridgeError } from "@/utils/composer-bridge-api";

// -- Helpers ------------------------------------------------------------------

function shouldShowBridgeCta(cause: unknown): boolean {
  if (useSettingsStore.getState().experiments.youtubeBridge) return false;
  if (cause instanceof BridgeError) return false;
  return true;
}

// -- Exports ------------------------------------------------------------------

export { shouldShowBridgeCta };
