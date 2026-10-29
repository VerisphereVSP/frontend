// frontend/src/wallet/passkey/provider.ts — patch_fe_passkey_wallet
// An EIP-1193 provider around the passkey-derived local account. wagmi's walletClient talks to it exactly as it talks
// to MetaMask: eth_accounts / eth_chainId / personal_sign / eth_signTypedData_v4 / eth_sendTransaction are answered
// here with the in-memory key; every read (eth_call, eth_estimateGas, …) is forwarded to the public RPC (primary +
// fallback, see rpc.ts). Signing while locked first tries to unlock (one biometric prompt); if the browser refuses
// (no user activation left, e.g. Safari after a network round-trip) the error tells the app to show Unlock.
import { createPublicClient, createWalletClient, hexToBigInt, type Chain, type Hex, type PublicClient, type Transport } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { getAccount } from "./state";
import { PasskeyError } from "./keys";

export type Eip1193Request = (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;

export interface PasskeyProvider {
  request: Eip1193Request;
  on(event: string, listener: (...args: any[]) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
  /** test / internal: dispatch an event to listeners */
  emit(event: string, ...args: any[]): void;
}

export class ProviderRpcError extends Error {
  constructor(message: string, public readonly code: number) { super(message); this.name = "ProviderRpcError"; }
}

export interface ProviderDeps {
  chain: Chain;
  transport: Transport;
  /** Returns the unlocked account, unlocking (biometric prompt) when needed. Throws PasskeyError("locked") when it cannot. */
  ensureUnlocked: () => Promise<PrivateKeyAccount>;
  /** The known address while locked (so eth_accounts answers without a prompt). */
  knownAddress: () => Hex | null;
}

function toBigInt(v: unknown): bigint | undefined {
  if (v == null) return undefined;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return v.startsWith("0x") ? hexToBigInt(v as Hex) : BigInt(v);
  return undefined;
}

export function createPasskeyProvider(deps: ProviderDeps): PasskeyProvider {
  const { chain, transport } = deps;
  const publicClient: PublicClient = createPublicClient({ chain, transport });
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const chainIdHex = `0x${chain.id.toString(16)}`;

  const accountOrKnown = (): Hex[] => {
    const a = getAccount();
    if (a) return [a.address];
    const k = deps.knownAddress();
    return k ? [k] : [];
  };

  const request: Eip1193Request = async ({ method, params }) => {
    const p = (Array.isArray(params) ? params : []) as any[];
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return accountOrKnown();
      case "eth_chainId":
        return chainIdHex;
      case "net_version":
        return String(chain.id);
      case "wallet_switchEthereumChain": {
        const want = p[0]?.chainId;
        if (want && String(want).toLowerCase() !== chainIdHex) throw new ProviderRpcError(`This wallet only works on ${chain.name}.`, 4902);
        return null;
      }
      case "wallet_addEthereumChain":
        throw new ProviderRpcError(`This wallet only works on ${chain.name}.`, 4902);
      case "wallet_watchAsset":
        return true;  // the app is the wallet; VSP is already shown
      case "wallet_requestPermissions":
      case "wallet_getPermissions":
        return [{ parentCapability: "eth_accounts" }];
      case "personal_sign": {
        const account = await deps.ensureUnlocked();
        const data = String(p[0]);
        return account.signMessage({ message: data.startsWith("0x") ? { raw: data as Hex } : data });
      }
      case "eth_sign":
        throw new ProviderRpcError("eth_sign is not supported by this wallet.", 4200);
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4": {
        const account = await deps.ensureUnlocked();
        const raw = p[1] ?? p[0];
        const typed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const { EIP712Domain: _omit, ...types } = typed.types ?? {};
        return account.signTypedData({ domain: typed.domain, types, primaryType: typed.primaryType, message: typed.message });
      }
      case "eth_sendTransaction": {
        const account = await deps.ensureUnlocked();
        const tx = p[0] ?? {};
        const wallet = createWalletClient({ account, chain, transport });
        return wallet.sendTransaction({
          to: tx.to, data: tx.data,
          value: toBigInt(tx.value), gas: toBigInt(tx.gas), nonce: tx.nonce != null ? Number(toBigInt(tx.nonce)) : undefined,
          maxFeePerGas: toBigInt(tx.maxFeePerGas), maxPriorityFeePerGas: toBigInt(tx.maxPriorityFeePerGas),
          gasPrice: toBigInt(tx.gasPrice),
        } as any);
      }
      case "eth_signTransaction": {
        const account = await deps.ensureUnlocked();
        const tx = p[0] ?? {};
        const wallet = createWalletClient({ account, chain, transport });
        const prepared = await wallet.prepareTransactionRequest({ to: tx.to, data: tx.data, value: toBigInt(tx.value), gas: toBigInt(tx.gas) } as any);
        return account.signTransaction(prepared as any);
      }
      default:
        return publicClient.request({ method, params } as any);
    }
  };

  const on = (event: string, l: (...args: any[]) => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(l); };
  const removeListener = (event: string, l: (...args: any[]) => void) => { listeners.get(event)?.delete(l); };
  const emit = (event: string, ...args: any[]) => { listeners.get(event)?.forEach((l) => l(...args)); };
  return { request, on, removeListener, emit };
}

export { PasskeyError };
