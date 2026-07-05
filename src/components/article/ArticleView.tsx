// frontend/src/components/article/ArticleView.tsx
import { useState, useMemo, useRef, useEffect } from "react";
import { useAccount } from "wagmi";
import { useCreateClaim, useStake } from "@verisphere/protocol";
import { C, n, fmt, vc, vb, injectCSS } from "./theme";
import type { Sentence, Article } from "./types";
import B from "./MiniButton";
import PlusButton from "./PlusButton";
import StakeInput from "./StakeInput";
import { fireTxProgress } from "./TxProgress";
import InlineClaimCard from "./InlineClaimCard";
import VSBar from "../VSBar";

const API = import.meta.env.VITE_API_BASE || "/api";

export default function ArticleView({
  article,
  onRefresh,
}: {
  article: Article;
  onRefresh: () => void;
}) {
  useEffect(injectCSS, []);
  const { isConnected, address } = useAccount();
  const { createClaim, isDuplicate, error: hookError, loading: txing } = useCreateClaim();
  const { stake, loading: staking } = useStake();
  const [selId, setSelId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editPhase, setEditPhase] = useState<
    "edit" | "cleanup" | "confirm" | "creating" | "staking"
  >("edit");
  const [editSug, setEditSug] = useState<{
    original: string;
    suggested: string;
  } | null>(null);
  const [stakeAmt, setStakeAmt] = useState("1");
  const [confirmChoice, setConfirmChoice] = useState<"suggested" | "original">("suggested");
  const editRef = useRef<HTMLTextAreaElement>(null);

  const allSent = useMemo(() => {
    const r: Sentence[] = [];
    for (const sec of article.sections)
      for (const s of sec.sentences) r.push(s);
    return r;
  }, [article]);

  useEffect(() => {
    if (editId && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editId]);

  const click = (s: Sentence) => {
    if (editId && editId !== s.sentence_id) {
      setEditId(null);
      setEditPhase("edit");
    }
    if (selId === s.sentence_id) {
      if (editId === s.sentence_id) {
        /* already editing */
      } else if (isConnected) {
        // PD-04: Block editing on-chain claims
        if (s.post_id) {
          window.dispatchEvent(new CustomEvent("verisphere:toast", {
            detail: { message: "On-chain claims cannot be edited. Stake on it or create a counter-claim.", type: "info" }
          }));
        } else {
          setEditId(s.sentence_id);
          setEditText(s.text);
          setEditPhase("edit");
          setEditSug(null);
          setStakeAmt("1");
        }
      } else {
        setSelId(null);
      }
    } else {
      setSelId(s.sentence_id);
      setEditId(null);
      setEditPhase("edit");
    }
  };
  const collapse = () => {
    setSelId(null);
    setEditId(null);
    setEditPhase("edit");
    setEditSug(null);
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditPhase("edit");
    setEditSug(null);
  };

  // ── Edit flow: cleanup → confirm → create on-chain → stake ──
  // Editing an off-chain sentence = creating a new claim. The original
  // sentence is NOT modified, replaced, or moved. No replaced_by, no
  // challenge links.
  const submitEdit = async () => {
    const old = allSent.find((s) => s.sentence_id === editId);
    if (!old || editText.trim() === old.text) {
      cancelEdit();
      return;
    }
    setEditPhase("cleanup");
    try {
      const d = await fetch(`${API}/article/sentence/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editText.trim(), topic: article.title }),
      }).then((r) => r.json());
      if (
        d.suggested &&
        d.suggested.toLowerCase() !== d.original.toLowerCase()
      ) {
        setEditSug(d);
      } else {
        setEditSug({ original: editText.trim(), suggested: editText.trim() });
      }
      setEditPhase("confirm");
    } catch {
      setEditSug({ original: editText.trim(), suggested: editText.trim() });
      setEditPhase("confirm");
    }
  };

  // Commit: create claim on-chain, stake it, insert into article.
  const doCommit = async (final: string) => {
    const sid = editId ?? selId;
    if (!sid) return;

    const stakeVal = parseFloat(stakeAmt);
    const steps = [
      { label: "Create claim on-chain", status: "pending" as const },
      ...(stakeVal !== 0 ? [{ label: `Stake ${Math.abs(stakeVal)} VSP ${stakeVal > 0 ? "support" : "challenge"}`, status: "pending" as const }] : []),
      { label: "Insert into article", status: "pending" as const },
    ];
    fireTxProgress({ action: "start", title: "Creating Claim", steps });
    fireTxProgress({ action: "step", stepIndex: 0 });

    setEditPhase("creating");

    // 1. Create claim on-chain
    // createClaim returns null when blocked (duplicate, near-dup, error).
    // Do NOT check React state here — it won't be updated until next render.
    let result;
    try {
      result = await createClaim(final);
    } catch (e: any) {
      console.error("createClaim error:", e);
      fireTxProgress({ action: "error", error: "Claim creation failed: " + (e.message || e) });
      setEditPhase("edit");
      return;
    }

    // null = blocked by duplicate check, balance check, or relay error.
    // The hook already dispatched a toast with the specific reason.
    if (result == null) {
      // Show the specific error from the hook (balance, relay, etc.)
      // rather than assuming it's a duplicate issue
      fireTxProgress({ action: "error", error: hookError || "Claim was not created" });
      setEditPhase("edit");
      return;
    }

    const postId = result.post_id;
    if (postId == null || postId < 0) {
      fireTxProgress({ action: "error", error: "Claim creation failed — no post ID returned" });
      setEditPhase("edit");
      return;
    }

    // 2. Stake
    const amt = parseFloat(stakeAmt);
    if (amt !== 0) {
      setEditPhase("staking");
      fireTxProgress({ action: "step", stepIndex: 1 });
      try {
        const side = amt > 0 ? "support" : "challenge";
        await stake(postId, side, Math.abs(amt));
      } catch (e: any) {
        console.warn("Initial stake failed (claim created):", e);
      }
    }

    // 3. Insert into article as a new sentence
    const insertStepIdx = parseFloat(stakeAmt) !== 0 ? 2 : 1;
    fireTxProgress({ action: "step", stepIndex: insertStepIdx });
    try {
      let sectionId: number | null = null;
      for (const sec of article.sections) {
        if (sec.sentences.some((s) => s.sentence_id === sid)) {
          sectionId = sec.section_id;
          break;
        }
      }
      if (sectionId != null) {
        const ins = await fetch(`${API}/article/sentence/insert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section_id: sectionId,
            after_sentence_id: sid,
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
      }
    } catch (e: any) {
      console.warn("Article insert failed (claim is on-chain):", e);
    }

    fireTxProgress({ action: "done" });

    // Record supersede if editing an existing on-chain claim
    const editedSent = allSent.find((s) => s.sentence_id === sid);
    if (editedSent?.post_id && postId && editedSent.post_id !== postId) {
      try {
        const addr = address || "";
        await fetch(`${API}/supersede`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            old_post_id: editedSent.post_id,
            new_post_id: postId,
            created_by: addr,
          }),
        });
      } catch (e) {
        console.debug("Supersede record failed (non-fatal):", e);
      }
    }

    window.dispatchEvent(new Event("verisphere:data-changed"));
    setEditId(null);
    setEditPhase("edit");
    setEditSug(null);
    setConfirmChoice("suggested");
    setStakeAmt("1");
    onRefresh();
  };

  /* ── section builder ── */
  function buildSection(
    sec: {
      section_id: number;
      heading: string;
      sentences: Sentence[];
    },
    globalSeenPid?: Set<number>,
    globalSeenText?: Set<string>,
  ) {
    const narrative: Sentence[] = [];
    const disputed: Sentence[] = [];
    const seenPid = globalSeenPid || new Set<number>();
    const seenText = globalSeenText || new Set<string>();

    // GROUP-FIRST rollup: collapse dupe groups to their canonical BEFORE
    // assigning lanes, so a group is placed as one unit by its AGGREGATE
    // stake/VS (not scattered across lanes by per-member status).
    const groupSeen = new Set<any>();
    const collapsed: Sentence[] = [];
    for (const s of sec.sentences) {
      const gid = (s as any).dupe_group_id;
      const count = (s as any).dupe_count || 1;
      if (gid && count > 1) {
        // Only the canonical represents the group; skip non-canonicals.
        const canon = (s as any).dupe_canonical_post_id;
        if (canon != null && s.post_id != null && s.post_id !== canon) continue;
        if (groupSeen.has(gid)) continue;
        groupSeen.add(gid);
        // Represent the group with the canonical sentence but AGGREGATE metrics.
        const rep: any = { ...s };
        rep.stake_support = (s as any).dupe_agg_support ?? s.stake_support;
        rep.stake_challenge = (s as any).dupe_agg_challenge ?? s.stake_challenge;
        rep.verity_score = (s as any).dupe_agg_vs ?? s.verity_score;
        collapsed.push(rep as Sentence);
      } else {
        collapsed.push(s);
      }
    }

    for (const s of collapsed) {
      const key = s.text.toLowerCase().trim();
      const isDup =
        (s.post_id != null && seenPid.has(s.post_id)) || seenText.has(key);
      if (s.post_id != null) seenPid.add(s.post_id);
      seenText.add(key);
      if (isDup) continue;

      // On-chain claims (or collapsed groups) with no stakes at all → hide.
      // For a rolled-up group these are the AGGREGATE metrics, so a whole
      // group that is unstaked+VS0 hides, exactly like a lone unstaked claim.
      if (s.post_id != null) {
        const totalStake = n(s.stake_support) + n(s.stake_challenge);
        if (totalStake < 0.001 && n(s.verity_score) === 0) continue;  // Unstaked, no VS — disappear
        if (n(s.verity_score) <= 0) {
          disputed.push(s);  // Aggregate losing → disputed (rollup applies here too)
          continue;
        }
      }
      narrative.push(s);
    }

    // Deduplicate overlapping text (prefer on-chain version)
    const toRemove = new Set<number>();
    for (let i = 0; i < narrative.length; i++) {
      for (let j = i + 1; j < narrative.length; j++) {
        const at = narrative[i].text.toLowerCase().trim();
        const bt = narrative[j].text.toLowerCase().trim();
        if (at.includes(bt) || bt.includes(at)) {
          if (narrative[i].post_id != null && narrative[j].post_id == null)
            toRemove.add(j);
          else if (narrative[j].post_id != null && narrative[i].post_id == null)
            toRemove.add(i);
          else if (at.length >= bt.length) toRemove.add(j);
          else toRemove.add(i);
        }
      }
    }
    const cleanNarrative = narrative.filter((_, i) => !toRemove.has(i));

    // (Dupe-group rollup already applied group-first, before lane
    // assignment, so both narrative and disputed lanes are rolled up.)

    const narPids = new Set(
      cleanNarrative.filter((s) => s.post_id != null).map((s) => s.post_id!),
    );
    const narTexts = new Set(
      cleanNarrative.map((s) => s.text.toLowerCase().trim()),
    );
    const finalDisputed = disputed.filter(
      (s) =>
        (s.post_id == null || !narPids.has(s.post_id)) &&
        !narTexts.has(s.text.toLowerCase().trim()),
    );

    finalDisputed.sort((a, b) => {
      const aTotal = n(a.stake_support) + n(a.stake_challenge);
      const bTotal = n(b.stake_support) + n(b.stake_challenge);
      const aContr =
        aTotal > 0
          ? Math.min(n(a.stake_support), n(a.stake_challenge)) /
            Math.max(n(a.stake_support), n(a.stake_challenge), 0.001)
          : 0;
      const bContr =
        bTotal > 0
          ? Math.min(n(b.stake_support), n(b.stake_challenge)) /
            Math.max(n(b.stake_support), n(b.stake_challenge), 0.001)
          : 0;
      if (bContr !== aContr) return bContr - aContr;
      return bTotal - aTotal;
    });
    return { cleanNarrative, finalDisputed };
  }

  const busy =
    editPhase === "cleanup" ||
    editPhase === "creating" ||
    editPhase === "staking";
  const statusText =
    editPhase === "cleanup"
      ? "Checking…"
      : editPhase === "creating"
        ? "Creating claim…"
        : editPhase === "staking"
          ? "Staking…"
          : null;

  /* ════════════════════ render ════════════════════ */
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Fixed header */}
      <div
        style={{
          flexShrink: 0,
          zIndex: 10,
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(6px)",
          borderBottom: `1px solid ${C.gb}`,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: C.text }}>
          {article.title}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={async () => {
              if (refreshing) return;
              setRefreshing(true);
              try {
                await fetch(`${API}/article/${encodeURIComponent(article.topic_key || article.title)}/refresh`, { method: "POST" });
                onRefresh();
              } catch {}
              finally {
                setRefreshing(false);
              }
            }}
            disabled={refreshing}
            title={refreshing ? "Refreshing... this may take 30-60 seconds" : "Refresh: regenerate article"}
            style={{
              background: refreshing ? "#f3f4f6" : "none",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "5px 12px",
              cursor: refreshing ? "wait" : "pointer",
              fontSize: 12,
              color: refreshing ? "#9ca3af" : "#6b7280",
              opacity: refreshing ? 0.7 : 1,
              transition: "all 0.2s",
            }}
          >
            {refreshing ? (
              <><span style={{ display: "inline-block", animation: "vs-spin 1s linear infinite" }}>↻</span>{" Refreshing…"}</>
            ) : "↻ Refresh"}
          </button>
          {isConnected && article.sections.length > 0 && (
            <PlusButton
              sectionId={article.sections[0].section_id}
              afterId={null}
              topic={article.title}
              onDone={onRefresh}
            />
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 40px" }}>
        {(() => {
          const globalSeenPid = new Set<number>();
          const globalSeenText = new Set<string>();
          return article.sections.map((sec) => {
          const { cleanNarrative, finalDisputed } = buildSection(sec, globalSeenPid, globalSeenText);
          return (
            <div key={sec.section_id} style={{ marginBottom: 20 }}>
              {sec.heading && (
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: C.text,
                    margin: "0 0 4px",
                  }}
                >
                  {sec.heading}
                </h3>
              )}
              <div style={{ fontSize: 14, lineHeight: 1.75, color: "#374151" }}>
                {cleanNarrative.map((s, i) => {
                  const vs = n(s.verity_score);
                  const onC = s.post_id != null;
                  const isSel = selId === s.sentence_id;
                  const isEd = editId === s.sentence_id;
                  return (
                    <span key={s.sentence_id} className="av-zone">
                      {isEd ? (
                        <span>
                          <textarea
                            ref={editRef}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submitEdit();
                              }
                              if (e.key === "Escape") cancelEdit();
                            }}
                            rows={2}
                            style={{
                              width: "100%",
                              padding: "3px 5px",
                              fontSize: 14,
                              lineHeight: 1.5,
                              border: `1px solid ${C.blue}`,
                              borderRadius: 4,
                              resize: "vertical",
                              fontFamily: "inherit",
                              boxSizing: "border-box",
                              background: C.bbg,
                            }}
                          />
                          <div
                            style={{
                              fontSize: 10,
                              color: C.muted,
                              marginBottom: 4,
                            }}
                          >
                            Enter to check &amp; create · Esc to cancel
                          </div>
                        </span>
                      ) : (
                        <span
                          className="av-s"
                          onClick={() => click(s)}
                          style={{
                            background: isSel
                              ? C.bbg
                              : onC
                                ? vb(vs)
                                : "transparent",
                            borderBottom: isSel
                              ? `1.5px solid ${C.blue}`
                              : "none",
                            fontWeight: onC ? 600 : 400,
                          }}
                        >
                          {s.text}
                          {onC && (
                            <span style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: 3, gap: 3 }}>
                              <VSBar vs={vs} width={40} height={12} />
                              {(s as any).dupe_count > 1 && (
                                <span style={{
                                  fontSize: 9, padding: "0 4px", borderRadius: 6,
                                  background: "#fef3c7", color: "#92400e", fontWeight: 700,
                                  lineHeight: "14px", cursor: "pointer",
                                }} title={`${(s as any).dupe_count} similar claims grouped — click to view in Claims`}
                                   onClick={(ev) => {
                                     // dupe badge -> Claims view (sanctioned cross-view nav; reveals rolled-up member)
                                     ev.stopPropagation();
                                     const target = (s as any).dupe_canonical_post_id ?? s.post_id;
                                     if (target != null) window.dispatchEvent(new CustomEvent("verisphere:navigate", { detail: { view: "claims", postId: target } }));
                                   }}>
                                  {(s as any).dupe_count}×
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                      )}{" "}
                      {i < cleanNarrative.length - 1 && " "}
                      {/* Inline claim card on select */}
                      {isSel && !isEd && (
                        <InlineClaimCard
                          postId={s.post_id}
                          text={s.text}
                          stakeSupport={s.stake_support}
                          stakeChallenge={s.stake_challenge}
                          verityScore={s.verity_score}
                          sentenceId={s.sentence_id}
                          allSentences={allSent}
                          onRefresh={onRefresh}
                          onClose={collapse}
                          dupeGroupId={(s as any).dupe_group_id}
                          dupeCount={(s as any).dupe_count}
                        />
                      )}
                      {/* Confirm panel after cleanup */}
                      {editPhase === "confirm" &&
                        editSug &&
                        (editId === s.sentence_id ||
                          selId === s.sentence_id) && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "block",
                              margin: "4px 0 8px",
                              padding: "8px 10px",
                              background: C.bbg,
                              borderRadius: 6,
                              border: `1px solid ${C.blue}`,
                            }}
                          >
                            {editSug.original !== editSug.suggested ? (
                              <>
                                <div
                                  onClick={() => setConfirmChoice("suggested")}
                                  style={{
                                    fontSize: 12,
                                    marginBottom: 4,
                                    padding: "4px 6px",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    background: confirmChoice === "suggested" ? "rgba(37,99,235,0.06)" : "transparent",
                                    border: confirmChoice === "suggested" ? `1px solid ${C.blue}` : "1px solid transparent",
                                  }}
                                >
                                  <span style={{ fontWeight: confirmChoice === "suggested" ? 700 : 400, color: confirmChoice === "suggested" ? C.text : C.muted }}>
                                    {confirmChoice === "suggested" ? "✓ Selected: " : ""}Suggested:
                                  </span>{" "}
                                  <span style={{ color: confirmChoice === "suggested" ? C.text : C.muted }}>
                                    {editSug.suggested}
                                  </span>
                                </div>
                                <div
                                  onClick={() => setConfirmChoice("original")}
                                  style={{
                                    fontSize: 12,
                                    marginBottom: 5,
                                    padding: "4px 6px",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    background: confirmChoice === "original" ? "rgba(37,99,235,0.06)" : "transparent",
                                    border: confirmChoice === "original" ? `1px solid ${C.blue}` : "1px solid transparent",
                                  }}
                                >
                                  <span style={{ fontWeight: confirmChoice === "original" ? 700 : 400, color: confirmChoice === "original" ? C.text : C.muted }}>
                                    {confirmChoice === "original" ? "✓ Selected: " : ""}Your version:
                                  </span>{" "}
                                  <span style={{ color: confirmChoice === "original" ? C.text : C.muted }}>
                                    {editSug.original}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: 12, marginBottom: 5 }}>
                                <b>Create claim:</b> {editSug.suggested}
                              </div>
                            )}
                            <div
                              style={{
                                display: "flex",
                                gap: 5,
                                alignItems: "center",
                                marginBottom: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: 11, color: C.gray }}>
                                Initial stake:
                              </span>
                              <StakeInput
                                value={stakeAmt}
                                onChange={setStakeAmt}
                                onSubmit={() => doCommit(confirmChoice === "original" ? editSug!.original : editSug!.suggested)}
                              />
                              <span style={{ fontSize: 10, color: C.muted }}>
                                VSP (1 fee + stake)
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <B
                                onClick={() => doCommit(confirmChoice === "original" ? editSug!.original : editSug!.suggested)}
                                dis={busy}
                              >
                                {statusText || "Create & stake"}
                              </B>
                              <B
                                onClick={() => {
                                  setEditSug(null);
                                  setEditPhase("edit");
                                  setConfirmChoice("suggested");
                                }}
                                ghost
                              >
                                Cancel
                              </B>
                            </div>
                          </div>
                        )}
                    </span>
                  );
                })}
              </div>



              {/* Disputed claims (on-chain with VS < 0 only) */}
              {finalDisputed.length > 0 &&
                (() => {
                  const hasOpenCard = finalDisputed.some(
                    (s) => selId === s.sentence_id,
                  );
                  return (
                    <div
                      style={{
                        marginTop: 4,
                        maxHeight: hasOpenCard ? "none" : 100,
                        overflowY: hasOpenCard ? "visible" : "auto",
                        padding: "4px 8px",
                        background: "rgba(220,50,50,0.03)",
                        borderRadius: 5,
                        borderLeft: "2px solid rgba(220,50,50,0.25)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: C.red,
                          marginBottom: 2,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                        }}
                      >
                        Disputed
                      </div>
                      {finalDisputed.map((s) => {
                        const vs = n(s.verity_score);
                        const isSel = selId === s.sentence_id;
                        return (
                          <div key={s.sentence_id}>
                            <span
                              onClick={() => {
                                setSelId(
                                  selId === s.sentence_id
                                    ? null
                                    : s.sentence_id,
                                );
                                setEditId(null);
                              }}
                              style={{
                                fontSize: 13,
                                lineHeight: 1.5,
                                color: "rgba(220,50,50,0.7)",
                                cursor: "pointer",
                                background: isSel
                                  ? "rgba(220,50,50,0.08)"
                                  : "transparent",
                                borderRadius: 3,
                                padding: "0 2px",
                              }}
                            >
                              {s.text}
                              {s.post_id != null && (
                                <span style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: 3, gap: 3 }}>
                                  <VSBar vs={vs} width={40} height={12} />
                                  {(s as any).dupe_count > 1 && (
                                    <span style={{
                                      fontSize: 9, padding: "0 4px", borderRadius: 6,
                                      background: "#fef3c7", color: "#92400e", fontWeight: 700,
                                      lineHeight: "14px", cursor: "pointer",
                                    }} title={`${(s as any).dupe_count} similar claims grouped — click to view in Claims`}
                                       onClick={(ev) => {
                                         // patch_dupe_badge_disputed: same cross-view nav as the narrative lane
                                         ev.stopPropagation();
                                         const target = (s as any).dupe_canonical_post_id ?? s.post_id;
                                         if (target != null) window.dispatchEvent(new CustomEvent("verisphere:navigate", { detail: { view: "claims", postId: target } }));
                                       }}>
                                      {(s as any).dupe_count}×
                                    </span>
                                  )}
                                </span>
                              )}
                            </span>
                            {isSel && (
                              <InlineClaimCard
                                postId={s.post_id}
                                text={s.text}
                                stakeSupport={s.stake_support}
                                stakeChallenge={s.stake_challenge}
                                verityScore={s.verity_score}
                                sentenceId={s.sentence_id}
                                allSentences={allSent}
                                onRefresh={onRefresh}
                                onClose={collapse}
                                dupeGroupId={(s as any).dupe_group_id}
                                dupeCount={(s as any).dupe_count}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
            </div>
          );
        })})()}
      </div>
    </div>
  );
}
