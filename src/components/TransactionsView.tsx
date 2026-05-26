// frontend/src/components/TransactionsView.tsx
// patch_bundle04_5_p31_revamp
// patch_bundle04_5_p32_action_refinements
//
// Bundle 4.5 patch 3.2: action-aware Amount/Cost rendering,
// present-tense labels using is_link_post + is_challenge,
// category-based color coding, link snippet composition.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useNavigate } from "react-router-dom";
import { S, formatAge, AddressTooltip } from "./claims-shared";
import Jazzicon from "./Jazzicon";
import { useNotifications } from "../notifications";

const API = import.meta.env.VITE_API_BASE || "/api";
const CHAIN_ENV = import.meta.env.VITE_CHAIN_ENV || "fuji";
const SNOWTRACE_BASE =
  CHAIN_ENV === "mainnet"
    ? "https://snowtrace.io"
    : "https://testnet.snowtrace.io";

type RecentRow = {
  source: "chain_tx" | "tx_log" | "mm_trade";
  source_id: number;
  ts_unix: number;
  tx_hash: string | null;
  block_number: number | null;
  action_type: string;
  event_name: string | null;
  contract: string | null;
  status: string;
  post_id: number | null;
  amount_vsp: number | null;
  counterparty: string | null;
  is_challenge: boolean | null;
  gas_used: number | null;
  error_message: string | null;
  claim_snippet: string | null;
  principal_vsp?: number | null;
  fee_vsp?: number | null;
  total_usdc?: number | null;
  avg_price_usd?: number | null;
  fee_usdc?: number | null;  // patch_bundle04_5_p33_fee_usdc

  // patch_bundle04_5_p32_action_refinements
  is_link_post?: boolean | null;
  link_from_text?: string | null;
  link_to_text?: string | null;
};

type Resp = {
  address: string;
  pending: Array<{
    id: number;
    tx_hash: string;
    action_type: string;
    submitted_at: string;
  }>;
  recent: RecentRow[];
  next_cursor: string | null;
};

type SortKey = "ts_unix" | "action_type" | "cost" | "status" | "post_id";
type SortDir = "asc" | "desc";

const PAGE_LIMIT = 25;

const GRID = "60px 160px 90px 90px 90px 50px 100px minmax(160px, 1fr)";

// ── action color + label (patch 3.2 refinements, revised) ───────────
//
// Color scheme picks per-row, not per-category, because:
//   • Create claim and Create link are both creation but distinct colors
//     (claim = blue; support link = dark blue; challenge link = dark red).
//   • Support and Challenge are the same category (stake) but opposite
//     colors (green vs red).
//   • Unstake and Transfer both muted.
//   • Buy/Sell neutral (default text).
//
function actionColor(r: RecentRow): string {
  switch (r.action_type) {
    case "claim":
      return S.blue;
    case "link":
      return r.is_challenge ? "#991b1b" : "#1e40af"; // dark red / dark blue
    case "stake":
      return r.is_challenge ? S.red : S.green;
    case "unstake":
    case "transfer_in":
    case "transfer_out":
      return S.textMuted;
    case "buy":
    case "sell":
      return S.text;
    default:
      return S.text;
  }
}

function fmtAction(r: RecentRow): string {
  const isLink = !!r.is_link_post;
  const target = isLink ? "link" : "claim";
  switch (r.action_type) {
    case "claim":         return "Create claim";
    case "link":          return r.is_challenge ? "Create challenge link" : "Create support link";
    case "stake":         return r.is_challenge ? `Challenge ${target}` : `Support ${target}`;
    case "unstake":       return `Withdraw from ${target}`;
    case "buy":           return "Buy VSP";
    case "sell":          return "Sell VSP";
    case "transfer_in":   return "Receive VSP";
    case "transfer_out":  return "Send VSP";
    default:              return r.action_type;
  }
}

function fmtVsp(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v === 0) return "0";
  if (Math.abs(v) < 0.001) return v.toExponential(2);
  return v.toFixed(v >= 100 ? 0 : v >= 1 ? 2 : 4);
}

