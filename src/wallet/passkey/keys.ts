// frontend/src/wallet/passkey/keys.ts — patch_fe_passkey_wallet (v2 step 3a)
// The passkey wallet's key material. A passkey (WebAuthn credential) never gives up its own private key; what it can
// give the page, through the PRF extension, is 32 bytes that are a pseudo-random function of the credential's secret
// and a salt we choose — the same bytes every time, on every device the passkey is synced to. HKDF turns them into
// an ordinary secp256k1 private key; the address follows. The key exists only in page memory (see state.ts); nothing
// secret is ever written to storage or sent to the server.
//
// WebAuthn itself is behind the `PasskeyAuthenticator` interface so the derivation and the connector are testable
// without a browser authenticator.
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { bytesToHex, type Hex } from "viem";

/** The PRF input. Fixed forever: changing it would change every user's address. */
export const PRF_SALT_LABEL = "verisphere-wallet-v1";
const HKDF_SALT = "verisphere-wallet";
const HKDF_INFO = "secp256k1-v1";
export const STORAGE_KEY = "vsp:passkey";          // { credentialId, address, createdAt } — nothing secret
export const DISCONNECTED_KEY = "vsp:passkey:off";  // "1" after an explicit disconnect (no auto-reconnect)

export interface StoredPasskey {
  credentialId: string;  // base64url
  address: Hex;
  createdAt: string;
}

export interface PasskeyAuthenticator {
  /** Create a new discoverable credential and return its id and, when the provider can evaluate PRF at creation,
   *  the PRF output; otherwise `prf` is null and the caller follows with `assert`. */
  create(): Promise<{ credentialId: string; prf: Uint8Array | null }>;
  /** Assert the stored credential (one biometric prompt) and return the PRF output. */
  assert(credentialId: string): Promise<Uint8Array>;
}

export class PasskeyError extends Error {
  constructor(message: string, public readonly code: "unsupported" | "no-prf" | "cancelled" | "mismatch" | "locked") {
    super(message);
    this.name = "PasskeyError";
  }
}

// ── base64url ───────────────────────────────────────────────────────────────────────────────────────

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── derivation ──────────────────────────────────────────────────────────────────────────────────────

/** HKDF-SHA256(prf, salt, info) → 32 bytes. `attempt` > 0 only if the first output is not a valid secp256k1 scalar
 *  (probability ≈ 2^-128; handled for completeness, never expected). */
export async function deriveKeyBytes(prf: Uint8Array, attempt = 0): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", prf as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(HKDF_SALT), info: enc.encode(attempt ? `${HKDF_INFO}-retry-${attempt}` : HKDF_INFO) },
    base, 256);
  return new Uint8Array(bits);
}

/** The private key for a PRF output, as hex. Deterministic: same PRF bytes → same key. Only two callers: the
 *  account for signing (held in memory) and the recovery export (shown once, after a fresh biometric prompt). */
export async function privateKeyFromPrf(prf: Uint8Array): Promise<Hex> {
  if (!(prf instanceof Uint8Array) || prf.length < 32) throw new PasskeyError("The passkey returned no usable PRF output.", "no-prf");
  for (let attempt = 0; attempt < 8; attempt++) {
    const hex = bytesToHex(await deriveKeyBytes(prf, attempt));
    try {
      privateKeyToAccount(hex);
      return hex;
    } catch {
      /* not a valid scalar (astronomically unlikely) — derive again with a different info string */
    }
  }
  throw new PasskeyError("Could not derive a key from this passkey.", "no-prf");
}

/** The viem local account for a PRF output. */
export async function accountFromPrf(prf: Uint8Array): Promise<PrivateKeyAccount> {
  return privateKeyToAccount(await privateKeyFromPrf(prf));
}

// ── storage (public data only) ──────────────────────────────────────────────────────────────────────

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export function loadStored(s: Storage | null = storage()): StoredPasskey | null {
  try {
    const raw = s?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.credentialId !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v?.address ?? "")) return null;
    return { credentialId: v.credentialId, address: v.address, createdAt: String(v.createdAt ?? "") };
  } catch { return null; }
}

export function saveStored(v: StoredPasskey, s: Storage | null = storage()): void {
  try { s?.setItem(STORAGE_KEY, JSON.stringify(v)); s?.removeItem(DISCONNECTED_KEY); } catch { /* private mode */ }
}

