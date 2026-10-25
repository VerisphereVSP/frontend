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
    expect(src).toContain("displayedPoolTotal.toFixed(1)");
    expect(src).toContain("p.pool_support.toFixed(1)");
  });
});
