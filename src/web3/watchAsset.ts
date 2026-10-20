// frontend/src/web3/watchAsset.ts — patch_fe_add_vsp_wallet
// "Add VSP to your wallet": EIP-747 wallet_watchAsset so MetaMask (and Rabby, Core…) list VSP by name and
// icon instead of a bare balance. Until VSP is on the token lists wallets read (CoinGecko-fed), this is how a
// new holder sees the token at all. Pure parameter builder + a per-browser "already added" flag; the call
// itself goes through the connected wallet client (viem walletClient.watchAsset).
import type { WalletClient } from "viem";

export const VSP_WATCH_FLAG = "vsp:watchAsset:added";

export interface WatchAssetParams {
  type: "ERC20";
  options: { address: `0x${string}`; symbol: string; decimals: number; image: string };
}

/** The EIP-747 payload for VSP. `origin` is the app's origin (the logo is served from /logo192.png). */
export function vspWatchAssetParams(token: `0x${string}`, origin: string): WatchAssetParams {
  return {
    type: "ERC20",
    options: { address: token, symbol: "VSP", decimals: 18, image: `${origin.replace(/\/$/, "")}/logo192.png` },
  };
}

/** Per-browser memory of a successful add, keyed by token address so a chain switch asks again. */
export function watchAssetDone(token: string, storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try { return storage?.getItem(`${VSP_WATCH_FLAG}:${token.toLowerCase()}`) === "1"; } catch { return false; }
}

export function markWatchAssetDone(token: string, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try { storage?.setItem(`${VSP_WATCH_FLAG}:${token.toLowerCase()}`, "1"); } catch { /* private mode etc. */ }
}

function safeStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

/** Ask the wallet to list VSP. Resolves true when the wallet accepted (MetaMask returns true after the user
 *  confirms); false when the user declined or the wallet does not support EIP-747 (WalletConnect wallets often don't). */
export async function addVspToWallet(walletClient: Pick<WalletClient, "watchAsset">, token: `0x${string}`, origin: string): Promise<boolean> {
  try {
    const ok = await walletClient.watchAsset(vspWatchAssetParams(token, origin));
    if (ok) markWatchAssetDone(token);
    return Boolean(ok);
  } catch {
    return false;
  }
}
