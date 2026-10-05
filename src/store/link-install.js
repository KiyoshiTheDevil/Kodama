// "Add to Kodama" on the store website: a kodama://store/<kind>/<id> link installs the entry.
//
// Themes and presets are data (a theme is a list of colours, a preset a list of settings) and
// are installed right away. Extensions are code with permissions, so for them the link opens
// their page in the store window, where the listener sees what they can do before installing:
// otherwise any web page could put one into Kodama with a single link.
//
// Only the official catalogue is consulted. The link names an id and nothing else.
import { fetchCatalogue } from "./catalogue.js";
import { installThemeEverywhere } from "./sync.js";
import { installPresetEverywhere, PRESET_KINDS } from "./presets.js";
import { reportDownload } from "./downloads.js";
import { openStoreWindow } from "./window.js";
import { storeIsOpen } from "./gate.js";

/**
 * Act on a store link. Resolves to what happened:
 * { status: "installed" | "updated" | "already" | "needsNewer" | "missing" | "failed" | "opened" | "closed",
 *   title?, min? }
 */
export async function addFromLink({ kind, id }) {
  if (!storeIsOpen()) return { status: "closed" };
  if (kind === "extensions" || kind === "widgets") {
    await openStoreWindow({ kind, id });
    return { status: "opened" };
  }
  const cat = await fetchCatalogue();
  if (!cat.ok) return { status: "failed" };
  const list = kind === "themes" ? cat.themes : PRESET_KINDS.includes(kind) ? cat[kind] : null;
  const e = (list || []).find((x) => x.id === id);
  if (!e) return { status: "missing" };
  if (!e.supported) return { status: "needsNewer", title: e.title, min: e.minVersion };
  if (e.installed && !e.updatable) return { status: "already", title: e.title };
  const ok = kind === "themes" ? await installThemeEverywhere(e) : await installPresetEverywhere(kind, e);
  if (!ok) return { status: "failed", title: e.title };
  if (!e.installed) reportDownload(e.id);
  return { status: e.installed ? "updated" : "installed", title: e.title };
}
