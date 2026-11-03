// patch_fe_claim_resolve: a claim must stand alone — the confirm screens read the cleanup reply's needs_context.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { standaloneNote, mayCreate } from "../components/article/standalone";

describe("standalone", () => {
  it("names what is missing, or what was resolved", () => {
    expect(standaloneNote({ original: "x", suggested: "x", needs_context: true, dangling: ["It", "the market"] })).toEqual({ kind: "needs", text: 'Say what "It, the market" refers to — a claim has to stand on its own, away from this page.' });
    expect(standaloneNote({ original: "x", suggested: "y", changes: [{ from: "Early cases", to: "Early COVID-19 cases" }] })).toEqual({ kind: "resolved", text: "Made to stand alone: Early cases → Early COVID-19 cases" });
    expect(standaloneNote({ original: "x", suggested: "x" })).toEqual({ kind: null, text: "" });
  });
  it("blocks creation while context is missing, for either wording", () => {
    const flagged = { original: "They won.", suggested: "They won.", needs_context: true };
    expect(mayCreate(flagged, "suggested")).toBe(false);
    expect(mayCreate(flagged, "original")).toBe(false);
    expect(mayCreate({ original: "a", suggested: "b" }, "original")).toBe(true);
  });
  it("both confirm screens use it, and the edit path sends the paragraph", () => {
    const plus = readFileSync(resolve(process.cwd(), "src/components/article/PlusButton.tsx"), "utf8");
    expect(plus).toContain("dis={busy || !mayCreate(sug, confirmChoice)}");
    expect(plus).toContain('data-testid="standalone-note"');
    const av = readFileSync(resolve(process.cwd(), "src/components/article/ArticleView.tsx"), "utf8");
    expect(av).toContain("dis={busy || !mayCreate(editSug, confirmChoice)}");
    expect(av).toContain("topic: article.title, paragraph:");
  });
});
