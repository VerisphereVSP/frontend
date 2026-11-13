// patch_fe_evidence_marker: the Claims table marks a score that linked evidence has moved, and says the
// Stake / Support / Challenge columns are direct stake.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { directScore, evidenceNote } from "../components/claims-shared";

describe("directScore", () => {
  it("is (support - challenge) / total as a percentage, and null with no stake", () => {
    expect(directScore(2, 0)).toBe(100);
    expect(directScore(1, 3)).toBe(-50);
    expect(directScore(2, 2)).toBe(0);
    expect(directScore(0, 0)).toBeNull();
  });
});

describe("evidenceNote", () => {
  const base = { stake_support: 2, stake_challenge: 0, verity_score: 100, incoming_links: 0 };
  it("is null when the score is what direct stake alone gives", () => {
    expect(evidenceNote(base)).toBeNull();
    expect(evidenceNote({ ...base, incoming_links: 2 })).toBeNull();
  });
  it("gives both figures when incoming evidence has moved the score", () => {
    expect(evidenceNote({ ...base, verity_score: 33.33, incoming_links: 2 }))
      .toBe("Direct stake alone: +100.0% · with linked evidence: +33.3%");
    expect(evidenceNote({ stake_support: 1, stake_challenge: 1, verity_score: -20, incoming_links: 1 }))
      .toBe("Direct stake alone: +0.0% · with linked evidence: -20.0%");
  });
  it("stays null without incoming links (an inactive post reads 0 for another reason) and without stake", () => {
    expect(evidenceNote({ stake_support: 0.9, stake_challenge: 0, verity_score: 0, incoming_links: 0 })).toBeNull();
    expect(evidenceNote({ stake_support: 0, stake_challenge: 0, verity_score: 40, incoming_links: 3 })).toBeNull();
  });
});

describe("Claims table wiring", () => {
  const src = readFileSync(resolve(__dirname, "../components/ClaimsExplorer.tsx"), "utf8");
  it("renders the marker beside the score and hints the three direct-stake headers", () => {
    expect(src).toContain('data-testid="vs-evidence"');
    expect(src).toContain("title={evidenceNote(c)!}");
    expect(src.match(/title: DIRECT_HINT/g)!.length).toBe(3);
    expect(src).toContain("Direct stake on this post. Evidence arriving through links is not included here; it is counted in the score.");
  });
});
