// frontend/src/components/TradeModal.tsx
import { fireToast, friendlyError } from "../utils/errorMessages";
import { useState, useEffect } from "react";
import { useAccount, useBalance, useWalletClient } from "wagmi";

type MMQuote = {
  mid_price_usd: number;
  buy_price_usd: number;
  sell_price_usd: number;
  floor_price_usd: number;
};

type FillPreview = {
  side?: string;
  mode?: string;
  qty_vsp: number;
  total_usdc?: number;
  subtotal_usdc?: number;
  gross_usdc?: number;
  net_usdc?: number;
  fee_vsp?: number;
  fee_usdc?: number;
  avg_price?: number;
  avg_price_usd?: number;
  breakdown?: string;
} | null;

// EIP-2612 permit domain & types for signing
const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export default function TradeModal({
  side,
  quote,
  walletAddress,
  usdcAddress,
  vspAddress,
  onClose,
  refetchBalances,
}: {
  side: "buy" | "sell";
  quote: MMQuote;
  walletAddress: string;
  usdcAddress: `0x${string}`;
  vspAddress: `0x${string}`;
  onClose: () => void;
  refetchBalances: () => void;
}) {
  const { chain, isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [denom, setDenom] = useState<"vsp" | "usdc">("vsp");
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FillPreview>(null);
  const [status, setStatus] = useState<string | null>(null);

  const MM_ADDRESS = import.meta.env.VITE_MM_ADDRESS as
    | `0x${string}`
    | undefined;

  const numeric = Number(amount) || 0;
  const spotPrice = side === "buy" ? quote.buy_price_usd : quote.sell_price_usd;

  if (!isConnected)
    return <div className="modal error">Wallet not connected</div>;
  if (!address) return <div className="modal error">No wallet address</div>;
  if (!MM_ADDRESS)
    return <div className="modal error">Missing MM_ADDRESS in .env</div>;

  if (chain?.id !== 43113) {
    return (
      <div className="modal error">
        <h3>Wrong Network</h3>
        <p>Please switch to Avalanche Fuji Testnet (chain ID 43113)</p>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  // USDC balance (for buy)
  const { data: usdcBalanceData, refetch: refetchUsdc } = useBalance({
    address,
    token: usdcAddress,
    query: { enabled: Boolean(address && usdcAddress) },
  });
  const usdcBalance = usdcBalanceData ? Number(usdcBalanceData.formatted) : 0;

  // VSP balance (for sell)
  const { data: vspBalanceData, refetch: refetchVsp } = useBalance({
    address,
    token: vspAddress,
    query: { enabled: Boolean(address && vspAddress) },
  });
  const vspBalance = vspBalanceData ? Number(vspBalanceData.formatted) : 0;

  // Clear preview when amount changes
  useEffect(() => {
    setPreview(null);
    setError(null);
    setStatus(null);
  }, [amount, side, denom]);

  async function handlePreview() {
    if (numeric <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    try {
      setPreviewing(true);
      setError(null);
      let url: string;
      if (side === "buy") {
        url = denom === "vsp"
          ? `/api/mm/preview-buy?qty_vsp=${numeric}`
          : `/api/mm/preview-buy?usdc_amount=${numeric}`;
      } else {
        url = `/api/mm/preview-sell?qty_vsp=${denom === "vsp" ? numeric : numeric / spotPrice}`;
      }
      const res = await fetch(url);
      if (!res.ok)
        throw new Error((await res.text()) || `Preview failed (${res.status})`);
      setPreview(await res.json());
    } catch (err: any) {
      setError(err.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (numeric <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (!preview) {
      setError("Please preview the fill first");
      return;
    }
    if (!walletClient) {
      setError("Wallet not available");
      return;
    }

    if (side === "buy" && usdcBalance < preview.total_usdc) {
      setError("Insufficient USDC balance");
      return;
    }
    if (side === "sell" && vspBalance < numeric) {
      setError("Insufficient VSP balance");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ── Step 1: Sign EIP-2612 permit ──
      const tokenAddress = side === "buy" ? usdcAddress : vspAddress;
      const tokenName = side === "buy" ? "USD Coin" : "VeriSphere";
      const tokenVersion = side === "buy" ? "2" : "1";
      const tokenKey = side === "buy" ? "usdc" : "vsp";

      // Calculate permit value with buffer
      let permitValue: bigint;
      if (side === "buy") {
        // USDC: 6 decimals, add 5% buffer using integer math
        const usdcCents = Math.ceil(preview.total_usdc * 1_000_000 * 1.05);
        permitValue = BigInt(Math.round(usdcCents));
      } else {
        // VSP: 18 decimals, add 5% buffer using string conversion
        // Avoid Number * 1e18 which loses precision for large amounts
        const vspWhole = Math.floor(numeric * 1.05);
        const vspFrac = Math.round((numeric * 1.05 - vspWhole) * 1e18);
        permitValue = BigInt(vspWhole) * BigInt("1000000000000000000") + BigInt(vspFrac);
      }

      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      setStatus("Fetching permit nonce…");

      // Get nonce from backend
      const nonceRes = await fetch(
        `/api/mm/permit-nonce/${tokenKey}/${address}`,
      );
      if (!nonceRes.ok) throw new Error("Failed to fetch permit nonce");
      const { nonce } = await nonceRes.json();

      setStatus("Please sign the permit in your wallet…");

      // Build EIP-712 domain
      const domain = {
        name: tokenName,
        version: tokenVersion,
        chainId: chain!.id,
        verifyingContract: tokenAddress,
      };

      // Sign the permit
      const signature = await walletClient.signTypedData({
        domain,
        types: PERMIT_TYPES,
        primaryType: "Permit",
        message: {
          owner: address,
          spender: MM_ADDRESS,
          value: permitValue,
          nonce: BigInt(nonce),
          deadline: BigInt(deadline),
        },
      });

      // Split signature into v, r, s
      const r = "0x" + signature.slice(2, 66);
      const s = "0x" + signature.slice(66, 130);
      const v = parseInt(signature.slice(130, 132), 16);

      // ── Step 2: Send trade request with permit ──
      setStatus("Executing trade…");

      // patch_g34_fe_buy_allin_sell_net: buy cap is all-in (gross+fee) with a
      // 1% slippage buffer; sell floor is on NET proceeds (what the user
      // receives, == the "you receive" figure) with a 1% buffer. The two
      // endpoints now take differently-named fields: buy max_total_usdc, sell
      // min_total_usdc.
      let tradeLimit: Record<string, number>;
      if (side === "buy") {
        const allInUsdc = preview.total_usdc ?? 0;
        tradeLimit = { max_total_usdc: allInUsdc * 1.01 };
      } else {
        const netUsdc = preview.net_usdc ?? 0;
        tradeLimit = { min_total_usdc: netUsdc * 0.99 };
      }

      const endpoint = side === "buy" ? "/api/mm/buy" : "/api/mm/sell";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_address: walletAddress,
          qty_vsp: preview.qty_vsp,
          ...tradeLimit,
          permit: {
            deadline,
            v,
            r,
            s,
            value: permitValue.toString(),
          },
        }),
      });

      if (!res.ok)
        throw new Error((await res.text()) || `Trade failed (${res.status})`);

      const result = await res.json();
      setStatus(null);

      alert(
        `${side === "buy" ? "Bought" : "Sold"} ${result.qty_vsp} VSP ` +
          `for ${result.total_usdc.toFixed(2)} USDC ` +
          `(avg ${result.avg_price_usd.toFixed(4)}/VSP)`,
      );

      refetchBalances();
      refetchUsdc();
      refetchVsp();
      window.dispatchEvent(new Event("verisphere:data-changed"));
      onClose();
    } catch (err: any) {
      setStatus(null);
      // User rejected signature
      if (
        err.message?.includes("rejected") ||
        err.message?.includes("denied")
      ) {
        setError("Signature rejected");
      } else {
        setError(err.message || "Transaction failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMax() {
    if (side === "buy") {
      if (denom === "usdc") {
        setAmount(usdcBalance.toFixed(2));
      } else {
        // patch_bundle09_p3_preview_buy_convergence: floor-round qty_vsp to 4dp so the displayed value can never
        // exceed the qty the backend converged to. Combined with the backend's
        // one-sided convergence (must be <= budget_truncated), this guarantees
        // the FE's confirm-time `usdcBalance < preview.total_usdc` check passes.
        // On backend error, surface the error and clear the input rather than
        // falling back to a spot-price estimate that may itself trip insufficiency.
        try {
          const res = await fetch(`/api/mm/preview-buy?usdc_amount=${(Math.floor(usdcBalance * 100) / 100).toFixed(2)}`);
          if (res.ok) {
            const data = await res.json();
            const flooredQty = Math.floor(data.qty_vsp * 1e4) / 1e4;
            setAmount(flooredQty.toFixed(4));
          } else {
            const errText = await res.text().catch(() => "");
            setAmount("");
            setError(errText || `Could not estimate max VSP (HTTP ${res.status})`);
          }
        } catch (e: any) {
          setAmount("");
          setError(e?.message || "Could not reach backend to estimate max VSP");
        }
      }
    } else {
      if (denom === "vsp") {
        setAmount((vspBalance * 0.9999).toFixed(4));
      } else {
        setAmount((vspBalance * 0.9999 * spotPrice).toFixed(2));
      }
    }
  }

  return (
    <div className="trade-modal-overlay" onClick={onClose}>
      <div className="trade-modal-content" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>
            {side === "buy" ? "Buy VSP" : "Sell VSP"}
          </h3>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
          Connected chain: {chain?.name || "Unknown"} (ID: {chain?.id || "—"})
        </div>

        <div style={{ marginBottom: 12, fontSize: 13 }}>
          {side === "buy" ? "Your USDC balance" : "Your VSP balance"}:{" "}
          <strong>
            {side === "buy" ? usdcBalance.toFixed(2) : vspBalance.toFixed(4)}
          </strong>
        </div>

        <div style={{ marginBottom: 4, fontSize: 12, color: "#9ca3af" }}>
          Liquidation floor: ${quote.floor_price_usd.toFixed(4)}
        </div>

        {/* Amount input with denomination toggle */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={denom === "vsp" ? "Amount in VSP" : "Amount in USDC"}
              className="input"
              style={{ flex: 1 }}
            />
            <button
              className="btn"
              onClick={() => {
                setDenom(denom === "vsp" ? "usdc" : "vsp");
                setAmount("");
                setPreview(null);
              }}
              style={{ fontSize: 11, padding: "4px 8px", minWidth: 50, fontWeight: 600 }}
              title="Switch between VSP and USDC"
            >
              {denom === "vsp" ? "VSP" : "USDC"} ⇄
            </button>
            <button
              className="btn"
              onClick={handleMax}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              Max
            </button>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            {denom === "vsp"
              ? `≈ ${(numeric * spotPrice).toFixed(2)} USDC at current price`
              : `≈ ${(numeric / spotPrice).toFixed(4)} VSP at current price`}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div style={{ padding: "8px 12px", marginBottom: 8, background: "#fef2f2",
            border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Preview breakdown */}
        {preview && (
          <div style={{ padding: "10px 12px", marginBottom: 8, background: "#f9fafb",
            borderRadius: 6, fontSize: 12, lineHeight: 1.8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>You {side === "buy" ? "receive" : "send"}:</span>
              <strong>{preview.qty_vsp.toFixed(4)} VSP</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{side === "buy" ? "Subtotal:" : "Gross proceeds:"}</span>
              <span>{(preview.gross_usdc ?? preview.subtotal_usdc ?? (preview.total_usdc - (preview.fee_usdc || 0))).toFixed(2)} USDC</span>
            </div>
            {preview.fee_usdc > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280" }}>
                <span>Platform fee:</span>
                <span>{preview.fee_usdc.toFixed(2)} USDC ({preview.fee_vsp?.toFixed(4) || "—"} VSP)</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600,
              borderTop: "1px solid #e5e7eb", marginTop: 4, paddingTop: 4 }}>
              <span>{side === "buy" ? "Total cost:" : "You receive:"}</span>
              <span>{(side === "buy" ? preview.total_usdc : (preview.net_usdc ?? preview.total_usdc)).toFixed(2)} USDC</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", fontSize: 11 }}>
              <span>Avg price:</span>
              <span>${preview.avg_price?.toFixed(4) ?? ((side === "buy" ? preview.total_usdc : preview.net_usdc ?? preview.total_usdc) / preview.qty_vsp).toFixed(4)}/VSP</span>
            </div>
          </div>
        )}

        {/* Single action button — transitions through states */}
        {!preview ? (
          <button
            className="btn btn-primary"
            onClick={handlePreview}
            disabled={previewing || numeric <= 0}
            style={{ width: "100%", marginBottom: 8 }}
          >
            {previewing ? "Calculating…" : "Preview Fill"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => { setPreview(null); setError(null); }} style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading
                ? "Processing…"
                : `${side === "buy" ? "Buy" : "Sell"} ${preview.qty_vsp.toFixed(4)} VSP`}
            </button>
          </div>
        )}

        {/* Gasless note */}
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: "#9ca3af",
            textAlign: "center",
          }}
        >
          No gas required — you only sign a permit message.
        </div>
      </div>
    </div>
  );
}
