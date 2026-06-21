import { useModalStackStore } from "@/stores/modal-stack";
import { cn } from "@/utils/cn";
import {
  ModalBackdrop,
  ModalBody,
  ModalCloseTrigger,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  ModalRoot,
} from "@heroui/react";
import { useEffect } from "react";

// -- Types --------------------------------------------------------------------

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  // Kept for API compatibility; HeroUI/react-aria manages focus itself.
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

// HeroUI sizes the dialog with an unlayered `@apply max-w-*` rule that beats Tailwind's
// layered max-w-* utilities, and Tailwind's JIT only emits classes it finds in source — so
// neither a plain nor a runtime-built `max-w-…!` className from a caller can win. We instead
// resolve the caller's max-w-* to a concrete width and apply it as an inline style, which
// outranks any class rule. Height/flex/etc. in `className` don't clash, so they pass through.
const TW_MAX_W: Record<string, string> = {
  xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem",
  "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem",
};

function dialogMaxWidth(className?: string): string | undefined {
  if (!className) return undefined;
  const arbitrary = className.match(/max-w-\[([^\]]+)\]/);
  if (arbitrary) return arbitrary[1];
  const named = className.match(/(?:^|\s)max-w-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)(?:\s|$)/);
  return named ? TW_MAX_W[named[1]] : undefined;
}

// -- Component ----------------------------------------------------------------

// Thin wrapper over HeroUI's Modal that preserves the existing simple Modal API
// (isOpen / onClose / title / className / bodyClassName) so every modal in the app gets
// the HeroUI look and behaviour (focus trap, escape, backdrop, scroll lock) for free.
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className, bodyClassName }) => {
  // Keep the app's modal stack in sync (used for nested-modal / shortcut bookkeeping).
  useEffect(() => {
    if (!isOpen) return;
    const { push, pop } = useModalStackStore.getState();
    push();
    return () => pop();
  }, [isOpen]);

  const maxWidth = dialogMaxWidth(className);

  return (
    <ModalRoot isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalBackdrop>
        <ModalContainer placement="center">
          <ModalDialog className={cn("mx-4", className)} style={maxWidth ? { maxWidth } : undefined}>
            {title && (
              <ModalHeader>
                <ModalHeading>{title}</ModalHeading>
                <ModalCloseTrigger />
              </ModalHeader>
            )}
            <ModalBody className={bodyClassName}>{children}</ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
};

// -- Exports ------------------------------------------------------------------

export { Modal };
