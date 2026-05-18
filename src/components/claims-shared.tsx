// frontend/src/components/claims-shared.tsx — shared primitives for Claims/Portfolio/Article views
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import Jazzicon from "./Jazzicon";
import VSBar from "./VSBar";
import StakeControl from "./StakeControl";
import ClaimPickerModal from "./article/ClaimPickerModal";
import { useCreateLink, useStake } from "@verisphere/protocol";
// patch_link_ux: TxProgress + friendly error feedback for doLink
import { fireTxProgress } from "./article/TxProgress";
import { friendlyError } from "../utils/errorMessages";

const API = import.meta.env.VITE_API_BASE || "/api";

export type Claim = {
  post_id: number;
  text: string;
  creator?: string;
  verity_score: number;
  base_vs: number;
  stake_support: number;
  stake_challenge: number;
  total_stake: number;
  controversy: number;
  incoming_links: number;
  outgoing_links: number;
  topic: string;
  created_at: string | null;
  created_epoch?: number;
  is_link?: boolean;
  dupe_group_id?: number;
  dupe_canonical_post_id?: number;
  dupe_member_count?: number;
  dupe_total_support?: number;
  dupe_total_challenge?: number;
  dupe_aggregate_vs?: number;
  from_post_id?: number;
  to_post_id?: number;
  is_challenge?: boolean;
  from_text?: string;
  to_text?: string;
};

export type Edge = {
  claim_post_id: number;
  link_post_id: number;
  is_challenge: boolean;
  claim_text: string;
  claim_vs: number;
  claim_support: number;
  claim_challenge: number;
  link_support: number;
  link_challenge: number;
  link_vs: number;
  edge_contribution?: number;
};

export type QueueEntry = {
  address: string;
  amount: number;
  position: number;
  entry_epoch: number;
  tranche: number;
  position_weight: number;
};

type SortKey = "post_id" | "text" | "verity_score" | "total_stake" | "stake_support" | "stake_challenge" | "controversy" | "topic";
type SortDir = "asc" | "desc";

// ── Styles ──────────────────────────────────────────
export const S = {
  // Comfortable, readable palette
  text: "#2d3748",
  textMuted: "#718096",
  textFaint: "#a0aec0",
  border: "#e2e8f0",
  borderLight: "#edf2f7",
  bgRow: "#ffffff",
  bgAlt: "#f7fafc",
  bgExpanded: "#f0f5ff",
  bgHover: "#edf2f7",
  green: "#38a169",
  greenLight: "#c6f6d5",
  red: "#e53e3e",
  redLight: "#fed7d7",
  blue: "#3182ce",
  blueLight: "#ebf4ff",
};

