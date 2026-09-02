// frontend/src/components/PoolMarketWidget.tsx — patch_trackb_fe_swap
// Public-AMM era trade surface: pool price + a Swap link supplied by the
// backend (swap_url). Replaces the MM buy/sell surface once the pool is live.
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { probePool, PoolState } from "../api/pool";
import PoolTradeModal from "./PoolTradeModal";

const REFRESH_MS = 30_000;

export default function PoolMarketWidget({ initial }: { initial: PoolState | null }) {
  const [state, setState] = useState<PoolState | null>(initial);
  const [unavailable, setUnavailable] = useState(initial === null);
  const [side, setSide] = useState<"buy" | "sell" | null>(null);
  const { isConnected } = useAccount();
  const refreshNow = async () => {
    const probe = await probePool();
    if (probe.kind === "pool") { setState(probe.state); setUnavailable(false); }
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
        <span style={{ fontWeight: 600 }}>
          VSP{" "}
          {price !== undefined ? (
            <span style={{ opacity: unavailable ? 0.5 : 1 }}>
              ${price.toFixed(4)}
              {unavailable && (
                <span style={{ fontSize: 11, marginLeft: 6, color: "#b45309" }}>
                  price unavailable — showing last known
                </span>
              )}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "#b45309" }}>price unavailable</span>
          )}
        </span>
        {state && state.vsp_reserve !== undefined && (
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            pool: {Math.round(state.vsp_reserve).toLocaleString()} VSP /{" "}
            {Math.round(state.usdc_reserve ?? 0).toLocaleString()} USDC
          </span>
        )}
        {state?.pair ? (
          <>
            <button
              className="btn btn-primary vsp-button"
              disabled={!isConnected || unavailable}
              title={!isConnected ? "connect a wallet to trade" : undefined}
              onClick={() => setSide("buy")}
            >
              Buy
            </button>
            <button
              className="btn vsp-button"
              disabled={!isConnected || unavailable}
              title={!isConnected ? "connect a wallet to trade" : undefined}
              onClick={() => setSide("sell")}
            >
              Sell
            </button>
            {swapUrl && (
              <a href={swapUrl} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 11, color: "#6b7280", textDecoration: "underline" }}>
                view pool
              </a>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: "#6b7280" }}>Trading opens at launch</span>
        )}
      </div>
      {side && state?.pair && (
        <PoolTradeModal
          side={side}
          pair={state.pair as `0x${string}`}
          onClose={() => setSide(null)}
          onSwapped={refreshNow}
        />
      )}
    </div>
  );
}
