// patch_fe_add_vsp_wallet_2: the button must honour the per-browser flag even though the token address arrives late.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { markWatchAssetDone } from "../web3/watchAsset";

vi.mock("wagmi", () => ({
  useWalletClient: () => ({ data: { watchAsset: async () => true } }),
}));

import AddVspToWallet from "../components/AddVspToWallet";

const VSP = "0x0273B4D58E8991f71fC28d0377424d03d7c3b173" as const;

describe("AddVspToWallet", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("shows the button when the token is known and not yet added", () => {
    render(<AddVspToWallet token={VSP} />);
    expect(screen.queryByTestId("add-vsp-to-wallet")).not.toBeNull();
  });

  it("stays hidden once the browser has added the token, even when the address arrives after the first render", () => {
    markWatchAssetDone(VSP);
    const { rerender } = render(<AddVspToWallet token={undefined} />);
    expect(screen.queryByTestId("add-vsp-to-wallet")).toBeNull(); // no token yet: nothing to offer
    rerender(<AddVspToWallet token={VSP} />);
    expect(screen.queryByTestId("add-vsp-to-wallet")).toBeNull(); // flag honoured after the address arrives
  });

  it("hides itself after a successful add and remembers it for the next load", async () => {
    render(<AddVspToWallet token={VSP} />);
    await act(async () => { screen.getByTestId("add-vsp-to-wallet").click(); });
    expect(screen.queryByTestId("add-vsp-to-wallet")).toBeNull();
    expect(localStorage.getItem(`vsp:watchAsset:added:${VSP.toLowerCase()}`)).toBe("1");
  });
});
