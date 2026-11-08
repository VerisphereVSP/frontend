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
    // patch_fe_start_claim: the gift claims itself the moment the wallet is there — no button to miss
    await waitFor(() => expect(redeemCalls.length).toBe(1));
    expect(redeemCalls[0]).toEqual({ code: "VSP-AAAA-BBBB-CCCC", address: "0x2222222222222222222222222222222222222222" });
    await waitFor(() => screen.getByTestId("start-step-stake"));
  });

  it("step 2 → 3: claims the invitation, then stakes the pre-chosen side with the fee headroom taken off", async () => {
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    render(<StartOverlay postId={142} side="challenge" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => expect(redeemCalls).toEqual([{ code: "VSP-AAAA-BBBB-CCCC", address: "0x2222222222222222222222222222222222222222" }]));  // patch_fe_start_claim: automatic
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
    expect(screen.getByTestId("start-step-fund").textContent).toContain("If whoever shared this claim gave you an invitation code, enter it here");
    expect(screen.getByTestId("start-code-input")).toBeTruthy();  // patch_fe_start_claim: a link that lost its code is not a dead end
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
    await waitFor(() => screen.getByTestId("start-stake"));  // patch_fe_start_claim: the claim happened by itself
    await waitFor(() => expect((screen.getByTestId("start-amount") as HTMLInputElement).value).toBe("1.75"));
    await act(async () => { screen.getByTestId("start-stake").click(); });
    await waitFor(() => screen.getByTestId("start-done"));
    await waitFor(() => expect(posted).toEqual(["start_open", "start_wallet", "start_claim_shown", "start_claim_ok", "start_funded", "start_staked"]));
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
    expect(screen.getByTestId("start-rule").textContent).toBe("The score is a credibility signal, not a verdict and not a bet: it is what people are willing to stake behind each side. Your position earns or loses VSP over time by the claim's score — from the protocol, never from the other side. You can change or withdraw at any time.");
    expect(screen.getByTestId("start-step-stake").textContent).toContain("At a score of 0 nobody earns or loses; rates are bounded; nothing is ever resolved.");
    for (const banned of [/price/i, /invest/i, /return/i, /profit/i, /\btrue\b/i, /\bfalse\b/i]) expect(screen.getByTestId("start-overlay").textContent).not.toMatch(banned);
    const guide = readFileSync(resolve(process.cwd(), "public/docs/guide.md"), "utf8");
    expect(guide).toContain("paid by the protocol, never by the other side");
    expect(guide).toContain("## What this is — and what it isn't");
    expect(guide).not.toContain("If the claim holds up, you earn; if it doesn't, you lose.");
  });
});

// patch_fe_start_claim: the claim happens by itself, a failure can be retried, a lost code can be typed, the invitation
// is remembered until taken, and an in-app browser is told to open the real one.
import { readPendingInvite, rememberPendingInvite, forgetPendingInvite, pendingInviteUrl, inAppBrowser } from "../components/pending-invite";

