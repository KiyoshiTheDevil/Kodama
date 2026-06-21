import { useSettingsStore } from "@/stores/settings";

// -- Helpers ------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSplitCharacter(): string {
  return useSettingsStore.getState().splitCharacter;
}

function cleanSplitCharacters(text: string, char?: string): string {
  const c = char ?? getSplitCharacter();
  const escaped = escapeRegex(c);
  const leading = new RegExp(`^${escaped}+`);
  const trailing = new RegExp(`${escaped}+$`);
  const consecutive = new RegExp(`${escaped}{2,}`, "g");

  return text
    .split(/\s+/)
    .flatMap((token) => {
      if (token.length === 0) return [];
      const cleaned = token.replace(leading, "").replace(trailing, "").replace(consecutive, c);
      const final = cleaned || token.replace(new RegExp(escaped, "g"), "");
      return final ? [final] : [];
    })
    .join(" ");
}

function stripSplitCharacter(text: string): string {
  const c = getSplitCharacter();
  return text.replaceAll(c, "");
}

// -- Exports ------------------------------------------------------------------

export { getSplitCharacter, cleanSplitCharacters, stripSplitCharacter };
