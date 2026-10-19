// Account-scoped draft storage. Raw text is never written to persistent storage.
// Optional encrypted drafts: AES-GCM key in sessionStorage (tab session only), ciphertext in localStorage.
export interface LocalDraft { body: string; audience: string; circleId?: string | null; groupId?: string | null }

const memory = new Map<string, LocalDraft>();
const CHANNEL = "me-experience-cleanup";
const SIGNAL = "me:draft-wipe-signal";
const ckey = (u: string) => `me:draft-ct:${u}`;
const kkey = (u: string) => `me:draft-key:${u}`;

let generation = 0;
let activeUser: string | null = null;
let channel: BroadcastChannel | null = null;
try { channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; }

const listeners = new Set<() => void>();
/** Subscribe to wipes (local or from another tab) so React previews of drafts can be dropped. */
export function subscribeDraftWipe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
const notify = () => listeners.forEach(l => { try { l(); } catch { /* ignore */ } });

export const getActiveUser = () => activeUser;
export const getGeneration = () => generation;

export function setActiveUser(userId: string | null) {
  if (activeUser !== userId) { generation++; activeUser = userId; }
}
const stillValid = (u: string, g: number) => activeUser === u && generation === g;
/** True while `u` is the live account and `g` is the generation captured before an async step. */
export const isCurrent = stillValid;

const b64 = (buf: ArrayBuffer | Uint8Array) => { const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ""; a.forEach(c => { s += String.fromCharCode(c); }); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function getMemoryDraft(u: string) { return memory.get(u) ?? null; }
/** Synchronous; ignored unless `u` is the live account. */
export function setMemoryDraft(u: string, d: LocalDraft | null) {
  if (activeUser !== u) return;
  if (d && d.body.trim()) memory.set(u, d); else memory.delete(u);
}

export function hasEncryptedDraft(u: string) { try { return !!localStorage.getItem(ckey(u)); } catch { return false; } }
export function hasKey(u: string) { try { return !!sessionStorage.getItem(kkey(u)); } catch { return false; } }

async function getKey(u: string, g: number, create: boolean): Promise<CryptoKey | null> {
  const raw = sessionStorage.getItem(kkey(u));
  if (raw) return crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
  if (!create) return null;
  const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const exported = await crypto.subtle.exportKey("raw", k);
  if (!stillValid(u, g)) return null; // wiped or account changed while generating: never persist the key
  sessionStorage.setItem(kkey(u), b64(exported));
  return k;
}

export async function saveEncrypted(u: string, d: LocalDraft): Promise<boolean> {
  const g = generation;
  if (!stillValid(u, g) || !d.body.trim()) return false;
  try {
    const key = await getKey(u, g, true);
    if (!key || !stillValid(u, g)) return false;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(d)));
    if (!stillValid(u, g)) return false;
    localStorage.setItem(ckey(u), JSON.stringify({ iv: b64(iv), ct: b64(ct) }));
    return true;
  } catch { return false; }
}

export async function loadEncrypted(u: string): Promise<LocalDraft | null> {
  const g = generation;
  try {
    const raw = localStorage.getItem(ckey(u));
    if (!raw) return null;
    const key = await getKey(u, g, false);
    if (!key) return null;
    const { iv, ct } = JSON.parse(raw);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct));
    if (!stillValid(u, g)) return null;
    return JSON.parse(new TextDecoder().decode(pt)) as LocalDraft;
  } catch { return null; }
}

function eraseStorage(u: string | null) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (u ? k === ckey(u) : k.startsWith("me:draft-ct:"))) keys.push(k); }
    keys.forEach(k => localStorage.removeItem(k));
    const sk: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k && (u ? k === kkey(u) : k.startsWith("me:draft-key:"))) sk.push(k); }
    sk.forEach(k => sessionStorage.removeItem(k));
  } catch { /* storage unavailable */ }
}

function signal(msg: { type: string; userId: string | null }) {
  try { channel?.postMessage(msg); } catch { /* ignore */ }
  // storage-event fallback for browsers without BroadcastChannel
  try { localStorage.setItem(SIGNAL, JSON.stringify({ ...msg, t: Date.now(), r: Math.random() })); localStorage.removeItem(SIGNAL); } catch { /* ignore */ }
}

function applyWipe(u: string | null) {
  generation++;
  if (u) memory.delete(u); else memory.clear();
  eraseStorage(u);
  notify();
}

/** Erase all local drafts (memory, key, ciphertext) for an account, in this tab and others. */
export function wipeDrafts(u: string | null, broadcast = true) {
  applyWipe(u);
  if (broadcast) signal({ type: "wipe", userId: u });
}

export function wipeEncryptedOnly(u: string) {
  generation++;
  try { localStorage.removeItem(ckey(u)); sessionStorage.removeItem(kkey(u)); } catch { /* ignore */ }
  signal({ type: "wipe-encrypted", userId: u });
}

/** Account was deleted/deactivated while Clerk may still be signed in: erase everything and stop all writers. */
export function endAccountSession(u: string | null) {
  wipeDrafts(u);
  wipeDrafts(null);
  activeUser = null;
  generation++;
}

export function listenForCleanup() {
  const handle = (m: { type?: string; userId?: string | null } | null) => {
    if (!m) return;
    if (m.type === "wipe") applyWipe(m.userId ?? null);
    if (m.type === "wipe-encrypted" && m.userId) { generation++; try { sessionStorage.removeItem(kkey(m.userId)); } catch { /* ignore */ } }
  };
  const onMsg = (e: MessageEvent) => handle(e.data);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SIGNAL && e.newValue) { try { handle(JSON.parse(e.newValue)); } catch { /* ignore */ } return; }
    // Ciphertext removed by another tab: drop key, memory and React previews too, not just the session key.
    if (e.key && e.key.startsWith("me:draft-ct:") && e.newValue === null) {
      const u = e.key.slice("me:draft-ct:".length);
      generation++;
      memory.delete(u);
      try { sessionStorage.removeItem(kkey(u)); } catch { /* ignore */ }
      notify();
    }
  };
  channel?.addEventListener("message", onMsg);
  window.addEventListener("storage", onStorage);
  return () => { channel?.removeEventListener("message", onMsg); window.removeEventListener("storage", onStorage); };
}
