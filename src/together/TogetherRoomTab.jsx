// ListenTogether in the queue panel. In a room the Queue tab becomes the Room tab: a compact
// header (room name, the people as avatars, a gear for the settings) over the queue, which the
// queue panel draws (the host's own, or for a listener the room's). People and settings are a
// click away, in popovers: they are needed now and then, the queue all the time.
import { useState, useRef } from "react";
import { Button, PopoverRoot, PopoverContent, PopoverDialog } from "@heroui/react";
import { thumb, useLang, useZoom } from "../context.jsx";
import { Crown, X, Gear, DotsThreeVertical, CaretDown, CaretUp, Check } from "../icons.jsx";
import { Tooltip } from "../ui/tooltip.jsx";
import { Toggle } from "../ui/settings-controls.jsx";
import { useTogether, useTogetherValue, hostConfig, setShowAvatar, setShowDiscord, setRole, kick, admit, deny, vote, acceptSuggestion, dismissSuggestion } from "./together.js";
import { Dropdown, DropdownTrigger, DropdownPopover, DropdownItem } from "@heroui/react";
import { DropdownMenu } from "../ui/zoomed-heroui.jsx";
import { MemberAvatar, roomName } from "./TogetherSidebar.jsx";

const LIMITS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 0];
// Votes after which a suggestion goes into the queue by itself; 0 is never.
const AUTO_ACCEPT = [0, 2, 3, 4, 5, 7, 10, 15, 20];
const ROLE_HINT = { cohost: "togetherHintCohost", member: "togetherHintMember", listener: "togetherHintListener" };
const ROLE_ACTION = { cohost: "togetherMakeCohost", member: "togetherMakeMember", listener: "togetherMakeListener" };
const GROUP_LABEL = { host: "togetherGroupHost", cohost: "togetherGroupCohosts", member: "togetherGroupMembers", listener: "togetherGroupListeners" };

const Heading = ({ children }) => (
  <div className="text-[length:var(--t11)] text-muted font-semibold tracking-wide mb-1.5">{children}</div>
);

// The room's name, saved when the field is left or Enter is pressed (not on every key: each save
// is a message to everyone in the room).
function RoomNameField({ current, placeholder, label }) {
  const [text, setText] = useState(current);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const value = editing ? text : current;
  const save = () => {
    setEditing(false);
    if (cancelled.current) { cancelled.current = false; return; }
    const name = text.replace(/\s+/g, " ").trim().slice(0, 40);
    if (name !== current) hostConfig({ name });
  };
  return (
    <label className="flex flex-col gap-1.5">
      <span>{label}</span>
      <input value={value} maxLength={40} placeholder={placeholder} spellCheck={false}
        onFocus={() => { setText(current); setEditing(true); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); } }}
        className="h-[34px] px-3.5 rounded-[var(--r-full)] bg-[var(--fill-subtle)] text-primary outline-none border-0 text-[length:var(--t12)] focus:shadow-[0_0_0_2px_var(--accent)]" />
    </label>
  );
}

function SwitchRow({ id, label, desc, value, onChange }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <div id={id}>{label}</div>
        {desc && <div className="text-secondary text-[length:var(--t11)] mt-0.5">{desc}</div>}
      </div>
      <Toggle value={!!value} onChange={onChange} aria-labelledby={id} />
    </div>
  );
}

// A popover in the panel, zoomed on its inner dialog (the positioned wrapper must not carry the
// app's zoom, see src/ui/zoomed-heroui.jsx).
function PanelPopover({ trigger, label, children }) {
  const zoom = useZoom();
  return (
    <PopoverRoot>
      {trigger}
      <PopoverContent placement="bottom end" offset={8} className="p-0 bg-transparent shadow-none">
        <PopoverDialog aria-label={label} className="outline-none p-0" style={{ zoom }}>
          <div className="w-[300px] max-h-[60vh] overflow-y-auto scrollable p-4 flex flex-col gap-4 rounded-[var(--r-xl)] bg-[var(--bg-elevated)] shadow-[var(--elev-3,0_8px_24px_rgba(0,0,0,.35))] text-[length:var(--t12)]">
            {children}
          </div>
        </PopoverDialog>
      </PopoverContent>
    </PopoverRoot>
  );
}

