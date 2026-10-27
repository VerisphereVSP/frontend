// patch_fe_verisnap_share / patch_fe_share_prominent — Share a claim as a Verisnap: copy the share link (unfurls into the card), the text form,
// or the card image. Reads the app's snapshot endpoint (app PR #46) lazily when opened; nothing is rendered until then.
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
};

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
        title="Share this claim as a Verisnap (link, text or image)"
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
                alt={`Verisnap of claim #${snap.post_id}: ${snap.band}`}
                style={{ width: "100%", height: "auto", borderRadius: 8, border: `1px solid ${S.borderLight}` }}
              />
              <div style={{ color: S.textMuted }}>{snap.band} · {snap.stake_line}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button type="button" style={{ ...btn, background: "#5B4BC4", color: "#fff", borderColor: "#5B4BC4" }}
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
              <div style={{ color: S.textFaint, fontSize: 10 }}>The link unfurls into the card on X, Discord, WhatsApp, Slack and most sites. Snapshot {snap.snapshot_at.replace("T", " ").replace("Z", " UTC")}.</div>
            </>
          )}
          {note && <div data-testid="share-note" style={{ color: S.green, fontWeight: 600 }}>{note}</div>}
        </div>
      )}
    </span>
  );
}
