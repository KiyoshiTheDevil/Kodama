import { getEffectiveBinding } from "@/stores/shortcut-bindings";
import {
  type ShortcutBinding,
  type ShortcutDefinition,
  type ShortcutScope,
  SHORTCUT_REGISTRY,
  getShortcutsByScope,
} from "@/stores/shortcut-registry";
import { isMac } from "@/utils/platform";

// -- Matching -----------------------------------------------------------------

// On macOS, holding Option/Alt rewrites `event.key` to the layout-specific
// glyph (Alt+E → "´", Alt+Shift+E → "´") instead of the base letter. Fall back
// to `event.code` (e.g., "KeyE", "Digit1") which reflects the physical key
// regardless of modifiers, so alt-bearing bindings still match.
function getEventKey(event: KeyboardEvent): string {
  if (event.altKey) {
    if (event.code.startsWith("Key") && event.code.length === 4) return event.code.slice(3).toLowerCase();
    if (event.code.startsWith("Digit") && event.code.length === 6) return event.code.slice(5);
  }
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

function matchesBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (binding.key === "") return false;
  const eventKey = getEventKey(event);
  const bindingKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key;

  if (eventKey !== bindingKey) return false;
  if (!!binding.shift !== event.shiftKey) return false;
  if (!!binding.alt !== event.altKey) return false;

  if (binding.mod) {
    const modActive = isMac ? event.metaKey : event.ctrlKey;
    if (!modActive) return false;
    return true;
  }

  if (!!binding.ctrl !== event.ctrlKey) return false;
  if (!!binding.meta !== event.metaKey) return false;

  return true;
}

function findMatchingShortcut(event: KeyboardEvent, scope: ShortcutScope): string | null {
  const shortcuts = getShortcutsByScope(scope);
  for (const shortcut of shortcuts) {
    const binding = getEffectiveBinding(shortcut.id);
    if (matchesBinding(event, binding)) return shortcut.id;
  }
  return null;
}

// -- Conflict Detection -------------------------------------------------------

function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  const aKey = a.key.length === 1 ? a.key.toLowerCase() : a.key;
  const bKey = b.key.length === 1 ? b.key.toLowerCase() : b.key;
  return (
    aKey === bKey &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt &&
    !!a.ctrl === !!b.ctrl &&
    !!a.meta === !!b.meta &&
    !!a.mod === !!b.mod
  );
}

function scopesConflict(a: ShortcutScope, b: ShortcutScope): boolean {
  if (a === "global" || b === "global") return true;
  return a === b;
}

function detectConflicts(id: string, newBinding: ShortcutBinding): ShortcutDefinition[] {
  const source = SHORTCUT_REGISTRY.find((d) => d.id === id);
  if (!source) return [];

  return SHORTCUT_REGISTRY.filter((def) => {
    if (def.id === id) return false;
    if (!scopesConflict(source.scope, def.scope)) return false;
    const effective = getEffectiveBinding(def.id);
    return bindingsEqual(effective, newBinding);
  });
}

// -- Reserved Browser Shortcuts -----------------------------------------------

const RESERVED_BROWSER_SHORTCUTS: ShortcutBinding[] = [
  // Tab/window management
  { key: "t", mod: true },
  { key: "n", mod: true },
  { key: "n", mod: true, shift: true },
  { key: "w", mod: true },
  { key: "w", mod: true, shift: true },
  { key: "Tab", ctrl: true },
  ...(isMac ? [{ key: "Tab", meta: true, alt: true }] : []),
  ...(isMac ? [{ key: "q", meta: true }] : []),

  // Navigation
  { key: "l", mod: true },
  { key: "r", mod: true },
  { key: "r", mod: true, shift: true },

  // Find
  { key: "f", mod: true },
  { key: "g", mod: true },

  // Page actions
  { key: "p", mod: true },
  { key: "s", mod: true },
  { key: "d", mod: true },

  // Developer tools
  ...(isMac
    ? [
        { key: "i", meta: true, alt: true },
        { key: "j", meta: true, alt: true },
      ]
    : [
        { key: "I", ctrl: true, shift: true },
        { key: "J", ctrl: true, shift: true },
      ]),
  { key: "u", mod: true },

  // History
  ...(isMac
    ? [
        { key: "h", meta: true },
        { key: "[", meta: true },
        { key: "]", meta: true },
      ]
    : [{ key: "h", ctrl: true }]),

  // Zoom
  { key: "=", mod: true },
  { key: "-", mod: true },
  { key: "0", mod: true },
];

function isReservedBrowserShortcut(binding: ShortcutBinding): boolean {
  return RESERVED_BROWSER_SHORTCUTS.some((reserved) => bindingsEqual(reserved, binding));
}

// -- Exports ------------------------------------------------------------------

export { findMatchingShortcut, detectConflicts, isReservedBrowserShortcut };
