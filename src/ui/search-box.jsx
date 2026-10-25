// The search field with live suggestions, shared by the sidebar and the search page. It keeps
// its own text while typing and takes the current search from outside, so both fields show the
// same thing after a search from either of them.
import { useState, useEffect, useRef, forwardRef } from "react";
import { SearchFieldRoot, SearchFieldGroup, SearchFieldSearchIcon, SearchFieldInput, SearchFieldClearButton } from "@heroui/react";
import { API, useLang } from "../context.jsx";
import { MagnifyingGlass } from "../icons.jsx";

// localSearch: q → [{ id, label, sub, pick }]. Given, the field searches that instead of
// YouTube Music: results show as you type, picking one (or Enter) runs its `pick`. Used for
// the settings while they are open.
export const SearchBox = forwardRef(function SearchBox({ value = "", onSubmit, className = "", large = false, compact = false, localSearch = null, placeholder, ...rest }, inputRef) {
  const t = useLang();
  const [query, setQuery] = useState(value);
  useEffect(() => { setQuery(value); }, [value]);
  // Switching into or out of the local mode starts from an empty field.
  useEffect(() => { setQuery(localSearch ? "" : value); }, [!!localSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  // Debounced suggestion fetch + a dropdown under the field.
  const [suggestions, setSuggestions] = useState([]);
  const [sugActive, setSugActive] = useState(-1); // keyboard-highlighted suggestion
  const [sugOpen, setSugOpen] = useState(false);
  const sugBlurRef = useRef(null);
  useEffect(() => {
    const q = query.trim();
    if (localSearch) { setSuggestions(q ? localSearch(q) : []); return; }
    if (q.length < 2 || q === value) { setSuggestions([]); return; }
    const id = setTimeout(() => {
      fetch(`${API}/search/suggestions?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : []))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(id);
  }, [query, value, localSearch]);

  const submit = (v) => {
    const q = v.trim();
    if (!q) return;
    setSugOpen(false);
    setSuggestions([]);
    if (localSearch) { localSearch(q)[0]?.pick(); setQuery(""); return; }
    onSubmit?.(q);
  };
  const pickSuggestion = (s) => {
    setSugActive(-1);
    // Picked: the field empties for the next search rather than keeping this one.
    if (localSearch) { setSugOpen(false); s.pick(); setQuery(""); inputRef?.current?.blur?.(); return; }
    setQuery(s); submit(s);
  };

  // Styled like the app's other popovers — same surface, radius, elevation and entry motion —
  // and keyboard-navigable.
  const suggestionsOpen = sugOpen && query.trim().length >= (localSearch ? 1 : 2) && suggestions.length > 0;
  const onKey = (e) => {
    if (!suggestionsOpen) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = suggestions.length;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSugActive(i => (i + step + 1 + (n + 1)) % (n + 1) - 1);
    } else if (e.key === "Enter" && sugActive >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[sugActive]);
    } else if (e.key === "Escape") {
      setSugOpen(false);
      setSugActive(-1);
    }
  };

  return (
    <div {...rest} className={className} style={{ contain: "layout style", position: "relative", zIndex: sugOpen ? 70 : "auto" }}
      onFocus={() => { clearTimeout(sugBlurRef.current); setSugOpen(true); }}
      onBlur={() => { sugBlurRef.current = setTimeout(() => setSugOpen(false), 150); }}>
      <SearchFieldRoot aria-label={t("search")} value={query} onChange={v => { setQuery(v); setSugActive(-1); }} onSubmit={submit} className="w-full">
        {/* Heights in px, not h-7/h-11: the root font size here is 14px, which turns those into
            24.5 and 38.5. The input fills the group: HeroUI gives it a fixed height of its own,
            taller than a compact group, which pushed the text off its centre. */}
        <SearchFieldGroup className={`rounded-[var(--r-full)]! ${large ? "h-[44px]! min-h-[44px]!" : compact ? "h-[32px]! min-h-[32px]!" : ""}`}>
          <SearchFieldSearchIcon><MagnifyingGlass size={large ? 18 : compact ? 14 : 16} /></SearchFieldSearchIcon>
          <SearchFieldInput ref={inputRef} placeholder={placeholder || t("search")} onKeyDown={onKey}
            className={`h-full! ${large ? "text-[length:var(--t15)]!" : compact ? "text-[length:var(--t13)]!" : ""}`} />
          <SearchFieldClearButton />
        </SearchFieldGroup>
      </SearchFieldRoot>
      {suggestionsOpen && (
        <div
          onMouseDown={e => e.preventDefault()} /* keep field focus so onClick fires before blur */
          className="animate-[sugDropIn_0.16s_cubic-bezier(0.22,1,0.36,1)]"
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, marginTop: 8,
            // Exactly what a HeroUI popover renders as, so this list belongs to the same family
            // as every menu in the app: the overlay surface, its shadow, no border at all, and
            // min(32px, --radius-3xl).
            background: "var(--overlay)",
            borderRadius: "min(32px, var(--radius-3xl))",
            boxShadow: "var(--elevation-3)",
            overflow: "hidden", padding: 6,
          }}
        >
          {suggestions.map((s, i) => {
            const active = i === sugActive;
            // Rows are pills: with 6px of padding inside a 24px corner, anything squarer leaves
            // a visible gap between the row and the shape holding it.
            return (
              <div key={localSearch ? s.id : i} onClick={() => pickSuggestion(s)} onMouseEnter={() => setSugActive(i)}
                style={{
                  display: "flex", alignItems: "center", height: localSearch ? 44 : 34, padding: "0 14px",
                  borderRadius: "var(--r-full)", cursor: "default", fontSize: "var(--t13)",
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  background: active ? "var(--accent-dim)" : "transparent",
                  transition: "background 0.12s, color 0.12s",
                }}
              >
                {localSearch ? (
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                    <span style={{ fontSize: "var(--t11)", fontWeight: 400, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sub}</span>
                  </span>
                ) : (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
