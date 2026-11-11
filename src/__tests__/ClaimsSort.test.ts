// patch_fe_sort_number: the Claims view sorts by claim number, and In / Out sort by their own counts.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(__dirname, "../components/ClaimsExplorer.tsx"), "utf8");

describe("Claims view sorting", () => {
  it("every header toggles its sort, the # column included", () => {
    expect(src).toContain("onClick={() => toggleSort(col.key)}");
    expect(src).not.toContain("ci !== 0 ? toggleSort");
    expect(src).not.toContain("sortKey === col.key && ci !== 0");
    expect(src).toContain('{ key: "post_id", label: "#" }');
  });
  it("In and Out sort by link counts, so only # carries the post_id key", () => {
    expect(src).toContain('{ key: "incoming_links", label: "In", align: "right" }');
    expect(src).toContain('{ key: "outgoing_links", label: "Out", align: "right" }');
    expect(src.match(/key: "post_id"/g)!.length).toBe(1);
  });
});
