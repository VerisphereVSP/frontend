// frontend/src/wallet/passkey/rpc.ts — patch_fe_passkey_wallet
// Where the passkey account reads chain state and sends its (rare, gas-paying) transactions: Avalanche's public RPC
// first, a second public endpoint as fallback. Decided 10-29: no proxy through the app, so the only party that sees
// IP + address together is a public infrastructure provider that sees it for every Avalanche wallet anyway; revisit
// if rate limits bite (viem's fallback() takes more entries, or a separate log-free relay).
import { fallback, http, type Chain, type Transport } from "viem";
import { avalanche, avalancheFuji } from "wagmi/chains";

export const PUBLIC_RPCS: Record<number, string[]> = {
  [avalanche.id]: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"],
  [avalancheFuji.id]: ["https://api.avax-test.network/ext/bc/C/rpc", "https://avalanche-fuji-c-chain-rpc.publicnode.com"],
};

export function rpcUrlsFor(chain: Chain): string[] {
  return PUBLIC_RPCS[chain.id] ?? [...chain.rpcUrls.default.http];
}

export function transportFor(chain: Chain): Transport {
  const urls = rpcUrlsFor(chain);
  return urls.length > 1 ? fallback(urls.map((u) => http(u, { batch: true })), { rank: false }) : http(urls[0]);
}
