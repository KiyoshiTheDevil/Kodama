// Kodama's own extensions, declared the same way anyone else's would be.
//
// Written out here rather than fetched, because these ship with the build. What matters is that
// they go through parseManifest like everything else: if the wording of a permission is wrong, or
// one of them asks for something that does not exist, it fails here rather than in someone else's
// extension a year from now.
import { parseManifest } from "./manifest.js";

const RAW = [
  {
    id: "unison-composer",
    name: "Unison Composer",
    version: "1.0.0",
    apiVersion: "1.0",
    kind: "app",
    // Kodama's own vendored build, served by the backend at the same origin as the audio bridge.
    // Not composer.boidu.dev: the public site cannot be given backend:composer, and pinning the
    // origin here is what makes that true rather than merely intended.
    origin: "http://localhost:9847",
    entry: "/composer-app/",
    authors: ["KiyoshiTheDevil"],
    description: "Write and time lyrics against the audio Kodama extracts.",
    permissions: ["app:frame", "backend:composer", "appearance:read"],
  },
];

/**
 * The built-in manifests, parsed and trusted.
 *
 * Trust is passed in here, at the one place that knows these came from the build. Nothing in the
 * files above could grant it to itself.
 */
export function builtinExtensions() {
  const out = [];
  for (const raw of RAW) {
    const { ok, manifest, problems } = parseManifest(raw, { trusted: true });
    // A built-in that does not parse is a mistake in this file, and a silent one would show up as
    // a feature that simply does not open.
    if (!ok) throw new Error(`built-in extension "${raw.id}": ${problems.join("; ")}`);
    out.push(manifest);
  }
  return out;
}

export function builtinExtension(id) {
  return builtinExtensions().find(m => m.id === id) || null;
}
