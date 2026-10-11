// frontend/src/components/WalletPromptBar.tsx — patch_fe_gas_fee
// A persistent bar while a wallet signature request is open.
//
// The protocol hooks route every wallet request through walletPrompt(), which
// dispatches verisphere:wallet-prompt {state, label, index, count, error}.
// MetaMask's window can open unfocused, drop behind the browser, or (when an
// earlier request was never answered) not open at all — only the badge on the
// extension icon changes. A toast fades in four seconds; this bar stays until
// the request resolves, and after 15 s tells the user where to look.
import { useEffect, useState } from "react";
import type { WalletPromptDetail } from "@verisphere/protocol";

const HINT_AFTER_MS = 15_000;

export default function WalletPromptBar() {
  const [open, setOpen] = useState<WalletPromptDetail | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<WalletPromptDetail>).detail;
      if (!d) return;
      if (d.state === "open") { setOpen(d); setHint(false); }
      else setOpen(null);
    };
    window.addEventListener("verisphere:wallet-prompt", handler);
    return () => window.removeEventListener("verisphere:wallet-prompt", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setHint(true), HINT_AFTER_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="wallet-prompt-bar"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 10000,
        background: "#1f2937", color: "#fff", padding: "10px 16px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        fontSize: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}
    >
      <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%",
        background: "#f59e0b", boxShadow: "0 0 0 4px rgba(245,158,11,0.3)" }} />
      <span>
        <b>Signature request waiting in your wallet</b>
        {open.count > 1 && <span style={{ opacity: 0.8 }}> — {open.index} of {open.count}</span>}
        <span style={{ opacity: 0.85 }}>: {open.label}</span>
      </span>
      {hint && (
        <span style={{ opacity: 0.85, fontSize: 13 }}>
          Don't see it? Click the MetaMask icon in your browser toolbar — the request is queued there.
        </span>
      )}
    </div>
  );
}
