// ListenTogether in the sidebar, above the profile. Outside a room: a quiet "Listen together"
// entry whose popover starts a room or joins one. In a room: a card tinted from the accent
// (which follows the cover when the dynamic accent is on), with the members, an invite button,
// the way to the Room tab and leaving. The room itself (people, queue, settings) lives in the
// queue panel's Room tab.
import { useState, useEffect } from "react";
import { Button, PopoverRoot, PopoverContent, PopoverDialog, Spinner } from "@heroui/react";
import { thumb, useLang, useZoom } from "../context.jsx";
import { Users, Copy, Check, SignOut, Queue } from "../icons.jsx";
import { Tooltip } from "../ui/tooltip.jsx";
import { useTogether, startRoom, join, leave, inviteLink, parseRoomInput, setIdentity } from "./together.js";

// A colour per member, stable for the session (the id is the room's, not the person's).
export function memberColor(id = "") {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 74%)`;
}

export function MemberAvatar({ member, size = 20, ring = "var(--bg-surface)" }) {
  if (member.avatar) {
    return (
      <img src={thumb(member.avatar)} alt="" aria-hidden="true" draggable={false}
        className="rounded-[var(--r-full)] shrink-0 object-cover"
        style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-[var(--r-full)] shrink-0 font-semibold"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.5),
        background: memberColor(member.id), color: "#16181b",
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >{(member.name || "?").trim().charAt(0).toUpperCase()}</span>
  );
}

export const roomName = (r, t) => {
  if (r.config?.name) return r.config.name;
  if (r.isHost) return t("togetherYourRoom");
  const host = r.members.find((m) => m.host);
  return host ? t("togetherRoomOf", { n: host.name }) : t("togetherTitle");
};

const openRoomTab = () => window.dispatchEvent(new CustomEvent("kodama:open-room"));

// The card's colours: mixed from the accent into the sidebar's own surface, so they work in a
// dark and a light theme alike.
const TINT = {
  card: "color-mix(in srgb, var(--accent) 24%, var(--bg-surface))",
  soft: "color-mix(in srgb, var(--accent) 40%, var(--bg-surface))",
  softHover: "color-mix(in srgb, var(--accent) 52%, var(--bg-surface))",
  sub: "color-mix(in srgb, var(--accent) 55%, var(--text-primary))",
};

// Start a room, or join one by code or link: the popover outside a room.
function JoinPopoverBody({ name, onDone }) {
  const t = useLang();
  const r = useTogether();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const parsed = parseRoomInput(code);
  const start = async () => {
    setBusy(true); setErr(null);
    try { await startRoom(name); onDone(); } catch { setErr(t("togetherStartFailed")); }
    setBusy(false);
  };
  const doJoin = () => { if (parsed) { setErr(null); join(parsed, name); setCode(""); onDone(); } };
  return (
    <div className="w-[280px] p-3.5 flex flex-col gap-3 rounded-[var(--r-xl)] bg-[var(--bg-elevated)] shadow-[var(--elev-3,0_8px_24px_rgba(0,0,0,.35))] text-[length:var(--t12)]">
      <div>
        <div className="font-semibold text-[length:var(--t13)]">{t("togetherTitle")}</div>
        <div className="text-secondary mt-0.5">{t("togetherDesc")}</div>
      </div>
      <Button variant="primary" isDisabled={busy} onPress={start} className="w-full rounded-[var(--r-full)]">
        {busy ? <Spinner size="sm" /> : t("togetherStart")}
      </Button>
      <div className="text-[length:var(--t11)] text-muted font-semibold tracking-wide">{t("togetherJoinLabel")}</div>
      <form className="flex items-center gap-1.5 rounded-[var(--r-full)] bg-[var(--fill-subtle)] p-1 pl-3"
        onSubmit={(e) => { e.preventDefault(); doJoin(); }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("togetherJoinPlaceholder")}
          aria-label={t("togetherJoinPlaceholder")} spellCheck={false}
          className="flex-1 min-w-0 bg-transparent outline-none border-0 text-primary font-mono text-[length:var(--t12)]" />
        <Button type="submit" size="sm" variant="secondary" isDisabled={!parsed} className="rounded-[var(--r-full)]">{t("togetherJoin")}</Button>
      </form>
      {(err || (r.status === "closed" && r.error === "unreachable")) && (
        <div className="text-[length:var(--t11)] text-[var(--status-danger)]">{err || t("togetherUnreachable")}</div>
      )}
    </div>
  );
}

function JoinPopover({ name, children }) {
  const t = useLang();
  const zoom = useZoom();
  const [open, setOpen] = useState(false);
  return (
    <PopoverRoot isOpen={open} onOpenChange={setOpen}>
      {children}
      <PopoverContent placement="right bottom" offset={10} className="p-0 bg-transparent shadow-none">
        <PopoverDialog aria-label={t("togetherTitle")} className="outline-none p-0" style={{ zoom }}>
          <JoinPopoverBody name={name} onDone={() => setOpen(false)} />
        </PopoverDialog>
      </PopoverContent>
    </PopoverRoot>
  );
}

export function TogetherSidebar({ name, avatar, collapsed }) {
  const t = useLang();
  const r = useTogether();
  useEffect(() => { setIdentity(name, avatar); }, [name, avatar]);
  const [copied, setCopied] = useState(false);
  const inRoom = r.status !== "idle" && r.status !== "closed";
  const myName = (name || "").trim() || "Kodama";
  const copy = () => {
    navigator.clipboard.writeText(inviteLink(r.room)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };
  const shown = r.members.slice(0, 3);
  const sub = r.status === "open" ? t("togetherInRoom", { c: r.members.length }) : t("togetherConnecting");

  // ── Collapsed sidebar: one avatar with a ring and the count, or the entry's icon ──
  if (collapsed) {
    if (!inRoom) {
      return (
        <JoinPopover name={myName}>
          <Tooltip text={t("togetherTitle")}>
            <Button variant="ghost" isIconOnly aria-label={t("togetherTitle")}
              className="w-9 h-9 min-w-9 rounded-[var(--r-full)] text-secondary hover:text-primary">
              <Users size={16} />
            </Button>
          </Tooltip>
        </JoinPopover>
      );
    }
    const first = r.members.find((m) => m.host) || r.members[0];
    return (
      <Tooltip text={`${roomName(r, t)} · ${sub}`}>
        <button type="button" onClick={openRoomTab} aria-label={`${roomName(r, t)}, ${sub}`}
          className="relative w-9 h-9 border-0 bg-transparent cursor-default inline-flex items-center justify-center">
          {first ? <MemberAvatar member={first} size={26} ring="var(--accent)" /> : <Spinner size="sm" />}
          <span className="absolute -bottom-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-[var(--r-full)] text-[10px] font-bold leading-[15px] text-center"
            style={{ background: TINT.card, color: "var(--text-primary)" }}>{r.members.length}</span>
        </button>
      </Tooltip>
    );
  }

  // ── Outside a room: a quiet entry, like the navigation's ──
  if (!inRoom) {
    return (
      <JoinPopover name={myName}>
        <Button variant="ghost" fullWidth
          className="justify-start gap-2.5 px-3 rounded-xl text-[length:var(--t13)] text-secondary mb-1">
          <Users size={16} />
          {t("togetherTitle")}
        </Button>
      </JoinPopover>
    );
  }

  // ── In a room: the card ──
  const iconBtn = "h-[34px] min-w-[34px] px-0 rounded-[var(--r-full)] inline-flex items-center justify-center border-0 cursor-default transition-[background-color] duration-150";
  return (
    <div className="mb-1.5 p-3 flex flex-col gap-2.5 rounded-[var(--r-xl)]" style={{ background: TINT.card }}>
      <button type="button" onClick={openRoomTab}
        className="flex flex-col gap-1 border-0 bg-transparent p-0 text-left cursor-default min-w-0">
        <span className="text-[length:var(--t12)] font-semibold" style={{ color: TINT.sub }}>{t("togetherListening")}</span>
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center shrink-0">
            {shown.length > 0
              ? shown.map((m, i) => <span key={m.id} style={{ marginLeft: i ? -8 : 0 }}><MemberAvatar member={m} size={28} ring={TINT.card} /></span>)
              : <Spinner size="sm" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[length:var(--t13)] font-semibold text-primary">{roomName(r, t)}</span>
            <span className="block truncate text-[length:var(--t12)]" style={{ color: TINT.sub }}>{sub}</span>
          </span>
        </span>
      </button>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={copy}
          className={`${iconBtn} flex-1 gap-2 text-[length:var(--t13)] font-semibold bg-accent text-[var(--accent-foreground)] hover:brightness-110`}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t("togetherCopied") : t("togetherInvite")}
        </button>
        <Tooltip text={t("togetherOpenRoom")}>
          <button type="button" onClick={openRoomTab} aria-label={t("togetherOpenRoom")}
            className={iconBtn} style={{ background: TINT.soft, color: "var(--text-primary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = TINT.softHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = TINT.soft; }}>
            <Queue size={15} />
          </button>
        </Tooltip>
        <Tooltip text={t("togetherLeave")}>
          <button type="button" onClick={leave} aria-label={t("togetherLeave")}
            className={iconBtn} style={{ background: TINT.soft, color: "var(--status-danger)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = TINT.softHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = TINT.soft; }}>
            <SignOut size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
