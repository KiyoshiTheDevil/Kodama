// The compact layout's tab bar (narrow windows, portrait monitors, high zoom): the sidebar's
// destinations at the bottom, as in the phone apps people know. Pinned and recent items and
// the library's own lists live in the library; listening together is the fourth tab.
import { Button } from "@heroui/react";
import { useLang } from "../context.jsx";
import { House, MagnifyingGlass, Books, Users } from "../icons.jsx";
import { MemberAvatar } from "../together/TogetherSidebar.jsx";
import { useTogether } from "../together/together.js";
import { haptic } from "../haptics.js";

// A capsule floating above the screen's edge, in the mini player's glass. Only the current
// tab carries its name, in an accent pill that grows into its place; the others are icons.
const TAB = "h-[44px] min-w-0 flex flex-row items-center justify-center gap-1.5 rounded-[var(--r-full)] "
  + "text-[length:var(--t13)] font-semibold px-0 transition-[flex-grow,background-color,color] duration-300";

export function CompactTabs({ view, onNavigate, vertical = false, width = 76, top = 0 }) {
  const t = useLang();
  const r = useTogether();
  // Listening together is a tab like the others (src/together/TogetherView.jsx); in a room it
  // shows the host's face instead of the icon.
  const inRoom = r.status !== "idle" && r.status !== "closed";
  const face = inRoom && (r.members.find((m) => m.host) || r.members[0]);
  const tabs = [
    { id: "home",    label: t("home"),    icon: <House size={18} /> },
    { id: "search",  label: t("search").replace(/[.…]+$/, ""), icon: <MagnifyingGlass size={18} /> },
    { id: "library", label: t("library"), icon: <Books size={18} /> },
    { id: "together", label: t("togetherTabShort"), icon: face ? <MemberAvatar member={face} size={20} ring="var(--accent)" /> : <Users size={18} /> },
  ];
  const tone = (on) => (on
    ? "bg-accent! text-[var(--accent-foreground)]!"
    : "bg-transparent! text-muted hover:text-primary");
  // Steam Deck: a rail down the left edge (App's DECK_RAIL), icons only, the current one on
  // the accent. Wider than the phone's capsule is high, for a thumb and a sofa's distance.
  if (vertical) return (
    <nav aria-label="Navigation" style={{
      position: "fixed", left: 0, top, bottom: 0, width, zIndex: 102,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 12,
    }}>
      {tabs.map((tab) => {
        const on = view === tab.id;
        return (
          <Button key={tab.id} variant="ghost" isIconOnly onPress={() => onNavigate(tab.id)}
            aria-current={on ? "page" : undefined} aria-label={tab.label}
            className={`w-[52px]! h-[52px]! rounded-[var(--r-full)]! transition-colors ${tone(on)}`}>
            {tab.icon}
          </Button>
        );
      })}
    </nav>
  );
  return (
    <nav aria-label="Navigation" style={{
      display: "flex", alignItems: "center", gap: 4, height: 54, padding: 4, margin: "2px 16px 10px",
      borderRadius: "var(--r-full)",
      background: "color-mix(in srgb, var(--bg-elevated) 70%, transparent)",
      backdropFilter: "blur(22px) saturate(1.5)", WebkitBackdropFilter: "blur(22px) saturate(1.5)",
    }}>
      {tabs.map((tab) => {
        const on = view === tab.id;
        return (
          <Button key={tab.id} variant="ghost" onPress={() => { if (!on) haptic("tick"); onNavigate(tab.id); }}
            aria-current={on ? "page" : undefined} aria-label={tab.label}
            className={`${TAB} ${tone(on)}`} style={{ flexGrow: on ? 1.8 : 1, flexBasis: 0 }}>
            {tab.icon}
            {on && <span className="truncate">{tab.label}</span>}
          </Button>
        );
      })}
    </nav>
  );
}