function PeopleList({ r, t }) {
  return (
    <section>
      <Heading>{t("togetherPeople")} · {r.members.length}</Heading>
      <div className="flex flex-col gap-1">
        {r.members.map((m) => (
          <div key={m.id} className="flex items-center gap-2.5 py-1 min-w-0">
            <MemberAvatar member={m} size={26} ring={false} />
            <span className="truncate">{m.name}</span>
            {m.host && <Crown size={11} className="text-muted shrink-0" aria-label={t("togetherHost")} />}
            {r.you?.id === m.id && <span className="text-muted shrink-0">({t("togetherYou")})</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsBody({ r, t }) {
  const host = r.members.find((m) => m.host);
  return (
    <>
      {r.isHost ? (
        <section className="flex flex-col gap-3">
          <Heading>{t("togetherSettings")}</Heading>
          <RoomNameField current={r.config.name || ""} placeholder={t("togetherYourRoom")} label={t("togetherRoomName")} />
          <div>
            <div className="mb-1.5">{t("togetherNewRole")}</div>
            <div className="flex gap-1.5">
              {[["listener", t("togetherRoleListener")], ["member", t("togetherRoleMember")]].map(([id, label]) => (
                <button key={id} type="button" onClick={() => hostConfig({ newRole: id })}
                  className={`flex-1 h-[30px] rounded-[var(--r-full)] border-0 cursor-default text-[length:var(--t12)] font-semibold transition-[background-color,color] duration-150 ${
                    r.config.newRole === id ? "bg-accent text-[var(--accent-foreground)]" : "bg-[var(--fill-subtle)] text-secondary hover:text-primary hover:bg-hover"
                  }`}>{label}</button>
              ))}
            </div>
            <div className="text-secondary text-[length:var(--t11)] mt-1">{t("togetherNewRoleDesc")}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex-1">
              <span className="block">{t("togetherLimit")}</span>
              <span className="block text-secondary text-[length:var(--t11)] mt-0.5">{t("togetherInRoomOf", { c: r.members.length, m: r.config.limit || "∞" })}</span>
            </span>
            {/* The app's own dropdown: a native <select> opens Windows' list, white on white in a dark theme. */}
            <Dropdown>
              <DropdownTrigger aria-label={t("togetherLimit")}
                className="h-[30px] px-3 gap-1.5 rounded-[var(--r-full)] bg-[var(--fill-subtle)] hover:bg-hover text-primary inline-flex items-center text-[length:var(--t12)] font-semibold shrink-0">
                {r.config.limit === 0 ? t("togetherNoLimit") : r.config.limit}
                <CaretDown size={11} className="text-muted" />
              </DropdownTrigger>
              <DropdownPopover placement="bottom end" className="[--dd-min-w:8rem] overflow-y-auto scrollable" style={{ maxHeight: 280 }}>
                <DropdownMenu aria-label={t("togetherLimit")} selectionMode="single" disallowEmptySelection
                  selectedKeys={[String(r.config.limit)]}
                  onSelectionChange={(keys) => { const v = [...keys][0]; if (v != null) hostConfig({ limit: Number(v) }); }}>
                  {LIMITS.map((n) => (
                    <DropdownItem key={String(n)} id={String(n)} textValue={n === 0 ? t("togetherNoLimit") : String(n)}>
                      {n === 0 ? t("togetherNoLimit") : n}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </DropdownPopover>
            </Dropdown>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex-1">
              <span className="block">{t("togetherAutoAccept")}</span>
              <span className="block text-secondary text-[length:var(--t11)] mt-0.5">{t("togetherAutoAcceptDesc")}</span>
            </span>
            <Dropdown>
              <DropdownTrigger aria-label={t("togetherAutoAccept")}
                className="h-[30px] px-3 gap-1.5 rounded-[var(--r-full)] bg-[var(--fill-subtle)] hover:bg-hover text-primary inline-flex items-center text-[length:var(--t12)] font-semibold shrink-0">
                {r.config.autoAccept ? r.config.autoAccept : t("togetherAutoAcceptOff")}
                <CaretDown size={11} className="text-muted" />
              </DropdownTrigger>
              <DropdownPopover placement="bottom end" className="[--dd-min-w:8rem] overflow-y-auto scrollable" style={{ maxHeight: 280 }}>
                <DropdownMenu aria-label={t("togetherAutoAccept")} selectionMode="single" disallowEmptySelection
                  selectedKeys={[String(r.config.autoAccept || 0)]}
                  onSelectionChange={(keys) => { const v = [...keys][0]; if (v != null) hostConfig({ autoAccept: Number(v) }); }}>
                  {AUTO_ACCEPT.map((n) => (
                    <DropdownItem key={String(n)} id={String(n)} textValue={n === 0 ? t("togetherAutoAcceptOff") : String(n)}>
                      {n === 0 ? t("togetherAutoAcceptOff") : n}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </DropdownPopover>
            </Dropdown>
          </div>
          <SwitchRow id="together-approval" label={t("togetherApproval")} desc={t("togetherApprovalDesc")}
            value={r.config.approval} onChange={(v) => hostConfig({ approval: v })} />
          <SwitchRow id="together-wait-all" label={t("togetherWaitAll")} desc={t("togetherWaitAllDesc")}
            value={r.config.waitAll} onChange={(v) => hostConfig({ waitAll: v })} />
        </section>
      ) : (
        <div className="text-secondary">
          {t(ROLE_HINT[r.you?.role] || "togetherHintListener", { n: host?.name || "Host" })}
        </div>
      )}
      <section className="flex flex-col gap-3">
        <Heading>{t("togetherYouHere")}</Heading>
        <SwitchRow id="together-show-avatar" label={t("togetherShowAvatar")} desc={t("togetherShowAvatarDesc")}
          value={r.showAvatar} onChange={setShowAvatar} />
        <SwitchRow id="together-show-discord" label={t("togetherShowDiscord")} desc={t("togetherShowDiscordDesc")}
          value={r.showDiscord} onChange={setShowDiscord} />
      </section>
    </>
  );
}

/** The Room tab's header: name, the people (opens the list), the gear (opens the settings). */
export function TogetherRoomHeader() {
  const t = useLang();
  const r = useTogether();
  const shown = r.members.slice(0, 4);
  return (
    <div className="mx-3 mb-2 p-3 flex items-center gap-3 rounded-[var(--r-xl)] bg-[var(--fill-subtle)] shrink-0">
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[length:var(--t13)] truncate">{roomName(r, t)}</div>
        <PanelPopover label={t("togetherPeople")} trigger={
          <Button variant="ghost" aria-label={`${t("togetherPeople")} · ${r.members.length}`}
            className="h-auto min-w-0 p-0 mt-1.5 gap-2 bg-transparent hover:bg-transparent justify-start text-[length:var(--t11)] text-secondary hover:text-primary">
            <span className="inline-flex items-center">
              {shown.map((m, i) => <span key={m.id} style={{ marginLeft: i ? -8 : 0 }}><MemberAvatar member={m} size={22} ring="var(--bg-elevated)" /></span>)}
            </span>
            {t("togetherInRoom", { c: r.members.length })}
          </Button>
        }>
          <PeopleList r={r} t={t} />
        </PanelPopover>
      </div>
      <PanelPopover label={t("togetherSettings")} trigger={
        <Button variant="ghost" isIconOnly aria-label={t("togetherSettings")}
          className="w-9 h-9 min-w-9 rounded-[var(--r-full)] text-secondary hover:text-primary shrink-0">
          <Gear size={16} />
        </Button>
      }>
        <SettingsBody r={r} t={t} />
      </PanelPopover>
    </div>
  );
}

// "· [face] Mary" after the artist: who put a song in the room's queue. The name is never cut
// before the artist is; the artist gives way first.
function AddedByLabel({ adder, t }) {
  return (
    <span className="inline-flex items-center gap-1 shrink-0 max-w-[55%] min-w-0" title={t("togetherAddedBy", { n: adder.name })}>
      <span aria-hidden="true">·</span>
      <MemberAvatar member={adder} size={13} ring={false} />
      <span className="truncate text-primary">{adder.name}</span>
    </span>
  );
}

/** Who added a song in the host's own queue (for the queue panel's rows). */
export function AddedBy({ addedBy }) {
  const t = useLang();
  // The members only: a row per queued song must not re-render with every sync reading.
  const members = useTogetherValue((x) => x.members);
  if (!addedBy?.id) return null;
  const adder = members.find((m) => m.id === addedBy.id) || addedBy;
  return <AddedByLabel adder={adder} t={t} />;
}

// One person in the People tab, with the menu the viewer's role allows: the host gives roles and
// removes anyone; a co-host removes anyone but the host.
function PersonRow({ m, r, t }) {
  const isMe = r.you?.id === m.id;
  const canRole = r.isHost && !m.host;
  const canKick = (r.isHost || r.you?.role === "cohost") && !m.host && !isMe;
  return (
    <div className="group flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--r-md)] min-w-0 hover:bg-[var(--fill-subtle)]">
      <MemberAvatar member={m} size={28} ring={false} />
      <span className="truncate min-w-0">{m.name}</span>
      {m.host && <Crown size={11} className="text-muted shrink-0" aria-label={t("togetherHost")} />}
      {isMe && <span className="text-muted shrink-0">({t("togetherYou")})</span>}
      {(canRole || canKick) && (
        <Dropdown>
          <DropdownTrigger aria-label={t("togetherPersonMenu", { n: m.name })}
            className="ml-auto w-7 h-7 shrink-0 rounded-[var(--r-full)] inline-flex items-center justify-center text-muted hover:text-primary hover:bg-hover opacity-0 group-hover:opacity-100 data-[focus-visible]:opacity-100 data-[pressed]:opacity-100">
            <DotsThreeVertical size={15} weight="bold" />
          </DropdownTrigger>
          <DropdownPopover placement="bottom end" className="[--dd-min-w:12rem]">
            <DropdownMenu aria-label={t("togetherPersonMenu", { n: m.name })}
              onAction={(key) => { if (key === "kick") kick(m.id); else setRole(m.id, key); }}>
              {canRole && ["cohost", "member", "listener"].filter((x) => x !== m.role).map((role) => (
                <DropdownItem key={role} id={role} textValue={t(ROLE_ACTION[role])}>{t(ROLE_ACTION[role])}</DropdownItem>
              ))}
              {canKick && <DropdownItem key="kick" id="kick" textValue={t("togetherKick")} className="text-[var(--status-danger)]">{t("togetherKick")}</DropdownItem>}
            </DropdownMenu>
          </DropdownPopover>
        </Dropdown>
      )}
    </div>
  );
}

/** The People tab: who is waiting to be let in (for host and co-hosts), then everyone by role. */
export function TogetherPeopleTab() {
  const t = useLang();
  const r = useTogether();
  const admin = r.isHost || r.you?.role === "cohost";
  const groups = ["host", "cohost", "member", "listener"].map((role) => ({
    role, people: r.members.filter((m) => m.role === role).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)),
  })).filter((g) => g.people.length);
  return (
    <div className="scrollable flex-1 overflow-y-auto px-2 pt-1 pb-4 flex flex-col gap-3 text-[length:var(--t12)]">
      {admin && r.waiting.length > 0 && (
        <section className="mx-1 p-2.5 rounded-[var(--r-xl)] bg-[var(--fill-subtle)]">
          <div className="px-1"><Heading>{t("togetherWaiting")} · {r.waiting.length}</Heading></div>
          {r.waiting.map((w) => (
            <div key={w.id} className="flex items-center gap-2.5 px-1 py-1 min-w-0">
              <MemberAvatar member={w} size={26} ring={false} />
              <span className="truncate flex-1">{w.name}</span>
              <Button size="sm" variant="primary" onPress={() => admit(w.id)} className="rounded-[var(--r-full)]">{t("togetherLetIn")}</Button>
              <Button size="sm" variant="ghost" isIconOnly onPress={() => deny(w.id)} aria-label={t("togetherTurnAway", { n: w.name })} className="rounded-[var(--r-full)] text-muted hover:text-[var(--status-danger)]">
                <X size={13} />
              </Button>
            </div>
          ))}
        </section>
      )}
      {groups.map((g) => (
        <section key={g.role}>
          <div className="px-2"><Heading>{t(GROUP_LABEL[g.role])} · {g.people.length}</Heading></div>
          {g.people.map((m) => <PersonRow key={m.id} m={m} r={r} t={t} />)}
        </section>
      ))}
    </div>
  );
}

// One suggestion in the Room tab, row for row the size of a queue row (the list is virtualised).
// Left the vote: a pill with the count, filled once you voted. Right who stands behind it: the
// one who suggested it first, marked with the accent, then who voted (names on hover). Then what
// the viewer may do: host and co-hosts take it into the queue or dismiss it, and whoever
// suggested it may take it back.
const STACK = 3;
export function SuggestionRow({ sg }) {
  const t = useLang();
  const members = useTogetherValue((x) => x.members);
  const youId = useTogetherValue((x) => x.you?.id || "");
  const admin = useTogetherValue((x) => x.isHost || x.you?.role === "cohost");
  const voted = sg.votes.includes(youId);
  const own = sg.by.id === youId;
  const person = (id) => members.find((m) => m.id === id) || (id === sg.by.id ? sg.by : null);
  const voters = sg.votes.filter((id) => id !== sg.by.id).map(person).filter(Boolean);
  const faces = [person(sg.by.id) || sg.by, ...voters].slice(0, STACK);
  const extra = sg.votes.length - faces.length;
  const who = [t("togetherSuggestedBy", { n: sg.by.name }), ...voters.map((v) => v.name)].join(" · ");
  const btn = "w-[26px] h-[26px] shrink-0 rounded-[var(--r-full)] border-0 bg-transparent cursor-default inline-flex items-center justify-center transition-[background-color,color,transform] duration-150 hover:bg-hover active:scale-[0.9]";
  return (
    <div style={{ height: 50 }} className="group/srow flex items-center gap-2 pl-1.5 pr-2 rounded-[var(--r-md)] select-none hover:bg-[var(--fill-subtle)]">
      <button type="button" onClick={() => vote(sg.id, !voted)} aria-pressed={voted}
        aria-label={t(voted ? "togetherUnvote" : "togetherVote", { s: sg.track.title })}
        className={`w-[26px] h-[36px] shrink-0 rounded-[var(--r-full)] border-0 cursor-default inline-flex flex-col items-center justify-center gap-px text-[length:var(--t11)] font-semibold leading-none transition-[background-color,color,transform] duration-150 active:scale-[0.9] ${
          voted ? "bg-accent text-[var(--accent-foreground)]" : "bg-[var(--fill-subtle)] text-secondary hover:text-primary hover:bg-hover"}`}>
        <CaretUp size={11} weight="bold" />{sg.votes.length}
      </button>
      <div className="w-9 h-9 shrink-0 overflow-hidden rounded-[var(--r-sm)] bg-surface-1">
        {sg.track.thumbnail
          ? <img src={thumb(sg.track.thumbnail)} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-[image:var(--placeholder-gradient)]" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-[length:var(--t12)] font-medium text-primary">{sg.track.title}</div>
        <div className="truncate text-[length:var(--t11)] text-secondary">{sg.track.artists}</div>
      </div>
      <Tooltip text={who}>
        <span className="inline-flex items-center shrink-0" aria-label={who}>
          {faces.map((m, i) => (
            <span key={m.id || i} style={{ marginLeft: i ? -6 : 0, zIndex: STACK - i }} className="relative inline-flex">
              <MemberAvatar member={m} size={18} ring={i === 0 ? "var(--accent)" : "var(--bg-elevated)"} />
            </span>
          ))}
          {extra > 0 && <span className="ml-1 text-[length:var(--t11)] text-muted">+{extra}</span>}
        </span>
      </Tooltip>
      {admin ? (<>
        <button type="button" onClick={() => acceptSuggestion(sg.id)} aria-label={t("togetherAccept")} title={t("togetherAccept")}
          className={`${btn} text-accent`}><Check size={14} weight="bold" /></button>
        <button type="button" onClick={() => dismissSuggestion(sg.id)} aria-label={t(own ? "togetherWithdraw" : "togetherDismiss")} title={t(own ? "togetherWithdraw" : "togetherDismiss")}
          className={`${btn} text-muted hover:text-[var(--status-danger)]`}><X size={13} /></button>
      </>) : own ? (
        <button type="button" onClick={() => dismissSuggestion(sg.id)} aria-label={t("togetherWithdraw")} title={t("togetherWithdraw")}
          className={`${btn} text-muted hover:text-[var(--status-danger)] opacity-0 group-hover/srow:opacity-100 focus-visible:opacity-100`}><X size={13} /></button>
      ) : null}
    </div>
  );
}
