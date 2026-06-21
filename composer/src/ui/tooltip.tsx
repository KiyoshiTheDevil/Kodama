import {
  FloatingArrow,
  FloatingPortal,
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import type { Placement } from "@floating-ui/react";
import { useRef, useState } from "react";

// -- Types --------------------------------------------------------------------

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: Placement;
  delay?: number;
}

// -- Constants ----------------------------------------------------------------

const SHOW_DELAY = 300;
const ARROW_SIZE = 4;

// -- Component ----------------------------------------------------------------

const Tooltip: React.FC<TooltipProps> = ({ content, children, placement = "top", delay = SHOW_DELAY }) => {
  const [isOpen, setIsOpen] = useState(false);
  const arrowRef = useRef(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(6), flip(), shift({ padding: 8 }), arrow({ element: arrowRef })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, { move: false, delay: { open: delay, close: 0 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return (
    <>
      <span ref={refs.setReference} className="inline-flex" {...getReferenceProps()}>
        {children}
      </span>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 w-max max-w-48 select-none px-2 py-1.5 text-xs text-center leading-snug rounded bg-composer-bg-dark text-composer-text shadow-lg"
          >
            {content}
            <FloatingArrow
              ref={arrowRef}
              context={context}
              width={ARROW_SIZE * 2}
              height={ARROW_SIZE}
              className="fill-composer-bg-dark"
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

// -- Exports ------------------------------------------------------------------

export { Tooltip };
