// Which extensions may hold a permission that reaches past the sandbox.
//
// Everything in the catalogue is reviewed before it is published, so a catalogue entry is a
// trusted source and its manifest is downloaded and installed like anything else. This list is
// not a second opinion about that review.
//
// It exists because internal permissions are not promises Kodama can keep for an arbitrary id.
// "audio" grants access to routes that exist in a particular Kodama build; an entry
// asking for it is asking for something the running version either has or does not. The build
// already has to know about it, and writing that down is the difference between a coupling that
// is visible and one that is merely true.
//
// The cost is exact and small: an extension that wants an internal permission needs a Kodama
// release. One that only wants open permissions needs nothing but a commit in the store, which is
// the case this whole arrangement exists to serve.
//
// It is also what keeps the blast radius of a compromised catalogue to the ids already listed
// here, rather than to every permission that exists.
const TRUSTED_IDS = new Set([
  "unison-composer",
]);

/** Whether a catalogue entry may ask for internal permissions. Never read from the entry itself. */
export function isTrustedExtension(id) {
  return TRUSTED_IDS.has(id);
}
