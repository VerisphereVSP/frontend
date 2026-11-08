// frontend/src/components/StartOverlay.tsx — patch_fe_start (v2 step 4c)
// The first move for a reader who tapped "Back it with VSP" on a share page: three steps on top of the Claims view —
// a wallet, VSP (an invitation in the link, or a note on how to get some), and the stake on the side they chose.
// It never blocks: every step can be skipped, a wrong or used code is said once and the flow goes on, and closing it
// leaves the reader on the claim with the hand-off parameters stripped from the address bar.
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useStake } from "@verisphere/protocol";
import { peekInvite, redeemInvite, type InvitePeek } from "../wallet/invites";
import { rememberPendingInvite, forgetPendingInvite, inAppBrowser } from "./pending-invite";  // patch_fe_start_claim
import { PASSKEY_CONNECTOR_ID } from "../wallet/passkey/connector";
import { useToast } from "./Toast";
import { closedStartUrl, type Side } from "./start-params";
import { onceTracker } from "../funnel";  // patch_fe_funnel
import InstallExtension from "./InstallExtension";  // patch_fe_install_ext

const API = import.meta.env.VITE_API_BASE || "/api";

// patch_payoff — the rule, in the same words as the share page and the guide (Lavey, 11-01)
export const THE_RULE = "The score is a credibility signal, not a verdict and not a bet: it is what people are willing to stake behind each side. Your position earns or loses VSP over time by the claim's score — from the protocol, never from the other side. You can change or withdraw at any time.";
export const RULE_FINE_PRINT = "At a score of 0 nobody earns or loses; rates are bounded; nothing is ever resolved.";

const P = { violet: "#5B4BC4", violetDeep: "#37299B", tint: "#EDEAFB", line: "#D9D4F0", ink: "#1C1533", muted: "#5D5776", faint: "#8A84A6",
  green: "#16A34A", greenDeep: "#15803D", red: "#DC2626", redDeep: "#B91C1C", paper: "#fff" };

interface Snap { text: string; band: string; support_pct: number | null; stake_line: string }

