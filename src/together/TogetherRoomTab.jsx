// ListenTogether in the queue panel. In a room the Queue tab becomes the Room tab: a compact
// header (room name, the people as avatars, a gear for the settings) over the queue, which the
// queue panel draws (the host's own, or for a listener the room's). People and settings are a
// click away, in popovers: they are needed now and then, the queue all the time.
import { useState, useRef } from "react";
import { Button, PopoverRoot, PopoverContent, PopoverDialog } from "@heroui/react";
import { thumb, useLang, useZoom } from "../context.jsx";
import { Crown, X, Gear } from "../icons.jsx";
import { Toggle } from "../ui/settings-controls.jsx";
import { useTogether, useTogetherValue, hostConfig, roomRemove, setShowAvatar, setShowDiscord } from "./together.js";
import { MemberAvatar, roomName } from "./TogetherSidebar.jsx";

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
            <div className="mb-1.5">{t("togetherControl")}</div>
            <div className="flex gap-1.5">
              {[["host", t("togetherControlHost")], ["everyone", t("togetherControlEveryone")]].map(([id, label]) => (
                <button key={id} type="button" onClick={() => hostConfig({ control: id })}
                  className={`flex-1 h-[30px] rounded-[var(--r-full)] border-0 cursor-default text-[length:var(--t12)] font-semibold transition-[background-color,color] duration-150 ${
                    r.config.control === id ? "bg-accent text-[var(--accent-foreground)]" : "bg-[var(--fill-subtle)] text-secondary hover:text-primary hover:bg-hover"
                  }`}>{label}</button>
              ))}
            </div>
          </div>
          <SwitchRow id="together-wait-all" label={t("togetherWaitAll")} desc={t("togetherWaitAllDesc")}
            value={r.config.waitAll} onChange={(v) => hostConfig({ waitAll: v })} />
        </section>
      ) : (
        <div className="text-secondary">
          {r.config.control === "everyone"
            ? t("togetherListenerCanAdd", { n: host?.name || "Host" })
            : t("togetherListenerHostPicks", { n: host?.name || "Host" })}
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
