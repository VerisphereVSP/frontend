// frontend/src/activity.ts — patch_fe_activity
// What happened on your claims while you were away: the client for GET /api/activity/{address}, the cursor it keeps
// per wallet in this browser (the server records nothing about who looked, or when), and the words for a claim's card.
const API = import.meta.env.VITE_API_BASE || "/api";

export interface ActivityClaim {
  post_id: number;
  text: string;
  role: "support" | "challenge" | "both" | "creator";
  your_vsp: number;
  support_n: number;
  challenge_n: number;
  support_vsp: number;
  challenge_vsp: number;
  unstake_n: number;
  unstake_vsp: number;
  links_n: number;
  links_challenge_n: number;
  wallets_n: number;
  score_before: number | null;
  score_now: number | null;
  flipped: boolean;
  latest_epoch: number;
  last_id: number;
}
export interface ActivityInvite { id: number; amount_vsp: number; post_id: number | null; redeemed_at: string }
export interface Activity {
  address: string;
  since: number | null;
  cursor: number;
  cursor_ts: string;
  claims: ActivityClaim[];
  invites: ActivityInvite[];
  count: number;
}
export interface Cursor { since: number; since_ts: string }

const KEY = (address: string) => `verisphere:activity:${address.toLowerCase()}`;

/** The last point this wallet looked, in this browser; null on the first look (the server then shows the last week). */
export function readCursor(address: string): Cursor | null {
  try {
    const raw = localStorage.getItem(KEY(address));
    if (!raw) return null;
    const c = JSON.parse(raw);
    return typeof c?.since === "number" && typeof c?.since_ts === "string" ? c : null;
  } catch {
    return null;
  }
}

export function writeCursor(address: string, c: Cursor): void {
  try { localStorage.setItem(KEY(address), JSON.stringify(c)); } catch { /* private mode: the badge just keeps counting */ }
}

function query(c: Cursor | null, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams(extra);
  if (c) { p.set("since", String(c.since)); p.set("since_ts", c.since_ts); }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function fetchActivity(address: string, c: Cursor | null, limit = 30): Promise<Activity> {
  const r = await fetch(`${API}/activity/${address}${query(c, { limit: String(limit) })}`);
  if (!r.ok) throw new Error(`activity ${r.status}`);
  return r.json();
}

export async function fetchActivityCount(address: string, c: Cursor | null): Promise<{ count: number; cursor: number; cursor_ts: string }> {
  const r = await fetch(`${API}/activity/${address}/count${query(c)}`);
  if (!r.ok) throw new Error(`activity count ${r.status}`);
  return r.json();
}

const n = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)} %`);
const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** The one line under the quote: who did what, with the VSP, and where the score went. */
export function describeClaim(c: ActivityClaim): { moves: string; score: string | null; flip: string | null } {
  const parts: string[] = [];
  if (c.challenge_n) parts.push(`${plural(c.challenge_n, "wallet challenged it", "wallets challenged it")} (+${n(c.challenge_vsp)} VSP)`);
  if (c.support_n) parts.push(`${plural(c.support_n, "wallet supported it", "wallets supported it")} (+${n(c.support_vsp)} VSP)`);
  if (c.unstake_n) parts.push(`${plural(c.unstake_n, "withdrawal", "withdrawals")} (−${n(c.unstake_vsp)} VSP)`);
  if (c.links_n) {
    const against = c.links_challenge_n, forIt = c.links_n - c.links_challenge_n;
    if (forIt) parts.push(`${plural(forIt, "piece of evidence linked for it", "pieces of evidence linked for it")}`);
    if (against) parts.push(`${plural(against, "piece of evidence linked against it", "pieces of evidence linked against it")}`);
  }
  const moves = parts.join(" · ") || "activity";
  let score: string | null = null;
  if (c.score_now != null) {
    score = c.score_before != null && Math.round(c.score_before) !== Math.round(c.score_now)
      ? `${pct(c.score_before)} → ${pct(c.score_now)} of the stake backs it`
      : `${pct(c.score_now)} of the stake backs it`;
  }
  let flip: string | null = null;
  if (c.flipped && c.score_now != null) {
    const supportNow = c.score_now >= 50;
    if (c.role === "support" || c.role === "challenge") {
      const mine = c.role === "support";
      flip = mine === supportNow ? "Your side now holds the majority." : "Your side lost the majority.";
    } else {
      flip = supportNow ? "Support now holds the majority." : "The challenge now holds the majority.";
    }
  }
  return { moves, score, flip };
}

export function roleLabel(role: ActivityClaim["role"]): string {
  return role === "support" ? "you support" : role === "challenge" ? "you challenge" : role === "both" ? "you hold both sides" : "your claim";
}

export function when(epoch: number): string {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
