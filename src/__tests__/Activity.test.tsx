// patch_fe_activity: the activity client (cursor, words), the Activity view, the badge hook and the App mounts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, waitFor, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const wagmiState: any = { isConnected: true, address: "0x1111111111111111111111111111111111111111" };
vi.mock("wagmi", () => ({ useAccount: () => wagmiState }));
const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }));

import { describeClaim, readCursor, writeCursor, roleLabel, when, ActivityClaim } from "../activity";
import ActivityView, { useActivityCount, SEEN_EVENT } from "../components/ActivityView";

const ADDR = wagmiState.address;
const base: ActivityClaim = { post_id: 142, text: "Regular coffee consumption is associated with a lower risk of stroke.", role: "support", your_vsp: 25,
  support_n: 0, challenge_n: 0, support_vsp: 0, challenge_vsp: 0, unstake_n: 0, unstake_vsp: 0, links_n: 0, links_challenge_n: 0, wallets_n: 0,
  score_before: null, score_now: null, flipped: false, latest_epoch: Math.floor(Date.now() / 1000), last_id: 4 };
const feed = (over: Partial<any> = {}) => ({ address: ADDR, since: null, cursor: 4, cursor_ts: "2026-11-04T10:00:00+00:00", claims: [], invites: [], count: 0, ...over });

