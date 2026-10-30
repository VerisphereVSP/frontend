// patch_fe_verisnap_share / patch_fe_share_prominent — Share a claim as a Verisphere Snapshot (patch_snapshot_naming: the "Verisnap" working name is retired): copy the share link (unfurls into the card), the text form,
// or the card image. Reads the app's snapshot endpoint (app PR #46) lazily when opened; nothing is rendered until then.
// patch_fe_copy_snapshot — one primary action, "Copy snapshot", writes text + HTML (card image, linked) + PNG in a single
// clipboard write, so a rich editor pastes the card with its caption and a plain box pastes the text whose link unfurls;
// "Share…" opens the native share sheet (image + text together) where the browser has one (phones). The single-format
// buttons remain below for when a target wants exactly one form.
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { S } from "./claims-shared";
import { InviteForm } from "./Invitations";  // patch_fe_invites
import { withInvite, type InviteIssued } from "../wallet/invites";  // patch_fe_invites

const API = import.meta.env.VITE_API_BASE || "/api";

export type Snapshot = {
  post_id: number;
  text: string;
  verity_score: number;
  band: string;
  band_role: "support" | "challenge" | "neutral";
  support_pct: number | null;
  stake_line: string;
  total_stake: number;
  snapshot_at: string;
  share_url: string;
  card_url: string;
  app_url: string;
  share_text: string;
  invite_question?: string;  // patch_snapshot_invite (app)
  invite_call?: string;
  invite_line?: string;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The HTML form of a snapshot: the card (linked to the share page) and the text form with its link live. */
export function snapshotHtml(snap: Snapshot): string {
  const alt = escapeHtml(`Verisphere Snapshot of claim #${snap.post_id}: ${snap.band}`);
  const text = escapeHtml(snap.share_text).replace(
    escapeHtml(snap.share_url),
    `<a href="${escapeHtml(snap.share_url)}">${escapeHtml(snap.share_url)}</a>`,
  ).replace(/\n/g, "<br>");
  return `<div><a href="${escapeHtml(snap.share_url)}"><img src="${escapeHtml(snap.card_url)}" width="600" alt="${alt}"></a><p>${text}</p></div>`;
}

const blobOf = (s: string, type: string) => new Blob([s], { type });

/**
 * One clipboard write with two representations: text/plain (the text form) and text/html (the card image linked to
 * the share page + the text with its link live). Rich editors take the HTML, chat boxes take the text and unfurl its
 * link into the card. patch_fe_share_fixes: the PNG is no longer part of this write — chat apps (WhatsApp Web) treat a
 * pasted image as an upload and attach it instead of unfurling the link, and that upload failed; the image stays one
 * click away under "Copy image" and rides the native share sheet on phones. Falls back to plain text where
 * ClipboardItem is missing (older Firefox).
 */
export async function copySnapshot(snap: Snapshot): Promise<"full" | "text" | "failed"> {
  const Item = (window as any).ClipboardItem;
  const clip: any = navigator.clipboard;
  if (Item && clip && clip.write) {
    try {
      await clip.write([new Item({
        "text/plain": blobOf(snap.share_text, "text/plain"),
        "text/html": blobOf(snapshotHtml(snap), "text/html"),
      })]);
      return "full";
    } catch { /* fall through */ }
  }
  return (await copyText(snap.share_text)) ? "text" : "failed";
}

// patch_fe_share_fixes — opening the Share menu from somewhere else (the small icon in Explore): the icon no longer
// opens a menu of its own inside the sentence (it was clipped by the scrollable Disputed box); it asks the page to
// open the claim and the claim's own Share button opens. A module-level "pending" covers the mount race: the button
// may not exist yet when the icon is clicked, so it also checks on mount.
let pendingOpen: number | null = null;
// patch_fe_invites_2 — an invitation issued from this menu survives a remount: the escrow transfer lands in
// Transactions, the app refreshes on tx-resolved, and the row (menu included) may be rebuilt meanwhile.
const issuedByPost = new Map<number, InviteIssued>();
const reopenAfterRemount = new Map<number, number>();  // postId → time an invitation was issued; a remount within 60 s reopens the menu
export function requestShareOpen(postId: number) {
  pendingOpen = postId;
  window.dispatchEvent(new CustomEvent("verisphere:share-open", { detail: { postId } }));
}

export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof (navigator as any).share === "function";
}

