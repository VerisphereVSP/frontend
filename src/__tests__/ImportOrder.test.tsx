// patch_fe_invites: the app loads claims-shared before ShareClaim/Invitations; a module in that cycle must not touch
// claims-shared's exports at top level (10-30: a blank page on dev — TDZ on `S` inside Invitations.tsx).
import { describe, it, expect, vi } from "vitest";
vi.mock("wagmi", () => ({ useAccount: () => ({}), useWalletClient: () => ({}), usePublicClient: () => undefined, useChainId: () => 43113, useBalance: () => ({}), useDisconnect: () => ({ disconnect() {} }) }));
vi.mock("../contracts", () => ({ useContracts: () => ({ data: undefined }) }));
describe("import order", () => {
  it("claims-shared first, then the share/invitation modules, evaluates cleanly", async () => {
    const shared = await import("../components/claims-shared");
    expect(shared.S).toBeTruthy();
    const inv = await import("../components/Invitations");
    expect(typeof inv.InviteForm).toBe("function");
  });
});
