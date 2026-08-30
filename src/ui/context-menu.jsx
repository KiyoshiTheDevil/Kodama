// The cursor-anchored context menu, shared by the track rows, the grid cards and the queue.
// It lived in App.jsx while only that file opened menus; the queue panel needs the same shape
// and behaviour, and a second copy would have drifted.
import { useRef } from "react";
import { Dropdown, DropdownTrigger, DropdownPopover, DropdownItem } from "@heroui/react";
import { DropdownMenu } from "./zoomed-heroui.jsx";

// Shared enter/exit animation for HeroUI dropdown popovers (context menus, account menu).
export const CTX_POPOVER_ANIM =
  "data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-top-1 data-[entering]:duration-150 data-[entering]:ease-out " +
  "data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:slide-out-to-top-1 data-[exiting]:duration-100 data-[exiting]:ease-in";

// Renders a hidden, zero-size trigger at the cursor position (in pre-zoom coordinates) and
// opens a real HeroUI Dropdown popover anchored to it. react-aria handles viewport clamping,
// Esc / outside-click (→ onClose), keyboard navigation and typeahead. Pass real HeroUI
// <DropdownItem>s (and <DropdownSection>s / submenus) as children.
export function ContextMenu({ x, y, zoom = 1, onClose, ariaLabel, minWidth = 200, placement = "bottom start", children }) {
  const anchorRef = useRef(null);
  return (
    <Dropdown isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <DropdownTrigger
        ref={anchorRef}
        aria-hidden="true"
        tabIndex={-1}
        className="fixed w-0 h-0 min-w-0 p-0 m-0 opacity-0 pointer-events-none border-0"
        style={{ left: x / zoom, top: y / zoom }}
      />
      <DropdownPopover triggerRef={anchorRef} placement={placement} className={CTX_POPOVER_ANIM}>
        {/* DropdownMenu here is the zoom-aware wrapper (src/ui/zoomed-heroui.jsx) — it applies
            the app zoom to itself automatically, so no zoom prop needed here. */}
        <DropdownMenu aria-label={ariaLabel} style={{ minWidth }}>
          {children}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}

// Convenience wrapper for a HeroUI dropdown item with a leading icon. `danger` tints
// the row red (incl. focus state). `onSelect` runs on activation.
export function CtxItem({ icon: Icon, label, onSelect, danger, id, textValue }) {
  return (
    <DropdownItem
      id={id}
      textValue={textValue || (typeof label === "string" ? label : undefined)}
      onAction={onSelect}
      className={danger ? "text-[var(--status-danger)]! data-[focused]:text-[var(--status-danger)]! data-[hovered]:text-[var(--status-danger)]!" : undefined}
    >
      {Icon ? <span className="w-4 flex justify-center shrink-0">{Icon}</span> : null}
      {label}
    </DropdownItem>
  );
}
