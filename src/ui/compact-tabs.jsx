// The compact layout's tab bar (narrow windows, portrait monitors, high zoom): the sidebar's
// destinations at the bottom, as in the phone apps people know. Pinned and recent items and
// the library's own lists live in the library; listening together is the fourth tab.
import { Button } from "@heroui/react";
import { useLang } from "../context.jsx";
import { House, MagnifyingGlass, Books } from "../icons.jsx";
import { TogetherTab } from "../together/TogetherSidebar.jsx";
import { haptic } from "../haptics.js";

const TAB = "flex-1 h-full min-w-0 flex flex-col items-center justify-center gap-1 rounded-none bg-transparent! "
  + "text-[length:var(--t11)] font-medium px-0";

export function CompactTabs({ view, onNavigate, profile }) {
  const t = useLang();
  const tabs = [
    { id: "home",    label: t("home"),    icon: <House size={17} /> },
    { id: "search",  label: t("search").replace(/[.…]+$/, ""), icon: <MagnifyingGlass size={17} /> },
    { id: "library", label: t("library"), icon: <Books size={17} /> },
  ];
  const tone = (on) => (on ? "text-accent" : "text-muted hover:text-primary");
  return (
    <nav aria-label="Navigation" className="flex items-stretch" style={{ height: 56, borderTop: "1px solid var(--border)" }}>
      {tabs.map((tab) => (
        <Button key={tab.id} variant="ghost" onPress={() => { if (view !== tab.id) haptic("tick"); onNavigate(tab.id); }}
          aria-current={view === tab.id ? "page" : undefined}
          className={`${TAB} ${tone(view === tab.id)}`}>
          {tab.icon}
          <span className="truncate max-w-full">{tab.label}</span>
        </Button>
      ))}
      <TogetherTab name={profile?.displayName} avatar={profile?.avatar} label={t("togetherTabShort")}
        className={`${TAB} ${tone(false)}`} />
    </nav>
  );
}
