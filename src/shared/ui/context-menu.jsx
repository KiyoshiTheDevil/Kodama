import { useRef } from "react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownPopover,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";

// Shared enter/exit animation for HeroUI dropdown popovers (context menus, account menu).
const CTX_POPOVER_ANIM =
  "data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-top-1 data-[entering]:duration-150 data-[entering]:ease-out " +
  "data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:slide-out-to-top-1 data-[exiting]:duration-100 data-[exiting]:ease-in";

// Reusable cursor-anchored HeroUI context menu. Renders a hidden, zero-size trigger
// at the cursor position (in pre-zoom coordinates) and opens a real HeroUI Dropdown
// popover anchored to it. react-aria handles viewport clamping, Esc / outside-click
// (→ onClose), keyboard navigation and typeahead. Pass real HeroUI <DropdownItem>s
// (and <DropdownSection>s / submenus) as children via a render function that receives
// `close` for items that must dismiss the menu after an async action.
export function ContextMenu({ x, y, zoom = 1, onClose, ariaLabel, minWidth = 200, children }) {
  const anchorRef = useRef(null);
  return (
    <Dropdown
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownTrigger
        ref={anchorRef}
        aria-hidden="true"
        tabIndex={-1}
        className="fixed w-0 h-0 min-w-0 p-0 m-0 opacity-0 pointer-events-none border-0"
        style={{ left: x / zoom, top: y / zoom }}
      />
      <DropdownPopover triggerRef={anchorRef} placement="bottom start" className={CTX_POPOVER_ANIM}>
        {/* Scale the menu content with the app zoom — the popover itself is portalled to
            <body> (outside the zoomed app container), so without this it would render at
            100% while the rest of the UI is zoomed. Zooming the content (not the
            positioned popover) keeps react-aria's anchor placement correct. */}
        <DropdownMenu aria-label={ariaLabel} style={{ minWidth, zoom }}>
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
      className={
        danger
          ? "text-[#e05252]! data-[focused]:text-[#e05252]! data-[hovered]:text-[#e05252]!"
          : undefined
      }
    >
      {Icon ? <span className="w-4 flex justify-center shrink-0">{Icon}</span> : null}
      {label}
    </DropdownItem>
  );
}
