// patch_fe_verisnap_share: the Share menu fetches the snapshot lazily, shows the card, and copies link / text.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ShareClaim, { snapshotHtml } from "../components/ShareClaim";

const SNAP = {
  post_id: 142, text: "Regular coffee consumption is associated with a lower risk of stroke.",
  verity_score: 44, band: "Mostly supported", band_role: "support", support_pct: 72,
  stake_line: "72 % of stake backs this claim", total_stake: 5840, snapshot_at: "2026-10-26T20:48:00Z",
  share_url: "https://app.verisphere.co/c/142", card_url: "https://app.verisphere.co/api/claims/142/card.png",
  app_url: "https://app.verisphere.co/claims?post=142",
  invite_question: "Think it's wrong?", invite_call: "Challenge it", invite_line: "Think it's wrong? Challenge it at app.verisphere.co/c/142",
  share_text: "Think it's wrong? “Regular coffee consumption is associated with a lower risk of stroke.” — 72 % of stake on Verisphere backs it (Mostly supported, VS +44). Challenge it: https://app.verisphere.co/c/142",
};
const PNG = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
const readBlob = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });  // jsdom Blob has no .text()

describe("ShareClaim", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let written: string[];
  let items: any[];
  beforeEach(() => {
    written = []; items = [];
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/claims/142/snapshot")) return { ok: true, json: async () => SNAP } as any;
      if (String(url).endsWith("/claims/142/card.png")) return { ok: true, blob: async () => PNG } as any;
      return { ok: false, status: 404, json: async () => ({}) } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(navigator, { clipboard: { writeText: async (t: string) => { written.push(t); }, write: async (its: any[]) => { items.push(...its); } } });
    vi.stubGlobal("ClipboardItem", class { parts: Record<string, any>; constructor(parts: Record<string, any>) { this.parts = parts; } });  // patch_fe_copy_snapshot
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

  it("Copy snapshot writes text and HTML (card linked) in one clipboard item and confirms on the button", async () => {  // patch_fe_copy_snapshot / patch_fe_share_fixes
    render(<ShareClaim postId={142} />);
    await act(async () => { screen.getByTestId("share-claim").click(); });
    await waitFor(() => screen.getByTestId("share-copy-snapshot"));
    await act(async () => { screen.getByTestId("share-copy-snapshot").click(); });
    await waitFor(() => expect(screen.getByTestId("share-note").textContent).toMatch(/^Snapshot copied/));
    expect(screen.getByTestId("share-copy-snapshot").textContent).toBe("Copied ✓");  // feedback on the button itself
    expect(items.length).toBe(1);
    const parts = items[0].parts;
    expect(Object.keys(parts).sort()).toEqual(["text/html", "text/plain"]);  // no PNG: chats would attach it instead of unfurling the link
    expect(await readBlob(parts["text/plain"])).toBe(SNAP.share_text);
    const html = await readBlob(parts["text/html"]);
    expect(html).toContain(`<img src="${SNAP.card_url}"`);
    expect(html).toContain(`<a href="${SNAP.share_url}">`);
    expect(html).toContain("Think it's wrong? “Regular coffee");  // the text form, readable
    expect(written).toEqual([]);  // no plain-text fallback was needed
    expect(fetchMock.mock.calls.some((c: any[]) => String(c[0]).endsWith("/card.png"))).toBe(false);  // nothing downloaded
  });

  it("Copy snapshot falls back to plain text where ClipboardItem is missing", async () => {  // patch_fe_copy_snapshot
    vi.stubGlobal("ClipboardItem", undefined);
    render(<ShareClaim postId={142} />);
    await act(async () => { screen.getByTestId("share-claim").click(); });
    await waitFor(() => screen.getByTestId("share-copy-snapshot"));
    await act(async () => { screen.getByTestId("share-copy-snapshot").click(); });
    await waitFor(() => expect(screen.getByTestId("share-note").textContent).toMatch(/^Text copied/));
    expect(written).toEqual([SNAP.share_text]);
    expect(screen.queryByTestId("share-native")).toBeNull();  // jsdom has no navigator.share
  });

  it("snapshotHtml escapes the claim and links the url", () => {  // patch_fe_copy_snapshot
    const html = snapshotHtml({ ...SNAP, share_text: 'Says <b>"hi"</b> & bye: https://app.verisphere.co/c/142' } as any);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;&quot;hi&quot;&lt;/b&gt; &amp; bye");
    expect(html).toContain('<a href="https://app.verisphere.co/c/142">https://app.verisphere.co/c/142</a>');
  });

  it("the icon variant opens no menu of its own: it activates the claim and the claim's Share button opens", async () => {  // patch_fe_share_fixes
    const outer = vi.fn(); const activate = vi.fn();
    render(<div onClick={outer}><ShareClaim postId={142} variant="icon" onActivate={activate} /></div>);
    const btn = screen.getByTestId("share-claim");
    expect(btn.getAttribute("aria-label")).toBe("Share this claim");
    await act(async () => { btn.click(); });
    expect(outer).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("share-menu")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    // the claim's Share button mounts afterwards (the page opened the claim) and finds the pending request
    render(<ShareClaim postId={142} variant="button" />);
    await waitFor(() => screen.getByTestId("share-menu"));
    await waitFor(() => expect(screen.getByAltText(/Verisphere Snapshot of claim #142/)).toBeTruthy());
  });

  it("an already-mounted Share button opens on the icon's request; other claims' buttons do not", async () => {  // patch_fe_share_fixes
    render(<><ShareClaim postId={142} variant="button" /><ShareClaim postId={7} variant="button" /><ShareClaim postId={142} variant="icon" /></>);
    const [b142, b7, icon] = screen.getAllByTestId("share-claim");
    expect(screen.queryByTestId("share-menu")).toBeNull();
    await act(async () => { icon.click(); });
    await waitFor(() => screen.getByTestId("share-menu"));
    expect(screen.getAllByTestId("share-menu").length).toBe(1);
    expect(b142.parentElement!.querySelector('[data-testid="share-menu"]')).toBeTruthy();
    expect(b7.parentElement!.querySelector('[data-testid="share-menu"]')).toBeNull();
  });

  it("Copy link confirms on its button", async () => {  // patch_fe_share_fixes
    render(<ShareClaim postId={142} />);
    await act(async () => { screen.getByTestId("share-claim").click(); });
    await waitFor(() => screen.getByTestId("share-copy-link"));
    await act(async () => { screen.getByTestId("share-copy-link").click(); });
    await waitFor(() => expect(screen.getByTestId("share-copy-link").textContent).toBe("Copied ✓"));
    expect(screen.getByTestId("share-note").textContent).toBe("Link copied");
  });

  it("the claims view honours the /claims?post=<id> deep link", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/ClaimsExplorer.tsx"), "utf8");
    expect(src).toContain('new URLSearchParams(window.location.search).get("post")');
    expect(src).toContain("patch_fe_verisnap_share");
    const shared = readFileSync(resolve(process.cwd(), "src/components/claims-shared.tsx"), "utf8");
    expect(shared).toContain('<ShareClaim postId={c.post_id} variant="button" />');
    const article = readFileSync(resolve(process.cwd(), "src/components/article/ArticleView.tsx"), "utf8");
    expect((article.match(/<ShareClaim postId=\{s\.post_id\} variant="icon" onActivate=\{\(\) => \{ if \(selId !== s\.sentence_id\) \{ setSelId\(s\.sentence_id\);/g) || []).length).toBe(2);  // both Explore lanes select the sentence (patch_fe_share_fixes)
  });
});
