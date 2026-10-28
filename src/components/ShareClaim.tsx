// patch_fe_verisnap_share / patch_fe_share_prominent — Share a claim as a Verisphere Snapshot (patch_snapshot_naming: the "Verisnap" working name is retired): copy the share link (unfurls into the card), the text form,
// or the card image. Reads the app's snapshot endpoint (app PR #46) lazily when opened; nothing is rendered until then.
// patch_fe_copy_snapshot — one primary action, "Copy snapshot", writes text + HTML (card image, linked) + PNG in a single
// clipboard write, so a rich editor pastes the card with its caption and a plain box pastes the text whose link unfurls;
// "Share…" opens the native share sheet (image + text together) where the browser has one (phones). The single-format
// buttons remain below for when a target wants exactly one form.
import { useEffect, useRef, useState } from "react";
import { S } from "./claims-shared";

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
  );
  return `<div><a href="${escapeHtml(snap.share_url)}"><img src="${escapeHtml(snap.card_url)}" width="600" alt="${alt}"></a><p>${text}</p></div>`;
}

const blobOf = (s: string, type: string) => new Blob([s], { type });

/**
 * One clipboard write with three representations. Values are promises so Safari keeps the user activation while the
 * PNG downloads. Falls back to text + HTML when the image cannot be fetched, and to plain text where ClipboardItem is
 * missing (older Firefox) — the text's link still unfurls into the card.
 */