let responses: Record<string, any>;
beforeEach(() => {
  localStorage.clear();
  navigate.mockReset();
  responses = {};
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => responses[key] };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("activity words", () => {
  it("says who did what and where the score went, and calls a flip against your side", () => {
    const d = describeClaim({ ...base, challenge_n: 2, challenge_vsp: 100, support_n: 1, support_vsp: 5, score_before: 61.3, score_now: 38.5, flipped: true });
    expect(d.moves).toBe("2 wallets challenged it (+100 VSP) · 1 wallet supported it (+5 VSP)");
    expect(d.score).toBe("61 % → 39 % of the stake backs it");
    expect(d.flip).toBe("Your side lost the majority.");
  });
  it("a flip toward a challenger's side, and for a creator", () => {
    expect(describeClaim({ ...base, role: "challenge", challenge_n: 1, challenge_vsp: 1, score_before: 60, score_now: 40, flipped: true }).flip).toBe("Your side now holds the majority.");
    expect(describeClaim({ ...base, role: "creator", support_n: 1, support_vsp: 1, score_before: 40, score_now: 60, flipped: true }).flip).toBe("Support now holds the majority.");
  });
  it("withdrawals and evidence; an unchanged score is stated once; no score when nothing is staked", () => {
    const d = describeClaim({ ...base, unstake_n: 1, unstake_vsp: 20, links_n: 2, links_challenge_n: 1, score_before: 71.4, score_now: 71.2 });
    expect(d.moves).toBe("1 withdrawal (−20 VSP) · 1 piece of evidence linked for it · 1 piece of evidence linked against it");
    expect(d.score).toBe("71 % of the stake backs it");
    expect(describeClaim({ ...base, links_n: 1 }).score).toBeNull();
  });
  it("role labels, cursor round trip, when()", () => {
    expect(roleLabel("support")).toBe("you support");
    expect(roleLabel("creator")).toBe("your claim");
    expect(readCursor(ADDR)).toBeNull();
    writeCursor(ADDR, { since: 9, since_ts: "2026-11-04T10:00:00+00:00" });
    expect(readCursor(ADDR.toUpperCase())).toEqual({ since: 9, since_ts: "2026-11-04T10:00:00+00:00" });
    expect(when(Math.floor(Date.now() / 1000))).toBe("today");
    expect(when(Math.floor(Date.now() / 1000) - 2 * 86_400)).toBe("2 days ago");
  });
});

describe("ActivityView", () => {
  it("renders a card per claim and the redeemed invitation, opens the claim, and moves the cursor on leaving", async () => {
    responses["/activity/" + ADDR + "?"] = feed({ count: 2,
      claims: [{ ...base, challenge_n: 2, challenge_vsp: 100, score_before: 61.3, score_now: 38.5, flipped: true }],
      invites: [{ id: 1, amount_vsp: 2, post_id: 9, redeemed_at: new Date().toISOString() }] });
    const r = render(<MemoryRouter><ActivityView /></MemoryRouter>);
    await screen.findByTestId("activity-claim");
    expect(screen.getByText(/2 wallets challenged it/)).toBeTruthy();
    expect(screen.getByTestId("activity-flip").textContent).toBe("Your side lost the majority.");
    expect(screen.getByTestId("activity-invite").textContent).toContain("Your invitation was redeemed — 2 VSP");
    expect(screen.getByText("The last 7 days", { exact: false })).toBeTruthy();
    // the request carried no cursor on the first look
    expect(((globalThis as any).fetch as any).mock.calls[0][0]).toBe("/api/activity/" + ADDR + "?limit=30");
    fireEvent.click(screen.getByTestId("activity-claim"));
    expect(navigate).toHaveBeenCalledWith("/claims?post=142");
    expect(readCursor(ADDR)).toBeNull();  // still reading
    r.unmount();
    expect(readCursor(ADDR)).toEqual({ since: 4, since_ts: "2026-11-04T10:00:00+00:00" });
  });
  it("sends the stored cursor, says since when, and Mark all as seen advances it at once", async () => {
    writeCursor(ADDR, { since: 2, since_ts: "2026-11-01T08:00:00+00:00" });
    responses["/activity/" + ADDR + "?"] = feed({ count: 1, claims: [{ ...base, support_n: 1, support_vsp: 5, score_now: 60 }] });
    const seen = vi.fn();
    window.addEventListener(SEEN_EVENT, seen);
    render(<MemoryRouter><ActivityView /></MemoryRouter>);
    await screen.findByTestId("activity-claim");
    expect(((globalThis as any).fetch as any).mock.calls[0][0]).toBe("/api/activity/" + ADDR + "?limit=30&since=2&since_ts=2026-11-01T08%3A00%3A00%2B00%3A00");
    expect(screen.getByText(/Since you last looked \(Nov 1\)/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("activity-seen"));
    expect(readCursor(ADDR)!.since).toBe(4);
    expect(seen).toHaveBeenCalled();
    expect(screen.queryByTestId("activity-seen")).toBeNull();
    window.removeEventListener(SEEN_EVENT, seen);
  });
  it("empty state, error state, and the connect hint", async () => {
    responses["/activity/" + ADDR + "?"] = feed();
    render(<MemoryRouter><ActivityView /></MemoryRouter>);
    expect((await screen.findByTestId("activity-empty")).textContent).toContain("Nothing new on your claims");
    cleanup();
    responses = {};
    render(<MemoryRouter><ActivityView /></MemoryRouter>);
    expect((await screen.findByText(/activity 404/)).textContent).toContain("activity 404");
    cleanup();
    wagmiState.isConnected = false;
    render(<MemoryRouter><ActivityView /></MemoryRouter>);
    expect(screen.getByText(/Connect a wallet to see what happened/)).toBeTruthy();
    wagmiState.isConnected = true;
  });
});

describe("useActivityCount", () => {
  it("polls the count with the cursor, re-polls on the seen event, and is 0 while the view is open or without a wallet", async () => {
    writeCursor(ADDR, { since: 2, since_ts: "2026-11-01T08:00:00+00:00" });
    responses["/count"] = { count: 3, cursor: 5, cursor_ts: "x" };
    const { result, rerender } = renderHook(({ a, p }: { a?: string; p: boolean }) => useActivityCount(a, p), { initialProps: { a: ADDR, p: false } });
    await waitFor(() => expect(result.current).toBe(3));
    expect(((globalThis as any).fetch as any).mock.calls[0][0]).toBe("/api/activity/" + ADDR + "/count?since=2&since_ts=2026-11-01T08%3A00%3A00%2B00%3A00");
    rerender({ a: ADDR, p: true });
    expect(result.current).toBe(0);
    responses["/count"] = { count: 0, cursor: 5, cursor_ts: "x" };
    rerender({ a: ADDR, p: false });
    await act(async () => { window.dispatchEvent(new Event(SEEN_EVENT)); });
    await waitFor(() => expect(result.current).toBe(0));
    rerender({ a: undefined, p: false });
    expect(result.current).toBe(0);
  });
});

describe("App mounts", () => {
  const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
  it("has the Activity view, its nav button with the badge, and the route", () => {
    // patch_fe_activity_bell: a bell, not a tab — shown only with news (or while on the view), styled apart from the tabs
    expect(app).not.toContain('navBtn("Activity"');
    expect(app).toContain('isConnected && (activityCount > 0 || view === "activity") && (');
    expect(app).toContain('data-testid="activity-bell"');
    expect(app).toContain('on your claims` : "Activity"');
    expect(app).toContain('location.pathname === "/activity" ? "activity"');
    expect(app).toContain('else if (v === "activity") navigate("/activity")');
    expect(app).toContain('{view === "activity" && <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}><ActivityView /></div>}');
    expect(app).toContain('useActivityCount(isConnected ? address : undefined, view === "activity")');
    // the bell sits before Transactions, both only for a connected wallet
    expect(app.indexOf('data-testid="activity-bell"')).toBeLessThan(app.indexOf('navBtn("Transactions"'));
  });
});
