// frontend/src/components/AvaxTradePanel.tsx — patch_fe_pool_avax
// Buy VSP with AVAX / sell VSP for AVAX in ONE router transaction (AVAX→USDC→VSP through the venue's WAVAX/USDC pair,
// then our pool). Quotes and calldata come from the app (/api/pool/quote, /api/pool/build — patch_pool_trade); the
// calldata is DECODED and checked here before the wallet signs it (router, function, path, recipient, minimum out), so a
// bad backend can only produce a transaction we refuse to send. Buying needs no approval (native AVAX in); selling needs a
// one-time standing approval of VSP to the router (10,000 VSP, like the stake permits), then one transaction.
// Rendered inside PoolTradeModal's shell when "Pay with AVAX" / "Receive AVAX" is selected; the USDC path is unchanged.
import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";
import { createPublicClient, custom, decodeFunctionData, formatUnits, parseUnits } from "viem";

const API = import.meta.env.VITE_API_BASE || "/api";
const STANDING_APPROVAL = parseUnits("10000", 18);

const ERC20_ABI = [
  { type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

// Both native-name flavours (Uniswap v2 Router02 = ETH names; JoeRouter02 = AVAX names) so decoding works on either venue.
const swapIn = (n: string) => ({ type: "function", name: `swapExact${n}ForTokens`, stateMutability: "payable",
  inputs: [{ name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }],
  outputs: [{ name: "amounts", type: "uint256[]" }] } as const);
const swapOut = (n: string) => ({ type: "function", name: `swapExactTokensFor${n}`, stateMutability: "nonpayable",
  inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }],
  outputs: [{ name: "amounts", type: "uint256[]" }] } as const);
const ROUTER_ABI = [swapIn("ETH"), swapOut("ETH"), swapIn("AVAX"), swapOut("AVAX")];

export type PoolRoutes = {
  configured: boolean; router: string; native: "ETH" | "AVAX";
  tokens: { wavax: string; usdc: string; vsp: string };
  routes: { AVAX: boolean; USDC: boolean }; defaultSlippageBps: number; maxSlippageBps: number;
};
type Quote = {
  amountIn: string; amountInHuman: number; symbolIn: string; symbolOut: string; amountOut: string; amountOutHuman: number;
  minOut: string; minOutHuman: number; priceImpactBps: number; feeBps: number; hops: number; path: string[];
};
type Built = { to: string; data: `0x${string}`; value: string; fn: string; path: string[]; amountIn: string; minOut: string; deadline: number;
  approve?: { token: string; spender: string; amount: string }; quote: Quote };

export async function fetchPoolRoutes(): Promise<PoolRoutes | null> {
  try {
    const r = await fetch(`${API}/pool/routes`);
    if (!r.ok) return null;
    const j = (await r.json()) as PoolRoutes;
    return j.configured ? j : null;
  } catch { return null; }
}

