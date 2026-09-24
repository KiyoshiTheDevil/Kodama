// Terms of Service and Privacy Policy, shown inside the app.
//
// The text is the website's own: docs/terms.html and docs/privacy.html are read at build time
// and only their `.legal` block is shown. One source, so the app and kodama.kiyoshi.dev cannot
// drift apart, and the app shows the text of the version it was built from without needing the
// network. Both files are ours and part of the repo, which is why rendering their markup is fine.
import { useMemo } from "react";
import { Button, ModalBackdrop, ModalContainer, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalCloseTrigger } from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ModalDialog, ModalRoot } from "../ui/zoomed-heroui.jsx";
import { FileImport, Lock } from "../icons.jsx";
import termsHtml from "../../docs/terms.html?raw";
import privacyHtml from "../../docs/privacy.html?raw";

const PAGES = {
  terms:   { html: termsHtml,   titleKey: "legalTerms",   icon: FileImport },
  privacy: { html: privacyHtml, titleKey: "legalPrivacy", icon: Lock },
};

function legalBody(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.querySelector(".legal")?.innerHTML || "";
  } catch {
    return "";
  }
}

/** `page` is "terms", "privacy" or null (closed). `onPage` switches or closes. */
export function LegalModal({ page, onPage, t }) {
  const def = page ? PAGES[page] : null;
  const body = useMemo(() => (def ? legalBody(def.html) : ""), [def]);

  // A link inside the text either names the other page, which stays in the app, or leaves it.
  const onClick = (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") || "";
    if (href === "terms.html" || href === "privacy.html") onPage(href.replace(".html", ""));
    else if (/^(https?:|mailto:)/i.test(href)) openUrl(href).catch(() => {});
  };

  const Icon = def?.icon || FileImport;
  return (
    <ModalRoot isOpen={!!def} onOpenChange={(open) => { if (!open) onPage(null); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="lg" className="w-[680px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Icon size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{def ? t(def.titleKey) : ""}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="legal-app scrollable max-h-[62vh] overflow-y-auto pr-2"
                onClick={onClick} dangerouslySetInnerHTML={{ __html: body }} />
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

/** The two buttons for the About page. */
export function LegalLinks({ onPage, t }) {
  return (
    <div className="flex gap-2 justify-center">
      <Button variant="ghost" size="sm" className="text-muted" onPress={() => onPage("terms")}>{t("legalTerms")}</Button>
      <Button variant="ghost" size="sm" className="text-muted" onPress={() => onPage("privacy")}>{t("legalPrivacy")}</Button>
    </div>
  );
}
