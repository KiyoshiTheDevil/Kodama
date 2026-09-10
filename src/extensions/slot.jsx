/**
 * Whatever the enabled extensions offer at one place in Kodama's interface.
 *
 * The whole point is that this file, and every place that uses it, names a SLOT and never an
 * extension. Kodama used to call openExtensionWindow("unison-composer") from inside a modal,
 * which works for exactly one extension and is what an extension system exists to stop.
 *
 * Renders nothing at all when nothing is offered, so a slot costs an empty fragment in an app
 * where no extension is on.
 */
import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { contributionsFor, onExtensionsChanged } from "./registry.js";
import { openExtensionWindow } from "./window.js";
import { thumb } from "../context.jsx";

export function ExtensionSlot({ slot, language = "en", context, className, variant = "ghost", icon }) {
  const [items, setItems] = useState(() => contributionsFor(slot, language));

  // Turning an extension on in the store has to show up here without a restart, and the store is
  // a window of its own, so the news arrives the same way every other cross-window change does.
  useEffect(() => onExtensionsChanged(() => setItems(contributionsFor(slot, language))), [slot, language]);

  if (!items.length) return null;

  return (
    <>
      {items.map(item => (
        <Button key={`${item.extensionId}:${item.title}`} variant={variant} size="sm"
          className={className}
          onPress={() => openExtensionWindow(item.extensionId, context)}>
          {/* The extension's own, through the backend's image proxy: the manifest may only name
              a picture on the store repo or on its own origin, so this reaches nowhere new, and
              the proxy is what keeps the content policy unchanged. Kodama's per-slot icon is the
              fallback for an extension that brings none. */}
          {item.icon
            ? <img src={thumb(item.icon)} alt="" className="h-4 w-4 shrink-0 object-contain" />
            : icon}
          {item.title}
        </Button>
      ))}
    </>
  );
}
