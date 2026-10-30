// frontend/src/components/Invitations.tsx — patch_fe_invites (v2 step 4a)
// Three pieces around sponsored invitations:
//   <InviteForm>    amount + expiry → one permit signature → the code (used in the Share menu and in Positions)
//   <InvitesList>   the sponsor's codes with states and Revoke (Positions)
//   <RedeemInvite>  the card shown when a link carried ?code= — peek, then Redeem into the connected wallet (Claims)
import { useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { useContracts } from "../contracts";
// No import from ./claims-shared here: this module sits in the claims-shared → ShareClaim → Invitations cycle, and a
// top-level read of its `S` crashed the app (TDZ) on 10-30. Same palette, as literals.
const S = { text: "#2d3748", textMuted: "#718096", textFaint: "#a0aec0", border: "#e2e8f0", borderLight: "#edf2f7", green: "#38a169", red: "#e53e3e" } as const;
import {
  daysLeft, fetchInviteConfig, issueInvite, listInvites, peekInvite, redeemInvite, revokeInvite,
  type InviteConfig, type InviteIssued, type InvitePeek, type InviteRow,
} from "../wallet/invites";

const VIOLET = "#5B4BC4";
const btn: React.CSSProperties = { height: 30, padding: "0 10px", borderRadius: 7, border: `1px solid ${S.border}`, background: "#fff", color: S.text, fontSize: 11, fontWeight: 600, cursor: "pointer" };
const primary: React.CSSProperties = { ...btn, background: VIOLET, color: "#fff", borderColor: VIOLET };
const input: React.CSSProperties = { height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${S.border}`, fontSize: 12, width: 72, boxSizing: "border-box" };

const toast = (message: string, type: "error" | "info" | "success" = "info") =>
  window.dispatchEvent(new CustomEvent("verisphere:toast", { detail: { message, type } }));

export function InviteForm({ onIssued, compact = false, postId = null }: { onIssued: (inv: InviteIssued) => void; compact?: boolean; postId?: number | null }) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { data: contracts } = useContracts();
  const [cfg, setCfg] = useState<InviteConfig | null>(null);
  const [amount, setAmount] = useState("2");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { fetchInviteConfig().then(setCfg).catch(() => setCfg(null)); }, []);

  if (!isConnected || !address) return <div style={{ fontSize: 11, color: S.textMuted }}>Connect a wallet to put VSP on the table for someone.</div>;

  const submit = async () => {
    setErr(null);
    const a = Number(amount), d = Number(days);
    if (!cfg) { setErr("Invitations are not available right now."); return; }
    if (!(a >= Number(cfg.min_vsp) && a <= Number(cfg.max_vsp))) { setErr(`Amount: ${cfg.min_vsp}–${cfg.max_vsp} VSP`); return; }
    if (!(d >= 1 && d <= cfg.max_days)) { setErr(`Expiry: 1–${cfg.max_days} days`); return; }
    if (!walletClient || !publicClient || !contracts?.VSPToken) { setErr("Wallet not ready."); return; }
    setBusy(true);
    try {
      const inv = await issueInvite({ walletClient, publicClient, chainId, token: contracts.VSPToken as `0x${string}`, amountVsp: amount, expiresDays: d, config: cfg, postId });
      toast(`${inv.amount_vsp} VSP escrowed from your wallet for this invitation.`, "success");
      onIssued(inv);
    } catch (e: any) {
      setErr(e?.shortMessage || e?.message || "Could not create the invitation.");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="invite-form" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
      {!compact && <div style={{ color: S.textMuted }}>The VSP leaves your wallet now and waits behind a code{postId != null ? ` for claim #${postId}` : ""}; unredeemed by the expiry, or revoked, it comes back.</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <label>Amount <input data-testid="invite-amount" style={input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /> VSP</label>
        <label>· Expires in <input data-testid="invite-days" style={{ ...input, width: 56 }} value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" /> days</label>
        <button type="button" data-testid="invite-submit" style={primary} disabled={busy} onClick={submit}>{busy ? "Signing…" : "Create invitation"}</button>
      </div>
      {cfg && <div style={{ color: S.textFaint, fontSize: 10 }}>{cfg.min_vsp}–{cfg.max_vsp} VSP, up to {cfg.max_days} days, {cfg.max_outstanding} open at a time. One signature; no gas.</div>}
      {err && <div data-testid="invite-error" style={{ color: S.red }}>{err}</div>}
    </div>
  );
}

