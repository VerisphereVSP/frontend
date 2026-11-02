// patch_fe_start: the Start walk-through — wallet, VSP, stake — over the Claims view, from a share page's hand-off.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const wagmiState = { isConnected: false, address: undefined as string | undefined };
const connectAsync = vi.fn(async () => { wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222"; });
const connectors = [{ id: "io.metamask" }, { id: "verispherePasskey" }];
vi.mock("wagmi", () => ({ useAccount: () => wagmiState, useConnect: () => ({ connectors, connectAsync }) }));
const openConnectModal = vi.fn();
vi.mock("@rainbow-me/rainbowkit", () => ({ useConnectModal: () => ({ openConnectModal }) }));
const setStake = vi.fn(async () => undefined);
vi.mock("@verisphere/protocol", () => ({ useStake: () => ({ setStake }) }));
vi.mock("../wallet/passkey/connector", () => ({ PASSKEY_CONNECTOR_ID: "verispherePasskey" }));

import StartOverlay, { defaultStake } from "../components/StartOverlay";
import { startParams, closedStartUrl } from "../components/start-params";

const SNAP = { text: "Regular coffee consumption is associated with a lower risk of stroke.", band: "Supported", support_pct: 72, stake_line: "72 % of stake backs this claim" };
let balanceWei = "0";
let peek: any = { status: "open", amount_vsp: "2", expires_at: "2026-12-01T00:00:00Z", post_id: 142 };
let redeemCalls: any[] = [];

beforeEach(() => {
  wagmiState.isConnected = false; wagmiState.address = undefined; balanceWei = "0"; redeemCalls = [];
  peek = { status: "open", amount_vsp: "2", expires_at: "2026-12-01T00:00:00Z", post_id: 142 };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    const u = String(url);
    if (u.endsWith("/claims/142/snapshot")) return new Response(JSON.stringify(SNAP), { status: 200 });
    if (u.includes("/invites/peek")) return peek ? new Response(JSON.stringify(peek), { status: 200 }) : new Response(JSON.stringify({ detail: "No such invitation" }), { status: 404 });
    if (u.endsWith("/invites/redeem")) { redeemCalls.push(JSON.parse(init.body)); balanceWei = "2000000000000000000"; return new Response(JSON.stringify({ amount_vsp: "2", tx_hash: "0xabc", status: "redeemed" }), { status: 200 }); }
    if (u.includes("/token/balance")) return new Response(JSON.stringify({ balance: balanceWei }), { status: 200 });
    if (u.endsWith("/relay/fee-policy")) return new Response(JSON.stringify({ enabled: true, cap_vsp: 0.25, collector: "0xc" }), { status: 200 });
    return new Response("{}", { status: 404 });
  }));
  window.history.replaceState(null, "", "/claims?post=142&side=challenge&start=1&code=VSP-AAAA-BBBB-CCCC");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("start-params", () => {
  it("reads the hand-off and strips it on close", () => {
    expect(startParams("?post=142&side=challenge&start=1&code=VSP-AAAA-BBBB-CCCC")).toEqual({ postId: 142, side: "challenge", code: "VSP-AAAA-BBBB-CCCC" });
    expect(startParams("?post=142&side=support")).toBeNull();          // no start=1: the plain deep link
    expect(startParams("?post=x&start=1")).toBeNull();
    expect(startParams("?post=7&start=1")).toEqual({ postId: 7, side: null, code: null });
    expect(closedStartUrl("/claims", "?post=142&side=challenge&start=1&code=VSP-AAAA-BBBB-CCCC")).toBe("/claims?post=142");
  });
  it("defaults the stake below the balance by the fee cap, or a tenth", () => {
    expect(defaultStake(2, 0.25)).toBe("1.75");
    expect(defaultStake(2, null)).toBe("1.80");
    expect(defaultStake(0.2, 0.25)).toBe("0.18");  // cap above the balance: fall back to a tenth
    expect(defaultStake(0, 0.25)).toBe("0");
  });
});

describe("StartOverlay", () => {
  it("step 1: offers a passkey wallet first; connecting moves on to the invitation", async () => {
    const onClose = vi.fn();
    render(<StartOverlay postId={142} side="challenge" code="VSP-AAAA-BBBB-CCCC" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId("start-overlay").textContent).toContain("Regular coffee consumption"));
    expect(screen.getByTestId("start-step-wallet")).toBeTruthy();
    await act(async () => { screen.getByTestId("start-passkey").click(); });
    expect(connectAsync).toHaveBeenCalledWith({ connector: connectors[1] });
    // re-render with the connection the mock recorded
    cleanup();
    render(<StartOverlay postId={142} side="challenge" code="VSP-AAAA-BBBB-CCCC" onClose={onClose} />);
    await waitFor(() => screen.getByTestId("start-step-claim"));
    expect(screen.getByTestId("start-step-claim").textContent).toContain("2 VSP is on the table for you");
  });

  it("step 2 → 3: claims the invitation, then stakes the pre-chosen side with the fee headroom taken off", async () => {
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    render(<StartOverlay postId={142} side="challenge" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("start-claim"));
    await act(async () => { screen.getByTestId("start-claim").click(); });
    expect(redeemCalls).toEqual([{ code: "VSP-AAAA-BBBB-CCCC", address: "0x2222222222222222222222222222222222222222" }]);
    await waitFor(() => screen.getByTestId("start-step-stake"));
    await waitFor(() => expect((screen.getByTestId("start-amount") as HTMLInputElement).value).toBe("1.75"));  // 2 received − 0.25 cap
    expect(screen.getByTestId("start-stake").textContent).toBe("Stake 1.75 VSP to challenge it");  // the side from the share page
    await act(async () => { screen.getByTestId("start-stake").click(); });
    expect(setStake).toHaveBeenCalledWith(142, -1.75);  // challenge = negative target
    await waitFor(() => screen.getByTestId("start-done"));
    expect(screen.getByTestId("start-done").textContent).toContain("1.75 VSP challenging");
  });

  it("a used code is said once and the flow goes on; the side can be switched; the amount can be edited", async () => {
    peek = { status: "redeemed", amount_vsp: "2", expires_at: "2026-12-01T00:00:00Z" };
    balanceWei = "5000000000000000000";
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    render(<StartOverlay postId={142} side="support" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("start-code-note"));
    expect(screen.getByTestId("start-code-note").textContent).toContain("already redeemed");
    await waitFor(() => screen.getByTestId("start-step-stake"));  // the wallet holds 5 VSP: straight to the stake
    expect(screen.queryByTestId("start-step-claim")).toBeNull();
    await act(async () => { screen.getByTestId("start-side-challenge").click(); });
    fireEvent.change(screen.getByTestId("start-amount"), { target: { value: "1" } });
    await act(async () => { screen.getByTestId("start-stake").click(); });
    expect(setStake).toHaveBeenLastCalledWith(142, -1);
  });

  it("no code and no VSP: says how to get some, never blocks; skip strips the hand-off from the address bar", async () => {
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    window.history.replaceState(null, "", "/claims?post=142&side=support&start=1");
    const onClose = vi.fn();
    render(<StartOverlay postId={142} side="support" code={null} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("start-step-fund"));
    expect(screen.getByTestId("start-step-fund").textContent).toContain("ask whoever shared this claim for an invitation");
    expect(screen.getByTestId("start-step-fund").textContent).not.toMatch(/price|invest|return/i);
    await act(async () => { screen.getByTestId("start-skip").click(); });
    expect(onClose).toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe("/claims?post=142");
  });

  it("is mounted by App on the Claims view and the explorer leaves the code to it", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain('import StartOverlay from "./components/StartOverlay";');
    expect(app).toContain("const [start, setStart] = useState(() => startParams());");
    expect(app).toContain('{view === "claims" && start && <StartOverlay postId={start.postId} side={start.side} code={start.code} onClose={() => setStart(null)} />}');
    const explorer = readFileSync(resolve(process.cwd(), "src/components/ClaimsExplorer.tsx"), "utf8");
    expect(explorer).toContain("const inviteCode = startParams() ? null : codeFromLocation();");
    // no import cycle: the overlay and its params never touch claims-shared
    const overlay = readFileSync(resolve(process.cwd(), "src/components/StartOverlay.tsx"), "utf8");
    expect(overlay).not.toContain("claims-shared");
  });
});

