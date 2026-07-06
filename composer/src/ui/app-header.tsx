import { useProjectStore } from "@/stores/project";
import type { SimpleTab } from "@/stores/project";
import { Button } from "@/ui/button";
import { Tabs } from "@heroui/react";
import { IconHelp, IconMinus, IconRoute, IconSettings, IconSquare, IconX } from "@/ui/icons/fa";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface AppHeaderProps {
  onSettingsOpen: () => void;
  onHelpOpen: () => void;
  onTourStart: () => void;
}

const TABS: { id: SimpleTab; label: string }[] = [
  { id: "import", label: "Import" },
  { id: "edit", label: "Edit" },
  { id: "sync", label: "Sync" },
  { id: "timeline", label: "Timeline" },
  { id: "preview", label: "Preview" },
  { id: "export", label: "Export" },
];

// Native-titlebar replacement. The composer window runs without OS decorations
// (see window.rs), so we draw our own window controls here and call them over IPC.
// IPC for this remote-URL window is enabled via capabilities/composer.json.
const win = async () => (await import("@tauri-apps/api/window")).getCurrentWindow();

// Rendered in a portal directly on <body> (not inside the header) and marked
// data-react-aria-top-layer, so HeroUI/react-aria modals don't make it `inert` —
// the window controls stay clickable over a modal (Discord-style), while the rest of
// the header dims with the content. Fixed at the top-right, aligned with the header.
const WindowControls: React.FC<{ height: number }> = ({ height }) => {
  const minimize = () => win().then((w) => w.minimize());
  const toggleMaximize = () => win().then((w) => w.toggleMaximize());
  const close = () => win().then((w) => w.close());

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-react-aria-top-layer="true"
      style={{ top: 0, right: 8, height: height || undefined }}
      className="fixed z-[10000] flex items-center gap-0.5"
    >
      <button
        type="button"
        onClick={minimize}
        aria-label="Minimize"
        className="flex items-center justify-center size-7 rounded-md text-composer-text-secondary hover:bg-composer-button-hover"
      >
        <IconMinus className="size-4" />
      </button>
      <button
        type="button"
        onClick={toggleMaximize}
        aria-label="Maximize"
        className="flex items-center justify-center size-7 rounded-md text-composer-text-secondary hover:bg-composer-button-hover"
      >
        <IconSquare className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="flex items-center justify-center size-7 rounded-md text-composer-text-secondary hover:bg-[#e24b4a] hover:text-white"
      >
        <IconX className="size-4" />
      </button>
    </div>,
    document.body,
  );
};

// Unified top bar = titlebar + navigation: it is the window drag region, holds the logo,
// the segmented tab navigation (HeroUI ToggleButtonGroup), the app actions and — when
// running inside Tauri — the custom window controls. Replaces the old separate header,
// tab-bar AND native titlebar in a single row.
const AppHeader: React.FC<AppHeaderProps> = ({ onSettingsOpen, onHelpOpen, onTourStart }) => {
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);

  // Render window controls only inside the Tauri shell. Deferred to an effect so the
  // server-rendered (SSG) and initial client markup match — avoids a hydration mismatch.
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    setIsTauri(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
  }, []);

  // Measure the header height so the portaled window controls align with it vertically.
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header
      ref={headerRef}
      data-tauri-drag-region
      className={`flex items-center justify-between gap-4 pl-4 py-2.5 border-b select-none border-composer-border ${
        isTauri ? "pr-[96px]" : "pr-2"
      }`}
    >
      <h1 data-tauri-drag-region className="flex items-center gap-2 text-base font-semibold shrink-0">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-6" />
        Composer
      </h1>

      <nav data-tour="tab-bar" className="min-w-0">
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(String(key) as SimpleTab)}
        >
          <Tabs.List aria-label="Editor sections">
            {TABS.map((tab, i) => (
              <Tabs.Tab key={tab.id} id={tab.id} data-tour={`tab-${tab.id}`}>
                {i > 0 && <Tabs.Separator />}
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      </nav>

      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" onClick={onSettingsOpen} title="Settings">
          <IconSettings className="size-5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onTourStart} title="Product tour">
          <IconRoute className="size-5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onHelpOpen} title="Keyboard shortcuts (?)">
          <IconHelp className="size-5" />
        </Button>
        {isTauri && <div aria-hidden className="w-px h-5 bg-composer-border mx-1.5" />}
        {isTauri && <WindowControls height={headerHeight} />}
      </div>
    </header>
  );
};

export { AppHeader };
