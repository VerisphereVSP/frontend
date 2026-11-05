// @vitest-environment node
// patch_fe_positions_decimals — the positions page shows staked amounts with 4 decimals.
// A small stake moves in the 4th decimal per daily settlement (e.g. 2 VSP solo at the current rates ≈ +0.0008/day);
// two decimals showed a static number for weeks. The pool columns stay at 1 decimal. Source check, as the
// component needs a connected wallet to render. Node environment: a jsdom URL is not accepted by node:fs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(process.cwd(), "src/components/Portfolio.tsx"), "utf8");

describe("Portfolio amounts", () => {
  it("TOTAL STAKED and the per-position amount use 4 decimals", () => {
    expect(src).toContain("summary.total_staked.toFixed(4)");
    expect(src).toContain("p.user_total.toFixed(4)");
    expect(src).not.toContain("summary.total_staked.toFixed(2)");
    expect(src).not.toContain("p.user_total.toFixed(2)");
  });
  it("pool columns keep 1 decimal", () => {
    expect(src).toContain("displayedPoolTotal.toFixed(1)");  // the "Size: x / sMax" line of the expanded row
    expect(src).toContain("p.pool_support.toFixed(1)");
  });
  // patch_fe_stake_total: the STAKE cell is the claim's real stake, not the size capped at sMax (11 VSP showed as 10.0)
  it("the STAKE cell shows the real pool total; the sMax-capped size stays in the expanded row only", () => {
    expect(src).toContain('data-testid="position-stake">\n                    {p.pool_total.toFixed(1)}');
    expect(src).toContain("total_stake: p.pool_total,");
    expect(src).not.toContain("total_stake: displayedPoolTotal,");
    expect(src).toContain("Size: {displayedPoolTotal.toFixed(1)} / {(p.apr_breakdown?.s_max || 0).toFixed(1)}");
  });
});
