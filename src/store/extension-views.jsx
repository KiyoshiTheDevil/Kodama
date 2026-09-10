/**
 * Extensions as they appear in the store.
 *
 * The card leads with what it will be allowed to do, not with a picture. A theme is judged by how
 * it looks and a preset by what it sounds like; an extension is judged by what it can reach, and
 * that is the one thing a listener has to weigh before saying yes.
 */
import { Button } from "@heroui/react";
import { PuzzlePiece, Check, CaretLeft } from "../icons.jsx";
import { describePermissions } from "../extensions/manifest.js";
import { thumb } from "../context.jsx";

/** The same four-way state as everything else on these shelves. */
export function ExtensionActions({ entry, t, onInstall, onRemove, size = "sm" }) {
  if (!entry.supported) {
    return <span className="text-[length:var(--t11)] text-muted">{t("themeNeedsNewer")}</span>;
  }
  if (!entry.installed) {
    return <Button size={size} variant="secondary" onPress={() => onInstall(entry)}>{t("themeInstall")}</Button>;
  }
  return (
    <>
      {entry.updatable && (
        <Button size={size} variant="secondary" onPress={() => onInstall(entry)}>{t("themeUpdate")}</Button>
      )}
      <Button size={size} variant="ghost" className="text-muted" onPress={() => onRemove(entry)}>
        {t("themeRemove")}
      </Button>
    </>
  );
}

export function ExtensionCard({ entry, t, onOpen, onInstall, onRemove }) {
  const perms = describePermissions(entry);
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface">
      <button onClick={() => onOpen(entry.id)} className="block cursor-default text-left">
        <div className="flex items-center gap-3 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)]"
            style={{ background: "var(--bg-elevated)" }}>
            {entry.icon
              ? <img src={thumb(entry.icon)} alt="" className="h-6 w-6 object-contain" />
              : <PuzzlePiece size={17} className="text-muted" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[length:var(--t14)] font-medium text-primary">{entry.name}</span>
              {entry.installed && <Check size={13} weight="bold" className="shrink-0 text-accent" />}
            </div>
            <div className="truncate text-[length:var(--t11)] text-muted">
              {(entry.authors || []).join(", ")}{entry.version ? ` · ${entry.version}` : ""}
            </div>
          </div>
        </div>
        {entry.description && (
          <div className="px-3 pb-2 text-[length:var(--t11)] leading-snug text-muted">{entry.description}</div>
        )}
        {/* The count, on the card. The list itself is on the page, but "four things" is the part
            that decides whether someone opens the page at all. */}
        <div className="px-3 pb-1 text-[length:var(--t11)] text-muted">
          {t("extPermissionCount", { n: perms.length })}
        </div>
      </button>
      <div className="p-3 pt-2">
        <div className="flex items-center gap-1.5">
          <ExtensionActions entry={entry} t={t} onInstall={onInstall} onRemove={onRemove} />
        </div>
      </div>
    </div>
  );
}

export function ExtensionDetail({ entry, t, onBack, onInstall, onRemove }) {
  const perms = describePermissions(entry);
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <button onClick={onBack}
        className="flex w-fit cursor-default items-center gap-1.5 text-[length:var(--t12)] text-muted hover:text-primary">
        <CaretLeft size={12} /> {t("storeBack")}
      </button>

      <div className="flex items-start gap-4">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[var(--r-lg)] border border-border"
          style={{ background: "var(--bg-elevated)" }}>
          {entry.icon
            ? <img src={thumb(entry.icon)} alt="" className="h-10 w-10 object-contain" />
            : <PuzzlePiece size={30} className="text-muted" />}
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="truncate text-[length:var(--t20)] font-semibold text-primary">{entry.name}</h2>
          <div className="mt-1 text-[length:var(--t13)] text-accent">
            {(entry.authors || []).join(", ") || "—"}
          </div>
          {entry.description && (
            <p className="mt-2 text-[length:var(--t13)] leading-relaxed text-muted">{entry.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          <ExtensionActions entry={entry} t={t} onInstall={onInstall} onRemove={onRemove} />
        </div>
      </div>

      {/* Every permission, in the words the manifest carries, with the ones that reach past the
          sandbox marked. Kodama's own extensions go through this too: seeing their list written
          out is the cheapest check that the wording is comprehensible, and it stops first-party
          from quietly becoming the path where nobody reads them. */}
      <div>
        <div className="mb-2 text-[length:var(--t15)] font-semibold text-primary">{t("extPermissions")}</div>
        <div className="flex flex-col gap-2 rounded-[var(--r-lg)] border border-border p-4">
          {perms.map(p => (
            <div key={p.id} className="flex gap-3">
              <span className="mt-[5px] h-2 w-2 shrink-0 rounded-[var(--r-full)]"
                style={{ background: p.internal ? "var(--status-warning)" : "var(--text-muted)" }} />
              <div className="min-w-0">
                {/* The label is what someone reads while deciding; the sentence is for the one
                    they stop on. The raw permission id was developer noise on a page meant for
                    whoever is about to say yes. */}
                <div className="text-[length:var(--t13)] text-primary">{p.label}</div>
                <div className="text-[length:var(--t11)] leading-snug text-muted">{p.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[length:var(--t11)] leading-relaxed text-muted">{t("extInternalNote")}</div>
      </div>

      {entry.actions?.length > 0 && (
        <div>
          <div className="mb-2 text-[length:var(--t15)] font-semibold text-primary">{t("extAddsTo")}</div>
          <div className="flex flex-col gap-1 rounded-[var(--r-md)] border border-border p-3">
            {entry.actions.map(a => (
              <div key={a.slot} className="flex justify-between gap-3 text-[length:var(--t11)]">
                <span className="text-muted">{typeof a.title === "string" ? a.title : (a.title.en || "")}</span>
                <span className="shrink-0 font-mono text-primary">{a.slot}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
