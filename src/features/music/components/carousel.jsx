import { ScrollShadowRoot } from "@heroui/react";

export function Carousel({ children, style, insetX = 0 }) {
  return (
    <ScrollShadowRoot
      orientation="horizontal"
      hideScrollBar={false}
      size={28}
      className="carousel"
      style={{
        display: "flex",
        overflowX: "auto",
        marginLeft: insetX,
        marginRight: insetX,
        ...style,
      }}
    >
      {children}
    </ScrollShadowRoot>
  );
}
