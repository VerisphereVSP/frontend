// frontend/src/wallet/invites.ts — patch_fe_invites (v2 step 4a)
// Client for sponsored invitations (app /api/invites, patch_invites). Issuing = one permit signature naming the escrow
// address, then the app moves the VSP; the code comes back once and is never stored by the server in the clear.
import type { Address, PublicClient, WalletClient } from "viem";
import { parseUnits } from "viem";

const API = import.meta.env.VITE_API_BASE || "/api";

export interface InviteConfig { escrow_address: Address; min_vsp: string; max_vsp: string; max_days: number; max_outstanding: number; default_days: number }
export interface InviteIssued { code: string; code_hash: string; amount_vsp: string; expires_at: string; escrow_tx: string; sponsor: string }
export interface InvitePeek { status: "open" | "redeemed" | "revoked" | "expired"; amount_vsp: string; expires_at: string }
export interface InviteRow {
  id: number; code_hash: string; amount_vsp: string; created_at: string; expires_at: string;
  status: "open" | "redeemed" | "revoked" | "expired"; redeemed_by: string | null; redeemed_at: string | null;
  escrow_tx: string | null; redeem_tx: string | null; refund_tx: string | null; closed_at: string | null;
}

async function j<T>(r: Response): Promise<T> {
  if (r.ok) return r.json();
  let detail = `${r.status}`;
  try { const b = await r.json(); detail = b.detail || b.error || detail; } catch { /* plain */ }
  throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
}

export const fetchInviteConfig = () => fetch(`${API}/invites/config`).then((r) => j<InviteConfig>(r));
export const peekInvite = (code: string) => fetch(`${API}/invites/peek?code=${encodeURIComponent(code)}`).then((r) => j<InvitePeek>(r));
export const listInvites = (sponsor: string) =>
  fetch(`${API}/invites?sponsor=${sponsor}`).then((r) => j<{ sponsor: string; open: number; max_outstanding: number; invites: InviteRow[] }>(r));
export const redeemInvite = (code: string, address: string) =>
  fetch(`${API}/invites/redeem`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, address }) })
    .then((r) => j<{ amount_vsp: string; tx_hash: string; status: string }>(r));

const PERMIT_ABI = [
  { type: "function", name: "eip712Domain", stateMutability: "view", inputs: [],
    outputs: [{ name: "fields", type: "bytes1" }, { name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" }, { name: "salt", type: "bytes32" }, { name: "extensions", type: "uint256[]" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** EIP-2612 permit signed by the connected wallet (the same shape the protocol package's signPermit produces; that
 *  helper is not exported from the package index, so the few lines live here). */
export async function signEscrowPermit(walletClient: WalletClient, publicClient: PublicClient, token: Address, spender: Address, value: bigint, chainId: number) {
  const owner = walletClient.account!.address;
  const [, name, version] = await publicClient.readContract({ address: token, abi: PERMIT_ABI, functionName: "eip712Domain" }) as readonly [string, string, string, bigint, Address, string, readonly bigint[]];
  const nonce = await publicClient.readContract({ address: token, abi: PERMIT_ABI, functionName: "nonces", args: [owner] }) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
    domain: { name, version, chainId, verifyingContract: token },
    types: { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
    primaryType: "Permit",
    message: { owner, spender, value, nonce, deadline },
  });
  return { token, owner, spender, value: value.toString(), deadline: Number(deadline), v: parseInt(signature.slice(130, 132), 16), r: "0x" + signature.slice(2, 66), s: "0x" + signature.slice(66, 130) };
}

/** Issue: permit(sponsor → escrow, amount) signed in the wallet, then the app escrows and returns the code. */
export async function issueInvite(opts: {
  walletClient: WalletClient; publicClient: PublicClient; chainId: number; token: Address;
  amountVsp: string; expiresDays: number; config?: InviteConfig;
}): Promise<InviteIssued> {
  const cfg = opts.config ?? (await fetchInviteConfig());
  const value = parseUnits(opts.amountVsp, 18);
  const permit = await signEscrowPermit(opts.walletClient, opts.publicClient, opts.token, cfg.escrow_address, value, opts.chainId);
  return fetch(`${API}/invites`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_vsp: opts.amountVsp, expires_days: opts.expiresDays, permit }) }).then((r) => j<InviteIssued>(r));
}

/** Revoke: a personal_sign by the sponsor over a fixed message with a timestamp (the app verifies, 10-minute window). */
export async function revokeInvite(walletClient: WalletClient, codeHash: string) {
  const ts = Math.floor(Date.now() / 1000);
  const message = `Verisphere invitation revoke\ncode_hash: ${codeHash}\nts: ${ts}`;
  const signature = await walletClient.signMessage({ account: walletClient.account!, message });
  return fetch(`${API}/invites/revoke`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code_hash: codeHash, ts, signature }) }).then((r) => j<{ status: string; refund_tx: string; amount_vsp: string }>(r));
}

/** The share link and text form with an invitation attached. */
export function withInvite(shareUrl: string, shareText: string, code: string, amountVsp: string): { url: string; text: string } {
  const url = `${shareUrl}${shareUrl.includes("?") ? "&" : "?"}code=${encodeURIComponent(code)}`;
  const text = `${shareText.replace(shareUrl, url)} I've put ${amountVsp} VSP on the table for you — the link carries it.`;
  return { url, text };
}

/** The code in the current page's URL, if any (the share page hands it over as ?code=…&start=1). */
export function codeFromLocation(search: string = typeof window !== "undefined" ? window.location.search : ""): string | null {
  try { return new URLSearchParams(search).get("code"); } catch { return null; }
}

export function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}
