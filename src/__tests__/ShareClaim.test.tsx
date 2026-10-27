// patch_fe_verisnap_share: the Share menu fetches the snapshot lazily, shows the card, and copies link / text.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ShareClaim from "../components/ShareClaim";

const SNAP = {
  post_id: 142, text: "Regular coffee consumption is associated with a lower risk of stroke.",
  verity_score: 44, band: "Mostly supported", band_role: "support", support_pct: 72,
  stake_line: "72 % of stake backs this claim", total_stake: 5840, snapshot_at: "2026-10-26T20:48:00Z",
  share_url: "https://app.verisphere.co/c/142", card_url: "https://app.verisphere.co/api/claims/142/card.png",
  app_url: "https://app.verisphere.co/claims?post=142",
  share_text: "“Regular coffee consumption is associated with a lower risk of stroke.” — Verisphere: Mostly supported, VS +44 (72 % of stake backs it). Details and evidence: https://app.verisphere.co/c/142",
};

describe("ShareClaim", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let written: string[];
  beforeEach(() => {
    written = [];
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/claims/142/snapshot")) return { ok: true, json: async () => SNAP } as any;
      return { ok: false, status: 404, json: async () => ({}) } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(navigator, { clipboard: { writeText: async (t: string) => { written.push(t); } } });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("fetches nothing until opened, then shows the card and the band", async () => {
    render(<ShareClaim postId={142} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { screen.getByTestId("share-claim").click(); });
    await waitFor(() => expect(screen.getByTestId("share-menu")).toBeTruthy());
    await waitFor(() => expect(screen.getByAltText(/Verisphere Snapshot of claim #142/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Mostly supported · 72 % of stake backs this claim/)).toBeTruthy();
    expect((screen.getByLabelText("Share link") as HTMLInputElement).value).toBe(SNAP.share_url);
    expect(document.body.textContent).not.toContain("Verisnap");  // patch_snapshot_naming
    expect(screen.getByTestId("share-claim").getAttribute("title")).not.toContain("Verisnap");
  });

  it("copies the share link and the text form", async () => {
    render(<ShareClaim postId={142} />);
    await act(async () => { screen.getByTestId("share-claim").click(); });
    await waitFor(() => screen.getByTestId("share-copy-link"));
    await act(async () => { screen.getByTestId("share-copy-link").click(); });
    expect(written).toEqual([SNAP.share_url]);
    expect(screen.getByTestId("share-note").textContent).toBe("Link copied");
    await act(async () => { screen.getByTestId("share-copy-text").click(); });
    expect(written[1]).toBe(SNAP.share_text);
  });

  it("the icon variant is labelled and does not propagate clicks to the sentence/row behind it", async () => {
    const outer = vi.fn();
    render(<div onClick={outer}><ShareClaim postId={142} variant="icon" /></div>);
    const btn = screen.getByTestId("share-claim");
    expect(btn.getAttribute("aria-label")).toBe("Share this claim");
    await act(async () => { btn.click(); });
    expect(outer).not.toHaveBeenCalled();
    await waitFor(() => screen.getByTestId("share-menu"));
  });

  it("the claims view honours the /claims?post=<id> deep link", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/ClaimsExplorer.tsx"), "utf8");
    expect(src).toContain('new URLSearchParams(window.location.search).get("post")');
    expect(src).toContain("patch_fe_verisnap_share");
    const shared = readFileSync(resolve(process.cwd(), "src/components/claims-shared.tsx"), "utf8");
    expect(shared).toContain('<ShareClaim postId={c.post_id} variant="button" />');
    const article = readFileSync(resolve(process.cwd(), "src/components/article/ArticleView.tsx"), "utf8");
    expect((article.match(/<ShareClaim postId=\{s\.post_id\} variant="icon" \/>/g) || []).length).toBe(2);  // both Explore lanes
  });
});
