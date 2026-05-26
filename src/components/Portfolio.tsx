// frontend/src/components/Portfolio.tsx — unified with Claims view
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount } from "wagmi";
import Jazzicon from "./Jazzicon";
import VSBar from "./VSBar";
import {
  S, formatAge,
  AddressTooltip, Badge, ExpandedClaimDetail,
} from "./claims-shared";

const API = import.meta.env.VITE_API_BASE || "/api";

// 12-column grid matching Claims view layout visually, with Portfolio-specific tail
const GRID = "32px 48px 48px minmax(200px,1fr) 72px 54px 54px 54px 54px 44px 54px 80px";

type Position = {
  post_id: number;
  post_type: "claim" | "link" | "unknown";
  is_link?: boolean;
  text: string;
  creator?: string;
  topic?: string | null;
  created_epoch?: number;
  from_post_id?: number | null;
  to_post_id?: number | null;
  is_challenge?: boolean | null;
  from_text?: string | null;
  to_text?: string | null;
  user_support: number;
  user_challenge: number;
  user_total: number;
  user_net_side: "support" | "challenge" | "both";
  pool_support: number;
  pool_challenge: number;
  pool_total: number;
  verity_score: number;
  is_active: boolean;
  position_status: "winning" | "losing" | "neutral" | "hedged";
  estimated_apr: number;
  apr_breakdown?: {
    apr: number; total_stake: number; s_max: number;
    participation: number; r_eff: number; is_winner: boolean;
    position_weight?: number;
  };
};

type PortfolioData = {
  address: string;
  position_count: number;
  summary: {
    total_staked: number;
    total_support: number;
    total_challenge: number;
    winning_count: number;
    losing_count: number;
    weighted_apr: number;
    neutral_count: number;
    winning_stake?: number;
    losing_stake?: number;
  };
  positions: Position[];
};

type Filter = "all" | "winning" | "losing" | "claims" | "links";
type SortKey = "post_id" | "created_epoch" | "text" | "verity_score" | "pool_total" | "pool_support" | "pool_challenge" | "user_total" | "position_status" | "estimated_apr" | "topic";
type SortDir = "asc" | "desc";


