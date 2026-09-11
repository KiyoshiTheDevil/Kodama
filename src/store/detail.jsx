/**
 * One entry, in full. The same page for a theme, a preset and whatever comes next.
 *
 * Shared rather than written per kind because the questions are the same in every case: what is
 * it, who made it, will it run here, what does it look like, what does it actually contain. Only
 * the last two differ, and those arrive as `stages` and `values`.
 */
import { createContext, useContext, useState } from "react";
import { Check, CaretLeft, Star } from "../icons.jsx";
import { thumb } from "../context.jsx";
import { MIN_RATINGS, myRating } from "./ratings.js";

/**
 * How a page casts a vote: `(entry, stars) => Promise<error message | null>`. Provided by the
 * store rather than passed down, because every kind of detail page carries the same stars and
 * none of them has anything to add to them.
 */
export const RateContext = createContext(null);

const fmtAvg = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * The average, the way the stat says it. Nothing below MIN_RATINGS: the number of votes is then
 * the only honest thing to show, because one 5 or one 1 is an opinion, not a rating.
 */
export function ratingText(rating, t) {
  if (!rating) return "—";
  if (rating.count >= MIN_RATINGS) return `${fmtAvg(rating.avg)} ★`;
  return rating.count ? t("storeRatingsCount", { n: rating.count }) : "—";
}

/** The average on a card, only where there is one worth showing. */
export function CardRating({ entry }) {
  const r = entry.rating;
  if (!r || r.count < MIN_RATINGS) return null;
  return (
    <span>
      {" · "}
      <Star size={9} className="relative -top-px" style={{ color: "var(--status-warning)" }} />
      {" "}{fmtAvg(r.avg)}
    </span>
  );
}

/** Five stars to click, offered only for what is installed. */
function YourRating({ entry, t }) {
  const cast = useContext(RateContext);
  const [mine, setMine] = useState(() => myRating(entry.id));
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!cast) return null;

  const send = async (stars) => {
    if (busy) return;
    setBusy(true);
    const problem = await cast(entry, stars);
    setBusy(false);
    setError(problem);
    if (!problem) setMine(stars);
  };

  const shown = hover || mine;
  return (
    <div>
      <div className="mb-2 text-[length:var(--t15)] font-semibold text-primary">{t("storeYourRating")}</div>
      {entry.installed ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} disabled={busy} onMouseEnter={() => setHover(n)} onClick={() => send(n)}
                aria-label={t("storeRateStars", { n })}
                className="flex h-7 w-7 cursor-default items-center justify-center rounded-[var(--r-sm)] hover:bg-[var(--bg-hover)]">
                <Star size={16} style={{
                  color: n <= shown ? "var(--status-warning)" : "var(--stroke)",
                  transition: "color 120ms",
                }} />
              </button>
            ))}
          </div>
          {mine > 0 && !hover && (
            <button disabled={busy} onClick={() => send(0)}
              className="cursor-default text-[length:var(--t11)] text-muted hover:text-primary">
              {t("storeRatingRemove")}
            </button>
          )}
        </div>
      ) : (
        <div className="text-[length:var(--t12)] text-muted">{t("storeRateInstallFirst")}</div>
      )}
      {error && (
        <div className="mt-1.5 text-[length:var(--t11)]" style={{ color: "var(--status-danger)" }}>
          {t("storeRatingFailed")}
        </div>
      )}
    </div>
  );
}

/** Bytes, said the way a shop says them. Under a kilobyte stays in bytes rather than rounding to 0. */
export function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A download count, grouped the way the reader's system groups numbers. Unknown is a dash. */
export function formatCount(n) {
  return typeof n === "number" ? n.toLocaleString() : "—";
}

/** Kodama's own work, as against merely reviewed. */
function VerifiedMark() {
  return (
    <span className="inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[var(--r-full)]"
      style={{ background: "var(--accent)" }}>
      <Check size={8} weight="bold" style={{ color: "#fff" }} />
    </span>
  );
}

function Stat({ label, children }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-4 text-center">
      <span className="text-[length:var(--t10)] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="text-[length:var(--t14)] text-primary">{children}</span>
    </div>
  );
}

/** A section of the page: the same heading everywhere, whatever it heads. */
export function DetailSection({ label, children }) {
  return (
    <div>
      <div className="mb-2 text-[length:var(--t15)] font-semibold text-primary">{label}</div>
      {children}
    </div>
  );
}

