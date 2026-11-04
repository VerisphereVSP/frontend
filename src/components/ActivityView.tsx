// frontend/src/components/ActivityView.tsx — patch_fe_activity
// The Activity view (/activity): what other wallets did on the claims you hold or created since you last looked, one
// card per claim, newest first, and your invitations that were redeemed. Opening a card goes to the claim. The cursor
// moves forward when you leave the view (or press "Mark all as seen"), so a reload while reading changes nothing.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useNavigate } from "react-router-dom";
import { Activity, ActivityClaim, Cursor, describeClaim, fetchActivity, fetchActivityCount, readCursor, roleLabel, when, writeCursor } from "../activity";

const C = { text: "#2d3748", muted: "#718096", faint: "#a0aec0", border: "#e2e8f0", bg: "#ffffff", alt: "#f7fafc", green: "#38a169", red: "#e53e3e", brand: "#5b4bdb" };
export const SEEN_EVENT = "verisphere:activity-seen";
const POLL_MS = 60_000;

/** The badge: how many claims (and redeemed invitations) have news since this wallet last looked, polled slowly. */
export function useActivityCount(address: string | undefined, paused = false): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!address) { setCount(0); return; }
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetchActivityCount(address, readCursor(address));
        if (alive) setCount(r.count);
      } catch { /* the badge simply stays as it was */ }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    window.addEventListener("verisphere:notifications-refresh", poll);
    window.addEventListener(SEEN_EVENT, poll);
    return () => { alive = false; clearInterval(id); window.removeEventListener("verisphere:notifications-refresh", poll); window.removeEventListener(SEEN_EVENT, poll); };
  }, [address]);
  return paused ? 0 : count;
}

export function markSeen(address: string, a: Activity): void {
  writeCursor(address, { since: a.cursor, since_ts: a.cursor_ts });
  try { window.dispatchEvent(new Event(SEEN_EVENT)); } catch { /* no window */ }
}

export default function ActivityView() {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const [data, setData] = useState<Activity | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [seenNow, setSeenNow] = useState(false);
  const startCursor = useRef<Cursor | null>(null);
  const latest = useRef<Activity | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setErr(null);
    try {
      if (startCursor.current === null) startCursor.current = readCursor(address);
      const a = await fetchActivity(address, startCursor.current);
      latest.current = a;
      setData(a);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load activity");
    }
  }, [address]);

  useEffect(() => { startCursor.current = null; latest.current = null; setData(null); setSeenNow(false); load(); }, [load]);

  // leaving the view = seen: the cursor moves to where this look reached
  useEffect(() => () => { if (address && latest.current) markSeen(address, latest.current); }, [address]);

  if (!isConnected || !address) return <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Connect a wallet to see what happened on your claims.</div>;

  const open = (postId: number) => navigate(`/claims?post=${postId}`);
  const items = data ? data.claims.length + data.invites.length : 0;

  return (
    <div data-testid="activity-view" style={{ maxWidth: 760, margin: "0 auto", padding: "16px 16px 40px", fontFamily: "inherit" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, color: C.text }}>Activity on your claims</h3>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {startCursor.current?.since_ts ? `Since you last looked (${new Date(startCursor.current.since_ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : "The last 7 days"} · what other wallets did on the claims you hold or created.
          </div>
        </div>
        {data && items > 0 && !seenNow && (
          <button data-testid="activity-seen" onClick={() => { markSeen(address, data); setSeenNow(true); }}
            style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Mark all as seen</button>
        )}
      </div>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err} <button onClick={load} style={{ marginLeft: 8 }}>Retry</button></div>}
      {!data && !err && <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>}
      {data && items === 0 && (
        <div data-testid="activity-empty" style={{ color: C.muted, fontSize: 13, padding: "24px 0" }}>
          Nothing new on your claims. Share one — the people you send it to are the ones who move the score.
        </div>
      )}
      {data && data.invites.map((i) => (
        <div key={`inv-${i.id}`} data-testid="activity-invite" style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: "#EDEAFB", padding: "10px 14px", marginBottom: 10, fontSize: 13, color: C.text }}>
          Your invitation was redeemed — {i.amount_vsp} VSP{i.post_id != null ? <> for <a href={`/claims?post=${i.post_id}`} onClick={(e) => { e.preventDefault(); open(i.post_id!); }} style={{ color: C.brand }}>claim #{i.post_id}</a></> : ""}.
          <span style={{ color: C.muted }}> {when(Math.floor(new Date(i.redeemed_at).getTime() / 1000))}</span>
        </div>
      ))}
      {data && data.claims.map((c) => <ClaimCard key={c.post_id} c={c} onOpen={() => open(c.post_id)} />)}
    </div>
  );
}

function ClaimCard({ c, onOpen }: { c: ActivityClaim; onOpen: () => void }) {
  const d = describeClaim(c);
  const sideColor = c.role === "support" ? C.green : c.role === "challenge" ? C.red : C.muted;
  return (
    <a href={`/claims?post=${c.post_id}`} onClick={(e) => { e.preventDefault(); onOpen(); }} data-testid="activity-claim" data-post={c.post_id}
      style={{ display: "block", textDecoration: "none", border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, padding: "12px 14px", marginBottom: 10, color: C.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, color: C.muted, marginBottom: 4 }}>
        <span>Claim #{c.post_id} · <span style={{ color: sideColor, fontWeight: 600 }}>{roleLabel(c.role)}</span>{c.your_vsp > 0 ? ` · ${c.your_vsp} VSP` : ""}</span>
        <span>{when(c.latest_epoch)}</span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.4, marginBottom: 6 }}>“{c.text}”</div>
      <div style={{ fontSize: 12.5, color: C.text }}>{d.moves}</div>
      {d.score && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{d.score}</div>}
      {d.flip && <div data-testid="activity-flip" style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4, color: d.flip.includes("lost") ? C.red : C.green }}>{d.flip}</div>}
    </a>
  );
}
