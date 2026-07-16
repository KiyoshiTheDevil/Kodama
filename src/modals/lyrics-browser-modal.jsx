// Community lyrics browser — list every available lyrics version for the track (all providers
// + every Unison community submission), preview + sync type, vote/report, and apply one.
// Two-pane layout: left is the source list (click = preview, doesn't apply yet), right shows
// the full text of whichever version is currently previewed; Select applies it and closes.
// Extracted from App.jsx.
import { useState, useEffect, useMemo } from "react";
import { cn, Button, Spinner, toast, ModalRoot, ModalBackdrop, ModalContainer, Dropdown, DropdownTrigger, DropdownPopover, DropdownItem, ScrollShadowRoot } from "@heroui/react";
import { DropdownMenu, ModalDialog } from "../ui/zoomed-heroui.jsx";
import { PencilSimple, Flag, Check, CaretUp, CaretDown, X, Copy } from "../icons.jsx";
import { API, useLang, openComposer } from "../context.jsx";
import { PROVIDER_SYNC } from "../lyrics/providers.js";
import { fetchLyrics } from "../lyrics/fetch.js";
import { parseTtml, parseLrc, parseDurationToSeconds } from "../lyrics/parse.js";
import { getUnisonIdentity, unisonVote, unisonReport } from "../unison/api.js";

// Browse every available lyrics version for the current track and apply the preferred
// one. Fetches all providers on open and shows a preview + sync type per version.
const UNISON_REPORT_REASONS = ["wrong_song", "bad_sync", "offensive", "spam", "other"];

// Shared enter/exit animation for the report reasons popover (same as App.jsx's
// CTX_POPOVER_ANIM, kept local — it's not exported and this is the only other consumer).
const REPORT_POPOVER_ANIM =
  "data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-top-1 data-[entering]:duration-150 data-[entering]:ease-out " +
  "data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:slide-out-to-top-1 data-[exiting]:duration-100 data-[exiting]:ease-in";

