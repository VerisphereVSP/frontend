// @vitest-environment node
// patch_fe_passkey_wallet: key derivation, the connector flows (with a fake authenticator) and the EIP-1193 provider.
// Node environment: WebCrypto (HKDF) and no DOM; the storage helpers take an explicit Storage so nothing touches window.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { verifyMessage, verifyTypedData } from "viem";
import { avalancheFuji } from "wagmi/chains";
import {
  accountFromPrf, deriveKeyBytes, toBase64Url, fromBase64Url, loadStored, saveStored, clearStored, markDisconnected,
  isMarkedDisconnected, PasskeyError, type PasskeyAuthenticator,
} from "../wallet/passkey/keys";
import { createPasskeyWallet, unlockPasskey, forgetPasskeyWallet, exportPrivateKey } from "../wallet/passkey/connector";
import { privateKeyToAccount } from "viem/accounts";
import { createPasskeyProvider, ProviderRpcError } from "../wallet/passkey/provider";
import { getAccount, getState, lock } from "../wallet/passkey/state";
import { rpcUrlsFor } from "../wallet/passkey/rpc";

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const PRF_A = new Uint8Array(32).map((_, i) => i + 1);
const PRF_B = new Uint8Array(32).map((_, i) => 255 - i);

function fakeAuth(prf: Uint8Array, opts: { prfAtCreate?: boolean } = {}): PasskeyAuthenticator & { asserts: number; creates: number } {
  const a = {
    asserts: 0, creates: 0,
    async create() { a.creates++; return { credentialId: toBase64Url(new Uint8Array([9, 8, 7, 6])), prf: opts.prfAtCreate === false ? null : prf }; },
    async assert(_id: string) { a.asserts++; return prf; },
  };
  return a;
}

beforeEach(() => {
  // the module uses window.localStorage when present; in node there is none, so install one for the connector flows
  const mem = new MemStorage();
  (globalThis as any).window = { localStorage: mem, addEventListener() {} };
  lock();
  forgetPasskeyWallet();
});