/** Refuse anything that is not exactly the trade the user asked for. Exported for tests. */
export function verifyBuilt(b: Built, routes: PoolRoutes, side: "buy" | "sell", amountInWei: bigint, recipient: string): string | null {
  const eq = (a: string, c: string) => a.toLowerCase() === c.toLowerCase();
  if (!eq(b.to, routes.router)) return "destination is not the configured router";
  let fn: string; let args: readonly unknown[];
  try { ({ functionName: fn, args } = decodeFunctionData({ abi: ROUTER_ABI, data: b.data }) as { functionName: string; args: readonly unknown[] }); }
  catch { return "calldata does not decode as a router swap"; }
  const t = routes.tokens;
  const want = side === "buy" ? [t.wavax, t.usdc, t.vsp] : [t.vsp, t.usdc, t.wavax];
  if (side === "buy") {
    if (fn !== `swapExact${routes.native}ForTokens`) return `unexpected function ${fn}`;
    const [minOut, p, to] = args as [bigint, readonly string[], string, bigint];
    if (BigInt(b.value) !== amountInWei) return "attached AVAX differs from the amount entered";
    if (p.length !== 3 || !p.every((a, i) => eq(a, want[i]))) return "swap path is not AVAX → USDC → VSP";
    if (!eq(to, recipient)) return "recipient is not your wallet";
    if (minOut !== BigInt(b.minOut) || minOut <= 0n) return "minimum output mismatch";
  } else {
    if (fn !== `swapExactTokensFor${routes.native}`) return `unexpected function ${fn}`;
    const [amountIn, minOut, p, to] = args as [bigint, bigint, readonly string[], string, bigint];
    if (BigInt(b.value) !== 0n) return "a sell must not attach AVAX";
    if (amountIn !== amountInWei) return "amount in differs from the amount entered";
    if (p.length !== 3 || !p.every((a, i) => eq(a, want[i]))) return "swap path is not VSP → USDC → AVAX";
    if (!eq(to, recipient)) return "recipient is not your wallet";
    if (minOut !== BigInt(b.minOut) || minOut <= 0n) return "minimum output mismatch";
    if (!b.approve || !eq(b.approve.token, t.vsp) || !eq(b.approve.spender, routes.router)) return "approval target is not VSP → router";
  }
  return null;
}

