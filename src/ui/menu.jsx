// Menus that turn into sheets in the compact layout, from the menus the app already has.
//
// Every menu in Kodama is written as HeroUI markup (DropdownSection / DropdownItem / submenus).
// At phone width a popover hanging off a small button, with submenus that open on hover, does
// not work; a sheet from the bottom with pages for the submenus does. Rather than keep a second
// list of every menu's actions for that (which drifts), the markup is read: menuChildrenToItems
// walks it and builds the ActionSheet's items, and the wrappers below use that whenever the
// compact layout is on. On the desktop nothing changes: the HeroUI dropdown renders as before.
import { Children, isValidElement, Fragment, useState } from "react";
import {
  Dropdown as HeroDropdown, DropdownPopover, DropdownMenu as HeroDropdownMenu,
  DropdownSection, DropdownItem, DropdownSubmenuTrigger, DropdownSubmenuIndicator,
} from "@heroui/react";
import { DropdownMenu as ZoomedDropdownMenu } from "./zoomed-heroui.jsx";
import { useCompact } from "../context.jsx";
import { Check } from "../icons.jsx";
import { ActionSheet } from "./action-sheet.jsx";

const isMenu = (el) => el.type === HeroDropdownMenu || el.type === ZoomedDropdownMenu;

// Children as a flat list of elements: fragments, arrays, null and `cond && <x/>` unrolled.
function flat(children) {
  const out = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === Fragment) out.push(...flat(c.props.children));
    else out.push(c);
  });
  return out;
}

// The visible words of an item, for items that give no textValue.
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf(node.props.children);
  return "";
}

// An item's leading icon: its first child element that carries no text of its own (an icon,
// or the span the menus wrap icons in), skipping the submenu arrow and trailing check marks.
function iconOf(children) {
  for (const c of flat(children)) {
    if (c.type === DropdownSubmenuIndicator || c.type === Check) continue;
    if (!textOf(c).trim()) return c;
    return null; // text came first: no leading icon
  }
  return null;
}

const hasCheck = (children) => flat(children).some((c) => c.type === Check || (c.props?.children && hasCheck(c.props.children)));

function itemFrom(el, menuOnAction, divider) {
  const p = el.props;
  // CtxItem (context-menu.jsx) is a wrapper around DropdownItem with its own props.
  if (el.type?.isCtxItem) {
    return {
      id: String(p.id ?? el.key ?? p.label), label: p.textValue || textOf(p.label), icon: p.icon || null,
      danger: !!p.danger, divider, onPress: () => { p.onSelect?.(); menuOnAction?.(p.id ?? el.key); },
    };
  }
  const key = p.id ?? el.key;
  const cls = String(p.className || "");
  return {
    id: String(key ?? textOf(p.children)),
    label: p.textValue || textOf(p.children).trim(),
    icon: iconOf(p.children),
    danger: cls.includes("status-danger"),
    checked: hasCheck(p.children),
    disabled: !!p.isDisabled,
    divider,
    onPress: () => { p.onAction?.(); menuOnAction?.(key); },
  };
}

/** The items of a DropdownMenu's children, for ActionSheet. Sections become groups (a divider
 *  before every one but the first), submenus become pages. */
export function menuChildrenToItems(children, menuOnAction) {
  const items = [];
  let sectionCount = 0;
  const walk = (nodes, startDivider) => {
    let divider = startDivider;
    for (const el of flat(nodes)) {
      if (el.type === DropdownSection) {
        walk(el.props.children, sectionCount++ > 0);
        divider = false;
        continue;
      }
      if (el.type === DropdownSubmenuTrigger) {
        const [triggerItem, popover] = flat(el.props.children);
        if (!triggerItem) continue;
        const menu = popover && flat(popover.props.children).find(isMenu);
        const it = itemFrom(triggerItem, null, divider);
        it.sub = menu ? menuChildrenToItems(menu.props.children, menu.props.onAction) : [];
        delete it.onPress;
        items.push(it);
        divider = false;
        continue;
      }
      if (el.type === DropdownItem || el.type?.isCtxItem) {
        items.push(itemFrom(el, menuOnAction, divider));
        divider = false;
        continue;
      }
      // Anything else (a heading div, a custom row) is not part of the sheet.
    }
  };
  walk(children, false);
  return items;
}

/** The menu inside a Dropdown's popover, as sheet items. */
function itemsFromDropdown(children) {
  const popover = flat(children).find((c) => c.type === DropdownPopover);
  const menu = popover && flat(popover.props.children).find(isMenu);
  return menu ? menuChildrenToItems(menu.props.children, menu.props.onAction) : [];
}

/**
 * Drop-in for HeroUI's Dropdown. In the compact layout pressing the trigger opens the menu as
 * an ActionSheet (built from the same markup) instead of the popover; the owner's onOpenChange
 * still hears about it, so menus that load their content on open keep working.
 */
export function Dropdown({ children, onOpenChange, ...props }) {
  const compact = useCompact();
  const [sheet, setSheet] = useState(false);
  if (!compact) return <HeroDropdown onOpenChange={onOpenChange} {...props}>{children}</HeroDropdown>;
  return (
    <>
      <HeroDropdown {...props} isOpen={false}
        onOpenChange={(open) => { if (open) { onOpenChange?.(true); setSheet(true); } }}>
        {children}
      </HeroDropdown>
      <ActionSheet open={sheet} onClose={() => { setSheet(false); onOpenChange?.(false); }}
        items={sheet ? itemsFromDropdown(children) : []} />
    </>
  );
}
