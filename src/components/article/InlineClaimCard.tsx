// frontend/src/components/article/InlineClaimCard.tsx
// Thin wrapper around shared ExpandedClaimDetail.
// Handles the Explorer-specific "create claim from sentence" flow when postId is null.
import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useCreateClaim, useStake, POST_REGISTRY_MAX_CLAIM_LENGTH } from "@verisphere/protocol";
import { friendlyError, fireToast } from "../../utils/errorMessages";
import { fireTxProgress } from "./TxProgress";
import { S, ExpandedClaimDetail } from "../claims-shared";
import StakeInput from "./StakeInput";
import type { Sentence } from "./types";

const MAX_CLAIM_LENGTH = Number(POST_REGISTRY_MAX_CLAIM_LENGTH);  // bundle05: synced to contract
const API = import.meta.env.VITE_API_BASE || "/api";

const triggerReindex = async (postId: number, userAddr?: string) => {
  try {
    const params = userAddr ? `?user=${userAddr}` : "";
    await fetch(`${API}/reindex/${postId}${params}`, { method: "POST" });
  } catch { /* non-fatal */ }
};

/* ── Create-claim prompt — shown when a sentence has no post_id yet ── */
function CreateClaimPrompt({
  text,
  onCreated,
  onClose,
}: {
  text: string;
  onCreated: (newPid: number) => void;
  onClose?: () => void;
}) {
  const { isConnected, address } = useAccount();
  const [stakeAmt, setStakeAmt] = useState("1");
  const { createClaim, loading, needsApproval, approveVSP, error } = useCreateClaim();
  const { stake: stakeOnClaim } = useStake();
  const amount = parseFloat(stakeAmt) || 0;

  const tooLong = text.length > MAX_CLAIM_LENGTH;

  const handleCreate = useCallback(async () => {
    // Zero stake is a valid action (1 VSP fee, no stake) — same as the
    // from-scratch flow in PlusButton.tsx. Only block on connection,
    // length, and in-flight loading.
    if (!isConnected || tooLong) return;
    const side: "support" | "challenge" =
      amount > 0 ? "support" : amount < 0 ? "challenge" : "support"; // unused when amount === 0
    const steps = [
      { label: "Create claim on-chain", status: "pending" as const },
      ...(amount !== 0
        ? [{ label: `Stake ${Math.abs(amount)} VSP ${side}`, status: "pending" as const }]
        : []),
      { label: "Insert into article", status: "pending" as const },
    ];
    const insertStepIndex = amount !== 0 ? 2 : 1;
    fireTxProgress({ action: "start", title: "Creating Claim", steps });
    try {
      fireTxProgress({ action: "step", stepIndex: 0 });
      if (needsApproval) {
        await approveVSP();
      }
      const result = await createClaim(text);
      console.log("[CreateClaim] result:", result, "amount:", amount);
      if (result?.post_id != null) {
        if (amount !== 0) {
          fireTxProgress({ action: "step", stepIndex: 1 });
          console.log("[CreateClaim] calling stake:", { postId: result.post_id, side, amount: Math.abs(amount) });
          try {
            const stakeResult = await stakeOnClaim(result.post_id, side, Math.abs(amount));
            console.log("[CreateClaim] stake result:", stakeResult);
          } catch (stakeErr: any) {
            console.error("[CreateClaim] Stake after createClaim FAILED:", stakeErr);
            fireToast("Stake failed: " + (stakeErr?.message || "unknown"));
          }
        }
        fireTxProgress({ action: "step", stepIndex: insertStepIndex });
        if (address) await triggerReindex(result.post_id, address);
        fireTxProgress({ action: "done" });
        window.dispatchEvent(new Event("verisphere:data-changed"));
        onCreated(result.post_id);
      } else {
        fireTxProgress({ action: "error", error: error || "Claim was not created" });
      }
    } catch (e: any) {
      fireTxProgress({ action: "error", error: friendlyError(e) });
      fireToast(friendlyError(e));
    }
  }, [isConnected, tooLong, stakeAmt, needsApproval, approveVSP, createClaim, text, address, onCreated, stakeOnClaim]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        margin: "4px 0",
        padding: "10px 12px",
        background: "#fff",
        border: `1px solid ${S.border}`,
        borderRadius: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: S.textMuted }}>
          Make this a claim on-chain?
        </span>
        <StakeInput
          value={stakeAmt}
          onChange={setStakeAmt}
          onSubmit={handleCreate}
        />
        <span style={{ fontSize: 10, color: amount > 0 ? S.green : amount < 0 ? S.red : S.textFaint }}>
          VSP ({amount > 0 ? "support" : amount < 0 ? "challenge" : "no stake"})
        </span>
        <button
          onClick={handleCreate}
          disabled={!isConnected || tooLong || loading}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            borderRadius: 4,
            border: "none",
            background: S.blue,
            color: "#fff",
            cursor: isConnected && !tooLong ? "pointer" : "not-allowed",
            opacity: isConnected && !tooLong && !loading ? 1 : 0.5,
          }}
        >
          {loading
            ? "Creating…"
            : needsApproval
            ? "Approve & Create"
            : amount > 0
            ? "Create & Support"
            : amount < 0
            ? "Create & Challenge"
            : "Create claim"}
        </button>
        {onClose && (
          <span
            onClick={onClose}
            style={{ cursor: "pointer", fontSize: 13, color: S.textFaint, marginLeft: "auto" }}
          >✕</span>
        )}
      </div>
      {tooLong && (
        <div style={{ fontSize: 10, color: S.red, marginTop: 4 }}>
          Claim too long ({text.length} / {MAX_CLAIM_LENGTH})
        </div>
      )}
      {error && (
        <div style={{ fontSize: 10, color: S.red, marginTop: 4 }}>
          {friendlyError(error)}
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */
export default function InlineClaimCard({
  postId,
  text,
  stakeSupport,
  stakeChallenge,
  verityScore,
  sentenceId,
  allSentences,
  onRefresh,
  onClose,
  linksOnly,
  postType,
  dupeGroupId,
  dupeCount,
}: {
  postId: number | null;
  text: string;
  stakeSupport: number;
  stakeChallenge: number;
  verityScore: number;
  postType?: "claim" | "link";
  sentenceId?: number;
  allSentences?: Sentence[];
  onRefresh: () => void;
  onClose?: () => void;
  linksOnly?: boolean;
  dupeGroupId?: number;
  dupeCount?: number;
}) {
  const { address } = useAccount();
  const [resolvedPid, setResolvedPid] = useState<number | null>(postId);

  // Resolve postId from sentence id / text match if needed
  useEffect(() => {
    if (postId != null) {
      setResolvedPid(postId);
      return;
    }
    // Try to find matching claim in allSentences
    if (allSentences && sentenceId != null) {
      const match = allSentences.find(
        (s) => s.sentence_id === sentenceId && s.post_id != null
      );
      if (match?.post_id) {
        setResolvedPid(match.post_id);
        return;
      }
    }
    // Try by text match
    if (allSentences) {
      const match = allSentences.find(
        (s) => s.post_id != null && s.text.trim() === text.trim()
      );
      if (match?.post_id) {
        setResolvedPid(match.post_id);
      }
    }
  }, [postId, text, sentenceId, allSentences]);

  // Case 1: Sentence has no claim yet — show create-claim prompt
  if (resolvedPid == null) {
    return (
      <CreateClaimPrompt
        text={text}
        onCreated={(newPid) => {
          setResolvedPid(newPid);
          onRefresh();
        }}
        onClose={onClose}
      />
    );
  }

  // Case 2: Claim exists — delegate to shared ExpandedClaimDetail
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        margin: "4px 0",
        padding: "8px 12px",
        background: "#fff",
        border: `1px solid ${S.border}`,
        borderRadius: 6,
      }}
    >
      <ExpandedClaimDetail
        claim={{
          post_id: resolvedPid,
          text,
          verity_score: verityScore,
          base_vs: verityScore,
          stake_support: stakeSupport,
          stake_challenge: stakeChallenge,
          total_stake: stakeSupport + stakeChallenge,
          controversy: 0,
          incoming_links: 0,
          outgoing_links: 0,
          topic: "",
          created_at: null,
          created_epoch: undefined,
          is_link: postType === "link",
          dupe_group_id: dupeGroupId,
          dupe_member_count: dupeCount,
        }}
        onRefresh={onRefresh}
        onClose={onClose}
        hideStaking={linksOnly}
        onGoTo={(postId) => window.dispatchEvent(new CustomEvent("verisphere:navigate", { detail: { view: "claims", postId } }))}
      />
    </div>
  );
}
