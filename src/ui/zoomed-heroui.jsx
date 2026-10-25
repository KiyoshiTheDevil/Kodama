// Our wrappers around a few HeroUI components. Mostly about the app's UI zoom; ModalRoot at
// the bottom is here for a different reason, explained there.
//
// react-aria-components positions the *outer* Popover/Modal wrapper using the trigger's
// real (already-zoomed) screen coordinates, set directly as inline left/top on that same
// element — putting the app's `zoom` on that element too would multiply its own offset
// again (an element's own `zoom` scales its own position, not just its content), throwing
// the popover/modal off by however much zoom is applied. Applying `zoom` to a plain child
// instead scales the content visually without touching where react-aria placed the wrapper.
//
// DropdownMenu/ModalDialog are exactly that plain child (see @heroui/react's dropdown.js:
// DropdownPopover wraps react-aria's positioned Popover, DropdownMenu wraps its Menu; and
// modal.js: ModalContainer wraps react-aria's Modal, ModalDialog wraps its Dialog) — so
// re-exporting zoom-aware versions of just these two, and importing from here instead of
// "@heroui/react" wherever they're used, applies the fix without touching every call site.
import { Children, cloneElement, isValidElement, useRef } from "react";
import { DropdownMenu as HeroDropdownMenu, ModalDialog as HeroModalDialog } from "@heroui/react";
import { useZoom, useCompact } from "../context.jsx";

export function DropdownMenu({ style, ...props }) {
  const zoom = useZoom();
  return <HeroDropdownMenu style={{ ...style, zoom }} {...props} />;
}

export function ModalDialog({ style, children, ...props }) {
  const zoom = useZoom();
  const compact = useCompact();
  // Compact layout: the modal is a sheet (index.css). Pulling it down by its grabber moves it
  // with the finger; past 100px, or flicked, it presses the modal's own close button, so every
  // modal closes the way it always has (state, callbacks) without knowing about any of this.
  const drag = useRef(null);
  const onGrabDown = (e) => {
    const dialog = e.currentTarget.parentElement;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { dialog, y0: e.clientY, t0: performance.now(), dy: 0 };
    dialog.style.transition = "none";
  };
  const onGrabMove = (e) => {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    d.dialog.style.transform = `translateY(${d.dy}px)`;
  };
  const onGrabUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const fast = d.dy > 30 && d.dy / Math.max(1, performance.now() - d.t0) > 0.6;
    d.dialog.style.transition = "transform 0.22s cubic-bezier(0.22,1,0.36,1)";
    if (d.dy > 100 || fast) {
      d.dialog.style.transform = "translateY(110%)";
      // The modal's own close button: HeroUI's, or one a modal draws itself and marks with
      // data-modal-close (the lyrics browser). A synthetic Escape is not taken by react-aria,
      // so there is no fallback beyond that: should nothing close it, the sheet slides back.
      const close = d.dialog.querySelector(".modal__close-trigger, [data-modal-close]");
      setTimeout(() => {
        if (close) close.click();
        setTimeout(() => { if (d.dialog.isConnected) d.dialog.style.transform = ""; }, 400);
      }, 180);
    } else {
      d.dialog.style.transform = "";
    }
  };
  // HeroUI's .modal__dialog has no max-height of its own — it's a flex item inside
  // .modal__container (which IS capped to the real, unzoomed viewport height) and relies on
  // shrinking to fit, with .modal__body--scroll-inside scrolling any overflow. Flex items
  // default to min-height:auto (shrink-resistant), so once `zoom` inflates the dialog's
  // intrinsic content size past what the container allows, it pokes out past the container's
  // edges (no bottom margin, clipped) instead of capping and letting the body scroll
  // internally. maxHeight:100% (of the container's real fixed height) + minHeight:0 lets it
  // actually shrink to fit, handing overflow back to the body's own scroll.
  // Compact: the zoom goes on an inner wrapper, not the dialog. An element's own zoom scales
  // its position too, which a centred box hides but a sheet docked at the bottom does not: at
  // 90% it ended 72px above the window's edge (and short of the right one at other zooms).
  if (compact) {
    return (
      <HeroModalDialog style={{ ...style, maxHeight: "100%", minHeight: 0 }} {...props}>
        <div aria-hidden="true" className="touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 28, display: "flex", justifyContent: "center", alignItems: "center", zIndex: 5 }}>
          <div style={{ width: 40, height: 4, borderRadius: 4, background: "var(--fill-strong)" }} />
        </div>
        <div style={{ zoom, display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, maxHeight: "100%" }}>
          {children}
        </div>
      </HeroModalDialog>
    );
  }
  return (
    <HeroModalDialog style={{ ...style, zoom, maxHeight: "100%", minHeight: 0 }} {...props}>
      {compact && (
        <div aria-hidden="true" className="touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 28, display: "flex", justifyContent: "center", alignItems: "center", zIndex: 5 }}>
          <div style={{ width: 40, height: 4, borderRadius: 4, background: "var(--fill-strong)" }} />
        </div>
      )}
      {children}
    </HeroModalDialog>
  );
}

/**
 * The open state of a controlled modal, put where react-aria expects it.
 *
 * HeroUI's ModalRoot is react-aria's DialogTrigger, which always wraps its children in a
 * PressResponder and expects the first of them to be the thing you press to open the modal.
 * Every modal in Kodama is controlled instead — it is rendered with `isOpen` and has no trigger
 * inside it — so nothing ever registered as pressable and react-aria said so, once per modal,
 * in the console: "A PressResponder was rendered without a pressable child." Dev only (the
 * warning is compiled out of the production build), but it buried everything else.
 *
 * react-aria's own answer for a modal without a trigger is to put the state on the overlay.
 * ModalBackdrop renders that overlay, and it takes `isOpen`/`onOpenChange` itself, builds its
 * own state from them and hands that state down — so the close button and dismissal keep
 * working exactly as before. This just moves the props one level down, which keeps the markup
 * at all fourteen call sites as it was.
 */
export function ModalRoot({ children, ...props }) {
  return Children.map(children, (child) =>
    isValidElement(child) ? cloneElement(child, props) : child
  );
}
