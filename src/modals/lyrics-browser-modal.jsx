// Community lyrics browser — list every available lyrics version for the track (all providers
// + every Unison community submission), preview + sync type, vote/report, and apply one.
// Extracted from App.jsx.
import { useState, useEffect } from "react";
import {
  cn,
  Button,
  Spinner,
  toast,
  ModalRoot,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalIcon,
  ModalHeading,
  ModalBody,
  ModalFooter,
  ModalCloseTrigger,
  Dropdown,
  DropdownTrigger,
  DropdownPopover,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { Microphone, Flag, Check, CaretUp, CaretDown } from "../icons.jsx";
import { API } from "../shared/api/client.js";
import { useLang } from "../context.jsx";
import { PROVIDER_SYNC } from "../lyrics/providers.js";
import { fetchLyrics } from "../lyrics/fetch.js";
import { parseTtml, parseLrc, parseDurationToSeconds } from "../lyrics/parse.js";
import { getUnisonIdentity, unisonVote, unisonReport } from "../unison/api.js";
import { CTX_POPOVER_ANIM } from "../shared/ui/context-menu.jsx";

// Browse every available lyrics version for the current track and apply the preferred
// one. Fetches all providers on open and shows a preview + sync type per version.
const UNISON_REPORT_REASONS = ["wrong_song", "bad_sync", "offensive", "spam", "other"];

function LyricsBrowserModal({
  track,
  providers,
  currentSource,
  currentSubmitter,
  currentVersionId,
  onApply,
  onClose,
}) {
  const t = useLang();
  const [results, setResults] = useState(null); // null = loading, [] = none
  const [votes, setVotes] = useState({}); // { [versionId]: { my: -1|0|1, count } }

  const doVote = async (r, dir) => {
    if (r.id == null) return;
    if (!getUnisonIdentity()) {
      toast.danger(t("unisonNeedIdentity"), { timeout: 5000 });
      return;
    }
    const cur = votes[r.id]?.my ?? 0;
    const base = votes[r.id]?.count ?? (r.voteCount || 0);
    const next = cur === dir ? 0 : dir; // toggle off if same direction
    setVotes((v) => ({ ...v, [r.id]: { my: next, count: base + (next - cur) } }));
    try {
      await unisonVote(r.id, next);
    } catch {
      setVotes((v) => ({ ...v, [r.id]: { my: cur, count: base } }));
      toast.danger(t("unisonVoteError"), { timeout: 4000 });
    }
  };

  const doReport = async (versionId, reason) => {
    if (!getUnisonIdentity()) {
      toast.danger(t("unisonNeedIdentity"), { timeout: 5000 });
      return;
    }
    try {
      await unisonReport(versionId, reason);
      toast.success(t("unisonReportThanks"), { timeout: 3500 });
    } catch {
      toast.danger(t("unisonReportError"), { timeout: 4000 });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchLyrics(
        track.title,
        track.artists,
        track.album,
        parseDurationToSeconds(track.duration),
        providers,
        track.videoId || ""
      ).catch(() => null);
      let base = res?.allResults || [];
      // Expand the single Unison entry into every community submission for this song.
      if (providers.some((p) => p.enabled && p.id === "unison")) {
        try {
          const params = new URLSearchParams({ title: track.title, artist: track.artists });
          if (track.album) params.set("album", track.album);
          const dur = parseDurationToSeconds(track.duration);
          if (dur) params.set("duration", Math.round(dur));
          if (track.videoId) params.set("videoId", track.videoId);
          const r = await fetch(`${API}/lyrics/unison/versions?${params}`);
          if (r.ok) {
            const d = await r.json();
            const uVersions = (d.versions || [])
              .map((v) => {
                let lrc = null;
                if (v.format === "ttml") lrc = parseTtml(v.lyrics);
                else if (v.format === "lrc") lrc = parseLrc(v.lyrics);
                else if (v.lyrics)
                  lrc = v.lyrics.split("\n").map((line) => ({ time: -1, text: line }));
                return lrc && lrc.length
                  ? {
                      id: v.id,
                      source: "Unison",
                      providerId: "unison",
                      submitterName: v.submitterName,
                      syncType: v.syncType,
                      format: v.format,
                      voteCount: v.voteCount,
                      lrc,
                    }
                  : null;
              })
              .filter(Boolean);
            if (uVersions.length) {
              const idx = base.findIndex((x) => x.providerId === "unison");
              const without = base.filter((x) => x.providerId !== "unison");
              const at = idx >= 0 ? idx : 0;
              base = [...without.slice(0, at), ...uVersions, ...without.slice(at)];
            }
          }
        } catch { /* intentionally ignored */ }
      }
      if (!cancelled) setResults(base);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lineText = (l) => (l.text || (l.words || []).map((w) => w.text).join("")).trim();
  const previewOf = (lrc) => (lrc || []).map(lineText).filter(Boolean).slice(0, 3).join(" / ");

  // Sync badge derived from the ACTUAL parsed lyrics, not the provider — the real sync
  // type varies per song (e.g. Better Lyrics may return line-synced for some tracks).
  // word-level timing → Syllable/Word (by provider); line-level → Line; none → Plain.
  const detectSync = (lrc) => {
    if (!lrc || !lrc.length) return "plain";
    if (lrc.some((l) => Array.isArray(l.words) && l.words.length > 0)) return "word";
    if (lrc.some((l) => typeof l.time === "number" && l.time >= 0)) return "line";
    return "plain";
  };
  const syncFor = (r) => {
    const level = detectSync(r.lrc);
    if (level === "line") return PROVIDER_SYNC.lrclib; // Line badge
    if (level === "plain")
      return { label: "Plain", color: "#9e9e9e", bg: "rgba(158,158,158,0.12)" };
    return r.providerId === "musixmatch" ? PROVIDER_SYNC.musixmatch : PROVIDER_SYNC.better;
  };

  // Exactly one row is "active": prefer an exact version-id match (set when a version
  // was applied from here), otherwise the first row matching the live source/submitter.
  const activeIdx = (() => {
    const list = results || [];
    if (currentVersionId != null) {
      const i = list.findIndex((r) => r.id != null && r.id === currentVersionId);
      if (i >= 0) return i;
    }
    return list.findIndex(
      (r) =>
        r.source === currentSource &&
        (r.source !== "Unison" || (r.submitterName || null) === (currentSubmitter || null))
    );
  })();

  return (
    <ModalRoot
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="lg" className="w-[520px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon>
                <Microphone size={18} />
              </ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading className="flex items-center gap-2">
                {t("browseLyrics")}
                <span className="text-t10 font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-accent-dim text-accent">
                  Beta
                </span>
              </ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="h-[48vh] overflow-y-auto overflow-x-hidden px-0.5">
                {results === null ? (
                  <div className="h-full flex items-center justify-center">
                    <Spinner size="sm" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted text-t12">
                    {t("noLyricsFound")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {results.map((r, i) => {
                      const sync = syncFor(r);
                      const isActive = i === activeIdx;
                      const preview = previewOf(r.lrc);
                      const isUnison = r.providerId === "unison" && r.id != null;
                      const vState = votes[r.id];
                      const count = vState ? vState.count : (r.voteCount ?? 0);
                      const my = vState ? vState.my : 0;
                      return (
                        <div
                          key={`${r.providerId}-${i}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            onApply(r);
                            onClose();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onApply(r);
                              onClose();
                            }
                          }}
                          className={cn(
                            "flex flex-col gap-1.5 p-3 rounded-xl text-left border w-full min-w-0 cursor-default transition-colors duration-150",
                            isActive
                              ? "border-accent bg-accent-dim"
                              : "border-border bg-transparent hover:bg-hover"
                          )}
                        >
                          <div className="flex items-center gap-2 w-full min-w-0">
                            <span
                              className={cn(
                                "text-t13 font-semibold shrink-0",
                                isActive && "text-accent"
                              )}
                            >
                              {r.source}
                            </span>
                            {r.submitterName ? (
                              <span className="text-t11 text-muted truncate min-w-0">
                                · {r.submitterName}
                              </span>
                            ) : null}
                            {sync ? (
                              <span
                                className="ml-auto text-t10 px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: sync.color, background: sync.bg }}
                              >
                                {sync.label}
                              </span>
                            ) : (
                              <span className="ml-auto" />
                            )}
                            {isActive ? (
                              <Check size={14} weight="bold" className="text-accent shrink-0" />
                            ) : null}
                          </div>
                          {preview ? (
                            <div className="text-t11 text-muted leading-relaxed line-clamp-2 break-words w-full">
                              {preview}
                            </div>
                          ) : null}
                          {isUnison ? (
                            <div
                              className="flex items-center gap-1 pt-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => doVote(r, 1)}
                                title={t("upvote")}
                                className={cn(
                                  "flex items-center justify-center size-6 rounded-md hover:bg-hover transition-colors",
                                  my === 1 ? "text-accent" : "text-muted"
                                )}
                              >
                                <CaretUp size={13} weight="bold" />
                              </button>
                              <span className="text-t11 tabular-nums min-w-[18px] text-center text-secondary">
                                {count}
                              </span>
                              <button
                                onClick={() => doVote(r, -1)}
                                title={t("downvote")}
                                className={cn(
                                  "flex items-center justify-center size-6 rounded-md hover:bg-hover transition-colors",
                                  my === -1 ? "text-[#e05252]" : "text-muted"
                                )}
                              >
                                <CaretDown size={13} weight="bold" />
                              </button>
                              <Dropdown>
                                <DropdownTrigger
                                  title={t("report")}
                                  className="ml-auto flex items-center justify-center size-6 rounded-md hover:bg-hover text-muted hover:text-[#e05252] transition-colors"
                                >
                                  <Flag size={13} />
                                </DropdownTrigger>
                                <DropdownPopover className={cn("z-[400]!", CTX_POPOVER_ANIM)}>
                                  <DropdownMenu
                                    aria-label={t("report")}
                                    onAction={(key) => doReport(r.id, String(key))}
                                  >
                                    {UNISON_REPORT_REASONS.map((rr) => (
                                      <DropdownItem key={rr} id={rr} textValue={t("report_" + rr)}>
                                        {t("report_" + rr)}
                                      </DropdownItem>
                                    ))}
                                  </DropdownMenu>
                                </DropdownPopover>
                              </Dropdown>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="secondary"
                fullWidth
                className="justify-center gap-2"
                onPress={() => {
                  openComposer(track?.videoId).catch(console.error);
                  onClose();
                }}
              >
                <img src="/Boidu Composer Icon.svg" style={{ width: 18, height: 18 }} alt="" />
                {t("openComposerBtn")}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// Paint a word-synced line's per-syllable highlight directly onto its DOM spans.
// Shared by the ACTIVE line and the TRAILING line (a line that handed over before its
// endTime). Driving both from the same routine means a handed-over line keeps wiping its
// remaining syllables to completion instead of snapping fully white on the line switch.

export { LyricsBrowserModal };
