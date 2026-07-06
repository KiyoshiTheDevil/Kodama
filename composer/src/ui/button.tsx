import { Button as HeroButton } from "@heroui/react";
import { cn } from "@/utils/cn";

// -- Types --------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  hasIcon?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

const HERO_SIZE: Record<ButtonSize, "sm" | "md"> = { sm: "sm", md: "md", icon: "sm" };

// -- Component ----------------------------------------------------------------

// Thin wrapper around HeroUI's Button that preserves this project's original API
// ({ variant, size, hasIcon, onClick, disabled, … }) so every call site works
// unchanged. HeroUI follows the composer's theme bridge, so the look matches Kodama.
// `onClick` is forwarded natively (react-aria-components ≥1.5 fires a real click event);
// `disabled` maps to HeroUI's `isDisabled`.
const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  hasIcon: _hasIcon,
  className,
  children,
  ref,
  disabled,
  ...props
}) => {
  void _hasIcon;
  return (
    <HeroButton
      ref={ref}
      variant={variant}
      size={HERO_SIZE[size]}
      isIconOnly={size === "icon"}
      isDisabled={disabled}
      className={cn(className)}
      {...(props as React.ComponentProps<typeof HeroButton>)}
    >
      {children}
    </HeroButton>
  );
};

// -- Exports ------------------------------------------------------------------

export { Button };
