// The song's comments, read-only, in the queue panel. They are the YouTube video's: YouTube
// Music shows those too, for an ordinary song the ones under its "Topic" video. Top comments
// come first; further pages load as the list nears its end.
import { useState, useEffect, useRef, useCallback } from "react";
import { Button, Spinner } from "@heroui/react";
import { API, thumb, useLang } from "../context.jsx";
import { ArrowClockwise, ChatCircle, CheckCircle, PushPin, ThumbsUp } from "../icons.jsx";
import { groupCorners } from "./corners.js";

function Comment({ c }) {
  const t = useLang();
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef(null);
  // "Show more" only for a text the four lines actually cut.
  useEffect(() => {
    const el = textRef.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [c.text, open]);

  return (
    <div className="flex gap-2.5 px-2 py-2.5">
      {c.avatar
        ? <img src={thumb(c.avatar)} alt="" loading="lazy" className="w-8 h-8 rounded-[var(--r-full)] object-cover shrink-0 bg-[var(--fill-subtle)]" />
        : <div className="w-8 h-8 rounded-[var(--r-full)] shrink-0 bg-[var(--fill-subtle)]" />}
      <div className="min-w-0 flex-1">
        {c.pinned && (
          <div className="flex items-center gap-1 mb-0.5 text-[length:var(--t11)] text-muted">
            <PushPin size={10} />{t("commentPinned")}
          </div>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate text-[length:var(--t12)] font-semibold ${c.isCreator ? "px-1.5 rounded-[var(--r-full)] bg-[var(--fill-strong)] text-primary" : "text-primary"}`}>
            {c.author}
          </span>
          {(c.isVerified || c.isArtist) && <CheckCircle size={11} className="shrink-0 text-muted" />}
          <span className="shrink-0 text-[length:var(--t11)] text-muted">{c.published}</span>
        </div>
        <p ref={textRef}
          className={`m-0 mt-0.5 text-[length:var(--t12)] leading-[1.55] text-secondary whitespace-pre-wrap break-words ${open ? "" : "line-clamp-4"}`}
        >{c.text}</p>
        {(clamped || open) && (
          <button type="button" onClick={() => setOpen(o => !o)}
            className="mt-0.5 p-0 border-0 bg-transparent cursor-default text-[length:var(--t11)] font-semibold text-muted hover:text-primary">
            {open ? t("showLess") : t("showMore")}
          </button>
        )}
        {(c.likes || c.replies) && (
          <div className="flex items-center gap-3 mt-1 text-[length:var(--t11)] text-muted">
            {c.likes && <span className="flex items-center gap-1"><ThumbsUp size={10} />{c.likes}</span>}
            {c.replies && <span className="flex items-center gap-1"><ChatCircle size={10} />{c.replies}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentsTab({ videoId }) {
  const t = useLang();
  const [sort, setSort] = useState("top");
  const [comments, setComments] = useState([]);
  const [next, setNext] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | disabled | error
  const [loadingMore, setLoadingMore] = useState(false);
  const reqRef = useRef(0);
  const sentinelRef = useRef(null);
  const scrollRef = useRef(null);
  const hl = () => (localStorage.getItem("kiyoshi-lang") || "en").split("-")[0];

  const loadFirst = useCallback(() => {
    if (!videoId) return;
    const id = ++reqRef.current;
    setState("loading"); setComments([]); setNext(null);
    scrollRef.current?.scrollTo({ top: 0 });
    fetch(`${API}/song/comments/${videoId}?sort=${sort}&hl=${hl()}`)
      .then(r => r.json())
      .then(d => {
        if (id !== reqRef.current) return;
        if (d.error) { setState("error"); return; }
        if (d.disabled || !d.comments?.length) { setState("disabled"); return; }
        setComments(d.comments); setNext(d.next || null); setState("ready");
      })
      .catch(() => { if (id === reqRef.current) setState("error"); });
  }, [videoId, sort]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const loadMore = useCallback(() => {
    if (!next || loadingMore) return;
    const id = reqRef.current;
    setLoadingMore(true);
    fetch(`${API}/song/comments/${videoId}?continuation=${encodeURIComponent(next)}&hl=${hl()}`)
      .then(r => r.json())
      .then(d => {
        if (id !== reqRef.current) return;
        const have = new Set();
        setComments(cur => {
          cur.forEach(x => have.add(x.id));
          return [...cur, ...(d.comments || []).filter(x => !have.has(x.id))];
        });
        setNext(d.next || null);
      })
      .catch(() => {})
      .finally(() => { if (id === reqRef.current) setLoadingMore(false); });
  }, [next, loadingMore, videoId]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !next) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadMore(); },
      { root: scrollRef.current, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loadMore, comments.length]);

  const sorts = [["top", t("commentsTop")], ["new", t("commentsNewest")]];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-0.5 px-3 pb-2 shrink-0">
        {sorts.map(([id, label], i) => (
          <button key={id} type="button" onClick={() => setSort(id)}
            style={{ borderRadius: groupCorners(i > 0 ? 6 : 14, i < sorts.length - 1 ? 6 : 14) }}
            className={`h-7 px-3 border-0 cursor-default select-none text-[length:var(--t11)] font-semibold transition-[background-color,color] duration-150 ${
              sort === id ? "bg-[var(--fill-strong)] text-primary" : "bg-[var(--fill-subtle)] text-secondary hover:text-primary hover:bg-hover"
            }`}>{label}</button>
        ))}
      </div>
      <div ref={scrollRef} className="scrollable flex-1 overflow-y-auto px-2 pb-6">
        {state === "loading" && <div className="flex justify-center pt-10"><Spinner size="sm" /></div>}
        {state === "disabled" && <div className="p-6 text-[length:var(--t13)] text-muted text-center">{t("commentsNone")}</div>}
        {state === "error" && (
          <div className="flex flex-col items-center gap-2 p-6">
            <div className="text-[length:var(--t13)] text-muted text-center">{t("commentsError")}</div>
            <Button variant="secondary" size="sm" className="gap-1.5" onPress={loadFirst}><ArrowClockwise size={11} />{t("retry")}</Button>
          </div>
        )}
        {state === "ready" && (
          <>
            {comments.map(c => <Comment key={c.id} c={c} />)}
            {next && <div ref={sentinelRef} className="flex justify-center py-3">{loadingMore && <Spinner size="sm" />}</div>}
          </>
        )}
      </div>
    </div>
  );
}
