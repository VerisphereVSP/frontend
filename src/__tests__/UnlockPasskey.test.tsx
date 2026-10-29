// patch_fe_passkey_wallet / patch_fe_passkey_3b: the header chip — Unlock while locked, a badge once unlocked that opens
// the wallet panel (address, gas hint, recovery key after a fresh prompt, Lock now, Start over gated on the key having
// been shown); nothing for other connectors.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";

const wagmiState = { connector: { id: "verispherePasskey" }, isConnected: true, address: "0x1111111111111111111111111111111111111111" };
const disconnect = vi.fn();
vi.mock("wagmi", () => ({
  useAccount: () => wagmiState,
  useBalance: () => ({ data: { formatted: "0", value: 0n, symbol: "AVAX" } }),
  useDisconnect: () => ({ disconnect }),
}));
const exportMock = vi.fn(async () => ({ privateKey: "0x" + "ab".repeat(32), address: wagmiState.address }));
const forgetMock = vi.fn();
vi.mock("../wallet/passkey/connector", async (orig) => ({
  ...(await orig() as any), exportPrivateKey: () => exportMock(), forgetPasskeyWallet: () => forgetMock(),
}));

import UnlockPasskey from "../wallet/passkey/UnlockPasskey";
import { setAccount, setKnownAddress, lock, getState } from "../wallet/passkey/state";

describe("UnlockPasskey", () => {
  beforeEach(() => { setKnownAddress(wagmiState.address as any); });
  afterEach(() => { cleanup(); lock(); wagmiState.connector = { id: "verispherePasskey" }; wagmiState.isConnected = true; exportMock.mockClear(); forgetMock.mockClear(); disconnect.mockClear(); });

  it("shows Unlock while locked and the badge once the key is in memory", async () => {
    render(<UnlockPasskey />);
    expect(screen.getByTestId("passkey-unlock").textContent).toContain("Unlock");
    await act(async () => { setAccount({ address: wagmiState.address } as any); });
    expect(screen.queryByTestId("passkey-unlock")).toBeNull();
    expect(screen.getByTestId("passkey-unlocked").textContent).toContain("passkey");
  });

  it("renders nothing for other connectors or when disconnected", () => {
    wagmiState.connector = { id: "metaMaskSDK" };
    const { container } = render(<UnlockPasskey />);
    expect(container.innerHTML).toBe("");
    wagmiState.connector = { id: "verispherePasskey" }; wagmiState.isConnected = false;
    expect(render(<UnlockPasskey />).container.innerHTML).toBe("");
  });

  it("the panel: address, gas hint, recovery key after a fresh prompt, start over gated on it", async () => {  // patch_fe_passkey_3b
    await act(async () => { setAccount({ address: wagmiState.address } as any); });
    render(<UnlockPasskey />);
    fireEvent.click(screen.getByTestId("passkey-unlocked"));
    expect(screen.getByTestId("passkey-panel")).toBeTruthy();
    expect(screen.getByTestId("passkey-address").textContent).toBe(wagmiState.address);
    expect(screen.getByTestId("passkey-gas-hint").textContent).toMatch(/needs a little AVAX/);
    expect(screen.queryByTestId("passkey-secret")).toBeNull();
    // start over is blocked until the key has been shown
    fireEvent.click(screen.getByTestId("passkey-forget"));
    expect((screen.getByTestId("passkey-forget-go") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("passkey-forget-confirm").textContent).toMatch(/save the recovery key first/);
    // show the key: one fresh assertion, the hex on screen, Hide removes it
    await act(async () => { fireEvent.click(screen.getByTestId("passkey-export")); });
    await waitFor(() => screen.getByTestId("passkey-secret"));
    expect(exportMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("passkey-secret").textContent).toBe("0x" + "ab".repeat(32));
    expect((screen.getByTestId("passkey-forget-go") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText("Hide"));
    expect(screen.queryByTestId("passkey-secret")).toBeNull();
    // forget: clears the wallet and disconnects
    fireEvent.click(screen.getByTestId("passkey-forget-go"));
    expect(forgetMock).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("Lock now forgets the key for this session", async () => {  // patch_fe_passkey_3b
    await act(async () => { setAccount({ address: wagmiState.address } as any); });
    render(<UnlockPasskey />);
    fireEvent.click(screen.getByTestId("passkey-unlocked"));
    await act(async () => { fireEvent.click(screen.getByTestId("passkey-lock")); });
    expect(getState().unlocked).toBe(false);
    expect(screen.getByTestId("passkey-unlock")).toBeTruthy();
  });
});
