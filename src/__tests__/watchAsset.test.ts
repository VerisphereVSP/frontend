// patch_fe_add_vsp_wallet — the EIP-747 payload, the per-browser flag, and the wallet call outcomes.
import { describe, it, expect } from "vitest";
import { vspWatchAssetParams, watchAssetDone, markWatchAssetDone, addVspToWallet } from "../web3/watchAsset";

const VSP = "0x0273B4D58E8991f71fC28d0377424d03d7c3b173" as const;

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("vspWatchAssetParams", () => {
  it("builds the EIP-747 ERC20 payload with the app-served logo", () => {
    const p = vspWatchAssetParams(VSP, "https://app.verisphere.co/");
    expect(p).toEqual({ type: "ERC20", options: { address: VSP, symbol: "VSP", decimals: 18, image: "https://app.verisphere.co/logo192.png" } });
  });
});

describe("per-browser flag", () => {
  it("is keyed by token so another chain's VSP asks again", () => {
    const s = mem();
    expect(watchAssetDone(VSP, s)).toBe(false);
    markWatchAssetDone(VSP, s);
    expect(watchAssetDone(VSP, s)).toBe(true);
    expect(watchAssetDone(VSP.toLowerCase(), s)).toBe(true);
    expect(watchAssetDone("0x6bB97027A88c5a1d7E5873943c415F8384c264e3", s)).toBe(false);
  });
  it("survives a storage that throws", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(watchAssetDone(VSP, bad)).toBe(false);
    expect(() => markWatchAssetDone(VSP, bad)).not.toThrow();
  });
});

describe("addVspToWallet", () => {
  it("returns true when the wallet accepts, false when it declines or lacks EIP-747", async () => {
    const calls: unknown[] = [];
    const yes = { watchAsset: async (p: unknown) => { calls.push(p); return true; } };
    const no = { watchAsset: async () => false };
    const unsupported = { watchAsset: async () => { throw new Error("Method not found"); } };
    expect(await addVspToWallet(yes as never, VSP, "https://x.test")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(await addVspToWallet(no as never, VSP, "https://x.test")).toBe(false);
    expect(await addVspToWallet(unsupported as never, VSP, "https://x.test")).toBe(false);
  });
});
