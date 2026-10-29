// frontend/src/wallet/passkey/connector.ts — patch_fe_passkey_wallet
// The wagmi connector. connect(): no stored passkey → create one (one or two biometric prompts) and derive the key;
// stored passkey → assert it (one prompt) and derive; isReconnecting (page load) → report the stored address without a
// prompt and stay locked until the first signature or Unlock. disconnect(): forget the key and stop auto-reconnect;
// the passkey itself and the stored address are kept so the next Connect is an unlock, not a new wallet.
import { createConnector } from "wagmi";
import { getAddress, type Chain, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  accountFromPrf, browserAuthenticator, clearStored, isMarkedDisconnected, loadStored, markDisconnected, PasskeyError,
  saveStored, type PasskeyAuthenticator,
} from "./keys";
import { createPasskeyProvider, type PasskeyProvider } from "./provider";
import { transportFor } from "./rpc";
import { getAccount, lock, setAccount, setConnected, setKnownAddress } from "./state";

export const PASSKEY_CONNECTOR_ID = "verispherePasskey";

export interface PasskeyConnectorOptions {
  chain: Chain;
  authenticator?: PasskeyAuthenticator;
}

/** Derive (or re-derive) the account for the stored credential. Exported for the Unlock control. */
export async function unlockPasskey(auth: PasskeyAuthenticator = browserAuthenticator): Promise<PrivateKeyAccount> {
  const have = getAccount();
  if (have) return have;
  const stored = loadStored();
  if (!stored) throw new PasskeyError("No passkey wallet in this browser.", "locked");
  const prf = await auth.assert(stored.credentialId);
  const account = await accountFromPrf(prf);
  if (getAddress(account.address) !== getAddress(stored.address)) {
    throw new PasskeyError("This passkey derives a different address than the one saved here.", "mismatch");
  }
  setAccount(account);
  return account;
}

/** Create a brand-new passkey wallet. Exported for tests and the (3b) "new wallet" setting. */
export async function createPasskeyWallet(auth: PasskeyAuthenticator = browserAuthenticator): Promise<PrivateKeyAccount> {
  const created = await auth.create();
  const prf = created.prf ?? (await auth.assert(created.credentialId));
  const account = await accountFromPrf(prf);
  saveStored({ credentialId: created.credentialId, address: account.address, createdAt: new Date().toISOString() });
  setKnownAddress(account.address);
  setAccount(account);
  return account;
}

export function passkeyConnector(opts: PasskeyConnectorOptions) {
  const { chain } = opts;
  const auth = opts.authenticator ?? browserAuthenticator;
  let provider: PasskeyProvider | undefined;

  return createConnector<PasskeyProvider>((config) => ({
    id: PASSKEY_CONNECTOR_ID,
    name: "Passkey",
    type: "passkey",

    async setup() {
      const stored = loadStored();
      setKnownAddress(stored?.address ?? null);
    },

    async connect(parameters) {
      const isReconnecting = !!parameters?.isReconnecting;
      const stored = loadStored();
      let address: Hex;
      if (isReconnecting && stored) {
        address = stored.address;           // locked: the key is derived on first use
      } else if (stored) {
        address = (await unlockPasskey(auth)).address;
      } else {
        address = (await createPasskeyWallet(auth)).address;
      }
      markDisconnected(false);
      setKnownAddress(address);
      setConnected(true);
      const checksummed = getAddress(address);
      const accounts = parameters?.withCapabilities ? [{ address: checksummed, capabilities: {} }] : [checksummed];
      return { accounts, chainId: chain.id } as any;
    },

    async disconnect() {
      lock();
      markDisconnected(true);
      setConnected(false);
    },

    async getAccounts() {
      const a = getAccount()?.address ?? loadStored()?.address;
      return a ? [getAddress(a)] : [];
    },

    async getChainId() { return chain.id; },

    async getProvider() {
      if (!provider) {
        provider = createPasskeyProvider({
          chain,
          transport: transportFor(chain),
          knownAddress: () => getAccount()?.address ?? loadStored()?.address ?? null,
          ensureUnlocked: async () => {
            try {
              return await unlockPasskey(auth);
            } catch (e) {
              if (e instanceof PasskeyError) throw e;
              // the browser refused the prompt here (no user activation left): point at the Unlock control
              throw new PasskeyError("Unlock your passkey wallet first (the key icon in the header).", "locked");
            }
          },
        });
      }
      return provider;
    },

    async isAuthorized() {
      return !!loadStored() && !isMarkedDisconnected();
    },

    async switchChain({ chainId }) {
      if (chainId !== chain.id) throw new Error(`This wallet only works on ${chain.name}.`);
      return chain;
    },

    onAccountsChanged(accounts) {
      if (accounts.length === 0) config.emitter.emit("disconnect");
      else config.emitter.emit("change", { accounts: accounts.map((a) => getAddress(a)) });
    },
    onChainChanged() { /* single chain */ },
    onDisconnect() { lock(); setConnected(false); config.emitter.emit("disconnect"); },
  }));
}

/** Forget the passkey wallet in this browser (3b: "Start over"). The passkey itself stays in the device's passkey
 *  store until the user deletes it there, but without the stored credential id the app cannot assert it again, so
 *  3b offers the recovery export before clearing. */
export function forgetPasskeyWallet(): void {
  lock();
  clearStored();
  setKnownAddress(null);
  setConnected(false);
}