/** The native share sheet: image + text + link together where files are accepted, text + link otherwise. */
export async function shareSnapshot(snap: Snapshot): Promise<"shared" | "cancelled" | "failed"> {
  const nav: any = navigator;
  const base = { title: `Verisphere Snapshot of claim #${snap.post_id}`, text: snap.share_text, url: snap.share_url };
  try {
    let data: any = base;
    try {
      const r = await fetch(snap.card_url);
      if (r.ok) {
        const file = new File([await r.blob()], `verisphere-snapshot-${snap.post_id}.png`, { type: "image/png" });
        if (!nav.canShare || nav.canShare({ files: [file] })) data = { ...base, files: [file] };
      }
    } catch { /* share without the image */ }
    await nav.share(data);
    return "shared";
  } catch (e: any) {
    return e && e.name === "AbortError" ? "cancelled" : "failed";
  }
}

export async function fetchSnapshot(postId: number): Promise<Snapshot> {
  const r = await fetch(`${API}/claims/${postId}/snapshot`);
  if (!r.ok) throw new Error(`snapshot ${r.status}`);
  return r.json();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copies the PNG to the clipboard where the browser allows it (Chromium, Safari 13.1+); otherwise opens it. */
async function copyImage(url: string): Promise<"copied" | "opened" | "failed"> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const Item = (window as any).ClipboardItem;
    if (Item && navigator.clipboard && (navigator.clipboard as any).write) {
      await (navigator.clipboard as any).write([new Item({ "image/png": blob })]);
      return "copied";
    }
  } catch {
    /* fall through */
  }
  try {
    window.open(url, "_blank", "noopener");
    return "opened";
  } catch {
    return "failed";
  }
}

const ShareIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

/**
 * variant "button": the prominent violet Share button (claim detail rows — Claims, Positions);
 * "icon": a small icon-only control that sits after the VS pill inside a sentence (Explore);
 * "link": the quiet text form.
 * patch_fe_share_fixes: the icon variant opens no menu of its own — it calls onActivate (the page opens the claim) and
 * asks the claim's Share button to open; every copy action confirms on the button itself ("Copied ✓") and in a note
 * directly under the buttons; Copy snapshot writes text + HTML (no PNG — see copySnapshot).
 */
