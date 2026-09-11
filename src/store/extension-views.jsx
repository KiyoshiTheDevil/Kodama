/**
 * Extensions as they appear in the store.
 *
 * The card leads with what it will be allowed to do, not with a picture. A theme is judged by how
 * it looks and a preset by what it sounds like; an extension is judged by what it can reach, and
 * that is the one thing a listener has to weigh before saying yes.
 */
import { Button } from "@heroui/react";
import { PuzzlePiece, Check, MusicNote, Palette, FloppyDisk, FileImport,
  Globe, ScreencastSimple, TextSize, Megaphone, Columns } from "../icons.jsx";
import { describePermissions, actionTitle } from "../extensions/manifest.js";
import DetailPage, { DetailSection, CardRating } from "./detail.jsx";

// The manifest names an icon; this is where a name becomes a component. Kept here rather than in
// the manifest so that file stays free of anything that has to be rendered.
const GROUP_ICONS = {
  MusicNote, Palette, FloppyDisk, FileImport, Globe, ScreencastSimple, TextSize, Megaphone, Columns,
};
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
  // One per capability, the same number of lines they will find on the page.
  const perms = describePermissions(entry);
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface">
      <button onClick={() => onOpen(entry.id)} className="block cursor-default text-left">
        {/* Built like a preset's card: a picture on top, the same height as a preset's preview so
            mixed shelves line up, then title, description and one line of facts. */}
        <div className="flex h-[108px] items-center justify-center" style={{ background: "var(--bg-elevated)" }}>
          {entry.icon
            ? <img src={thumb(entry.icon)} alt="" className="h-12 w-12 object-contain" />
            : <PuzzlePiece size={34} className="text-muted" />}
        </div>
        <div className="flex flex-col gap-1 border-t border-border p-3 pb-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[length:var(--t14)] font-medium text-primary">{entry.title}</span>
            {entry.installed && <Check size={13} weight="bold" className="shrink-0 text-accent" />}
          </div>
          {entry.description && (
            <div className="line-clamp-2 text-[length:var(--t11)] leading-snug text-muted">{entry.description}</div>
          )}
          {/* The count, on the card. The list itself is on the page, but "four things" is the part
              that decides whether someone opens the page at all. */}
          <div className="mt-0.5 text-[length:var(--t11)] text-muted">
            {(entry.creators || []).join(", ")}{entry.version ? ` · ${entry.version}` : ""}
            {` · ${t("extPermissionCount", { n: perms.length })}`}
            <CardRating entry={entry} />
          </div>
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

/**
 * The same page as a theme or a preset: head, version / requires / size, description, then what
 * only an extension has. An extension was the one kind laid out on its own, which made it look
 * like a different shop rather than a different shelf.
 */
export function ExtensionDetail({ entry, t, language, onBack, onInstall, onRemove }) {
  const perms = describePermissions(entry);
  return (
    <DetailPage entry={entry} t={t} onBack={onBack}
      icon={<div className="flex h-full w-full items-center justify-center" style={{ background: "var(--bg-elevated)" }}>
        {entry.icon
          ? <img src={thumb(entry.icon)} alt="" className="h-12 w-12 object-contain" />
          : <PuzzlePiece size={34} className="text-muted" />}
      </div>}
      actions={<ExtensionActions entry={entry} t={t} onInstall={onInstall} onRemove={onRemove} />}>

      {/* Every permission, with the ones that reach past the sandbox marked. Kodama's own
          extensions go through this too: seeing their list written out is the cheapest check that
          the wording is comprehensible, and it stops first-party from quietly becoming the path
          where nobody reads them. */}
      <DetailSection label={t("extPermissions")}>
        {/* One line per capability, said from the listener's side: what it can do to them, not
            which part of Kodama makes it possible. Each line is already its own category, so there
            is no heading above it to repeat it. The words are Kodama's, looked up as perm_<id>,
            because a permission is Kodama describing an extension and not the extension
            describing itself. */}
        <div className="flex flex-col gap-2.5 rounded-[var(--r-md)] border border-border p-3">
          {perms.map(p => {
            const Icon = GROUP_ICONS[p.icon] || PuzzlePiece;
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center"
                  style={{ color: p.internal ? "var(--status-warning)" : "var(--text-muted)" }}>
                  <Icon size={15} />
                </span>
                <span className="text-[length:var(--t13)] leading-snug text-primary">
                  {t(`perm_${p.id}`)}
                  {p.detail && <span className="text-muted"> · {p.detail}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[length:var(--t11)] leading-relaxed text-muted">{t("extInternalNote")}</div>
      </DetailSection>

      {/* Laid out like a theme's palette: name on the left, value on the right. */}
      {entry.actions?.length > 0 && (
        <DetailSection label={t("extAddsTo")}>
          <div className="grid gap-x-6 gap-y-1 rounded-[var(--r-md)] border border-border p-3 sm:grid-cols-2">
            {entry.actions.map(a => (
              <div key={a.slot} className="flex items-center justify-between gap-3 font-mono text-[length:var(--t11)]">
                <span className="truncate text-muted">{actionTitle(a, language)}</span>
                <span className="shrink-0 text-primary">{a.slot}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}
    </DetailPage>
  );
}