describe("key derivation", () => {
  it("is deterministic and depends on the PRF bytes", async () => {
    const a1 = await accountFromPrf(PRF_A);
    const a2 = await accountFromPrf(PRF_A);
    const b = await accountFromPrf(PRF_B);
    expect(a1.address).toBe(a2.address);
    expect(a1.address).not.toBe(b.address);
    expect(a1.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect((await deriveKeyBytes(PRF_A)).length).toBe(32);
    expect((await deriveKeyBytes(PRF_A, 1))).not.toEqual(await deriveKeyBytes(PRF_A, 0));
  });

  it("rejects a missing or short PRF output", async () => {
    await expect(accountFromPrf(new Uint8Array(8))).rejects.toBeInstanceOf(PasskeyError);
    await expect(accountFromPrf(null as any)).rejects.toMatchObject({ code: "no-prf" });
  });

  it("base64url round-trips", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const s = toBase64Url(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect(fromBase64Url(s)).toEqual(bytes);
  });

  it("storage keeps only public data and the disconnect flag", () => {
    const s = new MemStorage();
    expect(loadStored(s)).toBeNull();
    saveStored({ credentialId: "abc", address: "0x1111111111111111111111111111111111111111", createdAt: "2026-10-29" }, s);
    expect(loadStored(s)?.address).toBe("0x1111111111111111111111111111111111111111");
    expect(JSON.stringify([...Array(s.length)].map((_, i) => s.getItem(s.key(i)!)))).not.toMatch(/priv|prf|key"/i);
    markDisconnected(true, s); expect(isMarkedDisconnected(s)).toBe(true);
    saveStored({ credentialId: "abc", address: "0x1111111111111111111111111111111111111111", createdAt: "x" }, s);
    expect(isMarkedDisconnected(s)).toBe(false);  // a fresh save re-enables auto-reconnect
    s.setItem("vsp:passkey", "{\"credentialId\":1}"); expect(loadStored(s)).toBeNull();  // garbage is ignored
    clearStored(s); expect(loadStored(s)).toBeNull();
  });
});

describe("connector flows", () => {
  it("creates a wallet (PRF at creation: one prompt), stores credential + address, unlocks to the same address", async () => {
    const auth = fakeAuth(PRF_A);
    const acct = await createPasskeyWallet(auth);
    expect(auth.creates).toBe(1); expect(auth.asserts).toBe(0);
    const stored = loadStored();
    expect(stored?.address).toBe(acct.address);
    expect(stored?.credentialId).toBe(toBase64Url(new Uint8Array([9, 8, 7, 6])));
    expect(getState()).toMatchObject({ address: acct.address, unlocked: true });
    lock();
    expect(getAccount()).toBeNull(); expect(getState().unlocked).toBe(false);
    const again = await unlockPasskey(auth);
    expect(again.address).toBe(acct.address); expect(auth.asserts).toBe(1);
    expect(await unlockPasskey(auth)).toBe(again);  // already unlocked: no prompt
    expect(auth.asserts).toBe(1);
  });

  it("falls back to an assertion when the provider cannot evaluate PRF at creation", async () => {
    const auth = fakeAuth(PRF_A, { prfAtCreate: false });
    await createPasskeyWallet(auth);
    expect(auth.creates).toBe(1); expect(auth.asserts).toBe(1);
  });

  it("refuses a passkey that derives a different address than the stored one", async () => {
    await createPasskeyWallet(fakeAuth(PRF_A));
    lock();
    await expect(unlockPasskey(fakeAuth(PRF_B))).rejects.toMatchObject({ code: "mismatch" });
    expect(getAccount()).toBeNull();
  });

  it("the recovery export re-derives from a fresh assertion and matches the stored address", async () => {  // patch_fe_passkey_3b
    const auth = fakeAuth(PRF_A);
    const acct = await createPasskeyWallet(auth);
    lock();
    const { privateKey, address } = await exportPrivateKey(auth);
    expect(auth.asserts).toBe(1);                         // a fresh prompt, not the in-memory key
    expect(address).toBe(acct.address);
    expect(privateKeyToAccount(privateKey).address).toBe(acct.address);  // what MetaMask's Import account would get
    expect(getAccount()).toBeNull();                      // export does not unlock the session
    await expect(exportPrivateKey(fakeAuth(PRF_B))).rejects.toMatchObject({ code: "mismatch" });
  });

  it("unlock without a stored wallet is a 'locked' error", async () => {
    await expect(unlockPasskey(fakeAuth(PRF_A))).rejects.toMatchObject({ code: "locked" });
  });
});

describe("EIP-1193 provider", () => {
  const chain = avalancheFuji;
  const transport = (() => ({ request: async () => { throw new Error("no network in tests"); }, type: "fake" })) as any;

  it("answers accounts / chain without a prompt and signs with the in-memory key", async () => {
    const acct = await createPasskeyWallet(fakeAuth(PRF_A));
    const prov = createPasskeyProvider({ chain, transport, knownAddress: () => acct.address, ensureUnlocked: async () => getAccount()! });
    expect(await prov.request({ method: "eth_accounts" })).toEqual([acct.address]);
    expect(await prov.request({ method: "eth_chainId" })).toBe("0xa869");
    const sig = (await prov.request({ method: "personal_sign", params: ["0x68656c6c6f", acct.address] })) as `0x${string}`;
    expect(await verifyMessage({ address: acct.address, message: { raw: "0x68656c6c6f" }, signature: sig })).toBe(true);
    // the exact shape wagmi's walletClient sends for a permit: [address, JSON string] with EIP712Domain in types
    const typed = {
      types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }],
               Permit: [{ name: "owner", type: "address" }, { name: "value", type: "uint256" }, { name: "deadline", type: "uint256" }] },
      primaryType: "Permit", domain: { name: "VSP", chainId: 43113 },
      message: { owner: acct.address, value: "1000000000000000000", deadline: "1800000000" },
    };
    const tsig = (await prov.request({ method: "eth_signTypedData_v4", params: [acct.address, JSON.stringify(typed)] })) as `0x${string}`;
    expect(await verifyTypedData({ address: acct.address, domain: typed.domain, types: { Permit: typed.types.Permit }, primaryType: "Permit",
      message: { owner: acct.address, value: 1000000000000000000n, deadline: 1800000000n }, signature: tsig })).toBe(true);
  });

  it("stays on its chain and reports the wallet as the token's home", async () => {
    const prov = createPasskeyProvider({ chain, transport, knownAddress: () => null, ensureUnlocked: async () => { throw new PasskeyError("x", "locked"); } });
    expect(await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa869" }] })).toBeNull();
    await expect(prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa86a" }] })).rejects.toMatchObject({ code: 4902 });
    await expect(prov.request({ method: "wallet_addEthereumChain", params: [{}] })).rejects.toBeInstanceOf(ProviderRpcError);
    expect(await prov.request({ method: "wallet_watchAsset", params: [{}] })).toBe(true);
    expect(await prov.request({ method: "eth_accounts" })).toEqual([]);
  });

  it("while locked, a signature asks to unlock and reports clearly when it cannot", async () => {
    const stored = await createPasskeyWallet(fakeAuth(PRF_A)); lock();
    let prompted = 0;
    const prov = createPasskeyProvider({ chain, transport, knownAddress: () => stored.address,
      ensureUnlocked: async () => { prompted++; return unlockPasskey(fakeAuth(PRF_A)); } });
    expect(await prov.request({ method: "eth_accounts" })).toEqual([stored.address]);  // known while locked
    const sig = await prov.request({ method: "personal_sign", params: ["0x01", stored.address] });
    expect(prompted).toBe(1); expect(String(sig)).toMatch(/^0x/);
    lock();
    const refusing = createPasskeyProvider({ chain, transport, knownAddress: () => stored.address,
      ensureUnlocked: async () => { throw new PasskeyError("Unlock your passkey wallet first (the key icon in the header).", "locked"); } });
    await expect(refusing.request({ method: "personal_sign", params: ["0x01", stored.address] })).rejects.toMatchObject({ code: "locked" });
  });

  it("reads go to the public RPC list: primary + fallback, no app proxy", () => {
    expect(rpcUrlsFor(avalancheFuji)[0]).toBe("https://api.avax-test.network/ext/bc/C/rpc");
    expect(rpcUrlsFor(avalancheFuji).length).toBe(2);
    for (const u of rpcUrlsFor(avalancheFuji)) expect(u).not.toMatch(/verisphere\.co/);
  });
});

describe("wallet list", () => {
  it("puts Passkey first and hides it without WebAuthn", async () => {
    vi.resetModules();
    const { walletListWithPasskey } = await import("../wallet/passkey/wallet");
    const list = walletListWithPasskey(avalancheFuji);
    expect(list[0].groupName).toBe("No wallet app needed");
    const w = list[0].wallets[0]({ projectId: "x" } as any);
    expect(w.id).toBe("verispherePasskey");
    expect(w.hidden!()).toBe(true);  // node: no PublicKeyCredential
    (globalThis as any).window.PublicKeyCredential = function () {};
    expect(w.hidden!()).toBe(false);
    expect(list.length).toBeGreaterThan(1);  // the defaults follow
  });
});
