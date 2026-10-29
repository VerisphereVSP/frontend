// frontend/src/wallet/passkey/wallet.ts — patch_fe_passkey_wallet
// The RainbowKit entry: "Passkey" at the top of the Connect list, so the ordinary Connect button offers it first.
// Hidden where the browser has no WebAuthn at all; where PRF support is unknown it is offered and a missing PRF
// output is reported at creation (keys.ts).
import type { Wallet, WalletList } from "@rainbow-me/rainbowkit";
import { getDefaultWallets } from "@rainbow-me/rainbowkit";
import { createConnector } from "wagmi";
import type { Chain } from "viem";
import { passkeyConnector } from "./connector";

const ICON = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#5B4BC4"/>` +
  `<circle cx="19" cy="24" r="7" fill="none" stroke="#fff" stroke-width="3"/>` +
  `<path d="M26 24h12M33 24v6M38 24v5" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`);

export function passkeyWallet(chain: Chain): () => Wallet {
  return () => ({
    id: "verispherePasskey",
    name: "Passkey",
    shortName: "Passkey",
    iconUrl: ICON,
    iconBackground: "#5B4BC4",
    installed: true,
    hidden: () => typeof window === "undefined" || !(window as any).PublicKeyCredential,
    createConnector: (walletDetails) =>
      createConnector((config) => ({ ...passkeyConnector({ chain })(config), ...walletDetails })),
  });
}

/** The full wallet list: Passkey first, then RainbowKit's defaults (MetaMask, WalletConnect, …). */
export function walletListWithPasskey(chain: Chain): WalletList {
  return [
    { groupName: "No wallet app needed", wallets: [passkeyWallet(chain)] },
    ...getDefaultWallets().wallets,
  ];
}