export function formatAge(ts?: number): string {
  if (!ts) return "";
  const secs = Math.floor(Date.now() / 1000) - ts;
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export const GRID = "32px 48px 48px minmax(200px,1fr) 72px 54px 54px 54px 38px 38px 60px 80px";
export const LINK_GRID = "32px 48px 48px minmax(200px,1fr) 72px 54px 54px 54px 38px 38px 60px 80px";

// ── Copyable Address Tooltip ────────────────────────
export function AddressTooltip({ address, children }: { address: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span style={{ position: "relative", display: "inline-block" }} title={address} onClick={(e) => { e.stopPropagation(); copy(); }}>
      {children}
      {copied && (
        <span style={{
          position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
          background: S.text, color: "#fff", fontSize: 9, padding: "2px 6px", borderRadius: 3,
          whiteSpace: "nowrap", pointerEvents: "none",
        }}>Copied!</span>
      )}
    </span>
  );
}

// ── Queue Display ───────────────────────────────────
export function QueueView({ postId, connectedAddress }: { postId: number; connectedAddress?: string }) {
  const [data, setData] = useState<{ support: QueueEntry[]; challenge: QueueEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/claims/${postId}/queue`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [postId]);

  if (loading) return <div style={{ fontSize: 11, color: S.textFaint, padding: "8px 0" }}>Loading queue…</div>;
  if (!data) return <div style={{ fontSize: 11, color: S.textFaint, padding: "8px 0" }}>Queue unavailable</div>;

  const renderSide = (label: string, entries: QueueEntry[], color: string, lightColor: string) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 6 }}>{label}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 11, color: S.textFaint, fontStyle: "italic" }}>No stakers</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {entries.map((e, i) => {
            const isMe = connectedAddress && e.address.toLowerCase() === connectedAddress.toLowerCase();
            return (
              <AddressTooltip key={i} address={e.address}>
                <div style={{
                  display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2,
                  padding: "6px 8px", borderRadius: 8,
                  background: isMe ? lightColor : "#fff",
                  border: `1.5px solid ${isMe ? color : S.border}`,
                  cursor: "pointer", minWidth: 48,
                  transition: "border-color 0.15s",
                }}>
                  <Jazzicon address={e.address} size={24} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: S.text }}>{e.amount.toFixed(1)}</span>
                  <span style={{ fontSize: 8, color: S.textFaint }}>T{e.tranche} ×{e.position_weight}</span>
                </div>
              </AddressTooltip>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: "8px 0" }}>
      {renderSide("Support", data.support, S.green, S.greenLight)}
      {renderSide("Challenge", data.challenge, S.red, S.redLight)}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────
export function Badge({ type }: { type: "claim" | "link" }) {
  const isClaim = type === "claim";
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".04em",
      padding: "1px 5px", borderRadius: 3,
      color: isClaim ? S.textMuted : S.blue,
      background: isClaim ? S.borderLight : S.blueLight,
    }}>{type}</span>
  );
}

// ── Expanded Claim Detail ───────────────────────────
export function ExpandedClaimDetail({
  claim: c, onRefresh, onClose, onGoTo,
  hideStaking,
}: {

  claim: Claim; onRefresh: () => void; onClose: () => void;
  onGoTo?: (postId: number) => void;
  hideStaking?: boolean;
}) {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  const [showDupes, setShowDupes] = useState(false);
  const [dupeMembers, setDupeMembers] = useState<any[]>([]);
  const [linksMode, setLinksMode] = useState<"none" | "incoming" | "outgoing">("none");
  const [outgoingEdges, setOutgoingEdges] = useState<Edge[]>([]);
  const [stakingLinkId, setStakingLinkId] = useState<number | null>(null);
  const { isConnected, address } = useAccount();
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [linking, setLinking] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pick, setPick] = useState<any>(null);
  const [linkType, setLinkType] = useState<"support" | "challenge">("support");
  const [linkStake, setLinkStake] = useState("1");
  const { createLink } = useCreateLink();
  const { stake: stakeOnLink } = useStake();

  const refreshEdges = useCallback(async () => {
    try {
      const [incRes, outRes] = await Promise.all([
        fetch(`${API}/claims/${c.post_id}/edges?direction=incoming`).then(r => r.json()),
        fetch(`${API}/claims/${c.post_id}/edges?direction=outgoing`).then(r => r.json()),
      ]);
      setEdges(incRes.incoming || []);
      setOutgoingEdges(outRes.outgoing || []);
    } catch {}
    setLoading(false);
  }, [c.post_id]);

  useEffect(() => { refreshEdges(); }, [refreshEdges]);

  // Fetch dupe group members when Duplicates tab is opened
  useEffect(() => {
    if (!showDupes || !c.post_id) return;
    fetch(`${API}/claims/${c.post_id}/dupe-group`)
      .then(r => r.json())
      .then(data => {
        if (data.members && data.members.length > 1) {
          setDupeMembers(data.members.filter((m: any) => m.post_id !== c.post_id));
        } else {
          setDupeMembers([]);
        }
      })
      .catch(() => setDupeMembers([]));
  }, [showDupes, c.post_id]);

  useEffect(() => {
    const q = linkSearch.trim();
    if (q.length < 2) { setLinkResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/claims/search?q=${encodeURIComponent(q)}&limit=8`).then(r => r.json());
        setLinkResults((res.claims || []).filter((x: any) => x.post_id !== c.post_id));
      } catch { setLinkResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [linkSearch, c.post_id]);

  const doLink = async () => {
    // patch_link_ux: surface progress + errors via TxProgress
    // patch_vite_link_v2: collapsed 6 steps -> 4 since the async useMetaTx
    // flow does not surface separate "submitting" vs "waiting" events.
    if (!pick?.post_id) return;
    const amt = parseFloat(linkStake);
    const willStake = amt > 0;
    const linkSteps = [
      { label: "Confirm link in your wallet", status: "pending" as const },
      { label: "Confirming link on chain", status: "pending" as const },
    ];
    const stakeSteps = willStake
      ? [
          { label: "Confirm initial stake in your wallet", status: "pending" as const },
          { label: "Confirming stake on chain", status: "pending" as const },
        ]
      : [];
    fireTxProgress({
      action: "start",
      title: willStake ? "Creating Link + Stake" : "Creating Link",
      steps: [...linkSteps, ...stakeSteps],
    });
    try {
      setLinking(true);
      fireTxProgress({ action: "step", stepIndex: 0 });
      const [fromId, toId] = linksMode === "outgoing"
        ? [c.post_id, pick.post_id]
        : [pick.post_id, c.post_id];
      // Once createLink starts (after the user signs in wallet), advance
      // to "Confirming link on chain". The await blocks until the
      // notifications watcher resolves the tx_log row.
      fireTxProgress({ action: "step", stepIndex: 1 });
      const txHash = await createLink(fromId, toId, linkType === "challenge");

      if (willStake && txHash) {
        // Brief delay to let the indexer index the new link_post_id.
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const direction = linksMode === "outgoing" ? "outgoing" : "incoming";
          const res = await fetch(`${API}/claims/${c.post_id}/edges?direction=${direction}`).then(r => r.json());
          const newEdges = (direction === "outgoing" ? res.outgoing : res.incoming) || [];
          const newLink = newEdges.find((e: any) =>
            e.claim_post_id === pick.post_id && e.is_challenge === (linkType === "challenge")
          );
          if (newLink?.link_post_id) {
            fireTxProgress({ action: "step", stepIndex: 2 });
            fireTxProgress({ action: "step", stepIndex: 3 });
            await stakeOnLink(newLink.link_post_id, "support", amt);
          } else {
            // Indexer has not caught up yet. The link itself succeeded;
            // the user can stake manually later. Fire `done` for the link.
          }
        } catch (stakeErr) {
          fireTxProgress({
            action: "error",
            error: "Link created, but initial stake failed: " + friendlyError(stakeErr),
          });
          refreshEdges();
          onRefresh();
          setPick(null);
          setLinkSearch("");
          setLinkResults([]);
          setLinking(false);
          return;
        }
        refreshEdges();
        onRefresh();
      } else {
        setTimeout(refreshEdges, 2000);
        setTimeout(onRefresh, 2000);
      }
      fireTxProgress({ action: "done" });
      setPick(null);
      setLinkSearch("");
      setLinkResults([]);
    } catch (e) {
      fireTxProgress({ action: "error", error: friendlyError(e) });
    }
    setLinking(false);
  };

  return (
    <div style={{ background: S.bgExpanded, borderBottom: `1px solid ${S.border}`, padding: "10px 16px 10px 96px" }}>
      {/* Staking row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <StakeControl
          postId={c.post_id}
          currentSupport={c.stake_support}
          currentChallenge={c.stake_challenge}
          postTotal={c.stake_support + c.stake_challenge}
          onDone={onRefresh}
          compact
          label="Your stake on this claim:"
        />
        <span
          style={{ fontSize: 10, color: S.textFaint, cursor: "pointer", marginLeft: "auto", textDecoration: linksMode === "incoming" ? "underline" : "none" }}
          onClick={() => setLinksMode(linksMode === "incoming" ? "none" : "incoming")}
        >Incoming Links</span>
        <span
          style={{ fontSize: 10, color: S.textFaint, cursor: "pointer", marginLeft: 4, textDecoration: linksMode === "outgoing" ? "underline" : "none" }}
          onClick={() => setLinksMode(linksMode === "outgoing" ? "none" : "outgoing")}
        >Outgoing Links</span>
        <span
          style={{ fontSize: 10, color: S.textFaint, cursor: "pointer", marginLeft: 4, textDecoration: showQueue ? "underline" : "none" }}
          onClick={() => setShowQueue(!showQueue)}
        >{showQueue ? "Hide queues" : "Queues"}</span>
        {c.dupe_member_count && c.dupe_member_count > 1 && (
          <span
            style={{
              fontSize: 10, cursor: "pointer", marginLeft: 4,
              color: showDupes ? "#92400e" : S.textFaint,
              textDecoration: showDupes ? "underline" : "none",
              fontWeight: showDupes ? 600 : 400,
            }}
            onClick={() => setShowDupes(!showDupes)}
          >Duplicates ({(c.dupe_member_count || 0) - 1})</span>
        )}
        <span
          onClick={onClose}
          title="Close"
          style={{ cursor: "pointer", fontSize: 14, color: S.textFaint, marginLeft: 12, padding: "0 4px" }}
        >✕</span>
      </div>

      {/* Queue view */}
      {showQueue && <QueueView postId={c.post_id} connectedAddress={address} />}

      {/* Duplicates view */}
      {showDupes && (
        <div style={{ margin: "6px 0", padding: "8px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "#92400e", marginBottom: 6 }}>
            Similar claims ({dupeMembers.length} other{dupeMembers.length !== 1 ? 's' : ''})
          </div>
          {dupeMembers.length === 0 ? (
            <div style={{ color: S.textMuted, fontSize: 11 }}>No other members in this group.</div>
          ) : (
            dupeMembers.map((m: any) => {
              const mClaim: Claim = {
                post_id: m.post_id,
                text: m.text || "",
                verity_score: m.verity_score || 0,
                base_vs: m.verity_score || 0,
                stake_support: m.support || 0,
                stake_challenge: m.challenge || 0,
                total_stake: (m.support || 0) + (m.challenge || 0),
                controversy: 0,
                incoming_links: 0,
                outgoing_links: 0,
                topic: c.topic || "",
                created_at: null,
                created_epoch: undefined,
              };
              return (
                <div key={m.post_id} style={{ marginBottom: 4 }}>
                  <div style={{
                    padding: "6px 8px", background: "#fff",
                    border: "1px solid #e5e7eb", borderRadius: 4,
                    fontSize: 12, color: "#374151",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500 }}>{m.text}</span>
                      {m.is_canonical && <span style={{ fontSize: 9, color: "#92400e", fontWeight: 600 }}>★ canonical</span>}
                    </div>
                    <div style={{ fontSize: 10, color: S.textMuted, display: "flex", gap: 8, alignItems: "center" }}>
                      <span>#{m.post_id}</span>
                      <span style={{ color: S.green }}>Sup: {(m.support || 0).toFixed(2)}</span>
                      <span style={{ color: S.red }}>Chal: {(m.challenge || 0).toFixed(2)}</span>
                      <span>VS: {(m.verity_score || 0).toFixed(1)}%</span>
                      <span
                        style={{ color: S.blue, cursor: "pointer", marginLeft: "auto" }}
                        onClick={() => {
                          if (onGoTo) {
                            onGoTo(m.post_id);
                          } else {
                            window.dispatchEvent(new CustomEvent("verisphere:navigate", { detail: { view: "claims", postId: m.post_id } }));
                          }
                        }}
                      >Open in Claims →</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Link search / create — only for claims, not links */}
      {isConnected && !c.is_link && (
        <div style={{ position: "relative", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={linkSearch}
              onChange={(e) => { setLinkSearch(e.target.value); if (pick) setPick(null); }}
              onClick={(e) => e.stopPropagation()}
              placeholder={linksMode === "outgoing"
              ? "Search to create a new link that this claim is evidence for/against"
              : "Search to create a new evidence link for/against this claim"}
              style={{
                flex: 1, padding: "5px 10px", borderRadius: 5,
                border: `1px solid ${S.border}`, fontSize: 12, maxWidth: 500,
              }}
            />
            <span
              onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
              title="Browse all claims"
              style={{
                cursor: "pointer", fontSize: 13, padding: "3px 8px",
                borderRadius: 5, border: `1px solid ${S.border}`,
                background: "#fff", color: S.blue, fontWeight: 700,
                userSelect: "none" as const, lineHeight: 1,
              }}
            >
              ⊞
            </span>
            {linkSearch.trim().length > 0 && (
              <span style={{ fontSize: 10, color: S.textFaint }}>
                {linkResults.length} results
              </span>
            )}
          </div>
          {showPicker && (
            <ClaimPickerModal
              excludePostId={c.post_id}
              onClose={() => setShowPicker(false)}
              onPick={(picked) => {
                // Check if this claim is already linked
                const existing = edges.find(e => e.claim_post_id === picked.post_id);
                if (existing) {
                  setShowPicker(false);
                  setLinkSearch("");
                  setPick(null);
                  // Navigate to the existing link's row
                  onGoTo?.(existing.link_post_id);
                  return;
                }
                setPick(picked);
                setLinkSearch(picked.text);
                setLinkResults([]);
                setShowPicker(false);
              }}
            />
          )}
          {/* Search dropdown (only when no pick selected yet) */}
          {!pick && linkResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, maxWidth: 500,
              background: "#fff", border: `1px solid ${S.border}`, borderRadius: "0 0 6px 6px",
              maxHeight: 180, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,.08)",
            }}>
              {linkResults.map((r: any) => (
                <div key={r.post_id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    // Check if already linked
                    const existing = edges.find(e => e.claim_post_id === r.post_id);
                    if (existing) {
                      setLinkSearch("");
                      setPick(null);
                      setLinkResults([]);
                      onGoTo?.(existing.link_post_id);
                      return;
                    }
                    setPick(r);
                    setLinkSearch(r.text);
                    setLinkResults([]);
                  }}
                  style={{
                    display: "flex", gap: 6, padding: "6px 10px", fontSize: 12,
                    borderBottom: `1px solid ${S.borderLight}`, alignItems: "center", cursor: "pointer",
                  }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = S.bgHover; }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = "#fff"; }}
                >
                  <span style={{ color: S.textFaint, fontSize: 10, marginRight: 4 }}>#{r.post_id}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: S.text }}>
                    {r.text}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Pick confirmed — show type toggle, stake input, link button */}
          {pick && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <span
                onClick={() => setLinkType(linkType === "support" ? "challenge" : "support")}
                title={linkType === "support" ? "Support (click to toggle to challenge)" : "Challenge (click to toggle to support)"}
                style={{
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  padding: "3px 8px", borderRadius: 4,
                  background: linkType === "support" ? S.green : S.red,
                  color: "#fff", userSelect: "none" as const,
                }}
              >
                {linkType === "support" ? "✦ Support" : "⚔ Challenge"}
              </span>
              <input
                type="number"
                value={linkStake}
                onChange={(e) => setLinkStake(e.target.value)}
                placeholder="stake"
                style={{
                  width: 60, padding: "3px 6px", borderRadius: 4,
                  border: `1px solid ${S.border}`, fontSize: 11, textAlign: "right",
                }}
              />
              <span style={{ fontSize: 10, color: S.textMuted }}>VSP</span>
              <button
                onClick={doLink}
                disabled={linking}
                style={{
                  padding: "4px 12px", borderRadius: 4, border: "none",
                  background: linking ? S.textFaint : S.blue, color: "#fff",
                  fontSize: 11, fontWeight: 600, cursor: linking ? "not-allowed" : "pointer",
                }}
              >
                {linking ? "Signing…" : "Link & stake"}
              </button>
              <span
                onClick={() => { setPick(null); setLinkSearch(""); setLinkResults([]); }}
                style={{ fontSize: 10, color: S.textFaint, cursor: "pointer", marginLeft: 4 }}
              >Cancel</span>
            </div>
          )}
        </div>
      )}

      {/* Links section — gated + scrollable, choose direction */}
      {linksMode !== "none" && (
      <div style={{ maxHeight: 220, overflowY: "auto" as const, border: `1px solid ${S.borderLight}`, borderRadius: 4, marginTop: 6, marginBottom: 6 }}>
      {(linksMode === "incoming" ? edges : outgoingEdges).map((e) => {
        const isC = e.is_challenge;
        const linkTotal = (e.link_support ?? 0) + (e.link_challenge ?? 0);
        const linkVS = e.link_vs ?? 0;
        // Real edge contribution from the contract (signed VSP-equivalent).
        // Negative = pulls target VS down, positive = up. Sign already included.
        const effect = e.edge_contribution ?? 0;
        const effectStr = (effect >= 0 ? "+" : "") + effect.toFixed(2);
        const isStaking = stakingLinkId === e.link_post_id;

        return (
          <div key={e.link_post_id}>
            {/* Link row — same grid as claims, click to navigate to its main row */}
            <div
              style={{
                display: "grid", gridTemplateColumns: LINK_GRID,
                padding: "6px 0", alignItems: "center",
                cursor: "pointer", borderRadius: 4,
              }}
              onClick={() => onGoTo?.(e.link_post_id)}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = S.bgHover; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
            >
              {/* # */}
              <div style={{ fontSize: 11, color: S.textFaint, textAlign: "right", padding: "0 4px" }}>{e.link_post_id}</div>
              <div></div>
              {/* Badge */}
              <div style={{ padding: "0 4px" }}><Badge type="link" /></div>
              {/* Link text */}
              <div style={{ fontSize: 12, color: S.text, lineHeight: 1.5, padding: "0 6px" }}>
                <span style={{ fontWeight: 500, color: isC ? S.red : S.green }}>
                  {isC ? "Challenge" : "Support"}:
                </span>{" "}
                {linksMode === "outgoing" ? (
                  <>
                    <span style={{ color: S.textFaint }}>This claim{isC ? " challenges " : " supports "}</span>
                    <span style={{ color: S.textMuted }}>"{e.claim_text}"</span>
                  </>
                ) : (
                  <>
                    <span style={{ color: S.textMuted }}>"{e.claim_text}"</span>
                    <span style={{ color: S.textFaint }}>{isC ? " challenges this claim" : " supports this claim"}</span>
                  </>
                )}
              </div>
              {/* VS */}
              <div style={{ display: "flex", justifyContent: "center", padding: "0 2px" }}>
                <VSBar vs={linkVS} width={60} height={20} />
              </div>
              {/* Stake */}
              <div style={{ fontSize: 11, color: S.text, textAlign: "right", padding: "0 4px" }}>
                {linkTotal.toFixed(1)}
              </div>
              {/* Support */}
              <div style={{ fontSize: 11, color: S.green, textAlign: "right", padding: "0 4px" }}>
                {(e.link_support ?? 0).toFixed(1)}
              </div>
              {/* Challenge */}
              <div style={{ fontSize: 11, color: S.red, textAlign: "right", padding: "0 4px" }}>
                {(e.link_challenge ?? 0).toFixed(1)}
              </div>
              {/* Link effect (spans Links in + Links out columns) */}
              <div style={{ fontSize: 9, color: S.textFaint, textAlign: "right", padding: "0 2px", gridColumn: "span 2" }}>
                Effect {effectStr}
              </div>
              {/* Controversy placeholder */}
              <div></div>
              {/* Topic placeholder */}
              <div></div>
            </div>


          </div>
        );
      })}

      {(linksMode === "incoming" ? edges : outgoingEdges).length === 0 && !loading && !c.is_link && (
        <div style={{ fontSize: 11, color: S.textFaint, fontStyle: "italic", padding: "4px 0" }}>
          No {linksMode === "incoming" ? "incoming" : "outgoing"} links
        </div>
      )}
      {loading && <div style={{ fontSize: 11, color: S.textFaint, padding: "4px 0" }}>Loading links…</div>}
      </div>
      )}
    </div>
  );
}
