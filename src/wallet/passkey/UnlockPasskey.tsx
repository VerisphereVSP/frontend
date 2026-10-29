// frontend/src/wallet/passkey/UnlockPasskey.tsx — patch_fe_passkey_wallet / patch_fe_passkey_3b
// The header chip for a passkey wallet. Locked (after a page load): "Unlock" — a click is the user gesture Safari
// needs for the WebAuthn prompt. Unlocked: a "passkey" badge that opens the wallet panel: address (copy), AVAX for gas,
// the recovery key ("Move to MetaMask" — a fresh biometric prompt, shown once), Lock now, and Start over.
import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { PASSKEY_CONNECTOR_ID, exportPrivateKey, forgetPasskeyWallet, unlockPasskey } from "./connector";
import { PasskeyError } from "./keys";
import { lock, usePasskeyState } from "./state";

const KeyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" aria-hidden="true">
    <circle cx="19" cy="24" r="8" /><path d="M27 24h14M35 24v7M41 24v5" />
  </svg>
);

const toast = (message: string, type: "error" | "info" | "success" = "info") =>
  window.dispatchEvent(new CustomEvent("verisphere:toast", { detail: { message, type } }));

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

const VIOLET = "#5B4BC4";
const btn: React.CSSProperties = { height: 30, padding: "0 10px", borderRadius: 7, border: "1px solid #D9D4F0", background: "#fff", color: "#1C1533", fontSize: 12, fontWeight: 600, cursor: "pointer" };

export default function UnlockPasskey() {
  const { connector, isConnected, address } = useAccount();
  const st = usePasskeyState();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!isConnected || connector?.id !== PASSKEY_CONNECTOR_ID) return null;

  if (!st.unlocked) {
    return (
      <button type="button" data-testid="passkey-unlock" disabled={busy}
        title="Your passkey wallet is locked until you confirm with Face ID, fingerprint or Windows Hello"
        onClick={async () => {
          setBusy(true);
          try {
            await unlockPasskey();
            toast("Passkey wallet unlocked for this session.", "success");
          } catch (e: any) {
            if (e instanceof PasskeyError && e.code === "cancelled") toast("Unlock cancelled.", "info");
            else toast(e?.message || "Could not unlock the passkey wallet.", "error");
          } finally { setBusy(false); }
        }}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 999,
          border: `1px solid ${VIOLET}`, background: "#fff", color: VIOLET, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      ><KeyIcon /> {busy ? "Unlocking…" : "Unlock"}</button>
    );
  }

  return (
    <span ref={boxRef} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="badge" data-testid="passkey-unlocked" onClick={() => setOpen((o) => !o)}
        title="Passkey wallet — the key is held for this browser session. Click for the wallet panel."
        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: VIOLET, cursor: "pointer", border: open ? `1px solid ${VIOLET}` : undefined }}
      ><KeyIcon /> passkey ▾</button>
      {open && address && <PasskeyPanel address={address} onClose={() => setOpen(false)} />}
    </span>
  );
}

function PasskeyPanel({ address, onClose }: { address: `0x${string}`; onClose: () => void }) {
  const { data: avax } = useBalance({ address });
  const { disconnect } = useDisconnect();
  const [secret, setSecret] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);       // the recovery key was shown at least once this panel session
  const [confirmForget, setConfirmForget] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 2200); };
  const avaxNum = avax ? Number(avax.formatted) : null;

  return (
    <div role="dialog" aria-label="Passkey wallet" data-testid="passkey-panel"
      style={{ position: "absolute", right: 0, top: 30, zIndex: 30, width: 320, maxWidth: "calc(100vw - 24px)", background: "#fff", border: "1px solid #D9D4F0",
        borderRadius: 10, boxShadow: "0 10px 30px -12px rgba(28,21,51,.35)", padding: 12, display: "flex", flexDirection: "column", gap: 10, fontSize: 12, color: "#1C1533", textAlign: "left" }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Passkey wallet</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <code data-testid="passkey-address" style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#5D5776" }}>{address}</code>
        <button type="button" style={btn} onClick={async () => flash((await copy(address)) ? "Address copied" : "Could not copy")}>Copy</button>
      </div>
      <div style={{ color: "#5D5776" }}>
        Gas: <b>{avaxNum == null ? "…" : `${avaxNum.toFixed(4)} AVAX`}</b>
        {avaxNum === 0 && <span data-testid="passkey-gas-hint"> — staking is gasless; buying or selling VSP needs a little AVAX at this address.</span>}
      </div>

      <div style={{ borderTop: "1px solid #EEEBF8", paddingTop: 10 }}>
        <div style={{ fontWeight: 600 }}>Recovery key · Move to MetaMask</div>
        <div style={{ color: "#5D5776", margin: "4px 0 8px" }}>
          Your passkey is backed up by your phone or password manager. This key is the other way back: it opens the same address in MetaMask
          (<i>Add account → Import account</i>) or any wallet, with every stake and position where it is. Anyone who has it controls the wallet.
        </div>
        {secret ? (
          <div data-testid="passkey-secret-box" style={{ background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 8, padding: 8 }}>
            <code data-testid="passkey-secret" style={{ display: "block", fontSize: 10.5, wordBreak: "break-all", color: "#7C2D12" }}>{secret}</code>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button type="button" style={btn} onClick={async () => flash((await copy(secret)) ? "Key copied — paste it into MetaMask, then clear your clipboard" : "Could not copy")}>Copy key</button>
              <button type="button" style={btn} onClick={() => setSecret(null)}>Hide</button>
            </div>
          </div>
        ) : (
          <button type="button" data-testid="passkey-export" style={{ ...btn, borderColor: VIOLET, color: VIOLET }}
            onClick={async () => {
              try {
                const { privateKey } = await exportPrivateKey();
                setSecret(privateKey); setSeen(true);
              } catch (e: any) {
                if (e instanceof PasskeyError && e.code === "cancelled") flash("Cancelled.");
                else flash(e?.message || "Could not derive the key.");
              }
            }}
          >Show recovery key</button>
        )}
      </div>

      <div style={{ borderTop: "1px solid #EEEBF8", paddingTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" data-testid="passkey-lock" style={btn} onClick={() => { lock(); onClose(); toast("Passkey wallet locked.", "info"); }}>Lock now</button>
        {!confirmForget ? (
          <button type="button" data-testid="passkey-forget" style={{ ...btn, color: "#B91C1C", borderColor: "#FECACA" }} onClick={() => setConfirmForget(true)}>Start over…</button>
        ) : (
          <div data-testid="passkey-forget-confirm" style={{ width: "100%", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: 8, color: "#7F1D1D" }}>
            This forgets the wallet in this browser. The passkey stays on your device, but the app cannot reach this address again without it being
            set up anew — {seen ? "you have the recovery key; keep it." : <b>show and save the recovery key first</b>}.
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button type="button" data-testid="passkey-forget-go" style={{ ...btn, background: "#B91C1C", color: "#fff", borderColor: "#B91C1C" }} disabled={!seen}
                onClick={() => { forgetPasskeyWallet(); disconnect(); onClose(); toast("Passkey wallet forgotten in this browser.", "info"); }}>Forget it</button>
              <button type="button" style={btn} onClick={() => setConfirmForget(false)}>Keep it</button>
            </div>
          </div>
        )}
      </div>
      {note && <div data-testid="passkey-note" style={{ color: "#15803D", fontWeight: 600 }}>{note}</div>}
    </div>
  );
}