// `children` is whatever a kind has to say that the others do not, an extension's permissions for
// one. It comes last, after what every entry shares, so the pages read alike up to the point where
// they genuinely differ.
export default function DetailPage({ entry, t, onBack, actions, icon, stages = [], values = [], valuesLabel, children }) {
  // Drawn views first, then any real pictures the entry published. A drawn one is made from the
  // values being looked at, so it is right by construction and cannot go stale when Kodama's own
  // look changes; a photograph is better at showing an entry in its real surroundings. An entry
  // that publishes none still has something to show, which is why the drawn ones lead.
  const shots = [...stages, ...(entry.screenshots || []).map((url, i) => (
    <img key={`shot-${i}`} src={thumb(url)} alt="" loading="lazy"
      className="h-full w-full object-cover" />
  ))];

  return (
    <div className="flex flex-col gap-7">
      <button onClick={onBack}
        className="flex w-fit cursor-default items-center gap-1.5 text-[length:var(--t12)] text-muted hover:text-primary">
        <CaretLeft size={12} /> {t("storeBack")}
      </button>

      {/* ── Head ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-5">
        <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[var(--r-lg)] border border-border">
          {icon}
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="truncate text-[length:var(--t22)] font-semibold text-primary">{entry.title}</h2>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="truncate text-[length:var(--t13)] text-accent">
              {(entry.creators || []).join(", ") || "—"}
            </span>
            {entry.official && <VerifiedMark />}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-2">{actions}</div>
      </div>

      {/* ── The questions worth answering before installing ─────────────── */}
      <div className="flex items-stretch divide-x" style={{ borderColor: "var(--stroke-dim)" }}>
        <Stat label={t("storeVersion")}>{entry.version || "1.0.0"}</Stat>
        <div style={{ width: 1, background: "var(--stroke-dim)" }} />
        <Stat label={t("storeRequires")}>{entry.minVersion ? `Kodama ${entry.minVersion}` : "—"}</Stat>
        <div style={{ width: 1, background: "var(--stroke-dim)" }} />
        <Stat label={t("storeSize")}>{formatSize(entry.size)}</Stat>
        <div style={{ width: 1, background: "var(--stroke-dim)" }} />
        <Stat label={t("storeDownloads")}>{formatCount(entry.downloads)}</Stat>
        <div style={{ width: 1, background: "var(--stroke-dim)" }} />
        <Stat label={t("storeRating")}>{ratingText(entry.rating, t)}</Stat>
      </div>

      {shots.length > 0 && (
        <div>
          <div className="mb-3 text-[length:var(--t15)] font-semibold text-primary">{t("storeScreenshots")}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(shots.length, 3)}, minmax(0, 1fr))` }}>
            {shots.slice(0, 3).map((node, i) => (
              <div key={i} className="overflow-hidden rounded-[var(--r-lg)] border border-border"
                style={{ aspectRatio: "16 / 10" }}>
                {node}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[length:var(--t15)] font-semibold text-primary">{t("storeDescription")}</div>
          <p className="text-[length:var(--t12)] leading-relaxed text-muted">{entry.description || "—"}</p>
        </div>
        {entry.tags?.length > 0 && (
          <div>
            <div className="mb-2 text-[length:var(--t15)] font-semibold text-primary">{t("storeTags")}</div>
            <p className="text-[length:var(--t12)] leading-relaxed text-muted">{entry.tags.join(", ")}</p>
          </div>
        )}
      </div>

      <YourRating key={entry.id} entry={entry} t={t} />

      {/* What it actually contains. Not in the mockup, kept on purpose: a theme IS its values, and
          this is the only place someone can see what an entry will change before it changes it. */}
      {values.length > 0 && (
        <div>
          <div className="mb-2 text-[length:var(--t15)] font-semibold text-primary">{valuesLabel}</div>
          <div className="grid gap-x-6 gap-y-1 rounded-[var(--r-md)] border border-border p-3 sm:grid-cols-2">
            {values.map(([k, v, swatch]) => (
              <div key={k} className="flex items-center justify-between gap-3 font-mono text-[length:var(--t11)]">
                <span className="flex min-w-0 items-center gap-2">
                  {swatch && (
                    <span className="h-3 w-3 shrink-0 rounded-[3px] border border-border" style={{ background: swatch }} />
                  )}
                  <span className="truncate text-muted">{k}</span>
                </span>
                <span className="shrink-0 text-primary">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
