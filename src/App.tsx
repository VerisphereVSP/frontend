// frontend/src/App.tsx
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import MarketWidget from "./components/MarketWidget"; // patch_trackb_fe_swap: routes pool vs legacy MM surface
import TransactionsView from "./components/TransactionsView";  /* patch_bundle04_5_p3_tx_import */
import { useNotifications } from "./notifications";  /* patch_bundle04_5_p3_tx_import */
import ContentPanel from "./components/ContentPanel";
import { TxProgress } from "./components/article";
import ClaimsExplorer from "./components/ClaimsExplorer";
import Portfolio from "./components/Portfolio";

const API = import.meta.env.VITE_API_BASE || "/api";
type View = "explore" | "claims" | "portfolio" | "transactions";  /* patch_bundle04_5_p3_tx_nav */
type Suggestion = { key: string; title: string; source: string };

/* ── Landing Hero (shown when no topic is selected) ── */


function TopicPills({ onSelect, currentTopic }: { onSelect: (t: string) => void; currentTopic: string }) {
  const [topics, setTopics] = useState<{ key: string; title: string }[]>([]);
  const API = (import.meta as any).env?.VITE_API_BASE || "/api";

  useEffect(() => {
    fetch(`${API}/topics/popular?limit=10`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.topics?.length > 0) {
          const seen = new Set<string>();
            setTopics(data.topics
              .map((t: any) => ({ key: t.key, title: t.title || t.key }))
              .filter((t: any) => { const k = t.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
            );
        }
      })
      .catch(() => {});
  }, []);

  if (topics.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "6px 16px",
        background: "rgba(255,255,255,0.95)",
        borderBottom: "1px solid #e5e7eb",
        flexWrap: "wrap",
        alignItems: "center",
        maxHeight: 64,
        overflow: "hidden",
        position: "relative" as const,
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>Topics:</span>
      {topics.map((t) => {
        const isCurrent = t.key === currentTopic.toLowerCase().replace(/\s+/g, "-");
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.title)}
            style={{
              padding: "3px 12px",
              borderRadius: 14,
              border: isCurrent ? "1px solid #2563eb" : "1px solid #e5e7eb",
              background: isCurrent ? "#eff6ff" : "#fff",
              fontSize: 12,
              cursor: "pointer",
              color: isCurrent ? "#2563eb" : "#374151",
              fontWeight: isCurrent ? 600 : 400,
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "all 0.12s",
            }}
          >
            {t.title}
          </button>
        );
      })}
    </div>
  );
}

function RefreshBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Refresh"
      style={{
        background: "none",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        padding: "4px 10px",
        cursor: "pointer",
        fontSize: 13,
        color: "#6b7280",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#2563eb";
        e.currentTarget.style.color = "#2563eb";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.color = "#6b7280";
      }}
    >
      ↻ Refresh
    </button>
  );
}