export default function AvaxTradePanel({ side, routes, onSwapped, onClose }: {
  side: "buy" | "sell"; routes: PoolRoutes; onSwapped: () => void; onClose: () => void;
}) {
  const { address, chain } = useAccount();
  const { data: avaxBal } = useBalance({ address, query: { enabled: Boolean(address), refetchInterval: 5000 } });
  const wagmiClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [vspBalance, setVspBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const numeric = parseFloat(amount) || 0;
  const inSym = side === "buy" ? "AVAX" : "VSP";
  const outSym = side === "buy" ? "VSP" : "AVAX";

  // read through the user's own wallet provider when there is one (same policy as PoolTradeModal)
  const reader = useMemo(() => {
    const eth = typeof window !== "undefined" ? (window as { ethereum?: unknown }).ethereum : undefined;
    try { return eth ? createPublicClient({ chain, transport: custom(eth as Parameters<typeof custom>[0]) }) : wagmiClient ?? null; }
    catch { return wagmiClient ?? null; }
  }, [chain, wagmiClient]);

  useEffect(() => {
    if (!address || !reader) return;
    reader.readContract({ address: routes.tokens.vsp as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [address] })
      .then((b) => setVspBalance(Number(formatUnits(b as bigint, 18)))).catch(() => setVspBalance(null));
  }, [address, reader, routes.tokens.vsp, status]);

  // debounced quote
  useEffect(() => {
    setQuote(null); setError(null);
    if (numeric <= 0) return;
    const h = setTimeout(async () => {
      setQuoting(true);
      try {
        const r = await fetch(`${API}/pool/quote?side=${side}&pay_with=AVAX&amount=${numeric}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail || `quote failed (${r.status})`);
        setQuote(j as Quote);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setQuoting(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [numeric, side]);

  const inBalance = side === "buy" ? (avaxBal ? Number(avaxBal.formatted) : null) : vspBalance;
  const overBalance = inBalance !== null && numeric > inBalance;

  async function handleConfirm() {
    if (!quote || !walletClient || !reader || !address) return;
    setLoading(true); setError(null);
    try {
      const amountInWei = parseUnits(numeric.toString() as `${number}`, 18);
      setStatus("Preparing the transaction…");
      const r = await fetch(`${API}/pool/build`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ side, pay_with: "AVAX", amount: numeric, recipient: address, slippage_bps: routes.defaultSlippageBps }) });
      const b = (await r.json()) as Built & { detail?: string };
      if (!r.ok) throw new Error(b.detail || `build failed (${r.status})`);
      const why = verifyBuilt(b, routes, side, amountInWei, address);
      if (why) throw new Error(`Refusing to sign: ${why}`);
      if (b.approve) {
        const spender = b.approve.spender as `0x${string}`; const token = b.approve.token as `0x${string}`;
        const allowance = (await reader.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [address, spender] })) as bigint;
        if (allowance < amountInWei) {
          setStatus("Approve VSP for the router in your wallet (one-time)…");
          const want = amountInWei > STANDING_APPROVAL ? amountInWei : STANDING_APPROVAL;
          const h = await walletClient.writeContract({ address: token, abi: ERC20_ABI, functionName: "approve", args: [spender, want] });
          setStatus("Waiting for the approval…");
          await reader.waitForTransactionReceipt({ hash: h });
          for (let i = 0; i < 20; i++) {   // the wallet's node may lag ours by a block
            const a = (await reader.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [address, spender] })) as bigint;
            if (a >= amountInWei) break;
            await new Promise((res) => setTimeout(res, 1500));
          }
        }
      }
      setStatus(`Confirm the ${side} in your wallet…`);
      const hash = await walletClient.sendTransaction({ to: b.to as `0x${string}`, data: b.data, value: BigInt(b.value), account: address, chain: walletClient.chain });
      setStatus("Swapping…");
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("swap transaction reverted");
      setStatus("Done ✓"); onSwapped(); setTimeout(onClose, 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/INSUFFICIENT_OUTPUT_AMOUNT|InsufficientOutput/.test(msg) ? "price moved beyond the slippage bound — try again" : msg.slice(0, 200));
      setStatus(null);
    } finally { setLoading(false); }
  }

  return (
    <>
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        Your {inSym} balance: <strong>{inBalance === null ? "—" : inBalance.toFixed(4)}</strong>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder={`Amount in ${inSym}`} className="input" style={{ flex: 1 }} />
          <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={inBalance === null}
            onClick={() => setAmount(side === "buy" ? Math.max(0, (inBalance ?? 0) - 0.02).toFixed(4) : ((inBalance ?? 0) * 0.9999).toFixed(4))}>
            Max
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af" }}>
          {side === "buy" ? "AVAX → USDC → VSP in one transaction; no approval needed." : "VSP → USDC → AVAX in one transaction (one-time approval first)."}
        </div>
      </div>
      {error && (
        <div style={{ padding: "8px 12px", marginBottom: 8, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>{error}</div>
      )}
      {quoting && <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>Quoting…</div>}
      {quote && (
        <div style={{ padding: "10px 12px", marginBottom: 8, background: "#f9fafb", borderRadius: 6, fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>You pay:</span><strong>{quote.amountInHuman} {inSym}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>You receive (est.):</span><strong>{quote.amountOutHuman.toFixed(side === "buy" ? 4 : 5)} {outSym}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280" }}><span>Pool fees ({(quote.feeBps / 100).toFixed(1)} %, two pools):</span><span>included</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", fontSize: 11 }}>
            <span>Minimum received ({(routes.defaultSlippageBps / 100).toFixed(1)} % slippage):</span><span>{quote.minOutHuman.toFixed(side === "buy" ? 4 : 5)} {outSym}</span>
          </div>
          {quote.priceImpactBps > 50 && (
            <div style={{ display: "flex", justifyContent: "space-between", color: "#b45309", fontSize: 11 }}><span>Price impact:</span><span>~{(quote.priceImpactBps / 100).toFixed(2)} %</span></div>
          )}
        </div>
      )}
      <button className="btn btn-primary" onClick={handleConfirm} style={{ width: "100%", marginBottom: 8 }}
        disabled={loading || !quote || overBalance || !walletClient || chain?.id === undefined}>
        {loading ? (status ?? "Processing…") : overBalance ? `Insufficient ${inSym}` : quote ? `${side === "buy" ? "Buy" : "Sell"} ${side === "buy" ? quote.amountOutHuman.toFixed(4) : quote.amountInHuman} VSP` : `Enter an amount in ${inSym}`}
      </button>
      {loading && status && <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280", textAlign: "center" }}>{status}</div>}
    </>
  );
}
