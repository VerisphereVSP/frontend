// frontend/src/components/PoolTradeModal.tsx — patch_pool_trade (restyle r2)
// Non-custodial Buy/Sell against the public pool, wearing the LEGACY TradeModal
// shell verbatim (founder direction 2026-09-02): same overlay/content classes,
// header, chain + balance lines, denomination toggle + Max, grey preview box
// with ruled total, two-step Preview Fill -> Cancel/Confirm, footer note.
// Execution: approve + MockCPAMM.swap from the USER'S OWN wallet. Quotes from
// live on-chain reserves with the contract's exact 997/1000 math; minOut at 1%.
// VENUE ADAPTER: speaks MockCPAMM; mainnet AMM needs its own (checklist #34).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, formatUnits, createPublicClient, custom } from "viem";
import type { PublicClient } from "viem";

const FUJI_CHAIN_ID = 43113;
const SLIPPAGE_BPS = 100n; // 1%

const POOL_ABI = [
  { type: "function", name: "token0", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "token1", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "reserve0", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "reserve1", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function", name: "swap",
    inputs: [
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint256" },
      { name: "minOut", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }], stateMutability: "nonpayable",
  },
] as const;

// patch_venue: UniV2-interface pair + router (Joe V1 on Fuji, Uniswap v2 on
// Avalanche mainnet). Orientation comes from the backend (token0IsVsp) — the
// factory sorts token0/token1 by address, so VSP==token0 is never assumed.
const UNIV2_PAIR_ABI = [
  { type: "function", name: "token0", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "token1", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  {
    type: "function", name: "getReserves", inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
    stateMutability: "view",
  },
] as const;

const UNIV2_ROUTER_ABI = [
  {
    type: "function", name: "swapExactTokensForTokens",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }], stateMutability: "nonpayable",
  },
] as const;

const ERC20_ABI = [
  { type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

type Side = "buy" | "sell";
type Denom = "vsp" | "usdc";

// out for a given in — mirrors MockCPAMM.swap exactly (997/1000 fee)
function quoteOut(amountIn: bigint, resIn: bigint, resOut: bigint): bigint {
  if (amountIn === 0n || resIn === 0n || resOut === 0n) return 0n;
  const f = amountIn * 997n;
  return (resOut * f) / (resIn * 1000n + f);
}
// in required for a desired out (exact-out inverse, rounded up)
function quoteIn(amountOut: bigint, resIn: bigint, resOut: bigint): bigint {
  if (amountOut === 0n || resIn === 0n || amountOut >= resOut) return 0n;
  return (resIn * amountOut * 1000n) / ((resOut - amountOut) * 997n) + 1n;
}

type Preview = {
  amountIn: bigint;      // in-token units
  amountOut: bigint;     // out-token units
  minOut: bigint;
  feeInToken: bigint;    // 0.3% of amountIn, in-token units
  avgPriceUsdcPerVsp: number;
  impactPct: number;
};

export default function PoolTradeModal({
  side, pair, venue = "mockcpamm", router, token0IsVsp = true, onClose, onSwapped,
}: {
  side: Side;
  pair: `0x${string}`;
  venue?: "mockcpamm" | "univ2";
  router?: `0x${string}`;
  token0IsVsp?: boolean;
  onClose: () => void;
  onSwapped: () => void;
}) {
  const { address, chain } = useAccount();
  const wagmiClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // patch_venue r4: this app deliberately avoids leaning on public RPCs from
  // the browser (the backend read-proxies exist for that reason). For the
  // trade path we read through the USER'S OWN wallet provider — the same
  // provider that will send the tx — and fall back to the wagmi client.
  const injectedClient = useMemo<PublicClient | null>(() => {
    const eth = typeof window !== "undefined" ? (window as { ethereum?: unknown }).ethereum : undefined;
    if (!eth) return null;
    try {
      return createPublicClient({ chain, transport: custom(eth as Parameters<typeof custom>[0]) });
    } catch { return null; }
  }, [chain]);
  const [activeClient, setActiveClient] = useState<PublicClient | null>(null);
  const publicClient = activeClient ?? injectedClient ?? wagmiClient ?? null;

  const isUniv2 = venue === "univ2";
  const inDecimals = side === "buy" ? 6 : 18;
  const outDecimals = side === "buy" ? 18 : 6;

  const [denom, setDenom] = useState<Denom>("vsp");
  const [amount, setAmount] = useState("");
  const [tokens, setTokens] = useState<{ vsp: `0x${string}`; usdc: `0x${string}` } | null>(null);
  const [reserves, setReserves] = useState<{ rVsp: bigint; rUsdc: bigint } | null>(null);
  const [vspBalance, setVspBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return null;
    // choose a working client once: wallet transport first, wagmi fallback
    const candidates = [injectedClient, wagmiClient].filter(Boolean) as PublicClient[];
    let publicClient: PublicClient | null = activeClient;
    if (!publicClient) {
      for (const c of candidates) {
        try {
          await c.getChainId();
          publicClient = c; setActiveClient(c); break;
        } catch { /* try next */ }
      }
    }
    if (!publicClient) throw new Error("no working RPC (wallet or default)");
    const pairAbi = isUniv2 ? UNIV2_PAIR_ABI : POOL_ABI;
    const [t0, t1] = await Promise.all([
      publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" }),
      publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token1" }),
    ]);
    let r0: bigint, r1: bigint;
    if (isUniv2) {
      const gr = (await publicClient.readContract({
        address: pair, abi: UNIV2_PAIR_ABI, functionName: "getReserves",
      })) as readonly [bigint, bigint, number];
      r0 = gr[0]; r1 = gr[1];
    } else {
      [r0, r1] = (await Promise.all([
        publicClient.readContract({ address: pair, abi: POOL_ABI, functionName: "reserve0" }),
        publicClient.readContract({ address: pair, abi: POOL_ABI, functionName: "reserve1" }),
      ])) as [bigint, bigint];
    }
    const vsp = (token0IsVsp ? t0 : t1) as `0x${string}`;
    const usdc = (token0IsVsp ? t1 : t0) as `0x${string}`;
    const [vb, ub] = await Promise.all([
      publicClient.readContract({ address: vsp, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
      publicClient.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
    ]);
    const res = token0IsVsp ? { rVsp: r0, rUsdc: r1 } : { rVsp: r1, rUsdc: r0 };
    setTokens({ vsp, usdc });
    setReserves(res);
    setVspBalance(Number(formatUnits(vb as bigint, 18)));
    setUsdcBalance(Number(formatUnits(ub as bigint, 6)));
    return res;
  }, [address, pair, side, isUniv2, token0IsVsp, injectedClient, wagmiClient, activeClient]);

  useEffect(() => { refresh().catch(() => setError("could not read pool state")); }, [refresh]);

  const spotPrice = useMemo(() => {
    if (!reserves || reserves.rVsp === 0n) return 0;
    return Number(formatUnits(reserves.rUsdc, 6)) / Number(formatUnits(reserves.rVsp, 18));
  }, [reserves]);

  const numeric = parseFloat(amount) || 0;
  const wrongChain = chain?.id !== FUJI_CHAIN_ID;

  function computePreview(res: { rVsp: bigint; rUsdc: bigint }): Preview | null {
    const resIn = side === "sell" ? res.rVsp : res.rUsdc;
    const resOut = side === "sell" ? res.rUsdc : res.rVsp;
    let amountIn: bigint, amountOut: bigint;
    const inputIsInToken = (side === "sell") === (denom === "vsp"); // sell+vsp or buy+usdc
    try {
      if (inputIsInToken) {
        amountIn = parseUnits(amount as `${number}`, inDecimals);
        amountOut = quoteOut(amountIn, resIn, resOut);
      } else {
        const desiredOut = parseUnits(amount as `${number}`, outDecimals);
        amountIn = quoteIn(desiredOut, resIn, resOut);
        if (amountIn === 0n) return null;
        amountOut = quoteOut(amountIn, resIn, resOut);
      }
    } catch { return null; }
    if (amountIn === 0n || amountOut === 0n) return null;
    const minOut = (amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    const feeInToken = (amountIn * 3n) / 1000n;
    const inF = Number(formatUnits(amountIn, inDecimals));
    const outF = Number(formatUnits(amountOut, outDecimals));
    const avg = side === "buy" ? inF / outF : outF / inF; // USDC per VSP either way
    const impact = spotPrice > 0 ? Math.abs(avg - spotPrice) / spotPrice * 100 : 0;
    return { amountIn, amountOut, minOut, feeInToken, avgPriceUsdcPerVsp: avg, impactPct: impact };
  }

  async function handlePreview() {
    setPreviewing(true); setError(null);
    try {
      const res = await refresh();               // live reserves at preview time
      if (!res) throw new Error("pool unreadable");
      const p = computePreview(res);
      if (!p) throw new Error("amount too small or exceeds pool depth");
      const inBal = side === "buy" ? usdcBalance : vspBalance;
      if (Number(formatUnits(p.amountIn, inDecimals)) > inBal) throw new Error("insufficient balance");
      setPreview(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setPreviewing(false); }
  }

  async function handleConfirm() {
    if (!preview || !walletClient || !publicClient || !tokens || !address) return;
    setLoading(true); setError(null);
    try {
      const tokenIn = side === "buy" ? tokens.usdc : tokens.vsp;
      const tokenOut = side === "buy" ? tokens.vsp : tokens.usdc;
      if (isUniv2 && !router) throw new Error("venue router not configured");
      const spender = isUniv2 ? (router as `0x${string}`) : pair;
      const allowance = (await publicClient.readContract({
        address: tokenIn, abi: ERC20_ABI, functionName: "allowance", args: [address, spender],
      })) as bigint;
      if (allowance < preview.amountIn) {
        setStatus("Approve in your wallet…");
        const h = await walletClient.writeContract({
          address: tokenIn, abi: ERC20_ABI, functionName: "approve", args: [spender, preview.amountIn],
        });
        setStatus("Waiting for approval…");
        await publicClient.waitForTransactionReceipt({ hash: h });
      }
      setStatus("Confirm the swap in your wallet…");
      // simulate + send inside each branch: the two requests are differently
      // typed and writeContract cannot take the union.
      let hash: `0x${string}`;
      if (isUniv2) {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
        const { request } = await publicClient.simulateContract({
          address: router as `0x${string}`, abi: UNIV2_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [preview.amountIn, preview.minOut, [tokenIn, tokenOut], address, deadline],
          account: address,
        });
        hash = await walletClient.writeContract(request);
      } else {
        const zeroForOne = (side === "sell") === token0IsVsp;
        const { request } = await publicClient.simulateContract({
          address: pair, abi: POOL_ABI, functionName: "swap",
          args: [zeroForOne, preview.amountIn, preview.minOut], account: address,
        });
        hash = await walletClient.writeContract(request);
      }
      setStatus("Swapping…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("swap transaction reverted");
      setStatus("Done ✓");
      onSwapped();
      setTimeout(onClose, 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("InsufficientOutput")
        ? "price moved beyond the 1% slippage bound — preview again"
        : msg.slice(0, 200));
      setStatus(null);
      setPreview(null); // back to step 1, like the old flow after a failed fill
    } finally { setLoading(false); }
  }

  function handleMax() {
    if (side === "buy") {
      if (denom === "usdc") setAmount((usdcBalance * 0.9999).toFixed(2));
      else setAmount(spotPrice > 0 ? ((usdcBalance * 0.9999) / spotPrice).toFixed(4) : "");
    } else {
      if (denom === "vsp") setAmount((vspBalance * 0.9999).toFixed(4));
      else setAmount((vspBalance * 0.9999 * spotPrice).toFixed(2));
    }
  }

  // display helpers (all in familiar units)
  const pv = preview && {
    qtyVsp: Number(formatUnits(side === "buy" ? preview.amountOut : preview.amountIn, 18)),
    grossUsdc: Number(formatUnits(side === "buy" ? preview.amountIn : preview.amountOut, 6)),
    feeUsdc: side === "buy"
      ? Number(formatUnits(preview.feeInToken, 6))
      : Number(formatUnits(preview.feeInToken, 18)) * spotPrice,
    minRecv: Number(formatUnits(preview.minOut, outDecimals)),
  };

  return (
    <div className="trade-modal-overlay" onClick={onClose}>
      <div className="trade-modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{side === "buy" ? "Buy VSP" : "Sell VSP"}</h3>
          <button onClick={onClose}
            style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>
            ×
          </button>
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
          Connected chain: {chain?.name || "Unknown"} (ID: {chain?.id || "—"})
          {wrongChain && <span style={{ color: "#b45309" }}> — switch to Avalanche Fuji</span>}
        </div>

        <div style={{ marginBottom: 12, fontSize: 13 }}>
          {side === "buy" ? "Your USDC balance" : "Your VSP balance"}:{" "}
          <strong>{side === "buy" ? usdcBalance.toFixed(2) : vspBalance.toFixed(4)}</strong>
        </div>

        <div style={{ marginBottom: 4, fontSize: 12, color: "#9ca3af" }}>
          Pool price: ${spotPrice > 0 ? spotPrice.toFixed(4) : "—"}/VSP
        </div>

        {/* Amount input with denomination toggle */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            <input
              type="number" min="0" step="any" value={amount}
              onChange={(e) => { setAmount(e.target.value); setPreview(null); }}
              placeholder={denom === "vsp" ? "Amount in VSP" : "Amount in USDC"}
              className="input" style={{ flex: 1 }}
            />
            <button className="btn"
              onClick={() => { setDenom(denom === "vsp" ? "usdc" : "vsp"); setAmount(""); setPreview(null); }}
              style={{ fontSize: 11, padding: "4px 8px", minWidth: 50, fontWeight: 600 }}
              title="Switch between VSP and USDC">
              {denom === "vsp" ? "VSP" : "USDC"} ⇄
            </button>
            <button className="btn" onClick={handleMax} style={{ fontSize: 11, padding: "4px 8px" }}>
              Max
            </button>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            {denom === "vsp"
              ? `≈ ${(numeric * spotPrice).toFixed(2)} USDC at current price`
              : `≈ ${spotPrice > 0 ? (numeric / spotPrice).toFixed(4) : "—"} VSP at current price`}
          </div>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", marginBottom: 8, background: "#fef2f2",
            border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
            {error}
          </div>
        )}

        {pv && preview && (
          <div style={{ padding: "10px 12px", marginBottom: 8, background: "#f9fafb",
            borderRadius: 6, fontSize: 12, lineHeight: 1.8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>You {side === "buy" ? "receive" : "send"}:</span>
              <strong>{pv.qtyVsp.toFixed(4)} VSP</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{side === "buy" ? "Subtotal:" : "Gross proceeds:"}</span>
              <span>{pv.grossUsdc.toFixed(2)} USDC</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280" }}>
              <span>Pool fee (0.3%, stays in pool):</span>
              <span>≈ {pv.feeUsdc.toFixed(2)} USDC</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600,
              borderTop: "1px solid #e5e7eb", marginTop: 4, paddingTop: 4 }}>
              <span>{side === "buy" ? "Total cost:" : "You receive:"}</span>
              <span>{pv.grossUsdc.toFixed(2)} USDC</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", fontSize: 11 }}>
              <span>Avg price:</span>
              <span>${preview.avgPriceUsdcPerVsp.toFixed(4)}/VSP</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", fontSize: 11 }}>
              <span>Min {side === "buy" ? "received" : "proceeds"} (1% slippage):</span>
              <span>{pv.minRecv.toFixed(side === "buy" ? 4 : 2)} {side === "buy" ? "VSP" : "USDC"}</span>
            </div>
            {preview.impactPct > 0.5 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#b45309", fontSize: 11 }}>
                <span>Price impact:</span>
                <span>~{preview.impactPct.toFixed(2)}%</span>
              </div>
            )}
          </div>
        )}

        {!preview ? (
          <button className="btn btn-primary" onClick={handlePreview}
            disabled={previewing || numeric <= 0 || wrongChain || !walletClient}
            style={{ width: "100%", marginBottom: 8 }}>
            {previewing ? "Calculating…" : "Preview Fill"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => { setPreview(null); setError(null); }} style={{ flex: 1 }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={loading} style={{ flex: 1 }}>
              {loading ? (status ?? "Processing…") : `${side === "buy" ? "Buy" : "Sell"} ${pv!.qtyVsp.toFixed(4)} VSP`}
            </button>
          </div>
        )}
        {loading && status && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280", textAlign: "center" }}>{status}</div>
        )}

        <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af", textAlign: "center" }}>
          Executes on the public pool from your own wallet — the site never holds your funds.
        </div>
      </div>
    </div>
  );
}
