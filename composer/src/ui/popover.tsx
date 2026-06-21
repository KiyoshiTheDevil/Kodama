import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import type { Placement } from "@floating-ui/react";
import { type ReactElement, type ReactNode, cloneElement, useState } from "react";

// -- Types --------------------------------------------------------------------

interface PopoverProps {
  trigger: ReactElement;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  offsetPx?: number;
}

// -- Component ----------------------------------------------------------------

const Popover: React.FC<PopoverProps> = ({ trigger, children, placement = "bottom", offsetPx = 8 }) => {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(offsetPx), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <>
      {cloneElement(trigger, {
        ref: refs.setReference,
        ...getReferenceProps(),
      } as React.HTMLAttributes<HTMLElement> & { ref: typeof refs.setReference })}

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className="z-100 border select-none shadow-2xl rounded-xl bg-composer-bg border-composer-border"
            >
              {typeof children === "function" ? children(() => setIsOpen(false)) : children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
};

// -- Exports ------------------------------------------------------------------

export { Popover };
