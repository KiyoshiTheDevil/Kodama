import { useConfirm } from "@/stores/confirm-store";
import { getEffectiveKeysArray, useShortcutBindingsStore } from "@/stores/shortcut-bindings";
import { type ShortcutScope, getShortcutsByScope } from "@/stores/shortcut-registry";
import { Button } from "@/ui/button";
import { ShortcutRebindRow } from "@/ui/shortcut-rebind-row";
import { IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// -- Constants ----------------------------------------------------------------

const SCOPE_GROUPS: { scope: ShortcutScope; title: string }[] = [
  { scope: "global", title: "General" },
  { scope: "sync", title: "Sync Mode" },
  { scope: "timeline", title: "Timeline Mode" },
];

// -- Component ----------------------------------------------------------------

const ShortcutsSettingsSection: React.FC = () => {
  const resetAllBindings = useShortcutBindingsStore((s) => s.resetAllBindings);
  const overrides = useShortcutBindingsStore((s) => s.overrides);
  const hasOverrides = Object.keys(overrides).length > 0;
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const scrollPanelToTop = useCallback(() => {
    let parent: HTMLElement | null = searchRef.current?.parentElement ?? null;
    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        parent.scrollTop = 0;
        return;
      }
      parent = parent.parentElement;
    }
  }, []);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.key.length !== 1) return;
      e.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
      scrollPanelToTop();
      setQuery((prev) => prev + e.key);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [scrollPanelToTop]);

  const handleResetShortcuts = async () => {
    const ok = await confirm({
      title: "Reset all shortcuts?",
      description: "Clear every custom keyboard binding and restore the defaults.",
      confirmLabel: "Reset",
      variant: "destructive",
      settingsKey: "confirmResetShortcuts",
    });
    if (ok) resetAllBindings();
  };

  const filteredScopes = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return SCOPE_GROUPS.flatMap(({ scope, title }) => {
      const shortcuts = getShortcutsByScope(scope).filter((def) => {
        if (trimmed.length === 0) return true;
        if (def.description.toLowerCase().includes(trimmed)) return true;
        if (def.id.toLowerCase().includes(trimmed)) return true;
        if (title.toLowerCase().includes(trimmed)) return true;
        const keys = getEffectiveKeysArray(def.id).join(" ").toLowerCase();
        return keys.includes(trimmed);
      });
      return shortcuts.length > 0 ? [{ scope, title, shortcuts }] : [];
    });
  }, [query]);

  return (
    <div className="space-y-6 py-4">
      <div ref={searchRef} className="relative">
        <IconSearch
          size={12}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-composer-text opacity-50 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search shortcuts"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            scrollPanelToTop();
          }}
          placeholder="Search shortcuts"
          className="w-full h-7 pl-7 pr-7 text-xs rounded-md bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent text-composer-text placeholder:text-composer-text-muted"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-composer-text opacity-50 hover:opacity-100 hover:bg-composer-button cursor-pointer transition-opacity"
          >
            <IconX size={11} />
          </button>
        )}
      </div>

      {filteredScopes.length === 0 ? (
        <p className="text-sm text-composer-text-muted text-center py-6">No shortcuts match "{query}".</p>
      ) : (
        filteredScopes.map(({ scope, title, shortcuts }) => (
          <div key={scope}>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-composer-text-muted">{title}</h3>
            <div className="divide-y divide-composer-border">
              {shortcuts.map((def) => (
                <ShortcutRebindRow key={def.id} definition={def} />
              ))}
            </div>
          </div>
        ))
      )}

      <div className="flex items-center justify-between pt-2 border-t border-composer-border">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-composer-text">Reset all shortcuts</span>
          <span className="text-xs text-composer-text-muted">Restore all keyboard shortcuts to their defaults.</span>
        </div>
        <Button size="sm" variant="secondary" hasIcon onClick={handleResetShortcuts} disabled={!hasOverrides}>
          <IconRefresh size={14} />
          Reset all
        </Button>
      </div>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { ShortcutsSettingsSection };
