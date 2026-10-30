// patch_fe_invites: the invitation client helpers, the InviteForm (permit → POST), the RedeemInvite card, and the
// mounts (Positions list, Claims redeem card + collapsed-row share icon).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const wagmiState: any = { isConnected: true, address: "0x1111111111111111111111111111111111111111" };
const signed: any[] = [];
const walletClient = {
  account: { address: wagmiState.address },
  signTypedData: async (td: any) => { signed.push(td); return "0x" + "ab".repeat(64) + "1b"; },
  signMessage: async ({ message }: any) => { signed.push({ message }); return "0x" + "cd".repeat(65); },
};
const publicClient = { readContract: async ({ functionName }: any) => functionName === "eip712Domain" ? ["0x0f", "VSP", "1", 43113n, "0x0000000000000000000000000000000000000001", "0x", []] : 7n };
vi.mock("wagmi", () => ({ useAccount: () => wagmiState, useWalletClient: () => ({ data: walletClient }), usePublicClient: () => publicClient, useChainId: () => 43113 }));
vi.mock("../contracts", () => ({ useContracts: () => ({ data: { VSPToken: "0x0000000000000000000000000000000000000001" } }) }));

import { withInvite, codeFromLocation, daysLeft } from "../wallet/invites";
import { InviteForm, RedeemInvite, InvitesList } from "../components/Invitations";

const CONFIG = { escrow_address: "0x000000000000000000000000000000000000e5c0", min_vsp: "0.5", max_vsp: "100", max_days: 365, max_outstanding: 100, default_days: 30 };

describe("invites helpers", () => {
  it("withInvite appends the code to the link and a line to the text", () => {
    const { url, text } = withInvite("https://app.verisphere.co/c/9", "Think it's wrong? “x” — … Challenge it: https://app.verisphere.co/c/9", "VSP-AAAA-BBBB-CCCC", "2");
    expect(url).toBe("https://app.verisphere.co/c/9?code=VSP-AAAA-BBBB-CCCC");
    expect(text).toContain("Challenge it: https://app.verisphere.co/c/9?code=VSP-AAAA-BBBB-CCCC I've put 2 VSP on the table for you");
  });
  it("codeFromLocation and daysLeft", () => {
    expect(codeFromLocation("?post=9&side=support&code=VSP-AAAA-BBBB-CCCC&start=1")).toBe("VSP-AAAA-BBBB-CCCC");
    expect(codeFromLocation("?post=9")).toBeNull();
    expect(daysLeft(new Date(Date.now() + 2.5 * 86_400_000).toISOString())).toBe(3);
    expect(daysLeft(new Date(Date.now() - 1000).toISOString())).toBe(0);
  });
});

describe("InviteForm", () => {
  let calls: { url: string; init?: RequestInit }[];
  beforeEach(() => {
    calls = []; signed.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/invites/config")) return { ok: true, json: async () => CONFIG } as any;
      if (String(url).endsWith("/invites") && init?.method === "POST") return { ok: true, json: async () => ({ code: "VSP-QQQQ-WWWW-EEEE", code_hash: "h", amount_vsp: "2", expires_at: "2026-12-01T00:00:00Z", escrow_tx: "0x1", sponsor: wagmiState.address }) } as any;
      return { ok: false, status: 404, json: async () => ({ detail: "nope" }) } as any;
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("signs a permit naming the escrow and posts amount, days and permit", async () => {
    const issued = vi.fn();
    render(<InviteForm onIssued={issued} />);
    await waitFor(() => expect(screen.getByTestId("invite-form").textContent).toContain("0.5–100 VSP"));
    fireEvent.change(screen.getByTestId("invite-amount"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("invite-days"), { target: { value: "14" } });
    await act(async () => { fireEvent.click(screen.getByTestId("invite-submit")); });
    await waitFor(() => expect(issued).toHaveBeenCalledTimes(1));
    expect(signed[0].primaryType).toBe("Permit");
    expect(signed[0].message.spender).toBe(CONFIG.escrow_address);
    expect(signed[0].message.value).toBe(2n * 10n ** 18n);
    expect(signed[0].message.nonce).toBe(7n);
    const post = calls.find((c) => c.init?.method === "POST")!;
    const body = JSON.parse(String(post.init!.body));
    expect(body.amount_vsp).toBe("2"); expect(body.expires_days).toBe(14); expect(body.post_id).toBeNull();
    expect(body.permit.spender).toBe(CONFIG.escrow_address); expect(body.permit.owner).toBe(wagmiState.address);
    expect(issued.mock.calls[0][0].code).toBe("VSP-QQQQ-WWWW-EEEE");
  });

  it("sends the claim it was shared from, and says so", async () => {  // patch_fe_invites_2
    render(<InviteForm onIssued={vi.fn()} postId={116} />);
    await waitFor(() => expect(screen.getByTestId("invite-form").textContent).toContain("for claim #116"));
    expect(screen.getByTestId("invite-form").textContent).toContain("Expires in");
    expect(screen.getByTestId("invite-submit").textContent).toBe("Create invitation");
    await act(async () => { fireEvent.click(screen.getByTestId("invite-submit")); });
    await waitFor(() => expect(calls.some((c) => c.init?.method === "POST")).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "POST")!.init!.body)).post_id).toBe(116);
  });

  it("checks the knobs before asking for a signature", async () => {
    render(<InviteForm onIssued={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("invite-form").textContent).toContain("0.5–100 VSP"));
    fireEvent.change(screen.getByTestId("invite-amount"), { target: { value: "500" } });
    await act(async () => { fireEvent.click(screen.getByTestId("invite-submit")); });
    expect(screen.getByTestId("invite-error").textContent).toContain("0.5–100");
    expect(signed.length).toBe(0);
  });
});

describe("RedeemInvite", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); wagmiState.isConnected = true; });
  const stub = (peek: any) => vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/invites/peek")) return { ok: true, json: async () => peek } as any;
    if (String(url).endsWith("/invites/redeem")) return { ok: true, json: async () => ({ amount_vsp: peek.amount_vsp, tx_hash: "0x9", status: "redeemed" }) } as any;
    return { ok: false, status: 404, json: async () => ({}) } as any;
  }));

  it("shows what is on the table and claims it into the connected wallet", async () => {
    stub({ status: "open", amount_vsp: "2", expires_at: new Date(Date.now() + 10 * 86_400_000).toISOString() });
    render(<RedeemInvite code="VSP-AAAA-BBBB-CCCC" />);
    await waitFor(() => screen.getByTestId("redeem-card"));
    expect(screen.getByTestId("redeem-card").textContent).toContain("2 VSP is on the table for you");
    await act(async () => { fireEvent.click(screen.getByTestId("redeem-go")); });
    await waitFor(() => expect(screen.getByTestId("redeem-card").textContent).toContain("2 VSP is now in your wallet"));
    const redeem = (fetch as any).mock.calls.find((c: any[]) => String(c[0]).endsWith("/invites/redeem"));
    expect(JSON.parse(redeem[1].body)).toEqual({ code: "VSP-AAAA-BBBB-CCCC", address: wagmiState.address });
  });

  it("asks to connect when there is no wallet, and reports a used code", async () => {
    wagmiState.isConnected = false;
    stub({ status: "open", amount_vsp: "2", expires_at: new Date(Date.now() + 86_400_000).toISOString() });
    render(<RedeemInvite code="VSP-AAAA-BBBB-CCCC" />);
    await waitFor(() => screen.getByTestId("redeem-card"));
    expect(screen.getByTestId("redeem-card").textContent).toContain("Passkey");
    expect(screen.queryByTestId("redeem-go")).toBeNull();
    cleanup();
    stub({ status: "redeemed", amount_vsp: "2", expires_at: "2026-12-01T00:00:00Z" });
    render(<RedeemInvite code="VSP-AAAA-BBBB-CCCC" />);
    await waitFor(() => expect(screen.getByTestId("redeem-card").textContent).toContain("already redeemed"));
  });
});

describe("InvitesList", () => {  // patch_fe_invites_2
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("is compact: form behind a button, open codes with their claim, closed ones behind a toggle", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/invites?sponsor=")) return { ok: true, json: async () => ({ sponsor: wagmiState.address, open: 1, max_outstanding: 100, invites: [
        { id: 2, code_hash: "h2", amount_vsp: "2", created_at: "2026-10-30T09:00:00Z", expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), status: "open", redeemed_by: null, redeemed_at: null, escrow_tx: "0x1", redeem_tx: null, refund_tx: null, closed_at: null, post_id: 116 },
        { id: 1, code_hash: "h1", amount_vsp: "1", created_at: "2026-10-29T09:00:00Z", expires_at: "2026-11-28T09:00:00Z", status: "redeemed", redeemed_by: "0x00000000000000000000000000000000000000ab", redeemed_at: "2026-10-29T10:00:00Z", escrow_tx: "0x1", redeem_tx: "0x2", refund_tx: null, closed_at: null, post_id: null },
      ] }) } as any;
      if (String(url).endsWith("/invites/config")) return { ok: true, json: async () => CONFIG } as any;
      return { ok: false, status: 404, json: async () => ({}) } as any;
    }));
    render(<InvitesList />);
    await waitFor(() => screen.getAllByTestId("invite-row"));
    expect(screen.queryByTestId("invite-form")).toBeNull();                       // form only on demand
    expect(screen.getAllByTestId("invite-row").length).toBe(1);                   // closed rows hidden
    expect(screen.getByTestId("invite-for").textContent).toBe("claim #116");
    expect(screen.getByTestId("invites-list").textContent).toContain("1 open of 100");
    fireEvent.click(screen.getByTestId("invite-toggle-closed"));
    expect(screen.getAllByTestId("invite-row").length).toBe(2);
    expect(screen.getAllByTestId("invite-for")[1].textContent).toBe("any claim");
    fireEvent.click(screen.getByTestId("invite-new"));
    await waitFor(() => screen.getByTestId("invite-form"));
  });
});

describe("mounts", () => {
  it("Positions carries the list; Claims carries the redeem card and the collapsed-row share icon", () => {
    const portfolio = readFileSync(resolve(process.cwd(), "src/components/Portfolio.tsx"), "utf8");
    expect(portfolio).toContain("<InvitesList />");
    const claims = readFileSync(resolve(process.cwd(), "src/components/ClaimsExplorer.tsx"), "utf8");
    expect(claims).toContain("{inviteCode && <RedeemInvite code={inviteCode} />}");
    expect(claims).toContain("{loading && sorted.length === 0 ? (");  // patch_fe_invites_2: a refetch no longer unmounts the rows
    expect(claims).toContain('<ShareClaim postId={c.post_id} variant="icon" onActivate={() => setExpandedId(c.post_id)} />');
    expect(claims.indexOf("<Jazzicon address={c.creator} size={16} />")).toBeLessThan(claims.indexOf('variant="icon" onActivate={() => setExpandedId(c.post_id)}'));
  });
});