export async function copySnapshot(snap: Snapshot): Promise<"full" | "text+html" | "text" | "failed"> {
  const Item = (window as any).ClipboardItem;
  const clip: any = navigator.clipboard;
  if (Item && clip && clip.write) {
    const png = fetch(snap.card_url).then((r) => { if (!r.ok) throw new Error(`card ${r.status}`); return r.blob(); });
    try {
      await clip.write([new Item({
        "text/plain": blobOf(snap.share_text, "text/plain"),
        "text/html": blobOf(snapshotHtml(snap), "text/html"),
        "image/png": png,
      })]);
      return "full";
    } catch {
      try {
        await clip.write([new Item({
          "text/plain": blobOf(snap.share_text, "text/plain"),
          "text/html": blobOf(snapshotHtml(snap), "text/html"),
        })]);
        return "text+html";
      } catch { /* fall through */ }
    }
  }
  return (await copyText(snap.share_text)) ? "text" : "failed";
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
 */
export default function ShareClaim({ postId, variant = "button" }: { postId: number; variant?: "button" | "icon" | "link" }) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

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

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 1800);
  };

  const btn: React.CSSProperties = {
    height: 30, padding: "0 10px", borderRadius: 7, border: `1px solid ${S.border}`, background: "#fff",
    color: S.text, fontSize: 11, fontWeight: 600, cursor: "pointer",
  };

  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  const trigger: React.CSSProperties =
    variant === "button"
      ? { display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px", borderRadius: 999, border: "1px solid #5B4BC4",
          background: open ? "#37299B" : "#5B4BC4", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }
      : variant === "icon"
      ? { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 14, padding: 0, borderRadius: 3,
          border: "1px solid #D9D4F0", background: open ? "#EDEAFB" : "#fff", color: "#5B4BC4", cursor: "pointer", verticalAlign: "middle" }
      : { background: "transparent", border: 0, padding: 0, fontSize: 11, color: S.textMuted, cursor: "pointer", textDecoration: open ? "underline" : "none" };

  return (
    <span ref={boxRef} onClick={stop} onMouseDown={stop} style={{ position: "relative", display: "inline-block", marginLeft: variant === "icon" ? 3 : 0, verticalAlign: variant === "icon" ? "middle" : undefined }}>
      <button
        type="button"
        data-testid="share-claim"
        onClick={(e) => { stop(e); setOpen((o) => !o); }}
        title="Share a snapshot of this claim (link, text or image)"
        aria-label={variant === "icon" ? "Share this claim" : undefined}
        style={trigger}
      >{variant === "icon" ? <ShareIcon size={11} /> : <><ShareIcon /> Share</>}</button>
      {open && (
        <div
          role="dialog"
          aria-label="Share this claim"
          data-testid="share-menu"
          style={{
            position: "absolute", left: 0, top: variant === "icon" ? 18 : 32, zIndex: 20, width: 320, background: "#fff",
            border: `1px solid ${S.border}`, borderRadius: 10, boxShadow: "0 10px 30px -12px rgba(28,21,51,.35)", padding: 12,
            display: "flex", flexDirection: "column", gap: 10, fontSize: 11, color: S.text,
          }}
        >
          {error && <div style={{ color: S.red }}>{error}</div>}
          {!snap && !error && <div style={{ color: S.textFaint }}>Preparing the snapshot…</div>}
          {snap && (
            <>
              <img
                src={snap.card_url}
                alt={`Verisphere Snapshot of claim #${snap.post_id}: ${snap.band}`}
                style={{ width: "100%", height: "auto", borderRadius: 8, border: `1px solid ${S.borderLight}` }}
              />
              <div style={{ color: S.textMuted }}>{snap.band} · {snap.stake_line}</div>
              {/* patch_fe_copy_snapshot — primary: everything in one write (and the native sheet where there is one) */}
              <div style={{ display: "grid", gridTemplateColumns: canNativeShare() ? "1fr 1fr" : "1fr", gap: 6 }}>
                <button type="button" style={{ ...btn, height: 34, fontSize: 12, background: "#5B4BC4", color: "#fff", borderColor: "#5B4BC4" }}
                  data-testid="share-copy-snapshot"
                  title="Copies the card image, the text and the link together — paste once into a reply, a post or a chat"
                  onClick={async () => {
                    const r = await copySnapshot(snap);
                    flash(r === "full" ? "Snapshot copied — paste it into your reply"
                      : r === "text+html" ? "Snapshot copied (text and link; the image did not load)"
                      : r === "text" ? "Text copied — this browser cannot copy the image; the link unfurls into the card"
                      : "Could not copy — select the link below");
                  }}
                >Copy snapshot</button>
                {canNativeShare() && (
                  <button type="button" style={{ ...btn, height: 34, fontSize: 12 }} data-testid="share-native"
                    onClick={async () => {
                      const r = await shareSnapshot(snap);
                      if (r === "failed") flash("Could not open the share sheet — use Copy snapshot");
                    }}
                  >Share…</button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button type="button" style={btn}
                  data-testid="share-copy-link"
                  onClick={async () => flash((await copyText(snap.share_url)) ? "Link copied" : "Could not copy — select the link below")}
                >Copy link</button>
                <button type="button" style={btn} data-testid="share-copy-text"
                  onClick={async () => flash((await copyText(snap.share_text)) ? "Text copied" : "Could not copy")}
                >Copy text</button>
                <button type="button" style={btn} data-testid="share-copy-image"
                  onClick={async () => {
                    const r = await copyImage(snap.card_url);
                    flash(r === "copied" ? "Image copied" : r === "opened" ? "Image opened in a new tab" : "Could not copy the image");
                  }}
                >Copy image</button>
                <a href={snap.share_url} target="_blank" rel="noopener" style={{ ...btn, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Open share page</a>
              </div>
              <input
                readOnly
                aria-label="Share link"
                value={snap.share_url}
                onFocus={(e) => e.currentTarget.select()}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 11, padding: "6px 8px", border: `1px solid ${S.borderLight}`, borderRadius: 6, color: S.textMuted, fontFamily: "ui-monospace, Menlo, monospace" }}
              />
              <div style={{ color: S.textFaint, fontSize: 10 }}>Rich editors paste the card with its caption; plain boxes paste the text, and its link unfurls into the card on X, Discord, WhatsApp, Slack and most sites. Snapshot {snap.snapshot_at.replace("T", " ").replace("Z", " UTC")}.</div>
            </>
          )}
          {note && <div data-testid="share-note" style={{ color: S.green, fontWeight: 600 }}>{note}</div>}
        </div>
      )}
    </span>
  );
}
