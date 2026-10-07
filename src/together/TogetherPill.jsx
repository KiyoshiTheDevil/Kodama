// ListenTogether in the player bar: a "together" button, and in a room a pill with who is in it.
// Its popover starts or joins a room, or, in one, is about inviting people; the room itself
// (people, queue, settings) lives in the queue panel's Room tab.
import { useState } from "react";
import { Button, PopoverRoot, PopoverContent, PopoverDialog, Spinner } from "@heroui/react";
import { useLang, useZoom } from "../context.jsx";
import { Users, Copy, Check, SignOut } from "../icons.jsx";
import { Tooltip } from "../ui/tooltip.jsx";
import { useTogether, startRoom, join, leave, inviteLink, parseRoomInput } from "./together.js";

// A colour per member, stable for the session (the id is the room's, not the person's).
export function memberColor(id = "") {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 74%)`;
}

export function MemberAvatar({ member, size = 20, ring = true }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-[var(--r-full)] shrink-0 font-semibold"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.5),
        background: memberColor(member.id), color: "#16181b",
        boxShadow: ring ? "0 0 0 2px var(--bg-player, var(--bg-elevated))" : undefined,
      }}
    >{(member.name || "?").trim().charAt(0).toUpperCase()}</span>
  );
}

export const roomName = (r, t) => {
  if (r.isHost) return t("togetherYourRoom");
  const host = r.members.find((m) => m.host);
  return host ? t("togetherRoomOf", { n: host.name }) : t("togetherTitle");
};

export function TogetherPill({ name }) {
  const t = useLang();
  const zoom = useZoom();
  const r = useTogether();
  const inRoom = r.status !== "idle" && r.status !== "closed";
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  const myName = (name || "").trim() || "Kodama";

  const start = async () => {
    setBusy(true); setErr(null);
    try { await startRoom(myName); } catch { setErr(t("togetherStartFailed")); }
    setBusy(false);
  };
  const parsed = parseRoomInput(code);
  const doJoin = () => { if (parsed) { setErr(null); join(parsed, myName); setCode(""); } };
  const copy = () => {
    navigator.clipboard.writeText(inviteLink(r.room)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };
  const openRoomTab = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("kodama:open-room"));
  };

  const shown = r.members.slice(0, 3);
  const trigger = inRoom ? (
    <Button variant="ghost" aria-label={t("togetherPillLabel", { c: r.members.length })}
      className="h-[28px] min-w-0 px-0 pl-1 pr-2.5 gap-1.5 rounded-[var(--r-full)] bg-[var(--fill-subtle)] hover:bg-hover text-[length:var(--t11)] font-semibold shrink-0"
      style={{ outline: r.status === "open" ? "1px solid var(--accent)" : "1px dashed var(--text-muted)", outlineOffset: -1 }}>
      <span className="inline-flex items-center">
        {shown.length > 0
          ? shown.map((m, i) => <span key={m.id} style={{ marginLeft: i ? -8 : 0 }}><MemberAvatar member={m} size={20} /></span>)
          : <Spinner size="sm" />}
      </span>
      {r.members.length}
    </Button>
  ) : (
    <Button variant="ghost" isIconOnly aria-label={t("togetherTitle")}
      className="text-muted hover:text-secondary shrink-0"
      style={{ borderRadius: "var(--r-full)", width: 36, height: 36, minWidth: 36, padding: 0 }}>
      <Users size={16} />
    </Button>
  );

  return (
    <PopoverRoot isOpen={open} onOpenChange={setOpen}>
      {inRoom ? trigger : <Tooltip text={t("togetherTitle")}>{trigger}</Tooltip>}
      <PopoverContent placement="top" offset={10} className="p-0 bg-transparent shadow-none">
        <PopoverDialog aria-label={t("togetherTitle")} className="outline-none p-0" style={{ zoom }}>
          <div className="w-[280px] p-3.5 flex flex-col gap-3 rounded-[var(--r-xl)] bg-[var(--bg-elevated)] shadow-[var(--elev-3,0_8px_24px_rgba(0,0,0,.35))] text-[length:var(--t12)]">
            {!inRoom ? (
              <>
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
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center">
                    {shown.map((m, i) => <span key={m.id} style={{ marginLeft: i ? -10 : 0 }}><MemberAvatar member={m} size={28} /></span>)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{roomName(r, t)}</div>
                    <div className="text-secondary text-[length:var(--t11)] truncate">
                      {r.status === "open"
                        ? `${t("togetherInRoom", { c: r.members.length })} · ${r.config.control === "everyone" ? t("togetherEveryoneAdds") : t("togetherHostDecides")}`
                        : t("togetherConnecting")}
                    </div>
                  </div>
                </div>
                <div className="text-[length:var(--t11)] text-muted font-semibold tracking-wide">{t("togetherInvite")}</div>
                <div className="flex items-center gap-1.5 rounded-[var(--r-full)] bg-[var(--fill-subtle)] p-1 pl-3">
                  <span className="flex-1 min-w-0 truncate font-mono text-[length:var(--t11)] text-secondary select-text">{inviteLink(r.room).replace(/^https:\/\//, "")}</span>
                  <Button size="sm" variant="primary" onPress={copy} className="rounded-[var(--r-full)] gap-1.5">
                    {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? t("togetherCopied") : t("togetherCopy")}
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" onPress={openRoomTab} className="rounded-[var(--r-full)] gap-1.5">
                    <Users size={12} />{t("togetherOpenRoom")}
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => { leave(); setOpen(false); }}
                    className="ml-auto rounded-[var(--r-full)] gap-1.5 text-[var(--status-danger)]">
                    <SignOut size={12} />{t("togetherLeave")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </PopoverDialog>
      </PopoverContent>
    </PopoverRoot>
  );
}
