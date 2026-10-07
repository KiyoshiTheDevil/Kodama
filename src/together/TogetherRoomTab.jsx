// ListenTogether's Room tab in the queue panel: who is here, what plays next, and (for the host)
// the room's settings.
import { useState } from "react";
import { thumb, useLang } from "../context.jsx";
import { Crown } from "../icons.jsx";
import { Toggle } from "../ui/settings-controls.jsx";
import { useTogether, hostConfig } from "./together.js";
import { MemberAvatar, roomName } from "./TogetherSidebar.jsx";

const PEOPLE_FOLDED = 6;     // a larger room (a stream) shows this many until unfolded

const Heading = ({ children }) => (
  <div className="text-[length:var(--t11)] text-muted font-semibold tracking-wide mb-1.5">{children}</div>
);

export function TogetherRoomTab() {
  const t = useLang();
  const r = useTogether();
  const [allPeople, setAllPeople] = useState(false);
  const host = r.members.find((m) => m.host);
  const people = allPeople ? r.members : r.members.slice(0, PEOPLE_FOLDED);
  const hidden = r.members.length - people.length;

  return (
    <div className="scrollable flex-1 overflow-y-auto px-4 pt-2 pb-6 flex flex-col gap-5 text-[length:var(--t12)]">
      <div>
        <div className="font-semibold text-[length:var(--t13)]">{roomName(r, t)}</div>
        <div className="text-secondary text-[length:var(--t11)] font-mono">{r.room}</div>
      </div>

      <section>
        <Heading>{t("togetherPeople")} · {r.members.length}</Heading>
        <div className="flex flex-col gap-1">
          {people.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 py-1">
              <MemberAvatar member={m} size={26} ring={false} />
              <span className="truncate">{m.name}</span>
              {m.host && <Crown size={11} className="text-muted" aria-label={t("togetherHost")} />}
              {r.you?.id === m.id && <span className="text-muted">({t("togetherYou")})</span>}
            </div>
          ))}
        </div>
        {(hidden > 0 || allPeople) && r.members.length > PEOPLE_FOLDED && (
          <button type="button" onClick={() => setAllPeople((v) => !v)}
            className="mt-1 border-0 bg-transparent p-0 cursor-default text-accent text-[length:var(--t11)] font-semibold">
            {allPeople ? t("togetherShowLess") : t("togetherShowAll", { c: hidden })}
          </button>
        )}
      </section>

      {r.isHost ? (
        <section className="flex flex-col gap-3">
          <Heading>{t("togetherSettings")}</Heading>
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
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div id="together-wait-all">{t("togetherWaitAll")}</div>
              <div className="text-secondary text-[length:var(--t11)] mt-0.5">{t("togetherWaitAllDesc")}</div>
            </div>
            <Toggle value={!!r.config.waitAll} onChange={(v) => hostConfig({ waitAll: v })} aria-labelledby="together-wait-all" />
          </div>
        </section>
      ) : (
        <div className="text-secondary">
          {r.config.control === "everyone"
            ? t("togetherListenerCanAdd", { n: host?.name || "Host" })
            : t("togetherListenerHostPicks", { n: host?.name || "Host" })}
        </div>
      )}

      <section>
        <Heading>{t("togetherUpNext")}</Heading>
        {r.queue.length === 0 ? (
          <div className="text-muted">{t("togetherQueueEmpty")}</div>
        ) : (
          <div className="flex flex-col gap-1">
            {r.queue.map((q, i) => (
              <div key={`${q.videoId}-${i}`} className="flex items-center gap-2.5 py-1 min-w-0">
                {q.thumbnail
                  ? <img src={thumb(q.thumbnail)} alt="" className="w-9 h-9 rounded-[var(--r-sm)] object-cover shrink-0" />
                  : <div className="w-9 h-9 rounded-[var(--r-sm)] shrink-0" style={{ background: "var(--placeholder-gradient)" }} />}
                <div className="min-w-0">
                  <div className="truncate font-medium">{q.title}</div>
                  <div className="truncate text-secondary text-[length:var(--t11)]">{q.artists}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
