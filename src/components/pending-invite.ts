// frontend/src/components/pending-invite.ts — patch_fe_start_claim
// An invitation that arrived in a share link and has not been taken yet, remembered in this browser only (never sent),
// so that a closed sheet, a reload or a bounce out of Messenger's in-app browser cannot lose it. App shows a banner
// while one is pending; the Start sheet forgets it once the VSP has moved or the code turns out spent.
import type { Side } from "./start-params";

export interface PendingInvite { code: string; postId: number; side: Side | null; since: number }
const KEY = "verisphere:pending-invite";

export function readPendingInvite(): PendingInvite | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.code === "string" && typeof v.postId === "number" ? v : null;
  } catch {
    return null;
  }
}

export function rememberPendingInvite(p: { code: string; postId: number; side: Side | null }): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...p, since: Date.now() })); } catch { /* private mode */ }
}

export function forgetPendingInvite(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

/** The Start link that re-opens the sheet for a pending invitation. */
export function pendingInviteUrl(p: PendingInvite): string {
  const q = new URLSearchParams({ post: String(p.postId), start: "1", code: p.code });
  if (p.side) q.set("side", p.side);
  return `/claims?${q.toString()}`;
}

/** Messenger, Facebook, Instagram and a few others open links in their own browser, where passkeys often fail. */
export function inAppBrowser(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|MicroMessenger|Snapchat/i.test(ua);
}
