// frontend/src/components/AddVspToWallet.tsx — patch_fe_add_vsp_wallet
// A small "add VSP to wallet" control next to the header balance: one wallet prompt, then it disappears for
// this browser. Hidden when the wallet has already listed VSP (per-browser flag) or no wallet client is up.
import { useEffect, useState } from "react";
import { useWalletClient } from "wagmi";
import { addVspToWallet, watchAssetDone } from "../web3/watchAsset";

export default function AddVspToWallet({ token }: { token?: `0x${string}` }) {
  const { data: walletClient } = useWalletClient();
  // patch_fe_add_vsp_wallet_2: the token address arrives asynchronously (useContracts), so the per-browser flag must be
  // re-read when it changes — reading it once in the useState initializer saw `undefined` and showed the button on
  // every page load even after a successful add.
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(token ? watchAssetDone(token) : false);
  }, [token]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!token || !walletClient || done) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        data-testid="add-vsp-to-wallet"
        title="Show VSP by name and icon in your wallet (one prompt)"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setNote(null);
          const ok = await addVspToWallet(walletClient, token, window.location.origin);
          setBusy(false);
          if (ok) setDone(true);
          else setNote("not added — your wallet declined or does not support adding tokens; import VSP manually with the address on the Fees page");
        }}
        style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 999, padding: "2px 8px",
                 fontSize: 11, color: "#4f46e5", cursor: busy ? "default" : "pointer", whiteSpace: "nowrap" }}
      >
        {busy ? "check your wallet…" : "+ add VSP to wallet"}
      </button>
      {note && <span style={{ fontSize: 11, color: "#b45309", maxWidth: 260 }}>{note}</span>}
    </span>
  );
}
