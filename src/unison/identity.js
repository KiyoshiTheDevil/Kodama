// Unison community-lyrics identity — ECDSA P-256 via WebCrypto.
//
// Byte-compatible with the official Better Lyrics extension: the key file is a JWK
// keypair + a SHA-256 hex keyId, and signed requests match the Unison server's
// verification (canonical JSON + base64 signature). See better-lyrics/unison
// src/utils/crypto.ts and src/utils/auth.ts.

const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const SIGN = { name: "ECDSA", hash: "SHA-256" };

// Deterministic display name from the keyId — MUST stay byte-identical to the Better
// Lyrics / Unison generator (src/utils/petname.ts), order included, or names mismatch.
const IDENTITY_ADJECTIVES = [
  "Melodic", "Harmonic", "Acoustic", "Electric", "Mellow", "Groovy", "Funky", "Vibrant",
  "Golden", "Crystal", "Velvet", "Cosmic", "Stellar", "Radiant", "Mystic", "Serene",
  "Dynamic", "Smooth", "Crisp", "Warm", "Bright", "Deep", "Swift", "Bold", "Noble",
  "Grand", "Royal", "Epic", "Vivid", "Lucid", "Prime", "Pure", "Sonic", "Hyper", "Ultra",
  "Mega", "Super", "Astral", "Lunar", "Solar", "Neon", "Retro", "Classic", "Modern",
  "Fusion", "Primal", "Zen", "Nova", "Alpha", "Omega", "Delta", "Sigma", "Quantum",
  "Atomic", "Cyber", "Digital", "Analog", "Stereo", "Studio", "Live", "Remix", "Master",
  "Platinum", "Diamond",
];
const IDENTITY_NOUNS = [
  "Bass", "Guitar", "Piano", "Drum", "Synth", "Chord", "Beat", "Riff", "Note", "Tempo",
  "Rhythm", "Melody", "Verse", "Chorus", "Bridge", "Hook", "Track", "Vinyl", "Record",
  "Album", "Mix", "Tape", "Loop", "Sample", "Treble", "Octave", "Scale", "Arpeggio",
  "Cadence", "Motif", "Theme", "Score", "Cymbal", "Snare", "Kick", "Hihat", "Conga",
  "Bongo", "Shaker", "Gong", "Violin", "Cello", "Flute", "Horn", "Trumpet", "Sax", "Harp",
  "Bell", "Staccato", "Legato", "Crescendo", "Fermata", "Vibrato", "Tremolo", "Glissando",
  "Sforzando", "Forte", "Allegro", "Adagio", "Presto", "Andante", "Largo", "Vivace",
  "Maestro",
];
const IDENTITY_ACTIONS = [
  "Solo", "Remix", "Groove", "Flow", "Vibe", "Echo", "Pulse", "Drift", "Wave", "Loop",
  "Drop", "Rise", "Fade", "Blend", "Sync", "Glide", "Swing", "Bounce", "Slide", "Roll",
  "Spin", "Twist", "Shake", "Break", "Jam", "Play", "Rock", "Pop", "Jazz", "Funk", "Soul",
  "Blues", "Surge", "Rush", "Dash", "Zoom", "Flash", "Spark", "Blast", "Burst", "Chill",
  "Cruise", "Coast", "Sway", "Float", "Hover", "Soar", "Leap", "Strike", "Stomp", "Clap",
  "Snap", "Tap", "Slap", "Pluck", "Strum", "Hum", "Sing", "Chant", "Call", "Shout",
  "Whisper", "Croon", "Belt",
];

// The display name is derived from the keyId — it is NOT user-chosen.
export function generatePetName(keyId) {
  const adj = parseInt(keyId.slice(0, 2), 16) % IDENTITY_ADJECTIVES.length;
  const noun = parseInt(keyId.slice(2, 4), 16) % IDENTITY_NOUNS.length;
  const action = parseInt(keyId.slice(4, 6), 16) % IDENTITY_ACTIONS.length;
  return `${IDENTITY_ADJECTIVES[adj]}${IDENTITY_NOUNS[noun]}${IDENTITY_ACTIONS[action]}`;
}

// Canonical JSON — MUST match the server: object keys sorted, `undefined` dropped,
// primitives via JSON.stringify. The signature and keyId are computed over this.
export function canonicalJson(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// keyId = hex(SHA-256(canonicalJson({ crv, kty, x, y }))) — normalised public key.
export async function deriveKeyId(publicJwk) {
  const normalized = { crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y };
  const buf = new TextEncoder().encode(canonicalJson(normalized));
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return bufToHex(hash);
}

// Generate a fresh identity. The displayName is derived from the keyId (not chosen).
export async function generateIdentity() {
  const pair = await crypto.subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const keyId = await deriveKeyId(publicKey);
  return { version: 1, keyId, publicKey, privateKey, displayName: generatePetName(keyId) };
}

// Sign a payload object → base64 signature over canonicalJson(payload).
export async function signPayload(privateJwk, payload) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, ECDSA, false, ["sign"]);
  const data = new TextEncoder().encode(canonicalJson(payload));
  const sig = await crypto.subtle.sign(SIGN, key, data);
  return bufToBase64(sig);
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bufToHex(bytes.buffer); // 48 hex chars (server requires ≥ 16)
}

// Build a signed request body { payload, signature, publicKey } for the given action
// fields. `publicKey` is always included (the server only needs it on first request,
// but sending it every time is harmless and registers the key transparently).
export async function buildSignedRequest(identity, fields = {}) {
  const payload = { ...fields, timestamp: Date.now(), nonce: randomNonce(), keyId: identity.keyId };
  const signature = await signPayload(identity.privateKey, payload);
  return { payload, signature, publicKey: identity.publicKey };
}

// Portable key file, identical in shape to the Better Lyrics extension export.
export function exportIdentityFile(identity) {
  return {
    version: 1,
    keyId: identity.keyId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    displayName: identity.displayName || "",
    exportedAt: Date.now(),
  };
}

// Parse + validate a key file (from a string or object). Recomputes the keyId from the
// public key rather than trusting the file. Throws on anything invalid.
export async function importIdentityFile(input) {
  const obj = typeof input === "string" ? JSON.parse(input) : input;
  if (!obj || typeof obj !== "object") throw new Error("invalid_file");
  const pub = obj.publicKey;
  const priv = obj.privateKey;
  if (!pub || pub.kty !== "EC" || pub.crv !== "P-256" || !pub.x || !pub.y) throw new Error("invalid_public_key");
  if (!priv || priv.kty !== "EC" || priv.crv !== "P-256" || !priv.d) throw new Error("invalid_private_key");
  // Round-trip the private key so a corrupt key throws here, not at first use.
  await crypto.subtle.importKey("jwk", priv, ECDSA, false, ["sign"]);
  const keyId = await deriveKeyId(pub);
  // Derive the name from the key (don't trust the file's stored name) so it always
  // matches what the server shows.
  return { version: 1, keyId, publicKey: pub, privateKey: priv, displayName: generatePetName(keyId) };
}
