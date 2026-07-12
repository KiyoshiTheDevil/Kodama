import { useState } from "react";
import {
  Button,
  ModalRoot,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
  ModalIcon,
  ModalCloseTrigger,
} from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Info, ArrowSquareOut } from "../../../icons.jsx";
import { useLang } from "../../../context.jsx";

export function ArtistDescription({ text, name, url }) {
  const [popupOpen, setPopupOpen] = useState(false);
  const t = useLang();
  // Split off the trailing "From Wikipedia (...)" footer (YTMusic truncates the URL,
  // so the text just ends with "From Wikipedia ("). Strip it from the body and offer
  // a button that resolves the real article via Wikipedia search on click.
  const wikiIdx = text.search(/from wikipedia/i);
  const body = (wikiIdx !== -1 ? text.slice(0, wikiIdx) : text).trimEnd();
  const wikiCited = !!url || (wikiIdx !== -1 && !!name);
  // Role keyword from the description disambiguates names like "Ado" → "Ado (singer)"
  // (only used for the search fallback when the backend didn't supply a direct URL).
  const roleMatch = body.match(
    /\b(singer-songwriter|rapper|singer|musician|songwriter|girl group|boy band|band|duo|group|record producer|producer|composer|vocalist|DJ|artist)\b/i
  );
  const role = roleMatch ? roleMatch[0] : "";

  const openWikipedia = async () => {
    if (url) {
      openUrl(url).catch(console.error);
      return;
    }
    const q = (role ? `${name} ${role}` : name).trim();
    let target = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`
      );
      const d = await r.json();
      const title = d?.query?.search?.[0]?.title;
      if (title)
        target = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    } catch {
      /* keep the search-results fallback */
    }
    openUrl(target).catch(console.error);
  };
  const PREVIEW = 300;
  const isLong = body.length > PREVIEW;
  const preview = isLong ? body.slice(0, PREVIEW).trimEnd() + "…" : body;

  return (
    <>
      {/* Compact snippet — glassy card, upper-right of the hero */}
      <div
        style={{
          position: "absolute",
          top: 96,
          right: 24,
          width: "clamp(220px, 42%, 460px)",
          zIndex: 4,
          background: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14,
          padding: "12px 14px 10px",
        }}
      >
        <div
          style={{
            fontSize: "var(--t10)",
            fontWeight: 700,
            color: "rgba(255,255,255,0.55)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 6,
          }}
        >
          {t("about")}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: "var(--t11)",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.8)",
            whiteSpace: "pre-wrap",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {preview}
        </p>
        {isLong && (
          <Button
            size="sm"
            variant="ghost"
            color="accent"
            className="mt-1 h-6 px-0 min-w-0 font-semibold"
            onPress={() => setPopupOpen(true)}
          >
            {t("showMore")}
          </Button>
        )}
      </div>

      {/* Full-text popup — HeroUI Modal */}
      <ModalRoot
        isOpen={popupOpen}
        onOpenChange={(open) => {
          if (!open) setPopupOpen(false);
        }}
      >
        <ModalBackdrop className="z-[300]!">
          <ModalContainer placement="center" size="md" className="w-[480px] max-w-[92vw]">
            <ModalDialog>
              <ModalHeader>
                <ModalIcon>
                  <Info size={18} />
                </ModalIcon>
                <ModalCloseTrigger />
                <ModalHeading>{t("about")}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <p className="scrollable text-t12 text-secondary leading-relaxed whitespace-pre-wrap max-h-[55vh] overflow-y-auto pr-1">
                  {body}
                </p>
              </ModalBody>
              {wikiCited && (
                <ModalFooter>
                  <Button variant="secondary" size="sm" className="gap-1.5" onPress={openWikipedia}>
                    <ArrowSquareOut size={14} /> {t("viewOnWikipedia")}
                  </Button>
                </ModalFooter>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>
    </>
  );
}
