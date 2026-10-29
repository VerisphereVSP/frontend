// frontend/src/wallet/passkey/state.ts — patch_fe_passkey_wallet
// The one place the derived key lives: a module variable, for this browser session. "Locked" means the app knows the
// address (from storage) but has not re-derived the key since the page loaded — the first signature, or the Unlock
// control, asks for the biometric once and the key stays until the tab closes or the user disconnects.
import { useSyncExternalStore } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import type { Hex } from "viem";

export interface PasskeyState {
  address: Hex | null;      // known address (stored), or null when no passkey wallet exists in this browser
  unlocked: boolean;        // key in memory
  connected: boolean;       // the wagmi connector is active
}

let account: PrivateKeyAccount | null = null;
let state: PasskeyState = { address: null, unlocked: false, connected: false };
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

export function getAccount(): PrivateKeyAccount | null { return account; }
export function getState(): PasskeyState { return state; }

export function setAccount(a: PrivateKeyAccount | null): void {
  account = a;
  state = { ...state, unlocked: !!a, address: a ? a.address : state.address };
  emit();
}

export function setKnownAddress(address: Hex | null): void {
  state = { ...state, address };
  emit();
}

export function setConnected(connected: boolean): void {
  state = { ...state, connected };
  emit();
}

/** Forget the key (the address stays known). */
export function lock(): void { setAccount(null); }

/** React hook over the module state. */
export function usePasskeyState(): PasskeyState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => state,
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { account = null; });
}