function fmtStatus(s: string): { label: string; color: string; bg: string } {
  switch (s) {
    case "confirmed": return { label: "Confirmed", color: S.green, bg: S.greenLight };
    case "pending":   return { label: "Pending",   color: S.blue,  bg: S.blueLight };
    case "reverted":  return { label: "Reverted",  color: S.red,   bg: S.redLight };
    case "dropped":   return { label: "Dropped",   color: S.red,   bg: S.redLight };
    default:          return { label: s,           color: S.textMuted, bg: S.bgAlt };
  }
}

function shortHash(h: string | null): string {
  if (!h) return "";
  return h.slice(0, 6) + "…" + h.slice(-4);
}

// Action-aware amount + cost. Returns the values the row should
// display. Convention (patch 3.2):
//
//   creation (claim/link)        → amount = null  cost = fee_vsp
//   stake/unstake                → amount = principal_vsp ?? amount_vsp
//                                  cost   = fee_vsp
//   trade (buy/sell)             → amount = amount_vsp (VSP qty)
//                                  cost   = null (USDC is in expansion)
//   transfer_in/transfer_out     → amount = amount_vsp
//                                  cost   = null
//   default (legacy, anything)   → fall back to fee_vsp / amount_vsp
//
// Returning null where the value is unavailable so the UI shows "—"
// rather than an inaccurate "0".
function rowAmountAndCost(r: RecentRow): {
  amount: number | null;
  cost: number | null;
} {
  switch (r.action_type) {
    case "claim":
    case "link":
      return { amount: null, cost: r.fee_vsp ?? null };
    case "stake":
    case "unstake": {
      const principal =
        r.principal_vsp != null && r.principal_vsp > 0
          ? r.principal_vsp
          : r.amount_vsp != null && r.amount_vsp > 0
          ? r.amount_vsp
          : null;
      return { amount: principal, cost: r.fee_vsp ?? null };
    }
    case "buy":
    case "sell":
      // patch_bundle04_5_p33_fee_usdc — MM trade fee is in USDC, not VSP. Stored
      // separately so we can render with the right unit (see row
      // render below for the unit branch).
      return { amount: r.amount_vsp ?? null, cost: r.fee_usdc ?? null };
    case "transfer_in":
    case "transfer_out":
      return { amount: r.amount_vsp ?? null, cost: null };
    default:
      return {
        amount: r.amount_vsp ?? null,
        cost: r.fee_vsp ?? null,
      };
  }
}

// Snippet text for the Details column. For link posts we compose
// from link_from_text + link_to_text using verbs that mirror Claims.
function rowSnippet(r: RecentRow): string | null {
  if (r.is_link_post && (r.link_from_text || r.link_to_text)) {
    const f = r.link_from_text ? `"${r.link_from_text}"` : "?";
    const t = r.link_to_text ? `"${r.link_to_text}"` : "?";
    const verb = r.is_challenge ? "challenges" : "supports";
    return `${f} ${verb} ${t}`;
  }
  return r.claim_snippet ?? null;
}

function isAddress(s: string | null | undefined): boolean {
  return !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
}

// ── component ─────────────────────────────────────────────────

