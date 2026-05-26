// frontend/src/components/article/PlusButton.tsx
import { useState, useRef, useEffect } from "react";
import { useAccount } from "wagmi";
import { useCreateClaim, useStake, fetchBalance, POST_REGISTRY_MAX_CLAIM_LENGTH } from "@verisphere/protocol";
import { C } from "./theme";
import B from "./MiniButton";
import { friendlyError, fireToast } from "../../utils/errorMessages";
import { fireTxProgress } from "./TxProgress";
import StakeInput from "./StakeInput";

const MAX_CLAIM_LENGTH = Number(POST_REGISTRY_MAX_CLAIM_LENGTH);  // bundle05: synced to contract

const API = import.meta.env.VITE_API_BASE || "/api";

export default function PlusBtn({
  sectionId,
  afterId,
  topic,
  onDone,
}: {
  sectionId?: number | null;
  afterId?: number | null;
  topic?: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const [stakeAmt, setStakeAmt] = useState("1");
  const [confirmChoice, setConfirmChoice] = useState<"suggested" | "original">("suggested");
  const [phase, setPhase] = useState<
    "input" | "cleanup" | "confirm" | "creating" | "staking"
  >("input");
  const [sug, setSug] = useState<{
    original: string;
    suggested: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasBalance, setHasBalance] = useState(false);
  const { isConnected, address } = useAccount();
  const { createClaim, loading: txing } = useCreateClaim();
  const { stake, loading: staking } = useStake();
  const r = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && r.current) r.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !address) return;
    fetchBalance(API, address)
      .then((bal) => {
        setHasBalance(bal >= BigInt("1000000000000000000"));
      })
      .catch(() => setHasBalance(false));
  }, [open, address]);

  if (!isConnected) {
    return (
      <span className="av-plus" style={{ display: "inline-block", width: 4 }} />
    );
  }

  const cleanup = async () => {
    if (!txt.trim()) return;
    if (new TextEncoder().encode(txt.trim()).length > MAX_CLAIM_LENGTH) {
      setError(`Claim too long (${new TextEncoder().encode(txt.trim()).length} bytes, max ${MAX_CLAIM_LENGTH}). Please shorten it.`);
      return;
    }
    setPhase("cleanup");
    setError(null);

    try {
      const mod = await fetch(`${API}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt.trim() }),
      }).then((r) => r.json());
      if (!mod.allowed) {
        setError(mod.reason || "This content violates community standards and cannot be posted.");
        setPhase("input");
        return;
      }
    } catch {}

    try {
      const d = await fetch(`${API}/article/sentence/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt.trim(), topic: topic || "" }),
      }).then((r) => r.json());
      if (
        d.suggested &&
        d.suggested.toLowerCase() !== d.original.toLowerCase()
      ) {
        const refusalPatterns = ["can't help", "cannot help", "won't process", "violates", "not appropriate", "I'm unable"];
        const isRefusal = refusalPatterns.some((p) => d.suggested.toLowerCase().includes(p));
        if (isRefusal) {
          setError("This content violates community standards and cannot be posted.");
          setPhase("input");
          return;
        }
        setSug(d);
        setConfirmChoice("suggested");
        setPhase("confirm");
      } else {
        setSug({ original: txt.trim(), suggested: txt.trim() });
        setConfirmChoice("suggested");
        setPhase("confirm");
      }
    } catch {
      setSug({ original: txt.trim(), suggested: txt.trim() });
      setConfirmChoice("suggested");
      setPhase("confirm");
    }
  };

  const commit = async (final: string) => {
    if (new TextEncoder().encode(final).length > MAX_CLAIM_LENGTH) {
      setError(`Claim too long (${new TextEncoder().encode(final).length} bytes, max ${MAX_CLAIM_LENGTH}). Please shorten it.`);
      setPhase("input");
      return;
    }
    setPhase("creating");
    setError(null);

    const stakeVal = parseFloat(stakeAmt);
    const steps = [
      { label: "Create claim on-chain", status: "pending" as const },
      ...(stakeVal !== 0 ? [{ label: `Stake ${Math.abs(stakeVal)} VSP ${stakeVal > 0 ? "support" : "challenge"}`, status: "pending" as const }] : []),
      { label: "Insert into article", status: "pending" as const },
    ];
    fireTxProgress({ action: "start", title: "Creating Claim", steps });
    fireTxProgress({ action: "step", stepIndex: 0 });

    // createClaim returns null when blocked (duplicate, near-dup, error).
    // It returns a ClaimState object only on successful creation.
    // Do NOT check React state (isDuplicate, hookError) here — those
    // are async state updates that won't be visible until next render.
    let result;
    try {
      result = await createClaim(final);
    } catch (e: any) {
      setError(friendlyError(e));
      fireToast(friendlyError(e), "error");
      fireTxProgress({ action: "error", error: friendlyError(e) });
      setPhase("input");
      return;
    }

    // null return = blocked by duplicate check, balance check, or relay error.
    // The hook already dispatched a toast with the specific reason.
    if (result == null) {
      setError(error || "Claim was not created.");
      fireTxProgress({ action: "error", error: "Claim creation blocked — duplicate or similar claim exists" });
      setPhase("input");
      return;
    }

    const postId = result.post_id;

    // Stake on the new claim
    const amt = parseFloat(stakeAmt);
    if (amt !== 0) {
      setPhase("staking");
      const side = amt > 0 ? "support" : "challenge";
      fireTxProgress({ action: "step", stepIndex: 1 });
      try {
        await stake(postId, side as "support" | "challenge", Math.abs(amt));
      } catch (e: any) {
        console.warn("Initial stake failed (claim created):", e);
      }
    }

    // Insert into article DB
    if (sectionId) try {
      const ins = await fetch(`${API}/article/sentence/insert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: sectionId,
          after_sentence_id: afterId,
          text: final,
        }),
      }).then((r) => r.json());
      for (const i of ins.inserted || []) {
        await fetch(`${API}/article/sentence/${i.sentence_id}/link_post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post_id: postId }),
        });
      }
      try {
        await fetch(`${API}/claims/record`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: final, post_id: postId }),
        });
      } catch {}
    } catch (e: any) {
      console.warn("Article insert failed (claim is on-chain):", e);
    }

    // Auto-detect topic for standalone claims
    if (!sectionId && postId != null) {
      try {
        await fetch(`${API}/claims/detect-topic`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claim_text: final, post_id: postId }),
        });
      } catch (e) {
        console.debug("Topic detection failed (non-fatal):", e);
      }
    }

    window.dispatchEvent(new Event("verisphere:data-changed"));
    const insertStep = parseFloat(stakeAmt) !== 0 ? 2 : 1;
    fireTxProgress({ action: "step", stepIndex: insertStep });
    fireToast("Claim created!", "success");
    fireTxProgress({ action: "done" });
    setTxt("");
    setStakeAmt("1");
    setSug(null);
    setPhase("input");
    setOpen(false);
    onDone();
  };

  const busy =
    phase === "cleanup" || phase === "creating" || phase === "staking";
  const statusText =
    phase === "cleanup"
      ? "Checking…"
      : phase === "creating"
        ? "Creating claim…"
        : phase === "staking"
          ? "Staking…"
          : null;

  if (!open) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Add a new on-chain claim (1 VSP fee + initial stake)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 10px",
          borderRadius: 4,
          background: C.blue,
          color: C.white,
          fontSize: 11,
          fontWeight: 600,
          userSelect: "none",
          cursor: "pointer",
          opacity: 0.85,
          transition: "opacity 0.12s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
      >
        + Add claim
      </span>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "block",
        margin: "6px 0",
        padding: "10px 14px",
        background: C.bbg,
        borderRadius: 6,
        border: `1px solid ${C.blue}`,
        minWidth: 450,
        maxWidth: 700,
      }}
    >
      {!hasBalance ? (
        <div>
          <span style={{ fontSize: 12, color: C.red }}>
            Insufficient VSP balance. You need at least 2 VSP (1 fee + 1 stake).
          </span>
          <div style={{ marginTop: 4 }}>
            <B onClick={() => { setOpen(false); setTxt(""); }} ghost>Close</B>
          </div>
        </div>
      ) : phase === "confirm" && sug ? (
        <div>
          {sug.original.toLowerCase() !== sug.suggested.toLowerCase() ? (
            <>
              <div onClick={() => setConfirmChoice("suggested")} style={{
                fontSize: 12, marginBottom: 4, padding: "4px 6px", borderRadius: 4, cursor: "pointer",
                background: confirmChoice === "suggested" ? "rgba(37,99,235,0.06)" : "transparent",
                border: confirmChoice === "suggested" ? `1px solid ${C.blue}` : "1px solid transparent",
              }}>
                <span style={{ fontWeight: confirmChoice === "suggested" ? 700 : 400, color: confirmChoice === "suggested" ? C.text : C.muted }}>
                  {confirmChoice === "suggested" ? "✓ Selected: " : ""}Suggested:
                </span>{" "}
                <span style={{ color: confirmChoice === "suggested" ? C.text : C.muted }}>{sug.suggested}</span>
              </div>
              <div onClick={() => setConfirmChoice("original")} style={{
                fontSize: 12, marginBottom: 5, padding: "4px 6px", borderRadius: 4, cursor: "pointer",
                background: confirmChoice === "original" ? "rgba(37,99,235,0.06)" : "transparent",
                border: confirmChoice === "original" ? `1px solid ${C.blue}` : "1px solid transparent",
              }}>
                <span style={{ fontWeight: confirmChoice === "original" ? 700 : 400, color: confirmChoice === "original" ? C.text : C.muted }}>
                  {confirmChoice === "original" ? "✓ Selected: " : ""}Your version:
                </span>{" "}
                <span style={{ color: confirmChoice === "original" ? C.text : C.muted }}>{sug.original}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, marginBottom: 5 }}><b>Create claim:</b> {sug.suggested}</div>
          )}
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: C.gray }}>Initial stake:</span>
            <StakeInput value={stakeAmt} onChange={setStakeAmt}
              onSubmit={() => commit(confirmChoice === "original" ? sug.original : sug.suggested)} />
            <span style={{ fontSize: 10, color: C.muted }}>VSP support</span>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <B onClick={() => commit(confirmChoice === "original" ? sug.original : sug.suggested)} dis={busy}>
              {statusText || "Create & stake"}
            </B>
            <B onClick={() => { setSug(null); setPhase("input"); }} ghost>Cancel</B>
          </div>
        </div>
      ) : (
        <div>
          <textarea ref={r} value={txt} onChange={(e) => setTxt(e.target.value)}
            placeholder="Write a factual claim to add on-chain…" maxLength={MAX_CLAIM_LENGTH}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); cleanup(); }
              if (e.key === "Escape") { setOpen(false); setTxt(""); }
            }}
            rows={4}
            style={{
              width: "100%", minWidth: 600, padding: "6px 8px", fontSize: 14, lineHeight: 1.5,
              border: `1px solid ${C.gb}`, borderRadius: 4, resize: "vertical",
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 5, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
            <B onClick={cleanup} dis={busy || !txt.trim()}>{statusText || "Create & stake"}</B>
            <span style={{ fontSize: 10, color: C.muted }}>1 VSP fee +</span>
            <StakeInput value={stakeAmt} onChange={setStakeAmt} onSubmit={cleanup} />
            <span style={{ fontSize: 10, color: C.muted }}>VSP stake</span>
            <span style={{ fontSize: 9, color: new TextEncoder().encode(txt).length > MAX_CLAIM_LENGTH - 50 ? "#ef4444" : C.muted }}>
              {new TextEncoder().encode(txt).length}/{MAX_CLAIM_LENGTH} bytes
            </span>
            <B onClick={() => { setOpen(false); setTxt(""); }} ghost>Cancel</B>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
