// frontend/src/components/VSPMarketWidget.tsx
import { useEffect, useState, useRef } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import UnlockPasskey from "../wallet/passkey/UnlockPasskey";  // patch_fe_passkey_wallet
import TradeModal from "./TradeModal";
import { useContracts } from "../contracts";

type MMQuote = {
  mid_price_usd: number;
  buy_price_usd: number;
  sell_price_usd: number;
  floor_price_usd: number;
};

function FloorBadge({ floor }: { floor: number }) {
  const [showTip, setShowTip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close tooltip on outside click (mobile-friendly)
  useEffect(() => {
    if (!showTip) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowTip(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTip]);

  const label = floor > 0 ? `$${floor.toFixed(4)}` : "N/A";

  return (
    <div className="floor-badge" ref={ref}>
      <span className="floor-badge-label">Floor {label}</span>
      <span
        className="floor-badge-icon"
        onClick={() => setShowTip((v) => !v)}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        role="button"
        aria-label="What is the liquidation floor?"
        tabIndex={0}
      >
        &#9432;
      </span>
      {showTip && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          transform: "translateX(20px)",
          zIndex: 9999,
          width: 260,
          padding: "10px 12px",
          fontSize: 12,
          lineHeight: 1.5,
          color: "#1f2937",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          wordWrap: "break-word" as const,
          overflowWrap: "break-word" as const,
          whiteSpace: "normal" as const,
          pointerEvents: "auto" as const,
        }}>
          The liquidation floor is the minimum guaranteed sell price for VSP,
          equal to total USDC reserves divided by circulating supply. It updates
          in real time as trades occur.
        </div>
      )}
    </div>
  );
}

export default function VSPMarketWidget() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const {
    data: contracts,
    isLoading: contractsLoading,
    error: contractsError,
  } = useContracts();

  const [quote, setQuote] = useState<MMQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell" | null>(null);

  // Poll market maker quote every 5 seconds
  useEffect(() => {
    let alive = true;

    async function fetchQuote() {
      try {
        const res = await fetch("/api/mm/quote");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (
          typeof data.buy_price_usd !== "number" ||
          isNaN(data.buy_price_usd) ||
          typeof data.sell_price_usd !== "number" ||
          isNaN(data.sell_price_usd)
        ) {
          throw new Error(
            "Malformed quote: invalid or missing buy_price_usd/sell_price_usd",
          );
        }

        if (alive) {
          setQuote({
            mid_price_usd: data.mid_price_usd,
            buy_price_usd: data.buy_price_usd,
            sell_price_usd: data.sell_price_usd,
            floor_price_usd: data.floor_price_usd,
          });
          setError(null);
        }
      } catch (e: any) {
        if (alive) setError(e.message ?? "Market maker error");
        console.error("Quote fetch failed:", e);
      }
    }

    fetchQuote();
    const id = setInterval(fetchQuote, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // VSP balance
  const { data: vspBalanceData, refetch: refetchVsp } = useBalance({
    address,
    token: contracts?.VSPToken,
    query: {
      enabled: Boolean(isConnected && address && contracts?.VSPToken),
      refetchInterval: 5000,
    },
  });

  // USDC balance
  const { data: usdcBalanceData, refetch: refetchUsdc } = useBalance({
    address,
    token: contracts?.USDC,
    query: {
      enabled: Boolean(isConnected && address && contracts?.USDC),
      refetchInterval: 5000,
    },
  });

  const refetchBalances = () => {
    refetchVsp();
    refetchUsdc();
  };

  // Loading & error states
  if (contractsLoading)
    return <span className="muted">Loading contracts…</span>;
  if (contractsError) return <span className="error">Contracts error</span>;
  if (error) return <span className="error">{error}</span>;
  if (!quote) return <span className="muted">Loading price…</span>;

  return (
    <div className="vsp-widget-compact">
      {/* Wallet connect */}
      <ConnectButton />
      <UnlockPasskey />{/* patch_fe_passkey_wallet: Unlock / passkey badge, only for the passkey connector */}

      {/* Balances (compact) */}
      {isConnected && (
        <div className="row" style={{ gap: 8 }}>
          <span className="badge">
            VSP:{" "}
            {vspBalanceData
              ? Number(vspBalanceData.formatted).toFixed(2)
              : "0.00"}
          </span>
          <span className="badge">
            USDC:{" "}
            {usdcBalanceData
              ? Number(usdcBalanceData.formatted).toFixed(2)
              : "0.00"}
          </span>
        </div>
      )}

      {/* Buy / Sell / Floor — all inline */}
      <div className="vsp-prices">
        <button
          className="btn btn-primary vsp-button"
          disabled={!isConnected || !contracts?.VSPToken}
          onClick={() => setSide("buy")}
        >
          Buy @ {quote.buy_price_usd.toFixed(4)}
        </button>
        <button
          className="btn vsp-button"
          disabled={!isConnected || !contracts?.VSPToken}
          onClick={() => setSide("sell")}
        >
          Sell @ {quote.sell_price_usd.toFixed(4)}
        </button>
        <FloorBadge floor={quote.floor_price_usd} />
      </div>

      {/* Trade modal overlay */}
      {side && address && contracts?.VSPToken && contracts?.USDC && (
        <div className="trade-modal-overlay" onClick={() => setSide(null)}>
          <div
            className="trade-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <TradeModal
              side={side}
              quote={quote}
              walletAddress={address}
              usdcAddress={contracts.USDC}
              vspAddress={contracts.VSPToken}
              onClose={() => setSide(null)}
              refetchBalances={refetchBalances}
            />
            <button className="trade-close-btn" onClick={() => setSide(null)}>
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
