// frontend/src/components/PoolMarketWidget.tsx — patch_trackb_fe_swap
// Public-AMM era trade surface: pool price + a Swap link supplied by the
// backend (swap_url). Replaces the MM buy/sell surface once the pool is live.
import { useEffect, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useContracts } from "../contracts";
import { probePool, PoolState } from "../api/pool";
import PoolTradeModal from "./PoolTradeModal";

const REFRESH_MS = 30_000;

export default function PoolMarketWidget({ initial }: { initial: PoolState | null }) {
  const [state, setState] = useState<PoolState | null>(initial);
  const [unavailable, setUnavailable] = useState(initial === null);
  const [side, setSide] = useState<"buy" | "sell" | null>(null);
  const { address, isConnected } = useAccount();
  const { data: contracts } = useContracts();
  // patch_venue r6 (founder direction): header carries only what every
  // visitor needs — price, identity, VSP balance. AVAX (a swap-time gas
  // concern) moved into the trade modal; pool metrics behind the "pool" link.
  const [showPool, setShowPool] = useState(false);
  const { data: vspBal, refetch: refetchVsp } = useBalance({
    address,
    token: contracts?.VSPToken,
    query: {
      enabled: Boolean(isConnected && address && contracts?.VSPToken),
      refetchInterval: 5000,
    },
  });
  const fmtBal = (v?: string, dp = 2) =>
    v === undefined ? "…" : Number(v).toLocaleString(undefined, { maximumFractionDigits: dp });
  const refreshNow = async () => {
    const probe = await probePool();
    if (probe.kind === "pool") { setState(probe.state); setUnavailable(false); }
    refetchVsp();  // r5: swap just settled — reflect the new VSP balance now
  };

  useEffect(() => {
    const t = setInterval(async () => {
      const probe = await probePool();
      if (probe.kind === "pool") {
        setState(probe.state);
        setUnavailable(false);
      } else if (probe.kind === "pool-unavailable") {
        // keep last known price on screen, mark it stale — never render a
        // stale price as fresh, never fall back to the MM surface
        setUnavailable(true);
      }
      // probe.kind === "mm" mid-session would mean the backend un-configured
      // the pool; keep the pool surface (page reload re-routes via MarketWidget)
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const price = state?.price_usdc_per_vsp;
  const swapUrl = state?.swap_url;

  return (
    <div className="vsp-market-widget" data-trackb="pool-market">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* patch_venue r7 order (founder direction): pill · VSP balance
            (price-styled) · Buy/Sell · price ($n.nnnn/VSP, pool-link-sized)
            · pool. r4 note stands: the pill is the app's only connect control. */}
        <ConnectButton showBalance={false} />
        {isConnected && (
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {fmtBal(vspBal?.formatted)} VSP
          </span>
        )}
        {state?.pair ? (
          <>
            {isConnected && (
            <>
            <button
              className="btn btn-primary vsp-button"
              disabled={unavailable}
              onClick={() => setSide("buy")}
            >
              Buy
            </button>
            <button
              className="btn vsp-button"
              disabled={unavailable}
              onClick={() => setSide("sell")}
            >
              Sell
            </button>
            </>
            )}
            <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
              {price !== undefined ? (
                <span style={{ opacity: unavailable ? 0.5 : 1 }}>
                  ${price.toFixed(4)}/VSP
                  {unavailable && (
                    <span style={{ fontSize: 11, marginLeft: 6, color: "#b45309" }}>
                      price unavailable — showing last known
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ color: "#b45309" }}>price unavailable</span>
              )}
            </span>
            <span style={{ position: "relative" }}>
              <button
                onClick={() => setShowPool((v) => !v)}
                style={{ border: "none", background: "none", fontSize: 12,
                         color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}>
                pool
              </button>
              {showPool && state && (
                <div style={{ position: "absolute", right: 0, top: "130%", zIndex: 50,
                              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                              boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "10px 14px",
                              fontSize: 12, lineHeight: 1.9, minWidth: 230 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span>Price</span><b>${(state.price_usdc_per_vsp ?? 0).toFixed(4)}/VSP</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span>Reserves</span>
                    <span>{Math.round(state.vsp_reserve ?? 0).toLocaleString()} VSP / {Math.round(state.usdc_reserve ?? 0).toLocaleString()} USDC</span>
                  </div>
                  {state.vsp_circulating !== undefined && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <span>Circulating</span>
                      <span>{Math.round(state.vsp_circulating).toLocaleString()} VSP</span>
                    </div>
                  )}
                  <div style={{ marginTop: 4 }}>
                    <a href={swapUrl || `https://testnet.snowtrace.io/address/${state.pair}`}
                       target="_blank" rel="noopener noreferrer"
                       style={{ color: "#4f46e5" }}>
                      view pair on Snowtrace →
                    </a>
                  </div>
                </div>
              )}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "#6b7280" }}>Trading opens at launch</span>
        )}
      </div>
      {side && state?.pair && (
        <PoolTradeModal
          side={side}
          pair={state.pair as `0x${string}`}
          venue={state.venue ?? "mockcpamm"}
          router={(state.router ?? undefined) as `0x${string}` | undefined}
          token0IsVsp={state.token0_is_vsp ?? true}
          onClose={() => setSide(null)}
          onSwapped={refreshNow}
        />
      )}
    </div>
  );
}
