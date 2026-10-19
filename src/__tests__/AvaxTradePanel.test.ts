// patch_fe_pool_avax — verifyBuilt refuses anything that is not exactly the trade the user asked for.
import { describe, it, expect } from "vitest";
import { encodeFunctionData, parseUnits } from "viem";
import { verifyBuilt, type PoolRoutes } from "../components/AvaxTradePanel";

const routes: PoolRoutes = {
  configured: true, router: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4", native: "AVAX",
  tokens: { wavax: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", vsp: "0x0273B4D58E8991f71fC28d0377424d03d7c3b173" },
  routes: { AVAX: true, USDC: true }, defaultSlippageBps: 50, maxSlippageBps: 500,
};
const ME = "0xf7a344aA311Cbb58BDA4C7953618675BCBa284a6";
const abi = [
  { type: "function", name: "swapExactAVAXForTokens", stateMutability: "payable",
    inputs: [{ name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForAVAX", stateMutability: "nonpayable",
    inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ type: "uint256[]" }] },
] as const;
const t = routes.tokens;
const buyPath = [t.wavax, t.usdc, t.vsp] as `0x${string}`[];
const sellPath = [t.vsp, t.usdc, t.wavax] as `0x${string}`[];
const one = parseUnits("1", 18);
const quote = {} as never;

function buy(over: Partial<{ to: string; value: string; minOut: bigint; path: `0x${string}`[]; recipient: string }> = {}) {
  const minOut = over.minOut ?? 100n * one;
  const data = encodeFunctionData({ abi, functionName: "swapExactAVAXForTokens", args: [minOut, over.path ?? buyPath, (over.recipient ?? ME) as `0x${string}`, 1_900_000_000n] });
  return { to: over.to ?? routes.router, data, value: over.value ?? one.toString(), fn: "swapExactAVAXForTokens", path: buyPath, amountIn: one.toString(), minOut: minOut.toString(), deadline: 1_900_000_000, quote };
}

describe("verifyBuilt (buy with AVAX)", () => {
  it("accepts the exact trade", () => { expect(verifyBuilt(buy(), routes, "buy", one, ME)).toBeNull(); });
  it("refuses another destination", () => { expect(verifyBuilt(buy({ to: ME }), routes, "buy", one, ME)).toMatch(/router/); });
  it("refuses a different attached value", () => { expect(verifyBuilt(buy({ value: (2n * one).toString() }), routes, "buy", one, ME)).toMatch(/attached AVAX/); });
  it("refuses a wrong path", () => { expect(verifyBuilt(buy({ path: [t.wavax, t.vsp] as `0x${string}`[] }), routes, "buy", one, ME)).toMatch(/path/); });
  it("refuses another recipient", () => { expect(verifyBuilt(buy({ recipient: routes.router }), routes, "buy", one, ME)).toMatch(/recipient/); });
  it("refuses a sell function on a buy", () => {
    const data = encodeFunctionData({ abi, functionName: "swapExactTokensForAVAX", args: [one, 1n, sellPath, ME, 1_900_000_000n] });
    expect(verifyBuilt({ ...buy(), data }, routes, "buy", one, ME)).toMatch(/unexpected function/);
  });
});

describe("verifyBuilt (sell for AVAX)", () => {
  const sell = () => {
    const data = encodeFunctionData({ abi, functionName: "swapExactTokensForAVAX", args: [one, 5n * 10n ** 15n, sellPath, ME, 1_900_000_000n] });
    return { to: routes.router, data, value: "0", fn: "swapExactTokensForAVAX", path: sellPath, amountIn: one.toString(), minOut: (5n * 10n ** 15n).toString(), deadline: 1_900_000_000,
      approve: { token: t.vsp, spender: routes.router, amount: one.toString() }, quote };
  };
  it("accepts the exact trade", () => { expect(verifyBuilt(sell(), routes, "sell", one, ME)).toBeNull(); });
  it("refuses an approval to anyone but the router", () => {
    expect(verifyBuilt({ ...sell(), approve: { token: t.vsp, spender: ME, amount: one.toString() } }, routes, "sell", one, ME)).toMatch(/approval/);
  });
  it("refuses attached AVAX on a sell", () => { expect(verifyBuilt({ ...sell(), value: "1" }, routes, "sell", one, ME)).toMatch(/must not attach/); });
});