export default function ShareClaim({ postId, variant = "button", onActivate }: { postId: number; variant?: "button" | "icon" | "link"; onActivate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);  // which button just succeeded (shows "Copied ✓")
  const boxRef = useRef<HTMLDivElement>(null);
  // patch_fe_invites — an invitation attached to this share: the link carries ?code=, the text says what is on the table
  const { isConnected } = useAccount();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<InviteIssued | null>(() => issuedByPost.get(postId) ?? null);

  // the claim's Share button opens when the small icon elsewhere asked for it (now, or just before this mounted)
  useEffect(() => {
    if (variant === "icon") return;
    if (pendingOpen === postId) { pendingOpen = null; setOpen(true); }
    const t = reopenAfterRemount.get(postId);
    if (t != null) { reopenAfterRemount.delete(postId); if (Date.now() - t < 60_000) setOpen(true); }
    const onAsk = (e: Event) => {
      if ((e as CustomEvent).detail?.postId === postId) { pendingOpen = null; setOpen(true); }
    };
    window.addEventListener("verisphere:share-open", onAsk);
    return () => window.removeEventListener("verisphere:share-open", onAsk);
  }, [postId, variant]);

  useEffect(() => {
    if (!open || snap) return;
    let alive = true;
    fetchSnapshot(postId)
      .then((s) => { if (alive) setSnap(s); })
      .catch(() => { if (alive) setError("Snapshot unavailable right now."); });
    return () => { alive = false; };
  }, [open, postId, snap]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const flash = (msg: string, key: string | null = null) => {
    setNote(msg);
    setDone(key);
    setTimeout(() => { setNote(null); setDone(null); }, 2200);
  };

  const btn: React.CSSProperties = {
    height: 30, padding: "0 10px", borderRadius: 7, border: `1px solid ${S.border}`, background: "#fff",
    color: S.text, fontSize: 11, fontWeight: 600, cursor: "pointer",
  };
  const okStyle = (key: string, base: React.CSSProperties): React.CSSProperties =>
    done === key ? { ...base, background: "#DCFCE7", color: S.green, borderColor: S.green } : base;
  const label = (key: string, text: string) => (done === key ? "Copied ✓" : text);

  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  const trigger: React.CSSProperties =
    variant === "button"
      ? { display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px", borderRadius: 999, border: "1px solid #5B4BC4",
          background: open ? "#37299B" : "#5B4BC4", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }
      : variant === "icon"
      ? { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 14, padding: 0, borderRadius: 3,
          border: "1px solid #D9D4F0", background: "#fff", color: "#5B4BC4", cursor: "pointer", verticalAlign: "middle" }
      : { background: "transparent", border: 0, padding: 0, fontSize: 11, color: S.textMuted, cursor: "pointer", textDecoration: open ? "underline" : "none" };

  if (variant === "icon") {
    return (
      <span onClick={stop} onMouseDown={stop} style={{ position: "relative", display: "inline-block", marginLeft: 3, verticalAlign: "middle" }}>
        <button
          type="button"
          data-testid="share-claim"
          onClick={(e) => { stop(e); onActivate?.(); requestShareOpen(postId); }}
          title="Share a snapshot of this claim — opens the claim with its Share menu"
          aria-label="Share this claim"
          style={trigger}
        ><ShareIcon size={11} /></button>
      </span>
    );
  }

  return (
    <span ref={boxRef} onClick={stop} onMouseDown={stop} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        data-testid="share-claim"
        onClick={(e) => { stop(e); setOpen((o) => !o); }}
        title="Share a snapshot of this claim (link, text or image)"
        style={trigger}
      ><ShareIcon /> Share</button>
      {open && (
        <div
          role="dialog"
          aria-label="Share this claim"
          data-testid="share-menu"
          style={{
            position: "absolute", left: 0, top: 32, zIndex: 20, width: 320, background: "#fff",
            border: `1px solid ${S.border}`, borderRadius: 10, boxShadow: "0 10px 30px -12px rgba(28,21,51,.35)", padding: 12,
            display: "flex", flexDirection: "column", gap: 10, fontSize: 11, color: S.text,
          }}
        >
          {error && <div style={{ color: S.red }}>{error}</div>}
          {!snap && !error && <div style={{ color: S.textFaint }}>Preparing the snapshot…</div>}
          {snap && (() => {
            const eff = invite ? withInvite(snap.share_url, snap.share_text, invite.code, invite.amount_vsp) : { url: snap.share_url, text: snap.share_text };
            const snapEff: Snapshot = { ...snap, share_url: eff.url, share_text: eff.text };
            return (
            <>
              <img
                src={snap.card_url}
                alt={`Verisphere Snapshot of claim #${snap.post_id}: ${snap.band}`}
                style={{ width: "100%", height: "auto", borderRadius: 8, border: `1px solid ${S.borderLight}` }}
              />
              <div style={{ color: S.textMuted }}>{snap.band} · {snap.stake_line}</div>
              {/* patch_fe_copy_snapshot — primary: text + HTML in one write (and the native sheet where there is one) */}
              <div style={{ display: "grid", gridTemplateColumns: canNativeShare() ? "1fr 1fr" : "1fr", gap: 6 }}>
                <button type="button" style={okStyle("snapshot", { ...btn, height: 34, fontSize: 12, background: "#5B4BC4", color: "#fff", borderColor: "#5B4BC4" })}
                  data-testid="share-copy-snapshot"
                  title="Copies the text with its link, plus the card for editors that take rich content — paste once into a reply, a post or a chat"
                  onClick={async () => {
                    const r = await copySnapshot(snapEff);
                    if (r === "failed") flash("Could not copy — select the link below");
                    else flash(r === "full" ? "Snapshot copied — paste it into your reply; in chats the link unfurls into the card"
                      : "Text copied — paste it into your reply; the link unfurls into the card", "snapshot");
                  }}
                >{label("snapshot", "Copy snapshot")}</button>
                {canNativeShare() && (
                  <button type="button" style={{ ...btn, height: 34, fontSize: 12 }} data-testid="share-native"
                    onClick={async () => {
                      const r = await shareSnapshot(snapEff);
                      if (r === "failed") flash("Could not open the share sheet — use Copy snapshot");
                    }}
                  >Share…</button>
                )}
              </div>
              {note && <div data-testid="share-note" style={{ color: done ? S.green : S.red, fontWeight: 600 }}>{note}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button type="button" style={okStyle("link", btn)}
                  data-testid="share-copy-link"
                  onClick={async () => { if (await copyText(eff.url)) flash("Link copied", "link"); else flash("Could not copy — select the link below"); }}
                >{label("link", "Copy link")}</button>
                <button type="button" style={okStyle("text", btn)} data-testid="share-copy-text"
                  onClick={async () => { if (await copyText(eff.text)) flash("Text copied", "text"); else flash("Could not copy"); }}
                >{label("text", "Copy text")}</button>
                <button type="button" style={okStyle("image", btn)} data-testid="share-copy-image"
                  onClick={async () => {
                    const r = await copyImage(snap.card_url);
                    if (r === "copied") flash("Image copied", "image");
                    else flash(r === "opened" ? "Image opened in a new tab" : "Could not copy the image");
                  }}
                >{label("image", "Copy image")}</button>
                <a href={eff.url} target="_blank" rel="noopener" style={{ ...btn, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Open share page</a>
              </div>
              {/* patch_fe_invites — put VSP on the table for whoever opens this link */}
              {isConnected && (
                <div data-testid="share-invite" style={{ borderTop: `1px solid ${S.borderLight}`, paddingTop: 8 }}>
                  {invite ? (
                    <div data-testid="share-invite-attached" style={{ background: "#EDEAFB", border: "1px solid #D9D4F0", borderRadius: 8, padding: 8, color: "#37299B" }}>
                      <b>{invite.amount_vsp} VSP attached</b> for claim #{postId} · code <code>{invite.code}</code>
                      <button type="button" style={{ ...btn, height: 22, marginLeft: 6, fontSize: 10 }} onClick={async () => { if (await copyText(invite.code)) flash("Code copied", "code"); }}>{label("code", "Copy code")}</button>
                      <div style={{ marginTop: 4, color: "#5D5776" }}>The link and text now carry it. Shown once; the VSP returns to you if unused by the expiry. Your open invitations are listed under Positions.</div>
                    </div>
                  ) : inviteOpen ? (
                    <InviteForm compact postId={postId} onIssued={async (inv) => {
                      issuedByPost.set(postId, inv); reopenAfterRemount.set(postId, Date.now()); setInvite(inv); setInviteOpen(false);
                      // copy the snapshot with the invitation at once; the browser may refuse if the wallet round-trip outlived
                      // the click's activation — then the button simply waits for one click
                      const e2 = withInvite(snap.share_url, snap.share_text, inv.code, inv.amount_vsp);
                      const r = await copySnapshot({ ...snap, share_url: e2.url, share_text: e2.text });
                      if (r === "failed") flash("Invitation attached — click Copy snapshot to copy it");
                      else flash("Invitation attached and snapshot copied — paste it to your friend", "snapshot");
                    }} />
                  ) : (
                    <button type="button" data-testid="share-invite-open" style={{ ...btn, width: "100%", borderColor: "#D9D4F0", color: "#5B4BC4" }} onClick={() => setInviteOpen(true)}
                      title="Escrow some of your VSP behind this link so the reader can take a side without buying first">Include an invitation (put VSP on the table)</button>
                  )}
                </div>
              )}
              <input
                readOnly
                aria-label="Share link"
                value={eff.url}
                onFocus={(e) => e.currentTarget.select()}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 11, padding: "6px 8px", border: `1px solid ${S.borderLight}`, borderRadius: 6, color: S.textMuted, fontFamily: "ui-monospace, Menlo, monospace" }}
              />
              <div style={{ color: S.textFaint, fontSize: 10 }}>Chats (WhatsApp, Discord, Slack, X) take the text and unfurl its link into the card; rich editors (Gmail, Docs) paste the card with its caption. Snapshot {snap.snapshot_at.replace("T", " ").replace("Z", " UTC")}.</div>
            </>
            );
          })()}
          {!snap && note && <div data-testid="share-note" style={{ color: S.red, fontWeight: 600 }}>{note}</div>}
        </div>
      )}
    </span>
  );
}
