// frontend/src/components/PoolTradeModal.tsx — patch_pool_trade
// Non-custodial Buy/Sell against the public pool (MockCPAMM on Fuji).
//
// This reroutes the legacy Buy/Sell UX to the pool: the user's OWN wallet
// approves the pool and calls swap(); the company is never counterparty,
// quotes nothing, and custodies nothing. Quotes are computed from LIVE
// on-chain reserves (not the 30s-stale API price) with the contract's exact
// x*y=k fee math (997/1000), and minOut enforces a 1% slippage bound.
//
// VENUE ADAPTER NOTE: this speaks MockCPAMM's interface. The mainnet venue is
// a real AMM (Schedule 1) and will need its own adapter — checklist item.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";

const FUJI_CHAIN_ID = 43113;
const SLIPPAGE_BPS = 100n; // 1%

const POOL_ABI = [
  { type: "function", name: "token0", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "token1", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "reserve0", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "reserve1", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function",
    name: "swap",
    inputs: [
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint256" },
      { name: "minOut", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

const ERC20_ABI = [
  { type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

type Side = "buy" | "sell";

// Mirrors MockCPAMM.swap exactly: out = resOut*in*997 / (resIn*1000 + in*997)
function quoteOut(amountIn: bigint, resIn: bigint, resOut: bigint): bigint {
  if (amountIn === 0n || resIn === 0n || resOut === 0n) return 0n;
  const inWithFee = amountIn * 997n;
  return (resOut * inWithFee) / (resIn * 1000n + inWithFee);
}

export default function PoolTradeModal({
  side,
  pair,
  onClose,
  onSwapped,
}: {
  side: Side;
  pair: `0x${string}`;
  onClose: () => void;
  onSwapped: () => void;
}) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // buy: USDC in (6 dp) -> VSP out (18 dp); sell: VSP in -> USDC out
  const inDecimals = side === "buy" ? 6 : 18;
  const outDecimals = side === "buy" ? 18 : 6;
  const zeroForOne = side === "sell"; // token0 = VSP

  const [amountStr, setAmountStr] = useState("");
  const [tokens, setTokens] = useState<{ vsp: `0x${string}`; usdc: `0x${string}` } | null>(null);
  const [reserves, setReserves] = useState<{ r0: bigint; r1: bigint } | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!publicClient || !address) return;
    const [t0, t1, r0, r1] = await Promise.all([
      publicClient.readContract({ address: pair, abi: POOL_ABI, functionName: "token0" }),
      publicClient.readContract({ address: pair, abi: POOL_ABI, functionName: "token1" }),
      publicClient.readContract({ address: pair, abi: POOL_ABI, functionName: "reserve0" }),
      publicClient.readContract({ address: pair, abi: POOL_ABI, functionName: "reserve1" }),
    ]);
    const vsp = t0 as `0x${string}`;
    const usdc = t1 as `0x${string}`;
    setTokens({ vsp, usdc });
    setReserves({ r0: r0 as bigint, r1: r1 as bigint });
    const tokenIn = side === "buy" ? usdc : vsp;
    const bal = await publicClient.readContract({
      address: tokenIn, abi: ERC20_ABI, functionName: "balanceOf", args: [address],
    });
    setBalance(bal as bigint);
  }, [publicClient, address, pair, side]);

  useEffect(() => { refresh().catch(() => setError("could not read pool state")); }, [refresh]);

  const amountIn = useMemo(() => {
    try { return amountStr ? parseUnits(amountStr as `${number}`, inDecimals) : 0n; }
    catch { return 0n; }
  }, [amountStr, inDecimals]);

  const { expectedOut, minOut, impactPct } = useMemo(() => {
    if (!reserves || amountIn === 0n) return { expectedOut: 0n, minOut: 0n, impactPct: 0 };
    const resIn = zeroForOne ? reserves.r0 : reserves.r1;
    const resOut = zeroForOne ? reserves.r1 : reserves.r0;
    const out = quoteOut(amountIn, resIn, resOut);
    const min = (out * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    // impact vs mid-price: what you'd get at spot, ignoring depth
    const spotOut = (amountIn * resOut) / (resIn === 0n ? 1n : resIn);
    const impact = spotOut === 0n ? 0 : Number(((spotOut - out) * 10_000n) / spotOut) / 100;
    return { expectedOut: out, minOut: min, impactPct: impact };
  }, [reserves, amountIn, zeroForOne]);

  const wrongChain = chain?.id !== FUJI_CHAIN_ID;
  const insufficient = balance !== null && amountIn > balance;
  const canSubmit =
    !busy && !wrongChain && !insufficient && amountIn > 0n && expectedOut > 0n &&
    !!walletClient && !!publicClient && !!tokens && !!address;

  async function submit() {
    if (!canSubmit || !walletClient || !publicClient || !tokens || !address) return;
    setBusy(true); setError("");
    try {
      const tokenIn = side === "buy" ? tokens.usdc : tokens.vsp;

      // re-read reserves right before sending so minOut binds to fresh state
      await refresh();

      const allowance = (await publicClient.readContract({
        address: tokenIn, abi: ERC20_ABI, functionName: "allowance", args: [address, pair],
      })) as bigint;
      if (allowance < amountIn) {
        setStatus("Approve in your wallet…");
        const approveHash = await walletClient.writeContract({
          address: tokenIn, abi: ERC20_ABI, functionName: "approve", args: [pair, amountIn],
        });
        setStatus("Waiting for approval…");
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStatus("Confirm the swap in your wallet…");
      const { request } = await publicClient.simulateContract({
        address: pair, abi: POOL_ABI, functionName: "swap",
        args: [zeroForOne, amountIn, minOut], account: address,
      });
      const hash = await walletClient.writeContract(request);
      setStatus("Swapping…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("swap transaction reverted");
      setStatus("Done ✓");
      onSwapped();
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("InsufficientOutput") ? "price moved beyond the 1% slippage bound — try again" : msg.slice(0, 200));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pool-trade-modal" data-trackb="pool-trade">
      <h3 style={{ marginTop: 0 }}>{side === "buy" ? "Buy VSP" : "Sell VSP"}</h3>
      <p style={{ fontSize: 12, color: "#6b7280", marginTop: -6 }}>
        Swaps execute on the public pool from your own wallet. The site never
        holds your funds and is not the counterparty.
      </p>

      <label style={{ display: "block", fontSize: 13 }}>
        You pay ({side === "buy" ? "USDC" : "VSP"})
        <input
          type="text" inputMode="decimal" value={amountStr} disabled={busy}
          onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0" className="pool-trade-input"
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </label>
      {balance !== null && (
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
          balance: {Number(formatUnits(balance, inDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </div>
      )}

      <div style={{ fontSize: 13, marginTop: 10 }}>
        You receive (est.): <b>{formatUnits(expectedOut, outDecimals)}</b> {side === "buy" ? "VSP" : "USDC"}
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          min after 1% slippage: {formatUnits(minOut, outDecimals)}
          {impactPct > 0.05 && <> · price impact ~{impactPct.toFixed(2)}%</>}
        </div>
      </div>

      {wrongChain && <div className="pool-trade-warn" style={{ color: "#b45309", fontSize: 12, marginTop: 8 }}>switch your wallet to Avalanche Fuji (43113)</div>}
      {insufficient && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>insufficient balance</div>}
      {error && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{error}</div>}
      {status && <div style={{ fontSize: 12, marginTop: 8 }}>{status}</div>}

      <button className="btn btn-primary vsp-button" style={{ marginTop: 12 }} disabled={!canSubmit} onClick={submit}>
        {busy ? "Working…" : side === "buy" ? "Buy VSP" : "Sell VSP"}
      </button>
    </div>
  );
}
