// frontend/src/components/article/standalone.ts — patch_fe_claim_resolve
// A claim must stand alone (no pronoun or bare "the market" pointing at the page it came from). The app's cleanup
// endpoint resolves what it can from the topic and reports what it could not; these helpers read that reply so both
// confirm screens (the + Add claim box and the article edit) behave the same way.
export interface CleanupReply {
  original: string;
  suggested: string;
  needs_context?: boolean;
  reason?: string;
  changes?: { from: string; to: string }[];
  dangling?: string[];
}

/** The note shown under the suggestion: what was resolved, or what is still missing. */
export function standaloneNote(d: CleanupReply): { kind: "resolved" | "needs" | null; text: string } {
  if (d.needs_context) {
    const what = (d.dangling ?? []).join(", ");
    return { kind: "needs", text: what ? `Say what "${what}" refers to — a claim has to stand on its own, away from this page.` : (d.reason || "A claim has to stand on its own — name what it refers to.") };
  }
  const ch = (d.changes ?? []).filter((c) => c.from && c.to && c.from !== c.to);
  if (ch.length) return { kind: "resolved", text: "Made to stand alone: " + ch.map((c) => `${c.from} → ${c.to}`).join(" · ") };
  return { kind: null, text: "" };
}

/** Whether the chosen text may be created: the user's own wording is allowed only when it does not depend on the page. */
export function mayCreate(d: CleanupReply, choice: "suggested" | "original"): boolean {
  if (choice === "suggested") return !d.needs_context;
  // the original is what the user typed; if the server flagged the suggestion, the original has the same gap
  return !d.needs_context;
}