export function InvitesList() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [open, setOpen] = useState(0);
  const [max, setMax] = useState(100);
  const [issued, setIssued] = useState<InviteIssued | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = () => { if (address) listInvites(address).then((d) => { setRows(d.invites); setOpen(d.open); setMax(d.max_outstanding); }).catch(() => setRows([])); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [address]);

  if (!isConnected || !address) return null;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast("Copied.", "success"); } catch { toast("Could not copy.", "error"); } };
  const goTo = (postId: number) => window.dispatchEvent(new CustomEvent("verisphere:navigate", { detail: { view: "claims", postId } }));
  const visible = rows ? (showAll ? rows : rows.filter((r) => r.status === "open")) : [];
  const closedCount = rows ? rows.filter((r) => r.status !== "open").length : 0;

  return (
    <section data-testid="invites-list" style={{ marginTop: 12, border: `1px solid ${S.border}`, borderRadius: 10, padding: "8px 12px", background: "#fff", fontSize: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Invitations</span>
        <span style={{ color: S.textMuted }}>VSP you set aside for invitations · {open} open of {max}</span>
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="invite-new" style={showForm ? btn : primary} onClick={() => { setShowForm((v) => !v); setIssued(null); }}>{showForm ? "Close" : "New invitation"}</button>
      </div>
      {showForm && (
        <div style={{ marginTop: 8 }}>
          <InviteForm onIssued={(inv) => { setIssued(inv); load(); }} />
          {issued && (
            <div data-testid="invite-issued" style={{ marginTop: 8, background: "#EDEAFB", border: "1px solid #D9D4F0", borderRadius: 8, padding: 10, fontSize: 12 }}>
              Code <code style={{ fontWeight: 700, fontSize: 13 }}>{issued.code}</code> · {issued.amount_vsp} VSP · expires in {daysLeft(issued.expires_at)} days
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button type="button" style={btn} onClick={() => copy(issued.code)}>Copy code</button>
                <button type="button" style={btn} onClick={() => copy(`${window.location.origin}/claims?code=${encodeURIComponent(issued.code)}&start=1`)}>Copy link</button>
              </div>
              <div style={{ color: S.textMuted, marginTop: 6, fontSize: 11 }}>Shown once — the code is not stored anywhere in the clear. Send it to one person; they pick any claim.</div>
            </div>
          )}
        </div>
      )}
      {rows && rows.length > 0 && (
        <>
          <table style={{ width: "100%", marginTop: 6, fontSize: 11, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: S.textFaint, textAlign: "left" }}><th style={{ padding: "2px 6px", fontWeight: 600 }}>Amount</th><th style={{ padding: "2px 6px", fontWeight: 600 }}>For</th><th style={{ padding: "2px 6px", fontWeight: 600 }}>State</th><th style={{ padding: "2px 6px", fontWeight: 600 }}>Expires</th><th></th></tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} data-testid="invite-row" style={{ borderTop: `1px solid ${S.borderLight}` }}>
                  <td style={{ padding: "4px 6px" }}>{r.amount_vsp} VSP</td>
                  <td style={{ padding: "4px 6px" }} data-testid="invite-for">
                    {r.post_id != null
                      ? <a href={`/claims?post=${r.post_id}`} onClick={(e) => { e.preventDefault(); goTo(r.post_id!); }} style={{ color: VIOLET }}>claim #{r.post_id}</a>
                      : <span style={{ color: S.textMuted }}>any claim</span>}
                  </td>
                  <td style={{ padding: "4px 6px" }}>
                    {r.status === "open" ? <span style={{ color: VIOLET, fontWeight: 600 }}>open</span>
                      : r.status === "redeemed" ? <span style={{ color: S.green }}>redeemed by {r.redeemed_by?.slice(0, 6)}…{r.redeemed_by?.slice(-4)}</span>
                      : <span style={{ color: S.textMuted }}>{r.status}, refunded</span>}
                  </td>
                  <td style={{ padding: "4px 6px", color: S.textMuted }}>{r.status === "open" ? `in ${daysLeft(r.expires_at)} d` : new Date(r.closed_at ?? r.redeemed_at ?? r.expires_at).toLocaleDateString()}</td>
                  <td style={{ padding: "2px 6px", textAlign: "right" }}>
                    {r.status === "open" && (
                      <button type="button" data-testid="invite-revoke" style={{ ...btn, height: 24, color: "#B91C1C", borderColor: "#FECACA" }} disabled={busy === r.code_hash}
                        onClick={async () => {
                          if (!walletClient) return;
                          setBusy(r.code_hash);
                          try { const d = await revokeInvite(walletClient, r.code_hash); toast(`${d.amount_vsp} VSP returned to your wallet.`, "success"); load(); }
                          catch (e: any) { toast(e?.shortMessage || e?.message || "Could not revoke.", "error"); }
                          finally { setBusy(null); }
                        }}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {closedCount > 0 && (
            <button type="button" data-testid="invite-toggle-closed" onClick={() => setShowAll((v) => !v)} style={{ background: "none", border: 0, color: S.textMuted, cursor: "pointer", fontSize: 10, padding: "4px 6px 0" }}>
              {showAll ? "Hide redeemed and closed" : `Show ${closedCount} redeemed / closed`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function RedeemInvite({ code }: { code: string }) {
  const { address, isConnected } = useAccount();
  const [peek, setPeek] = useState<InvitePeek | null | "missing">(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { peekInvite(code).then(setPeek).catch(() => setPeek("missing")); }, [code]);

  if (peek === null) return null;
  const box: React.CSSProperties = { margin: "0 0 12px", background: "#EDEAFB", border: "1px solid #D9D4F0", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#37299B" };
  if (peek === "missing") return <div data-testid="redeem-card" style={box}>The invitation in this link is not valid.</div>;
  if (done) return <div data-testid="redeem-card" style={{ ...box, background: "#DCFCE7", borderColor: "#86EFAC", color: "#166534" }}>{done}</div>;
  if (peek.status !== "open") return <div data-testid="redeem-card" style={box}>The invitation in this link was already {peek.status}.</div>;

  return (
    <div data-testid="redeem-card" style={box}>
      <b>{peek.amount_vsp} VSP is on the table for you</b> — someone invited you to take a side. {daysLeft(peek.expires_at)} days left.
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {isConnected && address ? (
          <button type="button" data-testid="redeem-go" style={primary} disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try {
              const d = await redeemInvite(code, address);
              setDone(`${d.amount_vsp} VSP is now in your wallet. Pick a claim and stake it.`);
              toast(`${d.amount_vsp} VSP received.`, "success");
            } catch (e: any) { setErr(e?.message || "Could not redeem."); }
            finally { setBusy(false); }
          }}>{busy ? "Claiming…" : `Claim ${peek.amount_vsp} VSP into this wallet`}</button>
        ) : (
          <span>Connect a wallet to claim it — <b>Passkey</b> in the Connect list needs no app and takes one tap.</span>
        )}
      </div>
      {err && <div data-testid="redeem-error" style={{ color: "#B91C1C", marginTop: 6, fontSize: 12 }}>{err}</div>}
    </div>
  );
}