function LandingHero({ onSubmit }: { onSubmit: (q: string) => void }) {
  const [input, setInput] = useState("");
  const [examples, setExamples] = useState([
    { label: "Earth", icon: "🌍" },
    { label: "Bitcoin", icon: "₿" },
    { label: "Quantum Computing", icon: "⚛" },
    { label: "Climate Change", icon: "🌡" },
  ]);

  // Fetch popular topics (replace defaults if available)
  useEffect(() => {
    const API = (import.meta as any).env?.VITE_API_BASE || "/api";
    fetch(`${API}/topics/popular?limit=10`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.topics?.length > 0) {
          const seen2 = new Set<string>();
          setExamples(
            data.topics
              .map((t: any) => ({ label: t.title || t.key, icon: "" }))
              .filter((t: any) => { const k = t.label.toLowerCase(); if (seen2.has(k)) return false; seen2.add(k); return true; }),
          );
        }
      })
      .catch(() => {/* keep defaults */});
  }, []);

  return (
    <div
      style={{
        textAlign: "center",
        maxWidth: 680,
        margin: "0 auto",
        padding: "60px 20px 40px",
      }}
    >
      {/* Tagline */}
      <h1
        style={{
          fontSize: 38,
          fontWeight: 800,
          color: "#111827",
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          marginBottom: 12,
        }}
      >
        Truth has a price.
        <br />
        <span style={{ color: "#2563eb" }}>Stake yours.</span>
      </h1>
      <p
        style={{
          fontSize: 17,
          color: "#6b7280",
          lineHeight: 1.6,
          maxWidth: 520,
          margin: "0 auto 32px",
        }}
      >
        Verisphere is a truth-staking protocol. Every factual claim lives
        on-chain. Back what you believe with real VSP tokens — and earn when you're
        right.
      </p>

      {/* Search bar — prominent */}
      <div
        style={{
          display: "flex",
          gap: 10,
          maxWidth: 560,
          margin: "0 auto 24px",
          position: "relative",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) onSubmit(input.trim());
          }}
          placeholder="Enter a topic, claim, or paste a URL…"
          style={{
            flex: 1,
            padding: "14px 18px",
            fontSize: 16,
            borderRadius: 12,
            border: "2px solid #e5e7eb",
            outline: "none",
            transition: "border 0.2s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#2563eb")}
          onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
        />
        <button
          onClick={() => {
            if (input.trim()) onSubmit(input.trim());
          }}
          disabled={!input.trim()}
          style={{
            padding: "14px 28px",
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            background: input.trim() ? "#111827" : "#d1d5db",
            color: "#fff",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          Explore
        </button>
      </div>

      {/* Quick examples */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          flexWrap: "wrap",
          marginBottom: 48,
        }}
      >
        <span style={{ fontSize: 13, color: "#9ca3af", alignSelf: "center" }}>
          Try:
        </span>
        {examples.map((ex) => (
          <button
            key={ex.label}
            onClick={() => onSubmit(ex.label)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "1px solid #e5e7eb",
              background: "#fff",
              fontSize: 13,
              cursor: "pointer",
              color: "#374151",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#2563eb";
              e.currentTarget.style.color = "#2563eb";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.color = "#374151";
            }}
          >
            {ex.icon} {ex.label}
          </button>
        ))}
      </div>

      {/* How it works — 3 steps */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          textAlign: "left",
          marginBottom: 48,
        }}
      >
        {[
          {
            step: "1",
            title: "Explore",
            desc: "Search any topic. Verisphere generates a fact-checked article where every sentence is a stakeable claim.",
            color: "#2563eb",
          },
          {
            step: "2",
            title: "Stake",
            desc: "Back claims you believe are true with VSP tokens. Challenge claims you think are false. Your stake is your conviction.",
            color: "#059669",
          },
          {
            step: "3",
            title: "Earn",
            desc: "When consensus forms, stakers on the right side earn rewards. Truth pays — misinformation costs.",
            color: "#d97706",
          },
        ].map((s) => (
          <div
            key={s.step}
            style={{
              padding: 20,
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: s.color + "15",
                color: s.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 16,
                marginBottom: 10,
              }}
            >
              {s.step}
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: "#111827",
                marginBottom: 4,
              }}
            >
              {s.title}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              {s.desc}
            </div>
          </div>
        ))}
      </div>

      {/* What you can do */}
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          flexWrap: "wrap",
          padding: "20px 0",
          borderTop: "1px solid #f0f0f0",
        }}
      >
        {[
          { icon: "🔍", text: "Search any topic" },
          { icon: "🔗", text: "Paste any URL" },
          { icon: "⚖️", text: "Stake on claims" },
          { icon: "🔀", text: "Link evidence" },
          { icon: "📊", text: "Track your portfolio" },
        ].map((item) => (
          <span
            key={item.text}
            style={{
              fontSize: 12,
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span> {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Main App ── */
export default function App() {
  const { isConnected } = useAccount();
  const { unreadCount, markAllRead } = useNotifications();  /* patch_bundle04_5_p3_tx_nav */
  const navigate = useNavigate();
  const location = useLocation();
  // patch_bundle04_5_p3_tx_pathname
  const view = location.pathname === "/claims" ? "claims"
    : location.pathname === "/portfolio" ? "portfolio"
    : location.pathname === "/transactions" ? "transactions"
    : "explore";
  const setView = (v: string) => {
    if (v === "explore") navigate("/");
    else if (v === "claims") navigate("/claims");
    else if (v === "portfolio") navigate("/portfolio");
    else if (v === "transactions") navigate("/transactions");  /* patch_bundle04_5_p3_tx_setview */
  };


  // patch_bundle04_5_p3_tx_nav — clear unread count when entering /transactions.
  useEffect(() => {
    if (view === "transactions") markAllRead();
  }, [view, markAllRead]);
  const [input, setInput] = useState("");
  const topicParam = location.pathname.startsWith("/topic/")
    ? decodeURIComponent(location.pathname.slice(7))
    : null;
  const [topic, setTopic] = useState<string | null>(null);
  // Sync URL topic to state
  useEffect(() => {
    if (topicParam && topicParam !== topic) {
      setTopic(topicParam);
    }
  }, [topicParam]);


  // Disambiguation
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [selIdx, setSelIdx] = useState(-1);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for navigation events from other components (e.g. Claims Explorer topic links)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.topic) {
        setInput(detail.topic);
        setTopic(detail.topic);
        navigate(`/topic/${encodeURIComponent(detail.topic)}`);
      } else if (detail?.view === "claims" && detail?.postId != null) {
        // Cross-view navigation from Portfolio → Claims
        setView("claims");
        // Stash target postId for Claims view to pick up on mount
        (window as any).__claimsGoto = detail.postId;
      }
    };
    window.addEventListener("verisphere:navigate", handler);
    return () => window.removeEventListener("verisphere:navigate", handler);
  }, []);
  const suggRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const fetchSugg = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const r = await fetch(
        `${API}/disambiguate?q=${encodeURIComponent(q.trim())}`,
      );
      const d = await r.json();
      setSuggestions(d.results || []);
      setSelIdx(-1);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleInput = (v: string) => {
    setInput(v);
    setShowSugg(true);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchSugg(v), 200);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        suggRef.current &&
        !suggRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      )
        setShowSugg(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function submit(override?: string) {
    const q = (override || input).trim();
    if (!q) return;
    setShowSugg(false);
    setInput(q);
    setTopic(q);
    setView("explore");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!showSugg || !suggestions.length) {
      if (e.key === "Enter") submit();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelIdx((p) => Math.min(p + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelIdx((p) => Math.max(p - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selIdx >= 0 && selIdx < suggestions.length) {
        const s = suggestions[selIdx];
        setInput(s.title);
        setShowSugg(false);
        submit(s.title);
      } else submit();
    } else if (e.key === "Escape") setShowSugg(false);
  }

  const navBtn = (label: string, target: View, requireConnect = false, badge?: number) => {  /* patch_bundle04_5_p3_tx_nav */
    if (requireConnect && !isConnected) return null;
    return (
      <button
        onClick={() => setView(target)}
        style={{
          background:
            view === target ? "rgba(255,255,255,0.18)" : "transparent",
          border: "none",
          color: "inherit",
          padding: "5px 12px",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: view === target ? 700 : 400,
          cursor: "pointer",
          opacity: view === target ? 1 : 0.7,
          transition: "all 0.15s",
        }}
      >
        {label}
        {badge != null && badge > 0 ? (
          <span style={{
            marginLeft: 6,
            background: "#e53e3e",
            color: "white",
            borderRadius: 999,
            padding: "0px 6px",
            fontSize: 11,
            fontWeight: 600,
          }}>{badge > 99 ? "99+" : badge}</span>
        ) : null}
      </button>
    );
  };

  const showingArticle = view === "explore" && topic;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Top bar */}
      <header className="top-bar" style={{ flexShrink: 0 }}>
        <div className="top-bar-container">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h2
              className="logo"
              onClick={() => {
                setView("explore");
                setTopic(null);
                setInput("");
              }}
              style={{ cursor: "pointer", margin: 0 }}
            >
              Verisphere
            </h2>
            <nav style={{ display: "flex", gap: 2 }}>
              {navBtn("Explore", "explore")}
              {navBtn("Claims", "claims")}
              {navBtn("Positions", "portfolio", true)}  {/* patch_bundle09_p1a_nav_portfolio_age_time */}
              {isConnected && navBtn("Transactions", "transactions", true, unreadCount)}  {/* patch_bundle04_5_p3_tx_nav */}
            </nav>
          </div>
          {/* patch_bundle04_5_p3_bell_removed — replaced by /transactions nav button */}
          <MarketWidget />
        </div>
      </header>

      {/* Search bar — only when viewing an article (compact mode) */}
      {showingArticle && (
        <div
          style={{
            flexShrink: 0,
            background: "#f8f9fa",
            borderBottom: "1px solid #e5e7eb",
            padding: "8px 0",
          }}
        >
          <div className="container" style={{ padding: "0 16px" }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                maxWidth: 700,
                margin: "0 auto",
                position: "relative",
              }}
            >
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  ref={inputRef}
                  type="text"
                  className="input"
                  placeholder="Search a topic, enter a claim, or paste a URL…"
                  value={input}
                  onChange={(e) => handleInput(e.target.value)}
                  onKeyDown={handleKey}
                  onFocus={() => {
                    if (suggestions.length) setShowSugg(true);
                  }}
                  style={{
                    width: "100%",
                    padding: "9px 14px",
                    fontSize: 14,
                    borderRadius: 10,
                  }}
                />
                {showSugg && suggestions.length > 0 && (
                  <div
                    ref={suggRef}
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "0 0 10px 10px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      zIndex: 100,
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {suggestions.map((s, i) => (
                      <div
                        key={s.key + i}
                        onClick={() => {
                          setInput(s.title);
                          setShowSugg(false);
                          submit(s.title);
                        }}
                        onMouseEnter={() => setSelIdx(i)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 14px",
                          cursor: "pointer",
                          background: i === selIdx ? "#f3f4f6" : "transparent",
                          borderBottom:
                            i < suggestions.length - 1
                              ? "1px solid #f3f4f6"
                              : "none",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "#111827",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.title}
                          </div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>
                            {s.source === "cached"
                              ? "Previously explored"
                              : "On-chain claim"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary"
                disabled={!canSend}
                onClick={() => submit()}
                style={{
                  padding: "9px 20px",
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Go
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main
        className="watermark-bg"
        style={{
          flex: 1,
          overflowY: (showingArticle || view === "portfolio" || view === "claims" || view === "transactions")  /* patch_bundle04_5_p3_tx_layout */ ? "hidden" : "auto",
          padding: "0",
          display: (showingArticle || view === "portfolio" || view === "claims" || view === "transactions") ? "flex" : "block",
          flexDirection: "column" as const,
          minHeight: 0,
        }}
      >
        <div
          className="container"
          style={{
            padding: showingArticle ? 0 : (view === "explore" && !topic ? 0 : "16px"),
            ...((showingArticle || view === "portfolio" || view === "claims" || view === "transactions") ? { flex: 1, display: "flex", flexDirection: "column" as const, minHeight: 0, overflow: "hidden" } : {}),
          }}
        >
          {/* Landing page — when no topic */}
          {view === "explore" && !topic && (
            <LandingHero onSubmit={(q) => submit(q)} />
          )}

          {/* Article view — when topic selected */}
          {view === "explore" && topic && (
            <>
              <TopicPills onSelect={(t) => submit(t)} currentTopic={topic} />
              <ContentPanel topic={topic} />
            </>
          )}

          {/* Claims explorer */}
          {view === "claims" && <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, minHeight: 0, overflow: "hidden" }}><ClaimsExplorer /></div>}
          {view === "transactions" && <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, minHeight: 0, overflow: "hidden" }}><TransactionsView /></div>}  {/* patch_bundle04_5_p3_tx_render */}

          {/* Portfolio */}
          {view === "portfolio" && (<div style={{ flex: 1, display: "flex", flexDirection: "column" as const, minHeight: 0, overflow: "hidden" }}>
            <Portfolio />  {/* patch_bundle09_p1_page_titles_age_sort */}
          </div>)}
        </div>
      </main>

      <TxProgress />

      {/* Footer */}
      <footer className="footer" style={{ flexShrink: 0 }}>
        <a href="/docs/viewer.html?file=whitepaper.md">Whitepaper</a>
        <a href="/docs/viewer.html?file=guide.md">How to Play</a>
        <a href="/docs/viewer.html?file=about.md">About</a>
        <a href="/docs/viewer.html?file=tos.md">Terms of Service</a>
        <span>© {new Date().getFullYear()} Verisphere</span>
      </footer>
    </div>
  );
}
