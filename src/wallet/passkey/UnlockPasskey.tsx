// frontend/src/wallet/passkey/UnlockPasskey.tsx — patch_fe_passkey_wallet
// The header chip for a passkey wallet: "Unlock" while the key is not in memory (after a page load), a quiet
// "passkey" badge once it is. Clicking is a user gesture, which is what Safari needs for the WebAuthn prompt.
import { useState } from "react";
import { useAccount } from "wagmi";
import { PASSKEY_CONNECTOR_ID, unlockPasskey } from "./connector";
import { PasskeyError } from "./keys";
import { usePasskeyState } from "./state";

const KeyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" aria-hidden="true">
    <circle cx="19" cy="24" r="8" /><path d="M27 24h14M35 24v7M41 24v5" />
  </svg>
);

export default function UnlockPasskey() {
  const { connector, isConnected } = useAccount();
  const st = usePasskeyState();
  const [busy, setBusy] = useState(false);
  if (!isConnected || connector?.id !== PASSKEY_CONNECTOR_ID) return null;

  const toast = (message: string, type: "error" | "info" | "success" = "info") =>
    window.dispatchEvent(new CustomEvent("verisphere:toast", { detail: { message, type } }));

  if (st.unlocked) {
    return (
      <span className="badge" title="Passkey wallet — the key is held for this browser session" data-testid="passkey-unlocked"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#5B4BC4" }}><KeyIcon /> passkey</span>
    );
  }
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
        border: "1px solid #5B4BC4", background: "#fff", color: "#5B4BC4", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
    ><KeyIcon /> {busy ? "Unlocking…" : "Unlock"}</button>
  );
}
