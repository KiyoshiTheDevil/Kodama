import {
  SHORTCUT_DEFINITIONS,
  type ShortcutBinding,
  type ShortcutDefinition,
  type ShortcutScope,
} from "@/stores/shortcut-definitions";

// -- Helpers ------------------------------------------------------------------

const registryMap = new Map<string, ShortcutDefinition>(SHORTCUT_DEFINITIONS.map((d) => [d.id, d]));

function getShortcutById(id: string): ShortcutDefinition | undefined {
  return registryMap.get(id);
}

function getShortcutsByScope(scope: ShortcutScope): ShortcutDefinition[] {
  return SHORTCUT_DEFINITIONS.filter((d) => d.scope === scope);
}

// -- Exports ------------------------------------------------------------------

export { SHORTCUT_DEFINITIONS as SHORTCUT_REGISTRY, getShortcutById, getShortcutsByScope };
export type { ShortcutBinding, ShortcutScope, ShortcutDefinition };