async function vspBalance(address: string): Promise<number | null> {
  try {
    const r = await fetch(`${API}/token/balance?address=${address}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d?.balance != null ? Number(BigInt(d.balance)) / 1e18 : null;
  } catch { return null; }
}

/** Headroom for the relay fee: the fee cap when the relay publishes one, otherwise a tenth. */
export function defaultStake(balance: number, feeCap: number | null): string {
  const room = feeCap != null && feeCap > 0 && feeCap < balance ? feeCap : balance * 0.1;
  const v = Math.floor((balance - room) * 100) / 100;
  return v > 0 ? v.toFixed(2) : "0";
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function StartOverlay({ postId, side: sideIn, code, onClose }: { postId: number; side: Side | null; code: string | null; onClose: () => void }) {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { openConnectModal } = useConnectModal();
  const { setStake } = useStake();
  const { toast } = useToast();

  const [snap, setSnap] = useState<Snap | null>(null);
  const [peek, setPeek] = useState<InvitePeek | "missing" | null>(code ? null : "missing");
  const [redeemed, setRedeemed] = useState<string | null>(null);   // amount_vsp once the code paid out
  const [codeNote, setCodeNote] = useState<string | null>(null);   // a wrong or used code: said once, then on we go
  const [balance, setBalance] = useState<number | null>(null);
  const [feeCap, setFeeCap] = useState<number | null>(null);
  const [side, setSide] = useState<Side>(sideIn ?? "support");
  const [amount, setAmount] = useState<string>("");
  const [busy, setBusy] = useState<"wallet" | "claim" | "stake" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const amountTouched = useRef(false);
  const seen = useRef(onceTracker());  // patch_fe_funnel: anonymous step counts, each once per sheet

  // the claim, as the share page showed it
  useEffect(() => {
    fetch(`${API}/claims/${postId}/snapshot`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setSnap(d)).catch(() => {});
  }, [postId]);

  // the invitation, if the link carried one
  useEffect(() => {
    if (!code) return;
    let alive = true;
    // patch_fe_start_claim: three tries before concluding anything — a refused or dropped peek used to turn the sheet
    // into the "this wallet holds no VSP" path with the gift still on the table
    (async () => {
      let p: InvitePeek | null = null;
      for (let i = 0; i < 3 && alive; i++) {
        try { p = await peekInvite(code); break; } catch { await new Promise((r) => setTimeout(r, 600 * (i + 1))); }
      }
      if (!alive) return;
      if (!p) { setPeek("missing"); setCodeNote("The invitation in this link could not be checked — you can still take a side, or try the code below."); return; }
      setPeek(p);
      if (p.status !== "open") setCodeNote(`The invitation in this link was already ${p.status} — you can still take a side.`);
    })();
    return () => { alive = false; };
  }, [code]);

  // fee headroom for the default amount
  useEffect(() => {
    fetch(`${API}/relay/fee-policy`).then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (p && p.enabled && typeof p.cap_vsp === "number") setFeeCap(p.cap_vsp); }).catch(() => {});
  }, []);

  // balance: once connected, and polled briefly after a redemption until the transfer lands
  useEffect(() => {
    if (!address) { setBalance(null); return; }
    let stop = false; let tries = 0;
    const tick = async () => {
      const b = await vspBalance(address);
      if (stop) return;
      if (b != null) setBalance(b);
      if (redeemed && (b == null || b <= 0) && tries++ < 15) setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
  }, [address, redeemed]);

  // default stake amount: what the invitation paid, else the balance — minus fee headroom; the reader can edit it
  useEffect(() => {
    if (amountTouched.current || balance == null || balance <= 0) return;
    const base = redeemed ? Math.min(Number(redeemed), balance) : balance;
    setAmount(defaultStake(base, feeCap));
  }, [balance, redeemed, feeCap]);

  const close = () => {
    if (!done) seen.current("start_skip");
    try { window.history.replaceState(null, "", closedStartUrl(window.location.pathname, window.location.search)); } catch { /* fine */ }
    onClose();
  };

  const openPeek = peek !== null && peek !== "missing" && peek.status === "open" ? peek : null;
  const inviteOpen = !!openPeek && !redeemed;
  const stepWallet = !isConnected;
  const checking = !stepWallet && balance == null && !redeemed;  // connected, balance not read yet: stay on step 2
  const stepVsp = !stepWallet && (inviteOpen || checking || (balance != null && balance <= 0 && !redeemed));
  const step = done ? 4 : stepWallet ? 1 : stepVsp ? 2 : 3;
  useEffect(() => { seen.current("start_open"); }, []);
  // patch_fe_start_claim: the invitation is remembered in this browser until it is taken, so a closed sheet, a reload or
  // a bounce out of an in-app browser does not lose it (App shows "You have an invitation waiting" until then)
  useEffect(() => {
    if (!code) return;
    if (peek === "missing" || (peek && peek !== null && peek.status !== "open")) { forgetPendingInvite(); return; }
    rememberPendingInvite({ code, postId, side: sideIn });
  }, [code, peek, postId, sideIn]);
  useEffect(() => {
    if (step >= 2) seen.current("start_wallet");
    if (step >= 3) seen.current("start_funded");
    if (step === 4) seen.current("start_staked");
  }, [step]);

  const connectPasskey = async () => {
    const pk = connectors.find((c) => c.id === PASSKEY_CONNECTOR_ID);
    if (!pk) { openConnectModal?.(); return; }
    setBusy("wallet"); setErr(null);
    try { await connectAsync({ connector: pk }); }
    catch (e: any) { if (!/abort|cancel|denied/i.test(e?.message || "")) setErr(e?.message || "Could not open a passkey wallet."); }
    finally { setBusy(null); }
  };

  const [typedCode, setTypedCode] = useState("");  // patch_fe_start_claim: for a reader whose link lost its code
  const [claimFailed, setClaimFailed] = useState(false);
  const autoTried = useRef<string | null>(null);
  const claim = async (which?: string) => {
    const c = (which ?? code ?? "").trim();
    if (!c || !address) return;
    setBusy("claim"); setErr(null); setClaimFailed(false);
    try {
      const d = await redeemInvite(c, address);
      setRedeemed(d.amount_vsp);
      seen.current("start_claim_ok");
      forgetPendingInvite();
      toast(`${d.amount_vsp} VSP received.`, "success");
    } catch (e: any) {
      setClaimFailed(true);
      seen.current("start_claim_fail");
      setErr(e?.message || "Could not claim the invitation.");
    } finally { setBusy(null); }
  };
  // patch_fe_start_claim: the gift is claimed the moment a wallet is there — no button to understand, nothing to miss.
  // Three readers in a row connected a wallet and left the sheet with the VSP still on the table.
  useEffect(() => {
    if (!inviteOpen || !address || !code || busy) return;
    const key = `${code}:${address}`;
    if (autoTried.current === key) return;
    autoTried.current = key;
    seen.current("start_claim_shown");
    claim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteOpen, address, code]);

  const stake = async () => {
    const v = parseFloat(amount);
    if (!(v > 0)) { setErr("Enter an amount above 0."); return; }
    setBusy("stake"); setErr(null);
    try {
      await setStake(postId, side === "support" ? v : -v);
      setDone(true);
      toast(`${v.toFixed(2)} VSP staked to ${side} claim #${postId}.`, "success");
    } catch (e: any) {
      setErr((e?.message || "Stake failed").slice(0, 160));
    } finally { setBusy(null); }
  };

  const btn: React.CSSProperties = { padding: "12px 16px", borderRadius: 999, border: `1px solid ${P.line}`, background: P.paper, color: P.violetDeep, font: "600 15px system-ui, sans-serif", cursor: "pointer" };
  const primary: React.CSSProperties = { ...btn, background: P.violet, borderColor: P.violet, color: "#fff" };
  const sideBtn = (s: Side): React.CSSProperties => ({
    flex: 1, padding: "12px 10px", borderRadius: 12, font: "600 15px system-ui, sans-serif", cursor: "pointer",
    border: `2px solid ${s === "support" ? P.green : P.red}`,
    background: side === s ? (s === "support" ? P.green : P.red) : P.paper,
    color: side === s ? "#fff" : s === "support" ? P.greenDeep : P.redDeep, opacity: side === s ? 1 : 0.7,
  });
  const h = (n: number, title: string, state: "done" | "now" | "later") => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 6px", color: state === "later" ? P.faint : P.ink }}>
      <span style={{ width: 24, height: 24, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
        background: state === "done" ? P.green : state === "now" ? P.violet : P.tint, color: state === "later" ? P.faint : "#fff" }}>{state === "done" ? "✓" : n}</span>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
    </div>
  );
  const pct = snap?.support_pct;

  return (
    <div data-testid="start-overlay" role="dialog" aria-modal="true" aria-label="Take a side on Verisphere"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(28,21,51,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0 }}>
      <div style={{ width: "100%", maxWidth: 520, maxHeight: "92dvh", overflowY: "auto", background: "#F7F5FE", borderRadius: "18px 18px 0 0", padding: "16px 18px 24px", boxShadow: "0 -8px 40px rgba(0,0,0,0.25)", color: P.ink, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: P.violet }}>VERISPHERE · TAKE A SIDE</span>
          <button type="button" data-testid="start-close" onClick={close} aria-label="Close" style={{ border: "none", background: "none", fontSize: 22, lineHeight: 1, color: P.faint, cursor: "pointer" }}>×</button>
        </div>

        {snap ? (
          <div style={{ marginTop: 10, padding: "10px 12px", background: P.paper, border: `1px solid ${P.line}`, borderRadius: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>“{snap.text}”</div>
            <div style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>{snap.band} · {snap.stake_line}</div>
          </div>
        ) : <div style={{ marginTop: 10, fontSize: 13, color: P.faint }}>Claim #{postId}</div>}

        {codeNote && <div data-testid="start-code-note" style={{ marginTop: 10, padding: "8px 12px", background: P.tint, border: `1px solid ${P.line}`, borderRadius: 10, fontSize: 13, color: P.violetDeep }}>{codeNote}</div>}

        {/* 1 · wallet */}
        {h(1, "Open a wallet", step > 1 ? "done" : "now")}
        {step === 1 ? (
          <div data-testid="start-step-wallet">
            {inAppBrowser() && (
              <div data-testid="start-inapp" style={{ margin: "0 0 10px", padding: "8px 12px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, fontSize: 13, color: "#9A3412", lineHeight: 1.45 }}>
                This page opened inside an app's own browser, where passkeys often fail. Open it in your phone's browser instead:
                <button type="button" data-testid="start-copy-link" style={{ ...btn, padding: "6px 10px", marginLeft: 8, fontSize: 13 }} onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); toast("Link copied — paste it into Safari or Chrome.", "success"); } catch { /* fine */ } }}>Copy this link</button>
              </div>
            )}
            <p style={{ margin: "0 0 10px", fontSize: 14, color: P.muted, lineHeight: 1.45 }}>A passkey wallet lives behind your device's own lock (face, fingerprint or PIN): no app to install, no phrase to write down.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" data-testid="start-passkey" style={primary} disabled={busy === "wallet"} onClick={connectPasskey}>{busy === "wallet" ? "Opening…" : "Create a passkey wallet"}</button>
              <button type="button" data-testid="start-other-wallet" style={btn} onClick={() => openConnectModal?.()}>I have a wallet</button>
            </div>
          </div>
        ) : address ? <div style={{ fontSize: 13, color: P.muted, marginLeft: 34 }}>{short(address)}</div> : null}

        {/* 2 · VSP — patch_fe_start_claim: plain words; the gift claims itself; a code field for a link that lost its code */}
        {h(2, openPeek ? `Your ${openPeek.amount_vsp} VSP` : redeemed ? `Your ${redeemed} VSP` : "VSP to stake", step > 2 ? "done" : step === 2 ? "now" : "later")}
        {step === 2 && inviteOpen && openPeek && (
          <div data-testid="start-step-claim" style={{ marginLeft: 34 }}>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: P.muted, lineHeight: 1.45 }}><b style={{ color: P.ink }}>Whoever shared this put {openPeek.amount_vsp} VSP on the table for you</b>, so you can take a side without buying anything.</p>
            {claimFailed
              ? <button type="button" data-testid="start-claim" style={primary} disabled={busy === "claim"} onClick={() => claim()}>{busy === "claim" ? "Trying again…" : `Try again — take the ${openPeek.amount_vsp} VSP`}</button>
              : <div data-testid="start-claiming" style={{ fontSize: 14, color: P.violetDeep, fontWeight: 600 }}>Moving {openPeek.amount_vsp} VSP into your wallet…</div>}
          </div>
        )}
        {step === 2 && !inviteOpen && checking && <div data-testid="start-checking" style={{ marginLeft: 34, fontSize: 13, color: P.faint }}>Checking your wallet…</div>}
        {step === 2 && !inviteOpen && !checking && (
          <div data-testid="start-step-fund" style={{ marginLeft: 34 }}>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: P.muted, lineHeight: 1.45 }}>This wallet holds no VSP yet. If whoever shared this claim gave you an invitation code, enter it here; otherwise the market panel sells VSP for AVAX, and paying by card is coming.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <input data-testid="start-code-input" value={typedCode} onChange={(e) => setTypedCode(e.target.value.toUpperCase())} placeholder="VSP-XXXX-XXXX-XXXX" spellCheck={false} autoCapitalize="characters"
                style={{ width: 190, padding: "10px 10px", fontSize: 15, fontWeight: 600, border: `1px solid ${P.line}`, borderRadius: 10, letterSpacing: 0.5 }} />
              <button type="button" data-testid="start-code-claim" style={primary} disabled={busy === "claim" || typedCode.trim().length < 8} onClick={() => claim(typedCode)}>{busy === "claim" ? "Claiming…" : "Take the VSP"}</button>
            </div>
            <button type="button" data-testid="start-recheck" style={btn} onClick={async () => { if (address) { const b = await vspBalance(address); if (b != null) setBalance(b); } }}>I have VSP now</button>
          </div>
        )}
        {step > 2 && (
          <div style={{ fontSize: 13, color: P.muted, marginLeft: 34 }}>
            {redeemed ? `${redeemed} VSP received` : balance != null ? `${balance.toFixed(2)} VSP in your wallet` : ""}
            {redeemed && balance != null && balance <= 0 && <span data-testid="start-landing"> · waiting for the transfer to land…</span>}
          </div>
        )}

        {/* 3 · the stake */}
        {h(3, "Back your side", step === 4 ? "done" : step === 3 ? "now" : "later")}
        {step === 3 && (
          <div data-testid="start-step-stake" style={{ marginLeft: 34 }}>
            {pct != null && <p style={{ margin: "0 0 6px", fontSize: 13, color: P.muted }}>Right now {pct} % of the stake backs this claim and {100 - pct} % challenges it.</p>}
            <p data-testid="start-rule" style={{ margin: "0 0 12px", fontSize: 14, color: P.ink, lineHeight: 1.45 }}>{THE_RULE}</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button type="button" data-testid="start-side-support" style={sideBtn("support")} onClick={() => setSide("support")}>Support</button>
              <button type="button" data-testid="start-side-challenge" style={sideBtn("challenge")} onClick={() => setSide("challenge")}>Challenge</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input data-testid="start-amount" type="number" inputMode="decimal" min="0" step="0.1" value={amount} onChange={(e) => { amountTouched.current = true; setAmount(e.target.value); }}
                style={{ width: 90, padding: "10px 10px", fontSize: 16, fontWeight: 600, border: `1px solid ${P.line}`, borderRadius: 10, textAlign: "right" }} />
              <span style={{ fontSize: 14, color: P.muted }}>VSP{balance != null ? ` · ${balance.toFixed(2)} available` : ""}</span>
            </div>
            <button type="button" data-testid="start-stake" style={{ ...primary, marginTop: 12, background: side === "support" ? P.green : P.red, borderColor: side === "support" ? P.green : P.red }}
              disabled={busy === "stake" || (redeemed != null && balance != null && balance <= 0)} onClick={stake}>
              {busy === "stake" ? "Signing…" : `Stake ${amount || "0"} VSP to ${side} it`}
            </button>
            <p style={{ margin: "10px 0 0", fontSize: 12, color: P.faint, lineHeight: 1.45 }}>One signature with your wallet; the relay pays the gas and takes a small VSP fee, shown before you confirm. {RULE_FINE_PRINT}</p>
          </div>
        )}
        {step === 4 && (
          <div data-testid="start-done" style={{ marginLeft: 34 }}>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: P.ink, lineHeight: 1.45 }}>You're in: <b>{amount} VSP {side === "support" ? "supporting" : "challenging"}</b> this claim. The score moves as others stake; positions are updated once a day.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" data-testid="start-see-claim" style={primary} onClick={close}>See the claim</button>
              <InstallExtension where="start" />
            </div>
          </div>
        )}

        {err && <div data-testid="start-error" style={{ marginTop: 12, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: P.redDeep, wordBreak: "break-word" }}>{err}</div>}

        {step < 4 && (
          <div style={{ marginTop: 18, textAlign: "center" }}>
            <button type="button" data-testid="start-skip" onClick={close} style={{ border: "none", background: "none", color: P.faint, fontSize: 13, textDecoration: "underline", cursor: "pointer" }}>No thanks — just show me the claim</button>
          </div>
        )}
      </div>
    </div>
  );
}
