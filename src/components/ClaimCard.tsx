// frontend/src/components/ClaimCard.tsx
import { useState, useEffect, useCallback } from "react";
import type { ClaimCard as ClaimCardT } from "../types";
import { useAccount } from "wagmi";
import { useCreateClaim, useStake } from "@verisphere/protocol";

type ClaimState = {
  post_id: number;
  text: string;
  creator: string;
  support_total: number;
  challenge_total: number;
  user_support: number;
  user_challenge: number;
};

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// Module-level set: tracks claims created this session (survives remount)
const createdClaimsThisSession = new Set<string>();

const DUST = 0.001;
function clean(n: number): number {
  return Math.abs(n) < DUST ? 0 : n;
}

export default function ClaimCard({
  card,
  onOpenModal,
}: {
  card: ClaimCardT;
  onOpenModal?: () => void;
}) {
  const { isConnected, address: userAddress } = useAccount();

  const {
    createClaim,
    loading: createLoading,
    error: createError,
  } = useCreateClaim();

  const {
    stake,
    withdraw,
    loading: stakeLoading,
    error: stakeError,
    txHash: stakeTxHash,
  } = useStake();

  // Authoritative chain state
  const [chainState, setChainState] = useState<ClaimState | null>(null);
  const [verityScore, setVerityScore] = useState<number>(
    card.verity_score ?? 0,
  );
  const [fetchedOnMount, setFetchedOnMount] = useState(false);
  const [justCreated, setJustCreated] = useState(
    createdClaimsThisSession.has(card.text),
  );

  // Staking UI
  const [stakeAmount, setStakeAmount] = useState("1");
  const [stakeSide, setStakeSide] = useState<"support" | "challenge">(
    "support",
  );

  // Fetch full claim state from backend
  const fetchClaimState = useCallback(async () => {
    try {
      const url = `${API_BASE}/claim-status/${encodeURIComponent(card.text)}${
        userAddress ? `?user=${userAddress}` : ""
      }`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();

      if (data.on_chain?.post_id != null) {
        setChainState({
          post_id: data.on_chain.post_id,
          text: card.text,
          creator: data.on_chain.creator || "",
          support_total: data.stake_support ?? 0,
          challenge_total: data.stake_challenge ?? 0,
          user_support: data.user_support ?? 0,
          user_challenge: data.user_challenge ?? 0,
        });
        setJustCreated(false); // Confirmed on-chain — no longer "just created"
        createdClaimsThisSession.add(card.text);
      }
      if (data.verity_score != null) {
        setVerityScore(data.verity_score);
      }
    } catch (e) {
      console.warn("Failed to fetch claim state:", e);
    } finally {
      setFetchedOnMount(true);
    }
  }, [card.text, userAddress]);

  useEffect(() => {
    fetchClaimState();
  }, [fetchClaimState]);

  // Derived display state
  const claimIsOnChain = chainState != null && chainState.post_id != null;
  const postId = chainState?.post_id ?? null;

  const support = clean(chainState?.support_total ?? 0);
  const challenge = clean(chainState?.challenge_total ?? 0);
  const userSupport = clean(chainState?.user_support ?? 0);
  const userChallenge = clean(chainState?.user_challenge ?? 0);
  const totalStake = support + challenge;
  const supportPct = totalStake > 0 ? (support / totalStake) * 100 : 0;
  const challengePct = totalStake > 0 ? (challenge / totalStake) * 100 : 0;
  const vs = verityScore;

  const showCreateButton =
    fetchedOnMount && !claimIsOnChain && !justCreated && !createLoading;
  const showConfirming = justCreated && !claimIsOnChain;
  const canStake = claimIsOnChain && isConnected && postId != null;

  // ---- Handlers ----

  const handleCreate = async () => {
    setJustCreated(true);
    createdClaimsThisSession.add(card.text);

    const txHash = await createClaim(card.text);
    if (txHash) {
      // Tx submitted. Poll for on-chain state (relay may take a moment to index).
      const poll = async (retries: number) => {
        for (let i = 0; i < retries; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          await fetchClaimState();
          // If we found it on-chain, stop polling
          if (chainState?.post_id != null) return;
        }
      };
      poll(5);
    } else {
      // createClaim returned null — check if there's an error
      // Don't rollback justCreated (the tx might still be processing)
      setTimeout(() => fetchClaimState(), 3000);
    }
  };

  const handleStake = async () => {
    if (postId == null) return;
    const amt = parseFloat(stakeAmount);
    if (isNaN(amt) || amt <= 0) return;
    await stake(postId, stakeSide, amt);
    // Re-fetch after staking
    setTimeout(() => fetchClaimState(), 2000);
  };

  const handleUnstake = async () => {
    if (postId == null) return;
    const amt = parseFloat(stakeAmount);
    if (isNaN(amt) || amt <= 0) return;
    await withdraw(postId, stakeSide, amt);
    setTimeout(() => fetchClaimState(), 2000);
  };

  const myStakeOnSide = stakeSide === "support" ? userSupport : userChallenge;

  function getBackgroundColor(v: number): string {
    if (v > 0) return `rgba(0, 200, 80, ${Math.min(0.35, (v / 100) * 0.35)})`;
    if (v < 0)
      return `rgba(220, 50, 50, ${Math.min(0.35, (Math.abs(v) / 100) * 0.35)})`;
    return "transparent";
  }

  return (
    <div className="card claim-card">
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <button className="btn btn-small" disabled={!claimIsOnChain}>
          ↑ 0 outbound
        </button>
      </div>

      <p
        style={{
          backgroundColor: getBackgroundColor(vs),
          padding: "12px",
          borderRadius: 10,
          marginBottom: 24,
        }}
      >
        {card.text}
      </p>
      {/* patch_report_path: a report is an e-mail to abuse@ with the post id and the text; the decision is human,
          the switch is the admin hide endpoint. Only for claims that exist on chain (there is nothing to report
          about a draft). */}
      {claimIsOnChain && postId != null && (
        <div style={{ textAlign: "right", marginTop: -18, marginBottom: 16, fontSize: 12 }}>
          <a
            className="report-link"
            href={`mailto:abuse@verisphere.co?subject=${encodeURIComponent(`Report claim #${postId}`)}&body=${encodeURIComponent(
              `Claim #${postId}\n\n"${card.text}"\n\nWhy you are reporting it (what policy it breaks):\n\n`,
            )}`}
            title="Report this claim to Verisphere (opens your e-mail client)"
          >
            Report
          </a>
          {" · "}
          <a href="/docs/viewer.html?file=content-policy.md" target="_blank" rel="noreferrer">
            Content policy
          </a>
        </div>
      )}

      {/* Stake gauges */}
      <div className="queues">
        <div
          className={`gauge-container${
            !claimIsOnChain
              ? " disabled-gauge"
              : stakeSide === "support"
                ? " selected-gauge"
                : ""
          }`}
          onClick={() => canStake && setStakeSide("support")}
          style={{ cursor: canStake ? "pointer" : "default" }}
        >
          {supportPct > 0 && (
            <div
              className="gauge-fill green"
              style={{ height: `${supportPct}%` }}
            />
          )}
          <div className="gauge-label">
            Support
            <br />
            <strong>{support.toFixed(1)}</strong>
            {userSupport > 0 && (
              <>
                <br />
                <span style={{ fontSize: 11, color: "#00aa44" }}>
                  You: {userSupport.toFixed(2)}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className={`gauge-container${
            !claimIsOnChain
              ? " disabled-gauge"
              : stakeSide === "challenge"
                ? " selected-gauge"
                : ""
          }`}
          onClick={() => canStake && setStakeSide("challenge")}
          style={{ cursor: canStake ? "pointer" : "default" }}
        >
          {challengePct > 0 && (
            <div
              className="gauge-fill red"
              style={{ height: `${challengePct}%` }}
            />
          )}
          <div className="gauge-label">
            Challenge
            <br />
            <strong>{challenge.toFixed(1)}</strong>
            {userChallenge > 0 && (
              <>
                <br />
                <span style={{ fontSize: 11, color: "#cc2222" }}>
                  You: {userChallenge.toFixed(2)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span className="badge">
          Verity Score:{" "}
          <strong
            style={{ color: vs > 0 ? "#00aa44" : vs < 0 ? "#cc2222" : "#888" }}
          >
            {vs > 0 ? "+" : ""}
            {vs.toFixed(1)}
          </strong>
        </span>
      </div>

      {card.author && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 12,
            fontSize: 13,
            color: "#666",
          }}
        >
          by {card.author}
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="actions">
        {/* CREATE */}
        {showCreateButton &&
          (isConnected ? (
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={createLoading}
            >
              {createLoading ? "Creating…" : "Create On-Chain"}
            </button>
          ) : (
            <div className="connect-warning">
              Connect a wallet to create and stake this claim.
            </div>
          ))}

        {/* CONFIRMING */}
        {showConfirming && !createError && (
          <div style={{ textAlign: "center", fontSize: 13, color: "#888" }}>
            {createLoading ? "Creating on-chain…" : "✓ Created — confirming…"}
          </div>
        )}

        {/* STAKING */}
        {canStake && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              backgroundColor: "#fafafa",
            }}
          >
            <div
              style={{
                textAlign: "center",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {stakeSide === "support" ? "Support" : "Challenge"} this claim
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  fontSize: 14,
                }}
                placeholder="VSP amount"
              />
              <span style={{ fontSize: 13, color: "#666" }}>VSP</span>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                className="btn btn-primary"
                onClick={handleStake}
                disabled={stakeLoading}
                style={{ flex: "0 1 160px" }}
              >
                {stakeLoading ? "Staking…" : `Stake ${stakeSide}`}
              </button>

              <button
                className="btn"
                onClick={handleUnstake}
                disabled={stakeLoading || myStakeOnSide <= 0}
                style={{
                  flex: "0 1 160px",
                  backgroundColor: myStakeOnSide > 0 ? "#fee" : "#f5f5f5",
                  color: myStakeOnSide > 0 ? "#c00" : "#999",
                  border: `1px solid ${myStakeOnSide > 0 ? "#fcc" : "#ddd"}`,
                }}
              >
                {stakeLoading ? "Unstaking…" : "Unstake"}
              </button>
            </div>

            {myStakeOnSide > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: "#666",
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                Your {stakeSide} stake: {myStakeOnSide.toFixed(2)} VSP
              </div>
            )}
          </div>
        )}

        {claimIsOnChain && !isConnected && (
          <div className="connect-warning">
            Connect a wallet to stake on this claim.
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button className="btn btn-small" disabled={!claimIsOnChain}>
            ↑ 0 inbound
          </button>
        </div>
      </div>

      {/* Status messages */}
      {createError && (
        <div className="error" style={{ marginTop: 12 }}>
          {typeof createError === "string"
            ? createError
            : JSON.stringify(createError)}
        </div>
      )}
      {stakeError && (
        <div className="error" style={{ marginTop: 12 }}>
          {typeof stakeError === "string"
            ? stakeError
            : JSON.stringify(stakeError)}
        </div>
      )}
      {stakeTxHash && (
        <div className="success" style={{ marginTop: 12 }}>
          ✓ Stake updated! Tx: {stakeTxHash.slice(0, 12)}…
        </div>
      )}
    </div>
  );
}