export function clearStored(s: Storage | null = storage()): void {
  try { s?.removeItem(STORAGE_KEY); s?.removeItem(DISCONNECTED_KEY); } catch { /* ignore */ }
}

export function markDisconnected(on: boolean, s: Storage | null = storage()): void {
  try { if (on) s?.setItem(DISCONNECTED_KEY, "1"); else s?.removeItem(DISCONNECTED_KEY); } catch { /* ignore */ }
}

export function isMarkedDisconnected(s: Storage | null = storage()): boolean {
  try { return s?.getItem(DISCONNECTED_KEY) === "1"; } catch { return false; }
}

// ── the browser authenticator ───────────────────────────────────────────────────────────────────────

/** Can this browser + passkey provider do what we need? `PublicKeyCredential` present, a user-verifying platform
 *  authenticator available, and — where the browser can tell us — the PRF extension. Browsers that cannot report
 *  PRF capability return "maybe": the wallet is offered and a missing PRF output is handled at creation. */
export async function passkeySupport(): Promise<"yes" | "maybe" | "no"> {
  const PKC: any = typeof window !== "undefined" ? (window as any).PublicKeyCredential : undefined;
  if (!PKC || typeof navigator === "undefined" || !navigator.credentials) return "no";
  try {
    if (typeof PKC.getClientCapabilities === "function") {
      const caps = await PKC.getClientCapabilities();
      if (caps && caps["extension:prf"] === false) return "no";
      if (caps && caps["extension:prf"] === true) return "yes";
    }
    if (typeof PKC.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      const uv = await PKC.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!uv) return "no";
    }
  } catch { /* capability probes are best effort */ }
  return "maybe";
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function prfOf(cred: PublicKeyCredential): Uint8Array | null {
  const ext: any = cred.getClientExtensionResults();
  const first = ext?.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}

function wrapWebAuthnError(e: any): never {
  const name = e?.name || "";
  if (name === "NotAllowedError" || name === "AbortError") throw new PasskeyError("Passkey prompt cancelled.", "cancelled");
  if (name === "NotSupportedError") throw new PasskeyError("This browser cannot create a passkey here.", "unsupported");
  throw e instanceof Error ? e : new Error(String(e));
}

/** The real thing: WebAuthn with the PRF extension, bound to this origin's host. */
export const browserAuthenticator: PasskeyAuthenticator = {
  async create() {
    const enc = new TextEncoder();
    let cred: PublicKeyCredential | null;
    try {
      cred = (await navigator.credentials.create({
        publicKey: {
          rp: { id: window.location.hostname, name: "Verisphere" },
          user: { id: randomBytes(16) as BufferSource, name: `Verisphere wallet · ${new Date().toISOString().slice(0, 10)}`, displayName: "Verisphere wallet" },
          challenge: randomBytes(32) as BufferSource,
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
          timeout: 120_000,
          extensions: { prf: { eval: { first: enc.encode(PRF_SALT_LABEL) } } } as any,
        },
      })) as PublicKeyCredential | null;
    } catch (e) { wrapWebAuthnError(e); }
    if (!cred) throw new PasskeyError("No passkey was created.", "cancelled");
    const ext: any = cred.getClientExtensionResults();
    if (ext?.prf?.enabled === false) throw new PasskeyError("This passkey provider does not support the PRF extension. Use MetaMask instead.", "no-prf");
    return { credentialId: toBase64Url(cred.rawId), prf: prfOf(cred) };
  },

  async assert(credentialId: string) {
    const enc = new TextEncoder();
    let cred: PublicKeyCredential | null;
    try {
      cred = (await navigator.credentials.get({
        publicKey: {
          rpId: window.location.hostname,
          challenge: randomBytes(32) as BufferSource,
          allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId) as BufferSource }],
          userVerification: "required",
          timeout: 120_000,
          extensions: { prf: { eval: { first: enc.encode(PRF_SALT_LABEL) } } } as any,
        },
      })) as PublicKeyCredential | null;
    } catch (e) { wrapWebAuthnError(e); }
    if (!cred) throw new PasskeyError("Passkey prompt cancelled.", "cancelled");
    const prf = prfOf(cred);
    if (!prf) throw new PasskeyError("This passkey provider does not support the PRF extension. Use MetaMask instead.", "no-prf");
    return prf;
  },
};
