import { DndContext } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render as baseRender, type RenderOptions, type RenderResult } from "vitest-browser-react";

interface ComposerRenderOptions extends RenderOptions {
  dndContext?: boolean;
  withRouter?: boolean | { initialEntries?: string[]; initialIndex?: number };
}

function buildWrapper(dndContext: boolean, withRouter: ComposerRenderOptions["withRouter"]) {
  return function ComposerWrapper({ children }: { children: ReactNode }) {
    // Fresh QueryClient per render so caches do not bleed between tests.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    let tree: ReactNode = (
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="always">{children}</MotionConfig>
      </QueryClientProvider>
    );
    if (dndContext) tree = <DndContext>{tree}</DndContext>;
    if (withRouter) {
      const routerOptions = typeof withRouter === "object" ? withRouter : {};
      tree = (
        <MemoryRouter
          initialEntries={routerOptions.initialEntries ?? ["/"]}
          initialIndex={routerOptions.initialIndex ?? 0}
        >
          {tree}
        </MemoryRouter>
      );
    }
    return <>{tree}</>;
  };
}

function render(ui: ReactElement, options: ComposerRenderOptions = {}): Promise<RenderResult> {
  const { dndContext = false, withRouter = false, ...rest } = options;
  return baseRender(ui, {
    ...rest,
    wrapper: buildWrapper(dndContext, withRouter),
  });
}

export { render };