export default function Portfolio() {  // patch_bundle09_p1_page_titles_age_sort
  const { address: connectedAddress, isConnected } = useAccount();
  const [subjectAddress, setSubjectAddress] = useState<string>("");
  const [addressInput, setAddressInput] = useState<string>("");
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("user_total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (connectedAddress) {
      setSubjectAddress(connectedAddress);
      setAddressInput(connectedAddress);
    }
  }, [connectedAddress]);

  const loadPortfolio = useCallback(async () => {
    if (!subjectAddress) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/portfolio/fast/${subjectAddress}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      // Fudge user_total to match live staking-section value (projected on-chain)
      try {
        const post_ids = d.positions.map((p: Position) => p.post_id);
        const r = await fetch(`${API}/user-stakes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: subjectAddress, post_ids }),
        });
        if (r.ok) {
          const { stakes } = await r.json();
          for (const p of d.positions) {
            const s = stakes[String(p.post_id)];
            if (s) {
              p.user_support = Number(s.user_support) || 0;
              p.user_challenge = Number(s.user_challenge) || 0;
              p.user_total = p.user_support + p.user_challenge;
            }
          }
        }
      } catch { /* keep indexed values */ }
      setData(d);
    } catch (e: any) {
      setError(e.message || "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, [subjectAddress]);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  const handleAddressBlur = () => {
    const trimmed = addressInput.trim();
    if (!trimmed) {
      setAddressInput(connectedAddress || "");
      setSubjectAddress(connectedAddress || "");
    } else if (trimmed.toLowerCase() !== subjectAddress.toLowerCase()) {
      setSubjectAddress(trimmed);
    }
  };

  const goToClaims = (postId: number) => {
    window.dispatchEvent(new CustomEvent("verisphere:navigate", {
      detail: { view: "claims", postId },
    }));
  };

  const goToTopic = (topic: string) => {
    window.dispatchEvent(new CustomEvent("verisphere:navigate", {
      detail: { topic },
    }));
  };

  const positions = data?.positions || [];

  const filtered = useMemo(() => {
    let list = positions;
    if (filter === "winning") list = list.filter(p => p.position_status === "winning");
    else if (filter === "losing") list = list.filter(p => p.position_status === "losing");
    else if (filter === "claims") list = list.filter(p => !p.is_link);
    else if (filter === "links") list = list.filter(p => p.is_link);
    return list;
  }, [positions, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (typeof av === "string") {
        return sortDir === "asc"
          ? String(av || "").localeCompare(String(bv || ""))
          : String(bv || "").localeCompare(String(av || ""));
      }
      const na = Number(av) || 0, nb = Number(bv) || 0;
      return sortDir === "asc" ? na - nb : nb - na;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "text" || key === "topic" || key === "position_status" ? "asc" : "desc");
    }
  };

  const counts = useMemo(() => ({
    all: positions.length,
    winning: positions.filter(p => p.position_status === "winning").length,
    losing: positions.filter(p => p.position_status === "losing").length,
    claims: positions.filter(p => !p.is_link).length,
    links: positions.filter(p => p.is_link).length,
  }), [positions]);

  if (!isConnected && !subjectAddress) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: S.textMuted }}>
        Connect your wallet to view your portfolio.
      </div>
    );
  }

  const summary = data?.summary;
  const winPct = summary && summary.total_staked > 0
    ? ((summary.winning_stake ?? summary.total_support) / summary.total_staked) * 100
    : 0;

  const COLS: { key: SortKey; label: string; align: "left" | "right"; padRight?: number; padLeft?: number }[] = [
    { key: "post_id", label: "#", align: "right", padRight: 8 },
    { key: "created_epoch", label: "Age", align: "right", padRight: 8 },
    { key: "text", label: "C/L", align: "left" },
    { key: "text", label: "Claim / Link", align: "left" },
    { key: "verity_score", label: "VS", align: "left", padLeft: 14 },
    { key: "pool_total", label: "Stake", align: "right" },
    { key: "pool_support", label: "Support", align: "right" },
    { key: "pool_challenge", label: "Challenge", align: "right" },
    { key: "user_total", label: "Yours", align: "right" },
    { key: "position_status", label: "Status", align: "right", padRight: 6 },
    { key: "estimated_apr", label: "APR", align: "right", padRight: 10 },
    { key: "topic", label: "Topic", align: "right", padRight: 6 },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "16px 24px", gap: 12 }}>
      {/* Header — patch_bundle04_5_p35_header */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: S.text }}>Positions</h1>
            <span style={{ fontSize: 13, color: S.textMuted }}>Your stake positions and their performance</span>
          </div>
          <button onClick={loadPortfolio} style={{
            padding: "6px 12px", borderRadius: 5, border: `1px solid ${S.border}`,
            background: "#fff", fontSize: 12, cursor: "pointer", color: S.textMuted,
          }}>⟲ Refresh</button>
        </div>
        <input
          value={addressInput}
          onChange={e => setAddressInput(e.target.value)}
          onBlur={handleAddressBlur}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          style={{
            marginTop: 4, fontSize: 11, color: S.textMuted, border: "none", background: "transparent",
            padding: "2px 0", fontFamily: "monospace", width: 480, outline: "none",
            borderBottom: `1px dashed ${S.border}`,
          }}
          placeholder="0x..."
        />
      </div>

      {summary && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatBox label="TOTAL STAKED" value={`${summary.total_staked.toFixed(2)} VSP`} sub={`${positions.length} positions`} />
            <StatBox label="WINNING" value={String(summary.winning_count)} sub={`${summary.total_support.toFixed(2)} support`} color={S.green} />
            <StatBox label="LOSING" value={String(summary.losing_count)} sub={`${summary.total_challenge.toFixed(2)} challenge`} color={S.red} />
            <StatBox label="OVERALL APR" value={`${summary.weighted_apr > 0 ? "+" : ""}${summary.weighted_apr.toFixed(1)}%`} sub="weighted average" color={summary.weighted_apr > 0 ? S.green : S.red} />
          </div>
          {summary.total_staked > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 6, background: S.borderLight, borderRadius: 3, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${winPct}%`, background: S.green }} />
              <div style={{ flex: 1, background: S.red }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: S.textFaint }}>
              <span>{winPct.toFixed(0)}% winning</span>
              <span>{(100 - winPct).toFixed(0)}% losing</span>
            </div>
          </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        {(["all", "winning", "losing", "claims", "links"] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "5px 12px", borderRadius: 5, border: `1px solid ${filter === f ? S.text : S.border}`,
            background: filter === f ? S.text : "#fff",
            color: filter === f ? "#fff" : S.textMuted,
            fontSize: 12, cursor: "pointer", textTransform: "capitalize" as const,
          }}>{f} ({counts[f]})</button>
        ))}
      </div>

      {loading && <div style={{ padding: 20, color: S.textMuted }}>Loading…</div>}
      {error && <div style={{ padding: 20, color: S.red }}>{error}</div>}
      {!loading && !error && (
        <div style={{ flex: 1, overflowY: "auto", border: `1px solid ${S.border}`, borderRadius: 6, background: "#fff" }}>
          {/* Header row */}
          <div style={{
            display: "grid", gridTemplateColumns: GRID,
            background: S.bgAlt, borderBottom: `1px solid ${S.border}`,
            fontSize: 9, fontWeight: 600, color: S.textMuted,
            textTransform: "uppercase" as const, letterSpacing: 0.5,
            position: "sticky" as const, top: 0, zIndex: 10,
          }}>
            {COLS.map((col, ci) => {
              const padRight = col.padRight ?? 4;
              const padLeft = col.padLeft ?? 4;
              const isActive = sortKey === col.key && (ci !== 0 && ci !== 2);  // patch_bundle09_p1a_nav_portfolio_age_time: # and C/L non-sortable; Age sortable
              return (
                <div key={ci}
                  onClick={() => (ci !== 0 && ci !== 2) && toggleSort(col.key)}
                  style={{
                    padding: `10px ${padRight}px 10px ${padLeft}px`,
                    textAlign: col.align,
                    cursor: (ci !== 0 && ci !== 2) ? "pointer" : "default",
                    color: isActive ? S.blue : S.textMuted,
                    userSelect: "none" as const,
                  }}>
                  {col.label}
                  {isActive && <span style={{ marginLeft: 2, fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </div>
              );
            })}
          </div>

          {sorted.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: S.textFaint, fontSize: 13 }}>
              No positions match this filter.
            </div>
          )}

          {sorted.map(p => {
            const isExpanded = expandedId === p.post_id;
            const statusColor = p.position_status === "winning" ? S.green :
                                p.position_status === "losing" ? S.red : S.textMuted;
            // Display pool total floored at sMax so participation never visually exceeds 100%
            const smax = p.apr_breakdown?.s_max || p.pool_total;
            const displayedPoolTotal = Math.min(p.pool_total, smax);
            return (
              <div key={p.post_id} id={`portfolio-row-${p.post_id}`}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : p.post_id)}
                  style={{
                    display: "grid", gridTemplateColumns: GRID,
                    borderBottom: `1px solid ${S.borderLight}`, alignItems: "center",
                    cursor: "pointer", background: isExpanded ? S.bgExpanded : "#fff", fontSize: 12,
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = S.bgHover; }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "#fff"; }}
                >
                  <div style={{ fontSize: 11, color: S.textFaint, textAlign: "right", padding: "8px 8px 8px 4px" }}>{p.post_id}</div>
                  <div style={{ fontSize: 10, color: S.textFaint, textAlign: "right", padding: "8px 8px 8px 4px" }}>
                    {formatAge(p.created_epoch)}
                  </div>
                  <div style={{ padding: "0 6px 0 4px", display: "flex", alignItems: "center", gap: 4 }}>
                    {p.creator && (
                      <AddressTooltip address={p.creator}>
                        <Jazzicon address={p.creator} size={16} />
                      </AddressTooltip>
                    )}
                    {p.is_link && <Badge type="link" />}
                  </div>
                  <div style={{
                    padding: "8px 4px", color: S.text,
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: (isExpanded ? "normal" : "nowrap") as const,
                    fontWeight: isExpanded ? 500 : 400,
                    minWidth: 0,
                  }} title={p.text}>
                    {p.is_link && p.from_text && p.to_text ? (
                      <>
                        <span style={{ color: p.is_challenge ? S.red : S.green, fontWeight: 500 }}>
                          {p.is_challenge ? "Challenge: " : "Support: "}
                        </span>
                        <span
                          style={{ cursor: "pointer", borderBottom: `1px dotted ${S.textFaint}` }}
                          onClick={(ev) => { ev.stopPropagation(); if (p.from_post_id != null) goToClaims(p.from_post_id); }}
                          title="Go to source claim"
                        >"{p.from_text}"</span>{" "}
                        <span style={{ color: S.textFaint }}>{p.is_challenge ? "challenges" : "supports"}</span>{" "}
                        <span
                          style={{ cursor: "pointer", borderBottom: `1px dotted ${S.textFaint}` }}
                          onClick={(ev) => { ev.stopPropagation(); if (p.to_post_id != null) goToClaims(p.to_post_id); }}
                          title="Go to target claim"
                        >"{p.to_text}"</span>
                      </>
                    ) : p.text}
                  </div>
                  <div style={{ padding: "0 4px 0 14px" }}>
                    <VSBar vs={p.verity_score} />
                  </div>
                  <div style={{ padding: "8px 4px", textAlign: "right", color: S.text }}>
                    {displayedPoolTotal.toFixed(1)}
                  </div>
                  <div style={{ padding: "8px 4px", textAlign: "right", color: p.pool_support > 0 ? S.green : S.textFaint }}>
                    {p.pool_support > 0 ? p.pool_support.toFixed(1) : "—"}
                  </div>
                  <div style={{ padding: "8px 4px", textAlign: "right", color: p.pool_challenge > 0 ? S.red : S.textFaint }}>
                    {p.pool_challenge > 0 ? p.pool_challenge.toFixed(1) : "—"}
                  </div>
                  <div style={{ padding: "8px 4px", textAlign: "right", fontWeight: 500, color: S.text }}>
                    {p.user_total.toFixed(2)}
                  </div>
                  <div style={{ padding: "8px 6px 8px 4px", textAlign: "right", color: statusColor, fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const }}>
                    {p.position_status === "winning" ? "WIN" :
                     p.position_status === "losing" ? "LOSE" :
                     p.position_status === "hedged" ? "HDG" : "—"}
                  </div>
                  <div style={{ padding: "8px 10px 8px 4px", textAlign: "right", color: p.estimated_apr > 0 ? S.green : p.estimated_apr < 0 ? S.red : S.textFaint, fontWeight: 500 }}>
                    {p.estimated_apr > 0 ? "+" : ""}{p.estimated_apr.toFixed(1)}%
                  </div>
                  <div style={{ padding: "8px 6px", textAlign: "right", fontSize: 10,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {p.topic ? (
                      <a href="#" onClick={e => { e.preventDefault(); e.stopPropagation(); goToTopic(p.topic!); }}
                         style={{ color: S.blue, textDecoration: "none" }} title={`Open article: ${p.topic}`}>
                        {p.topic}
                      </a>
                    ) : <span style={{ color: S.textFaint }}>—</span>}
                  </div>
                </div>
                {isExpanded && (
                  <>
                    <div style={{
                      padding: "6px 16px 6px 96px",
                      background: S.bgExpanded,
                      fontSize: 11, color: S.textMuted,
                      display: "flex", gap: 18,
                      borderBottom: `1px solid ${S.borderLight}`,
                    }}>
                      <span style={{ color: statusColor, fontWeight: 600, textTransform: "capitalize" as const }}>
                        {p.position_status}
                      </span>
                      <span>
                        <span style={{ color: p.estimated_apr >= 0 ? S.green : S.red, fontWeight: 500 }}>
                          {p.estimated_apr >= 0 ? "+" : ""}{p.estimated_apr.toFixed(1)}%
                        </span> APR
                      </span>
                      <span>
                        Size: {displayedPoolTotal.toFixed(1)} / {(p.apr_breakdown?.s_max || 0).toFixed(1)}
                      </span>
                      <span>
                        Position: {((p.apr_breakdown?.position_weight || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <ExpandedClaimDetail
                      claim={{
                        post_id: p.post_id,
                        text: p.text,
                        creator: p.creator,
                        verity_score: p.verity_score,
                        base_vs: p.verity_score,
                        stake_support: p.pool_support,
                        stake_challenge: p.pool_challenge,
                        total_stake: displayedPoolTotal,
                        controversy: 0,
                        incoming_links: 0,
                        outgoing_links: 0,
                        topic: p.topic || "",
                        created_at: null,
                        created_epoch: p.created_epoch,
                        is_link: p.is_link,
                        from_post_id: p.from_post_id ?? undefined,
                        to_post_id: p.to_post_id ?? undefined,
                        is_challenge: p.is_challenge ?? undefined,
                        from_text: p.from_text ?? undefined,
                        to_text: p.to_text ?? undefined,
                      }}
                      onRefresh={loadPortfolio}
                      onClose={() => setExpandedId(null)}
                      onGoTo={goToClaims}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {  // patch_bundle09_p2_portfolio_statbox_style
  return (
    <div style={{ padding: "10px 16px", background: S.bgAlt, borderRadius: 8, border: `1px solid ${S.border}`, minWidth: 90 }}>
      <div style={{ fontSize: 10, color: S.textFaint, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".04em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || S.text }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: S.textFaint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