describe("funnel counts (patch_fe_funnel)", () => {
  it("counts open → wallet → funded → staked once each, anonymously; skip counts start_skip", async () => {
    const posted: string[] = [];
    const readBlob = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });  // jsdom's Blob has no .text()
    const beacon = vi.fn((_url: string, blob: Blob) => { readBlob(blob).then((t) => posted.push(JSON.parse(t).step)); return true; });
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    render(<StartOverlay postId={142} side="support" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("start-claim"));
    await act(async () => { screen.getByTestId("start-claim").click(); });
    await waitFor(() => screen.getByTestId("start-stake"));
    await waitFor(() => expect((screen.getByTestId("start-amount") as HTMLInputElement).value).toBe("1.75"));
    await act(async () => { screen.getByTestId("start-stake").click(); });
    await waitFor(() => screen.getByTestId("start-done"));
    await waitFor(() => expect(posted).toEqual(["start_open", "start_wallet", "start_funded", "start_staked"]));
    for (const call of beacon.mock.calls) expect(call[0]).toBe("/api/funnel");
    const bodies = await Promise.all(beacon.mock.calls.map((c: any[]) => readBlob(c[1])));
    for (const b of bodies) expect(Object.keys(JSON.parse(b))).toEqual(["step"]);  // the step and nothing else
    await act(async () => { screen.getByTestId("start-see-claim").click(); });
    expect(posted).not.toContain("start_skip");  // closing after the stake is not a skip
    cleanup(); posted.length = 0; balanceWei = "0";  // the redeem above funded the mock wallet
    render(<StartOverlay postId={142} side="support" code={null} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("start-step-fund"));
    await act(async () => { screen.getByTestId("start-skip").click(); });
    await waitFor(() => expect(posted).toEqual(["start_open", "start_wallet", "start_skip"]));  // no VSP: never 'funded'
  });
});

describe("the rule (patch_payoff)", () => {
  it("step 3 states the payoff in the agreed words, with the fine print, and the guide opens with the same rule", async () => {
    balanceWei = "5000000000000000000";
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    render(<StartOverlay postId={142} side="support" code={null} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("start-step-stake"));
    expect(screen.getByTestId("start-rule").textContent).toBe("From tomorrow's settlement, your stake gains VSP every day the score stays on your side — and loses it every day it doesn't. The earlier you took the side, the better your rate. You can change or withdraw at any time.");
    expect(screen.getByTestId("start-step-stake").textContent).toContain("At a score of 0 nobody gains or loses; rates are bounded.");
    for (const banned of [/price/i, /invest/i, /return/i, /profit/i, /\btrue\b/i, /\bfalse\b/i]) expect(screen.getByTestId("start-overlay").textContent).not.toMatch(banned);
    const guide = readFileSync(resolve(process.cwd(), "public/docs/guide.md"), "utf8");
    expect(guide).toContain("Claims settle every day: the side the score favours gains VSP, the other side loses it. Right and early gains the most.");
    expect(guide).not.toContain("If the claim holds up, you earn; if it doesn't, you lose.");
  });
});
