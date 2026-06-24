// frontend/src/components/StakeModal.tsx
import { useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { getAddresses } from "@verisphere/protocol";

type StakeModalProps = {
  claimId: number;
  side: "support" | "challenge";
  currentStake: { support: number; challenge: number };
  onClose: () => void;
  onStake: (amount: number) => Promise<void>;
  onUnstake: (amount: number) => Promise<void>;
};

export default function StakeModal({
  claimId,
  side,
  currentStake,
  onClose,
  onStake,
  onUnstake,
}: StakeModalProps) {
  const { address, isConnected, chain } = useAccount();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VSP wallet balance
  const { data: vspBalanceData } = useBalance({
    address,
    token: getAddresses(chain?.id ?? 43113).VSPToken as `0x${string}`,
    query: { enabled: Boolean(isConnected && address) },
  });

  const vspBalance = vspBalanceData ? Number(vspBalanceData.formatted) : 0;
  const numericAmount = Number(amount) || 0;
  const myStakeOnSide =
    side === "support" ? currentStake.support : currentStake.challenge;

  const handleMax = () => setAmount(vspBalance.toFixed(6));
  const handleMaxUnstake = () => setAmount(myStakeOnSide.toFixed(6));

  const handleStake = async () => {
    if (numericAmount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (numericAmount > vspBalance) {
      setError(
        `Insufficient VSP balance (${vspBalance.toFixed(4)} available).`,
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onStake(numericAmount);
    } catch (e: any) {
      setError(e.shortMessage || e.message || "Stake failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUnstake = async () => {
    if (numericAmount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (numericAmount > myStakeOnSide) {
      setError(
        `You only have ${myStakeOnSide.toFixed(4)} VSP staked on ${side}.`,
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onUnstake(numericAmount);
    } catch (e: any) {
      setError(e.shortMessage || e.message || "Unstake failed");
    } finally {
      setLoading(false);
    }
  };

  const sideColor = side === "support" ? "#00cc44" : "#ff4444";

  return (
    <div className="trade-modal-overlay" onClick={onClose}>
      <div className="trade-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="trade-close-btn" onClick={onClose}>
          ×
        </button>

        <h3>Stake on Claim #{claimId}</h3>
        <p>
          Side:{" "}
          <strong style={{ color: sideColor }}>
            {side.charAt(0).toUpperCase() + side.slice(1)}
          </strong>
        </p>

        {/* Current stake summary */}
        <div
          style={{
            background: "#f5f5f5",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span>Your staked (support):</span>
            <strong style={{ color: "#00aa44" }}>
              {currentStake.support.toFixed(4)} VSP
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Your staked (challenge):</span>
            <strong style={{ color: "#cc2222" }}>
              {currentStake.challenge.toFixed(4)} VSP
            </strong>
          </div>
        </div>

        <div style={{ margin: "16px 0" }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>
            Wallet balance: <strong>{vspBalance.toFixed(4)} VSP</strong>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              type="number"
              placeholder="Amount (VSP)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.0001"
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button
              className="btn"
              onClick={handleMax}
              disabled={loading}
              title="Max wallet balance"
            >
              Max
            </button>
          </div>
        </div>

        {numericAmount > 0 && (
          <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
            Amount: {numericAmount.toFixed(4)} VSP
          </div>
        )}

        {error && (
          <div className="error" style={{ margin: "12px 0" }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            marginTop: 20,
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button className="btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn"
            style={{ background: "#cc4444", color: "white" }}
            onClick={handleUnstake}
            disabled={
              loading || numericAmount <= 0 || numericAmount > myStakeOnSide
            }
            title={myStakeOnSide <= 0 ? "No stake to withdraw" : ""}
          >
            {loading ? "Unstaking…" : "Unstake"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleStake}
            disabled={
              loading || numericAmount <= 0 || numericAmount > vspBalance
            }
          >
            {loading ? "Staking…" : "Stake"}
          </button>
        </div>
      </div>
    </div>
  );
}
