// patch_fe_passkey_wallet: the header chip — Unlock while locked, a badge once unlocked, nothing for other connectors.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

const wagmiState = { connector: { id: "verispherePasskey" }, isConnected: true };
vi.mock("wagmi", () => ({ useAccount: () => wagmiState }));

import UnlockPasskey from "../wallet/passkey/UnlockPasskey";
import { setAccount, setKnownAddress, lock } from "../wallet/passkey/state";

describe("UnlockPasskey", () => {
  afterEach(() => { cleanup(); lock(); wagmiState.connector = { id: "verispherePasskey" }; wagmiState.isConnected = true; });

  it("shows Unlock while locked and the badge once the key is in memory", async () => {
    setKnownAddress("0x1111111111111111111111111111111111111111");
    render(<UnlockPasskey />);
    expect(screen.getByTestId("passkey-unlock").textContent).toContain("Unlock");
    await act(async () => { setAccount({ address: "0x1111111111111111111111111111111111111111" } as any); });
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
});