describe("start claim (patch_fe_start_claim)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("claims even when the address lands while the connect is still in flight — the real passkey sequence", async () => {  // patch_fe_start_claim_2
    // a real passkey: the account hook reports the address before connectAsync resolves, so `busy` is still "wallet"
    // when the address appears. The sheet used to bail there and never claim.
    let release!: () => void;
    const { rerender } = render(<StartOverlay postId={142} side="challenge" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("start-overlay").textContent).toContain("Regular coffee consumption"));
    connectAsync.mockImplementationOnce(() => new Promise<void>((res) => { release = res; }));
    await act(async () => { screen.getByTestId("start-passkey").click(); });
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    await act(async () => { rerender(<StartOverlay postId={142} side="challenge" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />); });
    expect(redeemCalls).toEqual([]);                 // connect still in flight: nothing yet
    await act(async () => { release(); });            // connect returns, busy clears
    await waitFor(() => expect(redeemCalls.length).toBe(1));
    await waitFor(() => screen.getByTestId("start-step-stake"));
  });

  it("remembers the invitation while it is open and forgets it once the VSP has moved", async () => {
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    render(<StartOverlay postId={142} side="challenge" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => expect(readPendingInvite()?.code).toBe("VSP-AAAA-BBBB-CCCC"));
    await waitFor(() => expect(redeemCalls.length).toBe(1));
    await waitFor(() => expect(readPendingInvite()).toBeNull());
  });

  it("a spent code is not remembered", async () => {
    peek = { status: "redeemed", amount_vsp: "2", expires_at: "2026-12-01T00:00:00Z", post_id: 142 };
    rememberPendingInvite({ code: "VSP-AAAA-BBBB-CCCC", postId: 142, side: null });
    render(<StartOverlay postId={142} side={null} code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("start-code-note").textContent).toContain("already redeemed"));
    expect(readPendingInvite()).toBeNull();
    expect(redeemCalls).toEqual([]);
  });

  it("a failed claim says so and offers to try again; the funnel sees start_claim_fail", async () => {
    const posted: string[] = [];
    const readBlob = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: vi.fn((_u: string, b: Blob) => { readBlob(b).then((t) => posted.push(JSON.parse(t).step)); return true; }) });
    const base = globalThis.fetch as any;
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      if (String(url).endsWith("/invites/redeem") && fail) return new Response(JSON.stringify({ detail: "Relay busy" }), { status: 503 });
      return base(url, init);
    }));
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    render(<StartOverlay postId={142} side="support" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("start-claim"));
    expect(screen.getByTestId("start-claim").textContent).toBe("Try again — take the 2 VSP");
    expect(screen.getByTestId("start-error").textContent).toContain("Relay busy");
    await waitFor(() => expect(posted).toContain("start_claim_fail"));
    expect(readPendingInvite()?.code).toBe("VSP-AAAA-BBBB-CCCC");  // still waiting
    fail = false;
    await act(async () => { screen.getByTestId("start-claim").click(); });
    await waitFor(() => screen.getByTestId("start-step-stake"));
    expect(redeemCalls.length).toBe(1);
  });

  it("a link without a code: the code can be typed and taken", async () => {
    wagmiState.isConnected = true; wagmiState.address = "0x2222222222222222222222222222222222222222";
    render(<StartOverlay postId={142} side="support" code={null} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("start-code-input"));
    expect((screen.getByTestId("start-code-claim") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("start-code-input"), { target: { value: "vsp-aaaa-bbbb-cccc" } });
    expect((screen.getByTestId("start-code-input") as HTMLInputElement).value).toBe("VSP-AAAA-BBBB-CCCC");
    await act(async () => { screen.getByTestId("start-code-claim").click(); });
    expect(redeemCalls).toEqual([{ code: "VSP-AAAA-BBBB-CCCC", address: "0x2222222222222222222222222222222222222222" }]);
    await waitFor(() => screen.getByTestId("start-step-stake"));
  });

  it("inside Messenger's browser the first step says to open the real one, with the link to copy", async () => {
    const written: string[] = [];
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400.0]", clipboard: { writeText: async (t: string) => { written.push(t); } } });
    render(<StartOverlay postId={142} side="support" code="VSP-AAAA-BBBB-CCCC" onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("start-inapp"));
    await act(async () => { screen.getByTestId("start-copy-link").click(); });
    expect(written[0]).toContain("start=1&code=VSP-AAAA-BBBB-CCCC");
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36")).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 14) ... Instagram 300.0")).toBe(true);
  });

  it("the pending-invite store and the link that re-opens the sheet", () => {
    expect(readPendingInvite()).toBeNull();
    rememberPendingInvite({ code: "VSP-AAAA-BBBB-CCCC", postId: 142, side: "challenge" });
    const p = readPendingInvite()!;
    expect(p.code).toBe("VSP-AAAA-BBBB-CCCC");
    expect(pendingInviteUrl(p)).toBe("/claims?post=142&start=1&code=VSP-AAAA-BBBB-CCCC&side=challenge");
    forgetPendingInvite();
    expect(readPendingInvite()).toBeNull();
  });

  it("App shows the waiting-invitation banner until it is taken or dismissed", () => {
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(app).toContain('{pending && !start && (');
    expect(app).toContain('data-testid="pending-invite-take"');
    expect(app).toContain('setStart({ postId: p.postId, side: p.side, code: p.code }); navigate(pendingInviteUrl(p));');
    expect(app).toContain('data-testid="pending-invite-dismiss"');
    expect(app).toContain('useEffect(() => { if (!start) setPending(readPendingInvite()); }, [start]);');
  });

  it("the Claims view has a door for a code told by a friend, with no link at all", () => {
    const src = readFileSync(resolve(__dirname, "../components/ClaimsExplorer.tsx"), "utf8");
    expect(src).toContain('data-testid="have-code-open"');
    expect(src).toContain(">Have an invitation code?</button>");
    expect(src).toContain("{!inviteCode && goCode && <RedeemInvite key={goCode} code={goCode} />}");
  });

  it("plain words: the step headings and the skip", () => {
    const src = readFileSync(resolve(__dirname, "../components/StartOverlay.tsx"), "utf8");
    expect(src).toContain('h(1, "Open a wallet"');
    expect(src).toContain('openPeek ? `Your ${openPeek.amount_vsp} VSP`');
    expect(src).toContain("No thanks — just show me the claim");
    expect(src).not.toContain("Skip for now");
  });
});