function LyricsBrowserModal({ track, providers, currentSource, currentSubmitter, currentVersionId, onApply, onClose }) {
  const t = useLang();
  const [results, setResults] = useState(null); // null = loading, [] = none
  const [votes, setVotes] = useState({});       // { [versionId]: { my: -1|0|1, count } }
  const [selectedIdx, setSelectedIdx] = useState(-1); // row currently previewed (right pane)

  const doVote = async (r, dir) => {
    if (r.id == null) return;
    if (!getUnisonIdentity()) { toast.danger(t("unisonNeedIdentity"), { timeout: 5000 }); return; }
    const cur = votes[r.id]?.my ?? 0;
    const base = votes[r.id]?.count ?? (r.voteCount || 0);
    const next = cur === dir ? 0 : dir; // toggle off if same direction
    setVotes(v => ({ ...v, [r.id]: { my: next, count: base + (next - cur) } }));
    try { await unisonVote(r.id, next); }
    catch {
      setVotes(v => ({ ...v, [r.id]: { my: cur, count: base } }));
      toast.danger(t("unisonVoteError"), { timeout: 4000 });
    }
  };

  const doReport = async (versionId, reason) => {
    if (!getUnisonIdentity()) { toast.danger(t("unisonNeedIdentity"), { timeout: 5000 }); return; }
    try { await unisonReport(versionId, reason); toast.success(t("unisonReportThanks"), { timeout: 3500 }); }
    catch { toast.danger(t("unisonReportError"), { timeout: 4000 }); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchLyrics(track.title, track.artists, track.album, parseDurationToSeconds(track.duration), providers, track.videoId || "").catch(() => null);
      let base = res?.allResults || [];
      // Expand the single Unison entry into every community submission for this song.
      if (providers.some(p => p.enabled && p.id === "unison")) {
        try {
          const params = new URLSearchParams({ title: track.title, artist: track.artists });
          if (track.album) params.set("album", track.album);
          const dur = parseDurationToSeconds(track.duration);
          if (dur) params.set("duration", Math.round(dur));
          if (track.videoId) params.set("videoId", track.videoId);
          const r = await fetch(`${API}/lyrics/unison/versions?${params}`);
          if (r.ok) {
            const d = await r.json();
            const uVersions = (d.versions || []).map(v => {
              let lrc = null;
              if (v.format === "ttml") lrc = parseTtml(v.lyrics);
              else if (v.format === "lrc") lrc = parseLrc(v.lyrics);
              else if (v.lyrics) lrc = v.lyrics.split("\n").map(line => ({ time: -1, text: line }));
              return (lrc && lrc.length)
                ? { id: v.id, source: "Unison", providerId: "unison", submitterName: v.submitterName, syncType: v.syncType, format: v.format, voteCount: v.voteCount, lrc }
                : null;
            }).filter(Boolean);
            if (uVersions.length) {
              const idx = base.findIndex(x => x.providerId === "unison");
              const without = base.filter(x => x.providerId !== "unison");
              const at = idx >= 0 ? idx : 0;
              base = [...without.slice(0, at), ...uVersions, ...without.slice(at)];
            }
          }
        } catch {}
      }
      if (!cancelled) setResults(base);
    })();
    return () => { cancelled = true; };
  }, []);

  const lineText = (l) => (l.text || (l.words || []).map(w => w.text).join("")).trim();
  const previewOf = (lrc) => (lrc || []).map(lineText).filter(Boolean).slice(0, 3).join(" / ");

  // Sync badge derived from the ACTUAL parsed lyrics, not the provider — the real sync
  // type varies per song (e.g. Better Lyrics may return line-synced for some tracks).
  // word-level timing → Syllable/Word (by provider); line-level → Line; none → Plain.
  const detectSync = (lrc) => {
    if (!lrc || !lrc.length) return "plain";
    if (lrc.some(l => Array.isArray(l.words) && l.words.length > 0)) return "word";
    if (lrc.some(l => typeof l.time === "number" && l.time >= 0)) return "line";
    return "plain";
  };
  const syncFor = (r) => {
    const level = detectSync(r.lrc);
    if (level === "line") return PROVIDER_SYNC.lrclib;  // Line badge
    if (level === "plain") return { label: "Plain", color: "#9e9e9e", bg: "rgba(158,158,158,0.12)" };
    return r.providerId === "musixmatch" ? PROVIDER_SYNC.musixmatch : PROVIDER_SYNC.better;
  };

  // Exactly one row is "active": prefer an exact version-id match (set when a version
  // was applied from here), otherwise the first row matching the live source/submitter.
  const activeIdx = (() => {
    const list = results || [];
    if (currentVersionId != null) {
      const i = list.findIndex(r => r.id != null && r.id === currentVersionId);
      if (i >= 0) return i;
    }
    return list.findIndex(r => r.source === currentSource
      && (r.source !== "Unison" || (r.submitterName || null) === (currentSubmitter || null)));
  })();

  // Default the preview to whichever version is currently playing (or the first result)
  // once results come in.
  useEffect(() => {
    if (results && results.length && selectedIdx < 0) {
      setSelectedIdx(activeIdx >= 0 ? activeIdx : 0);
    }
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = (selectedIdx >= 0 && results) ? results[selectedIdx] : null;

  // Full plain-text lines for the preview pane, with a paragraph break wherever two
  // consecutive timestamps are more than 6s apart (a soft heuristic for verse/chorus
  // boundaries — the LRC/TTML data itself doesn't carry section markers).
  const previewLines = useMemo(() => {
    const lrc = selected?.lrc || [];
    const out = [];
    let lastTime = null;
    for (const l of lrc) {
      const text = lineText(l);
      if (!text) continue;
      if (lastTime != null && typeof l.time === "number" && l.time >= 0 && (l.time - lastTime) > 6) {
        out.push({ gap: true, key: `g${out.length}` });
      }
      out.push({ text, key: `l${out.length}` });
      if (typeof l.time === "number" && l.time >= 0) lastTime = l.time;
    }
    return out;
  }, [selected]);

  const handleSelect = () => {
    if (!selected) return;
    onApply(selected);
    onClose();
  };

  const handleCopy = () => {
    if (!selected) return;
    const text = (selected.lrc || []).map(lineText).filter(Boolean).join("\n");
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast.success(t("lyricsCopied"))).catch(() => {});
  };

  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" className="max-w-[94vw]">
          {/* w-[...]! directly on the dialog, not w-full on an ambiguous parent: HeroUI's
              own .modal__container is `sm:w-fit` at desktop widths (sized to the dialog),
              so giving the CONTAINER a fixed width while the dialog says "w-full" (100% of
              that container) is circular — it resolved to the full backdrop width instead
              (way too wide). The dialog owns its own explicit size here. */}
          <ModalDialog className="p-3! gap-3! flex-row! w-[720px]! max-w-[94vw]! h-[560px] max-h-[85vh] overflow-hidden">
            {/* Left pane — source list */}
            <div className="flex flex-col w-[320px] shrink-0 min-h-0">
              <div className="flex items-center gap-2 px-4 pt-4 pb-3 shrink-0">
                <PencilSimple size={17} />
                <span className="text-t14 font-bold">{t("browseLyrics")}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 flex flex-col gap-1.5">
                {results === null ? (
                  <div className="h-full flex items-center justify-center"><Spinner size="sm" /></div>
                ) : results.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted text-t12 text-center px-3">{t("noLyricsFound")}</div>
                ) : (
                  results.map((r, i) => {
                    const sync = syncFor(r);
                    const isSelected = i === selectedIdx;
                    const preview = previewOf(r.lrc);
                    const isUnison = r.providerId === "unison" && r.id != null;
                    const vState = votes[r.id];
                    const count = vState ? vState.count : (r.voteCount ?? 0);
                    const my = vState ? vState.my : 0;
                    return (
                      <div key={`${r.providerId}-${i}`} role="button" tabIndex={0}
                        onClick={() => setSelectedIdx(i)}
                        onKeyDown={e => { if (e.key === "Enter") setSelectedIdx(i); }}
                        className={cn("flex flex-col gap-1.5 p-2.5 rounded-xl text-left border w-full min-w-0 cursor-default transition-colors duration-150 shrink-0",
                          isSelected ? "border-accent bg-accent-dim" : "border-transparent bg-transparent hover:bg-hover")}>
                          <div className="flex items-center gap-2 w-full min-w-0">
                            <span className={cn("text-t11 font-semibold shrink-0", isSelected && "text-accent")}>{r.source}</span>
                            {r.submitterName ? <span className="text-t11 text-muted truncate min-w-0">· {r.submitterName}</span> : null}
                            {sync ? (
                              <span className="ml-auto text-t10 px-1.5 py-0.5 rounded shrink-0" style={{ color: sync.color, background: sync.bg }}>{sync.label}</span>
                            ) : <span className="ml-auto" />}
                          </div>
                          {preview ? <div className="text-t10 text-muted leading-relaxed line-clamp-2 break-words w-full">{preview}</div> : null}
                          {isUnison ? (
                            <div className="flex items-center gap-1 pt-0.5" onClick={e => e.stopPropagation()}>
                              <button onClick={() => doVote(r, 1)} title={t("upvote")}
                                className={cn("flex items-center justify-center size-6 rounded-md hover:bg-hover transition-colors", my === 1 ? "text-accent" : "text-muted")}>
                                <CaretUp size={13} weight="bold" />
                              </button>
                              <span className="text-t11 tabular-nums min-w-[18px] text-center text-secondary">{count}</span>
                              <button onClick={() => doVote(r, -1)} title={t("downvote")}
                                className={cn("flex items-center justify-center size-6 rounded-md hover:bg-hover transition-colors", my === -1 ? "text-[#e05252]" : "text-muted")}>
                                <CaretDown size={13} weight="bold" />
                              </button>
                              <Dropdown>
                                <DropdownTrigger title={t("report")}
                                  className="ml-auto flex items-center justify-center size-6 rounded-md hover:bg-hover text-muted hover:text-[#e05252] transition-colors">
                                  <Flag size={13} />
                                </DropdownTrigger>
                                <DropdownPopover className={cn("z-[400]!", REPORT_POPOVER_ANIM)}>
                                  <DropdownMenu aria-label={t("report")} onAction={(key) => doReport(r.id, String(key))}>
                                    {UNISON_REPORT_REASONS.map(rr => (
                                      <DropdownItem key={rr} id={rr} textValue={t("report_" + rr)}>{t("report_" + rr)}</DropdownItem>
                                    ))}
                                  </DropdownMenu>
                                </DropdownPopover>
                              </Dropdown>
                            </div>
                          ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="px-4 pt-3 shrink-0">
                <Button variant="ghost" fullWidth className="justify-center gap-2"
                  onPress={() => { openComposer(track?.videoId).catch(console.error); onClose(); }}>
                  <img src="/Boidu Composer Icon.svg" style={{ width: 16, height: 16 }} alt="" />{t("openComposerBtn")}
                </Button>
              </div>
            </div>

            {/* Right pane — the preview itself is a distinctly darker inset card (not just the
                same tone as the dialog frame, so it actually reads as a separate panel); the
                action buttons sit below it, outside the box, matching its width. */}
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <div className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden" style={{ background: "var(--bg-base)" }}>
                <div className="flex items-center justify-between px-4 pt-4 pb-2.5 shrink-0">
                  <span className="text-t14 font-bold">{t("lyricsPreview")}</span>
                  <button onClick={onClose} title={t("close") || "Close"}
                    className="flex items-center justify-center size-7 rounded-full hover:bg-hover text-muted hover:text-primary transition-colors">
                    <X size={13} weight="bold" />
                  </button>
                </div>
                <ScrollShadowRoot size={24} className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 text-t13 text-secondary leading-relaxed">
                  {results === null ? (
                    <div className="h-full flex items-center justify-center"><Spinner size="sm" /></div>
                  ) : !selected ? (
                    <div className="h-full flex items-center justify-center text-muted text-t12">{t("noLyricsFound")}</div>
                  ) : (
                    previewLines.map(l => l.gap
                      ? <div key={l.key} className="h-3.5" />
                      : <div key={l.key}>{l.text}</div>
                    )
                  )}
                </ScrollShadowRoot>
              </div>
              <div className="flex items-center gap-2 pt-3 shrink-0">
                <Button variant="ghost" size="sm" className="flex-1 gap-1.5" isDisabled={!selected} onPress={handleCopy}>
                  <Copy size={14} />{t("copyLyrics")}
                </Button>
                {/* Accent background kept, just the icon/text recoloured to a dark grey
                    matching the modal's own background instead of the variant's default
                    white (--button-fg is what the button's own CSS reads for its
                    foreground colour). */}
                <Button variant="primary" size="sm" className="flex-1 gap-1.5" style={{ "--button-fg": "var(--bg-elevated)" }}
                  isDisabled={!selected} onPress={handleSelect}>
                  <Check size={14} weight="bold" />{t("selectLyricsVersion")}
                </Button>
              </div>
            </div>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

export { LyricsBrowserModal };