export default function TransactionsView() {
  const { address, isConnected } = useAccount();
  const { markAllRead } = useNotifications();
  const navigate = useNavigate();

  // patch_bundle04_5_p35_header — separate the subject of the query from the
  // connected wallet, so the user can paste any address and inspect.
  // patch_bundle04_5_p362_address_init — initialize both from address so the input does
  // not show its placeholder after view-switch remounts.
  const [addressInput, setAddressInput] = useState<string>(address || "");
  const [subjectAddress, setSubjectAddress] = useState<string>(address || "");
  useEffect(() => {
    // patch_bundle04_5_p362_address_init — keep input + subject synced to connected
    // address whenever it (re)arrives. If the user has typed a
    // DIFFERENT address into the input we leave them alone.
    if (!address) return;
    const trimmed = addressInput.trim().toLowerCase();
    const isUserOverride = trimmed && trimmed !== address.toLowerCase();
    if (!isUserOverride) {
      setAddressInput(address);
      setSubjectAddress(address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);
  const handleAddressBlur = () => {
    const trimmed = addressInput.trim();
    if (!trimmed) {
      setAddressInput(address || "");
      setSubjectAddress(address || "");
    } else if (trimmed.toLowerCase() !== subjectAddress.toLowerCase()) {
      setSubjectAddress(trimmed);
    }
  };

  const [rows, setRows] = useState<RecentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("ts_unix");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && address) markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPage = useCallback(
    async (before: string | null) => {
      if (!subjectAddress) return;
      setLoading(true);
      setError(null);
      try {
        const path = new URL(`${API}/notifications/${subjectAddress}`, window.location.origin);
        path.searchParams.set("recent_limit", String(PAGE_LIMIT));
        if (before) path.searchParams.set("before_cursor", before);
        const res = await fetch(path.toString().replace(window.location.origin, ""));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Resp = await res.json();
        setRows((prev) => (before ? [...prev, ...data.recent] : data.recent));
        setCursor(data.next_cursor);
        if (!data.next_cursor) setDone(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [subjectAddress]
  );

  useEffect(() => {
    setRows([]);
    setCursor(null);
    setDone(false);
    if (subjectAddress) fetchPage(null);
  }, [subjectAddress, fetchPage]);

  useEffect(() => {
    if (!address) return;
    const handler = () => {
      setRows([]);
      setCursor(null);
      setDone(false);
      fetchPage(null);
    };
    window.addEventListener("verisphere:tx-resolved", handler);
    return () => window.removeEventListener("verisphere:tx-resolved", handler);
  }, [subjectAddress, fetchPage]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || done || loading || !cursor) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor) fetchPage(cursor);
      },
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, done, loading, fetchPage]);

  const distinctActions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(r.action_type);
    return Array.from(seen).sort();
  }, [rows]);

  const distinctStatuses = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(r.status);
    return Array.from(seen).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let xs = rows;
    if (actionFilter) xs = xs.filter((r) => r.action_type === actionFilter);
    if (statusFilter) xs = xs.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      xs = xs.filter(
        (r) =>
          (r.tx_hash || "").toLowerCase().includes(q) ||
          (r.claim_snippet || "").toLowerCase().includes(q) ||
          (r.link_from_text || "").toLowerCase().includes(q) ||
          (r.link_to_text || "").toLowerCase().includes(q) ||
          (r.counterparty || "").toLowerCase().includes(q) ||
          String(r.post_id || "").includes(q) ||
          (r.error_message || "").toLowerCase().includes(q)
      );
    }
    return xs;
  }, [rows, search, actionFilter, statusFilter]);

  const sorted = useMemo(() => {
    const xs = [...filtered];
    xs.sort((a, b) => {
      let av: number | string | null;
      let bv: number | string | null;
      switch (sortKey) {
        case "ts_unix":     av = a.ts_unix;        bv = b.ts_unix;        break;
        case "action_type": av = a.action_type;    bv = b.action_type;    break;
        case "cost":        av = rowAmountAndCost(a).cost ?? -1; bv = rowAmountAndCost(b).cost ?? -1; break;
        case "status":      av = a.status;         bv = b.status;         break;
        case "post_id":     av = a.post_id ?? -1;  bv = b.post_id ?? -1;  break;
        default:            av = 0; bv = 0;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === "string"
          ? av.localeCompare(bv as string)
          : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return xs;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "action_type" || key === "status" ? "asc" : "desc");
    }
  };

  const stats = useMemo(() => {
    const actions = rows.filter((r) => ["claim", "link"].includes(r.action_type)).length;
    const stakes  = rows.filter((r) => ["stake", "unstake"].includes(r.action_type)).length;
    const trades  = rows.filter((r) => ["buy", "sell"].includes(r.action_type)).length;
    const totalCost = rows.reduce((s, r) => s + (r.fee_vsp || 0), 0);
    return { loaded: rows.length, actions, stakes, trades, totalCost };
  }, [rows]);

  const gotoClaim = useCallback(
    (postId: number) => {
      (window as unknown as { __claimsGoto?: number }).__claimsGoto = postId;
      navigate("/claims");
    },
    [navigate]
  );

  if (!isConnected) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px", color: S.textMuted, fontSize: 14 }}>
        Connect your wallet to see your transactions.
      </div>
    );
  }

  const COLS: { key: SortKey | null; label: string; align: "left" | "right" }[] = [
    { key: "ts_unix",     label: "Age",     align: "left"  },  // patch_bundle09_p1a_nav_portfolio_age_time
    { key: "action_type", label: "Action",  align: "left"  },
    { key: null,          label: "Net",     align: "right" },  // patch_bundle04_5_p34_rename
    { key: "cost",        label: "Fee",     align: "right" },  // patch_bundle04_5_p34_rename
    { key: "status",      label: "Status",  align: "left"  },
    { key: "post_id",     label: "Post",    align: "right" },
    { key: null,          label: "Tx",      align: "left"  },
    { key: null,          label: "Details", align: "left"  },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column" as const, height: "100%", minHeight: 0 }}>
      {/* Header — patch_bundle04_5_p35_header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: S.text, margin: 0 }}>Transactions</h1>
            <span style={{ fontSize: 13, color: S.textMuted }}>Your on-chain activity, protocol fees, and MM trades</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => { setRows([]); setCursor(null); setDone(false); fetchPage(null); }}
              style={{ background: "none", border: `1px solid ${S.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, color: S.textMuted, cursor: "pointer" }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
        <input
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          onBlur={handleAddressBlur}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="0x..."  // patch_bundle04_5_p36_placeholder
          style={{
            marginTop: 4, fontSize: 11, color: S.textMuted, border: "none", background: "transparent",
            padding: "2px 0", fontFamily: "monospace", width: 480, outline: "none",
            borderBottom: `1px dashed ${S.border}`,
          }}
        />
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Loaded",     value: String(stats.loaded) + (done ? "" : "+") },
          { label: "Actions",    value: String(stats.actions) },
          { label: "Stakes",     value: String(stats.stakes) },
          { label: "Trades",     value: String(stats.trades) },
          { label: "Total Fees", value: stats.totalCost > 0 ? `${fmtVsp(stats.totalCost)} VSP` : "—" },  // patch_bundle04_5_p34_rename
        ].map((s, i) => (
          <div key={i} style={{ padding: "10px 16px", background: S.bgAlt, borderRadius: 8, border: `1px solid ${S.border}`, minWidth: 90 }}>
            <div style={{ fontSize: 10, color: S.textFaint, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".04em", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: S.text }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tx / details / address…"
          style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${S.border}`, fontSize: 13, width: 240 }} />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${S.border}`, fontSize: 13, background: "#fff" }}>
          <option value="">All actions</option>
          {distinctActions.map((a) => (
            <option key={a} value={a}>{fmtAction({ action_type: a, is_link_post: false, is_challenge: false } as RecentRow)}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${S.border}`, fontSize: 13, background: "#fff" }}>
          <option value="">All statuses</option>
          {distinctStatuses.map((s) => (
            <option key={s} value={s}>{fmtStatus(s).label}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: S.textFaint }}>
          {sorted.length} {sorted.length === 1 ? "entry" : "entries"}
          {search || actionFilter || statusFilter ? " (filtered)" : ""}
          {!done ? ", more available" : ""}
        </span>
      </div>

      {error && (
        <div style={{ background: S.redLight, color: S.red, padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          Couldn't load: {error}
        </div>
      )}

      {/* Table */}
      <div style={{ border: `1px solid ${S.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" as const, flex: 1, minHeight: 0, overflowX: "auto" as const }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, background: S.bgAlt, borderBottom: `2px solid ${S.border}`, padding: "0 16px" }}>
          {COLS.map((col, ci) => {
            const sortable = col.key != null;
            const active = sortable && sortKey === col.key;
            return (
              <div key={ci} onClick={() => sortable && toggleSort(col.key as SortKey)}
                style={{
                  padding: "10px 4px", cursor: sortable ? "pointer" : "default",
                  userSelect: "none" as const, whiteSpace: "nowrap" as const,
                  fontWeight: 600, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: ".03em",
                  color: active ? S.blue : S.textFaint, textAlign: col.align,
                }}>
                {col.label}
                {active && <span style={{ marginLeft: 2, fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {sorted.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: "center", color: S.textFaint, fontSize: 13 }}>
              {rows.length === 0 ? "No transactions yet." : "No transactions match the filter."}
            </div>
          )}

          {sorted.map((r, i) => {
            const rowKey = `${r.source}:${r.source_id}`;
            const isExpanded = expandedKey === rowKey;
            const label = fmtAction(r);
            const labelColor = actionColor(r);
            const st = fmtStatus(r.status);
            const { amount, cost } = rowAmountAndCost(r);
            const snippet = rowSnippet(r);
            const hasPost = r.post_id != null;
            return (
              <div key={rowKey}>
                <div
                  onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                  style={{
                    display: "grid", gridTemplateColumns: GRID, padding: "8px 16px", cursor: "pointer",
                    borderBottom: isExpanded ? "none" : `1px solid ${S.borderLight}`,
                    background: isExpanded ? S.bgExpanded : i % 2 === 0 ? S.bgRow : S.bgAlt,
                    transition: "background 0.12s", alignItems: "center",
                  }}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = S.bgHover; }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = i % 2 === 0 ? S.bgRow : S.bgAlt; }}
                >
                  <div style={{ fontSize: 11, color: S.textFaint, textAlign: "left" as const, padding: "0 4px" }}
                       title={new Date(r.ts_unix * 1000).toLocaleString()}>
                    {formatAge(r.ts_unix)}
                  </div>

                  <div style={{
                    fontSize: 13, fontWeight: 500, padding: "0 4px",
                    color: labelColor, whiteSpace: "nowrap" as const,
                    overflow: "hidden" as const, textOverflow: "ellipsis" as const,
                  }}>
                    {label}
                  </div>

                  <div style={{
                    fontSize: 13, textAlign: "right" as const, padding: "0 4px",
                    fontVariantNumeric: "tabular-nums" as const,
                    color: amount != null ? S.text : S.textFaint,
                  }}>
                    {amount != null ? `${fmtVsp(amount)} VSP` : "—"}
                    {r.source === "mm_trade" && r.total_usdc != null && (
                      <div style={{ fontSize: 10, color: S.textFaint }}>${fmtVsp(r.total_usdc)}</div>
                    )}
                  </div>

                  <div style={{
                    fontSize: 13, textAlign: "right" as const, padding: "0 4px",
                    fontVariantNumeric: "tabular-nums" as const,
                    color: cost != null ? S.textMuted : S.textFaint,
                  }}>
                    {cost != null ? (
                      r.action_type === "buy" || r.action_type === "sell"
                        ? `$${fmtVsp(cost)} USDC`
                        : `${fmtVsp(cost)} VSP`
                    ) : "—"}
                  </div>

                  <div style={{ padding: "0 4px" }}>
                    <span style={{
                      display: "inline-block" as const, padding: "1px 8px",
                      background: st.bg, color: st.color, borderRadius: 999,
                      fontSize: 11, fontWeight: 500,
                    }}>{st.label}</span>
                  </div>

                  <div
                    style={{ fontSize: 12, color: hasPost ? S.blue : S.textFaint, textAlign: "right" as const, padding: "0 4px", cursor: hasPost ? "pointer" : "default" }}
                    onClick={(e) => { if (hasPost) { e.stopPropagation(); gotoClaim(r.post_id as number); } }}
                  >
                    {hasPost ? `#${r.post_id}` : "—"}
                  </div>

                  <div style={{ fontSize: 12, padding: "0 4px" }}>
                    {r.tx_hash ? (
                      <a href={`${SNOWTRACE_BASE}/tx/${r.tx_hash}`} target="_blank" rel="noreferrer noopener"
                         onClick={(e) => e.stopPropagation()}
                         style={{ color: S.blue, textDecoration: "none" }} title={r.tx_hash}>
                        {shortHash(r.tx_hash)}
                      </a>
                    ) : (
                      <span style={{ color: S.textFaint }}>—</span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 12, color: S.textMuted, padding: "0 4px",
                      overflow: "hidden" as const, textOverflow: "ellipsis" as const,
                      whiteSpace: "nowrap" as const, cursor: hasPost ? "pointer" : "default",
                    }}
                    onClick={(e) => { if (hasPost) { e.stopPropagation(); gotoClaim(r.post_id as number); } }}
                  >
                    {r.error_message ? (
                      <span style={{ color: S.red }} title={r.error_message}>{r.error_message}</span>
                    ) : snippet ? (
                      <span
                        style={{ color: hasPost ? S.blue : S.textMuted, textDecoration: hasPost ? "underline" : "none" }}
                        title={snippet}
                      >
                        {snippet}
                      </span>
                    ) : ""}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: "12px 24px 16px", background: S.bgExpanded, borderBottom: `1px solid ${S.borderLight}`, fontSize: 12, color: S.text }}>
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 6, columnGap: 12 }}>
                      <Field label="Source">
                        <span style={{ color: S.textMuted }}>
                          {r.source === "chain_tx" ? "Chain event" : r.source === "tx_log" ? "Relay record" : "MM trade"}
                        </span>
                      </Field>
                      {r.event_name && (
                        <Field label="Event">
                          <span style={{ color: S.textMuted }}>
                            {r.event_name}{r.contract ? ` on ${r.contract}` : ""}
                          </span>
                        </Field>
                      )}
                      {r.tx_hash && (
                        <Field label="Tx hash">
                          <a href={`${SNOWTRACE_BASE}/tx/${r.tx_hash}`} target="_blank" rel="noreferrer noopener"
                             style={{ color: S.blue, fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" as const }}>
                            {r.tx_hash}
                          </a>
                        </Field>
                      )}
                      {r.block_number != null && (
                        <Field label="Block"><span style={{ color: S.textMuted, fontFamily: "monospace" }}>{r.block_number}</span></Field>
                      )}
                      {r.gas_used != null && (
                        <Field label="Gas"><span style={{ color: S.textMuted, fontFamily: "monospace" }}>{r.gas_used.toLocaleString()}</span></Field>
                      )}
                      {r.principal_vsp != null && (
                        <Field label="Principal"><span style={{ fontFamily: "monospace" }}>{fmtVsp(r.principal_vsp)} VSP</span></Field>
                      )}
                      {r.fee_vsp != null && (
                        <Field label="Fee"><span style={{ fontFamily: "monospace" }}>{fmtVsp(r.fee_vsp)} VSP</span></Field>
                      )}
                      {r.is_link_post != null && (
                        <Field label="Post kind">
                          <span style={{ color: S.textMuted }}>{r.is_link_post ? "Link" : "Claim"}</span>
                        </Field>
                      )}
                      {r.counterparty && (
                        <Field label="Counterparty">
                          {isAddress(r.counterparty) ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <AddressTooltip address={r.counterparty}>
                                <Jazzicon address={r.counterparty} size={14} />
                              </AddressTooltip>
                              <span style={{ fontFamily: "monospace", fontSize: 11, color: S.textMuted }}>{r.counterparty}</span>
                            </span>
                          ) : (
                            <span style={{ color: S.textMuted }}>{r.counterparty}</span>
                          )}
                        </Field>
                      )}
                      {r.is_challenge != null && (
                        <Field label="Challenge?"><span style={{ color: S.textMuted }}>{r.is_challenge ? "Yes" : "No"}</span></Field>
                      )}
                      {r.source === "mm_trade" && r.avg_price_usd != null && (
                        <Field label="Avg price"><span style={{ fontFamily: "monospace" }}>${fmtVsp(r.avg_price_usd)} / VSP</span></Field>
                      )}
                      {r.source === "mm_trade" && r.total_usdc != null && (
                        <Field label="Total USDC"><span style={{ fontFamily: "monospace" }}>${fmtVsp(r.total_usdc)}</span></Field>
                      )}
                      {/* patch_bundle04_5_p33_fee_usdc */}
                      {r.source === "mm_trade" && r.fee_usdc != null && (
                        <Field label="Fee (USDC)"><span style={{ fontFamily: "monospace" }}>${fmtVsp(r.fee_usdc)}</span></Field>
                      )}
                      {r.error_message && (
                        <Field label="Error"><span style={{ color: S.red }}>{r.error_message}</span></Field>
                      )}
                      {hasPost && snippet && (
                        <Field label={r.is_link_post ? "Link" : "Claim"}>
                          <span onClick={() => gotoClaim(r.post_id as number)}
                                style={{ color: S.blue, textDecoration: "underline", cursor: "pointer" }}>
                            #{r.post_id} — {snippet}
                          </span>
                        </Field>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!done && (
            <div ref={sentinelRef} style={{ padding: 16, textAlign: "center", color: S.textFaint, fontSize: 12 }}>
              {loading ? "Loading…" : cursor ? "Scroll to load more" : ""}
            </div>
          )}
          {done && rows.length > 0 && (
            <div style={{ padding: 16, textAlign: "center", color: S.textFaint, fontSize: 12 }}>End of history.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 600, color: S.textFaint, textTransform: "uppercase" as const, letterSpacing: ".04em", paddingTop: 2 }}>{label}</div>
      <div>{children}</div>
    </>
  );
}
